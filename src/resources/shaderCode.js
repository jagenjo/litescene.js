/**
* ShaderCode is a resource containing all the code associated to a shader
* It is used to define special ways to render scene objects, having full control of the rendering algorithm
* Having a special class helps to parse the data in advance and share it between different materials
* 
* @class ShaderCode
* @constructor
*/

function ShaderCode( code )
{
	this._code = null;

	this._functions = {};
	this._global_uniforms = {};
	this._code_parts = {};
	this._subfiles = {};
	this._compiled_shaders = {}; //all shaders compiled using this ShaderCode

	this._shaderblock_flags_num = 0; //used to assign flags to dependencies
	this._shaderblock_flags = {}; //used to store which shaderblock represent to every flag bit

	this._version = 0;

	if(code)
		this.code = code;
}

ShaderCode.help_url = "https://github.com/jagenjo/litescene.js/blob/master/guides/shaders.md";

//block types
ShaderCode.CODE = 1;
ShaderCode.PRAGMA = 2;

//pargma types
ShaderCode.INCLUDE = 1;
ShaderCode.SHADERBLOCK = 2;
ShaderCode.SNIPPET = 3;

ShaderCode.EXTENSION = "glsl";

Object.defineProperty( ShaderCode.prototype, "code", {
	enumerable: true,
	get: function() {
		return this._code;
	},
	set: function(v) {
		if(this._code == v)
			return;
		this._code = v;
		this.processCode();
	}
});

Object.defineProperty( ShaderCode.prototype, "version", {
	enumerable: false,
	get: function() {
		return this._version;
	},
	set: function(v) {
		console.error("version cannot be set manually");
	}
});


//parse the code
//store in a easy to use way
ShaderCode.prototype.processCode = function()
{
	var code = this._code;
	this._global_uniforms = {};
	this._code_parts = {};
	this._compiled_shaders = {};
	this._functions = {};
	this._shaderblock_flags_num = 0;
	this._shaderblock_flags = {};
	this._shaderblock_vars = null;
	this._has_error = false;

	var subfiles = GL.processFileAtlas( this._code );
	this._subfiles = subfiles;

	var num_subfiles = 0;
	var init_code = null; 

	//add default codes
	if(!subfiles["default.vs"])
		subfiles["default.vs"] = ShaderCode.default_vs;
	if(!subfiles["default.fs"])
		subfiles["default.fs"] = ShaderCode.default_fs;

	for(var i in subfiles)
	{
		var subfile_name = i;
		var subfile_data = subfiles[i];
		num_subfiles++;

		if(!subfile_name)
			continue;

		if(subfile_name == "js")
		{
			init_code = subfile_data;
			continue;
		}

		//used to declare uniforms without using javascript
		if(subfile_name == "uniforms")
		{
			var lines = subfile_data.split("/n");
			for(var j = 0; j < lines.length; ++j)
			{
				var line = lines[j].trim();
				var words = line.split(" ");
				var varname = words[0];
				var uniform_name = words[1];
				var property_type = words[2];
				var value = words[3];
				if( value !== undefined )
					value = LS.stringToValue(value);
				var options = null;
				var options_index = line.indexOf("{");
				if(options_index != -1)
					options = LS.stringToValue( line.substr(options_index) );
				this._global_uniforms[ varname ] = { name: varname, uniform: uniform_name, type: property_type, value: value, options: options };
			}
			continue;
		}

		var name = LS.ResourcesManager.removeExtension( subfile_name );
		var extension = LS.ResourcesManager.getExtension( subfile_name );

		if(extension == "vs" || extension == "fs")
		{
			var code_part = this._code_parts[name];
			if(!code_part)
				code_part = this._code_parts[name] = {};

			//parse data (extract pragmas and stuff)
			var glslcode = new GLSLCode( subfile_data );
			for(var j in glslcode.blocks)
			{
				var pragma_info = glslcode.blocks[j];
				if(!pragma_info || pragma_info.type != ShaderCode.PRAGMA)
					continue;
				//assign a flag position in case this block is enabled
				pragma_info.shader_block_flag = this._shaderblock_flags_num; 
				this._shaderblock_flags[ pragma_info.shader_block ] = pragma_info.shader_block_flag;
				this._shaderblock_flags_num += 1;
			}

			code_part[ extension ] = glslcode;
		}
	}

	//compile the shader before using it to ensure there is no errors
	var shader = this.getShader();
	if(!shader)
		return;

	//process init code
	if(init_code)
	{
		//clean code
		init_code = LS.ShaderCode.removeComments( init_code );

		if(init_code) //still some code? (we test it because if there is a single line of code the behaviour changes)
		{
			if(LS.catch_exceptions)
			{
				try
				{
					this._functions.init = new Function( init_code );
				}
				catch (err)
				{
					LS.dispatchCodeError( err, LScript.computeLineFromError(err), this );
				}
			}
			else
				this._functions.init = new Function( init_code );
		}
	}

	//check that all uniforms are correct
	this.validatePublicUniforms( shader );


	//to alert all the materials out there using this shader that they must update themselves.
	LEvent.trigger( LS.ShaderCode, "modified", this );
	this._version += 1;
}

//used when storing/retrieving the resource
ShaderCode.prototype.setData = function(v, skip_modified_flag)
{
	this.code = v;
	if(!skip_modified_flag)
		this._modified = true;
}

ShaderCode.prototype.getData = function()
{
	return this._code;
}

ShaderCode.prototype.fromData = ShaderCode.prototype.setData;
ShaderCode.prototype.toData = ShaderCode.prototype.getData;

ShaderCode.prototype.getDataToStore = function()
{
	return this._code;
}

//compile the shader, cache and return
ShaderCode.prototype.getShader = function( render_mode, block_flags )
{
	if( this._has_error )
		return null;

	render_mode = render_mode || "color";
	block_flags = block_flags || 0;

	//search for a compiled version of the shader (by render_mode and block_flags)
	var shaders_map = this._compiled_shaders[ render_mode ];
	if(shaders_map)
	{
		var shader = shaders_map.get( block_flags );
		if(shader)
			return shader;
	}

	//search for the code 'color', or 'shadow'
	var code = this._code_parts[ render_mode ];
	var default_code = this._code_parts.default;
	if(!code && !default_code)
		return null;

	var context = {}; //used to store metaprogramming defined vars in the shader

	//compute context defines
	for(var i = 0, l = LS.Shaders.shader_blocks.length; i < l; ++i)
	{
		if( !(block_flags & 1<<i) ) //is flag enabled
			continue;
		var shader_block = LS.Shaders.shader_blocks[i];
		if(!shader_block)
			continue; //???
		if(shader_block.context_macros)
		{
			for(var j in shader_block.context_macros)
				context[ j ] = shader_block.context_macros[j];
		}
	}

	//vertex shader code
	var vs_code = null;
	if(render_mode == "fx")
		vs_code = GL.Shader.SCREEN_VERTEX_SHADER;
	else if( code && code.vs )
		vs_code = code.vs.getFinalCode( GL.VERTEX_SHADER, block_flags, context );
	else if( default_code && default_code.vs )
		vs_code = default_code.vs.getFinalCode( GL.VERTEX_SHADER, block_flags, context );
	else 
		return null;

	//fragment shader code
	var fs_code = null;
	if( code && code.fs )
		fs_code = code.fs.getFinalCode( GL.FRAGMENT_SHADER, block_flags, context );
	else if( default_code && default_code.fs )
		fs_code = default_code.fs.getFinalCode( GL.FRAGMENT_SHADER, block_flags, context );
	else 
		return null;

	//no code or code includes something missing
	if(!vs_code || !fs_code) 
	{
		this._has_error = true;
		return null;
	}

	//add globals
	vs_code = LS.Shaders.global_extra_shader_code + vs_code;
	fs_code = LS.Shaders.global_extra_shader_code + fs_code;

	//compile the shader and return it
	var shader = this.compileShader( vs_code, fs_code );
	if(!shader)
		return null;

	//DEBUG
	if(LS.debug)
	{
		var blocks = [];
		for(var i = 0; i < LS.Shaders.num_shaderblocks; ++i)
		{
			if( !(block_flags & 1<<i) ) //is flag enabled
				continue;
			var shader_block = LS.Shaders.shader_blocks[i];
			if(!shader_block)
				continue; //???
			blocks.push( shader_block );
		}
		shader._shadercode_info = {
			vs: vs_code,
			fs: fs_code,
			context: context,
			blocks: blocks,
			flags: block_flags
		}
	}

	//cache as render_mode,flags
	if( !this._compiled_shaders[ render_mode ] )
		this._compiled_shaders[ render_mode ] = new Map();
	this._compiled_shaders[ render_mode ].set( block_flags, shader );

	return shader;
}

ShaderCode.prototype.compileShader = function( vs_code, fs_code )
{
	if( this._has_error )
		return null;

	if( LS.Debug ) //debug shaders
	{
		console.log("Shader Compiled: ", this.fullpath || this.filename )
		console.groupCollapsed("VS shader");
		console.log(vs_code);
		console.groupEnd();
		console.groupCollapsed("FS shader");
		console.log(fs_code);
		console.groupEnd();
	}

	var shader = null;

	if(!LS.catch_exceptions)
	{
		shader = new GL.Shader( vs_code, fs_code );
	}
	else
	{
		try
		{
			shader = new GL.Shader( vs_code, fs_code );
		}
		catch(err)
		{
			this._has_error = true;
			LS.Shaders.dumpShaderError( this.filename, err, vs_code, fs_code );
			var error_info = GL.Shader.parseError( err, vs_code, fs_code );
			var line = error_info.line_number;
			var lines = this._code.split("\n");
			var code_line = -1;
			if(error_info.line_code)
			{
				var error_line_code = error_info.line_code.trim();
				for(var i = 0; i < lines.length; ++i)
					lines[i] = lines[i].trim();
				code_line = lines.indexOf( error_line_code ); //bug: what if this line is twice in the code?...
			}
			LS.dispatchCodeError( err, code_line, this, "shader" );
		}
	}

	if(shader)
	{
		if( LS.debug )
			console.log(" + shader compiled: ", this.fullpath || this.filename );
		LS.dispatchNoErrors( this, "shader" );
	}
	return shader;
}

ShaderCode.prototype.clearCache =  function()
{
	this._compiled_shaders = {};
}

ShaderCode.prototype.validatePublicUniforms = function( shader )
{
	if(!shader)
		throw("ShaderCode: Shader cannot be null");

	for( var i in this._global_uniforms )
	{
		var property_info = this._global_uniforms[i];
		var uniform_info = shader.uniformInfo[ property_info.uniform ];
		if(!uniform_info)
		{
			info.disabled = true;
			continue;
		}
	}
}


//makes this resource available 
ShaderCode.prototype.register = function()
{
	LS.ResourcesManager.registerResource( this.fullpath || this.filename, this );
}

//searches for materials using this ShaderCode and forces them to be updated (update the properties)
ShaderCode.prototype.applyToMaterials = function( scene )
{
	scene = scene || LS.GlobalScene;
	var filename = this.fullpath || this.filename;

	//materials in the resources
	for(var i in LS.ResourcesManager.resources)
	{
		var res = LS.ResourcesManager.resources[i];
		if( res.constructor !== LS.ShaderMaterial || res._shader != filename )
			continue;

		res.processShaderCode();
	}

	//embeded materials
	var nodes = scene.getNodes();
	for(var i = 0; i < nodes.length; ++i)
	{
		var node = nodes[i];
		if(node.material && node.material.constructor === LS.ShaderMaterial && node.material._shader == filename )
			node.material.processShaderCode();
	}
}

//used in editor
ShaderCode.prototype.hasEditableText = function() { return true; }

ShaderCode.removeComments = function( code )
{
	// /^\s*[\r\n]/gm
	return code.replace(/(\/\*([\s\S]*?)\*\/)|(\/\/(.*)$)/gm, '');
}

ShaderCode.replaceCode = function( code, context )
{
	return GL.Shader.replaceCodeUsingContext( code, context );
}

//WIP: parses ShaderLab (unity) syntax
ShaderCode.parseShaderLab = function( code )
{
	var root = {};
	var current = root;
	var current_token = [];
	var stack = [];
	var mode = 0;
	var current_code = "";

	var lines = ShaderCode.removeComments( code ).split("\n");
	for(var i = 0; i < lines.length; ++i)
	{
		var line = lines[i].trim();
		var words = line.match(/[^\s"]+|"([^"]*)"/gi);
		if(!words)
			continue;

		if(mode != 0)
		{
			var w = words[0].trim();
			if(w == "ENDGLSL" || w == "ENDCG" )
			{
				mode = 0;
				current.codetype = mode;
				current.code = current_code;
				current_code = "";
			}
			else
			{
				current_code += line + "\n";
			}
			continue;
		}

		for(var j = 0; j < words.length; ++j)
		{
			var w = words[j];

			if(w == "{")
			{
				var node = {
					name: current_token[0], 
					params: current_token.slice(1).join(" "),
					content: {}
				};
				current[ node.name ] = node;
				current_token = [];
				stack.push( current );
				current = node.content;
			}
			else if(w == "}")
			{
				if(stack.length == 0)
				{
					console.error("error parsing ShaderLab code, the number of { do not matches the }");
					return null;
				}
				if(current_token.length)
				{
					current[ current_token[0] ] = current_token.join(" ");
					current_token = [];
				}
				current = stack.pop();
			}
			else if(w == "{}")
			{
				var node = {
					name: current_token[0], 
					params: current_token.slice(1).join(" "),
					content: {}
				};
				current[ node.name ] = node;
				current_token = [];
			}
			else if(w == "GLSLPROGRAM" || w == "CGPROGRAM" )
			{
				if( w == "GLSLPROGRAM" )
					mode = 1;
				else
					mode = 2;
				current_code = "";
			}
			else 
				current_token.push(w);
		}
	}

	return root;
}

ShaderCode.getDefaultCode = function( instance,  render_settings, pass )
{
	if( ShaderCode.default_code_instance )
		return ShaderCode.default_code_instance;

	var shader_code = ShaderCode.default_code_instance = new LS.ShaderCode();
	shader_code.code = ShaderCode.flat_code;
	return shader_code;
}

//default vertex shader code
ShaderCode.default_vs = "\n\
precision mediump float;\n\
attribute vec3 a_vertex;\n\
attribute vec3 a_normal;\n\
attribute vec2 a_coord;\n\
#pragma shaderblock \"vertex_color\"\n\
#pragma shaderblock \"coord1\"\n\
#ifdef BLOCK_COORD1\n\
	attribute vec2 a_coord1;\n\
	varying vec2 v_uvs1;\n\
#endif\n\
#ifdef BLOCK_VERTEX_COLOR\n\
	attribute vec4 a_color;\n\
	varying vec4 v_vertex_color;\n\
#endif\n\
\n\
//varyings\n\
varying vec3 v_pos;\n\
varying vec3 v_normal;\n\
varying vec2 v_uvs;\n\
varying vec3 v_local_pos;\n\
varying vec3 v_local_normal;\n\
varying vec4 v_screenpos;\n\
\n\
//matrices\n\
uniform mat4 u_model;\n\
uniform mat4 u_normal_model;\n\
uniform mat4 u_view;\n\
uniform mat4 u_viewprojection;\n\
\n\
//globals\n\
uniform float u_time;\n\
uniform vec4 u_viewport;\n\
uniform float u_point_size;\n\
\n\
#pragma shaderblock \"morphing\"\n\
#pragma shaderblock \"skinning\"\n\
\n\
//camera\n\
uniform vec3 u_camera_eye;\n\
void main() {\n\
	\n\
	vec4 vertex4 = vec4(a_vertex,1.0);\n\
	v_local_pos = a_vertex;\n\
	v_local_normal = a_normal;\n\
	v_normal = a_normal;\n\
	v_uvs = a_coord;\n\
	#ifdef BLOCK_COORD1\n\
		v_uvs1 = a_coord1;\n\
	#endif\n\
	#ifdef BLOCK_VERTEX_COLOR\n\
		v_vertex_color = a_color;\n\
	#endif\n\
  \n\
  //deforms\n\
  applyMorphing( vertex4, v_normal );\n\
  applySkinning( vertex4, v_normal );\n\
	\n\
	//vertex\n\
	v_pos = (u_model * vertex4).xyz;\n\
  \n\
  \n\
	//normal\n\
	v_normal = (u_normal_model * vec4(v_normal,0.0)).xyz;\n\
	gl_Position = u_viewprojection * vec4(v_pos,1.0);\n\
	v_screenpos = gl_Position;\n\
}\n\
"

//default fragment shader code
ShaderCode.default_fs = "\n\
	precision mediump float;\n\
	uniform vec4 u_material_color;\n\
	void main() {\n\
		gl_FragColor = u_material_color;\n\
	}\n\
";

ShaderCode.flat_code = "\n\
\\color.fs\n\
"+ ShaderCode.default_fs +"\n\
";


LS.ShaderCode = ShaderCode;
LS.registerResourceClass( ShaderCode );
