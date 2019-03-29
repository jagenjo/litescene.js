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

function StandardMaterial(o)
{
	ShaderMaterial.call(this,null); //do not pass the data object, it is called later

	this.blend_mode = LS.Blend.NORMAL;

	this.createProperty( "diffuse", new Float32Array([1.0,1.0,1.0]), "color" );
	this.createProperty( "ambient", new Float32Array([1.0,1.0,1.0]), "color" );
	this.createProperty( "emissive", new Float32Array([0,0,0,0]), "color" ); //fourth component to control if emissive is affected by albedo

	this._specular_data = vec4.fromValues( 0.1, 10.0, 0.0, 0.0 ); //specular factor, glossiness, specular_on_top
	this.specular_on_top = false;
	this.specular_on_alpha = false;

	this.backlight_factor = 0;

	this.reflection_factor = 0.0;
	this.reflection_fresnel = 1.0;
	this.reflection_specular = false;

	this.createProperty( "velvet", new Float32Array([0.5,0.5,0.5]), "color" );
	this.velvet_exp = 0.0;
	this.velvet_additive = false;
	this._velvet_info = vec4.create();

	this._detail = new Float32Array([0.0, 10, 10]);

	this.normalmap_factor = 1.0;
	this.normalmap_tangent = true;
	this.bumpmap_factor = 1.0;

	this.displacementmap_factor = 0.1;
	this._texture_settings = new Uint8Array(9);

	this.use_scene_ambient = true;

	this.createProperty( "extra", new Float32Array([1,1,1,1]), "color" ); //used in special situations

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
//		flat_normals: false,
		ignore_frustum: false
	};

	//used for special fx 
	this._uniforms = {
		u_material_color: this._color,
		u_ambient_color: this._ambient,
		u_emissive_color: this._emissive,
		u_specular: this._specular_data,
		u_reflection_info: vec2.create(), //factor and fresnel
		u_velvet_info: vec4.create(),
		u_normal_info: vec2.create(),
		u_detail_info: this._detail,
		u_texture_matrix: this.uvs_matrix,
		u_extra_color: this._extra,
		u_texture_settings: this._texture_settings
	};

	this._samplers = [];

	this._allows_instancing = true;
	this.needsUpdate = true;

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

Object.defineProperty( StandardMaterial.prototype, 'emissive_extra', {
	get: function() { return this._emissive[3]; },
	set: function(v) { this._emissive[3] = v; },
	enumerable: true
});

Object.defineProperty( StandardMaterial.prototype, 'specular_factor', {
	get: function() { return this._specular_data[0]; },
	set: function(v) { 
		if( v != null && v.constructor === Number)
			this._specular_data[0] = v;
	},
	enumerable: true
});

Object.defineProperty( StandardMaterial.prototype, 'specular_gloss', {
	get: function() { return this._specular_data[1]; },
	set: function(v) { this._specular_data[1] = v; },
	enumerable: true
});

StandardMaterial["@blend_mode"] = { type: "enum", values: LS.Blend };
StandardMaterial.actions = {};

StandardMaterial.DETAIL_TEXTURE = "detail";
StandardMaterial.NORMAL_TEXTURE = "normal";
StandardMaterial.DISPLACEMENT_TEXTURE = "displacement";
StandardMaterial.BUMP_TEXTURE = "bump";
StandardMaterial.REFLECTIVITY_TEXTURE = "reflectivity";
StandardMaterial.EXTRA_TEXTURE = "extra";
StandardMaterial.IRRADIANCE_TEXTURE = "irradiance";

StandardMaterial.TEXTURES_INDEX = { "color":0, "opacity":1, "ambient":2, "specular":3, "emissive":4, "detail":5, "normal":6, "displacement":7, "bump":8, "reflectivity":9, "extra":10, "environment":11 };

StandardMaterial.prototype.renderInstance = ShaderMaterial.prototype.renderInstance;
StandardMaterial.prototype.renderShadowInstance = ShaderMaterial.prototype.renderShadowInstance;
StandardMaterial.prototype.renderPickingInstance = ShaderMaterial.prototype.renderPickingInstance;

//called from LS.Renderer.processVisibleData
StandardMaterial.prototype.prepare = function( scene )
{
	var flags = this.flags;

	var render_state = this._render_state;

	if(!this._texture_settings) //HACK to fix BUG
		this._texture_settings = this._uniforms.u_texture_settings = new Uint8Array(9);

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

	for(var i in this.textures)
	{
		var tex = this.textures[i];
		if(!tex)
			continue;
		if(tex.index == null)
			tex.index = StandardMaterial.TEXTURES_INDEX[i];
		this._texture_settings[ tex.index ] = tex.uvs;
	}

	this._light_mode = this.flags.ignore_lights ? Material.NO_LIGHTS : 1;

	this.fillUniforms( scene ); //update uniforms
}

//options vec4: channel, degamma, transform, contrast

StandardMaterial.FLAGS = {
	COLOR_TEXTURE: 1<<1,
	OPACITY_TEXTURE: 1<<2,
	SPECULAR_TEXTURE: 1<<3,
	REFLECTIVITY_TEXTURE: 1<<4,
	AMBIENT_TEXTURE: 1<<5,
	EMISSIVE_TEXTURE: 1<<6,
	DETAIL_TEXTURE: 1<<7,
	NORMAL_TEXTURE: 1<<8,
	DISPLACEMENT_TEXTURE: 1<<9,
	EXTRA_TEXTURE: 1<<10,
	ENVIRONMENT_TEXTURE: 1<<11,
	ENVIRONMENT_CUBEMAP: 1<<12,
	IRRADIANCE_CUBEMAP: 1<<13,

	DEGAMMA_COLOR: 1<<26,
	SPEC_ON_ALPHA: 1<<27,
	SPEC_ON_TOP: 1<<28,
	ALPHA_TEST: 1<<29
}; //max is 32	



StandardMaterial.shader_codes = {};

//returns the LS.ShaderCode required to render
//here we cannot filter by light pass because this is done before applying shaderblocks
//in the StandardMaterial we cache versions of the ShaderCode according to the settings
StandardMaterial.prototype.getShaderCode = function( instance, render_settings, pass )
{
	var FLAGS = StandardMaterial.FLAGS;

	//lets check which code flags are active according to the configuration of the shader
	var code_flags = 0;
	var scene = LS.Renderer._current_scene;

	//TEXTURES
	if( this.textures.color )
	{
		code_flags |= FLAGS.COLOR_TEXTURE;
		if( this.textures.color.degamma )
			code_flags |= FLAGS.DEGAMMA_COLOR;
	}
	if( this.textures.opacity )
		code_flags |= FLAGS.OPACITY_TEXTURE;
	if( this.textures.displacement )
		code_flags |= FLAGS.DISPLACEMENT_TEXTURE;
	if( this.textures.normal )
		code_flags |= FLAGS.NORMAL_TEXTURE;
	if( this.textures.specular )
		code_flags |= FLAGS.SPECULAR_TEXTURE;
	if( this.reflection_factor > 0 )
	{
		//code_flags |= FLAGS.REFLECTION;
		if( this.textures.reflectivity )
			code_flags |= FLAGS.REFLECTIVITY_TEXTURE;
	}
	if( this.textures.emissive )
		code_flags |= FLAGS.EMISSIVE_TEXTURE;
	if( this.textures.ambient )
		code_flags |= FLAGS.AMBIENT_TEXTURE;
	if( this.textures.detail )
		code_flags |= FLAGS.DETAIL_TEXTURE;
	if( this.textures.extra )
		code_flags |= FLAGS.EXTRA_TEXTURE;
	if( this.specular_on_alpha )
		code_flags |= FLAGS.SPEC_ON_ALPHA;
	if( this.specular_on_top )
		code_flags |= FLAGS.SPEC_ON_TOP;

	//flags
	if( this.flags.alpha_test )
		code_flags |= FLAGS.ALPHA_TEST;

	//check if we already have this ShaderCode created
	var shader_code = LS.StandardMaterial.shader_codes[ code_flags ];

	//reuse shader codes when possible **************************************
	if(shader_code)
		return shader_code;

	//generate code
	var code = {
		vs_local: "",
		fs: "",
		fs_shadows: ""
	};

	if( code_flags & FLAGS.DISPLACEMENT_TEXTURE )
		code.vs_local += "	vertex4.xyz += v_normal * texture2D( displacement_texture, v_uvs ).x * u_displacementmap_factor;\n";	

	//uvs
	var uvs_common = "\n\
	uvs[0] = IN.uv;\n\
	uvs[1] = IN.uv1;\n\
	uvs[2] = (u_texture_matrix * vec3(uvs[0],1.0)).xy;\n\
	#ifdef COORD1_BLOCK\n\
		uvs[3] = (vec3(uvs[1],1.0) * u_texture_matrix).xy;\n\
	#else\n\
		uvs[3] = uvs[2];\n\
	#endif\n";
	code.fs += uvs_common;
	code.fs_shadows += uvs_common;

	if( code_flags & FLAGS.NORMAL_TEXTURE )
	{
		code.fs += "vec2 normal_uv = getUVs( u_texture_settings["+StandardMaterial.TEXTURES_INDEX["normal"]+"]);\n\
		vec3 normal_pixel = texture2D( normal_texture, normal_uv ).xyz;\n\
		if( u_normal_info.y > 0.0 )\n\
		{\n\
			normal_pixel.xy = vec2(1.0) - normal_pixel.xy;\n\
			normal_pixel = normalize( perturbNormal( IN.worldNormal, IN.viewDir, normal_uv, normal_pixel ));\n\
		}\n\
		else\n\
			normal_pixel = normal_pixel * 2.0 - vec3(1.0);\n\
		o.Normal = normalize( mix( o.Normal, normal_pixel, u_normal_info.x ) );\n";
	}

	if( code_flags & FLAGS.COLOR_TEXTURE )
	{
		var str = "	vec4 tex_color = texture2D( color_texture, getUVs( u_texture_settings["+StandardMaterial.TEXTURES_INDEX["color"]+"] ) );\n";
		code.fs += str;
		code.fs_shadows += str;

		if( code_flags & FLAGS.DEGAMMA_COLOR )
			code.fs += "	tex_color.xyz = pow( tex_color.xyz, vec3(2.0) );\n";
		str = "	o.Albedo *= tex_color.xyz;\n\
	o.Alpha *= tex_color.w;\n";
		code.fs += str;
		code.fs_shadows += str;
	}
	if( code_flags & FLAGS.OPACITY_TEXTURE )
	{
		var str =  "	o.Alpha *= texture2D( opacity_texture, getUVs( u_texture_settings["+StandardMaterial.TEXTURES_INDEX["opacity"]+"]) ).x;\n";
		code.fs += str;
		code.fs_shadows += str;
	}
	if( code_flags & FLAGS.SPECULAR_TEXTURE )
	{
		code.fs += "	vec4 spec_info = texture2D( specular_texture, getUVs( u_texture_settings["+StandardMaterial.TEXTURES_INDEX["specular"]+"]) );\n\
	o.Specular *= spec_info.x;\n\
	o.Gloss *= spec_info.y;\n";
	}
	if( code_flags & FLAGS.REFLECTIVITY_TEXTURE )
		code.fs += "	o.Reflectivity *= texture2D( reflectivity_texture, getUVs( u_texture_settings["+StandardMaterial.TEXTURES_INDEX["reflectivity"]+"]) ).x;\n";
	if( code_flags & FLAGS.EMISSIVE_TEXTURE )
		code.fs += "	o.Emission *= texture2D( emissive_texture, getUVs( u_texture_settings["+StandardMaterial.TEXTURES_INDEX["emissive"]+"]) ).xyz;\n";
	if( code_flags & FLAGS.AMBIENT_TEXTURE )
		code.fs += "	o.Ambient *= texture2D( ambient_texture, getUVs( u_texture_settings["+StandardMaterial.TEXTURES_INDEX["ambient"]+"]) ).xyz;\n";
	if( code_flags & FLAGS.DETAIL_TEXTURE )
		code.fs += "	o.Albedo += (texture2D( detail_texture, getUVs( u_texture_settings["+StandardMaterial.TEXTURES_INDEX["detail"]+"]) * u_detail_info.yz).xyz - vec3(0.5)) * u_detail_info.x;\n";
	if( code_flags & FLAGS.EXTRA_TEXTURE )
		code.fs += "	if(u_light_info.z == 0.0) o.Extra = u_extra_color * texture2D( extra_texture, getUVs( u_texture_settings["+StandardMaterial.TEXTURES_INDEX["extra"]+"] ) );\n";

	//flags
	if( code_flags & FLAGS.ALPHA_TEST )
	{
		var str = "	if(o.Alpha < 0.01) discard;\n";
		code.fs += str;
		code.fs_shadows += str;
	}

	if( code_flags & FLAGS.SPEC_ON_TOP )
		code.fs += "	#define SPEC_ON_TOP\n";

	if( code_flags & FLAGS.SPEC_ON_ALPHA )
		code.fs += "	#define SPEC_ON_ALPHA\n";

	//if( code_flags & FLAGS.FLAT_NORMALS )
	//	flat_normals += "";

	//compile shader and cache
	shader_code = new LS.ShaderCode();
	var final_code = StandardMaterial.code_template;

	if( StandardMaterial.onShaderCode )
		StandardMaterial.onShaderCode( code, this, code_flags );

	shader_code.code = ShaderCode.replaceCode( final_code, code );
	/*
	shader_code.code = final_code.replace(/\{\{[a-zA-Z0-9_]*\}\}/g, function(v){
		v = v.replace( /[\{\}]/g, "" );
		return code[v] || "";
	});
	*/

	LS.StandardMaterial.shader_codes[ code_flags ] = shader_code;
	return shader_code;
}

StandardMaterial.prototype.fillUniforms = function( scene, options )
{
	var uniforms = this._uniforms;

	uniforms.u_reflection_info[0] = this.reflection_factor;
	uniforms.u_reflection_info[1] = this.reflection_fresnel;
	uniforms.u_backlight_factor = this.backlight_factor;
	uniforms.u_normal_info[0] = this.normalmap_factor;
	uniforms.u_normal_info[1] = this.normalmap_tangent ? 1 : 0;
	uniforms.u_displacementmap_factor = this.displacementmap_factor;
	uniforms.u_velvet_info.set( this._velvet );
	uniforms.u_velvet_info[3] = this.velvet_additive ? this.velvet_exp : -this.velvet_exp;

	//iterate through textures in the material
	var last_texture_slot = 0;
	var samplers = this._samplers;
	samplers.length = 0; //clear
	for(var i in this.textures) 
	{
		var sampler = this.getTextureSampler(i);
		if(!sampler)
			continue;

		var texture = sampler.texture;
		if(!texture)
			continue;

		if(texture.constructor === String) //name of texture
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
		//var uniform_name = i + ( (!texture || texture.texture_type == gl.TEXTURE_2D) ? "_texture" : "_cubemap");
		uniforms[ i + "_texture" ] = slot;
	}
}

StandardMaterial.prototype.getTextureChannels = function()
{
	return [ Material.COLOR_TEXTURE, Material.OPACITY_TEXTURE, Material.AMBIENT_TEXTURE, Material.SPECULAR_TEXTURE, Material.EMISSIVE_TEXTURE, StandardMaterial.DETAIL_TEXTURE, StandardMaterial.NORMAL_TEXTURE, StandardMaterial.DISPLACEMENT_TEXTURE, StandardMaterial.BUMP_TEXTURE, StandardMaterial.REFLECTIVITY_TEXTURE, StandardMaterial.EXTRA_TEXTURE, Material.ENVIRONMENT_TEXTURE, StandardMaterial.IRRADIANCE_TEXTURE ];
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
		case "bumpmap_factor":
		case "displacementmap_factor":
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
		case "extra":
		case "detail_scale":
			if(this[name].length >= value.length)
				this[name].set(value);
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

		blend_mode: LS.TYPES.NUMBER,
		specular_factor: LS.TYPES.NUMBER,
		specular_gloss: LS.TYPES.NUMBER,
		backlight_factor: LS.TYPES.NUMBER,
		reflection_factor: LS.TYPES.NUMBER,
		reflection_fresnel: LS.TYPES.NUMBER,
		velvet_exp: LS.TYPES.NUMBER,

		normalmap_factor: LS.TYPES.NUMBER,
		bumpmap_factor: LS.TYPES.NUMBER,
		displacementmap_factor: LS.TYPES.NUMBER,
		emissive_extra: LS.TYPES.NUMBER,

		ambient: LS.TYPES.VEC3,
		emissive: LS.TYPES.VEC3,
		velvet: LS.TYPES.VEC3,
		extra: LS.TYPES.VEC4,
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

StandardMaterial.prototype.getPropertyInfoFromPath = function( path )
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
		case "bumpmap_factor":
		case "displacementmap_factor":
		case "emissive_extra":
		case "detail_factor":
			type = LS.TYPES.NUMBER; break;
		case "extra":
			type = LS.TYPES.VEC4; break;
		case "ambient":
		case "emissive":
		case "velvet":
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

StandardMaterial.clearShadersCache = function()
{
	LS.log("StandardMaterial ShaderCode cache cleared");
	StandardMaterial.shader_codes = {};
}

LS.registerMaterialClass( StandardMaterial );
LS.StandardMaterial = StandardMaterial;

//legacy
LS.Classes["newStandardMaterial"] = StandardMaterial;
//LS.newStandardMaterial = StandardMaterial;
//LS.MaterialClasses.newStandardMaterial = StandardMaterial;

//**********************************************
var UVS_CODE = "\n\
uniform int u_texture_settings[11];\n\
\n\
vec2 uvs[4];\n\
vec2 getUVs(int index)\n\
{\n\
	if(index == 0)\n\
		return uvs[0];\n\
	if(index == 1)\n\
		return uvs[1];\n\
	if(index == 2)\n\
		return uvs[2];\n\
	if(index == 3)\n\
		return uvs[3];\n\
	return uvs[0];\n\
}\n\
";

StandardMaterial.code_template = "\n\
\n\
\n\
\\color.vs\n\
\n\
precision mediump float;\n\
//global defines from blocks\n\
#pragma shaderblock \"vertex_color\"\n\
#pragma shaderblock \"coord1\"\n\
\n\
attribute vec3 a_vertex;\n\
attribute vec3 a_normal;\n\
attribute vec2 a_coord;\n\
#ifdef BLOCK_COORD1\n\
	attribute vec2 a_coord1;\n\
	varying vec2 v_uvs1;\n\
#endif\n\
#ifdef BLOCK_VERTEX_COLOR\n\
	attribute vec4 a_color;\n\
	varying vec4 v_vertex_color;\n\
#endif\n\
\n\
//varyings\n\
varying vec3 v_pos;\n\
varying vec3 v_normal;\n\
varying vec2 v_uvs;\n\
\n\
//matrices\n\
#ifdef BLOCK_INSTANCING\n\
	attribute mat4 u_model;\n\
#else\n\
	uniform mat4 u_model;\n\
#endif\n\
uniform mat4 u_normal_model;\n\
uniform mat4 u_view;\n\
uniform mat4 u_viewprojection;\n\
//material\n\
uniform float u_displacementmap_factor;\n\
uniform sampler2D displacement_texture;\n\
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
uniform vec2 u_camera_planes;\n\
\n\
#pragma event \"vs_functions\"\n\
\n\
//special cases\n\
{{vs_out}}\n\
\n\
void main() {\n\
	\n\
	vec4 vertex4 = vec4(a_vertex,1.0);\n\
	v_normal = a_normal;\n\
	v_uvs = a_coord;\n\
	#ifdef BLOCK_COORD1\n\
		v_uvs1 = a_coord1;\n\
	#endif\n\
	#ifdef BLOCK_VERTEX_COLOR\n\
		v_vertex_color = a_color;\n\
	#endif\n\
	\n\
	//local deforms\n\
	{{vs_local}}\n\
	applyMorphing( vertex4, v_normal );\n\
	applySkinning( vertex4, v_normal );\n\
	\n\
	//vertex\n\
	v_pos = (u_model * vertex4).xyz;\n\
	\n\
	applyLight(v_pos);\n\
	\n\
	//normal\n\
	#ifdef SHADERBLOCK_INSTANCING\n\
		v_normal = (u_model * vec4(v_normal,0.0)).xyz;\n\
	#else\n\
		v_normal = (u_normal_model * vec4(v_normal,0.0)).xyz;\n\
	#endif\n\
	//world deform\n\
	{{vs_global}}\n\
	\n\
	#pragma event \"vs_final_pass\"\n\
	\n\
	gl_Position = u_viewprojection * vec4(v_pos,1.0);\n\
	gl_PointSize = u_point_size;\n\
	#pragma event \"vs_final\"\n\
}\n\
\n\
\\color.fs\n\
\n\
#ifdef DRAW_BUFFERS\n\
	#extension GL_EXT_draw_buffers : require \n\
#endif\n\
\n\
precision mediump float;\n\
\n\
//global defines from blocks\n\
#pragma shaderblock \"vertex_color\"\n\
#pragma shaderblock \"coord1\"\n\
//#pragma shaderblock \"firstPass\"\n\
//#pragma shaderblock \"lastPass\"\n\
\n\
//varyings\n\
varying vec3 v_pos;\n\
varying vec3 v_normal;\n\
varying vec2 v_uvs;\n\
#ifdef BLOCK_COORD1\n\
	varying vec2 v_uvs1;\n\
#endif\n\
#ifdef BLOCK_VERTEX_COLOR\n\
	varying vec4 v_vertex_color;\n\
#endif\n\
\n\
//globals\n\
uniform vec3 u_camera_eye;\n\
uniform vec4 u_clipping_plane;\n\
uniform vec4 u_background_color;\n\
uniform vec4 u_material_color;\n\
\n\
uniform vec3 u_ambient_color;\n\
uniform vec4 u_emissive_color;\n\
uniform vec4 u_specular;\n\
uniform vec2 u_reflection_info;\n\
uniform vec4 u_velvet_info;\n\
uniform vec2 u_normal_info;\n\
uniform vec3 u_detail_info;\n\
uniform mat3 u_texture_matrix;\n\
uniform vec4 u_extra_color;\n\
uniform float u_backlight_factor;\n\
\n\
uniform sampler2D color_texture;\n\
uniform sampler2D opacity_texture;\n\
uniform sampler2D specular_texture;\n\
uniform sampler2D ambient_texture;\n\
uniform sampler2D emissive_texture;\n\
uniform sampler2D reflectivity_texture;\n\
uniform sampler2D detail_texture;\n\
uniform sampler2D normal_texture;\n\
uniform sampler2D extra_texture;\n\
\n\
\n\
#pragma shaderblock \"light\"\n\
#pragma shaderblock \"light_texture\"\n\
#pragma shaderblock \"applyReflection\"\n\
#pragma shaderblock \"normalBuffer\"\n\
\n\
#pragma snippet \"perturbNormal\"\n\
\n\
#pragma shaderblock \"extraBuffers\"\n\
\n\
"+ UVS_CODE +"\n\
\n\
void surf(in Input IN, out SurfaceOutput o)\n\
{\n\
	o.Albedo = u_material_color.xyz;\n\
	o.Alpha = u_material_color.a;\n\
	#ifdef BLOCK_VERTEX_COLOR\n\
	o.Albedo *= IN.color.xyz;\n\
	o.Alpha *= IN.color.a;\n\
	#endif\n\
	o.Normal = normalize( v_normal );\n\
	o.Specular = u_specular.x;\n\
	o.Gloss = u_specular.y;\n\
	o.Ambient = u_ambient_color;\n\
	o.Emission = u_emissive_color.xyz;\n\
	o.Reflectivity = u_reflection_info.x;\n\
	o.Extra = u_extra_color;\n\
	\n\
	{{fs}}\n\
	\n\
	if(u_velvet_info.w > 0.0)\n\
		o.Albedo += u_velvet_info.xyz * ( 1.0 - pow( max(0.0, dot( IN.viewDir, o.Normal )), u_velvet_info.w ));\n\
	else if(u_velvet_info.w < 0.0)\n\
		o.Albedo = mix( o.Albedo, u_velvet_info.xyz, 1.0 - pow( max(0.0, dot( IN.viewDir, o.Normal )), abs(u_velvet_info.w) ) );\n\
	if(u_emissive_color.w > 0.0)\n\
		o.Emission *= o.Albedo;\n\
	o.Reflectivity *= max(0.0, pow( 1.0 - clamp(0.0, dot(IN.viewDir,o.Normal),1.0), u_reflection_info.y ));\n\
}\n\
\n\
#pragma event \"fs_functions\"\n\
\n\
{{fs_out}}\n\
\n\
void main() {\n\
	Input IN = getInput();\n\
	SurfaceOutput o = getSurfaceOutput();\n\
	#ifdef BLOCK_VERTEX_COLOR\n\
		IN.color = v_vertex_color;\n\
	#endif\n\
	#ifdef BLOCK_COORD1\n\
		IN.uv1 = v_uvs1;\n\
	#endif\n\
	surf(IN,o);\n\
	Light LIGHT = getLight();\n\
	applyLightTexture( IN, LIGHT );\n\
	if( !gl_FrontFacing )\n\
		o.Normal *= -1.0;\n\
	FinalLight FINALLIGHT = computeLight( o, IN, LIGHT );\n\
	FINALLIGHT.Diffuse += u_backlight_factor * max(0.0, dot(FINALLIGHT.Vector, -o.Normal));\n\
	vec4 final_color = vec4( 0.0,0.0,0.0, o.Alpha );\n\
	#ifdef SPEC_ON_ALPHA\n\
		final_color.a += FINALLIGHT.Specular;\n\
	#endif\n\
	#ifdef SPEC_ON_TOP\n\
		float specular = FINALLIGHT.Specular;\n\
		FINALLIGHT.Specular = 0.0;\n\
	#endif\n\
	final_color.xyz = applyLight( o, FINALLIGHT );\n\
	#ifdef SPEC_ON_TOP\n\
		final_color.xyz += specular * LIGHT.Color * FINALLIGHT.Shadow;\n\
	#endif\n\
	final_color = applyReflection( IN, o, final_color );\n\
	#pragma event \"fs_final_pass\"\n\
	{{fs_encode}}\n\
	#ifdef DRAW_BUFFERS\n\
	  gl_FragData[0] = final_color;\n\
	  #ifdef BLOCK_FIRSTPASS\n\
		  #ifdef BLOCK_NORMALBUFFER\n\
			  gl_FragData[1] = vec4( o.Normal * 0.5 + vec3(0.5), 1.0 );\n\
		  #else\n\
			  gl_FragData[1] = o.Extra;\n\
		  #endif\n\
	  #else\n\
		  gl_FragData[1] = vec4(0.0);\n\
	 #endif\n\
	#else\n\
	  gl_FragColor = final_color;\n\
	#endif\n\
	#pragma event \"fs_final\"\n\
}\n\
\n\
\\shadow.vs\n\
\n\
precision mediump float;\n\
attribute vec3 a_vertex;\n\
attribute vec3 a_normal;\n\
attribute vec2 a_coord;\n\
\n\
//varyings\n\
varying vec3 v_pos;\n\
varying vec3 v_normal;\n\
varying vec2 v_uvs;\n\
varying vec4 v_screenpos;\n\
\n\
//matrices\n\
#ifdef BLOCK_INSTANCING\n\
	attribute mat4 u_model;\n\
#else\n\
	uniform mat4 u_model;\n\
#endif\n\
uniform mat4 u_normal_model;\n\
uniform mat4 u_view;\n\
uniform mat4 u_viewprojection;\n\
//material\n\
uniform float u_displacementmap_factor;\n\
uniform sampler2D displacement_texture;\n\
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
uniform vec2 u_camera_planes;\n\
\n\
{{vs_out}}\n\
\n\
void main() {\n\
	\n\
	vec4 vertex4 = vec4(a_vertex,1.0);\n\
	v_normal = a_normal;\n\
	v_uvs = a_coord;\n\
  \n\
  //deforms\n\
  {{vs_local}}\n\
  applyMorphing( vertex4, v_normal );\n\
  applySkinning( vertex4, v_normal );\n\
	\n\
	//vertex\n\
	v_pos = (u_model * vertex4).xyz;\n\
  \n\
  applyLight(v_pos);\n\
  \n\
	//normal\n\
	#ifdef SHADERBLOCK_INSTANCING\n\
		v_normal = (u_model * vec4(v_normal,0.0)).xyz;\n\
	#else\n\
		v_normal = (u_normal_model * vec4(v_normal,0.0)).xyz;\n\
	#endif\n\
	{{vs_global}}\n\
	v_screenpos = u_viewprojection * vec4(v_pos,1.0);\n\
	gl_Position = v_screenpos;\n\
}\n\
\\shadow.fs\n\
\n\
precision mediump float;\n\
\n\
//varyings\n\
varying vec3 v_pos;\n\
varying vec3 v_normal;\n\
varying vec2 v_uvs;\n\
varying vec4 v_screenpos;\n\
\n\
//globals\n\
uniform vec3 u_camera_eye;\n\
uniform vec2 u_camera_planes;\n\
uniform vec4 u_clipping_plane;\n\
uniform vec4 u_material_color;\n\
\n\
uniform mat3 u_texture_matrix;\n\
\n\
"+ UVS_CODE +"\n\
\n\
\n\
uniform sampler2D color_texture;\n\
uniform sampler2D opacity_texture;\n\
\n\
#pragma snippet \"input\"\n\
#pragma snippet \"surface\"\n\
#pragma snippet \"PackDepth32\"\n\
\n\
void surf(in Input IN, out SurfaceOutput o)\n\
{\n\
	o.Albedo = u_material_color.xyz;\n\
	o.Alpha = u_material_color.a;\n\
	\n\
	{{fs_shadows}}\n\
}\n\
\n\
{{fs_shadow_out}}\n\
\n\
void main() {\n\
  Input IN = getInput();\n\
  SurfaceOutput o = getSurfaceOutput();\n\
  surf(IN,o);\n\
  //float depth = length( IN.worldPos - u_camera_eye );\n\
  //depth = linearDepth( depth, u_camera_planes.x, u_camera_planes.y );\n\
  float depth = (v_screenpos.z / v_screenpos.w) * 0.5 + 0.5;\n\
  //depth = linearDepthNormalized( depth, u_camera_planes.x, u_camera_planes.y );\n\
  vec4 final_color;\n\
  final_color = PackDepth32(depth);\n\
  {{fs_shadow_encode}}\n\
  gl_FragColor = final_color;\n\
}\n\
\\picking.vs\n\
\n\
precision mediump float;\n\
attribute vec3 a_vertex;\n\
attribute vec3 a_normal;\n\
attribute vec2 a_coord;\n\
#ifdef VERTEX_COLOR_BLOCK\n\
	attribute vec4 a_color;\n\
#endif\n\
\n\
//varyings\n\
varying vec3 v_pos;\n\
varying vec3 v_normal;\n\
varying vec2 v_uvs;\n\
\n\
//matrices\n\
#ifdef BLOCK_INSTANCING\n\
	attribute mat4 u_model;\n\
#else\n\
	uniform mat4 u_model;\n\
#endif\n\
uniform mat4 u_normal_model;\n\
uniform mat4 u_view;\n\
uniform mat4 u_viewprojection;\n\
//material\n\
uniform float u_displacementmap_factor;\n\
uniform sampler2D displacement_texture;\n\
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
\n\
{{vs_out}}\n\
\n\
#pragma event \"vs_functions\"\n\
\n\
void main() {\n\
	\n\
	vec4 vertex4 = vec4(a_vertex,1.0);\n\
	v_normal = a_normal;\n\
	v_uvs = a_coord;\n\
  \n\
  //deforms\n\
  {{vs_local}}\n\
  applyMorphing( vertex4, v_normal );\n\
  applySkinning( vertex4, v_normal );\n\
	\n\
	//vertex\n\
	v_pos = (u_model * vertex4).xyz;\n\
  \n\
  applyLight(v_pos);\n\
  \n\
	//normal\n\
	#ifdef SHADERBLOCK_INSTANCING\n\
		v_normal = (u_model * vec4(v_normal,0.0)).xyz;\n\
	#else\n\
		v_normal = (u_normal_model * vec4(v_normal,0.0)).xyz;\n\
	#endif\n\
  {{vs_global}}\n\
	gl_Position = u_viewprojection * vec4(v_pos,1.0);\n\
	#pragma event \"vs_final\"\n\
}\n\
\\picking.fs\n\
	precision mediump float;\n\
	uniform vec4 u_material_color;\n\
	void main() {\n\
		gl_FragColor = u_material_color;\n\
	}\n\
";


/* example to inject code in the standardMaterial without having to edit it
//hooks are vs_out (out of main), vs_local (vertex4 to deform vertices localy), vs_global (v_pos to deform final position), fs_out (out of main), fs_encode (final_color before being written)
this.onStart = function()
{
  LS.StandardMaterial.onShaderCode = function(code,mat)
  {
  	code.fs_encode = "final_color.x = final_color.y;";
  }
	LS.StandardMaterial.clearShadersCache();
}
*/