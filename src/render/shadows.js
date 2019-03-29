///@INFO: UNCOMMON
//Shadows are complex because there are too many combinations: SPOT/DIRECT,OMNI or DEPTH_COMPONENT,RGBA or HARD,SOFT,VARIANCE
//It would be nice to have classes that can encapsulate different shadowmap algorithms so they are easy to develop

function Shadowmap( light )
{
	this.light = light;

	this.resolution = 512;
	this.bias = 0;
	this.format = GL.DEPTH_COMPONENT;
	this.layers = 0xFF; //visible layers
	this.texture = null;
	this.fbo = null;
	this.shadow_params = vec4.create(); //1.0 / this.texture.width, this.shadow_bias, this.near, closest_far
	this.reverse_faces = true; 
}

Shadowmap.use_shadowmap_depth_texture = true;

Shadowmap.prototype.getReadShaderBlock = function()
{
	if( this.texture.format != GL.DEPTH_COMPONENT )
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
	var light = this.light;

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

	//var tex_type = this.type == Light.OMNI ? gl.TEXTURE_CUBE_MAP : gl.TEXTURE_2D;
	var tex_type = gl.TEXTURE_2D;
	if(this.texture == null || this.texture.width != shadowmap_width || this.texture.height != shadowmap_height ||  this.texture.texture_type != tex_type )
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
		this.texture = new GL.Texture( shadowmap_width, shadowmap_height, { type: type, texture_type: tex_type, format: format, magFilter: gl.NEAREST, minFilter: gl.NEAREST });

		//if( this.precompute_static_shadowmap && (format != gl.DEPTH_COMPONENT || gl.extensions.EXT_frag_depth) )
		//	this._static_shadowmap = new GL.Texture( shadowmap_width, shadowmap_height, { type: type, texture_type: tex_type, format: format, magFilter: gl.NEAREST, minFilter: gl.NEAREST });

		//index, for debug
		this.texture.filename = ":shadowmap_" + light.uid;
		LS.ResourcesManager.textures[ this.texture.filename ] = this.texture; 

		if( this.texture.texture_type == gl.TEXTURE_2D )
		{
			if(format == gl.RGBA)
				this.fbo = new GL.FBO( [this.texture] );
			else
				this.fbo = new GL.FBO( null, this.texture );
		}
	}

	LS.Renderer.setRenderPass( SHADOW_PASS );
	LS.Renderer._current_light = light;
	var tmp_layer = render_settings.layers;
	render_settings.layers = this.layers;

	//render the scene inside the texture
	// Render the object viewed from the light using a shader that returns the fragment depth.
	this.texture.unbind(); 

	LS.Renderer._current_target = this.texture;
	this.fbo.bind();

	var sides = 1;
	var viewport_width = this.texture.width;
	var viewport_height = this.texture.height;
	if( light.type == LS.Light.OMNI )
	{
		sides = 6;
		viewport_height /= 6;
	}

	gl.clearColor(1, 1, 1, 1);
	if( this.texture.type == gl.DEPTH_COMPONENT )
		gl.colorMask(false,false,false,false);
	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

	for(var i = 0; i < sides; ++i) //in case of omni
	{
		var shadow_camera = light.getLightCamera(i);
		this.shadow_params[2] = shadow_camera.near;
		this.shadow_params[3] = shadow_camera.far;
		LS.Renderer.enableCamera( shadow_camera, render_settings, true );

		var viewport_y = 0;
		if( light.type == LS.Light.OMNI )
			viewport_y = i * viewport_height;
		gl.viewport(0,viewport_y,viewport_width,viewport_height);

		if(this.reverse_faces)
			LS.Renderer._reverse_faces = true;

		//RENDER INSTANCES in the shadowmap
		LS.Renderer.renderInstances( render_settings, instances );

		LS.Renderer._reverse_faces = false;
	}

	this.fbo.unbind();
	LS.Renderer._current_target = null;
	gl.colorMask(true,true,true,true);

	render_settings.layers = tmp_layer;
	LS.Renderer.setRenderPass( COLOR_PASS );
	LS.Renderer._current_light = null;
	
	if(this.onPostProcessShadowMap)
		this.onPostProcessShadowMap( this.texture );
}

Shadowmap.prototype.prepare = function( uniforms, samplers )
{
	var light = this.light;
	var closest_far = light.computeFar();
	uniforms.u_shadow_params = this.shadow_params;
	this.shadow_params[0] = 1.0 / this.texture.width;
	this.shadow_params[1] = this.bias;
	//2 and 3 are set when rendering the shadowmap

	uniforms.shadowmap = LS.Renderer.SHADOWMAP_TEXTURE_SLOT;
	samplers[ LS.Renderer.SHADOWMAP_TEXTURE_SLOT ] = this.texture;
}

Shadowmap.prototype.toViewport = function()
{
	if(!this.texture)
		return;
	this.texture.toViewport(); //TODO: create shader to visualize correctly
}

//*******************************

Shadowmap._enabled_vertex_code ="\n\
	#pragma snippet \"light_structs\"\n\
	varying vec4 v_light_coord;\n\
	void applyLight( vec3 pos ) { v_light_coord = u_light_matrix * vec4(pos,1.0); }\n\
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
	uniform vec4 u_shadow_params; // (1.0/(texture_size), bias, near, far)\n\
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
	float testShadow( Light LIGHT )\n\
	{\n\
		vec3 offset = vec3(0.0);\n\
		float depth = 0.0;\n\
		float bias = u_shadow_params.y;\n\
		\n\
		vec2 sample = (v_light_coord.xy / v_light_coord.w) * vec2(0.5) + vec2(0.5) + offset.xy;\n\
		//is inside light frustum\n\
		if (clamp(sample, 0.0, 1.0) != sample) \n\
			return LIGHT.Info.x == 3.0 ? 1.0 : 0.0; //outside of shadowmap, no shadow\n\
		\n\
		real_depth = (v_light_coord.z - bias) / v_light_coord.w * 0.5 + 0.5;\n\
		#ifdef BLOCK_DEPTH_IN_COLOR\n\
			//real_depth = linearDepthNormalized( real_depth, u_shadow_params.z, u_shadow_params.w );\n\
		#endif\n\
		vec2 topleft_uv = sample * texsize;\n\
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

