


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
	this._uid = LS.generateUId();
	this._dirty = true;

	//this.shader_name = null; //default shader
	this.color = new Float32Array([1.0,1.0,1.0]);
	this.opacity = 1.0;
	this.shader_name = "global";
	this.blend_mode = Blend.NORMAL;

	this.specular_factor = 0.1;
	this.specular_gloss = 10.0;

	//this.reflection_factor = 0.0;	

	//textures
	this.uvs_matrix = new Float32Array([1,0,0, 0,1,0, 0,0,1]);
	this.textures = {};

	if(o) 
		this.configure(o);
}

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
Material.COORDS_SCREEN = "screen";
Material.COORDS_POLAR = "polar";
Material.COORDS_POLAR_REFLECTED = "polar_reflected";
Material.COORDS_WORLDXZ = "worldxz";
Material.COORDS_WORLDXY = "worldxy";
Material.COORDS_WORLDYZ = "worldyz";

Material.TEXTURE_COORDINATES = [ Material.COORDS_UV0, Material.COORDS_UV1, Material.COORDS_UV_TRANSFORMED, Material.COORDS_SCREEN, Material.COORDS_POLAR, Material.COORDS_POLAR_REFLECTED, Material.COORDS_WORLDXY, Material.COORDS_WORLDXZ, Material.COORDS_WORLDYZ ];
Material.DEFAULT_UVS = { "normal":Material.COORDS_UV0, "displacement":Material.COORDS_UV0, "environment": Material.COORDS_POLAR_REFLECTED, "irradiance" : Material.COORDS_POLAR };

Material.available_shaders = ["default","lowglobal","phong_texture","flat","normal","phong","flat_texture","cell_outline"];
Material.texture_channels = [ Material.COLOR_TEXTURE, Material.OPACITY_TEXTURE, Material.AMBIENT_TEXTURE, Material.SPECULAR_TEXTURE, Material.EMISSIVE_TEXTURE, Material.ENVIRONMENT_TEXTURE ];


Material.prototype.applyToRenderInstance = function(ri)
{
	if(this.blend_mode != Blend.NORMAL)
		ri.flags |= RI_BLEND;

	if(this.blend_mode == Blend.CUSTOM && this.blend_func)
		ri.blend_func = this.blend_func;
	else
		ri.blend_func = BlendFunctions[ this.blend_mode ];
}

// RENDERING METHODS
Material.prototype.fillSurfaceShaderMacros = function(scene)
{
	var macros = {};

	//iterate through textures in the material
	for(var i in this.textures) 
	{
		var texture = this.getTexture(i);
		if(!texture) continue;
		var texture_uvs = this.textures[i + "_uvs"] || Material.DEFAULT_UVS[i] || "0";
		//special cases

		macros[ "USE_" + i.toUpperCase() + (texture.texture_type == gl.TEXTURE_2D ? "_TEXTURE" : "_CUBEMAP") ] = "uvs_" + texture_uvs;
	}

	//if(this.reflection_factor > 0.0) 
	//	macros.USE_REFLECTION = "";	

	//extra macros
	if(this.extra_macros)
		for(var im in this.extra_macros)
			macros[im] = this.extra_macros[im];

	this._macros = macros;
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

Material.prototype.fillSurfaceUniforms = function( scene, options )
{
	var uniforms = {};
	var samplers = [];

	uniforms.u_material_color = new Float32Array([this.color[0], this.color[1], this.color[2], this.opacity]);
	uniforms.u_ambient_color = scene.ambient_color;
	uniforms.u_diffuse_color = new Float32Array([1,1,1]);

	uniforms.u_specular = [ this.specular_factor, this.specular_gloss ];
	uniforms.u_texture_matrix = this.uvs_matrix;

	uniforms.u_reflection = this.reflection_factor;


	//iterate through textures in the material
	for(var i in this.textures) 
	{
		var texture = this.getTexture(i);
		if(!texture) continue;

		samplers.push([i + (texture.texture_type == gl.TEXTURE_2D ? "_texture" : "_cubemap") , texture]);
		//this._bind_textures.push([i + (texture.texture_type == gl.TEXTURE_2D ? "_texture" : "_cubemap") ,texture]);
		//uniforms[ i + (texture.texture_type == gl.TEXTURE_2D ? "_texture" : "_cubemap") ] = texture.bind( last_slot );
		var texture_uvs = this.textures[i + "_uvs"] || Material.DEFAULT_UVS[i] || "0";
		//last_slot += 1;

		if(texture.texture_type == gl.TEXTURE_2D && (texture_uvs == Material.COORDS_POLAR_REFLECTED || texture_uvs == Material.COORDS_POLAR))
		{
			texture.bind(0);
			texture.setParameter( gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE ); //to avoid going up
			texture.setParameter( gl.TEXTURE_MIN_FILTER, gl.LINEAR ); //avoid ugly error in atan2 edges
		}
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

	/*	//cloneObject(o, this);
	for(var i in o)
	{
		var v = o[i];
		var r = null;
		switch(i)
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
				r = v; 
				break;
			//vectors
			case "color": 
				r = new Float32Array(v); 
				break;
			case "textures":
				this.textures = o.textures;
				continue;
			case "transparency": //special cases
				this.opacity = 1 - v;
			default:
				continue;
		}
		this[i] = r;
	}

	if(o.uvs_matrix && o.uvs_matrix.length == 9)
		this.uvs_matrix = new Float32Array(o.uvs_matrix);
	*/
}

/**
* Serialize this material 
* @method serialize
* @return {Object} object with the serialization info
*/
Material.prototype.serialize = function()
{
	 var o = cloneObject(this);
	 o.material_class = getObjectClassName(this);
	 return o;
}


/**
* Clone this material (keeping the class)
* @method clone
* @return {Material} Material instance
*/
Material.prototype.clone = function()
{
	return new this.constructor( JSON.parse( JSON.stringify( this.serialize() )) );
}

/**
* Loads and assigns a texture to a channel
* @method loadAndSetTexture
* @param {Texture || url} texture_or_filename
* @param {String} channel
*/
Material.prototype.loadAndSetTexture = function(texture_or_filename, channel, options)
{
	options = options || {};
	channel = channel || Material.COLOR_TEXTURE;
	var that = this;
	//if(!this.material) this.material = new Material();

	if( typeof(texture_or_filename) === "string" ) //it could be the url or the internal texture name 
	{
		if(texture_or_filename[0] != ":")//load if it is not an internal texture
			ResourcesManager.load(texture_or_filename,options, function(texture) {
				that.setTexture(texture, channel);
				if(options.on_complete)
					options.on_complete();
			});
		else
			this.setTexture(texture_or_filename, channel);
	}
	else //otherwise just assign whatever
	{
		this.setTexture(texture_or_filename, channel);
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
		o["tex_" + textures[i]] = "Texture";
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
			this.textures = cloneObject(value);
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
* Assigns a texture to a channel
* @method setTexture
* @param {Texture} texture
* @param {String} channel default is COLOR
*/
Material.prototype.setTexture = function(texture, channel, uvs) {
	channel = channel || Material.COLOR_TEXTURE;
	if(texture)
	{
		this.textures[channel] = texture;
		if(uvs)	this.textures[channel + "_uvs"] = uvs;
	}
	else
	{
		delete this.textures[channel];
		delete this.textures[channel + "_uvs"];
	}

	if(!texture) return;
	if(texture.constructor == String && texture[0] != ":")
		ResourcesManager.load(texture);
}

/**
* Returns a texture from a channel
* @method setTexture
* @param {String} channel default is COLOR
* @return {Texture}
*/
Material.prototype.getTexture = function(channel) {
	var v = this.textures[channel];
	if(!v) return null;
	if(v.constructor == String)
		return ResourcesManager.textures[v];
	else if(v.constructor == Texture)
		return v;
	return null;
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
		if(typeof(this.textures[i]) == "string" && i.substr(-4) != "_uvs") //ends in this string
			res[ this.textures[i] ] = Texture;
	return res;
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

LS.registerMaterialClass(Material);
LS.Material = Material;