///@INFO: UNCOMMON
function FogFX(o)
{
	this.enabled = true;
	this.start = 100;
	this.end = 1000;
	this.density = 0.001;
	this.type = FogFX.LINEAR;
	this.color = vec3.fromValues(0.5,0.5,0.5);

	this._uniforms = {
		u_fog_info: vec3.create(),
		u_fog_color: this.color
	}

	if(o)
		this.configure(o);
}

FogFX.icon = "mini-icon-fog.png";

FogFX.LINEAR = 1;
FogFX.EXP = 2;
FogFX.EXP2 = 3;

FogFX["@color"] = { type: "color" };
FogFX["@density"] = { type: "number", min: 0, max:1, step:0.0001, precision: 4 };
FogFX["@type"] = { type:"enum", values: {"linear": FogFX.LINEAR, "exponential": FogFX.EXP, "exponential 2": FogFX.EXP2 }};


FogFX.prototype.onAddedToScene = function(scene)
{
	//LEvent.bind( scene,"fillLightUniforms",this.fillUniforms,this);
	LEvent.bind( scene, "fillSceneUniforms",this.fillSceneUniforms,this);

}

FogFX.prototype.onRemovedFromScene = function(scene)
{
	//LEvent.unbind(Scene,"fillLightUniforms",this.fillUniforms,this);
	LEvent.unbind( scene, "fillSceneUniforms",this.fillSceneUniforms, this);
}

FogFX.prototype.fillSceneUniforms = function( e, uniforms )
{
	if(!this.enabled)
		return;

	this._uniforms.u_fog_info[0] = this.start;
	this._uniforms.u_fog_info[1] = this.end;
	this._uniforms.u_fog_info[2] = this.density;
	this._uniforms.u_fog_color = this.color;

	ONE.Renderer.enableFrameShaderBlock( "fog", this._uniforms );
}

ONE.registerComponent(FogFX);

//shaderblock
var fog_block = new ONE.ShaderBlock("fog");
//fog_block.addInclude("computeFog");
fog_block.bindEvent("fs_functions", "	uniform vec3 u_fog_info;\n	uniform vec3 u_fog_color;\n");
fog_block.bindEvent("fs_final_pass", "	if(u_light_info.z == 0.0) { float cam_dist = length(u_camera_eye - v_pos);\n	float fog = 1. - 1.0 / exp(max(0.0,cam_dist - u_fog_info.x) * u_fog_info.z);\n	final_color.xyz = mix(final_color.xyz, u_fog_color, fog);\n}\n\n");
fog_block.register();
FogFX.block = fog_block;

/*
//apply fog
vec3 computeFog( vec3 color, float cam_dist, float height )
{
	#ifdef USE_FOG_EXP
		float fog = 1. - 1.0 / exp(max(0.0,cam_dist - u_fog_info.x) * u_fog_info.z);
	#elif defined(USE_FOG_EXP2)
		float fog = 1. - 1.0 / exp(pow(max(0.0,cam_dist - u_fog_info.x) * u_fog_info.z,2.0));
	#else
		float fog = 1. - clamp((u_fog_info.y - cam_dist) / (u_fog_info.y - u_fog_info.x),0.,1.);
	#endif
	#ifdef FIRST_PASS
		return mix(color, u_fog_color, fog);
	#else
		return mix(color, vec3(0.0), fog);
	#endif
}
*/

