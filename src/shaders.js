///@INFO: BASE
/* Basic shader manager 
	- Allows to load all shaders from XML
	- Allows to use a global shader
*/

//************************************
/**
* Shaders is the static class in charge of loading, compiling and storing shaders for reuse.
*
* @class Shaders
* @namespace LS
* @constructor
*/

var Shaders = {

	snippets: {},//to save source snippets
	shader_blocks_by_id: new Map(),//to save shader block
	shader_blocks: [],
	num_shaderblocks: 0, //used to know the index

	global_extra_shader_code: "",
	dump_compile_errors: true, //dump errors in console
	on_compile_error: null, //callback 


	/**
	* Initializes the shader manager
	*
	* @method init
	* @param {string} url a url to a shaders.xml can be specified to load the shaders
	*/
	init: function(url, ignore_cache)
	{
		//this.shader_blocks = {};//do not initialize, or we will loose all

		//base intro code for shaders
		var supported_features = []; //[name, webgl1_extension_name, enabling code]
		supported_features.push( ["STANDARD_DERIVATIVES", "OES_standard_derivatives", "#extension GL_OES_standard_derivatives : enable"] );
		supported_features.push( ["DRAW_BUFFERS","WEBGL_draw_buffers"] ); //#extension GL_EXT_draw_buffers : require

		this.global_extra_shader_code = String.fromCharCode(10) + "#define WEBGL_VERSION "+gl.webgl_version+"\n";

		for(var i in supported_features)
		{
			var feature = supported_features[i];
			if( gl.webgl_version == 2 || gl.extensions[ feature[1] ] )
			{
				this.global_extra_shader_code += "#define " + feature[0] + "\n";
				if(gl.webgl_version == 1 && feature[2]) 
					this.global_extra_shader_code += feature[2] + "\n";
			}
		}
	},

	/**
	* Reloads the XML file with the shaders, useful when editing the file
	*
	* @method reloadShaders
	* @param {function} on_complete call when the shaders have been reloaded
	*/
	reloadShaders: function(on_complete)
	{
		//TODO: crawl all materials and clear shaders
	},

	/**
	* Compiles a shader, the vertex and fragment shader are cached indepently to speed up compilations but a unique name must be provided
	*
	* @method compileShader
	* @param {string} vs_code the final source code for the vertex shader
	* @param {string} fs_code the final source code for the fragment shader
	* @param {string} name an unique name that should be associated with this shader
	* @return {GL.Shader} shader
	*/
	compile: function( vs_code, fs_code, name )
	{
		if(!name)
			throw("compileShader must have a name specified");

		if(!gl)
			return null;
		var shader = null;
		try
		{
			vs_code = this.global_extra_shader_code + vs_code;
			fs_code = this.global_extra_shader_code + fs_code;

			//speed up compilations by caching shaders compiled
			var vs_shader = this.compiled_shaders[name + ":VS"];
			if(!vs_shader)
				vs_shader = this.compiled_shaders[name + ":VS"] = GL.Shader.compileSource(gl.VERTEX_SHADER, vs_code);
			var fs_shader = this.compiled_shaders[name + ":FS"];
			if(!fs_shader)
				fs_shader = this.compiled_shaders[name + ":FS"] = GL.Shader.compileSource(gl.FRAGMENT_SHADER, fs_code);

			var old = getTime();
			shader = new GL.Shader( vs_shader, fs_shader );
			if(this.debug)
				console.log("Shader compile time: ", (getTime() - old).toFixed(3), "ms");
			shader.name = name;
			//console.log("Shader compiled: " + name);
		}
		catch (err)
		{
			if(this.dump_compile_errors)
			{
				this.dumpShaderError(name, err, vs_code, fs_code );
				this.dump_compile_errors = false; //disable so the console dont get overflowed
			}

			if(this.on_compile_error)
				this.on_compile_error(err);

			return null;
		}
		return shader;
	},

	clearShaderCodeCache: function()
	{
		var scs = [];

		//get all shadercodes...
		var shadercodes = ONE.StandardMaterial.shader_codes;
		for(var i in shadercodes)
			scs.push( shadercodes[i] );

		var res = ONE.ResourcesManager.resources;
		for(var i in res)
			if( res[i].constructor === ONE.ShaderCode )
				scs.push( res[i] );

		//clear caches
		for(var i in scs)
		{
			var sb = scs[i];
			sb.clearCache();
		}
	},

	dumpShaderError: function( name, err, vs_code, fs_code )
	{
		console.error("Error compiling shader: " + name);
		console.log(err);
		console.groupCollapsed("Vertex Shader Code");
		//console.log("VS CODE\n************");
		var lines = vs_code.split("\n");
		for(var i in lines)
			console.log(i + ": " + lines[i]);
		console.groupEnd();

		console.groupCollapsed("Fragment Shader Code");
		//console.log("FS CODE\n************");
		lines = fs_code.split("\n");
		for(var i in lines)
			console.log(i + ": " + lines[i]);
		console.groupEnd();
	},

	/**
	* Register a code snippet ready to be used by the #import clause in the shader
	*
	* @method registerSnippet
	* @param {string} id
	* @param {string} code
	*/
	registerSnippet: function(id, code)
	{
		this.snippets[ id ] = { id: id, code: code };
	},

	/**
	* Returns the code of a snipper
	*
	* @method getSnippet
	* @param {string} id
	* @return {string} code
	*/
	getSnippet: function(id)
	{
		return this.snippets[ id ];
	},

	/**
	* register a shaderblock in the global container so it can be used by shadermaterials
	*
	* @method registerShaderBlock
	* @param {string} id
	* @param {ONE.ShaderBlock} shader_block
	*/
	registerShaderBlock: function( id, shader_block, ignore_warning )
	{
		var block_id = -1;

		if( !ignore_warning && this.shader_blocks_by_id.get( id ) )
		{
			console.warn("There is already a ShaderBlock with that name, replacing it: ", id);
			block_id = this.shader_blocks_by_id.get(id).flag_id;
			this.clearShaderCodeCache();
		}
		else
			block_id = this.num_shaderblocks++;
		if(block_id >= 64)
			console.warn("Too many shaderblocks registered, not enought bits in a 64bits variable");

		shader_block.flag_id = block_id;
		shader_block.flag_mask = 1<<block_id;
		this.shader_blocks_by_id.set( id, shader_block );
		this.shader_blocks[ block_id ] = shader_block;
	},

	/**
	* register a shaderblock with the given id
	*
	* @method getShaderBlock
	* @param {string|Number} id
	* @return {ONE.ShaderBlock} shader_block
	*/
	getShaderBlock: function( id )
	{
		if(id.constructor === String)
			return this.shader_blocks_by_id.get( id );
		return this.shader_blocks[id];
	},

	//this is global code for default shaders
	common_vscode: "\n\
		precision mediump float;\n\
		attribute vec3 a_vertex;\n\
		attribute vec3 a_normal;\n\
		attribute vec2 a_coord;\n\
		uniform mat4 u_model;\n\
		uniform mat4 u_viewprojection;\n\
	",
	common_fscode: "\n\
		precision mediump float;\n\
	"

};

ONE.Shaders = Shaders;

/**
* A ShaderBlock represents a block of GLSL code that could be requested by a shader in order to obtain a functionality.
* SBs are registered and given a number, then if a shader wants that functionality it could use #pragma shaderblock "sb_name"
* it will be inserted in the material in the line of the pragma
*
* @class ShaderBlock
* @namespace LS
* @constructor
*/
function ShaderBlock( name )
{
	this.dependency_blocks = []; //blocks referenced by this block
	this.flag_id = -1;
	this.flag_mask = 0;
	this.events = null; //{};
	if(!name)
		throw("ShaderBlock must have a name");
	if(name.indexOf(" ") != -1)
		throw("ShaderBlock name cannot have spaces: " + name);
	this.name = name;
	this.code_map = new Map();
	this.context_macros = null;
}

ShaderBlock.prototype.defineContextMacros = function( macros )
{
	this.context_macros = macros;
}

/**
* register a shaderblock with the given id
* shader_type: vertex or fragment shader
*
* @method addCode
* @param {enum} shader_type could be  GL.VERTEX_SHADER or  GL.FRAGMENT_SHADER
* @param {string} enabled_code the code to insert if the shaderblock is enabled
* @param {string} disabled_code the code to insert if the shaderblock is disabled
* @param {Object} macros [optional] a set of macros to use when compiling this shader codes
*/
ShaderBlock.prototype.addCode = function( shader_type, enabled_code, disabled_code, macros )
{
	enabled_code  = enabled_code || "";
	disabled_code  = disabled_code || "";

	//this.checkDependencies( enabled_code );
	//this.checkDependencies( disabled_code );

	var info = { 
		enabled: new ONE.GLSLCode( enabled_code ),
		disabled: new ONE.GLSLCode( disabled_code ),
		macros: macros
	};
	this.code_map.set( shader_type, info );
}

ShaderBlock.prototype.bindEvent = function( event, code )  //priority?
{
	if(!this.events)
		this.events = {};
	this.events[ event ] = code;
}

/**
* Returns the full code of a shaderblock resolving all includes, shaderblocks, etc
* shadertype: GL.VERTEX_SHADER = 35633, GL.FRAGMENT_SHADER = 35632
*
* @method getFinalCode
* @param {enum} shader_type could be GL.VERTEX_SHADER or  GL.FRAGMENT_SHADER
* @param {number} block_flags a number containing the mask (every bit is a flag for a shaderblock) with all the enabled shader blocks
* @param {string} context an object with variable that could be fetched by the shaderblocks
* @return {String} the final code ready to be compiled
*/
ShaderBlock.prototype.getFinalCode = function( shader_type, block_flags, context )
{
	block_flags = block_flags || 0;
	var code = this.code_map.get( shader_type );
	if(!code)
		return null;
	var glslcode = (block_flags & this.flag_mask) ? code.enabled : code.disabled;
	var finalcode = glslcode.getFinalCode( shader_type, block_flags, context );

	if( code.macros )
	{
		var macros_code = "";
		for(var i in code.macros)
			macros_code += "#define " + i + code.macros[i] + "\n";
		finalcode = macros_code + finalcode;
	}
	return finalcode;
}

/**
* Registers this shaderblock in the global ONE.Shaders container
*
* @method register
**/
ShaderBlock.prototype.register = function( overwrite )
{
	ONE.Shaders.registerShaderBlock(this.name, this, overwrite );
}

ShaderBlock.prototype.checkDependencies = function( code )
{
//TODO
}


ONE.ShaderBlock = ShaderBlock;



/**
* Used for parsing GLSL code and precompute info (mostly preprocessor macros)
* @class GLSLCode
* @constructor
* @param {String} code
*/
function GLSLCode( code )
{
	this.code = code;

	this.blocks = [];
	this.pragmas = {};
	this.uniforms = {};
	this.attributes = {};
	this.includes = {};
	this.snippets = {};
	this.shader_blocks = {}; //warning: this not always contain which shaderblocks are in use, because they could be dynamic using pragma define
	this.is_dynamic = false; //means this shader has no variations using pragmas or macros
	if(code)
		this.parse();
}

ONE.GLSLCode = GLSLCode;

GLSLCode.pragma_methods = {};

GLSLCode.types_conversor = {
	"number":"float",
	"texture":"sampler2D",
	"textureCube":"samplerCube"
};


//block types
GLSLCode.CODE = 1;
GLSLCode.PRAGMA = 2;

//pargma types
GLSLCode.INCLUDE = 1;
GLSLCode.SHADERBLOCK = 2;
GLSLCode.SNIPPET = 3;
GLSLCode.EVENT = 4;

//given a code with some pragmas, it separates them
GLSLCode.prototype.parse = function()
{
	//remove comments
	var code = this.code.replace(/(\/\*([\s\S]*?)\*\/)|(\/\/(.*)$)/gm, '');

	this.fragments = [];
	this.pragmas = {};
	this.uniforms = {};
	this.streams = {};
	this.includes = {};
	this.snippets = {};
	this.shader_blocks = {};
	this.is_dynamic = false; //means this shader has no variations using pragmas or macros

	var current_fragment = [];
	var lines = code.split("\n");

	//parse
	for(var i = 0; i < lines.length; i++)
	{
		var line = lines[i].trim();
		if(!line.length)
			continue;//empty line

		if(line[0] != "#")
		{
			var words = line.split(" ");
			if( words[0] == "uniform" ) //store which uniforms we found in the code (not used yet)
			{
				var uniform_name = words[2].split(";");
				this.uniforms[ uniform_name[0] ] = words[1];
			}
			else if( words[0] == "attribute" ) //store which streams we found in the code (not used yet)
			{
				var uniform_name = words[2].split(";");
				this.attributes[ uniform_name[0] ] = words[1];
			}
			current_fragment.push(line);
			continue;
		}

		var t = line.split(" ");
		if(t[0] == "#pragma")
		{
			//merge lines and add previous fragment
			var current_fragment_code = current_fragment.join("\n");
			if(current_fragment_code.trim()) //in case is empty this code fragment
				this.fragments.push( { type: GLSLCode.CODE, code: current_fragment_code } ); 

			this.is_dynamic = true;
			this.pragmas[ t[2] ] = true;
			var action = t[1];
			current_fragment.length = 0;
			var pragma_info = { type: GLSLCode.PRAGMA, line: line, action: action, param: t[2] };

			var method = ONE.GLSLCode.pragma_methods[ action ];
			if( !method || !method.parse )
			{
				console.warn("#pragma action unknown: ", action );
				continue;
			}
			if( method.parse.call( this, pragma_info, t ) === false )
			{
				//current_fragment.push("\n"); //add line to current fragment lines
				continue;
			}
			this.fragments.push( pragma_info ); //add pragma fragment
		}
		else
			current_fragment.push( line ); //add line to current fragment lines
	}

	if(current_fragment.length)
	{
		var current_fragment_code = current_fragment.join("\n");
		if(current_fragment_code.trim()) //in case is empty this code fragment
			this.fragments.push( { type: GLSLCode.CODE, code: current_fragment_code } ); //merge lines and add as fragment
	}

	//done
	return true;
}

GLSLCode.prototype.getFinalCode = function( shader_type, block_flags, context )
{
	if( !this.is_dynamic )
		return this.code;

	var code = "";
	context = context || {};
	var fragments = this.fragments;

	for(var i = 0; i < fragments.length; ++i)
	{
		var fragment = fragments[i];
		if( fragment.type === GLSLCode.CODE ) //regular code
		{
			code += fragment.code;
			continue;
		}

		var pragma_method = GLSLCode.pragma_methods[ fragment.action ];
		if(!pragma_method || !pragma_method.getCode )
		{
			code += "\n";
			continue;
		}

		var r = pragma_method.getCode.call( this, shader_type, fragment, block_flags, context );
		if( r )
			code += r;
	}

	return code;
}

// PRAGMA METHODS ****************************

GLSLCode.pragma_methods["include"] = {
	parse: function( pragma_info, t )
	{
		if(!t[2])
		{
			console.error("shader include without path");
			return false;
		}

		pragma_info.action_type = GLSLCode.INCLUDE;
		//resolve include
		var include = t[2].substr(1, t[2].length - 2); //safer than JSON.parse
		var fullname = include.split(":");
		var filename = fullname[0];
		var subfile = fullname[1];
		pragma_info.include = filename;
		pragma_info.include_subfile = subfile;
		this.includes[ pragma_info.include ] = true;
	},

	getCode: function( shader_type, fragment, block_flags, context )
	{
		var extra_code = "";

		var filename = fragment.include;
		var ext = ONE.ResourcesManager.getExtension( filename );
		if(ext)
		{
			var extra_shadercode = ONE.ResourcesManager.getResource( filename, ONE.ShaderCode );
			if(!extra_shadercode)
			{
				ONE.ResourcesManager.load( filename ); //force load
				return null;
			}
			if(!fragment.include_subfile)
				extra_code = "\n" + extra_shadercode._subfiles[""] + "\n";
			else
			{
				var extra = extra_shadercode._subfiles[ fragment.include_subfile ];
				if(extra === undefined)
					return null;
				extra_code = "\n" + extra + "\n";
			}
		}
		else
		{
			var snippet_code = ONE.Shaders.getSnippet( filename );
			if( !snippet_code )
				return null; //snippet not found
			extra_code = "\n" + snippet_code.code + "\n";
		}

		return extra_code;
	}
};

GLSLCode.pragma_methods["define"] = {
	parse: function( pragma_info, t )
	{
		var param1 = t[2];
		var param2 = t[3];
		if(!param1 || !param2)
		{
			console.error("#pragma define missing parameters");
			return false;
		}
		pragma_info.define = [ param1, param2.substr(1, param2.length - 2) ];
	},
	getCode: function( shader_type, fragment, block_flags, context )
	{
		context[ fragment.define[0] ] = fragment.define[1];
	}
}

GLSLCode.pragma_methods["shaderblock"] = {
	parse: function( pragma_info, t )
	{
		if(!t[2])
		{
			console.error("#pragma shaderblock without name");
			return false;
		}
		pragma_info.action_type = GLSLCode.SHADERBLOCK;

		var param = t[2];
		if(param[0] == '"') //one means "shaderblock_name", two means shaderblock_var
		{
			pragma_info.shader_block = [1, param.substr(1, param.length - 2)]; //safer than JSON.parse
			this.shader_blocks[ pragma_info.shader_block[1] ] = true;
		}
		else
		{
			pragma_info.shader_block = [2, param];
			if(t[3]) //thirth parameter for default
			{
				pragma_info.shader_block.push( t[3].substr(1, t[3].length - 2) );
				this.shader_blocks[ pragma_info.shader_block[2] ] = true;
			}
		}
	},
	getCode: function( shader_type, fragment, block_flags, context )
	{
		var shader_block_name = fragment.shader_block[1];
		if( fragment.shader_block[0] == 2 ) //is dynamic shaderblock name
		{
			//dynamic shaderblock name
			if( context[ shader_block_name ] ) //search for the name in the context
				shader_block_name = context[ shader_block_name ];
			else 
				shader_block_name = fragment.shader_block[2]; //if not found use the default

			if(!shader_block_name)
			{
				console.error("ShaderBlock: no context var found: " + shader_block_name );
				return null;
			}
		}
		
		var shader_block = ONE.Shaders.getShaderBlock( shader_block_name );
		if(!shader_block)
		{
			//console.error("ShaderCode uses unknown ShaderBlock: ", fragment.shader_block);
			return null;
		}

		var code = "\n";

		//add the define BLOCK_name only if enabled
		if( shader_block.flag_mask & block_flags )
			code = "\n#define BLOCK_" + ( shader_block.name.toUpperCase() ) +"\n";

		var block_code = shader_block.getFinalCode( shader_type, block_flags, context );
		if( block_code )
			code += block_code + "\n";

		return code;
	}
};

GLSLCode.pragma_methods["snippet"] = { 
	parse: function( pragma_info, t )
	{
		if(!t[2])
		{
			console.error("#pragma snippet without name");
			return false;
		}
		pragma_info.action_type = GLSLCode.SNIPPET;
		var snippet_name = t[2].substr(1, t[2].length - 2); //safer than JSON.parse
		pragma_info.snippet = snippet_name;
		this.snippets[ snippet_name ] = true;
	},
	getCode: function( shader_type, fragment, block_flags, context )
	{
		var snippet = ONE.Shaders.getSnippet( fragment.snippet );
		if(!snippet)
		{
			console.error("ShaderCode uses unknown Snippet: ", fragment.snippet);
			return null;
		}

		return "\n" + snippet.code + "\n";
	}
};

GLSLCode.pragma_methods["event"] = { 
	parse: function( pragma_info, t )
	{
		if(!t[2])
		{
			console.error("#pragma event without name");
			return false;
		}
		pragma_info.action_type = GLSLCode.EVENT;
		var name = t[2].substr(1, t[2].length - 2); //safer than JSON.parse
		pragma_info.event = name;
	},
	getCode: function( shader_type, fragment, block_flags, context )
	{
		//dispatch event
		var code = "\n";
		var mask = 1;
		for(var i = 0, l = ONE.Shaders.shader_blocks.length; i < l; ++i)
		{
			var block = ONE.Shaders.shader_blocks[i];
			if(block_flags & block.flag_mask)
			{
				if(!block.events)
					continue;
				var block_code = block.events[ fragment.event ];
				if(!block_code)
					continue;
				code += block_code + "\n";
			}
		}
		//catch results
		return code;
	}
};

//not used
GLSLCode.breakLines = function(lines)
{
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
	return clean_lines;
}


// shaders

ONE.Shaders.registerSnippet("input","\n\
			#ifndef SNIPPET_INPUT\n\
			#define SNIPPET_INPUT\n\
			//used to store topology input information\n\
			struct Input {\n\
				vec4 color;\n\
				vec3 vertex;\n\
				vec3 normal;\n\
				vec2 uv;\n\
				vec2 uv1;\n\
				\n\
				vec3 camPos;\n\
				float camDist;\n\
				vec3 viewDir;\n\
				vec3 worldPos;\n\
				vec3 worldNormal;\n\
				vec4 screenPos;\n\
			};\n\
			\n\
			Input getInput()\n\
			{\n\
				Input IN;\n\
				IN.color = vec4(1.0);\n\
				IN.vertex = v_pos;\n\
				IN.normal = v_normal;\n\
				IN.uv = v_uvs;\n\
				IN.uv1 = IN.uv;\n\
				\n\
				IN.camPos = u_camera_eye;\n\
				IN.viewDir = u_camera_eye - v_pos;\n\
				IN.camDist = length(IN.viewDir);\n\
				IN.viewDir /= IN.camDist;\n\
				IN.worldPos = v_pos;\n\
				IN.worldNormal = normalize(v_normal);\n\
				IN.screenPos = vec4( (v_screenpos.xy / v_screenpos.w) * 0.5 + vec2(0.5), v_screenpos.zw );  //sometimes we need also z and w, thats why we pass all\n\
				//IN.screenPos = vec4( (gl_FragCoord.xy / gl_FragCoord.w) * 0.5 + vec2(0.5), gl_FragCoord.zw );  //sometimes we need also z and w, thats why we pass all\n\
				return IN;\n\
			}\n\
			#endif\n\
	");

ONE.Shaders.registerSnippet("structs","\n\
			//used to store topology input information\n\
			struct Input {\n\
				vec4 color;\n\
				vec3 vertex;\n\
				vec3 normal;\n\
				vec2 uv;\n\
				vec2 uv1;\n\
				\n\
				vec3 camPos;\n\
				vec3 viewDir;\n\
				float camDist;\n\
				vec3 worldPos;\n\
				vec3 worldNormal;\n\
				vec4 screenPos;\n\
			};\n\
			\n\
			//used to store surface shading properties\n\
			struct SurfaceOutput {\n\
				vec3 Albedo;\n\
				vec3 Normal; //separated in case there is a normal map\n\
				vec3 Emission;\n\
				vec3 Ambient;\n\
				float Specular;\n\
				float Gloss;\n\
				float Alpha;\n\
				float Reflectivity;\n\
				vec4 Extra; //for special purposes\n\
			};\n\
			\n\
			//used to store light contribution\n\
			//CAREFUL: this one is different than \n\
			struct FinalLight {\n\
				vec3 Color;\n\
				vec3 Ambient;\n\
				float Diffuse; //NdotL\n\
				float Specular; //RdotL\n\
				vec3 Emission;\n\
				vec3 Reflection;\n\
				float Attenuation;\n\
				float Shadow; //1.0 means fully lit\n\
			};\n\
	");

ONE.Shaders.registerSnippet("spotFalloff","\n\
			float spotFalloff(vec3 spotDir, vec3 lightDir, float angle_phi, float angle_theta)\n\
			{\n\
				float sqlen = dot(lightDir,lightDir);\n\
				float atten = 1.0;\n\
				\n\
				vec4 spotParams = vec4( angle_phi, angle_theta, 1.0, 0.0 );\n\
				spotParams.w = 1.0 / (spotParams.x-spotParams.y);\n\
				\n\
				vec3 dirUnit = lightDir * sqrt(sqlen); //we asume they are normalized\n\
				float spotDot = dot(spotDir, -dirUnit);\n\
				if (spotDot <= spotParams.y)// spotDot <= cos phi/2\n\
					return 0.0;\n\
				else if (spotDot > spotParams.x) // spotDot > cos theta/2\n\
					return 1.0;\n\
				\n\
				// vertex lies somewhere beyond the two regions\n\
				float ifallof = pow( (spotDot-spotParams.y)*spotParams.w,spotParams.z );\n\
				return ifallof;\n\
			}\n\
	");

ONE.Shaders.registerSnippet("getFlatNormal","\n\
			#ifdef STANDARD_DERIVATIVES\n\
				vec3 getFlatNormal(vec3 pos)\n\
				{\n\
					vec3 A = dFdx( pos );\n\
					vec3 B = dFdy( pos );\n\
					return normalize( cross(A,B) );\n\
				}\n\
			#else\n\
				vec3 getFlatNormal(vec3 pos)\n\
				{\n\
					return vec3(0.0);\n\
				}\n\
			#endif\n\
	");


ONE.Shaders.registerSnippet("PackDepth32","\n\
			\n\
			float linearDepth(float z, float near, float far)\n\
			{\n\
				return (z - near) / (far - near);\n\
			}\n\
			float linearDepthNormalized(float z, float near, float far)\n\
			{\n\
				float z_n = 2.0 * z - 1.0;\n\
				return 2.0 * near * far / (far + near - z_n * (far - near));\n\
			}\n\
			\n\
			//packs depth normalized \n\
			vec4 PackDepth32(float depth)\n\
			{\n\
			  const vec4 bitShift = vec4( 256.0 * 256.0 * 256.0, 256.0 * 256.0, 256.0, 1.0 );\n\
			  const vec4 bitMask = vec4( 0.0, 1.0 / 256.0, 1.0 / 256.0, 1.0 / 256.0 );\n\
			  vec4 comp = fract(depth * bitShift);\n\
			  comp -= comp.xxyz * bitMask;\n\
			  return comp;\n\
			}\n\
");


ONE.Shaders.registerSnippet("perturbNormal","\n\
				mat3 cotangent_frame(vec3 N, vec3 p, vec2 uv)\n\
				{\n\
					// get edge vectors of the pixel triangle\n\
					#ifdef STANDARD_DERIVATIVES\n\
					\n\
					vec3 dp1 = dFdx( p );\n\
					vec3 dp2 = dFdy( p );\n\
					vec2 duv1 = dFdx( uv );\n\
					vec2 duv2 = dFdy( uv );\n\
					\n\
					// solve the linear system\n\
					vec3 dp2perp = cross( dp2, N );\n\
					vec3 dp1perp = cross( N, dp1 );\n\
					vec3 T = dp2perp * duv1.x + dp1perp * duv2.x;\n\
					vec3 B = dp2perp * duv1.y + dp1perp * duv2.y;\n\
					#else\n\
					vec3 T = vec3(1.0,0.0,0.0); //this is wrong but its a fake solution\n\
					vec3 B = cross(N,T);\n\
					T = cross(B,N);\n\
					#endif\n\
					 \n\
					// construct a scale-invariant frame \n\
					float invmax = inversesqrt( max( dot(T,T), dot(B,B) ) );\n\
					return mat3( T * invmax, B * invmax, N );\n\
				}\n\
				\n\
				vec3 perturbNormal( vec3 N, vec3 V, vec2 texcoord, vec3 normal_pixel )\n\
				{\n\
					#ifdef USE_POINTS\n\
						return N;\n\
					#endif\n\
					\n\
					// assume N, the interpolated vertex normal and \n\
					// V, the view vector (vertex to eye)\n\
					//vec3 normal_pixel = texture2D(normalmap, texcoord ).xyz;\n\
					normal_pixel = normal_pixel * 255./127. - 128./127.;\n\
					mat3 TBN = cotangent_frame(N, V, texcoord);\n\
					return normalize(TBN * normal_pixel);\n\
				}\n\
		");

ONE.Shaders.registerSnippet("bumpNormal","\n\
				\n\
				// Calculate the surface normal using screen-space partial derivatives of the height field\n\
				vec3 bumpNormal(vec3 position, vec3 normal, sampler2D texture, vec2 uvs, float factor)\n\
				{\n\
				#ifdef STANDARD_DERIVATIVES\n\
			        vec3 dpdx = dFdx(position);\n\
			        vec3 dpdy = dFdy(position);\n\
					vec3 r1 = cross(dpdy, normal);\n\
					vec3 r2 = cross(normal, dpdx);\n\
					\n\
					vec2 dtdx = dFdx(uvs) * factor;\n\
					vec2 dtdy = dFdy(uvs) * factor;\n\
					\n\
			        float h = texture2D( texture,  uvs ).r;\n\
			        float hdx = texture2D( texture,  uvs + dtdx ).r;\n\
			        float hdy = texture2D( texture,  uvs + dtdy ).r;\n\
					\n\
					return normalize(normal + (r1 * (hdx - h) - r2 * (hdy - h)) / dot(dpdx, r1));\n\
				#else\n\
					return normal;\n\
				#endif\n\
				}\n\
		");

ONE.Shaders.registerSnippet("testClippingPlane","\n\
			float testClippingPlane(vec4 plane, vec3 p)\n\
			{\n\
				if(plane.x == 0.0 && plane.y == 0.0 && plane.z == 0.0)\n\
					return 0.0;\n\
				return (dot(plane.xyz, p) - plane.w) / dot(plane.xyz,plane.xyz);\n\
			}\n\
	");

ONE.Shaders.registerSnippet("computePointSize","\n\
			float computePointSize(float radius, float w)\n\
			{\n\
				if(radius < 0.0)\n\
					return -radius;\n\
				return u_viewport.w * u_camera_perspective.z * radius / w;\n\
			}\n\
	");

ONE.Shaders.registerSnippet("vec3ToCubemap2D","\n\
	vec2 vec3ToCubemap2D( vec3 v )\n\
	{\n\
		vec3 abs_ = abs(v);\n\
		float max_ = max(max(abs_.x, abs_.y), abs_.z); // Get the largest component\n\
		vec3 weights = step(max_, abs_); // 1.0 for the largest component, 0.0 for the others\n\
		float sign_ = dot(weights, sign(v)) * 0.5 + 0.5; // 0 or 1\n\
		float sc = dot(weights, mix(vec3(v.z, v.x, -v.x), vec3(-v.z, v.x, v.x), sign_));\n\
	    float tc = dot(weights, mix(vec3(-v.y, -v.z, -v.y), vec3(-v.y, v.z, -v.y), sign_));\n\
	    vec2 uv = (vec2(sc, tc) / max_) * 0.5 + 0.5;\n\
		// Offset into the right region of the texture\n\
		float offsetY = dot(weights, vec3(1.0, 3.0, 5.0)) - sign_;\n\
		uv.y = (uv.y + offsetY) / 6.0;\n\
		return uv;\n\
	}\n\
");

//base blocks that behave more like booleans 

//used to have the BLOCK_FIRSTPASS macro
var firstpass_block = ONE.Shaders.firstpass_block = new ONE.ShaderBlock("firstPass");
firstpass_block.addCode( GL.FRAGMENT_SHADER, "", "" );
firstpass_block.register();

//used to have the BLOCK_LASTPASS macro
var lastpass_block = ONE.Shaders.lastpass_block = new ONE.ShaderBlock("lastPass");
lastpass_block.addCode( GL.FRAGMENT_SHADER, "", "" );
lastpass_block.register();

//used when a mesh contains color info by vertex
var vertex_color_block = ONE.Shaders.vertex_color_block = new ONE.ShaderBlock("vertex_color");
vertex_color_block.register();

//used when a mesh contains extra uv set
var coord1_block = ONE.Shaders.coord1_block = new ONE.ShaderBlock("coord1");
coord1_block.register();

//used when a mesh contains extra buffers
var extra2_block = ONE.Shaders.extra2_block = new ONE.ShaderBlock("extra2");
extra2_block.bindEvent("vs_attributes", "attribute vec2 a_extra2;\n");
extra2_block.register();

//used when a mesh contains extra buffers
var extra3_block = ONE.Shaders.extra3_block = new ONE.ShaderBlock("extra3");
extra3_block.bindEvent("vs_attributes", "attribute vec3 a_extra3;\n");
extra3_block.register();

//used when a mesh contains extra buffers
var extra4_block = ONE.Shaders.extra4_block = new ONE.ShaderBlock("extra4");
extra4_block.bindEvent("vs_attributes", "attribute vec4 a_extra4;\n");
extra4_block.register();

//used to render normalinfo to buffer
var normalbuffer_block = ONE.Shaders.normalbuffer_block = new ONE.ShaderBlock("normalBuffer");
normalbuffer_block.addCode( GL.FRAGMENT_SHADER, "", "" );
normalbuffer_block.register();

//used when a mesh contains extra buffers
var instancing_block = ONE.Shaders.instancing_block = new ONE.ShaderBlock("instancing");
instancing_block.register();

//@point size with perspective
var pointparticles_block = new ONE.ShaderBlock("pointparticles");
pointparticles_block.bindEvent("vs_final", "\n\
	gl_PointSize = u_point_size * u_viewport.w * u_camera_perspective.z / gl_Position.w;\n\
	#ifdef EXTRA2_BLOCK\n\
		gl_PointSize *= a_extra2.x;\n\
	#endif\n\
");
pointparticles_block.register();


ONE.Shaders.registerSnippet("snoise","\n\
//	Simplex 3D Noise \n\
//	by Ian McEwan, Ashima Arts\n\
vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}\n\
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}\n\
float snoise(vec3 v){ \n\
  const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;\n\
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);\n\
// First corner\n\
  vec3 i  = floor(v + dot(v, C.yyy) );\n\
  vec3 x0 =   v - i + dot(i, C.xxx) ;\n\
// Other corners\n\
  vec3 g = step(x0.yzx, x0.xyz);\n\
  vec3 l = 1.0 - g;\n\
  vec3 i1 = min( g.xyz, l.zxy );\n\
  vec3 i2 = max( g.xyz, l.zxy );\n\
  //  x0 = x0 - 0. + 0.0 * C \n\
  vec3 x1 = x0 - i1 + 1.0 * C.xxx;\n\
  vec3 x2 = x0 - i2 + 2.0 * C.xxx;\n\
  vec3 x3 = x0 - 1. + 3.0 * C.xxx;\n\
// Permutations\n\
  i = mod(i, 289.0 ); \n\
  vec4 p = permute( permute( permute( \n\
             i.z + vec4(0.0, i1.z, i2.z, 1.0 ))\n\
           + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) \n\
           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));\n\
// Gradients\n\
// ( N*N points uniformly over a square, mapped onto an octahedron.)\n\
  float n_ = 1.0/7.0; // N=7\n\
  vec3  ns = n_ * D.wyz - D.xzx;\n\
  vec4 j = p - 49.0 * floor(p * ns.z *ns.z);  //  mod(p,N*N)\n\
  vec4 x_ = floor(j * ns.z);\n\
  vec4 y_ = floor(j - 7.0 * x_ );    // mod(j,N)\n\
  vec4 x = x_ *ns.x + ns.yyyy;\n\
  vec4 y = y_ *ns.x + ns.yyyy;\n\
  vec4 h = 1.0 - abs(x) - abs(y);\n\
  vec4 b0 = vec4( x.xy, y.xy );\n\
  vec4 b1 = vec4( x.zw, y.zw );\n\
  vec4 s0 = floor(b0)*2.0 + 1.0;\n\
  vec4 s1 = floor(b1)*2.0 + 1.0;\n\
  vec4 sh = -step(h, vec4(0.0));\n\
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;\n\
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;\n\
  vec3 p0 = vec3(a0.xy,h.x);\n\
  vec3 p1 = vec3(a0.zw,h.y);\n\
  vec3 p2 = vec3(a1.xy,h.z);\n\
  vec3 p3 = vec3(a1.zw,h.w);\n\
//Normalise gradients\n\
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));\n\
  p0 *= norm.x;\n\
  p1 *= norm.y;\n\
  p2 *= norm.z;\n\
  p3 *= norm.w;\n\
// Mix final noise value\n\
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);\n\
  m = m * m;\n\
  return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), \n\
                                dot(p2,x2), dot(p3,x3) ) );\n\
}");