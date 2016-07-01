/* Basic shader manager 
	- Allows to load all shaders from XML
	- Allows to use a global shader
*/

//************************************
/**
* ShadersManager is the static class in charge of loading, compiling and storing shaders for reuse.
*
* @class ShadersManager
* @namespace LS
* @constructor
*/

var ShadersManager = {

	default_xml_url: "data/shaders.xml",

	snippets: {},//to save source snippets
	shader_blocks: {},//to save shader block
	compiled_programs: {}, //shaders already compiled and ready to use
	compiled_shaders: {}, //every vertex and fragment shader compiled

	global_shaders: {}, //shader codes to be compiled using some macros
	templates: {}, //WIP

	default_shader: null, //a default shader to rely when a shader is not found
	dump_compile_errors: true, //dump errors in console
	on_compile_error: null, //callback 

	num_shaderblocks: 0, //used to know the index

	/**
	* Initializes the shader manager
	*
	* @method init
	* @param {string} url a url to a shaders.xml can be specified to load the shaders
	*/
	init: function(url, ignore_cache)
	{
		//set a default shader 
		this.default_shader = null;

		//storage
		this.compiled_programs = {};
		this.compiled_shaders = {};
		this.global_shaders = {};

		//this.shader_blocks = {};//do not initialize, or we will loose all

		//base intro code for shaders
		this.global_extra_code = String.fromCharCode(10) + "#define WEBGL" + String.fromCharCode(10);

		//compile some shaders
		this.createDefaultShaders();

		//if a shader is not found, the default shader is returned, in this case a flat shader
		this.default_shader = this.get("flat");

		url = url || this.default_xml_url;
		this.last_shaders_url = url;
		this.loadFromXML(url, false, ignore_cache);
	},

	/**
	* Reloads the XML file with the shaders, useful when editing the file
	*
	* @method reloadShaders
	* @param {function} on_complete call when the shaders have been reloaded
	*/
	reloadShaders: function(on_complete)
	{
		this.loadFromXML( this.last_shaders_url, true,true, on_complete);
	},

	/**
	* Resolves a shader query, returns the shader
	*
	* @method resolve
	* @param {ShaderQuery} query
	* @return {GL.Shader} the shader, if not found the default shader is returned
	*/
	resolve: function( query )
	{
		return this.get( query.name, query.macros );
	},

	/**
	* Clears all the compiled shaders
	*
	* @method clearCache
	*/
	clearCache: function()
	{
		this.compiled_programs = {};
		this.compiled_shaders = {};
	},

	/**
	* Returns a compiled shader with this id and this macros
	*
	* @method get
	* @param {string} id
	* @param {string} macros
	* @return {GL.Shader} the shader, if not found the default shader is returned
	*/
	get: function( id, macros )
	{
		if(!id)
			return this.default_shader;

		//if there is no macros, just get the old one
		if(!macros)
		{
			var shader = this.compiled_programs[id];
			if (shader)
				return shader;
		}

		var global = this.global_shaders[id];

		if (global == null)
			return this.default_shader;

		var key = id + ":";
		var extracode = "";

		if(global.num_macros != 0)
		{
			//generate unique key
			for (var macro in macros)
			{
				if (global.macros[ macro ])
				{
					key += macro + "=" + macros[macro] + ":";
					extracode += String.fromCharCode(10) + "#define " + macro + " " + macros[macro] + String.fromCharCode(10); //why not "\n"??????
				}
			}//for macros
		}

		//hash key
		var hashkey = key.hashCode();

		//already compiled
		if (this.compiled_programs[hashkey] != null)
			return this.compiled_programs[hashkey];

		var start_time = 0;
		if (this.debug)
			start_time = getTime();

		//compile and store it
		var vs_code = extracode + global.vs_code;
		var fs_code = extracode + global.fs_code;

		//expand code
		if(global.imports)
		{
			var already_imported = {}; //avoid to import two times the same code to avoid collisions

			var replace_import = function(v)
			{
				var token = v.split("\"");
				var id = token[1];
				if( already_imported[ id ] )
					return "//already imported: " + id + "\n";
				var snippet = ShadersManager.snippets[id];
				already_imported[id] = true;
				if(snippet)
					return snippet.code;
				return "//snippet not found: " + id + "\n";
			}

			vs_code = vs_code.replace(/#import\s+\"(\w+)\"\s*\n/g, replace_import );
			already_imported = {}; //clear
			fs_code	= fs_code.replace(/#import\s+\"(\w+)\"\s*\n/g, replace_import);
		}

		var shader = this.compileShader( vs_code, fs_code, key );
		if(shader)
			shader.global = global;

		if(this.debug)
			console.log("Time creating shader:", (getTime() - start_time).toFixed(3), "ms");

		return this.registerCompiledShader(shader, hashkey, id);
	},

	/**
	* Returns the info of a global shader
	*
	* @method getGlobalShaderInfo
	* @param {string} id
	* @return {Object} shader info (code, macros supported, flags)
	*/
	getGlobalShaderInfo: function(id)
	{
		return this.global_shaders[id];
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
	compileShader: function( vs_code, fs_code, name )
	{
		if(!name)
			throw("compileShader must have a name specified");

		if(!gl)
			return null;
		var shader = null;
		try
		{
			vs_code = this.global_extra_code + vs_code;
			fs_code = this.global_extra_code + fs_code;

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

	dumpShaderError: function( name, err, vs_code, fs_code )
	{
		console.error("Error compiling shader: " + name);
		console.log(err);
		console.groupCollapsed("Vertex Shader Code");
		//console.log("VS CODE\n************");
		var lines = (this.global_extra_code + vs_code).split("\n");
		for(var i in lines)
			console.log(i + ": " + lines[i]);
		console.groupEnd();

		console.groupCollapsed("Fragment Shader Code");
		//console.log("FS CODE\n************");
		lines = (this.global_extra_code + fs_code).split("\n");
		for(var i in lines)
			console.log(i + ": " + lines[i]);
		console.groupEnd();
	},

	/**
	* Stores a compiled shader program, so it can be reused
	*
	* @method registerCompiledShader
	* @param {GL.Shader} shader the compiled shader
	* @param {string} key unique id 
	* @param {string} id the shader name
	* @return {GL.Shader} shader
	*/
	registerCompiledShader: function(shader, key, id)
	{
		if(shader == null)
		{
			this.compiled_programs[key] = this.default_shader;
			return this.default_shader;
		}

		shader.id = id;
		shader.key = key;
		this.compiled_programs[key] = shader;
		return shader;
	},

	/**
	* Loads shaders code from an XML file
	*
	* @method loadFromXML
	* @param {string} url to the shaders file
	* @param {boolean} reset_old to reset all the existing shaders once loaded
	* @param {boolean} ignore_cache force to ignore web cache 
	* @param {function} on_complete callback once the file has been loaded and processed
	*/
	loadFromXML: function (url, reset_old, ignore_cache, on_complete)
	{
		var nocache = ignore_cache ? "?nocache=" + getTime() + Math.floor(Math.random() * 1000) : "";
		LS.Network.request({
		  url: url + nocache,
		  dataType: 'xml',
		  success: function(response){
				console.log("Shaders XML loaded: " + url);
				if(reset_old)
				{
					LS.ShadersManager.global_shaders = {};
					LS.ShadersManager.compiled_programs = {};
					LS.ShadersManager.compiled_shaders = {};
				}
				LS.ShadersManager.processShadersXML(response);
				if(on_complete)
					on_complete();
		  },
		  error: function(err){
			  console.log("Error parsing Shaders XML: " + err);
			  throw("Error parsing Shaders XML: " + err);
		  }
		});	
	},

	/**
	* extracts all the shaders from the XML doc
	*
	* @method processShadersXML
	* @param {XMLDocument} xml
	*/
	processShadersXML: function(xml)
	{
		//get shaders
		var shaders = xml.querySelectorAll('shader');
		
		for(var i in shaders)
		{
			var shader_element = shaders[i];
			if(!shader_element || !shader_element.attributes) continue;

			var id = shader_element.attributes["id"];
			if(!id) continue;
			id = id.value;

			var vs_code = "";
			var fs_code = "";

			//read all the supported macros
			var macros_str = "";
			var macros_attr = shader_element.attributes["macros"];
			if(macros_attr)
				macros_str += macros_attr.value;

			var macros_xml = shader_element.querySelector("macros");
			if(macros_xml)
				macros_str += macros_xml.textContent;

			var macros_array = macros_str.split(",");
			var macros = {};
			for(var i in macros_array)
				macros[ macros_array[i].trim() ] = true;

			//read the shaders code
			vs_code = shader_element.querySelector("code[type='vertex_shader']").textContent;
			fs_code = shader_element.querySelector("code[type='pixel_shader']").textContent;

			if(!vs_code || !fs_code)
			{
				console.log("no code in shader: " + id);
				continue;
			}

			var options = {};

			var multipass = shader_element.getAttribute("multipass");
			if(multipass)
				options.multipass = (multipass == "1" || multipass == "true");
			var imports = shader_element.getAttribute("imports");
			if(imports)
				options.imports = (imports == "1" || imports == "true");
			var events = shader_element.getAttribute("events");
			if(events)
				options.events = (events == "1" || events == "true");

			LS.ShadersManager.registerGlobalShader( vs_code, fs_code, id, macros, options );
		}

		var snippets = xml.querySelectorAll('snippet');
		for(var i = 0; i < snippets.length; ++i)
		{
			var snippet = snippets[i];
			var id = snippet.getAttribute("id");
			var code = snippet.textContent;
			this.registerSnippet( id, code );
		}

		var templates = xml.querySelectorAll('template');
		for(var i = 0; i < templates.length; ++i)
		{
			var template = templates[i];
			var id = template.getAttribute("id");
			var vs_code = template.querySelector("code[type='vertex_shader']").textContent;
			var fs_code = template.querySelector("code[type='fragment_shader']").textContent;

			var vs_info = this.processTemplateCode( vs_code );
			var fs_info = this.processTemplateCode( fs_code );

			template[id] = {
				id: id,
				vs_info: vs_info,
				fs_info: fs_info
			}

			//console.log( template[id] );
		}

		this.ready = true;
	},
	
	//adds source code of a shader that could be compiled if needed
	//id: name
	//macros: supported macros by the shader
	/**
	* extracts all the shaders from the XML doc
	*
	* @method registerGlobalShader
	* @param {string} vs_code
	* @param {string} fs_code
	*/
	registerGlobalShader: function(vs_code, fs_code, id, macros, options )
	{
		//detect macros
		var macros_found = {};
		//TO DO using a regexp

		//count macros
		var num_macros = 0;
		for(var i in macros)
			num_macros += 1;

		//HACK for IE
		if(gl && !gl.extensions["WEBGL_draw_buffers"])
			fs_code = fs_code.replace("#extension GL_EXT_draw_buffers : enable", '');

		var global = { 
			vs_code: vs_code, 
			fs_code: fs_code,
			macros: macros,
			num_macros: num_macros
		};

		//add options
		if(options)
		{
			for(var i in options)
				global[i] = options[i];

			//process code
			if(options.events)
			{
				var replace_events = function(v)
				{
					var token = v.split("\"");
					var id = token[1];
					//console.log("Event: ",id);
					return "";
				}

				global.vs_code = vs_code.replace(/#event\s+\"(\w+)\"\s*\n/g, replace_events );
				global.fs_code = fs_code.replace(/#event\s+\"(\w+)\"\s*\n/g, replace_events);
			}
		}

		this.global_shaders[id] = global;
		LEvent.trigger( LS.ShadersManager, "newShader" );
		return global;
	},

	/*
	registerGlobalShader: function(vs_code, fs_code, id, macros, options )
	{
		//detect macros
		var macros_found = {};
		//TO DO using a regexp

		//count macros
		var num_macros = 0;
		for(var i in macros)
			num_macros += 1;

		var global = { 
			vs_code: vs_code, 
			fs_code: fs_code,
			macros: macros,
			num_macros: num_macros
		};

		//add options
		if(options)
		{
			for(var i in options)
				global[i] = options[i];

				var vs_areas = vs_code.split("#pragma");
				var fs_areas = fs_code.split("#pragma");
				

				global.vs_code = vs_code.replace(/#event\s+\"(\w+)\"\s*\n/g, replace_events );
				global.fs_code = fs_code.replace(/#event\s+\"(\w+)\"\s*\n/g, replace_events);
			}
		}

		this.global_shaders[id] = global;
		LEvent.trigger(ShadersManager,"newShader");
		return global;
	},
	*/


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

	registerShaderBlock: function(id, shader_block)
	{
		var block_id = -1;

		if( this.shader_blocks[id] )
		{
			console.warn("There is already a ShaderBlock with that name, replacing it: ", id);
			block_id = this.shader_blocks[id].flag_id;
		}
		else
			block_id = this.num_shaderblocks++;
		shader_block.flag_id = block_id;
		shader_block.flag_mask = 1<<block_id;
		this.shader_blocks[id] = shader_block;
	},

	getShaderBlock: function(id, shader_block)
	{
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
	",

	/**
	* Create some default shaders useful for generic situations (flat, texture and screenspace quad)
	*
	* @method createDefaultShaders
	* @param {string} id
	* @return {string} code
	*/
	createDefaultShaders: function()
	{
		//flat
		this.registerGlobalShader(this.common_vscode + '\
			void main() {\
				mat4 mvp = u_viewprojection * u_model;\
				gl_Position = mvp * vec4(a_vertex,1.0);\
			}\
			', this.common_fscode + '\
			uniform vec4 u_material_color;\
			void main() {\
			  gl_FragColor = vec4(u_material_color);\
			}\
		',"flat");

		//flat texture
		this.registerGlobalShader(this.common_vscode + '\
			varying vec2 v_uvs;\
			void main() {\n\
				v_uvs = a_coord;\n\
				mat4 mvp = u_viewprojection * u_model;\
				gl_Position = mvp * vec4(a_vertex,1.0);\
			}\
			', this.common_fscode + '\
			uniform vec4 u_material_color;\
			varying vec2 v_uvs;\
			uniform sampler2D texture;\
			void main() {\
				gl_FragColor = u_material_color * texture2D(texture,v_uvs);\
			}\
		',"texture_flat");

		this.registerGlobalShader(this.common_vscode + '\
			varying vec2 coord;\
			void main() {\
			coord = a_coord;\
			gl_Position = vec4(coord * 2.0 - 1.0, 0.0, 1.0);\
		}\
		', this.common_fscode + '\
			uniform sampler2D texture;\
			uniform vec4 color;\
			varying vec2 coord;\
			void main() {\
			gl_FragColor = texture2D(texture, coord) * color;\
			}\
		',"screen");
	},

	processTemplateCode: function( code )
	{
		//remove comments
		code = code.replace(/(\/\*([\s\S]*?)\*\/)|(\/\/(.*)$)/gm, '');

		var hooks = {};
		var parts = [];
		var current_part = [];

		var lines = code.split("\n");
		for(var i = 0; i < lines.length; i++)
		{
			var line = lines[i].trim();
			if(!line.length)
				continue;//empty line
			if(line[0] != "#")
			{
				current_part.push(line);
				continue;
			}

			var t = line.split(" ");
			if(t[0] == "#pragma")
			{
				switch(t[1])
				{
					case "import":
						if( current_part.length )
						{
							parts.push( [ "code", current_part.join("\n") ] );
							current_part = [];
						}
						parts.push( [ "import", t[3] ] );
						break;
					case "hook": 
						if( current_part.length )
						{
							parts.push( [ "code", current_part.join("\n") ] );
							current_part = [];
						}
						if( hooks[ t[3] ] !== undefined )
							console.warn("Hook already found in shader: " + t[3] );
						hooks[ t[3] ] = parts.length;
						parts.push( [ "hook", t[3] ] );
						break;
					default:
						current_part.push(line); //unknown pragma, pass it
				}
			}
			else
				current_part.push(line); //unknown macro, pass it
		}

		return {
			code: code,
			parts: parts,
			hooks: hooks
		};
	}
};

LS.SM = LS.ShadersManager = ShadersManager;


/**
* ShaderQuery is in charge of specifying info that must be taken into account when compiling a shader
*
* @class ShaderQuery
* @namespace LS
* @constructor
*/
function ShaderQuery( name, macros )
{
	this.name = name;
	this.macros = {}; //macros to add
	this.hooks = {}; //represent points where this shader want to insert code

	if(macros)
		for(var i in macros)
			this.macros[i] = macros[i];
}

ShaderQuery.prototype.clear = function()
{
	this.macros = {};
	this.hooks = {};
}

ShaderQuery.prototype.add = function( query )
{
	if(!query)
		return;

	//add macros
	for(var i in query.macros )
		this.macros[i] = query.macros[i];

	//add hooks
}

ShaderQuery.prototype.setMacro = function( name, value )
{
	this.macros[name] = value || "";
}

ShaderQuery.prototype.resolve = function()
{
	return LS.ShadersManager.resolve(this);
}

//ShaderQuery.prototype.addHook = function

LS.ShaderQuery = ShaderQuery;



//work in progress

function ShaderBlock( name )
{
	this.flag_id = -1;
	this.flag_mask = 0;
	if(!name)
		throw("ShaderBlock must have a name");
	this.name = name;
	this.code_map = new Map();
}

ShaderBlock.prototype.addCode = function( shader_type, enabled_code, disabled_code )
{
	this.code_map.set( shader_type, { enabled: enabled_code || "", disabled: disabled_code || ""} );
}

ShaderBlock.prototype.getCode = function( shader_type, block_flags )
{
	block_flags = block_flags || 0;
	var code = this.code_map.get( shader_type );
	if(!code)
		return null;
	return (block_flags | this.flag_mask) ? code.enabled : code.disabled;
}

ShaderBlock.prototype.register = function()
{
	LS.ShadersManager.registerShaderBlock(this.name, this);
}


LS.ShaderBlock = ShaderBlock;