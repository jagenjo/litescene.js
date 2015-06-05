function SurfaceMaterial(o)
{
	this.name = "";
	this.uid = LS.generateUId("MAT-");
	this._dirty = true;

	this.shader_name = "surface";

	//this.shader_name = null; //default shader
	this._color = new Float32Array([1.0,1.0,1.0,1.0]);
	this.blend_mode = Blend.NORMAL;

	this.vs_code = "";
	this.code = "void surf(in Input IN, inout SurfaceOutput o) {\n\
	o.Albedo = vec3(1.0) * IN.color.xyz;\n\
	o.Normal = IN.worldNormal;\n\
	o.Emission = vec3(0.0);\n\
	o.Specular = 1.0;\n\
	o.Gloss = 40.0;\n\
	o.Reflectivity = 0.0;\n\
	o.Alpha = IN.color.a;\n}\n";

	this._uniforms = {};
	this._macros = {};

	this.properties = []; //array of configurable properties
	this.uvs_matrix = new Float32Array([1,0,0, 0,1,0, 0,0,1]);
	this.textures = {};
	if(o) 
		this.configure(o);

	this.flags = 0;

	this.computeCode();
}

SurfaceMaterial.icon = "mini-icon-material.png";
SurfaceMaterial.coding_help = "\
struct Input {\n\
	vec4 color;\n\
	vec3 vertex;\n\
	vec3 normal;\n\
	vec2 uv;\n\
	vec2 uv1;\n\
	\n\
	vec3 camPos;\n\
	vec3 viewDir;\n\
	vec3 worldPos;\n\
	vec3 worldNormal;\n\
	vec4 screenPos;\n\
};\n\
\n\
struct SurfaceOutput {\n\
	vec3 Albedo;\n\
	vec3 Normal;\n\
	vec3 Emission;\n\
	float Specular;\n\
	float Gloss;\n\
	float Alpha;\n\
	float Reflectivity;\n\
};\n\
";

SurfaceMaterial.prototype.onCodeChange = function()
{
	this.computeCode();
}

SurfaceMaterial.prototype.getCode = function()
{
	return this.code;
}

SurfaceMaterial.prototype.computeCode = function()
{
	var uniforms_code = "";
	for(var i in this.properties)
	{
		var code = "uniform ";
		var prop = this.properties[i];
		switch(prop.type)
		{
			case 'number': code += "float "; break;
			case 'vec2': code += "vec2 "; break;
			case 'vec3': code += "vec3 "; break;
			case 'vec4':
			case 'color':
			 	code += "vec4 "; break;
			case 'texture': code += "sampler2D "; break;
			case 'cubemap': code += "samplerCube "; break;
			default: continue;
		}
		code += prop.name + ";";
		uniforms_code += code;
	}

	var lines = this.code.split("\n");
	for(var i in lines)
		lines[i] = lines[i].split("//")[0]; //remove comments

	this.surf_code = uniforms_code + lines.join("");
}

// RENDERING METHODS
SurfaceMaterial.prototype.onModifyMacros = function(macros)
{
	if(this._ps_uniforms_code)
	{
		if(macros.USE_PIXEL_SHADER_UNIFORMS)
			macros.USE_PIXEL_SHADER_UNIFORMS += this._ps_uniforms_code;
		else
			macros.USE_PIXEL_SHADER_UNIFORMS = this._ps_uniforms_code;
	}

	if(this._ps_functions_code)
	{
		if(macros.USE_PIXEL_SHADER_FUNCTIONS)
			macros.USE_PIXEL_SHADER_FUNCTIONS += this._ps_functions_code;
		else
			macros.USE_PIXEL_SHADER_FUNCTIONS = this._ps_functions_code;
	}

	if(this._ps_code)
	{
		if(macros.USE_PIXEL_SHADER_CODE)
			macros.USE_PIXEL_SHADER_CODE += this._ps_code;
		else
			macros.USE_PIXEL_SHADER_CODE = this._ps_code;	
	}

	macros.USE_SURFACE_SHADER = this.surf_code;
}

SurfaceMaterial.prototype.fillSurfaceShaderMacros = function(scene)
{
	var macros = {};
	this._macros = macros;
	if( this.textures["environment"] )
	{
		var sampler = this.textures["environment"];
		var tex = LS.getTexture( sampler.texture );
		if(tex)
			this._macros[ "USE_ENVIRONMENT_" + (tex.type == gl.TEXTURE_2D ? "TEXTURE" : "CUBEMAP") ] = sampler.uvs;
	}
}


SurfaceMaterial.prototype.fillSurfaceUniforms = function( scene, options )
{
	var samplers = {};

	for(var i in this.properties)
	{
		var prop = this.properties[i];
		if(prop.type == "texture" || prop.type == "cubemap" || prop.type == "sampler")
		{
			if(!prop.value)
				continue;

			var tex_name = prop.type == "sampler" ? prop.value.texture : prop.value;
			var texture = LS.getTexture( tex_name );
			if(!texture)
				texture = ":missing";
			samplers[ prop.name ] = texture;
		}
		else
			this._uniforms[ prop.name ] = prop.value;
	}

	this._uniforms.u_material_color = this.color;

	if(this.textures["environment"])
	{
		var sampler = this.textures["environment"];
		var texture = LS.getTexture( sampler.texture );
		if(texture)
			samplers[ "environment" + (texture.texture_type == gl.TEXTURE_2D ? "_texture" : "_cubemap") ] = sampler;
	}

	this._samplers = samplers;
}

SurfaceMaterial.prototype.configure = function(o) { 
	LS.cloneObject(o, this);
	this.computeCode();
}

/**
* gets all the properties and its types
* @method getProperties
* @return {Object} object with name:type
*/
SurfaceMaterial.prototype.getProperties = function()
{
	var o = {
		color:"vec3",
		opacity:"number",
		shader_name: "string",
		blend_mode: "number",
		code: "string"
	};

	//from this material
	for(var i in this.properties)
	{
		var prop = this.properties[i];
		o[prop.name] = prop.type;
	}	

	return o;
}

/**
* Event used to inform if one resource has changed its name
* @method onResourceRenamed
* @param {Object} resources object where all the resources are stored
* @return {Texture}
*/
SurfaceMaterial.prototype.onResourceRenamed = function (old_name, new_name, resource)
{
	//global
	Material.prototype.onResourceRenamed.call( this, old_name, new_name, resource );

	//specific
	for(var i in this.properties)
	{
		var prop = this.properties[i];
		if( prop.value == old_name)
			prop.value = new_name;
	}
}


/**
* gets all the properties and its types
* @method getProperty
* @return {Object} object with name:type
*/
SurfaceMaterial.prototype.getProperty = function(name)
{
	if(this[name])
		return this[name];

	if( name.substr(0,4) == "tex_")
	{
		var tex = this.textures[ name.substr(4) ];
		if(!tex) return null;
		return tex.texture;
	}

	for(var i in this.properties)
	{
		var prop = this.properties[i];
		if(prop.name == name)
			return prop.value;
	}	

	return null;
}

/**
* assign a value to a property in a safe way
* @method setProperty
* @param {Object} object to configure from
*/
SurfaceMaterial.prototype.setProperty = function(name, value)
{
	//redirect to base material
	if( Material.prototype.setProperty.call(this,name,value) )
		return true;

	for(var i in this.properties)
	{
		var prop = this.properties[i];
		if(prop.name != name)
			continue;
		prop.value = value;
		return true;
	}

	return false;
}


SurfaceMaterial.prototype.getTextureChannels = function()
{
	var channels = [];

	for(var i in this.properties)
	{
		var prop = this.properties[i];
		if(prop.type != "texture" && prop.type != "cubemap" && prop.type != "sampler" )
			continue;
		channels.push( prop.name );
	}

	return channels;
}

/**
* Assigns a texture to a channel
* @method setTexture
* @param {String} channel 
* @param {Texture} texture
*/
SurfaceMaterial.prototype.setTexture = function( channel, texture, sampler_options ) {
	if(!channel)
		throw("SurfaceMaterial.prototype.setTexture channel must be specified");

	var sampler = null;


	//special case
	if(channel == "environment")
		return Material.prototype.setTexture.call(this, channel, texture, sampler_options );

	for(var i = 0; i < this.properties.length; ++i)
	{
		var prop = this.properties[i];
		if(prop.type != "texture" && prop.type != "cubemap" && prop.type != "sampler")
			continue;

		if(channel && prop.name != channel) //assign to the channel or if there is no channel just to the first one
			continue;

		//assign sampler
		sampler = this.textures[ channel ];
		if(!sampler)
			sampler = this.textures[channel] = { texture: texture, uvs: "0", wrap: 0, minFilter: 0, magFilter: 0 }; //sampler

		if(sampler_options)
			for(var i in sampler_options)
				sampler[i] = sampler_options[i];

		prop.value = prop.type == "sampler" ? sampler : texture;
		break;
	}

	//preload texture
	if(texture && texture.constructor == String && texture[0] != ":")
		LS.ResourcesManager.load( texture );

	return sampler;
}

/**
* Collects all the resources needed by this material (textures)
* @method getResources
* @param {Object} resources object where all the resources are stored
* @return {Texture}
*/
SurfaceMaterial.prototype.getResources = function (res)
{
	for(var i in this.properties)
	{
		var prop = this.properties[i];
		if(prop.type != "texture" && prop.type != "cubemap" && prop.type != "sampler")
			continue;
		if(!prop.value)
			continue;

		var texture = prop.type == "sampler" ? prop.value.texture : prop.value;
		if( typeof( texture ) == "string" )
			res[ texture ] = GL.Texture;
	}

	return res;
}


LS.registerMaterialClass( SurfaceMaterial );
LS.SurfaceMaterial = SurfaceMaterial;