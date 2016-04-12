
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

	this._init_function = null;
	this._code_parts = {};
	this._compiled_shaders = {};

	if(code)
		this.code = code;
}

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
	this._code_parts = {};
	this._compiled_shaders = {};
	this._init_function = null;

	var subfiles = GL.processFileAtlas( this._code );
	for(var i in subfiles)
	{
		var subfiles_name = i;
		var subfiles_data = subfiles[i];

		if(!subfiles_name) //empty subfiles, is javascript code to initialize
			continue;

		var name = LS.ResourcesManager.removeExtension(i);
		var extension = LS.ResourcesManager.getExtension(i);
		var code_part = this._code_parts[name];
		if(!code_part)
			code_part = this._code_parts[name] = {};

		if(extension != "vs" && extension != "fs")
		{
			console.warn("Unknown extension in GLSL file, only vs & fs supported, ignoring subfile: " + name);
			continue;
		}

		//parse data (extract pragmas and stuff)
		var blocks = LS.ShaderCode.parseGLSLCode( subfiles_data );

		code_part[ extension ] = { code: subfiles_data, blocks: blocks };
	}

	//compile the shader before using it to ensure there is no errors
	this.getShader();

	//process init code
	var init_code = blocks[""]; //the empty block is the init block
	if(init_code)
	{
		if(LS.catch_exceptions)
		{
			try
			{
				this._init_function = new Function( init_code );
			}
			catch (err)
			{
				LS.dispatchCodeError( err, LScript.computeLineFromError(err), this );
			}
		}
		else
			this._init_function = new Function( init_code );
	}

	//to alert all the materials out there using this shader that they must update themselves.
	LEvent.trigger( LS.ShaderCode, "modified", this );
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
ShaderCode.prototype.getShader = function( render_mode, flags )
{
	render_mode = render_mode || "default";
	flags = flags || 0;

	//search for a compiled version of the shader
	var shader = this._compiled_shaders[render_mode];
	if(shader)
		return shader;

	//search for the code
	var code = this._code_parts[ render_mode ];
	if(!code)
		return null;
	if(!code.vs || !code.fs)
		return null;

	//compile the shader and return it
	if(!LS.catch_exceptions)
		return this._compiled_shaders[ render_mode ] = shader = new GL.Shader( code.vs.code, code.fs.code );

	try
	{
		return this._compiled_shaders[ render_mode ] = shader = new GL.Shader( code.vs.code, code.fs.code );
	}
	catch(err)
	{
		console.error(err);
		LS.dispatchCodeError(err);
	}
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
	var nodes = LS.GlobalScene.getNodes();
	for(var i = 0; i < nodes.length; ++i)
	{
		var node = nodes[i];
		if(node.material && node.material.constructor === LS.ShaderMaterial && node.material._shader == filename )
			node.material.processShaderCode();
	}
}

//given a code with some pragmas, it separates them
ShaderCode.parseGLSLCode = function( code )
{
	//remove comments
	code = code.replace(/(\/\*([\s\S]*?)\*\/)|(\/\/(.*)$)/gm, '');

	var blocks = [];
	var current_block = [];
	var pragmas = {};
	var is_dynamic = false; //means this shader has no variations using pragmas or macros

	var lines = code.split("\n");
	for(var i = 0; i < lines.length; i++)
	{
		var line = lines[i].trim();
		if(!line.length)
			continue;//empty line
		if(line[0] != "#")
		{
			current_block.push(line);
			continue;
		}

		var t = line.split(" ");
		if(t[0] == "#pragma")
		{
			is_dynamic = true;
			pragmas[ t[2] ] = true;
			blocks.push( { type: 1, code: current_block.join("\n") } );
			current_block.length = 0;
			blocks.push( { type: 2, line: line, action: t[1], param: t[2] });
		}
		else
			current_block.push( line ); //regular line
	}

	return {
		is_dynamic: is_dynamic,
		code: code,
		blocks: blocks,
		pragmas: pragmas
	};
}

//Example code for a shader
ShaderCode.example = "\n\
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
uniform mat4 u_mvp;\n\
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
	v_normal = (u_normal_model * vec4(v_normal,1.0)).xyz;\n\
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
//material\n\
uniform vec4 u_material_color; //color and alpha\n\
void main() {\n\
	gl_FragColor = u_material_color;\n\
}\n\
\n\
";

LS.ShaderCode = ShaderCode;
LS.registerResourceClass( ShaderCode );