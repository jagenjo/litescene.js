
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
	this._compiled_shaders = {};

	this._shaderblock_flags_num = 0; //used to assign flags to dependencies
	this._shaderblock_flags = {};

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

	var subfiles = GL.processFileAtlas( this._code );
	this._subfiles = subfiles;

	var num_subfiles = 0;
	var init_code = null; 

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
			var code_info = ShaderCode.parseGLSLCode( subfile_data );
			for(var j in code_info)
			{
				var pragma_info = code_info[j];
				if(!pragma_info || pragma_info.type != ShaderCode.PRAGMA)
					continue;
				//assign a flag position in case this block is enabled
				pragma_info.shader_block_flag = this._shaderblock_flags_num; 
				this._shaderblock_flags[ pragma_info.shader_block ] = pragma_info.shader_block_flag;
				this._shaderblock_flags_num += 1;
			}

			code_part[ extension ] = code_info;
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
		init_code = LS.ShaderCode.removeComments(init_code);

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

ShaderCode.prototype.getDataToStore = function()
{
	return this._code;
}

//compile the shader, cache and return
ShaderCode.prototype.getShader = function( render_mode, block_flags )
{
	render_mode = render_mode || "default";
	block_flags = block_flags || 0;

	//search for a compiled version of the shader (by render_mode and block_flags)
	var shaders_map = this._compiled_shaders[ render_mode ];
	if(shaders_map)
	{
		var shader = shaders_map.get( block_flags );
		if(shader)
			return shader;
	}

	//search for the code
	var code = this._code_parts[ render_mode ];
	if(!code)
		return null;

	//vertex shader code
	var vs_code = null;
	if(render_mode == "fx")
		vs_code = GL.Shader.SCREEN_VERTEX_SHADER;
	else if( !code.vs )
		return null;
	else
		vs_code = this.getCodeFromSubfile( code.vs, GL.VERTEX_SHADER, block_flags );

	//fragment shader code
	if( !code.fs )
		return;
	var fs_code = this.getCodeFromSubfile( code.fs, GL.FRAGMENT_SHADER, block_flags );

	//no code or code includes something missing
	if(!vs_code || !fs_code) 
		return null;

	//compile the shader and return it
	var shader = this.compileShader( vs_code, fs_code );
	if(!shader)
		return null;

	//cache as render_mode,flags
	if( !this._compiled_shaders[ render_mode ] )
		this._compiled_shaders[ render_mode ] = new Map();
	this._compiled_shaders[ render_mode ].set( block_flags, shader );

	return shader;
}

ShaderCode.prototype.compileShader = function( vs_code, fs_code )
{
	if(!LS.catch_exceptions)
		return new GL.Shader( vs_code, fs_code );
	else
	{
		try
		{
			return new GL.Shader( vs_code, fs_code );
		}
		catch(err)
		{
			LS.ShadersManager.dumpShaderError( this.filename, err, vs_code, fs_code );
			LS.dispatchCodeError(err);
		}
	}
	return null;
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

//this function resolves all pragmas (includes, shaderblocks, etc) and returns the final code
ShaderCode.prototype.getCodeFromSubfile = function( subfile, shader_type, block_flags )
{
	if( !subfile.is_dynamic )
		return subfile.code;

	var code = "";
	var blocks = subfile.blocks;

	for(var i = 0; i < blocks.length; ++i)
	{
		var block = blocks[i];
		if( block.type === ShaderCode.CODE ) //regular code
		{
			code += block.code;
			continue;
		}

		//pragmas
		if(block.include) //bring code from other files
		{
			var filename = block.include;
			var ext = LS.ResourcesManager.getExtension( filename );
			if(ext)
			{
				var extra_shadercode = LS.ResourcesManager.getResource( filename, LS.ShaderCode );
				if(!extra_shadercode)
				{
					LS.ResourcesManager.load( filename ); //force load
					return null;
				}
				if(!block.include_subfile)
					code += "\n" + extra_shadercode._subfiles[""] + "\n";
				else
				{
					var extra = extra_shadercode._subfiles[ block.include_subfile ];
					if(extra === undefined)
						return null;
					code += "\n" + extra + "\n";
				}
			}
			else
			{
				var snippet_code = LS.ShadersManager.getSnippet( filename );
				if( !snippet_code )
					return null; //snippet not found
				code += "\n" + snippet_code.code + "\n";
			}
		}
		else if( block.shader_block ) //injects code from ShaderCodes taking into account certain rules
		{
			var shader_block = LS.ShadersManager.getShaderBlock( block.shader_block );
			if(!shader_block)
			{
				console.error("ShaderCode uses unknown ShaderBlock: ", block.shader_block);
				return null;
			}

			var block_code = shader_block.getCode( shader_type, block_flags );
			code += "\n" + block_code + "\n";
		}
	}

	return code;
}

//given a code with some pragmas, it separates them
ShaderCode.parseGLSLCode = function( code )
{
	//remove comments
	code = code.replace(/(\/\*([\s\S]*?)\*\/)|(\/\/(.*)$)/gm, '');

	var blocks = [];
	var current_block = [];
	var pragmas = {};
	var uniforms = {};
	var includes = {};
	var shader_blocks = {};
	var is_dynamic = false; //means this shader has no variations using pragmas or macros

	var lines = code.split("\n");

	/* 
	//clean (this helps in case a line contains two instructions, like "uniform float a; uniform float b;"
	var clean_lines = [];
	for(var i = 0; i < lines.length; i++)
	{
		var line = lines[i].trim();
		if(!line)
			continue;
		var pos = line.lastIndexOf(";");
		if(pos == -1 || pos == lines.length - 1)
			clean_lines.push(line);
		else
		{
			var sublines = line.split(";");
			for(var j = 0; j < sublines.length; ++j)
			{
				if(sublines[j])
					clean_lines.push( sublines[j] + ";" );
			}
		}
	}
	lines = clean_lines;
	*/

	//parse
	for(var i = 0; i < lines.length; i++)
	{
		var line = lines[i].trim();
		if(!line.length)
			continue;//empty line

		if(line[0] != "#")
		{
			var words = line.split(" ");
			if( words[0] == "uniform" ) //store which uniforms we found in the code (not used)
			{
				var uniform_name = words[2].split(";");
				uniforms[ uniform_name[0] ] = words[1];
			}
			current_block.push(line);
			continue;
		}

		var t = line.split(" ");
		if(t[0] == "#pragma")
		{
			//merge lines and add previous block
			blocks.push( { type: ShaderCode.CODE, code: current_block.join("\n") } ); 

			is_dynamic = true;
			pragmas[ t[2] ] = true;
			var action = t[1];
			current_block.length = 0;
			var pragma_info = { type: ShaderCode.PRAGMA, line: line, action: action, param: t[2] };
			if( action == "include")
			{
				if(!t[2])
				{
					console.error("shader include without path");
					continue;
				}

				pragma_info.action_type = ShaderCode.INCLUDE;
				//resolve include
				var include = t[2].substr(1, t[2].length - 2); //safer than JSON.parse
				var fullname = include.split(":");
				var filename = fullname[0];
				var subfile = fullname[1];
				pragma_info.include = filename;
				pragma_info.include_subfile = subfile;
				includes[ pragma_info.include ] = true;
			}
			else if( action == "shaderblock" )
			{
				if(!t[2])
				{
					console.error("#pragma shaderblock without name");
					continue;
				}
				pragma_info.action_type = ShaderCode.SHADERBLOCK;
				var shader_block_name = t[2].substr(1, t[2].length - 2); //safer than JSON.parse
				pragma_info.shader_block = shader_block_name;
				shader_blocks[ pragma_info.shader_block ] = true;
				//pragma_info.shader_block_flag = this._shaderblock_flags_num;
				//this._shaderblock_flags[ shader_block_name ] = pragma_info.shader_block_flag;
				//this._shaderblock_flags_num += 1;
			}

			blocks.push( pragma_info ); //add pragma block
		}
		else
			current_block.push( line ); //add line to current block lines
	}

	if(current_block.length)
		blocks.push( { type: ShaderCode.CODE, code: current_block.join("\n") } ); //merge lines and add as block

	return {
		is_dynamic: is_dynamic,
		code: code,
		blocks: blocks,
		pragmas: pragmas,
		uniforms: uniforms,
		includes: includes,
		shader_blocks: shader_blocks
	};
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


LS.ShaderCode = ShaderCode;
LS.registerResourceClass( ShaderCode );

// now some shadercode examples that could be helpful

//Example code for a shader
ShaderCode.examples = {};

ShaderCode.examples.fx = "\n\
\\fx.fs\n\
	precision highp float;\n\
	\n\
	uniform float u_time;\n\
	uniform vec4 u_viewport;\n\
	uniform sampler2D u_texture;\n\
	varying vec2 v_coord;\n\
	void main() {\n\
		gl_FragColor = texture2D( u_texture, v_coord );\n\
	}\n\
";

ShaderCode.examples.color = "\n\
\n\
\\js\n\
//define exported uniforms from the shader (name, uniform, widget)\n\
this.createUniform(\"Number\",\"u_number\",\"number\");\n\
this.createSampler(\"Texture\",\"u_texture\");\n\
\n\
\\default.vs\n\
\n\
precision mediump float;\n\
attribute vec3 a_vertex;\n\
attribute vec3 a_normal;\n\
attribute vec2 a_coord;\n\
\n\
//varyings\n\
varying vec3 v_pos;\n\
varying vec3 v_normal;\n\
varying vec2 v_uvs;\n\
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
//camera\n\
uniform vec3 u_camera_eye;\n\
void main() {\n\
	\n\
	vec4 vertex4 = vec4(a_vertex,1.0);\n\
	v_normal = a_normal;\n\
	v_uvs = a_coord;\n\
	\n\
	//vertex\n\
	v_pos = (u_model * vertex4).xyz;\n\
	//normal\n\
	v_normal = (u_normal_model * vec4(v_normal,0.0)).xyz;\n\
	gl_Position = u_viewprojection * vec4(v_pos,1.0);\n\
}\n\
\n\
\\default.fs\n\
\n\
precision mediump float;\n\
//varyings\n\
varying vec3 v_pos;\n\
varying vec3 v_normal;\n\
varying vec2 v_uvs;\n\
//globals\n\
uniform vec4 u_clipping_plane;\n\
uniform float u_time;\n\
uniform vec3 u_background_color;\n\
uniform vec3 u_ambient_light;\n\
\n\
uniform float u_number;\n\
uniform sampler2D u_texture;\n\
\n\
//material\n\
uniform vec4 u_material_color; //color and alpha\n\
void main() {\n\
	vec3 N = normalize( v_normal );\n\
	vec3 L = vec3( 0.577, 0.577, 0.577 );\n\
	vec4 color = u_material_color;\n\
	color.xyz *= max(0.0, dot(N,L) );\n\
	gl_FragColor = color;\n\
}\n\
\n\
";