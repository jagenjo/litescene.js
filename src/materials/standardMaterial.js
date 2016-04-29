


//StandardMaterial class **************************
/* Warning: a material is not a component, because it can be shared by multiple nodes */

/**
* StandardMaterial class improves the material class
* @namespace LS
* @class StandardMaterial
* @constructor
* @param {Object} object [optional] to configure from
*/

function StandardMaterial(o)
{
	Material.call(this,null); //do not pass the object, it is called later

	this.shader_name = "global";

	this.createProperty("ambient", new Float32Array([1.0,1.0,1.0]), "color" );
	this.createProperty("emissive", new Float32Array(3), "color" );
	//this.emissive = new Float32Array([0.0,0.0,0.0]);
	this.backlight_factor = 0;

	this._specular_data = vec2.fromValues( 0.1, 10.0 );
	this.specular_ontop = false;
	this.reflection_factor = 0.0;
	this.reflection_fresnel = 1.0;
	this.reflection_additive = false;
	this.reflection_specular = false;
	this.createProperty( "velvet", new Float32Array([0.5,0.5,0.5]), "color" );
	this.velvet_exp = 0.0;
	this.velvet_additive = false;
	this._velvet_info = vec4.create();
	this._detail = new Float32Array([0.0, 10, 10]);
	this._extra_data = vec4.create();

	this.normalmap_factor = 1.0;
	this.normalmap_tangent = true;
	this.displacementmap_factor = 0.1;
	this.bumpmap_factor = 1.0;
	this.use_scene_ambient = true;

	//used for special fx 
	this.extra_surface_shader_code = "";

	this.extra_uniforms = {};

	if(o) 
		this.configure(o);
}

Object.defineProperty( StandardMaterial.prototype, 'detail_factor', {
	get: function() { return this._detail[0]; },
	set: function(v) { this._detail[0] = v; },
	enumerable: true
});

Object.defineProperty( StandardMaterial.prototype, 'detail_scale', {
	get: function() { return this._detail.subarray(1,3); },
	set: function(v) { this._detail[1] = v[0]; this._detail[2] = v[1]; },
	enumerable: true
});

Object.defineProperty( StandardMaterial.prototype, 'extra_factor', {
	get: function() { return this._extra_data[3]; },
	set: function(v) { this._extra_data[3] = v; },
	enumerable: true
});

Object.defineProperty( StandardMaterial.prototype, 'extra_color', {
	get: function() { return this._extra_data.subarray(0,3); },
	set: function(v) { this._extra_data.set( v ); },
	enumerable: true
});

Object.defineProperty( StandardMaterial.prototype, 'specular_factor', {
	get: function() { return this._specular_data[0]; },
	set: function(v) { this._specular_data[0] = v; },
	enumerable: true
});

Object.defineProperty( StandardMaterial.prototype, 'specular_gloss', {
	get: function() { return this._specular_data[1]; },
	set: function(v) { this._specular_data[1] = v; },
	enumerable: true
});



StandardMaterial.DETAIL_TEXTURE = "detail";
StandardMaterial.NORMAL_TEXTURE = "normal";
StandardMaterial.DISPLACEMENT_TEXTURE = "displacement";
StandardMaterial.BUMP_TEXTURE = "bump";
StandardMaterial.REFLECTIVITY_TEXTURE = "reflectivity";
StandardMaterial.IRRADIANCE_TEXTURE = "irradiance";
StandardMaterial.EXTRA_TEXTURE = "extra";

StandardMaterial.texture_channels = [ Material.COLOR_TEXTURE, Material.OPACITY_TEXTURE, Material.AMBIENT_TEXTURE, Material.SPECULAR_TEXTURE, Material.EMISSIVE_TEXTURE, StandardMaterial.DETAIL_TEXTURE, StandardMaterial.NORMAL_TEXTURE, StandardMaterial.DISPLACEMENT_TEXTURE, StandardMaterial.BUMP_TEXTURE, StandardMaterial.REFLECTIVITY_TEXTURE, Material.ENVIRONMENT_TEXTURE, StandardMaterial.IRRADIANCE_TEXTURE, StandardMaterial.EXTRA_TEXTURE ];
StandardMaterial.available_shaders = ["default","lowglobal","phong_texture","flat","normal","phong","flat_texture"];

StandardMaterial.coding_help = "\
Input IN -> info about the mesh\n\
SurfaceOutput o -> info about the surface properties of this pixel\n\
\n\
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
	vec3 Ambient;\n\
	vec3 Emission;\n\
	float Specular;\n\
	float Gloss;\n\
	float Alpha;\n\
	float Reflectivity;\n\
};\n\
";

// RENDERING METHODS
StandardMaterial.prototype.fillShaderQuery = function( scene )
{
	var query = this._query;
	query.clear();

	//iterate through textures in the material
	for(var i in this.textures) 
	{
		var texture_info = this.getTextureSampler(i);
		if(!texture_info) continue;
		var texture_uvs = texture_info.uvs || Material.DEFAULT_UVS[i] || "0";

		var texture = Material.getTextureFromSampler( texture_info );
		if(!texture) //loading or non-existant
			continue;
		
		/*
		if(i == "environment")
		{
			if(this.reflection_factor <= 0) 
				continue;
		}
		else */

		if(i == "normal")
		{
			if(this.normalmap_factor != 0.0 && (!this.normalmap_tangent || (this.normalmap_tangent && gl.derivatives_supported)) )
			{
				query.macros.USE_NORMAL_TEXTURE = "uvs_" + texture_uvs;
				if(this.normalmap_factor != 0.0)
					query.macros.USE_NORMALMAP_FACTOR = "";
				if(this.normalmap_tangent && gl.derivatives_supported)
					query.macros.USE_TANGENT_NORMALMAP = "";
			}
			continue;
		}
		else if(i == "displacement")
		{
			if(this.displacementmap_factor != 0.0 && gl.derivatives_supported )
			{
				query.macros.USE_DISPLACEMENT_TEXTURE = "uvs_" + texture_uvs;
				if(this.displacementmap_factor != 1.0)
					query.macros.USE_DISPLACEMENTMAP_FACTOR = "";
			}
			continue;
		}
		else if(i == "bump")
		{
			if(this.bump_factor != 0.0 && gl.derivatives_supported )
			{
				query.macros.USE_BUMP_TEXTURE = "uvs_" + texture_uvs;
				if(this.bumpmap_factor != 1.0)
					query.macros.USE_BUMP_FACTOR = "";
			}
			continue;
		}

		query.macros[ "USE_" + i.toUpperCase() + (texture.texture_type == gl.TEXTURE_2D ? "_TEXTURE" : "_CUBEMAP") ] = "uvs_" + texture_uvs;
	}

	if(this.velvet && this.velvet_exp) //first light only
		query.macros.USE_VELVET = "";
	
	if(this.emissive_material) //dont know whats this
		query.macros.USE_EMISSIVE_MATERIAL = "";
	
	if(this.specular_ontop)
		query.macros.USE_SPECULAR_ONTOP = "";
	if(this.specular_on_alpha)
		query.macros.USE_SPECULAR_ON_ALPHA = "";
	if(this.reflection_specular)
		query.macros.USE_SPECULAR_IN_REFLECTION = "";
	if(this.backlight_factor > 0.001)
		query.macros.USE_BACKLIGHT = "";

	if(this.reflection_factor > 0.0) 
		query.macros.USE_REFLECTION = "";

	//extra code
	if(this.extra_surface_shader_code)
	{
		var code = null;
		if(this._last_extra_surface_shader_code != this.extra_surface_shader_code)
		{
			code = Material.processShaderCode( this.extra_surface_shader_code );
			this._last_processed_extra_surface_shader_code = code;
		}
		else
			code = this._last_processed_extra_surface_shader_code;
		if(code)
			query.macros.USE_EXTRA_SURFACE_SHADER_CODE = code;
	}

	//extra macros
	if(this.extra_macros)
		for(var im in this.extra_macros)
			query.macros[im] = this.extra_macros[im];
}

StandardMaterial.prototype.fillUniforms = function( scene, options )
{
	var uniforms = {};
	var samplers = []; //array with the samplers in the binding order

	uniforms.u_material_color = this._color;

	//uniforms.u_ambient_color = node.flags.ignore_lights ? [1,1,1] : [scene.ambient_color[0] * this.ambient[0], scene.ambient_color[1] * this.ambient[1], scene.ambient_color[2] * this.ambient[2]];
	if(this.use_scene_ambient && scene.info)
		uniforms.u_ambient_color = vec3.fromValues(scene.info.ambient_color[0] * this.ambient[0], scene.info.ambient_color[1] * this.ambient[1], scene.info.ambient_color[2] * this.ambient[2]);
	else
		uniforms.u_ambient_color = this.ambient;

	uniforms.u_emissive_color = this.emissive || vec3.create();
	uniforms.u_specular = this._specular_data;
	uniforms.u_reflection_info = [ (this.reflection_additive ? -this.reflection_factor : this.reflection_factor), this.reflection_fresnel ];
	uniforms.u_backlight_factor = this.backlight_factor;
	uniforms.u_normalmap_factor = this.normalmap_factor;
	uniforms.u_displacementmap_factor = this.displacementmap_factor;
	uniforms.u_bumpmap_factor = this.bumpmap_factor;

	this._velvet_info.set( this.velvet );
	this._velvet_info[3] = this.velvet_additive ? this.velvet_exp : -this.velvet_exp;
	uniforms.u_velvet_info = this._velvet_info;

	uniforms.u_detail_info = this._detail;

	uniforms.u_extra_data = this._extra_data;

	uniforms.u_texture_matrix = this.uvs_matrix;

	//iterate through textures in the material
	var last_texture_slot = 0;
	for(var i in this.textures) 
	{
		var sampler = this.getTextureSampler(i);
		if(!sampler)
			continue;

		var texture = sampler.texture;
		if(!texture)
			continue;

		if(texture.constructor === String)
			texture = LS.ResourcesManager.textures[texture];
		else if (texture.constructor != Texture)
			continue;		
		
		if(!texture)  //loading or non-existant
			sampler = { texture: ":missing" };

		samplers[ last_texture_slot ] = sampler;
		var uniform_name = i + ( (!texture || texture.texture_type == gl.TEXTURE_2D) ? "_texture" : "_cubemap");
		uniforms[ uniform_name ] = last_texture_slot;
		last_texture_slot++;
	}

	//add extra uniforms
	for(var i in this.extra_uniforms)
		uniforms[i] = this.extra_uniforms[i];

	this._uniforms = uniforms;
	this._samplers = samplers;
}

/**
* assign a value to a property in a safe way
* @method setProperty
* @param {Object} object to configure from
*/
StandardMaterial.prototype.setProperty = function(name, value)
{
	//redirect to base material
	if( Material.prototype.setProperty.call(this,name,value) )
		return true;

	//regular
	switch(name)
	{
		//numbers
		case "specular_factor":
		case "specular_gloss":
		case "backlight_factor":
		case "reflection_factor":
		case "reflection_fresnel":
		case "velvet_exp":
		case "velvet_additive":
		case "normalmap_tangent":
		case "normalmap_factor":
		case "displacementmap_factor":
		case "extra_factor":
		case "detail_factor":
		//strings
		case "shader_name":
		//bools
		case "specular_ontop":
		case "normalmap_tangent":
		case "reflection_specular":
		case "use_scene_ambient":
		case "extra_surface_shader_code":
			this[name] = value; 
			break;
		//vectors
		case "ambient":	
		case "emissive": 
		case "velvet":
		case "detail_scale":
		case "extra_color":
			if(this[name].length == value.length)
				this[name].set(value);
			break;
		case "extra_uniforms":
			this.extra_uniforms = LS.cloneObject(value);
			break;
		default:
			return false;
	}
	return true;
}

/**
* gets all the properties and its types
* @method getPropertiesInfo
* @return {Object} object with name:type
*/
StandardMaterial.prototype.getPropertiesInfo = function()
{
	//get from the regular material
	var o = Material.prototype.getPropertiesInfo.call(this);

	//add some more
	o.merge({
		shader_name:  LS.TYPES.STRING,
		specular_factor: LS.TYPES.NUMBER,
		specular_gloss: LS.TYPES.NUMBER,
		backlight_factor: LS.TYPES.NUMBER,
		reflection_factor: LS.TYPES.NUMBER,
		reflection_fresnel: LS.TYPES.NUMBER,
		velvet_exp: LS.TYPES.NUMBER,

		normalmap_factor: LS.TYPES.NUMBER,
		displacementmap_factor: LS.TYPES.NUMBER,
		extra_factor: LS.TYPES.NUMBER,
		extra_surface_shader_code: LS.TYPES.STRING,

		ambient: LS.TYPES.VEC3,
		emissive: LS.TYPES.VEC3,
		velvet: LS.TYPES.VEC3,
		extra_color: LS.TYPES.VEC3,
		detail_factor: LS.TYPES.NUMBER,
		detail_scale: LS.TYPES.VEC2,

		specular_ontop: LS.TYPES.BOOLEAN,
		normalmap_tangent: LS.TYPES.BOOLEAN,
		reflection_specular: LS.TYPES.BOOLEAN,
		use_scene_ambient: LS.TYPES.BOOLEAN,
		velvet_additive: LS.TYPES.BOOLEAN
	});

	return o;
}

SurfaceMaterial.prototype.getPropertyInfoFromPath = function( path )
{
	if( path.length < 1)
		return;

	var info = Material.prototype.getPropertyInfoFromPath.call(this,path);
	if(info)
		return info;

	var varname = path[0];

	switch(varname)
	{
		case "backlight_factor":
		case "reflection_factor":
		case "reflection_fresnel":
		case "velvet_exp":
		case "normalmap_factor":
		case "displacementmap_factor":
		case "extra_factor":
		case "detail_factor":
			type = LS.TYPES.NUMBER; break;
		case "extra_surface_shader_code":
			type = LS.TYPES.STRING; break;
		case "ambient":
		case "emissive":
		case "velvet":
		case "extra_color":
			type = LS.TYPES.VEC3; break;
		case "detail_scale":
			type = LS.TYPES.VEC2; break;
		case "specular_ontop":
		case "normalmap_tangent":
		case "reflection_specular":
		case "use_scene_ambient":
		case "velvet_additive":
			type = LS.TYPES.BOOLEAN; break;
		default:
			return null;
	}

	return {
		node: this._root,
		target: this,
		name: varname,
		value: this[varname],
		type: type
	};
}

LS.registerMaterialClass( StandardMaterial );
LS.StandardMaterial = StandardMaterial;