//modes
//- per texture
//- texture coordinates
//- vertex color and extras
//- alpha test

//StandardMaterial class **************************
/* Warning: a material is not a component, because it can be shared by multiple nodes */

/**
* StandardMaterial class improves the material class
* @namespace LS
* @class StandardMaterial
* @constructor
* @param {Object} object [optional] to configure from
*/

function newStandardMaterial(o)
{
	Material.call(this,null); //do not pass the data object, it is called later

	this.blend_mode = LS.Blend.NORMAL;

	this.createProperty( "diffuse", new Float32Array([1.0,1.0,1.0]), "color" );
	this.createProperty( "ambient", new Float32Array([1.0,1.0,1.0]), "color" );
	this.createProperty( "emissive", new Float32Array([0,0,0,0]), "color" );
	//this.emissive = new Float32Array([0.0,0.0,0.0]);
	this.backlight_factor = 0;

	this._specular_data = vec2.fromValues( 0.1, 10.0 );
	this.specular_on_top = false;
	this.specular_on_alpha = false;
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

	//used to change the render state
	this.flags = {
		alpha_test: false,
		alpha_test_shadows: false,
		two_sided: false,
		flip_normals: false,
		depth_test: true,
		depth_write: true,
		ignore_lights: false,
		cast_shadows: true,
		receive_shadows: true,
		ignore_frustum: false
	};

	//used for special fx 
	this.extra_surface_shader_code = "";

	this._uniforms = {
		u_material_color: this._color,
		u_ambient_color: this._ambient,
		u_emissive_color: this._emissive,
		u_specular: this._specular_data,
		u_reflection_info: vec2.create(),
		u_velvet_info: vec4.create(),
		u_detail_info: this._detail,
		u_extra_data: this._extra_data,
		u_texture_matrix: this.uvs_matrix
	};

	this._samplers = [];

	this.needsUpdate = true;

	this.extra_uniforms = {};

	if(o) 
		this.configure(o);
}

Object.defineProperty( newStandardMaterial.prototype, 'detail_factor', {
	get: function() { return this._detail[0]; },
	set: function(v) { this._detail[0] = v; },
	enumerable: true
});

Object.defineProperty( newStandardMaterial.prototype, 'detail_scale', {
	get: function() { return this._detail.subarray(1,3); },
	set: function(v) { this._detail[1] = v[0]; this._detail[2] = v[1]; },
	enumerable: true
});

Object.defineProperty( newStandardMaterial.prototype, 'emissive_extra', {
	get: function() { return this._emissive[3]; },
	set: function(v) { this._emissive[3] = v; },
	enumerable: true
});

Object.defineProperty( newStandardMaterial.prototype, 'extra_factor', {
	get: function() { return this._extra_data[3]; },
	set: function(v) { this._extra_data[3] = v; },
	enumerable: true
});

Object.defineProperty( newStandardMaterial.prototype, 'extra_color', {
	get: function() { return this._extra_data.subarray(0,3); },
	set: function(v) { this._extra_data.set( v ); },
	enumerable: true
});

Object.defineProperty( newStandardMaterial.prototype, 'specular_factor', {
	get: function() { return this._specular_data[0]; },
	set: function(v) { 
		if( v != null && v.constructor === Number)
			this._specular_data[0] = v;
	},
	enumerable: true
});

Object.defineProperty( newStandardMaterial.prototype, 'specular_gloss', {
	get: function() { return this._specular_data[1]; },
	set: function(v) { this._specular_data[1] = v; },
	enumerable: true
});

newStandardMaterial["@blend_mode"] = { type: "enum", values: LS.Blend };

newStandardMaterial.DETAIL_TEXTURE = "detail";
newStandardMaterial.NORMAL_TEXTURE = "normal";
newStandardMaterial.DISPLACEMENT_TEXTURE = "displacement";
newStandardMaterial.BUMP_TEXTURE = "bump";
newStandardMaterial.REFLECTIVITY_TEXTURE = "reflectivity";
newStandardMaterial.IRRADIANCE_TEXTURE = "irradiance";
newStandardMaterial.EXTRA_TEXTURE = "extra";

newStandardMaterial.available_shaders = ["default","lowglobal","phong_texture","flat","normal","phong","flat_texture"];

newStandardMaterial.prototype.prepare = function( scene )
{
	var flags = this.flags;

	var render_state = this._render_state;

	//set flags in render state
	render_state.cull_face = !flags.two_sided;
	render_state.front_face = flags.flip_normals ? GL.CW : GL.CCW;
	render_state.depth_test = flags.depth_test;
	render_state.depth_mask = flags.depth_write;

	render_state.blend = this.blend_mode != LS.Blend.NORMAL;
	if( this.blend_mode != LS.Blend.NORMAL )
	{
		var func = LS.BlendFunctions[ this.blend_mode ];
		if(func)
		{
			render_state.blendFunc0 = func[0];
			render_state.blendFunc1 = func[1];
		}
	}

	this.fillUniforms( scene ); //update uniforms
}

newStandardMaterial.prototype.createShaderCode = function()
{
	if(!this._shader_code)
		this._shader_code = new LS.ShaderCode();

	var vs_code = 
}

// RENDERING METHODS
newStandardMaterial.prototype.fillShaderQuery = function( scene )
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
	
	if(this.specular_on_top)
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

newStandardMaterial.prototype.fillUniforms = function( scene, options )
{
	this._samplers.length = 0;
	var uniforms = this._uniforms;

	uniforms.u_reflection_info[0] = this.reflection_additive ? -this.reflection_factor : this.reflection_factor);
	uniforms.u_reflection_info[1] = this.reflection_fresnel );
	uniforms.u_backlight_factor = this.backlight_factor;
	uniforms.u_normalmap_factor = this.normalmap_factor;
	uniforms.u_displacementmap_factor = this.displacementmap_factor;
	uniforms.u_velvet_info[3] = this.velvet_additive ? this.velvet_exp : -this.velvet_exp;

	//iterate through textures in the material
	var last_texture_slot = 0;
	var samplers = this._samplers;
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

		var slot = last_texture_slot;
		if( i == "environment" )
			slot = LS.Renderer.ENVIRONMENT_TEXTURE_SLOT;
		else if( i == "irradiance" )
			slot = LS.Renderer.IRRADIANCE_TEXTURE_SLOT;
		else
			last_texture_slot++;

		samplers[ slot ] = sampler;
		var uniform_name = i + ( (!texture || texture.texture_type == gl.TEXTURE_2D) ? "_texture" : "_cubemap");
		uniforms[ uniform_name ] = slot;
	}
}

newStandardMaterial.prototype.getTextureChannels = function()
{
	return [ Material.COLOR_TEXTURE, Material.OPACITY_TEXTURE, Material.AMBIENT_TEXTURE, Material.SPECULAR_TEXTURE, Material.EMISSIVE_TEXTURE, newStandardMaterial.DETAIL_TEXTURE, newStandardMaterial.NORMAL_TEXTURE, newStandardMaterial.DISPLACEMENT_TEXTURE, newStandardMaterial.BUMP_TEXTURE, newStandardMaterial.REFLECTIVITY_TEXTURE, Material.ENVIRONMENT_TEXTURE, newStandardMaterial.IRRADIANCE_TEXTURE, newStandardMaterial.EXTRA_TEXTURE ];
}

/**
* assign a value to a property in a safe way
* @method setProperty
* @param {Object} object to configure from
*/
newStandardMaterial.prototype.setProperty = function(name, value)
{
	//redirect to base material
	if( Material.prototype.setProperty.call(this,name,value) )
		return true;

	//regular
	switch(name)
	{
		//objects
		case "render_state":
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
		case "emissive_extra":
		//strings
		case "shader_name":
		//bools
		case "specular_on_top":
		case "specular_on_alpha":
		case "normalmap_tangent":
		case "reflection_specular":
		case "use_scene_ambient":
		case "extra_surface_shader_code":
		case "blend_mode":
			if(value !== null)
				this[name] = value; 
			break;
		case "flags":
			if(value)
			{
				for(var i in value)
					this.flags[i] = value[i];
			}
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
newStandardMaterial.prototype.getPropertiesInfo = function()
{
	//get from the regular material
	var o = Material.prototype.getPropertiesInfo.call(this);

	//add some more
	o.merge({
		shader_name:  LS.TYPES.STRING,

		blend_mode: LS.TYPES.NUMBER,
		specular_factor: LS.TYPES.NUMBER,
		specular_gloss: LS.TYPES.NUMBER,
		backlight_factor: LS.TYPES.NUMBER,
		reflection_factor: LS.TYPES.NUMBER,
		reflection_fresnel: LS.TYPES.NUMBER,
		velvet_exp: LS.TYPES.NUMBER,

		normalmap_factor: LS.TYPES.NUMBER,
		displacementmap_factor: LS.TYPES.NUMBER,
		emissive_extra: LS.TYPES.NUMBER,
		extra_factor: LS.TYPES.NUMBER,
		extra_surface_shader_code: LS.TYPES.STRING,

		ambient: LS.TYPES.VEC3,
		emissive: LS.TYPES.VEC3,
		velvet: LS.TYPES.VEC3,
		extra_color: LS.TYPES.VEC3,
		detail_factor: LS.TYPES.NUMBER,
		detail_scale: LS.TYPES.VEC2,

		specular_on_top: LS.TYPES.BOOLEAN,
		normalmap_tangent: LS.TYPES.BOOLEAN,
		reflection_specular: LS.TYPES.BOOLEAN,
		use_scene_ambient: LS.TYPES.BOOLEAN,
		velvet_additive: LS.TYPES.BOOLEAN
	});

	return o;
}

newStandardMaterial.prototype.getPropertyInfoFromPath = function( path )
{
	if( path.length < 1)
		return;

	var info = Material.prototype.getPropertyInfoFromPath.call(this,path);
	if(info)
		return info;

	var varname = path[0];
	var type;

	switch(varname)
	{
		case "blend_mode":
		case "backlight_factor":
		case "reflection_factor":
		case "reflection_fresnel":
		case "velvet_exp":
		case "normalmap_factor":
		case "displacementmap_factor":
		case "emissive_extra":
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
		case "specular_on_top":
		case "specular_on_alpha":
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

LS.registerMaterialClass( newStandardMaterial );
LS.newStandardMaterial = newStandardMaterial;

newStandardMaterial.code_template = "\n\
\n\
\n\
\\color.vs\n\
\n\
precision mediump float;\n\
attribute vec3 a_vertex;\n\
attribute vec3 a_normal;\n\
attribute vec2 a_coord;\n\
#ifdef USE_COLORS\n\
attribute vec4 a_color;\n\
#endif
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
\n\
//globals\n\
uniform float u_time;\n\
uniform vec4 u_viewport;\n\
uniform float u_point_size;\n\
\n\
#pragma shaderblock \"light\"\n\
#pragma shaderblock \"morphing\"\n\
#pragma shaderblock \"skinning\"\n\
\n\
//camera\n\
uniform vec3 u_camera_eye;\n\
void main() {\n\
	\n\
	vec4 vertex4 = vec4(a_vertex,1.0);\n\
	v_normal = a_normal;\n\
	v_uvs = a_coord;\n\
  \n\
  //deforms\n\
  applyMorphing( vertex4, v_normal );\n\
  applySkinning( vertex4, v_normal );\n\
	\n\
	//vertex\n\
	v_pos = (u_model * vertex4).xyz;\n\
  \n\
  applyLight(v_pos);\n\
  \n\
	//normal\n\
	v_normal = (u_normal_model * vec4(v_normal,0.0)).xyz;\n\
	gl_Position = u_viewprojection * vec4(v_pos,1.0);\n\
}\n\
\n\
\\color.fs\n\
\n\
precision mediump float;\n\
\n\
//varyings\n\
varying vec3 v_pos;\n\
varying vec3 v_normal;\n\
varying vec2 v_uvs;\n\
\n\
//globals\n\
uniform vec3 u_camera_eye;\n\
uniform vec4 u_clipping_plane;\n\
uniform float u_time;\n\
uniform vec3 u_background_color;\n\
uniform vec4 u_material_color;\n\
\n\
#ifdef USE_COLOR_TEXTURE\n\
	uniform sampler2D color_texture;\n\
#endif\n\
\n\
#ifdef USE_OPACITY_TEXTURE\n\
	uniform sampler2D opacity_texture;\n\
#endif\n\
\n\
#ifdef USE_SPECULAR_TEXTURE\n\
	uniform sampler2D specular_texture;\n\
#endif\n\
\n\
#ifdef USE_AMBIENT_TEXTURE\n\
	uniform sampler2D ambient_texture;\n\
#endif\n\
\n\
#ifdef USE_EMISSIVE_TEXTURE\n\
	uniform sampler2D emissive_texture;\n\
#endif\n\
\n\
#ifdef USE_NORMAL_TEXTURE\n\
	uniform mat4 u_normal_model;\n\
	uniform sampler2D normal_texture;\n\
	uniform float u_normalmap_factor;
#endif\n\
\n\
#ifdef USE_DETAIL_TEXTURE\n\
	uniform sampler2D detail_texture;\n\
	uniform vec3 u_detail_info;\n\
#endif\n\
\n\
#ifdef USE_REFLECTIVITY_TEXTURE\n\
	uniform sampler2D reflectivity_texture;\n\
#endif\n\
\n\
#pragma shaderblock \"light\"\n\
\n\
#pragma snippet \"perturbNormal\"\n\
\n\
{{FS_CODE}}\n\
\n\
void main() {\n\
  Input IN = getInput();\n\
  SurfaceOutput o = getSurfaceOutput();\n\
  surf(IN,o);\n\
  vec4 final_color = vec4(0.0);\n\
  Light LIGHT = getLight();\n\
  final_color.xyz = computeLight( o, IN, LIGHT );\n\
  final_color.a = o.Alpha;\n\
  gl_FragColor = final_color;\n\
}\n\
";