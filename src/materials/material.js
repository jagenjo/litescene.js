


//Material class **************************
/* Warning: a material is not a component, because it can be shared by multiple nodes */

/**
* Material class contains all the info about how a mesh should be rendered, more in a highlevel format.
* Most of the info is Colors, factors and Textures but it can also specify a shader or some flags.
* Materials could be shared among different objects.
* @namespace LS
* @class Material
* @constructor
* @param {String} object to configure from
*/

function Material(o)
{
	this.name = "";
	this.uid = LS.generateUId("MAT-");
	this._dirty = true;

	//this.shader_name = null; //default shader
	this._color = new Float32Array([1.0,1.0,1.0,1.0]);
	this.createProperty("diffuse", new Float32Array([1.0,1.0,1.0]), "color" );
	this.shader_name = "global";
	this.blend_mode = LS.Blend.NORMAL;

	this._specular_data = vec2.fromValues( 0.1, 10.0 );

	//this.reflection_factor = 0.0;	

	//textures
	this.uvs_matrix = new Float32Array([1,0,0, 0,1,0, 0,0,1]);
	this.textures = {};

	this._query = new ShaderQuery();

	//properties with special storage (multiple vars shared among single properties)

	Object.defineProperty( this, 'color', {
		get: function() { return this._color.subarray(0,3); },
		set: function(v) { vec3.copy( this._color, v ); },
		enumerable: true
	});

	Object.defineProperty( this, 'opacity', {
		get: function() { return this._color[3]; },
		set: function(v) { this._color[3] = v; },
		enumerable: true
	});

	Object.defineProperty( this, 'specular_factor', {
		get: function() { return this._specular_data[0]; },
		set: function(v) { this._specular_data[0] = v; },
		enumerable: true
	});

	Object.defineProperty( this, 'specular_gloss', {
		get: function() { return this._specular_data[1]; },
		set: function(v) { this._specular_data[1] = v; },
		enumerable: true
	});

	if(o) 
		this.configure(o);
}

Material["@color"] = { type:"color" };
Material["@blend_mode"] = { type: "enum", values: LS.Blend };

Material.icon = "mini-icon-material.png";


//material info attributes, use this to avoid errors when settings the attributes of a material

/**
* Surface color
* @property color
* @type {vec3}
* @default [1,1,1]
*/
Material.COLOR = "color";
/**
* Opacity. It must be < 1 to enable alpha sorting. If it is <= 0 wont be visible.
* @property opacity
* @type {number}
* @default 1
*/
Material.OPACITY = "opacity";

/**
* Blend mode, it could be any of Blend options (NORMAL,ALPHA, ADD, SCREEN)
* @property blend_mode
* @type {String}
* @default Blend.NORMAL
*/
Material.BLEND_MODE = "blend_mode";

Material.SPECULAR_FACTOR = "specular_factor";
/**
* Specular glossiness: the glossines (exponent) of specular light
* @property specular_gloss
* @type {number}
* @default 10
*/
Material.SPECULAR_GLOSS = "specular_gloss";


Material.OPACITY_TEXTURE = "opacity";	//used for baked GI
Material.COLOR_TEXTURE = "color";	//material color
Material.AMBIENT_TEXTURE = "ambient";
Material.SPECULAR_TEXTURE = "specular"; //defines specular factor and glossiness per pixel
Material.EMISSIVE_TEXTURE = "emissive";
Material.ENVIRONMENT_TEXTURE = "environment";

Material.COORDS_UV0 = "0";
Material.COORDS_UV1 = "1";
Material.COORDS_UV_TRANSFORMED = "transformed";
Material.COORDS_SCREEN = "screen";					//project to screen space
Material.COORDS_SCREENCENTERED = "screen_centered";	//project to screen space and centers and corrects aspect
Material.COORDS_FLIPPED_SCREEN = "flipped_screen";	//used for realtime reflections
Material.COORDS_POLAR = "polar";					//use view vector as polar coordinates
Material.COORDS_POLAR_REFLECTED = "polar_reflected";//use reflected view vector as polar coordinates
Material.COORDS_POLAR_VERTEX = "polar_vertex";		//use normalized vertex as polar coordinates
Material.COORDS_WORLDXZ = "worldxz";
Material.COORDS_WORLDXY = "worldxy";
Material.COORDS_WORLDYZ = "worldyz";

Material.TEXTURE_COORDINATES = [ Material.COORDS_UV0, Material.COORDS_UV1, Material.COORDS_UV_TRANSFORMED, Material.COORDS_SCREEN, Material.COORDS_SCREENCENTERED, Material.COORDS_FLIPPED_SCREEN, Material.COORDS_POLAR, Material.COORDS_POLAR_REFLECTED, Material.COORDS_POLAR_VERTEX, Material.COORDS_WORLDXY, Material.COORDS_WORLDXZ, Material.COORDS_WORLDYZ ];
Material.DEFAULT_UVS = { "normal":Material.COORDS_UV0, "displacement":Material.COORDS_UV0, "environment": Material.COORDS_POLAR_REFLECTED, "irradiance" : Material.COORDS_POLAR };

Material.available_shaders = ["default","global","lowglobal","phong_texture","flat","normal","phong","flat_texture","cell_outline"];
Material.texture_channels = [ Material.COLOR_TEXTURE, Material.OPACITY_TEXTURE, Material.AMBIENT_TEXTURE, Material.SPECULAR_TEXTURE, Material.EMISSIVE_TEXTURE, Material.ENVIRONMENT_TEXTURE ];

Material.prototype.applyToRenderInstance = function(ri)
{
	if(this.blend_mode != LS.Blend.NORMAL)
		ri.flags |= RI_BLEND;

	if(this.blend_mode == LS.Blend.CUSTOM && this.blend_func)
		ri.blend_func = this.blend_func;
	else
		ri.blend_func = LS.BlendFunctions[ this.blend_mode ];
}

// RENDERING METHODS
Material.prototype.fillShaderQuery = function(scene)
{
	var query = this._query;
	query.clear();

	//iterate through textures in the material
	for(var i in this.textures) 
	{
		var sampler = this.getTextureSampler(i);
		if(!sampler)
			continue;
		var uvs = sampler.uvs || Material.DEFAULT_UVS[i] || "0";

		var texture = Material.getTextureFromSampler( sampler );
		if(!texture) //loading or non-existant
			continue;

		query.macros[ "USE_" + i.toUpperCase() + (texture.texture_type == gl.TEXTURE_2D ? "_TEXTURE" : "_CUBEMAP") ] = "uvs_" + uvs;
	}

	//if(this.reflection_factor > 0.0) 
	//	macros.USE_REFLECTION = "";	

	//extra macros
	if(this.extra_macros)
		for(var im in this.extra_macros)
			query.macros[im] = this.extra_macros[im];
}

//Fill with info about the light
// This is hard to precompute and reuse because here macros depend on the node (receive_shadows?), on the scene (shadows enabled?), on the material (contant diffuse?) 
// and on the light itself
/*
Material.prototype.getLightShaderMacros = function(light, node, scene, render_options)
{
	var macros = {};

	var use_shadows = light.cast_shadows && light._shadowmap && light._light_matrix != null && !render_options.shadows_disabled;

	//light macros
	if(light.use_diffuse && !this.constant_diffuse)
		macros.USE_DIFFUSE_LIGHT = "";
	if(light.use_specular && this.specular_factor > 0)
		macros.USE_SPECULAR_LIGHT = "";
	if(light.type == Light.DIRECTIONAL)
		macros.USE_DIRECTIONAL_LIGHT = "";
	else if(light.type == Light.SPOT)
		macros.USE_SPOT_LIGHT = "";
	if(light.spot_cone)
		macros.USE_SPOT_CONE = "";
	if(light.linear_attenuation)
		macros.USE_LINEAR_ATTENUATION = "";
	if(light.range_attenuation)
		macros.USE_RANGE_ATTENUATION = "";

	var light_projective_texture = light.projective_texture;
	if(light_projective_texture && light_projective_texture.constructor == String)
		light_projective_texture = ResourcesManager.textures[light_projective_texture];

	if(light_projective_texture)
	{
		macros.USE_PROJECTIVE_LIGHT = "";
		if(light_projective_texture.texture_type == gl.TEXTURE_CUBE_MAP)
			macros.USE_PROJECTIVE_LIGHT_CUBEMAP = "";
	}

	var light_average_texture = light.average_texture;
	if(light_average_texture && light_average_texture.constructor == String)
		light_average_texture = ResourcesManager.textures[light_average_texture];
	if(light_average_texture)
		macros.USE_TEXTURE_AVERAGE_LIGHT = "";

	//if(vec3.squaredLength( light.color ) < 0.001 || node.flags.ignore_lights)
	//	macros.USE_IGNORE_LIGHT = "";

	if(light.offset > 0.001)
		macros.USE_LIGHT_OFFSET = "";

	if(use_shadows && node.flags.receive_shadows != false)
	{
		macros.USE_SHADOW_MAP = "";
		if(light._shadowmap && light._shadowmap.texture_type == gl.TEXTURE_CUBE_MAP)
			macros.USE_SHADOW_CUBEMAP = "";
		if(light.hard_shadows || macros.USE_SHADOW_CUBEMAP != null)
			macros.USE_HARD_SHADOWS = "";

		macros.SHADOWMAP_OFFSET = "";
	}

	return macros;
}
*/

Material.prototype.fillUniforms = function( scene, options )
{
	var uniforms = {};
	var samplers = {};

	uniforms.u_material_color = this._color;
	uniforms.u_ambient_color = scene.info ? scene.info.ambient_color : this._diffuse;
	uniforms.u_diffuse_color = this._diffuse;

	uniforms.u_specular = this._specular_data;
	uniforms.u_texture_matrix = this.uvs_matrix;

	uniforms.u_reflection = this.reflection_factor;

	//iterate through textures in the material
	for(var i in this.textures) 
	{
		var texture_info = this.getTextureSampler(i);
		if(!texture_info) continue;

		var texture = Material.getTextureFromSampler( texture_info );
		if(!texture) //loading or non-existant
			continue;

		samplers[ i + (texture.texture_type == gl.TEXTURE_2D ? "_texture" : "_cubemap") ] = texture_info;
	}

	//add extra uniforms
	for(var i in this.extra_uniforms)
		uniforms[i] = this.extra_uniforms[i];

	this._uniforms = uniforms;
	this._samplers = samplers; //samplers without fixed slot
}

/**
* Configure the material getting the info from the object
* @method configure
* @param {Object} object to configure from
*/
Material.prototype.configure = function(o)
{
	for(var i in o)
		this.setProperty( i, o[i] );
}

/**
* Serialize this material 
* @method serialize
* @return {Object} object with the serialization info
*/
Material.prototype.serialize = function()
{
	 var o = LS.cloneObject(this);
	 o.material_class = LS.getObjectClassName(this);
	 return o;
}


/**
* Clone this material (keeping the class)
* @method clone
* @return {Material} Material instance
*/
Material.prototype.clone = function()
{
	var data = this.serialize();
	if(data.uid)
		delete data.uid;
	return new this.constructor( JSON.parse( JSON.stringify( data )) );
}

/**
* Loads and assigns a texture to a channel
* @method loadAndSetTexture
* @param {Texture || url} texture_or_filename
* @param {String} channel
*/
Material.prototype.loadAndSetTexture = function(channel, texture_or_filename, options)
{
	options = options || {};
	var that = this;
	//if(!this.material) this.material = new Material();

	if( typeof(texture_or_filename) === "string" ) //it could be the url or the internal texture name 
	{
		if(texture_or_filename[0] != ":")//load if it is not an internal texture
			LS.ResourcesManager.load(texture_or_filename,options, function(texture) {
				that.setTexture(channel, texture);
				if(options.on_complete)
					options.on_complete();
			});
		else
			this.setTexture(channel, texture_or_filename);
	}
	else //otherwise just assign whatever
	{
		this.setTexture(channel, texture_or_filename);
		if(options.on_complete)
			options.on_complete();
	}
}

/**
* gets all the properties and its types
* @method getProperties
* @return {Object} object with name:type
*/
Material.prototype.getProperties = function()
{
	var o = {
		color:"vec3",
		opacity:"number",
		shader_name: "string",
		blend_mode: "number",
		specular_factor:"number",
		specular_gloss:"number",
		uvs_matrix:"mat3"
	};

	var textures = this.getTextureChannels();
	for(var i in textures)
		o["tex_" + textures[i]] = "Sampler";
	return o;
}

/**
* gets all the properties and its types
* @method getProperty
* @return {Object} object with name:type
*/
Material.prototype.getProperty = function(name)
{
	if(name.substr(0,4) == "tex_")
		return this.textures[ name.substr(4) ];
	return this[name];
}


/**
* gets all the properties and its types
* @method getProperty
* @return {Object} object with name:type
*/
Material.prototype.setProperty = function(name, value)
{
	if(name.substr(0,4) == "tex_")
	{
		this.textures[ name.substr(4) ] = value;
		return true;
	}

	switch(name)
	{
		//numbers
		case "opacity": 
		case "specular_factor":
		case "specular_gloss":
		case "reflection": 
		case "blend_mode":
		//strings
		case "shader_name":
		//bools
			this[name] = value; 
			break;
		//vectors
		case "uvs_matrix":
		case "color": 
			if(this[name].length == value.length)
				this[name].set( value );
			break;
		case "textures":
			//legacy
			for(var i in value)
			{
				var tex = value[i];
				if(typeof(tex) == "string")
					tex = { texture: tex, uvs: "0", wrap: 0, minFilter: 0, magFilter: 0 };
				this.textures[i] = tex;
			}
			//this.textures = cloneObject(value);
			break;
		case "transparency": //special cases
			this.opacity = 1 - value;
			break;
		default:
			return false;
	}
	return true;
}

/**
* gets all the texture channels supported by this material
* @method getTextureChannels
* @return {Array} array with the name of every channel supported by this material
*/
Material.prototype.getTextureChannels = function()
{
	if(this.constructor.texture_channels)
		return this.constructor.texture_channels;
	return [];
}

/**
* Assigns a texture to a channel and its sampling parameters
* @method setTexture
* @param {String} channel for a list of supported channels by this material call getTextureChannels()
* @param {Texture} texture
* @param {Object} sampler_options
*/
Material.prototype.setTexture = function( channel, texture, sampler_options ) {
	if(!channel)
		throw("Material.prototype.setTexture channel must be specified");

	if(!texture)
	{
		delete this.textures[channel];
		return;
	}

	var sampler = this.textures[channel];
	if(!sampler)
		this.textures[channel] = sampler = { texture: texture, uvs: Material.DEFAULT_UVS[channel] || "0", wrap: 0, minFilter: 0, magFilter: 0 };
	else if(sampler.texture == texture)
		return sampler;
	else
		sampler.texture = texture;

	if(sampler_options)
		for(var i in sampler_options)
			sampler[i] = sampler_options[i];

	if(texture.constructor === String && texture[0] != ":")
		LS.ResourcesManager.load(texture);

	return sampler;
}

/**
* Set a property of the sampling (wrap, uvs, filter)
* @method setTextureProperty
* @param {String} channel for a list of supported channels by this material call getTextureChannels()
* @param {String} property could be "uvs", "filter", "wrap"
* @param {*} value the value, for uvs check Material.TEXTURE_COORDINATES, filter is gl.NEAREST or gl.LINEAR and wrap gl.CLAMP_TO_EDGE, gl.MIRROR or gl.REPEAT
*/
Material.prototype.setTextureProperty = function( channel, property, value )
{
	var sampler = this.textures[channel];

	if(!sampler)
	{
		if(property == "texture")
			this.textures[channel] = sampler = { texture: value, uvs: Material.DEFAULT_UVS[channel] || "0", wrap: 0, minFilter: 0, magFilter: 0 };
		return;
	}

	sampler[ property ] = value;
}

/**
* Returns the texture in a channel
* @method getTexture
* @param {String} channel default is COLOR
* @return {Texture}
*/
Material.prototype.getTexture = function( channel ) {
	channel = channel || Material.COLOR_TEXTURE;

	var v = this.textures[channel];
	if(!v) 
		return null;

	if(v.constructor === String)
		return LS.ResourcesManager.textures[v];

	var tex = v.texture;
	if(!tex)
		return null;
	if(tex.constructor === String)
		return LS.ResourcesManager.textures[tex];
	else if(tex.constructor == Texture)
		return tex;
	return null;
}

/**
* Returns the texture sampler info of one texture channel (filter, wrap, uvs)
* @method getTextureSampler
* @param {String} channel get available channels using getTextureChannels
* @return {Texture}
*/
Material.prototype.getTextureSampler = function(channel) {
	return this.textures[ channel ];
}

Material.getTextureFromSampler = function(sampler)
{
	var texture = sampler.constructor === String ? sampler : sampler.texture;
	if(!texture) //weird case
		return null;

	//fetch
	if(texture.constructor === String)
		texture = LS.ResourcesManager.textures[ texture ];
	
	if (!texture || texture.constructor != Texture)
		return null;
	return texture;
}

/**
* Assigns a texture sampler to one texture channel (filter, wrap, uvs)
* @method setTextureInfo
* @param {String} channel default is COLOR
* @param {Object} sampler { texture, uvs, wrap, filter }
*/
Material.prototype.setTextureSampler = function(channel, sampler) {
	if(!sampler)
		delete this.textures[ channel ];
	else
		this.textures[ channel ] = sampler;
}

/**
* Collects all the resources needed by this material (textures)
* @method getResources
* @param {Object} resources object where all the resources are stored
* @return {Texture}
*/
Material.prototype.getResources = function (res)
{
	for(var i in this.textures)
	{
		var sampler = this.textures[i];
		if(!sampler) 
			continue;
		if(typeof(sampler.texture) == "string")
			res[ sampler.texture ] = GL.Texture;
	}
	return res;
}

/**
* Event used to inform if one resource has changed its name
* @method onResourceRenamed
* @param {Object} resources object where all the resources are stored
* @return {Texture}
*/
Material.prototype.onResourceRenamed = function (old_name, new_name, resource)
{
	for(var i in this.textures)
	{
		var sampler = this.textures[i];
		if(!sampler)
			continue;
		if(sampler.texture == old_name)
			sampler.texture = new_name;
	}
}

/**
* Loads all the textures inside this material, by sending the through the ResourcesManager
* @method loadTextures
*/

Material.prototype.loadTextures = function ()
{
	var res = this.getResources({});
	for(var i in res)
		LS.ResourcesManager.load( i );
}

/**
* Register this material in a materials pool to be shared with other nodes
* @method registerMaterial
* @param {String} name name given to this material, it must be unique
*/
Material.prototype.registerMaterial = function(name)
{
	this.name = name;
	LS.ResourcesManager.registerResource(name, this);
	this.material = name;
}

Material.prototype.getCategory = function()
{
	return this.category || "Material";
}

Material.prototype.updatePreview = function(size, options)
{
	options = options || {};

	var res = {};
	this.getResources(res);

	for(var i in res)
	{
		var resource = LS.ResourcesManager.resources[i];
		if(!resource)
		{
			console.warn("Cannot generate preview with resources missing.");
			return null;
		}
	}

	if(LS.GlobalScene.info.textures.environment)
		options.environment = LS.GlobalScene.info.textures.environment;

	size = size || 256;
	var preview = LS.Renderer.renderMaterialPreview( this, size, options );
	this.preview = preview;
	if(preview.toDataURL)
		this.preview_url = preview.toDataURL("image/png");
}

Material.prototype.getLocator = function()
{
	if(this._root)
		return this._root.uid + "/material";
	return this.uid;
}

Material.processShaderCode = function(code)
{
	var lines = code.split("\n");
	for(var i in lines)
		lines[i] = lines[i].split("//")[0]; //remove comments
	code = lines.join("");
	if(!code)
		return null;
	return code;
}

Material.prototype.createProperty = function( name, value, type )
{
	if(type)
		this.constructor[ "@" + name ] = { type: type };

	//basic type
	if(value.constructor === Number || value.constructor === String || value.constructor === Boolean)
	{
		this[ name ] = value;
		return;
	}

	//vector type
	if(value.constructor === Float32Array)
	{
		var private_name = "_" + name;
		value = new Float32Array( value ); //clone
		this[ private_name ] = value; //this could be removed...

		Object.defineProperty( this, name, {
			get: function() { return value; },
			set: function(v) { value.set( v ); },
			enumerable: true
		});
	}
}


LS.registerMaterialClass(Material);
LS.Material = Material;