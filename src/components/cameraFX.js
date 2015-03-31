/**
* This component allow to create basic FX
* @class CameraFX
* @param {Object} o object with the serialized info
*/
function CameraFX(o)
{
	this.enabled = true;
	this.use_viewport_size = true;
	this.use_high_precision = false;
	this.use_antialiasing = false;

	this.fx = [];

	if(o)
		this.configure(o);

	//debug
	//this.addFX("threshold");
}

CameraFX.icon = "mini-icon-camera.png";
CameraFX.buffer_size = [1024,512];

CameraFX.available_fx = {
	"brightness/contrast": {
		name: "Brightness & Contrast",
		uniforms: {
			brightness: { name: "u_brightness", type: "float", value: 1, min: 0, max: 2, step: 0.01 },
			contrast: { name: "u_contrast", type: "float", value: 1, min: 0, max: 2, step: 0.01 }
		},
		code:"color.xyz = (color.xyz * u_brightness@ - vec3(0.5)) * u_contrast@ + vec3(0.5);"
	},
	"invert": {
		name: "Invert color",
		code:"color.xyz = vec3(1.0) - color.xyz;"
	},
	"threshold": {
		name: "Threshold",
		uniforms: {
			threshold: { name: "u_threshold", type: "float", value: 0.5, min: 0, max: 2, step: 0.01 },
			threshold_width: { name: "u_threshold_width", type: "float", value: 0.01, min: 0, max: 1, step: 0.001 }
		},
		code:"color.xyz = vec3( smoothstep( u_threshold@ - u_threshold_width@ * 0.5, u_threshold@ + u_threshold_width@ * 0.5,  length(color.xyz) ));"
	},
	"colorize": {
		name: "Colorize",
		uniforms: {
			colorize: { name: "u_colorize", type: "color3", value: [1,1,1] },
			vibrance: { name: "u_vibrance", type: "float", value: 0.0, min: 0, max: 2, step: 0.01 }
		},
		code:"color.xyz = color.xyz * (u_colorize@ + vec3(u_vibrance@ * 0.1)) * (1.0 + u_vibrance@);"
	},
	"halftone": {
		name: "Halftone",
		uniforms: {
			halftone_angle: { name: "u_halftone_angle", type: "float", value: 0, step: 0.01 },
			halftone_size: { name: "u_halftone_size", type: "float", value: 1, step: 0.01 }
		},
		functions: ["pattern"],
		code:"color.x = ( (color.x * 10.0 - 5.0) + pattern( u_halftone_angle@, u_halftone_size@ ) );" + 
			"color.y = ( (color.y * 10.0 - 5.0) + pattern( u_halftone_angle@ + 0.167, u_halftone_size@ ) );" + 
			"color.z = ( (color.z * 10.0 - 5.0) + pattern( u_halftone_angle@ + 0.333, u_halftone_size@ ) );"
	},
	"halftone B/N": {
		name: "HalftoneBN",
		uniforms: {
			halftone_angle: { name: "u_halftone_angle", type: "float", value: 0, step: 0.01 },
			halftone_size: { name: "u_halftone_size", type: "float", value: 1, step: 0.01 }
		},
		functions: ["pattern"],
		code:"color.xyz = vec3( (length(color.xyz) * 10.0 - 5.0) + pattern( u_halftone_angle@, u_halftone_size@ ) );"
	}
};

CameraFX.available_functions = {
	pattern: "float pattern(float angle, float size) {\n\
				float s = sin(angle * 3.1415), c = cos(angle * 3.1415);\n\
				vec2 tex = v_coord * u_viewport.xy;\n\
				vec2 point = vec2( c * tex.x - s * tex.y , s * tex.x + c * tex.y ) * size;\n\
				return (sin(point.x) * sin(point.y)) * 4.0;\n\
			}\n\
		"
}

/**
* Returns the first component of this container that is of the same class
* @method configure
* @param {Object} o object with the configuration info from a previous serialization
*/
CameraFX.prototype.configure = function(o)
{
	this.enabled = !!o.enabled;
	this.use_viewport_size = !!o.use_viewport_size;
	this.use_high_precision = !!o.use_high_precision;
	this.use_antialiasing = !!o.use_antialiasing;

}

CameraFX.prototype.serialize = function()
{
	return { 
		enabled: this.enabled,
		use_antialiasing: this.use_antialiasing,
		use_high_precision: this.use_high_precision,
		use_viewport_size: this.use_viewport_size
	};
}

CameraFX.prototype.getResources = function(res)
{
	//TODO
	return res;
}

CameraFX.prototype.addFX = function(name)
{
	this.fx.push({ name: name });
}

CameraFX.prototype.onAddedToNode = function(node)
{
	//global
	LEvent.bind( LS.GlobalScene, "beforeRenderMainPass", this.onBeforeRender, this );
}

CameraFX.prototype.onRemovedFromNode = function(node)
{
	//global
	LEvent.unbind(LS.GlobalScene, "beforeRenderMainPass", this.onBeforeRender, this );
}

//hook the RFC
CameraFX.prototype.onBeforeRender = function(e, render_options)
{
	if(!this.enabled)
		return;

	if(!this._renderFrameContainer)
	{
		this._renderFrameContainer = new LS.RenderFrameContainer();
		this._renderFrameContainer.component = this;
		this._renderFrameContainer.onPreRender = this.onPreRender;
		this._renderFrameContainer.onPostRender = this.onPostRender;
	}
	LS.Renderer.assignGlobalRenderFrameContainer( this._renderFrameContainer );
}

//Executed inside RFC
CameraFX.prototype.onPreRender = function( cameras, render_options )
{
	var width = CameraFX.buffer_size[0];
	var height = CameraFX.buffer_size[1];
	if( this.component.use_viewport_size )
	{
		width = gl.canvas.width;
		height = gl.canvas.height;
	}

	this.startFBO( width, height, this.component.use_high_precision, cameras[0] );
}

CameraFX.prototype.onPostRender = function()
{
	this.endFBO();

	var frame = this.color_texture;

	var component = this.component;
	var fxs = component.fx;

	//shadercode: TODO, do this in a lazy way
	var key = "";
	var update_shader = true;
	for(var i = 0; i < fxs.length; i++)
		key += fxs[i] + "|";
	if(key == this._last_shader_key)
		update_shader = false;
	this._last_shader_key = key;

	var code = "";
	var included_functions = {};
	var uniforms_code = "";
	var uniforms = { u_viewport: vec2.fromValues(frame.width, frame.height) };

	var fx_id = 0;
	for(var i = 0; i < fxs.length; i++)
	{
		var fx = fxs[i];
		fx_id = i;
		var fx_info = CameraFX.available_fx[ fx.name ];
		if(!fx_info)
			continue;
		if(update_shader)
		{
			if(fx_info.functions)
				for(var z in fx_info.functions)
					included_functions[ fx_info.functions[z] ] = true;
			code += fx_info.code.split("@").join( fx_id ) + ";\n";
		}
		if(fx_info.uniforms)
			for(var j in fx_info.uniforms)
			{
				var uniform = fx_info.uniforms[j];
				var varname = uniform.name + fx_id;
				if(update_shader)
				{
					uniforms_code += "uniform " + uniform.type + " " + varname + ";\n";
				}
				uniforms[ varname ] = fx[j] !== undefined ? fx[j] : uniform.value;
			}
	}


	var shader = null;
	if(update_shader)
	{
		var functions_code = "";
		for(var i in included_functions)
		{
			var func = CameraFX.available_functions[ i ];
			if(!func)
			{
				console.error("CameraFX: Function not found: " + i);
				continue;
			}
			functions_code += func + "\n";
		}

		var fullcode = "precision highp float;\n\
			#define color3 vec3\n\
			#define color4 vec4\n\
			uniform sampler2D u_texture;\n\
			varying vec2 v_coord;\n\
			uniform vec2 u_viewport;\n\
			" + uniforms_code + "\n\
			" + functions_code + "\n\
			void main() {\n\
				vec4 color = texture2D(u_texture, v_coord);\n\
				float temp = 0.0;\n\
				" + code + "\n\
				gl_FragColor = color;\n\
			}\n\
			";

		this._last_shader = new GL.Shader( GL.Shader.SCREEN_VERTEX_SHADER, fullcode );
	}

	shader = this._last_shader;

	//apply FX HERE
	frame.toViewport(shader, uniforms);
}


LS.registerComponent(CameraFX);