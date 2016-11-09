/** FXStack
* Helps apply a stack of FXs to a texture with as fewer render calls as possible with low memory footprint
* Used by CameraFX and FrameFX but also available for any other use
* You can add new FX to the FX pool if you want.
* @class FXStack
*/
function FXStack( o )
{
	this.apply_fxaa = false;
	this.filter = true;
	this.fx = [];

	this._uniforms = { u_aspect: 1, u_viewport: vec2.create(), u_iviewport: vec2.create(), u_texture: 0, u_depth_texture: 1, u_random: vec2.create() };

	this._passes = []; //WIP

	if(o)
		this.configure(o);
}

FXStack.available_fx = {
	"brightness_contrast": {
		name: "Brightness & Contrast",
		uniforms: {
			brightness: { name: "u_brightness", type: "float", value: 1, step: 0.01 },
			contrast: { name: "u_contrast", type: "float", value: 1, step: 0.01 }
		},
		code:"color.xyz = (color.xyz * u_brightness@ - vec3(0.5)) * u_contrast@ + vec3(0.5);"
	},
	"hue_saturation": {
		name: "Hue & Saturation",
		functions: ["HSV"],
		uniforms: {
			hue: { name: "u_hue", type: "float", value: 0, step: 0.01 },
			saturation: { name: "u_saturation", type: "float", value: 1, step: 0.01 },
			brightness: { name: "u_brightness", type: "float", value: 0, step: 0.01 }
		},
		code:"color.xyz = rgb2hsv(color.xyz); color.xz += vec2(u_hue@,u_brightness@); color.y *= u_saturation@; color.xyz = hsv2rgb(color.xyz);"
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
	"color_add": {
		name: "Color add",
		uniforms: {
			color_add: { name: "u_coloradd", type: "color3", value: [0.1,0.1,0.1] }
		},
		code:"color.xyz = color.xyz + u_coloradd@;"
	},
	"fog":{
		name:"fog",
		uniforms: {
			fog_color: { name: "u_fog_color", type: "color3", value: [0.1,0.1,0.1] },
			fog_start: { name: "u_fog_start", type: "float", value: 10 },
			fog_density: { name: "u_fog_density", type: "float", precision: 0.00001, value: 0.001, step: 0.00001 }
		},
		code:"float z_n@ = 2.0 * texture2D( u_depth_texture, v_coord).x - 1.0;" +
			"float cam_dist@ = 2.0 * u_depth_range.x * u_depth_range.y / (u_depth_range.y + u_depth_range.x - z_n@ * (u_depth_range.y - u_depth_range.x));" +
			"float fog_factor@ = 1. - 1.0 / exp(max(0.0,cam_dist@ - u_fog_start@) * u_fog_density@);" +
			"color.xyz = mix( color.xyz, u_fog_color@, fog_factor@ );"
	},
	"vigneting": {
		name: "Vigneting",
		uniforms: {
			radius: { name: "u_radius", type: "float", value: 1 },
			intensity: { name: "u_vigneting", type: "float", value: 1, min: 0, max: 2, step: 0.01 }
		},
		code:"color.xyz = mix( color.xyz * max( 1.0 - (dist_to_center * u_radius@ / 0.7071), 0.0), color.xyz, u_vigneting@);"
	},
	"aberration": {
		name: "Chromatic Aberration",
		pass: "before",
		uniforms: {
			difraction: { name: "u_difraction", type: "float", value: 1 }
		},
		next_pass: true,
		code: "color.x = texture2D(u_texture, uv - to_center * 0.001 * u_difraction@ ).x;" + 
			"color.z = texture2D(u_texture, uv + to_center * 0.001 * u_difraction@ ).z;"
	},
	"halftone": {
		name: "Halftone",
		uniforms: {
			"Halftone angle": { name: "u_halftone_angle", type: "float", value: 0, step: 0.01 },
			"Halftone size": { name: "u_halftone_size", type: "float", value: 1, step: 0.01 }
		},
		functions: ["pattern"],
		code:"color.x = ( (color.x * 10.0 - 5.0) + pattern( u_halftone_angle@, u_halftone_size@ ) );" + 
			"color.y = ( (color.y * 10.0 - 5.0) + pattern( u_halftone_angle@ + 0.167, u_halftone_size@ ) );" + 
			"color.z = ( (color.z * 10.0 - 5.0) + pattern( u_halftone_angle@ + 0.333, u_halftone_size@ ) );"
	},
	"halftoneBN": {
		name: "Halftone B/N",
		uniforms: {
			"Halftone angle": { name: "u_halftone_angle", type: "float", value: 0, step: 0.01 },
			"Halftone size": { name: "u_halftone_size", type: "float", value: 1, step: 0.01 }
		},
		functions: ["pattern"],
		code:"color.xyz = vec3( (length(color.xyz) * 10.0 - 5.0) + pattern( u_halftone_angle@, u_halftone_size@ ) );"
	},
	"lens": {
		name: "Lens Distortion",
		uniforms: {
			lens_k: { name: "u_lens_k", type: "float", value: -0.15 },
			lens_kcube: { name: "u_lens_kcube", type: "float", value: 0.8 },
			lens_scale: { name: "u_lens_scale", type: "float", value: 1 }
		},
		uv_code:"float r2 = u_aspect * u_aspect * (uv.x-0.5) * (uv.x-0.5) + (uv.y-0.5) * (uv.y-0.5); float distort@ = 1. + r2 * (u_lens_k@ + u_lens_kcube@ * sqrt(r2)); uv = vec2( u_lens_scale@ * distort@ * (uv.x-0.5) + 0.5, u_lens_scale@  * distort@ * (uv.y-0.5) + 0.5 );"
	},
	"image": {
		name: "Image",
		uniforms: {
			image_texture: { name: "u_image_texture", type: "sampler2D", widget: "Texture", value: "" },
			image_alpha: { name: "u_image_alpha", type: "float", value: 1, step: 0.001 },
			image_scale: { name: "u_image_scale", type: "vec2", value: [1,1], step: 0.001 }
		},
		code:"vec4 image@ = texture2D( u_image_texture@, (uv - vec2(0.5)) * u_image_scale@ + vec2(0.5)); color.xyz = mix(color.xyz, image@.xyz, image@.a * u_image_alpha@ );"
	},
	"warp": {
		name: "Warp",
		uniforms: {
			warp_amp: { name: "u_warp_amp", type: "float", value: 0.01, step: 0.001 },
			warp_offset_x: { name: "u_warp_offset_x", type: "float", value: 0, step: 0.001 },
			warp_offset_y: { name: "u_warp_offset_y", type: "float", value: 0, step: 0.001 },
			warp_texture: { name: "u_warp_texture", type: "sampler2D", widget: "Texture", value: "" }
		},
		uv_code:"uv = uv + u_warp_amp@ * (texture2D( u_warp_texture@, uv + vec2(u_warp_offset_x@, u_warp_offset_y@) ).xy - vec2(0.5));"
	},
	"LUT": {
		name: "LUT",
		functions: ["LUT"],
		uniforms: {
			lut_intensity: { name: "u_lut_intensity", type: "float", value: 1, step: 0.01 },
			lut_texture: { name: "u_lut_texture", type: "sampler2D", filter: "nearest", wrap: "clamp", widget: "Texture", value: "" }
		},
		code:"color.xyz = mix(color.xyz, LUT( color.xyz, u_lut_texture@ ), u_lut_intensity@);"
	},
	"pixelate": {
		name: "Pixelate",
		uniforms: {
			width: { name: "u_width", type: "float", value: 256, step: 1, min: 1 },
			height: { name: "u_height", type: "float", value: 256, step: 1, min: 1 }
		},
		uv_code:"uv = vec2( floor(uv.x * u_width@) / u_width@, floor(uv.y * u_height@) / u_height@ );"
	},
	"quantize": {
		name: "Quantize",
		uniforms: {
			levels: { name: "u_levels", type: "float", value: 8, step: 1, min: 1 }
		},
		code:"color.xyz = floor(color.xyz * u_levels@) / u_levels@;"
	},
	"edges": {
		name: "Edges",
		uniforms: {
			"Edges factor": { name: "u_edges_factor", type: "float", value: 1 }
		},
		next_pass: true,
		code:"vec4 color@ = texture2D(u_texture, uv );\n\
				vec4 color_up@ = texture2D(u_texture, uv + vec2(0., u_iviewport.y));\n\
				vec4 color_right@ = texture2D(u_texture, uv + vec2(u_iviewport.x,0.));\n\
				vec4 color_down@ = texture2D(u_texture, uv + vec2(0., -u_iviewport.y));\n\
				vec4 color_left@ = texture2D(u_texture, uv + vec2(-u_iviewport.x,0.));\n\
				color = u_edges_factor@ * (abs(color@ - color_up@) + abs(color@ - color_down@) + abs(color@ - color_left@) + abs(color@ - color_right@));"
	},
	"depth": {
		name: "Depth",
		uniforms: {
			"near": { name: "u_near", type: "float", value: 0.01, step: 0.1 },
			"far": { name: "u_far", type: "float", value: 1000, step: 1 }
		},
		code:"color.xyz = vec3( (2.0 * u_near@) / (u_far@ + u_near@ - texture2D( u_depth_texture, uv ).x * (u_far@ - u_near@)) );"
	},
	"logarithmic": {
		name: "Logarithmic",
		uniforms: {
			"Log. A Factor": { name: "u_logfactor_a", type: "float", value: 2, step: 0.01 },
			"Log. B Factor": { name: "u_logfactor_b", type: "float", value: 2, step: 0.01 }
		},
		code:"color.xyz = log( color.xyz * u_logfactor_a@ ) * u_logfactor_b@;"
	},
	"ditherBN": {
		name: "dither B/N",
		functions: ["dither"],
		uniforms: {
		},
		code:"color.xyz = vec3( dither( color.x ) );"
	},
	"dither": {
		name: "Dither",
		functions: ["dither"],
		uniforms: {
		},
		code:"color.xyz = vec3( dither( color.x ), dither( color.y ), dither( color.z ) );"
	},
	"gamma": {
		name: "Gamma",
		uniforms: {
			"Gamma": { name: "u_gamma", type: "float", value: 2.2, step: 0.01 }
		},
		code:"color.xyz = pow( color.xyz, vec3( 1.0 / u_gamma@) );"
	},
	"noiseBN": {
		name: "Noise B&N",
		functions: ["noise"],
		uniforms: {
			"noise": { name: "u_noise", type: "float", value: 0.1, step: 0.01 }
		},
		code:"color.xyz += u_noise@ * vec3( noise( (u_random + v_coord) * u_viewport) );"
	}
	/*
	"blur": {
			name: "Blur",
			break_pass: true,
			uniforms: {
				"blur_intensity": { name: "u_blur_intensity", type: "float", value: 0.1, step: 0.01 }
			},
			local_callback: FXStack.applyBlur
		}
	}
	*/
};

//functions that could be used
FXStack.available_functions = {
	pattern: "float pattern(float angle, float size) {\n\
				float s = sin(angle * 3.1415), c = cos(angle * 3.1415);\n\
				vec2 tex = v_coord * u_viewport.xy;\n\
				vec2 point = vec2( c * tex.x - s * tex.y , s * tex.x + c * tex.y ) * size;\n\
				return (sin(point.x) * sin(point.y)) * 4.0;\n\
			}\n\
		",
	dither: "float dither(float v) {\n\
				vec2 pixel = v_coord * u_viewport;\n\
				int i = int(floor(clamp(v,0.0,1.0) * 16.0 + 0.5));\n\
				if(i < 1)\n\
					return 0.0;\n\
				if(i >= 15)\n\
					return 1.0;\n\
				float x = floor(pixel.x);\n\
				float y = floor(pixel.y);\n\
				bool xmod4 = mod(x, 4.0) == 0.0;\n\
				bool ymod4 = mod(y, 4.0) == 0.0;\n\
				bool xmod2 = mod(x, 2.0) == 0.0;\n\
				bool ymod2 = mod(y, 2.0) == 0.0;\n\
				bool xmod4_2 = mod(x + 2.0, 4.0) == 0.0;\n\
				bool ymod4_2 = mod(y + 2.0, 4.0) == 0.0;\n\
				bool xmod2_1 = mod(x + 1.0, 2.0) == 0.0;\n\
				bool ymod2_1 = mod(y + 1.0, 2.0) == 0.0;\n\
				bool xmod4_1 = mod(x + 1.0, 4.0) == 0.0;\n\
				bool ymod4_1 = mod(y + 1.0, 4.0) == 0.0;\n\
				bool xmod4_3 = mod(x + 3.0, 4.0) == 0.0;\n\
				bool ymod4_3 = mod(y + 3.0, 4.0) == 0.0;\n\
				\n\
				if(i < 9)\n\
				{\n\
					if(i >= 1 && xmod4 && ymod4 )\n\
						return 1.0;\n\
					if(i >= 2 && xmod4_2 && ymod4_2)\n\
						return 1.0;\n\
					if(i >= 3 && xmod4_2 && ymod2 )\n\
						return 1.0;\n\
					if(i >= 4 && xmod2 && ymod2 )\n\
						return 1.0;\n\
					if(i >= 5 && xmod4_1 && ymod4_1 )\n\
						return 1.0;\n\
					if(i >= 6 && xmod4_3 && ymod4_3 )\n\
						return 1.0;\n\
					if(i >= 7 && xmod4_1 && ymod4_3 )\n\
						return 1.0;\n\
					if(i >= 8 && xmod4_3 && ymod4_1 )\n\
						return 1.0;\n\
					return 0.0;\n\
				}\n\
				else\n\
				{\n\
					if(i < 15 && xmod4_1 && ymod4 )\n\
						return 0.0;\n\
					if(i < 14 && xmod4_3 && ymod4_2)\n\
						return 0.0;\n\
					if(i < 13 && xmod4_3 && ymod2 )\n\
						return 0.0;\n\
					if(i < 12 && xmod2_1 && ymod2 )\n\
						return 0.0;\n\
					if(i < 11 && xmod4_2 && ymod4_1 )\n\
						return 0.0;\n\
					if(i < 10 && xmod4 && ymod4_3 )\n\
						return 0.0;\n\
					return 1.0;\n\
				}\n\
			}\n\
		",
	LUT:  "vec3 LUT(in vec3 color, in sampler2D textureB) {\n\
		 lowp vec3 textureColor = clamp( color, vec3(0.0), vec3(1.0) );\n\
		 mediump float blueColor = textureColor.b * 63.0;\n\
		 mediump vec2 quad1;\n\
		 quad1.y = floor(floor(blueColor) / 8.0);\n\
		 quad1.x = floor(blueColor) - (quad1.y * 8.0);\n\
		 mediump vec2 quad2;\n\
		 quad2.y = floor(ceil(blueColor) / 8.0);\n\
		 quad2.x = ceil(blueColor) - (quad2.y * 8.0);\n\
		 highp vec2 texPos1;\n\
		 texPos1.x = (quad1.x * 0.125) + 0.5/512.0 + ((0.125 - 1.0/512.0) * textureColor.r);\n\
		 texPos1.y = 1.0 - ((quad1.y * 0.125) + 0.5/512.0 + ((0.125 - 1.0/512.0) * textureColor.g));\n\
		 highp vec2 texPos2;\n\
		 texPos2.x = (quad2.x * 0.125) + 0.5/512.0 + ((0.125 - 1.0/512.0) * textureColor.r);\n\
		 texPos2.y = 1.0 - ((quad2.y * 0.125) + 0.5/512.0 + ((0.125 - 1.0/512.0) * textureColor.g));\n\
		 lowp vec3 newColor1 = texture2D(textureB, texPos1).xyz;\n\
		 lowp vec3 newColor2 = texture2D(textureB, texPos2).xyz;\n\
		 lowp vec3 newColor = mix(newColor1, newColor2, fract(blueColor));\n\
		 return newColor.rgb;\n\
	 }",
	noise:  "\n\
		float hash(float n) { return fract(sin(n) * 1e4); }\n\
		float hash(vec2 p) { return fract(1e4 * sin(17.0 * p.x + p.y * 0.1) * (0.1 + abs(sin(p.y * 13.0 + p.x)))); }\n\
		float noise(float x) {\n\
			float i = floor(x);\n\
			float f = fract(x);\n\
			float u = f * f * (3.0 - 2.0 * f);\n\
			return mix(hash(i), hash(i + 1.0), u);\n\
		}\n\
		float noise(vec2 x) {\n\
			vec2 i = floor(x);\n\
			vec2 f = fract(x);\n\
			float a = hash(i);\n\
			float b = hash(i + vec2(1.0, 0.0));\n\
			float c = hash(i + vec2(0.0, 1.0));\n\
			float d = hash(i + vec2(1.0, 1.0));\n\
			vec2 u = f * f * (3.0 - 2.0 * f);\n\
			return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;\n\
		}\n\
	",
	HSV: "vec3 rgb2hsv(vec3 c)\n\
		{\n\
			vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);\n\
			vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));\n\
			vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));\n\
			\n\
			float d = q.x - min(q.w, q.y);\n\
			float e = 1.0e-10;\n\
			return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);\n\
		}\n\
		\n\
		vec3 hsv2rgb(vec3 c)\n\
		{\n\
			vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);\n\
			vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);\n\
			return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);\n\
		}"
}

/**
* Returns the first component of this container that is of the same class
* @method configure
* @param {Object} o object with the configuration info from a previous serialization
*/
FXStack.prototype.configure = function(o)
{
	this.apply_fxaa = !!o.apply_fxaa;
	if(o.fx)
		this.fx = o.fx.concat();
}

FXStack.prototype.serialize = FXStack.prototype.toJSON = function()
{
	return { 
		apply_fxaa: this.apply_fxaa,
		fx: this.fx.concat()
	};
}

FXStack.prototype.getResources = function(res)
{
	var fxs = this.fx;
	for(var i = 0; i < fxs.length; i++)
	{
		var fx = fxs[i];
		var fx_info = FXStack.available_fx[ fx.name ];
		if(!fx_info)
			continue;
		if(!fx_info.uniforms)
			continue;
		for(var j in fx_info.uniforms)
		{
			var uniform = fx_info.uniforms[j];
			if(uniform.type == "sampler2D" && fx[j])
				res[ fx[j] ] = GL.Texture;
		}
	}
	return res;
}

//attach a new FX to the FX Stack
FXStack.prototype.addFX = function( name )
{
	if(!name)
		return;
	if( !FXStack.available_fx[ name ] )
	{
		console.warn( "FXStack not found: " + name );
		return;
	}
	this.fx.push({ name: name });
}

//returns the Nth FX in the FX Stack
FXStack.prototype.getFX = function(index)
{
	return this.fx[ index ];
}

//rearranges an FX
FXStack.prototype.moveFX = function( fx, offset )
{
	offset = offset || -1;

	var index = this.fx.indexOf(fx);
	if( index == -1 )
		return;

	this.fx.splice(index,1);
	index += offset;


	if(index >= 0 && index < this.fx.length)
		this.fx.splice(index,0,fx);
	else
		this.fx.push(fx);
}

//removes an FX from the FX stack
FXStack.prototype.removeFX = function( fx )
{
	for(var i = 0; i < this.fx.length; i++)
	{
		if(this.fx[i] !== fx)
			continue;

		this.fx.splice(i,1);
		return;
	}
}

//executes the FX stack in the input texture and outputs the result in the output texture (or the screen)
FXStack.prototype.applyFX = function( input_texture, output_texture, options )
{
	var color_texture = input_texture;
	var depth_texture = options.depth_texture;

	var fxs = this.fx;

	//shadercode: TODO, do this in a lazy way
	var key = "";
	var update_shader = true;
	for(var i = 0; i < fxs.length; i++)
		key += fxs[i].name + "|";
	if(key == this._last_shader_key)
		update_shader = false;
	this._last_shader_key = key;

	var uv_code = "";
	var color_code = "";
	var included_functions = {};
	var uniforms_code = "";
	var texture_slot = 2;

	var uniforms = this._uniforms;
	uniforms.u_viewport[0] = color_texture.width;
	uniforms.u_viewport[1] = color_texture.height;
	uniforms.u_iviewport[0] = 1 / color_texture.width;
	uniforms.u_iviewport[1] = 1 / color_texture.height;
	uniforms.u_aspect = color_texture.width / color_texture.height;
	uniforms.u_random[0] = Math.random();
	uniforms.u_random[1] = Math.random();

	//var passes = [];
	//var current_pass = {};

	var fx_id = 0;
	for(var i = 0; i < fxs.length; i++)
	{
		var fx = fxs[i];
		fx_id = i;
		var fx_info = FXStack.available_fx[ fx.name ];
		if(!fx_info)
			continue;
		if(update_shader)
		{
			if(fx_info.functions)
				for(var z in fx_info.functions)
					included_functions[ fx_info.functions[z] ] = true;
			if( fx_info.code )
				color_code += fx_info.code.split("@").join( fx_id ) + ";\n";
			if( fx_info.uv_code )
				uv_code += fx_info.uv_code.split("@").join( fx_id ) + ";\n";
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

				if(uniform.type == "sampler2D")
				{
					uniforms[ varname ] = texture_slot;
					var tex = this.getTexture( fx[j] );
					if(tex)
					{
						tex.bind( texture_slot );
						if(uniform.filter == "nearest")
						{
							gl.texParameteri( tex.texture_type, gl.TEXTURE_MAG_FILTER, gl.NEAREST );
							gl.texParameteri( tex.texture_type, gl.TEXTURE_MIN_FILTER, gl.NEAREST );
						}
						if(uniform.wrap == "clamp")
						{
							gl.texParameteri( tex.texture_type, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE );
							gl.texParameteri( tex.texture_type, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE );
						}
					}
					else
					{
						//bind something to avoid problems
						tex = LS.Renderer._missing_texture;
						if(tex)
							tex.bind( texture_slot );
					}

					texture_slot++;
				}
				else
					uniforms[ varname ] = fx[j] !== undefined ? fx[j] : uniform.value;
			}
	}


	var shader = null;
	if(update_shader)
	{
		var functions_code = "";
		for(var i in included_functions)
		{
			var func = FXStack.available_functions[ i ];
			if(!func)
			{
				console.error("FXStack: Function not found: " + i);
				continue;
			}
			functions_code += func + "\n";
		}

		var fullcode = "\n\
			#extension GL_OES_standard_derivatives : enable\n\
			precision highp float;\n\
			#define color3 vec3\n\
			#define color4 vec4\n\
			uniform sampler2D u_texture;\n\
			uniform sampler2D u_depth_texture;\n\
			varying vec2 v_coord;\n\
			uniform vec2 u_viewport;\n\
			uniform vec2 u_iviewport;\n\
			uniform float u_aspect;\n\
			uniform vec2 u_depth_range;\n\
			uniform vec2 u_random;\n\
			vec2 uv;\n\
			" + uniforms_code + "\n\
			" + functions_code + "\n\
			void main() {\n\
				uv = v_coord;\n\
				vec2 to_center = vec2(0.5) - uv;\n\
				float dist_to_center = length(to_center);\n\
				" + uv_code + "\n\
				vec4 color = texture2D(u_texture, uv);\n\
				float temp = 0.0;\n\
				" + color_code + "\n\
				gl_FragColor = color;\n\
			}\n\
			";

		this._last_shader = new GL.Shader( GL.Shader.SCREEN_VERTEX_SHADER, fullcode );
	}

	shader = this._last_shader;

	//error compiling shader
	if(!shader)
	{
		input_texture.toViewport();
		return;
	}

	//set the depth texture for some FXs like fog or depth
	if(shader.hasUniform("u_depth_texture"))
	{
		depth_texture.bind(1);
		if(depth_texture.near_far_planes)
			uniforms.u_depth_range = depth_texture.near_far_planes;
	}

	color_texture.setParameter( gl.TEXTURE_MAG_FILTER, this.filter ? gl.LINEAR : gl.NEAREST );
	color_texture.setParameter( gl.TEXTURE_MIN_FILTER, gl.LINEAR );

	if( this.apply_fxaa )
	{
		if(!this.temp_tex || this.temp_tex.width != gl.viewport_data[2] || this.temp_tex.height != gl.viewport_data[3])
			this.temp_tex = new GL.Texture(gl.viewport_data[2],gl.viewport_data[3]);
		this.temp_tex.drawTo(function(){
			color_texture.toViewport( shader, uniforms );
		});
		var fx_aa_shader = GL.Shader.getFXAAShader();
		fx_aa_shader.setup();

		if(!output_texture)
			this.temp_tex.toViewport( fx_aa_shader );
		else
			this.temp_tex.copyTo( output_texture, fx_aa_shader );
	}
	else
	{
		this.temp_tex = null;
		if(!output_texture)
			color_texture.toViewport( shader, uniforms );
		else
		{
			shader.uniforms( uniforms );
			this.temp_tex.copyTo( output_texture, shader );
		}
	}
}

FXStack.prototype.getTexture = function( name )
{
	return LS.ResourcesManager.getTexture( name );
}

FXStack.prototype.getPropertyInfoFromPath = function( path )
{
	if(path.length < 2)
		return null;

	var fx_num = parseInt( path[0] );

	//fx not active
	if(fx_num >= this.fx.length)
		return null;
	var fx = this.fx[ fx_num ];

	var fx_info = FXStack.available_fx[ fx.name ];
	if(!fx_info)
		return null;

	var varname = path[1];
	if(varname == "name")
		return null;

	var uniform = fx_info.uniforms[ varname ];
	if(!uniform)
		return null;

	var type = uniform.type;

	if(type == "float")
		type = "number";
	else if(type == "sampler2D")
		type = "texture";

	return {
		target: fx,
		name: varname,
		value: fx[ varname ],
		type: uniform.type || "number"
	};
}

FXStack.prototype.setPropertyValueFromPath = function( path, value, offset )
{
	offset = offset || 0;

	if( path.length < (offset+1) )
		return null;

	var fx_num = parseInt( path[offset] );
	if(fx_num >= this.fx.length)
		return null;
	var fx = this.fx[ fx_num ];
	if(!fx)
		return null;
	
	var varname = path[offset+1];
	if (fx[ varname ] === undefined )
		return null;

	//to avoid incompatible types
	if( fx[ varname ] !== undefined && value !== undefined && fx[ varname ].constructor === value.constructor )
		fx[ varname ] = value;
}

FXStack.registerFX = function( name, fx_info )
{
	if( !fx_info.name )
		fx_info.name = name;
	if( fx_info.code === undefined )
		throw("FXStack must have a code");
	if( fx_info.uniforms && fx_info.code && fx_info.code.indexOf("@") )
		console.warn("FXStack using uniforms must use the character '@' at the end of every use to avoid collisions with other variables with the same name.");

	FXStack.available_fx[ name ] = fx_info;
}

//for common functions shared among different FXs...
FXStack.registerFunction = function( name, code )
{
	FXStack.available_functions[name] = code;
}

LS.FXStack = FXStack;
LS.TextureFX = FXStack; //LEGACY