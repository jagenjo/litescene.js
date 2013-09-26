/* Basic shader manager 
	- Allows to load all shaders from XML
	- Allows to use a global shader
	Dependencies: 
		- graphicsViewport.js
*/

var Shaders = {
	shaders: {},
	globals: {},
	default_shader: null,

	init: function(url, ignore_cache)
	{
		//set a default shader 
		this.shaders = {};
		this.globals = {};
		this.default_shader = null;

		this.global_extra_code = String.fromCharCode(10) + "#define WEBGL" + String.fromCharCode(10);

		this.createDefaultShaders();
		this.default_shader = this.get("flat");

		url = url ||"data/shaders.xml";
		this.last_shaders_url = url;
		this.loadFromXML(url, false, ignore_cache);
	},

	reloadShaders: function(on_complete)
	{
		this.loadFromXML( this.last_shaders_url, true,true, on_complete);
	},

	get: function(id, macros)
	{
		if(!id) return null;

		//if there is no macros, just get the old one
		if(!macros)
		{
			var shader = this.shaders[id];
			if (shader != null)
				return shader;
		}

		var global = this.globals[id];

		if (global == null)
			return this.default_shader;

		var key = id;
		var extracode = "";

		if(global.num_macros != 0)
		{
			//generate unique key
			if(macros)
			{
				key += ":";
				for (var macro in macros)
				{
					if (global.macros[ macro ])
					{
						key += macro + "=" + macros[macro] + ":";
						extracode += String.fromCharCode(10) + "#define " + macro + " " + macros[macro] + String.fromCharCode(10);
					}
				}
			}
		}

		//already compiled
		if (this.shaders[key] != null)
			return this.shaders[key];

		//compile and store it
		var vs_code = extracode + global.vs_code;
		var ps_code = extracode + global.ps_code;

		var shader = this.compileShader(vs_code, ps_code, key);
		if(shader)
			shader.global = global;
		return this.registerShader(shader, key, id);
	},

	getGlobalShaderInfo: function(id)
	{
		return this.globals[id];
	},

	compileShader: function(vs_code, ps_code, name)
	{
		if(!gl) return null;
		var shader = null;
		try
		{
			shader = new GL.Shader(this.global_extra_code + vs_code, this.global_extra_code + ps_code);
			shader.name = name;
			trace("Shader compiled: " + name);
		}
		catch (err)
		{
			trace("Error compiling shader: " + name);
			trace(err);
			trace("VS CODE\n************");
			var lines = (this.global_extra_code + vs_code).split("\n");
			for(var i in lines)
				trace(i + ": " + lines[i]);

			trace("PS CODE\n************");
			lines = (this.global_extra_code + ps_code).split("\n");
			for(var i in lines)
				trace(i + ": " + lines[i]);

			return null;
		}
		return shader;
	},

	// given a compiled shader it caches it for later reuse
	registerShader: function(shader, key, id)
	{
		if(shader == null)
		{
			this.shaders[key] = this.default_shader;
			return this.default_shader;
		}

		shader.id = id;
		shader.key = key;
		this.shaders[key] = shader;
		return shader;
	},

	loadFromXML: function (url, reset_old, ignore_cache, on_complete)
	{
		var nocache = ignore_cache ? "?nocache=" + new Date().getTime() + Math.floor(Math.random() * 1000) : "";
		LS.request({
		  url: url + nocache,
		  dataType: 'xml',
		  success: function(response){
				trace("Shaders XML loaded");
				if(reset_old)
				{
					Shaders.globals = {};
					Shaders.shaders = {};
				}
				Shaders.processShadersXML(response);
				if(on_complete)
					on_complete();
		  },
		  error: function(err){
			  trace("Error parsing Shaders XML: " + err);
			  throw("Error parsing Shaders XML: " + err);
		  }
		});	
	},

	processShadersXML: function(xml)
	{
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
			var macros = shader_element.attributes["macros"];
			if(macros)
				macros = macros.value.split(",");

			var _macros = {};
			for(var i in macros)
				_macros[macros[i]] = true;

			vs_code = shader_element.querySelector("code[type='vertex_shader']").textContent;
			ps_code = shader_element.querySelector("code[type='pixel_shader']").textContent;

			if(!vs_code || !ps_code)
			{
				trace("no code in shader: " + id);
				continue;
			}

			var multipass = shader_element.attributes["multipass"];
			if(multipass)
				multipass = (multipass.value == "1" || multipass.value == "true");
			else
				multipass = false;

			Shaders.addGlobalShader(vs_code,ps_code,id,_macros, multipass);
		}
	},
	
	//adds source code of a shader that could be compiled if needed
	//id: name
	//macros: supported macros by the shader
	addGlobalShader: function(vs_code, ps_code, id, macros, multipass )
	{
		var macros_found = {};
		/*
		//TODO: missing #ifndef and #define
		//regexMap( /USE_\w+/g, vs_code + ps_code, function(v) {
		regexMap( /#ifdef\s\w+/g, vs_code + ps_code, function(v) {
			//trace(v);
			macros_found[v[0].split(' ')[1]] = true;
		});
		*/
		/*
		var m = /USE_\w+/g.exec(vs_code + ps_code);
		if(m)
			trace(m);
		*/

		var num_macros = 0;
		for(var i in macros)
			num_macros += 1;

		var global = { 
			vs_code: vs_code, 
			ps_code: ps_code,
			macros: macros,
			num_macros: num_macros,
			macros_found: macros_found,
			multipass: multipass
		};
		this.globals[id] = global;
		return global;
	},

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

	//some default shaders for starters
	createDefaultShaders: function()
	{
		//flat
		this.addGlobalShader(this.common_vscode + '\
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
		this.addGlobalShader(this.common_vscode + '\
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

		//object space normals
		/*
		this.addGlobalShader(this.common_vscode + '\
			uniform mat4 u_normal_model;\n\
			varying vec3 v_normal;\n\
			\
			void main() {\
				v_normal = u_normal_model * vec3(a_normal,1.0);\n\
				gl_Position = u_mvp * vec4(a_vertex,1.0);\n\
			}\
			', this.common_pscode + '\
			varying vec3 v_normal;\
			void main() {\
				vec3 N = normalize(v_normal);\
				gl_FragColor = vec4(N.x, N.y, N.z, 1.0);\
			}\
		',"normal");
		*/

		this.addGlobalShader(this.common_vscode + '\
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
		//this.shaders["screen"].uniforms({color: [1,1,1,1]});

		this.addGlobalShader(this.common_vscode + '\
			varying vec4 v_pos;\
			void main() {\
				gl_Position = u_mvp * vec4(a_vertex,1.0);\
				v_pos = gl_Position;\
			}\
			', this.common_pscode + '\
			precision highp float;\
			varying vec4 v_pos;\
			vec3 PackDepth24(float depth)\
			{\
				float depthInteger = floor(depth);\
				float depthFraction = fract(depth);\
				float depthUpper = floor(depthInteger / 256.0);\
				float depthLower = depthInteger - (depthUpper * 256.0);\
				return vec3(depthUpper / 256.0, depthLower / 256.0, depthFraction);\
			}\
			\
			uniform vec4 u_material_color;\
			void main() {\
				vec4 color = vec4(0.0);\
				color.x = u_material_color.x; \
				float depth = v_pos.z / v_pos.w;\
			    color.yzw = PackDepth24(depth*256.0);\
			  gl_FragColor = color;\
			}\
		',"picking_depth");


	}
};

