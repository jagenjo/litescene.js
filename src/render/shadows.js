///@INFO: COMMON
// Shadows are complex because there are too many combinations: SPOT/DIRECT,OMNI or DEPTH_COMPONENT,RGBA or HARD,SOFT,VARIANCE
// This class encapsulates the shadowmap generation, and also how how it is read from the shader (using a ShaderBlock)

/**
* Shadowmap contains all the info necessary to generate the shadowmap
* @class Shadowmap
* @constructor
* @param {Object} object to configure from
*/
function Shadowmap( light )
{
	//maybe useful
	//this.enabled = true;

	/**
	* Shadowmap resolution, if let to 0 it will use the system default
	* @property resolution
	* @type {Number}
	* @default 0
	*/
	this.resolution = 0;

	/**
	* The offset applied to every depth before comparing it to avoid shadow acne
	* @property bias
	* @type {Number}
	* @default 0.0
	*/
	this.bias = 0;

	/**
	* Which format to use to store the shadowmaps
	* @property format
	* @type {Number}
	* @default GL.DEPTH_COMPONENT
	*/
	this.format = GL.DEPTH_COMPONENT;

	/**
	* Layers mask, this layers define which objects affect the shadow map (cast shadows)
	* @property layers
	* @type {Number}
	* @default true
	*/
	this.layers = 0xFF; //visible layers

	/**
	* If true objects inside the shadowmap will be rendered with the back faces only
	* @property reverse_faces
	* @type {Boolean}
	* @default false
	*/
	this.reverse_faces = true; //improves quality in some cases


	this.shadow_mode = 1; //0:hard, 1:bilinear, ...

	this.linear_filter = true;

	/**
	* The shadowmap texture, could be stored as color or depth depending on the settings
	* @property texture
	* @type {GL.Texture}
	* @default true
	*/
	this._texture = null;
	this._light = light;
	this._fbo = null;
	this._shadow_params = vec4.create(); //1.0 / this._texture.width, this.shadow_bias, this.near, closest_far
	this._shadow_extra_params = vec4.create(); //custom params in case the user wants to tweak the shadowmap with a cusstom shader
}

LS.Shadowmap = Shadowmap;

Shadowmap.use_shadowmap_depth_texture = true;

Shadowmap.prototype.getLocator = function()
{
	return this._light.getLocator() + "/" + "shadowmap";
}

Shadowmap.prototype.configure = function(v)
{
	for(var i in v)
		this[i] = v[i];
}

//enable block
Shadowmap.prototype.getReadShaderBlock = function()
{
	if( this._texture.format != GL.DEPTH_COMPONENT )
		return Shadowmap.shader_block.flag_mask | Shadowmap.depth_in_color_block.flag_mask;
	return Shadowmap.shader_block.flag_mask;
}

Shadowmap.prototype.getWriteShaderBlock = function()
{
	return 0;
}

Shadowmap.prototype.precomputeStaticShadowmap = function()
{

}

Shadowmap.prototype.generate = function( instances, render_settings, precompute_static )
{
	var light = this._light;

	var light_intensity = light.computeLightIntensity();
	if( light_intensity < 0.0001 )
		return;

	//create the texture
	var shadowmap_resolution = this.resolution;
	if(shadowmap_resolution == 0)
		shadowmap_resolution = render_settings.default_shadowmap_resolution;

	//shadowmap size
	var shadowmap_width = shadowmap_resolution;
	var shadowmap_height = shadowmap_resolution;
	if( light.type == LS.Light.OMNI)
		shadowmap_height *= 6; //for every face
	var magFilter = this.linear_filter ? gl.LINEAR : gl.NEAREST;

	//var tex_type = this.type == Light.OMNI ? gl.TEXTURE_CUBE_MAP : gl.TEXTURE_2D;
	var tex_type = gl.TEXTURE_2D;
	if(this._texture == null || this._texture.width != shadowmap_width || this._texture.height != shadowmap_height ||  this._texture.texture_type != tex_type || this._texture.magFilter != magFilter )
	{
		var type = gl.UNSIGNED_BYTE;
		var format = gl.RGBA;

		//not all webgl implementations support depth textures
		if( Shadowmap.use_shadowmap_depth_texture && gl.extensions.WEBGL_depth_texture )
		{
			format = gl.DEPTH_COMPONENT;
			type = gl.UNSIGNED_INT;
		}

		//create texture to store the shadowmap
		this._texture = new GL.Texture( shadowmap_width, shadowmap_height, { type: type, texture_type: tex_type, format: format, magFilter: magFilter, minFilter: gl.NEAREST });

		//if( this.precompute_static_shadowmap && (format != gl.DEPTH_COMPONENT || gl.extensions.EXT_frag_depth) )
		//	this._static_shadowmap = new GL.Texture( shadowmap_width, shadowmap_height, { type: type, texture_type: tex_type, format: format, magFilter: gl.NEAREST, minFilter: gl.NEAREST });

		//index, for debug
		this._texture.filename = ":shadowmap_" + light.uid;
		LS.ResourcesManager.textures[ this._texture.filename ] = this._texture; 

		if( this._texture.texture_type == gl.TEXTURE_2D )
		{
			if(format == gl.RGBA)
				this._fbo = new GL.FBO( [this._texture] );
			else
				this._fbo = new GL.FBO( null, this._texture );
		}
	}

	var prev_pass = LS.Renderer._current_pass;

	LS.Renderer.setRenderPass( SHADOW_PASS );
	LS.Renderer._current_light = light;
	var tmp_layer = render_settings.layers;
	render_settings.layers = this.layers;

	//render the scene inside the texture
	// Render the object viewed from the light using a shader that returns the fragment depth.
	this._texture.unbind(); 

	LS.Renderer._current_target = this._texture;
	this._fbo.bind();

	var sides = 1;
	var viewport_width = this._texture.width;
	var viewport_height = this._texture.height;
	if( light.type == LS.Light.OMNI )
	{
		sides = 6;
		viewport_height /= 6;
	}

	gl.clearColor(1, 1, 1, 1);
	if( this._texture.type == gl.DEPTH_COMPONENT )
		gl.colorMask(false,false,false,false);
	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

	for(var i = 0; i < sides; ++i) //in case of omni
	{
		var shadow_camera = light.getLightCamera(i);
		if(!this._texture.near_far_planes)
			this._texture.near_far_planes = vec2.create();
		this._shadow_params[2] = this._texture.near_far_planes[0] = shadow_camera.near;
		this._shadow_params[3] = this._texture.near_far_planes[1] = shadow_camera.far;
		LS.Renderer.enableCamera( shadow_camera, render_settings, true );

		var viewport_y = 0;
		if( light.type == LS.Light.OMNI )
			viewport_y = i * viewport_height;
		gl.viewport(0,viewport_y,viewport_width,viewport_height);

		if(this.reverse_faces) //used to avoid leaking in some situations
			LS.Renderer._reverse_faces = true;

		//RENDER INSTANCES in the shadowmap
		LS.Renderer.renderInstances( render_settings, instances );

		LS.Renderer._reverse_faces = false;
	}

	this._fbo.unbind();
	LS.Renderer._current_target = null;
	gl.colorMask(true,true,true,true);

	render_settings.layers = tmp_layer;
	LS.Renderer.setRenderPass( prev_pass );
	LS.Renderer._current_light = null;
	
	if(this.onPostProcessShadowMap)
		this.onPostProcessShadowMap( this._texture );
}

Shadowmap.prototype.prepare = function( uniforms, samplers )
{
	if(!this._texture)
	{
		console.warn("shadowmap without texture?");
		return;
	}

	var light = this._light;
	var closest_far = light.computeFar();
	uniforms.u_shadow_params = this._shadow_params;
	this._shadow_params[0] = 1.0 / this._texture.width;
	this._shadow_params[1] = this.bias;
	this._shadow_extra_params[0] = this.shadow_mode;
	uniforms.u_shadow_extra = this._shadow_extra_params;
	//2 and 3 are set when rendering the shadowmap

	uniforms.shadowmap = LS.Renderer.SHADOWMAP_TEXTURE_SLOT;

	samplers[ LS.Renderer.SHADOWMAP_TEXTURE_SLOT ] = this._texture;
}

//called when we no longer need this shadowmap
Shadowmap.prototype.release = function()
{
	this._texture = null;
}

Shadowmap.prototype.toViewport = function()
{
	if(!this._texture)
		return;
	this._texture.toViewport(); //TODO: create shader to visualize correctly
}

//*******************************

Shadowmap._enabled_vertex_code ="\n\
	#pragma snippet \"light_structs\"\n\
	varying vec4 v_light_coord;\n\
	void applyLight( vec3 pos ) { \n\
		if( u_light_info.x == 1.0 ) //Omni\n\
			v_light_coord.xyz = pos - u_light_position;\n\
		else\n\
			v_light_coord = u_light_matrix * vec4(pos,1.0);\n\
	}\n\
";

Shadowmap._disabled_vertex_code ="\n\
	void applyLight(vec3 pos) {}\n\
";

Shadowmap._enabled_fragment_code = "\n\
	#ifndef TESTSHADOW\n\
		#define TESTSHADOW\n\
	#endif\n\
	#pragma shaderblock \"depth_in_color\"\n\
	#pragma snippet \"PackDepth32\"\n\
	\n\
	uniform sampler2D shadowmap;\n\
	varying vec4 v_light_coord;\n\
	uniform vec4 u_shadow_params; //[ 1.0/(texture_size), bias, near, far ]\n\
	uniform vec4 u_shadow_extra; //[hard, ...]\n\
	\n\
	float UnpackDepth(vec4 depth)\n\
	{\n\
		#ifdef BLOCK_DEPTH_IN_COLOR\n\
			const vec4 bitShift = vec4( 1.0 / (256.0 * 256.0 * 256.0), 1.0 / (256.0 * 256.0), 1.0 / 256.0, 1.0 );\n\
			return dot(depth, bitShift);\n\
		#else\n\
			return depth.x;\n\
		#endif\n\
	}\n\
	float VectorToDepthValue(vec3 Vec)\n\
	{\n\
		vec3 AbsVec = abs(Vec);\n\
		float LocalZcomp = max(AbsVec.x, max(AbsVec.y, AbsVec.z));\n\
		float n = u_shadow_params.z;\n\
		float f = u_shadow_params.w;\n\
		float NormZComp = (f+n) / (f-n) - (2.0*f*n)/(f-n)/LocalZcomp;\n\
		return (NormZComp + 1.0) * 0.5;\n\
	}\n\
	\n\
	float texsize = 1.0 / u_shadow_params.x;\n\
	float real_depth = 0.0;\n\
	\n\
	float pixelShadow( vec2 uv )\n\
	{\n\
		float sampleDepth = UnpackDepth( texture2D(shadowmap, uv) );\n\
		float depth = (sampleDepth == 1.0) ? 1.0e9 : sampleDepth; //on empty data send it to far away\n\
		if (depth > 0.0) \n\
			return real_depth > depth ? 0.0 : 1.0;\n\
		return 0.0;\n\
	}\n\
	float expFunc(float f)\n\
	{\n\
		return f*f*f*(f*(f*6.0-15.0)+10.0);\n\
	}\n\
	\n\
	#pragma snippet \"vec3ToCubemap2D\"\n\
	\n\
	float testShadow( Light LIGHT )\n\
	{\n\
		vec3 offset = vec3(0.0);\n\
		float depth = 0.0;\n\
		float bias = u_shadow_params.y;\n\
		\n\
		vec2 sample;\n\
		if( LIGHT.Info.x == 1.0 ) //Omni\n\
		{\n\
			vec3 l_vector = (v_pos - u_light_position);\n\
			float dist = length(l_vector);\n\
			float pixel_z = VectorToDepthValue( l_vector );\n\
			if(pixel_z >= 0.998)\n\
				return 1.0; //fixes a little bit the far edge bug\n\
			//vec4 depth_color = textureCube( shadowmap, l_vector + offset * dist );\n\
			sample = vec3ToCubemap2D( l_vector/dist );\n\
			vec4 depth_color = texture2D( shadowmap, sample );\n\
			float ShadowVec = UnpackDepth( depth_color );\n\
			if ( ShadowVec > pixel_z - bias )\n\
				return 1.0; //no shadow\n\
			return 0.0; //full shadow\n\
		}\n\
		sample = (v_light_coord.xy / v_light_coord.w) * vec2(0.5) + vec2(0.5) + offset.xy;\n\
		//is inside light frustum\n\
		if (clamp(sample, 0.0, 1.0) != sample) \n\
			return LIGHT.Info.x == 3.0 ? 1.0 : 0.0; //directional: outside of shadowmap, no shadow\n\
		real_depth = (v_light_coord.z - bias) / v_light_coord.w * 0.5 + 0.5;\n\
		#ifdef BLOCK_DEPTH_IN_COLOR\n\
			//real_depth = linearDepthNormalized( real_depth, u_shadow_params.z, u_shadow_params.w );\n\
		#endif\n\
		vec2 topleft_uv = sample * texsize;\n\
		if(u_shadow_extra.x == 0.0) //hard \n\
			return pixelShadow( sample );\n\
		vec2 offset_uv = fract( topleft_uv );\n\
		offset_uv.x = expFunc(offset_uv.x);\n\
		offset_uv.y = expFunc(offset_uv.y);\n\
		topleft_uv = floor(topleft_uv) * u_shadow_params.x;\n\
		float topleft = pixelShadow( topleft_uv );\n\
		float topright = pixelShadow( topleft_uv + vec2(u_shadow_params.x,0.0) );\n\
		float bottomleft = pixelShadow( topleft_uv + vec2(0.0, u_shadow_params.x) );\n\
		float bottomright = pixelShadow( topleft_uv + vec2(u_shadow_params.x, u_shadow_params.x) );\n\
		float top = mix( topleft, topright, offset_uv.x );\n\
		float bottom = mix( bottomleft, bottomright, offset_uv.x );\n\
		return mix( top, bottom, offset_uv.y );\n\
	}\n\
";

Shadowmap._disabled_fragment_code = "\nfloat testShadow( Light LIGHT ) { return 1.0; }\n";

var shadowmapping_depth_in_color_block = new LS.ShaderBlock("depth_in_color");
shadowmapping_depth_in_color_block.register();
Shadowmap.depth_in_color_block = shadowmapping_depth_in_color_block;

var shadowmapping_block = new LS.ShaderBlock("testShadow");
shadowmapping_block.addCode( GL.VERTEX_SHADER, Shadowmap._enabled_vertex_code, Shadowmap._disabled_vertex_code);
shadowmapping_block.addCode( GL.FRAGMENT_SHADER, Shadowmap._enabled_fragment_code, Shadowmap._disabled_fragment_code );
//shadowmapping_block.defineContextMacros({"SHADOWBLOCK":"testShadow"});
shadowmapping_block.register();
Shadowmap.shader_block = shadowmapping_block;

