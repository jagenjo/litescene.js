/* Basic shader manager 
	- Allows to load all shaders from XML
	- Allows to use a global shader
*/

var ShadersManager = {
	default_xml_url: "data/shaders.xml",

	snippets: {},//to save source snippets
	compiled_programs: {}, //shaders already compiled and ready to use
	compiled_shaders: {}, //every vertex and fragment shader compiled

	global_shaders: {}, //shader codes to be compiled using some macros

	default_shader: null, //a default shader to rely when a shader is not found
	dump_compile_errors: true, //dump errors in console
	on_compile_error: null, //callback 

	init: function(url, ignore_cache)
	{
		//set a default shader 
		this.default_shader = null;

		//storage
		this.compiled_programs = {};
		this.compiled_shaders = {};
		this.global_shaders = {};

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

	reloadShaders: function(on_complete)
	{
		this.loadFromXML( this.last_shaders_url, true,true, on_complete);
	},

	get: function( id, macros )
	{
		if(!id) return null;

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

		//compile and store it
		var vs_code = extracode + global.vs_code;
		var ps_code = extracode + global.ps_code;

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
			ps_code	= ps_code.replace(/#import\s+\"(\w+)\"\s*\n/g, replace_import);
		}

		var shader = this.compileShader( vs_code, ps_code, key );
		if(shader)
			shader.global = global;
		return this.registerCompiledShader(shader, hashkey, id);
	},

	getGlobalShaderInfo: function(id)
	{
		return this.global_shaders[id];
	},

	compileShader: function( vs_code, ps_code, name )
	{
		if(!gl) return null;
		var shader = null;
		try
		{
			vs_code = this.global_extra_code + vs_code;
			ps_code = this.global_extra_code + ps_code;

			//speed up compilations by caching shaders compiled
			var vs_shader = this.compiled_shaders[name + ":VS"];
			if(!vs_shader)
				vs_shader = this.compiled_shaders[name + ":VS"] = GL.Shader.compileSource(gl.VERTEX_SHADER, vs_code);
			var fs_shader = this.compiled_shaders[name + ":FS"];
			if(!fs_shader)
				fs_shader = this.compiled_shaders[name + ":FS"] = GL.Shader.compileSource(gl.FRAGMENT_SHADER, ps_code);

			shader = new GL.Shader(vs_shader, fs_shader);
			shader.name = name;
			//console.log("Shader compiled: " + name);
		}
		catch (err)
		{
			if(this.dump_compile_errors)
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
				//console.log("PS CODE\n************");
				lines = (this.global_extra_code + ps_code).split("\n");
				for(var i in lines)
					console.log(i + ": " + lines[i]);
				console.groupEnd();
				this.dump_compile_errors = false; //disable so the console dont get overflowed
			}

			if(this.on_compile_error)
				this.on_compile_error(err);

			return null;
		}
		return shader;
	},

	// given a compiled shader it caches it for later reuse
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

	//loads some shaders from an XML
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

	// process the XML to include the shaders
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
			var ps_code = "";

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
			ps_code = shader_element.querySelector("code[type='pixel_shader']").textContent;

			if(!vs_code || !ps_code)
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

			LS.ShadersManager.registerGlobalShader(vs_code, ps_code, id, macros, options );
		}

		var snippets = xml.querySelectorAll('snippet');
		for(var i = 0; i < snippets.length; ++i)
		{
			var snippet = snippets[i];
			var id = snippet.getAttribute("id");
			var code = snippet.textContent;
			this.registerSnippet( id, code );
		}

		this.ready = true;
	},
	
	//adds source code of a shader that could be compiled if needed
	//id: name
	//macros: supported macros by the shader
	registerGlobalShader: function(vs_code, ps_code, id, macros, options )
	{
		var macros_found = {};
		/*
		//TODO: missing #ifndef and #define
		//regexMap( /USE_\w+/g, vs_code + ps_code, function(v) {
		regexMap( /#ifdef\s\w+/g, vs_code + ps_code, function(v) {
			//console.log(v);
			macros_found[v[0].split(' ')[1]] = true;
		});
		*/
		/*
		var m = /USE_\w+/g.exec(vs_code + ps_code);
		if(m)
			console.log(m);
		*/

		var num_macros = 0;
		for(var i in macros)
			num_macros += 1;

		var global = { 
			vs_code: vs_code, 
			ps_code: ps_code,
			macros: macros,
			num_macros: num_macros,
			macros_found: macros_found
		};

		if(options)
			for(var i in options)
				global[i] = options[i];

		this.global_shaders[id] = global;
		LEvent.trigger(ShadersManager,"newShader");
		return global;
	},

	registerSnippet: function(id, code)
	{
		this.snippets[ id ] = { id: id, code: code };
	},

	getSnippet: function(id)
	{
		return this.snippets[ id ];
	},

	//this is global code for default shaders
	common_vscode: "\n\
		precision mediump float;\n\
		attribute vec3 a_vertex;\n\
		attribute vec3 a_normal;\n\
		attribute vec2 a_coord;\n\
		uniform mat4 u_mvp;\n\
	",
	common_pscode: "\n\
		precision mediump float;\n\
	",

	//some shaders for starters
	createDefaultShaders: function()
	{
		//flat
		this.registerGlobalShader(this.common_vscode + '\
			void main() {\
				gl_Position = u_mvp * vec4(a_vertex,1.0);\
			}\
			', this.common_pscode + '\
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
				gl_Position = u_mvp * vec4(a_vertex,1.0);\
			}\
			', this.common_pscode + '\
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
		', this.common_pscode + '\
			uniform sampler2D texture;\
			uniform vec4 color;\
			varying vec2 coord;\
			void main() {\
			gl_FragColor = texture2D(texture, coord) * color;\
			}\
		',"screen");
	}
};

LS.SM = LS.ShadersManager = ShadersManager;


//TODO
function ShaderQuery()
{
	this.name = "global";
	this.extra_streams = {};
	this.extra_uniforms = {};
	this.hooks = {};
}

ShaderQuery.prototype.resolve = function()
{
}
