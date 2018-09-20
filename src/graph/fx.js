///@INFO: GRAPHS
if(typeof(LiteGraph) != "undefined")
{

var litegraph_texture_found = false;
if(typeof(LGraphTexture) == "undefined")
	console.error("LiteGraph found but no LGraphTexture, this means LiteGL wasnt not included BEFORE litegraph. Be sure to include LiteGL before LiteGraph to ensure all functionalities.");
else
	litegraph_texture_found = true;



// Texture Blur *****************************************
function LGraphFXStack()
{
	this.addInput("Color","Texture");
	this.addInput("Depth","Texture");
	this.addInput("Intensity","number");
	this.addOutput("Final","Texture");
	this.properties = { intensity: 1, preserve_aspect: true };

	this._fx_stack = new LS.FXStack();
	this._fx_options = {};
}

LGraphFXStack.title = "FXStack";
LGraphFXStack.desc = "Apply FXs to Texture";

LGraphFXStack.prototype.onExecute = function()
{
	var tex = this.getInputData(0);
	if(!tex)
		return;

	if(!this.isOutputConnected(0))
		return; //saves work

	var temp = this._final_texture;

	if(!temp || temp.width != tex.width || temp.height != tex.height || temp.type != tex.type )
	{
		//we need two textures to do the blurring
		this._final_texture = new GL.Texture( tex.width, tex.height, { type: tex.type, format: gl.RGBA, filter: gl.LINEAR });
	}

	if( this.isInputConnected(1) )
		this._fx_options.depth_texture = this.getInputData(1);

	var intensity = this.properties.intensity;
	if( this.isInputConnected(2) )
	{
		intensity = this.getInputData(2);
		this.properties.intensity = intensity;
	}

	//blur sometimes needs an aspect correction
	var aspect = LiteGraph.camera_aspect;
	if(!aspect && window.gl !== undefined)
		aspect = gl.canvas.height / gl.canvas.width;
	if(!aspect)
		aspect = 1;
	aspect = this.properties.preserve_aspect ? aspect : 1;

	this._fx_stack.applyFX( tex, this._final_texture, this._fx_options );

	this.setOutputData(0, this._final_texture);
}

LGraphFXStack.prototype.inspect = function( inspector )
{
	return this._fx_stack.inspect( inspector );
}

LGraphFXStack.prototype.getResources = function( resources )
{
	return this._fx_stack.getResources( resources );
}

LGraphFXStack.prototype.onSerialize = function( o )
{
	o.stack = this._fx_stack.serialize();
}

LGraphFXStack.prototype.onConfigure = function( o )
{
	if(o.stack)
		this._fx_stack.configure( o.stack );
}

LiteGraph.registerNodeType("texture/fxstack", LGraphFXStack );




function LGraphCameraMotionBlur()
{
	this.addInput("color","Texture");
	this.addInput("depth","Texture");
	this.addInput("camera","Camera");
	this.addOutput("out","Texture");
	this.properties = { enabled: true, intensity: 1, ghosting_mitigation: true, ghosting_threshold: 0.4, freeze_camera: false, precision: LGraphTexture.DEFAULT };

	this._inv_matrix = mat4.create();
	this._previous_viewprojection_matrix = mat4.create();

	this._uniforms = { 
		u_color_texture:0,
		u_depth_texture:1,
		u_inv_vp: this._inv_matrix,
		u_intensity: 1,
		u_camera_planes: null,
		u_viewprojection_matrix: null,
		u_previous_viewprojection_matrix: this._previous_viewprojection_matrix
	};
}

LGraphCameraMotionBlur.widgets_info = {
	"precision": { widget:"combo", values: litegraph_texture_found ? LGraphTexture.MODE_VALUES : [] }
};

LGraphCameraMotionBlur.title = "Camera Motion Blur";
LGraphCameraMotionBlur.desc = "A motion blur but only for camera movement";

LGraphCameraMotionBlur.prototype.onExecute = function()
{
	var tex = this.getInputData(0);
	var depth = this.getInputData(1);
	var camera = this.getInputData(2);

	if( !this.isOutputConnected(0) || !tex || !depth || !camera)
		return; //saves work

	var enabled = this.getInputData(3);
	if(enabled != null)
		this.properties.enabled = Boolean( enabled );

	if(this.properties.precision === LGraphTexture.PASS_THROUGH || this.properties.enabled === false )
	{
		this.setOutputData(0, tex);
		return;
	}

	var width = tex.width;
	var height = tex.height;
	var type = this.precision === LGraphTexture.LOW ? gl.UNSIGNED_BYTE : gl.HIGH_PRECISION_FORMAT;
	if (this.precision === LGraphTexture.DEFAULT)
		type = tex.type;
	if(!this._tex || this._tex.width != width || this._tex.height != height || this._tex.type != type )
		this._tex = new GL.Texture( width, height, { type: type, format: gl.RGBA, filter: gl.LINEAR });

	if(!LGraphCameraMotionBlur._shader)
	{
		LGraphCameraMotionBlur._shader = new GL.Shader( GL.Shader.SCREEN_VERTEX_SHADER, LGraphCameraMotionBlur.pixel_shader );
		LGraphCameraMotionBlur._shader_no_ghosting = new GL.Shader( GL.Shader.SCREEN_VERTEX_SHADER, LGraphCameraMotionBlur.pixel_shader, { GHOST_CORRECTION: "" } );
	}

	var shader = this.properties.ghosting_mitigation ? LGraphCameraMotionBlur._shader_no_ghosting : LGraphCameraMotionBlur._shader;

	var inv = this._inv_matrix;
	var vp = camera._viewprojection_matrix;
	var prev = this._previous_viewprojection_matrix;
	var optimize = false; //skip algorithm when camera hasnt moved
	var intensity = this.properties.intensity;

	var uniforms = this._uniforms;
	uniforms.u_intensity = intensity;
	uniforms.u_viewprojection_matrix =  camera._viewprojection_matrix;
	uniforms.u_camera_planes =  camera._uniforms.u_camera_planes;
	uniforms.u_ghosting_threshold = this.properties.ghosting_threshold || 0.4;

	var diff = 0;
	for(var i = 0; i < prev.length; ++i)
		diff += Math.abs( vp[i] - prev[i] );
	if(diff < 0.0001 && optimize) //no camera movement, skip process
	{
		tex.copyTo( this._tex );
	}
	else
	{
		mat4.invert( inv, camera._viewprojection_matrix );
		this._tex.drawTo(function() {
			gl.disable( gl.DEPTH_TEST );
			gl.disable( gl.CULL_FACE );
			gl.disable( gl.BLEND );
			tex.bind(0);
			depth.bind(1);
			var mesh = Mesh.getScreenQuad();
			shader.uniforms( uniforms ).draw( mesh );
		});
	}

	if(!this.properties.freeze_camera)
		prev.set( camera._viewprojection_matrix );

	this.setOutputData( 0, this._tex );
}

LGraphCameraMotionBlur.prototype.onGetInputs = function()
{
	return [["enabled","boolean"]];
}

LGraphCameraMotionBlur.pixel_shader = "precision highp float;\n\
		\n\
		uniform sampler2D u_color_texture;\n\
		uniform sampler2D u_depth_texture;\n\
		varying vec2 v_coord;\n\
		uniform mat4 u_inv_vp;\n\
		uniform mat4 u_viewprojection_matrix;\n\
		uniform mat4 u_previous_viewprojection_matrix;\n\
		uniform vec2 u_camera_planes;\n\
		uniform float u_intensity;\n\
		uniform float u_ghosting_threshold;\n\
		#define SAMPLES 16\n\
		\n\
		void main() {\n\
			vec2 uv = v_coord;\n\
			float depth = texture2D(u_depth_texture, uv).x;\n\
			float zNear = u_camera_planes.x;\n\
			float zFar = u_camera_planes.y;\n\
			//float z = (2.0 * zNear) / (zFar + zNear - depth * (zFar - zNear));\n\
			depth = depth * 2.0 - 1.0;\n\
			float z = zNear * (depth + 1.0) / (zFar + zNear - depth * (zFar - zNear));\n\
			vec4 screenpos = vec4( uv * 2.0 - vec2(1.0), depth, 1.0 );\n\
			vec4 pos = u_inv_vp * screenpos;\n\
			pos /= pos.w;\n\
			vec4 old_screenpos = u_previous_viewprojection_matrix * pos;\n\
			old_screenpos /= old_screenpos.w;\n\
			vec2 uv_final = old_screenpos.xy * 0.5 + vec2(0.5);\n\
			vec2 uv_delta = (uv_final - uv);\n\
			uv -= uv_delta * 0.5;\n\
			//uv_delta *= 1.0 - z;\n\
			uv_delta *= u_intensity / float(SAMPLES);\n\
			vec4 color = vec4(0.0);\n\
			float total = 0.0;\n\
			float amount = 1.0;\n\
			for(int i = 0; i < SAMPLES; ++i)\n\
			{\n\
				#ifdef GHOST_CORRECTION\n\
					float old_depth = texture2D(u_depth_texture, uv).x;\n\
					old_depth = old_depth * 2.0 - 1.0;\n\
					float old_z = zNear * (old_depth + 1.0) / (zFar + zNear - old_depth * (zFar - zNear));\n\
					if( abs(old_z - z) > u_ghosting_threshold )\n\
					{\n\
						uv += uv_delta;\n\
						continue;\n\
					}\n\
				#endif\n\
				color += texture2D( u_color_texture, uv );\n\
				uv += uv_delta;\n\
				total += amount;\n\
			}\n\
			gl_FragColor = color / total;\n\
			//gl_FragColor = vec4( abs( old_screenpos.xy ), 1.0, 1.0 );\n\
			//gl_FragColor = texture2D( u_color_texture, uv_final );\n\
			//gl_FragColor = vec4( abs( pos.xyz * 0.001 ), 1.0 );\n\
			//gl_FragColor = vec4( vec3( abs(old_z - z) ), 1.0);\n\
		}\n\
		";

LiteGraph.registerNodeType("texture/motionBlur", LGraphCameraMotionBlur );


/* not finished

function LGraphVolumetricLight()
{
	this.addInput("color","Texture");
	this.addInput("depth","Texture");
	this.addInput("camera","Camera");
	this.addInput("light","Light,Component");
	this.addOutput("out","Texture");
	this.properties = { enabled: true, intensity: 1, precision: LGraphTexture.DEFAULT };

	this._inv_matrix = mat4.create();

	this._uniforms = { 
		u_color_texture:0,
		u_depth_texture:1,
		u_shadow_texture:2,
		u_intensity: 1,
		u_camera_planes: null,
		u_inv_vp: this._inv_matrix
	};
}

LGraphVolumetricLight.widgets_info = {
	"precision": { widget:"combo", values: LGraphTexture.MODE_VALUES }
};

LGraphVolumetricLight.title = "Volumetric Light";
LGraphVolumetricLight.desc = "Adds fog with volumetric light";

LGraphVolumetricLight.prototype.onExecute = function()
{
	var tex = this.getInputData(0);
	var depth = this.getInputData(1);
	var camera = this.getInputData(2);
	var light = this.getInputData(3);

	if( !this.isOutputConnected(0) || !tex || !depth || !camera || !light || !light._shadowmap )
		return; //saves work

	var enabled = this.getInputData(4);
	if(enabled != null)
		this.properties.enabled = Boolean( enabled );

	if(this.properties.precision === LGraphTexture.PASS_THROUGH || this.properties.enabled === false )
	{
		this.setOutputData(0, tex);
		return;
	}

	var width = tex.width;
	var height = tex.height;
	var type = this.precision === LGraphTexture.LOW ? gl.UNSIGNED_BYTE : gl.HIGH_PRECISION_FORMAT;
	if (this.precision === LGraphTexture.DEFAULT)
		type = tex.type;
	if(!this._tex || this._tex.width != width || this._tex.height != height || this._tex.type != type )
		this._tex = new GL.Texture( width, height, { type: type, format: gl.RGBA, filter: gl.LINEAR });

	if(!LGraphVolumetricLight._shader_spot)
	{
		LGraphVolumetricLight._shader_spot = new GL.Shader( GL.Shader.SCREEN_VERTEX_SHADER, LGraphVolumetricLight.pixel_shader, { USE_SPOT:"" } );
		LGraphVolumetricLight._shader_directional = new GL.Shader( GL.Shader.SCREEN_VERTEX_SHADER, LGraphVolumetricLight.pixel_shader, { USE_DIRECTIONAL:"" } );
		//LGraphVolumetricLight._shader_omni = new GL.Shader( GL.Shader.SCREEN_VERTEX_SHADER, LGraphVolumetricLight.pixel_shader, { USE_OMNI:"" } );
	}

	var shader = null;

	switch( light.type )
	{
		case LS.Light.SPOT: shader = LGraphVolumetricLight._shader_spot; break;
		case LS.Light.DIRECTIONAL: shader = LGraphVolumetricLight._shader_directional; break;
		case LS.Light.OMNI: //shader = LGraphVolumetricLight._shader_omni;
			//not supported yet
			console.warn("volumetric light not supported for omni lights");
			this.properties.enabled = false;
			return;
			break;
		default:
			return;
	}

	var vp = camera._viewprojection_matrix;
	var intensity = this.properties.intensity;
	var inv = this._inv_matrix;
	mat4.invert( inv, camera._viewprojection_matrix );

	var shadow = light._shadowmap;

	var uniforms = this._uniforms;
	uniforms.u_intensity = intensity;
	uniforms.u_camera_planes = camera._uniforms.u_camera_planes;
	uniforms.u_light_viewprojection_matrix = light._light_matrix;
	uniforms.u_shadow_params = light._uniforms.u_shadow_params;
	uniforms.u_light_color = light._uniforms.u_light_color;

	this._tex.drawTo(function() {
		gl.disable( gl.DEPTH_TEST );
		gl.disable( gl.CULL_FACE );
		gl.disable( gl.BLEND );
		tex.bind(0);
		depth.bind(1);
		shadow.bind(2);
		var mesh = Mesh.getScreenQuad();
		shader.uniforms( uniforms ).draw( mesh );
	});

	this.setOutputData( 0, this._tex );
}

LGraphVolumetricLight.prototype.onGetInputs = function()
{
	return [["enabled","boolean"]];
}

LGraphVolumetricLight.pixel_shader = "precision highp float;\n\
		\n\
		uniform sampler2D u_color_texture;\n\
		uniform sampler2D u_depth_texture;\n\
		uniform sampler2D u_shadow_texture;\n\
		varying vec2 v_coord;\n\
		uniform mat4 u_inv_vp;\n\
		uniform mat4 u_light_viewprojection_matrix;\n\
		uniform vec2 u_camera_planes;\n\
		uniform vec4 u_shadow_params;\n\
		uniform vec3 u_light_color;\n\
		uniform float u_intensity;\n\
		#define SAMPLES 16\n\
		\n\
		void main() {\n\
			vec2 uv = v_coord;\n\
			vec4 color = texture2D(u_color_texture, uv);\n\
			float depth = texture2D(u_depth_texture, uv).x;\n\
			float zNear = u_camera_planes.x;\n\
			float zFar = u_camera_planes.y;\n\
			//float z = (2.0 * zNear) / (zFar + zNear - depth * (zFar - zNear));\n\
			depth = depth * 2.0 - 1.0;\n\
			float z = zNear * (depth + 1.0) / (zFar + zNear - depth * (zFar - zNear));\n\
			vec4 screenpos = vec4( uv * 2.0 - vec2(1.0), depth, 1.0 );\n\
			vec4 farpos = u_inv_vp * screenpos;\n\
			farpos /= farpos.w;\n\
			screenpos.z = 0.0;\n\
			vec4 nearpos = u_inv_vp * screenpos;\n\
			nearpos.xyz /= nearpos.w;\n\
			vec3 delta = (farpos.xyz - nearpos.xyz) / float(SAMPLES);\n\
			vec4 current_pos = vec4( nearpos.xyz, 1.0 );\n\
			float brightness = 0.0;\n\
			float bias = u_shadow_params.y;\n\
			for(int i = 0; i < SAMPLES; ++i)\n\
			{\n\
				vec4 light_uv = u_light_viewprojection_matrix * current_pos;\n\
				light_uv.xy /= light_uv.w;\n\
				light_uv.xy = light_uv.xy * 0.5 + vec2(0.5);\n\
				float shadow_depth = texture2D( u_shadow_texture, light_uv.xy ).x;\n\
				if (((light_uv.z - bias) / light_uv.w * 0.5 + 0.5) > shadow_depth )\n\
					brightness += 1.0;\n\
				current_pos.xyz += delta;\n\
			}\n\
			color.xyz += u_light_color * brightness / float(SAMPLES);\n\
			gl_FragColor = color;\n\
		}\n\
		";

LiteGraph.registerNodeType("texture/volumetric_light", LGraphVolumetricLight );
*/







}