//this file defines the shaderblocks that interact in the render of any standard material
//the pipeline is quite standard

//for structures like Input go to shaders.xml

//define surface structures
LS.ShadersManager.registerSnippet("surface","\n\
	//used to store surface shading properties\n\
	struct SurfaceOutput {\n\
		vec3 Albedo;\n\
		vec3 Normal; //separated in case there is a normal map\n\
		vec3 Emission;\n\
		vec3 Ambient;\n\
		float Specular;\n\
		float Gloss;\n\
		float Alpha;\n\
		float Reflectivity;\n\
		vec4 Extra; //for special purposes\n\
	};\n\
	\n\
	SurfaceOutput getSurfaceOutput()\n\
	{\n\
		SurfaceOutput o;\n\
		o.Albedo = u_material_color.xyz;\n\
		o.Alpha = u_material_color.a;\n\
		o.Normal = normalize( v_normal );\n\
		o.Specular = 0.5;\n\
		o.Gloss = 10.0;\n\
		o.Ambient = vec3(1.0);\n\
		o.Emission = vec3(0.0);\n\
		o.Reflectivity = 0.0;\n\
		o.Extra = vec4(0.0);\n\
		return o;\n\
	}\n\
");

// LIGHT STRUCTS AND FUNCTIONS *****************************************
LS.ShadersManager.registerSnippet("light_structs","\n\
	#ifndef SB_LIGHT_STRUCTS\n\
	#define SB_LIGHT_STRUCTS\n\
	uniform lowp vec4 u_light_info;\n\
	uniform vec3 u_light_position;\n\
	uniform vec3 u_light_front;\n\
	uniform vec3 u_light_color;\n\
	uniform vec4 u_light_angle; //cone start,end,phi,theta \n\
	uniform vec4 u_light_att; //start,end \n\
	uniform float u_light_offset; //ndotl offset\n\
	uniform vec4 u_light_extra; //user data\n\
	uniform mat4 u_light_matrix; //projection to light screen space\n\
	uniform vec3 u_ambient_light;\n\
	struct Light {\n\
		lowp vec4 Info; //type of light (3: DIRECTIONAL), falloff type, pass index, num passes \n\
		vec3 Color;\n\
		vec3 Ambient;\n\
		vec3 Position;\n\
		vec3 Front;\n\
		vec4 ConeInfo; //for spotlights\n\
		vec4 Attenuation; //start,end,type,extra\n\
		float Offset; //phong_offset\n\
		vec4 Extra; //users can use this\n\
		mat4 Matrix; //converts to light space\n\
		float Distance;\n\
	};\n\
	//Returns the info about the light\n\
	Light getLight()\n\
	{\n\
		Light LIGHT;\n\
		LIGHT.Info = u_light_info;\n\
		LIGHT.Color = u_light_color;\n\
		if(u_light_info.z == 0.0)\n\
			LIGHT.Ambient = u_ambient_light;\n\
		else\n\
			LIGHT.Ambient = vec3(0.0);\n\
		LIGHT.Position = u_light_position;\n\
		LIGHT.Front = u_light_front;\n\
		LIGHT.ConeInfo = u_light_angle; //for spotlights\n\
		LIGHT.Attenuation = u_light_att; //start and end\n\
		LIGHT.Offset = u_light_offset;\n\
		LIGHT.Distance = length( u_light_position - v_pos );\n\
		LIGHT.Extra = u_light_extra;\n\
		LIGHT.Matrix = u_light_matrix; //converts to light space\n\
		return LIGHT;\n\
	}\n\
	//used to store light contribution\n\
	struct FinalLight {\n\
		vec3 Color;\n\
		vec3 Ambient;\n\
		float Diffuse; //NdotL\n\
		float Specular; //RdotL\n\
		vec3 Emission;\n\
		vec3 Reflection;\n\
		float Attenuation;\n\
		vec3 Vector; //light vector\n\
		float Shadow; //1.0 means fully lit\n\
	};\n\
	#endif\n\
");

// LIGHT ************************************************

Light._vs_shaderblock_code = "\n\
	#pragma shaderblock \"testShadow\"\n\
";

Light._enabled_fs_shaderblock_code = "\n\
	#pragma snippet \"input\"\n\
	#pragma snippet \"surface\"\n\
	#pragma snippet \"light_structs\"\n\
	#pragma snippet \"spotFalloff\"\n\
	#pragma shaderblock \"applyIrradiance\"\n\
	#pragma shaderblock \"attenuation\"\n\
	#pragma shaderblock SHADOWBLOCK \"testShadow\"\n\
	\n\
	//Light is separated in two functions, computeLight (how much light receives the object) and applyLight (compute resulting final color)\n\
	// FINAL LIGHT EQUATION, takes all the info from FinalLight and computes the final color \n\
	\n\
	// HERE we fill FinalLight structure with all the info (colors,NdotL,diffuse,specular,etc) \n\
	FinalLight computeLight(in SurfaceOutput o, in Input IN, in Light LIGHT )\n\
	{\n\
		FinalLight FINALLIGHT;\n\
		// INIT\n\
		FINALLIGHT.Color = LIGHT.Color;\n\
		FINALLIGHT.Ambient = LIGHT.Ambient;\n\
		\n\
		// COMPUTE VECTORS\n\
		vec3 N = o.Normal; //use the final normal (should be the same as IN.worldNormal)\n\
		vec3 E = (u_camera_eye - v_pos);\n\
		float cam_dist = length(E);\n\
		E /= cam_dist;\n\
		\n\
		vec3 L = (LIGHT.Position - v_pos) / LIGHT.Distance;\n\
		\n\
		if( LIGHT.Info.x == 3.0 )\n\
			L = -LIGHT.Front;\n\
		\n\
		FINALLIGHT.Vector = L;\n\
		vec3 R = reflect(E,N);\n\
		\n\
		// IRRADIANCE\n\
		applyIrradiance( o, FINALLIGHT );\n\
		// PHONG FORMULA\n\
		float NdotL = 1.0;\n\
		NdotL = dot(N,L);\n\
		float EdotN = dot(E,N); //clamp(dot(E,N),0.0,1.0);\n\
		NdotL = max( 0.0, NdotL + LIGHT.Offset );\n\
		FINALLIGHT.Diffuse = abs(NdotL);\n\
		FINALLIGHT.Specular = o.Specular * pow( clamp(dot(R,-L),0.001,1.0), o.Gloss );\n\
		\n\
		// ATTENUATION\n\
		FINALLIGHT.Attenuation = 1.0;\n\
		\n\
		#ifdef BLOCK_ATTENUATION\n\
			FINALLIGHT.Attenuation = computeAttenuation( LIGHT );\n\
		#endif\n\
		if( LIGHT.Info.x == 2.0 && LIGHT.Info.y == 1.0 )\n\
			FINALLIGHT.Attenuation *= spotFalloff( LIGHT.Front, normalize( LIGHT.Position - v_pos ), LIGHT.ConeInfo.z, LIGHT.ConeInfo.w );\n\
		\n\
		// SHADOWS\n\
		FINALLIGHT.Shadow = 1.0;\n\
		#ifdef BLOCK_TESTSHADOW\n\
			FINALLIGHT.Shadow = testShadow( LIGHT );\n\
		#endif\n\
		\n\
		// LIGHT MODIFIERS\n\
		#ifdef LIGHT_MODIFIER\n\
		#endif\n\
		// FINAL LIGHT FORMULA ************************* \n\
		return FINALLIGHT;\n\
	}\n\
	//here we apply the FINALLIGHT to the SurfaceOutput\n\
	vec3 applyLight( in SurfaceOutput o, in FinalLight FINALLIGHT )\n\
	{\n\
		vec3 total_light = FINALLIGHT.Ambient * o.Ambient + FINALLIGHT.Color * FINALLIGHT.Diffuse * FINALLIGHT.Attenuation * FINALLIGHT.Shadow;\n\
		vec3 final_color = o.Albedo * total_light;\n\
		if(u_light_info.z == 0.0)\n\
			final_color += o.Emission;\n\
		final_color	+= o.Albedo * (FINALLIGHT.Color * FINALLIGHT.Specular * FINALLIGHT.Attenuation * FINALLIGHT.Shadow);\n\
		return max( final_color, vec3(0.0) );\n\
	}\n\
	\n\
	//all done in one single step\n\
	vec3 processLight(in SurfaceOutput o, in Input IN, in Light LIGHT)\n\
	{\n\
		FinalLight FINALLIGHT = computeLight( o, IN,LIGHT );\n\
		return applyLight(o,FINALLIGHT);\n\
	}\n\
	\n\
";

Light._disabled_shaderblock_code = "\n\
	#pragma snippet \"input\"\n\
	#pragma snippet \"surface\"\n\
	#pragma snippet \"light_structs\"\n\
	#pragma shaderblock \"applyIrradiance\"\n\
	FinalLight computeLight( in SurfaceOutput o, in Input IN, in Light LIGHT )\n\
	{\n\
		FinalLight FINALLIGHT;\n\
		FINALLIGHT.Ambient = LIGHT.Ambient;\n\
		FINALLIGHT.Diffuse = 0.0;\n\
		FINALLIGHT.Specular = 0.0;\n\
		FINALLIGHT.Attenuation = 0.0;\n\
		FINALLIGHT.Shadow = 0.0;\n\
		applyIrradiance( o, FINALLIGHT );\n\
		return FINALLIGHT;\n\
	}\n\
	vec3 applyLight( in SurfaceOutput o, in FinalLight FINALLIGHT )\n\
	{\n\
		vec3 final_color = o.Albedo * o.Ambient * FINALLIGHT.Ambient;\n\
		if(u_light_info.z == 0.0)\n\
			final_color += o.Emission;\n\
		return final_color;\n\
	}\n\
	\n\
	//all done in one single step\n\
	vec3 processLight(in SurfaceOutput o, in Input IN, in Light LIGHT)\n\
	{\n\
		FinalLight FINALLIGHT = computeLight( o, IN,LIGHT );\n\
		return applyLight(o,FINALLIGHT);\n\
	}\n\
	\n\
";

var light_block = new LS.ShaderBlock("light");
light_block.addCode( GL.VERTEX_SHADER, Light._vs_shaderblock_code, Light._vs_shaderblock_code );
light_block.addCode( GL.FRAGMENT_SHADER, Light._enabled_fs_shaderblock_code, Light._disabled_shaderblock_code );
light_block.register();
Light.shader_block = light_block;

// ATTENUATION ************************************************

Light._attenuation_enabled_fragment_code = "\n\
	const float LINEAR_ATTENUATION = 1.0;\n\
	const float RANGE_ATTENUATION = 2.0;\n\
	float computeAttenuation( in Light LIGHT )\n\
	{\n\
		//no attenuation\n\
		if(LIGHT.Attenuation.z == 0.0)\n\
			return 1.0;\n\
		//directional light\n\
		if( LIGHT.Info.x == 3.0 )\n\
			return 1.0;\n\
		if( LIGHT.Attenuation.z == LINEAR_ATTENUATION )\n\
			return 10.0 / LIGHT.Distance;\n\
		if( LIGHT.Attenuation.z == RANGE_ATTENUATION )\n\
		{\n\
			if(LIGHT.Distance >= LIGHT.Attenuation.y)\n\
				return 0.0;\n\
			if(LIGHT.Distance >= LIGHT.Attenuation.x)\n\
				return 1.0 - (LIGHT.Distance - LIGHT.Attenuation.x) / (LIGHT.Attenuation.y - LIGHT.Attenuation.x);\n\
		}\n\
		return 1.0;\n\
	}\n\
";
Light._attenuation_disabled_fragment_code = "";

var attenuation_block = Light.attenuation_block = new LS.ShaderBlock("attenuation");
attenuation_block.addCode( GL.FRAGMENT_SHADER, Light._attenuation_enabled_fragment_code, Light._attenuation_disabled_fragment_code );
attenuation_block.register();

// LIGHT TEXTURE **********************************************
Light._light_texture_fragment_enabled_code ="\n\
uniform sampler2D light_texture;\n\
void applyLightTexture( in Input IN, inout Light LIGHT )\n\
{\n\
	vec4 v = LIGHT.Matrix * vec4( IN.worldPos,1.0 );\n\
	vec2 uv = v.xy / v.w * 0.5 + vec2(0.5);\n\
	LIGHT.Color *= texture2D( light_texture, uv ).xyz;\n\
}\n\
";

Light._light_texture_fragment_disabled_code ="\n\
void applyLightTexture( in Input IN, inout Light LIGHT )\n\
{\n\
}\n\
";

var light_texture_block = Light.light_texture_block = new LS.ShaderBlock("light_texture");
light_texture_block.addCode( GL.FRAGMENT_SHADER, Light._light_texture_fragment_enabled_code, Light._light_texture_fragment_disabled_code );
light_texture_block.register();


// OMNI LIGHT SHADOWMAP *****************************************
Light._shadowmap_cubemap_code = "\n\
	#define SHADOWMAP_ACTIVE\n\
	uniform samplerCube shadowmap;\n\
	uniform vec4 u_shadow_params; // (1.0/(texture_size), bias, near, far)\n\
	\n\
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
	float UnpackDepth32(vec4 depth)\n\
	{\n\
		const vec4 bitShifts = vec4( 1.0/(256.0*256.0*256.0), 1.0/(256.0*256.0), 1.0/256.0, 1);\n\
		return dot(depth.xyzw , bitShifts);\n\
	}\n\
	\n\
	float testShadow( Light LIGHT, vec3 offset )\n\
	{\n\
		float shadow = 0.0;\n\
		float depth = 0.0;\n\
		float bias = u_shadow_params.y;\n\
		\n\
		vec3 l_vector = (v_pos - u_light_position);\n\
		float dist = length(l_vector);\n\
		float pixel_z = VectorToDepthValue( l_vector );\n\
		if(pixel_z >= 0.998)\n\
			return 0.0; //fixes a little bit the far edge bug\n\
		vec4 depth_color = textureCube( shadowmap, l_vector + offset * dist );\n\
		float ShadowVec = UnpackDepth32( depth_color );\n\
		if ( ShadowVec > pixel_z - bias )\n\
			return 0.0; //no shadow\n\
		return 1.0; //full shadow\n\
	}\n\
";

Light._shadowmap_vertex_enabled_code ="\n\
	#pragma snippet \"light_structs\"\n\
	varying vec4 v_light_coord;\n\
	void applyLight( vec3 pos ) { v_light_coord = u_light_matrix * vec4(pos,1.0); }\n\
";

Light._shadowmap_vertex_disabled_code ="\n\
	void applyLight(vec3 pos) {}\n\
";


// DIRECTIONAL AND SPOTLIGHT SHADOWMAP *****************************************
Light._shadowmap_2d_enabled_fragment_code = "\n\
	#ifndef TESTSHADOW\n\
		#define TESTSHADOW\n\
	#endif\n\
	uniform sampler2D shadowmap;\n\
	varying vec4 v_light_coord;\n\
	uniform vec4 u_shadow_params; // (1.0/(texture_size), bias, near, far)\n\
	\n\
	float UnpackDepth(vec4 depth)\n\
	{\n\
		#ifdef BLOCK_DEPTH_IN_COLOR\n\
			const vec4 bitShifts = vec4( 1.0/(256.0*256.0*256.0), 1.0/(256.0*256.0), 1.0/256.0, 1);\n\
			return dot(depth.xyzw , bitShifts);\n\
		#else\n\
			return depth.x;\n\
		#endif\n\
	}\n\
	\n\
	float testShadow( Light LIGHT )\n\
	{\n\
		vec3 offset = vec3(0.0);\n\
		float shadow = 0.0;\n\
		float depth = 0.0;\n\
		float bias = u_shadow_params.y;\n\
		\n\
		vec2 sample = (v_light_coord.xy / v_light_coord.w) * vec2(0.5) + vec2(0.5) + offset.xy;\n\
		//is inside light frustum\n\
		if (clamp(sample, 0.0, 1.0) != sample) \n\
			return LIGHT.Info.x == 3.0 ? 1.0 : 0.0; //outside of shadowmap, no shadow\n\
		float sampleDepth = UnpackDepth( texture2D(shadowmap, sample) );\n\
		depth = (sampleDepth == 1.0) ? 1.0e9 : sampleDepth; //on empty data send it to far away\n\
		if (depth > 0.0) \n\
			shadow = ((v_light_coord.z - bias) / v_light_coord.w * 0.5 + 0.5) > depth ? 0.0 : 1.0;\n\
		return shadow;\n\
	}\n\
";

Light._shadowmap_2d_disabled_code = "\nfloat testShadow( Light LIGHT ) { return 1.0; }\n";

var shadowmapping_depth_in_color_block = new LS.ShaderBlock("depth_in_color");
shadowmapping_depth_in_color_block.register();
Light.shadowmapping_depth_in_color_block = shadowmapping_depth_in_color_block;

var shadowmapping_block = new LS.ShaderBlock("testShadow");
shadowmapping_block.addCode( GL.VERTEX_SHADER, Light._shadowmap_vertex_enabled_code, Light._shadowmap_vertex_disabled_code);
shadowmapping_block.addCode( GL.FRAGMENT_SHADER, Light._shadowmap_2d_enabled_fragment_code, Light._shadowmap_2d_disabled_code );
//shadowmapping_block.defineContextMacros({"SHADOWBLOCK":"testShadow"});
shadowmapping_block.register();
Light.shadowmapping_2d_shader_block = shadowmapping_block;
Light.registerShadowType( "hard", shadowmapping_block );

var shadowmapping_2D_hard_shader_block = new LS.ShaderBlock("testShadow2D_hard");
shadowmapping_2D_hard_shader_block.addCode( GL.VERTEX_SHADER, Light._shadowmap_vertex_enabled_code, Light._shadowmap_vertex_disabled_code );
shadowmapping_2D_hard_shader_block.addCode( GL.FRAGMENT_SHADER, Light._shadowmap_2d_enabled_code, "" );
shadowmapping_2D_hard_shader_block.register();
Light.shadowmapping_2D_hard_shader_block = shadowmapping_2D_hard_shader_block;
//Light.registerShadowType( "hard", shadowmapping_hard_2d_shader_block );

var shadowmapping_2D_soft_block = new LS.ShaderBlock("testShadow2D_soft");
shadowmapping_2D_soft_block.addCode( GL.VERTEX_SHADER, Light._shadowmap_vertex_enabled_code, Light._shadowmap_vertex_disabled_code );
shadowmapping_2D_soft_block.addCode( GL.FRAGMENT_SHADER, Light._shadowmap_2d_enabled_code, "" );
shadowmapping_2D_soft_block.register();
Light.shadowmapping_2D_soft_block = shadowmapping_2D_soft_block;
//Light.registerShadowType( "soft", shadowmappingsoft_block );


// ENVIRONMENT *************************************
var environment_code = "\n\
	#ifdef ENVIRONMENT_TEXTURE\n\
		uniform sampler2D environment_texture;\n\
	#endif\n\
	#ifdef ENVIRONMENT_CUBEMAP\n\
		uniform samplerCube environment_texture;\n\
	#endif\n\
	vec2 polarToCartesian(in vec3 V)\n\
	{\n\
		return vec2( 0.5 - (atan(V.z, V.x) / -6.28318531), asin(V.y) / 1.57079633 * 0.5 + 0.5);\n\
	}\n\
	\n\
	vec3 getEnvironmentColor( vec3 V, float area )\n\
	{\n\
		#ifdef ENVIRONMENT_TEXTURE\n\
			vec2 uvs = polarToCartesian(V);\n\
			return texture2D( environment_texture, uvs ).xyz;\n\
		#endif\n\
		#ifdef ENVIRONMENT_CUBEMAP\n\
			return textureCube( environment_texture, -V ).xyz;\n\
		#endif\n\
		return u_background_color.xyz;\n\
	}\n\
";
var environment_disabled_code = "\n\
	vec3 getEnvironmentColor( vec3 V, float area )\n\
	{\n\
		return u_background_color.xyz;\n\
	}\n\
";

var environment_cubemap_block = new LS.ShaderBlock("environment_cubemap");
environment_cubemap_block.addCode( GL.FRAGMENT_SHADER, environment_code, environment_disabled_code, { ENVIRONMENT_CUBEMAP: "" } );
environment_cubemap_block.defineContextMacros({ENVIRONMENTBLOCK:"environment_cubemap"});
environment_cubemap_block.register();

var environment_2d_block = new LS.ShaderBlock("environment_2D");
environment_2d_block.defineContextMacros({ENVIRONMENTBLOCK:"environment_2D"});
environment_2d_block.addCode( GL.FRAGMENT_SHADER, environment_code, environment_disabled_code, { ENVIRONMENT_TEXTURE: "" } );
environment_2d_block.register();

var environment_block = new LS.ShaderBlock("environment");
environment_block.addCode( GL.FRAGMENT_SHADER, environment_code, environment_disabled_code );
environment_block.register();


var reflection_code = "\n\
	#pragma shaderblock ENVIRONMENTBLOCK \"environment\"\n\
	\n\
	vec4 applyReflection( Input IN, SurfaceOutput o, vec4 final_color )\n\
	{\n\
		vec3 R = reflect( IN.viewDir, o.Normal );\n\
		vec3 bg = vec3(0.0);\n\
		//is last pass for this object?\n\
		if(u_light_info.w == 0.0 || u_light_info.z == (u_light_info.w - 1.0))\n\
			bg = getEnvironmentColor( R, 0.0 );\n\
		final_color.xyz = mix( final_color.xyz, bg, clamp( o.Reflectivity, 0.0, 1.0) );\n\
		return final_color;\n\
	}\n\
";

var reflection_disabled_code = "\n\
	vec4 applyReflection( Input IN, SurfaceOutput o, vec4 final_color )\n\
	{\n\
		return final_color;\n\
	}\n\
";

var reflection_block = new LS.ShaderBlock("applyReflection");
ShaderMaterial.reflection_block = reflection_block;
reflection_block.addCode( GL.FRAGMENT_SHADER, reflection_code, reflection_disabled_code );
reflection_block.register();

// IRRADIANCE *************************************
var irradiance_code = "\n\
	uniform samplerCube irradiance_texture;\n\
	\n\
	void applyIrradiance( in SurfaceOutput o, inout FinalLight FINALLIGHT )\n\
	{\n\
		FINALLIGHT.Ambient *= textureCube( irradiance_texture, o.Normal ).xyz;\n\
	}\n\
";

var irradiance_disabled_code = "\n\
	void applyIrradiance( in SurfaceOutput o, inout FinalLight FINALLIGHT )\n\
	{\n\
	}\n\
";

var irradiance_block = new LS.ShaderBlock("applyIrradiance");
ShaderMaterial.irradiance_block = irradiance_block;
irradiance_block.addCode( GL.FRAGMENT_SHADER, irradiance_code, irradiance_disabled_code );
irradiance_block.register();
