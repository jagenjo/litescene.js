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
	this.ambient = new Float32Array([1.0,1.0,1.0]);
	this.diffuse = new Float32Array([1.0,1.0,1.0]);
	this.emissive = new Float32Array([0.0,0.0,0.0]);
	this.backlight_factor = 0;
	this.specular_factor = 0.1;
	this.specular_gloss = 10.0;
	this.specular_ontop = false;
	this.reflection_factor = 0.0;
	this.reflection_fresnel = 1.0;
	this.reflection_additive = false;
	this.reflection_specular = false;
	this.velvet = new Float32Array([0.5,0.5,0.5]);
	this.velvet_exp = 0.0;
	this.velvet_additive = false;
	this.detail = [0.0,10,10];
	this.uvs_matrix = new Float32Array([1,0,0, 0,1,0, 0,0,1]);
	this.extra_factor = 0.0; //used for debug and dev
	this.extra_color = new Float32Array([0.0,0.0,0.0]); //used for debug and dev
	this.blending = Material.NORMAL;
	this.normalmap_factor = 1.0;
	this.displacementmap_factor = 0.1;
	this.bumpmap_factor = 1.0;

	this.textures = {};
	this.extra_uniforms = {};

	if(o) 
		this.configure(o);
}

Material.icon = "mini-icon-material.png";

//Material flags
Material.NORMAL = "normal";
Material.ADDITIVE_BLENDING = "additive";

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
* Blending mode, it could be Material.NORMAL or Material.ADDITIVE_BLENDING
* @property blending
* @type {String}
* @default Material.NORMAL
*/
Material.BLENDING = "blending";

/**
* Ambient color: amount of ambient light reflected by the object
* @property ambient
* @type {vec3}
* @default [1,1,1]
*/
Material.AMBIENT = "ambient";
/**
* Diffuse color: amount of diffuse light reflected by the object
* @property diffuse
* @type {vec3}
* @default [1,1,1]
*/
Material.DIFFUSE = "diffuse";
/**
* Backlight factor: amount of light that can be seen through the surface.
* @property backlight_factor
* @type {number}
* @default 0
*/
Material.BACKLIGHT_FACTOR = "backlight_factor";

/**
* Emissive color: amount of emissive light emited from the surface
* @property emissive
* @type {vec3}
* @default [0,0,0]
*/
Material.EMISSIVE = "emissive";
/**
* Specular factor: amount of specular light reflected
* @property specular_factor
* @type {number}
* @default 0.1
*/
Material.SPECULAR_FACTOR = "specular_factor";
/**
* Specular glossiness: the glossines (exponent) of specular light
* @property specular_gloss
* @type {number}
* @default 10
*/
Material.SPECULAR_GLOSS = "specular_gloss";
/**
* Specular on top: if the specular spots should be on top or multiplyed by the surface color
* @property specular_ontop
* @type {boolean}
* @default false
*/
Material.SPECULAR_ON_TOP = "specular_ontop";
/**
* How reflectance is the surface 
* @property reflection_factor
* @type {number}
* @default 0
*/
Material.REFLECTION_FACTOR = "reflection_factor";
/**
* Fresnel coeficient (exp) of reflectance
* @property reflection_fresnel
* @type {number}
* @default 0
*/
Material.REFLECTION_FRESNEL = "reflection_fresnel";
/**
* It controls if the reflection is interpolated or blended with the surface color
* @property reflection_additive
* @type {boolean}
* @default false
*/
Material.REFLECTION_ADDITIVE = "reflection_additive";
/**
* It controls if the reflection factor is affected by the specular factor
* @property reflection_specular
* @type {boolean}
* @default false
*/
Material.REFLECTION_SPECULAR = "reflection_specular";
/**
* velvet color
* @property velvet
* @type {vec3}
* @default [0,0,0]
*/
Material.VELVET = "velvet";
Material.VELVET_EXP = "velvet_exp";
Material.VELVET_ADDITIVE = "velvet_additive";

Material.NORMALMAP_FACTOR = "normalmap_factor";
Material.DISPLACEMENTMAP_FACTOR = "displacementmap_factor";

Material.OPACITY_TEXTURE = "opacity";	//used for baked GI
Material.AMBIENT_TEXTURE = "ambient";	//used for baked GI
Material.COLOR_TEXTURE = "color";	//material color
Material.SPECULAR_TEXTURE = "specular"; //defines specular factor and glossiness per pixel
Material.EMISSIVE_TEXTURE = "emissive"; //emissive pixels
Material.DETAIL_TEXTURE = "detail";		//secondary material color with texture matrix
Material.REFLECTIVITY_TEXTURE = "reflectivity"; //defines which areas are reflective
Material.ENVIRONMENT_TEXTURE = "environment"; //the environtment texture (2d or cubemap)
Material.NORMAL_TEXTURE = "normal";		//the normalmap
Material.BUMP_TEXTURE = "bump";		//displacement 
Material.DISPLACEMENT_TEXTURE = "displacement";		//displacement 
Material.IRRADIANCE_TEXTURE = "irradiance";	//the irradiance texture (2d polar or cubemap)
Material.EXTRA_TEXTURE = "extra";	//used for own shader
//Material.TEXTURE_CHANNELS = [ "color","opacity", "ambient", "specular", "emissive", "detail", "normal", "reflectivity","environment", "irradiance" ];
Material.TEXTURE_CHANNELS = [ Material.COLOR_TEXTURE, Material.OPACITY_TEXTURE, Material.AMBIENT_TEXTURE, Material.SPECULAR_TEXTURE, Material.EMISSIVE_TEXTURE, Material.DETAIL_TEXTURE, Material.NORMAL_TEXTURE, Material.DISPLACEMENT_TEXTURE, Material.BUMP_TEXTURE, Material.REFLECTIVITY_TEXTURE, Material.ENVIRONMENT_TEXTURE, Material.IRRADIANCE_TEXTURE, Material.EXTRA_TEXTURE ];

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

Material.available_shaders = ["default","lowglobalshader","phong_texture","flat","normal","phong","flat_texture","cell_outline"];

//not used yet
Material.prototype.setDirty = function()
{
	this._dirty_macros = this._dirty_uniforms = true;
}

// RENDERING METHODS
Material.prototype.fillSurfaceShaderMacros = function(scene)
{
	var macros = {};

	//iterate through textures in the scene (environment and irradiance)
	for(var i in scene.textures)
	{
		var texture = Material.prototype.getTexture.call(scene, i); //hack
		if(!texture) continue;

		if(i == "environment")
			if(this.reflection_factor <= 0) continue;
		var texture_uvs = this.textures[i + "_uvs"] || Material.DEFAULT_UVS[i] || "0";
		macros[ "USE_" + i.toUpperCase() + (texture.texture_type == gl.TEXTURE_2D ? "_TEXTURE" : "_CUBEMAP") ] = "uvs_" + texture_uvs;
	}

	//iterate through textures in the material
	for(var i in this.textures) 
	{
		var texture = this.getTexture(i);
		if(!texture) continue;
		var texture_uvs = this.textures[i + "_uvs"] || Material.DEFAULT_UVS[i] || "0";
		//special cases
		if(i == "environment")
		{
			if(this.reflection_factor <= 0) 
				continue;
		}
		else if(i == "normal")
		{
			if(this.normalmap_factor != 0.0 && (!this.normalmap_tangent || (this.normalmap_tangent && gl.derivatives_supported)) )
			{
				macros.USE_NORMAL_TEXTURE = "uvs_" + texture_uvs;
				if(this.normalmap_factor != 0.0)
					macros.USE_NORMALMAP_FACTOR = "";
				if(this.normalmap_tangent && gl.derivatives_supported)
					macros.USE_TANGENT_NORMALMAP = "";
			}
			continue;
		}
		else if(i == "displacement")
		{
			if(this.displacementmap_factor != 0.0 && gl.derivatives_supported )
			{
				macros.USE_DISPLACEMENT_TEXTURE = "uvs_" + texture_uvs;
				if(this.displacementmap_factor != 1.0)
					macros.USE_DISPLACEMENTMAP_FACTOR = "";
			}
			continue;
		}
		else if(i == "bump")
		{
			if(this.bump_factor != 0.0 && gl.derivatives_supported )
			{
				macros.USE_BUMP_TEXTURE = "uvs_" + texture_uvs;
				if(this.bumpmap_factor != 1.0)
					macros.USE_BUMPMAP_FACTOR = "";
			}
			continue;
		}
		macros[ "USE_" + i.toUpperCase() + (texture.texture_type == gl.TEXTURE_2D ? "_TEXTURE" : "_CUBEMAP") ] = "uvs_" + texture_uvs;
	}

	if(this.velvet && this.velvet_exp) //first light only
		macros.USE_VELVET = "";
	if(this.emissive_material)
		macros.USE_EMISSIVE_MATERIAL = "";
	if(this.specular_ontop)
		macros.USE_SPECULAR_ONTOP = "";
	if(this.specular_on_alpha)
		macros.USE_SPECULAR_ON_ALPHA = "";
	if(this.reflection_specular)
		macros.USE_SPECULAR_IN_REFLECTION = "";
	if(this.backlight_factor > 0.001)
		macros.USE_BACKLIGHT = "";

	//extra macros
	if(this.extra_macros)
		for(var im in this.extra_macros)
			macros[im] = this.extra_macros[im];

	this._macros = macros;
}

//Fill with info about the light
// This is hard to precompute and reuse because here macros depend on the node (receive_shadows?), on the scene (shadows enabled?), on the material (contant diffuse?) 
// and on the light itself
Material.prototype.getLightShaderMacros = function(light, node, scene, options)
{
	var macros = {};

	var use_shadows = scene.settings.enable_shadows && light.cast_shadows && light._shadowMap && light._lightMatrix != null && !options.shadows_disabled;

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
		macros.USE_PROJECTIVE_LIGHT = "";

	if(vec3.squaredLength( light.color ) < 0.001 || node.flags.ignore_lights)
		macros.USE_AMBIENT_ONLY = "";

	if(light.offset > 0.001)
		macros.USE_LIGHT_OFFSET = "";

	if(use_shadows && node.flags.receive_shadows != false)
	{
		macros.USE_SHADOW_MAP = "";
		if(light.hard_shadows)
			macros.USE_HARD_SHADOWS = "";
		if(light._shadowMap && light._shadowMap.texture_type == gl.TEXTURE_CUBE_MAP)
			macros.USE_SHADOW_CUBEMAP = "";

		macros.SHADOWMAP_OFFSET = "";
	}

	return macros;
}

/*
Material.prototype.getSceneShaderMacros = function( scene, options )
{
	var macros = scene._macros;
	//camera info
	if(options.camera.type == Camera.ORTHOGRAPHIC)
		macros.USE_ORTHOGRAPHIC_CAMERA = "";

	if(options.clipping_plane)
		macros.USE_CLIPPING_PLANE = "";

	if(options.brightness_factor && options.brightness_factor != 1)
		macros.USE_BRIGHTNESS_FACTOR = "";

	if(options.colorclip_factor)
		macros.USE_COLORCLIP_FACTOR = "";
}
*/

Material.prototype.fillSurfaceUniforms = function( scene, options )
{
	var uniforms = {};
	var samplers = [];

	uniforms.u_material_color = new Float32Array([this.color[0], this.color[1], this.color[2], this.opacity]);
	//uniforms.u_ambient_color = node.flags.ignore_lights ? [1,1,1] : [scene.ambient_color[0] * this.ambient[0], scene.ambient_color[1] * this.ambient[1], scene.ambient_color[2] * this.ambient[2]];
	uniforms.u_ambient_color = vec3.fromValues(scene.ambient_color[0] * this.ambient[0], scene.ambient_color[1] * this.ambient[1], scene.ambient_color[2] * this.ambient[2]);
	uniforms.u_diffuse_color = this.diffuse;
	uniforms.u_emissive_color = this.emissive || vec3.create();
	uniforms.u_specular = [ this.specular_factor, this.specular_gloss ];
	uniforms.u_reflection_info = [ (this.reflection_additive ? -this.reflection_factor : this.reflection_factor), this.reflection_fresnel ];
	uniforms.u_backlight_factor = this.backlight_factor;
	uniforms.u_normalmap_factor = this.normalmap_factor;
	uniforms.u_displacementmap_factor = this.displacementmap_factor;
	uniforms.u_bumpmap_factor = this.bumpmap_factor;
	uniforms.u_velvet_info = new Float32Array([ this.velvet[0], this.velvet[1], this.velvet[2], (this.velvet_additive ? this.velvet_exp : -this.velvet_exp) ]);
	uniforms.u_detail_info = this.detail;

	uniforms.u_texture_matrix = this.uvs_matrix;

	//iterate through textures in the scene (environment and irradiance)
	for(var i in scene.textures)
	{
		var texture = Material.prototype.getTexture.call(scene, i); //hack
		if(!texture) continue;

		samplers.push([i + (texture.texture_type == gl.TEXTURE_2D ? "_texture" : "_cubemap") , texture]);
		//uniforms[ i + (texture.texture_type == gl.TEXTURE_2D ? "_texture" : "_cubemap") ] = this._bind_textures.length - 1;//texture.bind( last_slot );
		//uniforms[ i + (texture.texture_type == gl.TEXTURE_2D ? "_texture" : "_cubemap") ] = texture;
		//last_slot += 1;

		if(i == "environment")
		{
			if(this.reflection_factor <= 0) continue;
		}

		var texture_uvs = this.textures[i + "_uvs"] || Material.DEFAULT_UVS[i] || "0";
		if(texture_uvs == Material.COORDS_POLAR_REFLECTED || texture_uvs == Material.COORDS_POLAR)
		{
			texture.bind(0);
			texture.setParameter( gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE ); //to avoid going up
			texture.setParameter( gl.TEXTURE_MIN_FILTER, gl.LINEAR ); //avoid ugly error in atan2 edges
		}
	}

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

		//special cases
		if(i == "environment")
			if(this.reflection_factor <= 0) continue;
		else if(i == "normal")
			continue;
		else if(i == "displacement")
			continue;
		else if(i == "bump")
			continue;
		else if(i == "irradiance")
		{
			texture.bind(0);
			texture.setParameter( gl.TEXTURE_MIN_FILTER, gl.LINEAR );
			texture.setParameter( gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE );
			texture.setParameter( gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE );
			//texture.min_filter = gl.GL_LINEAR;
		}

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
	this._samplers = samplers;
}

//hard to precompute, it uses the instance.matrix to compute lightMatrix, it also binds the textures
Material.prototype.fillLightUniforms = function( iLight, light, instance, options)
{
	var uniforms = {};
	//var samplers = [];

	var use_shadows = light.cast_shadows && light._shadowMap && light._lightMatrix != null && !options.shadows_disabled;

	var light_projective_texture = light.projective_texture;
	if(light_projective_texture && light_projective_texture.constructor == String)
		light_projective_texture = ResourcesManager.textures[light_projective_texture];

	var shadowmap_size = use_shadows ? (light._shadowMap.width) : 1024;
	if(light.type == Light.DIRECTIONAL || light.type == Light.SPOT)
		uniforms.u_light_front = light.getFront();
	if(light.type == Light.SPOT)
		uniforms.u_light_angle = [ light.angle * DEG2RAD, light.angle_end * DEG2RAD, Math.cos( light.angle * DEG2RAD * 0.5 ), Math.cos( light.angle_end * DEG2RAD * 0.5 ) ];

	uniforms.u_light_pos = light.getPosition();
	uniforms.u_light_color = vec3.scale( uniforms.u_light_color || vec3.create(), light.color, light.intensity );
	uniforms.u_light_att = [light.att_start,light.att_end];
	uniforms.u_light_offset = light.offset;

	if(light._lightMatrix)
		uniforms.u_lightMatrix = mat4.multiply( uniforms.u_lightMatrix || mat4.create(), light._lightMatrix, instance.matrix );

	//texture
	if(light_projective_texture)
		//samplers.push(["light_texture", light_projective_texture]); //fixed slot
		uniforms.light_texture = light_projective_texture.bind(11); //fixed slot

	//use shadows?
	if(use_shadows)
	{
		uniforms.u_shadow_params = [ 1.0 / light._shadowMap.width, light.shadow_bias ];
		uniforms.shadowMap = light._shadowMap.bind(10); //fixed slot
		//samplers.push(["shadowMap", light._shadowMap]);
	}

	//return [uniforms, samplers];
	return uniforms;
}




/**
* Configure the material getting the info from the object
* @method configure
* @param {Object} object to configure from
*/
Material.prototype.configure = function(o)
{
	//cloneObject(o, this);
	for(var i in o)
	{
		var v = o[i];
		var r = null;
		switch(i)
		{
			//numbers
			case "opacity": 
			case "backlight_factor":
			case "specular_factor":
			case "specular_gloss":
			case "reflection_factor":
			case "reflection_fresnel":
			case "velvet_exp":
			case "velvet_additive":
			case "blending":
			case "normalmap_factor":
			case "displacementmap_factor":
			case "extra_factor":
			//strings
			case "shader_name":
			//bools
			case "specular_ontop":
			case "normalmap_tangent":
			case "reflection_specular":
				r = v; 
				break;
			//vectors
			case "color": 
			case "ambient":	
			case "diffuse": 
			case "emissive": 
			case "velvet":
			case "detail":
			case "extra_color":
				r = new Float32Array(v); 
				break;
			case "textures":
				this.textures = o.textures;
				continue;
			case "transparency": //special cases
				this.opacity = 1 - v;
			case "extra_uniforms":
				this.extra_uniforms = LS.cloneObject(v);
			default:
				continue;
		}
		this[i] = r;
	}

	if(o.uvs_matrix && o.uvs_matrix.length == 9)
		this.uvs_matrix = new Float32Array(o.uvs_matrix);
}

/**
* Serialize this material 
* @method serialize
* @return {Object} object with the serialization info
*/
Material.prototype.serialize = function()
{
	 var o = cloneObject(this);
	 return o;
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
			ResourcesManager.loadImage(texture_or_filename,options, function(texture) {
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
		ResourcesManager.loadImage(texture);
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
		ResourcesManager.loadImage( res[i] );
}

//not implemented yet
Material.prototype.getRenderer = function()
{
	return this.renderer || Renderer._default_renderer;
}

/**
* Register this material in a materials pool to be shared with other nodes
* @method registerMaterial
* @param {String} name name given to this material, it must be unique
*/
Material.prototype.registerMaterial = function(name)
{
	this.name = name;
	Scene.materials[name] = this;
	this.material = name;
}

LS.Material = Material;