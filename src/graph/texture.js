if(typeof(LiteGraph) != "undefined")
{
	//**************************************

	function LGraphTexture()
	{
		this.addOutput("Texture","Texture");
		this.properties = {name:""};
	}

	LGraphTexture.title = "Texture";
	LGraphTexture.desc = "Texture";
	LGraphTexture.widgets_info = {"name": { widget:"texture"} };

	LGraphTexture.textures_container = null; //where to seek for the textures
	LGraphTexture.loadTextureCallback = null;

	LGraphTexture.prototype.onExecute = function()
	{
		if(!this.properties.name)
			return;

		if(!ResourcesManager) return;

		var container = LGraphTexture.textures_container;
		if(!container && typeof(ResourcesManager) != "undefined")
			container = ResourcesManager.textures;
		if(!container)
			throw("Cannot load texture, container of textures not found");

		var tex = container[ this.properties.name ];
		if(!tex && this.properties.name[0] != ":")
		{
			if(!LGraphTexture.loadTextureCallback && typeof(ResourcesManager) != "undefined")
				LGraphTexture.loadTextureCallback = ResourcesManager.loadImage.bind(ResourcesManager);

			var loader = LGraphTexture.loadTextureCallback;
			if(loader)
				loader( this.properties.name );
			return;
		}
		this.setOutputData(0, tex);
	}

	LiteGraph.registerNodeType("texture/texture", LGraphTexture );
	window.LGraphTexture = LGraphTexture;

	//**************************************

	function LGraphTextureSave()
	{
		this.addInput("Texture","Texture");
		this.properties = {name:""};
	}

	LGraphTextureSave.title = "Save";
	LGraphTextureSave.desc = "Save a texture in the repository";

	LGraphTextureSave.prototype.onExecute = function()
	{
		if(!this.properties.name)
			return;

		var tex = this.getInputData(0);
		if(!tex) return;
			
		ResourcesManager.textures[ this.properties.name ] = tex;
	}

	LiteGraph.registerNodeType("texture/save", LGraphTextureSave );
	window.LGraphTextureSave = LGraphTextureSave;

	//****************************************************

	function LGraphTextureOperation()
	{
		this.addInput("Texture","Texture");
		this.addInput("TextureB","Texture");
		this.addInput("value","number");
		this.addOutput("Texture","Texture");
		this.help = "<p>pixelcode must be vec3</p>\
			<p>uvcode must be vec2, is optional</p>\
			<p><strong>uv:</strong> tex. coords</p><p><strong>color:</strong> texture</p><p><strong>colorB:</strong> textureB</p><p><strong>time:</strong> scene time</p><p><strong>value:</strong> input value</p>";

		this.properties = {value:1, uvcode:"", pixelcode:"color + colorB * value", low_precision: false };
	}

	LGraphTextureOperation.widgets_info = {"uvcode": { widget:"textarea", height: 100 }, "pixelcode": { widget:"textarea", height: 100 } };
	LGraphTextureOperation.title = "Operation";
	LGraphTextureOperation.desc = "Texture shader operation";

	LGraphTextureOperation.prototype.onExecute = function()
	{
		var tex = this.getInputData(0);
		var texB = this.getInputData(1);

		if(!this.properties.uvcode && !this.properties.pixelcode)
			return;

		var width = 512;
		var height = 512;
		var type = gl.UNSIGNED_BYTE;
		if(tex)
		{
			width = tex.width;
			height = tex.height;
			type = tex.type;
		}
		else if (texB)
		{
			width = texB.width;
			height = texB.height;
			type = texB.type;
		}

		if(this.properties.low_precision)
			type = gl.UNSIGNED_BYTE;

		if(!this._tex || this._tex.width != width || this._tex.height != height || this._tex.type != type )
			this._tex = new GL.Texture( width, height, { type: type, format: gl.RGBA, filter: gl.LINEAR });

		var uvcode = "";
		if(this.properties.uvcode)
		{
			uvcode = "uv = " + this.properties.uvcode;
			if(this.properties.uvcode.indexOf(";") != -1) //there are line breaks, means multiline code
				uvcode = this.properties.uvcode;
		}
		
		var pixelcode = "";
		if(this.properties.pixelcode)
		{
			pixelcode = "result = " + this.properties.pixelcode;
			if(this.properties.pixelcode.indexOf(";") != -1) //there are line breaks, means multiline code
				pixelcode = this.properties.pixelcode;
		}

		var shader = this._shader;

		if(!shader || this._shader_code != (uvcode + "|" + pixelcode) )
		{
			this._shader = new GL.Shader(LGraphTextureOperation.vertex_shader, LGraphTextureOperation.pixel_shader, { UV_CODE: uvcode, PIXEL_CODE: pixelcode });
			this._shader_code = (uvcode + "|" + pixelcode);
			shader = this._shader;
		}

		if(!shader)
		{
			this.boxcolor = "red";
			return;
		}
		else
			this.boxcolor = "green";

		var value = this.getInputData(2);
		if(value != null)
			this.properties.value = value;
		else
			value = parseFloat( this.properties.value );

		this._tex.drawTo(function() {
			gl.disable( gl.DEPTH_TEST );
			gl.disable( gl.CULL_FACE );
			gl.disable( gl.BLEND );
			if(tex)	tex.bind(0);
			if(texB) texB.bind(1);
			var mesh = Mesh.getScreenQuad();
			shader.uniforms({texture:0, textureB:1, value: value, texSize:[width,height], time: Scene._global_time - Scene._start_time}).draw(mesh);
		});

		this.setOutputData(0, this._tex);
	}

	LGraphTextureOperation.vertex_shader = "precision highp float;\n\
			attribute vec3 a_vertex;\n\
			attribute vec2 a_coord;\n\
			varying vec2 coord;\n\
			void main() {\n\
				coord = a_coord; gl_Position = vec4(coord * 2.0 - 1.0, 0.0, 1.0);\n\
			}\n\
			";

	LGraphTextureOperation.pixel_shader = "precision highp float;\n\
			\n\
			uniform sampler2D texture;\n\
			uniform sampler2D textureB;\n\
			varying vec2 coord;\n\
			uniform vec2 texSize;\n\
			uniform float time;\n\
			uniform float value;\n\
			\n\
			void main() {\n\
				vec2 uv = coord;\n\
				UV_CODE;\n\
				vec3 color = texture2D(texture, uv).rgb;\n\
				vec3 colorB = texture2D(textureB, uv).rgb;\n\
				vec3 result = vec3(0.0);\n\
				PIXEL_CODE;\n\
				gl_FragColor = vec4(result, 1.0);\n\
			}\n\
			";

	LiteGraph.registerNodeType("texture/operation", LGraphTextureOperation );
	window.LGraphTextureOperation = LGraphTextureOperation;

	//****************************************************

	function LGraphTextureShader()
	{
		this.addOutput("Texture","Texture");
		this.properties = {code:"", width: 512, height: 512};

		this.properties.code = "\nvoid main() {\n  vec2 uv = coord;\n  vec3 color = vec3(0.0);\n//your code here\n\ngl_FragColor = vec4(color, 1.0);\n}\n";
		this.widgets_info = {"code": { widget:"textarea", height: 100 } };
	}

	LGraphTextureShader.title = "Shader";
	LGraphTextureShader.desc = "Texture shader";

	LGraphTextureShader.prototype.onExecute = function()
	{
		//replug 
		if(this._shader_code != this.properties.code)
		{
			this._shader_code = this.properties.code;
			this._shader = new GL.Shader(LGraphTextureShader.vertex_shader, LGraphTextureShader.pixel_shader + this.properties.code );
			if(!this._shader) {
				this.boxcolor = "red";
				return;
			}
			else
				this.boxcolor = "green";
			/*
			var uniforms = this._shader.uniformLocations;
			//disconnect inputs
			if(this.inputs)
				for(var i = 0; i < this.inputs.length; i++)
				{
					var slot = this.inputs[i];
					if(slot.link != null)
						this.disconnectInput(i);
				}

			for(var i = 0; i < uniforms.length; i++)
			{
				var type = "number";
				if( this._shader.isSampler[i] )
					type = "texture";
				else
				{
					var v = gl.getUniform(this._shader.program, i);
					type = typeof(v);
					if(type == "object" && v.length)
					{
						switch(v.length)
						{
							case 1: type = "number"; break;
							case 2: type = "vec2"; break;
							case 3: type = "vec3"; break;
							case 4: type = "vec4"; break;
							case 9: type = "mat3"; break;
							case 16: type = "mat4"; break;
							default: continue;
						}
					}
				}
				this.addInput(i,type);
			}
			*/
		}

		if(!this._tex || this._tex.width != this.properties.width || this._tex.height != this.properties.height )
			this._tex = new GL.Texture( this.properties.width, this.properties.height, { format: gl.RGBA, filter: gl.LINEAR });
		var tex = this._tex;
		var shader = this._shader;
		tex.drawTo(function()	{
			shader.uniforms({texSize: [tex.width, tex.height], time: Scene._global_time - Scene._start_time}).draw( Mesh.getScreenQuad() );
		});

		this.setOutputData(0, this._tex);
	}

	LGraphTextureShader.vertex_shader = "precision highp float;\n\
			attribute vec3 a_vertex;\n\
			attribute vec2 a_coord;\n\
			varying vec2 coord;\n\
			void main() {\n\
				coord = a_coord; gl_Position = vec4(coord * 2.0 - 1.0, 0.0, 1.0);\n\
			}\n\
			";

	LGraphTextureShader.pixel_shader = "precision highp float;\n\
			\n\
			varying vec2 coord;\n\
			uniform float time;\n\
			";

	LiteGraph.registerNodeType("texture/shader", LGraphTextureShader );
	window.LGraphTextureShader = LGraphTextureShader;

	//**************************
	function LGraphTexturePreview()
	{
		this.addInput("Texture","Texture");
		this.properties = { flipY: false };
		this.size = [LGraphTexturePreview.img_size, LGraphTexturePreview.img_size];
	}

	LGraphTexturePreview.title = "Preview";
	LGraphTexturePreview.desc = "Show a texture in the graph canvas";
	LGraphTexturePreview.img_size = 256;

	LGraphTexturePreview.prototype.onDrawBackground = function(ctx)
	{
		var tex = this.getInputData(0);
		if(!tex) return;
		var size = LGraphTexturePreview.img_size;

		var temp_tex = tex;

		//Generate low-level version in the GPU to speed up
		if(tex.width > size || tex.height > size)
		{
			temp_tex = this._temp_tex;
			if(!this._temp_tex)
			{
				temp_tex = new GL.Texture(size,size, { minFilter: gl.NEAREST });
				this._temp_tex = temp_tex;
			}

			//copy
			tex.copyTo(temp_tex);
			tex = temp_tex;
		}

		//create intermediate canvas with lowquality version
		var tex_canvas = this._canvas;
		if(!tex_canvas)
		{
			tex_canvas = createCanvas(size,size);
			this._canvas = tex_canvas;
		}

		if(temp_tex)
			temp_tex.toCanvas(tex_canvas);

		//render to graph canvas
		ctx.save();
		if(this.properties.flipY)
		{
			ctx.translate(0,this.size[1]);
			ctx.scale(1,-1);
		}
		ctx.drawImage(tex_canvas,0,0,this.size[0],this.size[1]);
		ctx.restore();
	}

	LiteGraph.registerNodeType("texture/preview", LGraphTexturePreview );
	window.LGraphTexturePreview = LGraphTexturePreview;

	// Texture to Viewport *****************************************
	function LGraphTextureToViewport()
	{
		this.addInput("Texture","Texture");
		this.properties = { additive: false, antialiasing: false };

		if(!LGraphTextureToViewport._shader)
			LGraphTextureToViewport._shader = new GL.Shader( LGraphTextureToViewport.vertex_shader, LGraphTextureToViewport.pixel_shader );
	}

	LGraphTextureToViewport.title = "to Viewport";
	LGraphTextureToViewport.desc = "Texture to viewport";

	LGraphTextureToViewport.prototype.onExecute = function()
	{
		var tex = this.getInputData(0);
		if(!tex) return;

		if(this.properties.additive)
		{
			gl.enable( gl.BLEND );
			gl.blendFunc( gl.SRC_ALPHA, gl.ONE );
		}
		else
			gl.disable( gl.BLEND );
		gl.disable( gl.DEPTH_TEST );
		if(this.properties.antialiasing)
		{
			var viewport = gl.getParameter(gl.VIEWPORT);
			if(tex)	tex.bind(0);
			var mesh = Mesh.getScreenQuad();
			LGraphTextureToViewport._shader.uniforms({texture:0, uViewportSize:[tex.width,tex.height], inverseVP: [1/tex.width,1/tex.height] }).draw(mesh);
		}
		else
			tex.toViewport();
	}

	LGraphTextureToViewport.vertex_shader = "precision highp float;\n\
			attribute vec3 a_vertex;\n\
			attribute vec2 a_coord;\n\
			varying vec2 v_coord;\n\
			void main() {\n\
				v_coord = a_coord; gl_Position = vec4(v_coord * 2.0 - 1.0, 0.0, 1.0);\n\
			}\n\
			";

	LGraphTextureToViewport.pixel_shader = "precision highp float;\n\
			precision highp float;\n\
			varying vec2 v_coord;\n\
			uniform sampler2D u_texture;\n\
			uniform vec2 uViewportSize;\n\
			uniform vec2 inverseVP;\n\
			#define FXAA_REDUCE_MIN   (1.0/ 128.0)\n\
			#define FXAA_REDUCE_MUL   (1.0 / 8.0)\n\
			#define FXAA_SPAN_MAX     8.0\n\
			\n\
			/* from mitsuhiko/webgl-meincraft based on the code on geeks3d.com */\n\
			vec4 applyFXAA(sampler2D tex, vec2 fragCoord)\n\
			{\n\
				vec4 color = vec4(0.0);\n\
				/*vec2 inverseVP = vec2(1.0 / uViewportSize.x, 1.0 / uViewportSize.y);*/\n\
				vec3 rgbNW = texture2D(tex, (fragCoord + vec2(-1.0, -1.0)) * inverseVP).xyz;\n\
				vec3 rgbNE = texture2D(tex, (fragCoord + vec2(1.0, -1.0)) * inverseVP).xyz;\n\
				vec3 rgbSW = texture2D(tex, (fragCoord + vec2(-1.0, 1.0)) * inverseVP).xyz;\n\
				vec3 rgbSE = texture2D(tex, (fragCoord + vec2(1.0, 1.0)) * inverseVP).xyz;\n\
				vec3 rgbM  = texture2D(tex, fragCoord  * inverseVP).xyz;\n\
				vec3 luma = vec3(0.299, 0.587, 0.114);\n\
				float lumaNW = dot(rgbNW, luma);\n\
				float lumaNE = dot(rgbNE, luma);\n\
				float lumaSW = dot(rgbSW, luma);\n\
				float lumaSE = dot(rgbSE, luma);\n\
				float lumaM  = dot(rgbM,  luma);\n\
				float lumaMin = min(lumaM, min(min(lumaNW, lumaNE), min(lumaSW, lumaSE)));\n\
				float lumaMax = max(lumaM, max(max(lumaNW, lumaNE), max(lumaSW, lumaSE)));\n\
				\n\
				vec2 dir;\n\
				dir.x = -((lumaNW + lumaNE) - (lumaSW + lumaSE));\n\
				dir.y =  ((lumaNW + lumaSW) - (lumaNE + lumaSE));\n\
				\n\
				float dirReduce = max((lumaNW + lumaNE + lumaSW + lumaSE) * (0.25 * FXAA_REDUCE_MUL), FXAA_REDUCE_MIN);\n\
				\n\
				float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);\n\
				dir = min(vec2(FXAA_SPAN_MAX, FXAA_SPAN_MAX), max(vec2(-FXAA_SPAN_MAX, -FXAA_SPAN_MAX), dir * rcpDirMin)) * inverseVP;\n\
				\n\
				vec3 rgbA = 0.5 * (texture2D(tex, fragCoord * inverseVP + dir * (1.0 / 3.0 - 0.5)).xyz + \n\
					texture2D(tex, fragCoord * inverseVP + dir * (2.0 / 3.0 - 0.5)).xyz);\n\
				vec3 rgbB = rgbA * 0.5 + 0.25 * (texture2D(tex, fragCoord * inverseVP + dir * -0.5).xyz + \n\
					texture2D(tex, fragCoord * inverseVP + dir * 0.5).xyz);\n\
				\n\
				return vec4(rgbA,1.0);\n\
				float lumaB = dot(rgbB, luma);\n\
				if ((lumaB < lumaMin) || (lumaB > lumaMax))\n\
					color = vec4(rgbA, 1.0);\n\
				else\n\
					color = vec4(rgbB, 1.0);\n\
				return color;\n\
			}\n\
			\n\
			void main() {\n\
			   gl_FragColor = applyFXAA( u_texture, v_coord * uViewportSize) ;\n\
			}\n\
			";


	LiteGraph.registerNodeType("texture/toviewport", LGraphTextureToViewport );
	window.LGraphTextureToViewport = LGraphTextureToViewport;


	// Texture Copy *****************************************
	function LGraphTextureCopy()
	{
		this.addInput("Texture","Texture");
		this.addOutput("","Texture");
		this.properties = { size: 0, low_precision: false };
	}

	LGraphTextureCopy.title = "Copy";
	LGraphTextureCopy.desc = "Copy Texture";
	LGraphTextureCopy.widgets_info = { size: { widget:"combo", values:[0,32,64,128,256,512,1024,2048]} };

	LGraphTextureCopy.prototype.onExecute = function()
	{
		var tex = this.getInputData(0);
		if(!tex) return;

		var width = tex.width;
		var height = tex.height;

		if(this.properties.size != 0)
		{
			width = this.properties.size;
			height = this.properties.size;
		}

		var temp = this._temp_texture;
		var type = this.properties.low_precision ? gl.UNSIGNED_BYTE : tex.type;
		if(!temp || temp.width != width || temp.height != height || temp.type != type )
			this._temp_texture = new GL.Texture( width, height, { type: type, format: gl.RGBA, filter: gl.LINEAR });
		tex.copyTo(this._temp_texture);

		this.setOutputData(0,this._temp_texture);
	}

	LiteGraph.registerNodeType("texture/copy", LGraphTextureCopy );
	window.LGraphTextureCopy = LGraphTextureCopy;


	// Texture LUT *****************************************
	function LGraphTextureLUT()
	{
		this.addInput("Texture","Texture");
		this.addInput("LUT","Texture");
		this.addInput("Intensity","number");
		this.addOutput("","Texture");
		this.properties = { intensity: 1 };

		if(!LGraphTextureLUT._shader)
			LGraphTextureLUT._shader = new GL.Shader( LGraphTextureLUT.vertex_shader, LGraphTextureLUT.pixel_shader );
	}

	LGraphTextureLUT.title = "LUT";
	LGraphTextureLUT.desc = "Apply LUT to Texture";

	LGraphTextureLUT.prototype.onExecute = function()
	{
		var tex = this.getInputData(0);
		if(!tex) return;

		var lut_tex = this.getInputData(1);
		if(!lut_tex)
		{
			this.setOutputData(0,tex);
			return;
		}
		lut_tex.bind(0);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR );
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE );
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE );
		gl.bindTexture(gl.TEXTURE_2D, null);

		var intensity = this.properties.intensity;
		if( this.isInputConnected(2) )
			this.properties.intensity = intensity = this.getInputData(2);

		var width = tex.width;
		var height = tex.height;
		var temp = this._temp_texture;
		if(!temp || temp.width != width || temp.height != height) //type is always UNSIGNED_BYTE
			this._temp_texture = new GL.Texture( width, height, { format: gl.RGBA, filter: gl.LINEAR });

		var mesh = Mesh.getScreenQuad();

		this._temp_texture.drawTo(function() {
			tex.bind(0);
			lut_tex.bind(1);
			LGraphTextureLUT._shader.uniforms({texture:0, textureB:1, u_amount: intensity, uViewportSize:[tex.width,tex.height]}).draw(mesh);
		});

		this.setOutputData(0,this._temp_texture);
	}

	LGraphTextureLUT.vertex_shader = "precision highp float;\n\
			attribute vec3 a_vertex;\n\
			attribute vec2 a_coord;\n\
			varying vec2 coord;\n\
			void main() {\n\
				coord = a_coord; gl_Position = vec4(a_coord * 2.0 - 1.0, 0.0, 1.0);\n\
			}\n\
			";

	LGraphTextureLUT.pixel_shader = "precision highp float;\n\
			precision highp float;\n\
			varying vec2 coord;\n\
			uniform sampler2D texture;\n\
			uniform sampler2D textureB;\n\
			uniform float u_amount;\n\
			\n\
			void main() {\n\
				 lowp vec4 textureColor = clamp( texture2D(texture, coord), vec4(0.0), vec4(1.0) );\n\
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
				 lowp vec4 newColor1 = texture2D(textureB, texPos1);\n\
				 lowp vec4 newColor2 = texture2D(textureB, texPos2);\n\
				 lowp vec4 newColor = mix(newColor1, newColor2, fract(blueColor));\n\
				 gl_FragColor = vec4( mix( textureColor.rgb, newColor.rgb, u_amount), textureColor.w);\n\
			}\n\
			";

	LiteGraph.registerNodeType("texture/LUT", LGraphTextureLUT );
	window.LGraphTextureLUT = LGraphTextureLUT;

	// Texture Mix *****************************************
	function LGraphTextureChannels()
	{
		this.addInput("Texture","Texture");

		this.addOutput("R","Texture");
		this.addOutput("G","Texture");
		this.addOutput("B","Texture");
		this.addOutput("A","Texture");

		this.properties = {};
		if(!LGraphTextureChannels._shader)
			LGraphTextureChannels._shader = new GL.Shader( LGraphTextureChannels.vertex_shader, LGraphTextureChannels.pixel_shader );
	}

	LGraphTextureChannels.title = "Channels";
	LGraphTextureChannels.desc = "Split texture channels";

	LGraphTextureChannels.prototype.onExecute = function()
	{
		var texA = this.getInputData(0);
		if(!texA) return;

		if(!this._channels)
			this._channels = Array(4);

		var connections = 0;
		for(var i = 0; i < 4; i++)
		{
			if(this.isOutputConnected(i))
			{
				if(!this._channels[i] || this._channels[i].width != texA.width || this._channels[i].height != texA.height || this._channels[i].type != texA.type)
					this._channels[i] = new GL.Texture( texA.width, texA.height, { type: texA.type, format: gl.RGBA, filter: gl.LINEAR });
				connections++;
			}
			else
				this._channels[i] = null;
		}

		if(!connections)
			return;

		gl.disable( gl.BLEND );
		gl.disable( gl.DEPTH_TEST );

		var mesh = Mesh.getScreenQuad();
		var shader = LGraphTextureChannels._shader;
		var masks = [[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]];

		for(var i = 0; i < 4; i++)
		{
			if(!this._channels[i])
				continue;

			this._channels[i].drawTo( function() {
				texA.bind(0);
				shader.uniforms({u_texture:0, u_mask: masks[i]}).draw(mesh);
			});
			this.setOutputData(i, this._channels[i]);
		}
	}

	LGraphTextureChannels.vertex_shader = "precision highp float;\n\
			attribute vec3 a_vertex;\n\
			attribute vec2 a_coord;\n\
			varying vec2 v_coord;\n\
			void main() {\n\
				v_coord = a_coord; gl_Position = vec4(v_coord * 2.0 - 1.0, 0.0, 1.0);\n\
			}\n\
			";

	LGraphTextureChannels.pixel_shader = "precision highp float;\n\
			precision highp float;\n\
			varying vec2 v_coord;\n\
			uniform sampler2D u_texture;\n\
			uniform vec4 u_mask;\n\
			\n\
			void main() {\n\
			   gl_FragColor = vec4( vec3( length( texture2D(u_texture, v_coord) * u_mask )), 1.0 );\n\
			}\n\
			";

	LiteGraph.registerNodeType("texture/channels", LGraphTextureChannels );
	window.LGraphTextureChannels = LGraphTextureChannels;

	// Texture Mix *****************************************
	function LGraphTextureMix()
	{
		this.addInput("A","Texture");
		this.addInput("B","Texture");
		this.addInput("Mixer","Texture");

		this.addOutput("Texture","Texture");
		this.properties = {};

		if(!LGraphTextureMix._shader)
			LGraphTextureMix._shader = new GL.Shader( LGraphTextureMix.vertex_shader, LGraphTextureMix.pixel_shader );
	}

	LGraphTextureMix.title = "Mix";
	LGraphTextureMix.desc = "Generates a texture mixing two textures";

	LGraphTextureMix.prototype.onExecute = function()
	{
		var texA = this.getInputData(0);
		var texB = this.getInputData(1);
		var texMix = this.getInputData(2);
		if(!texA || !texB || !texMix) return;

		if(!this._temp_texture || this._temp_texture.width != texA.width || this._temp_texture.height != texA.height || this._temp_texture.type != texA.type)
			this._temp_texture = new GL.Texture( texA.width, texA.height, { type: texA.type, format: gl.RGBA, filter: gl.LINEAR });

		gl.disable( gl.BLEND );
		gl.disable( gl.DEPTH_TEST );

		var mesh = Mesh.getScreenQuad();
		var shader = LGraphTextureMix._shader;

		this._temp_texture.drawTo( function() {
			texA.bind(0);
			texB.bind(1);
			texMix.bind(2);
			shader.uniforms({u_textureA:0,u_textureB:1,u_textureMix:2}).draw(mesh);
		});

		this.setOutputData(0, this._temp_texture);
	}

	LGraphTextureMix.vertex_shader = "precision highp float;\n\
			attribute vec3 a_vertex;\n\
			attribute vec2 a_coord;\n\
			varying vec2 v_coord;\n\
			void main() {\n\
				v_coord = a_coord; gl_Position = vec4(v_coord * 2.0 - 1.0, 0.0, 1.0);\n\
			}\n\
			";

	LGraphTextureMix.pixel_shader = "precision highp float;\n\
			precision highp float;\n\
			varying vec2 v_coord;\n\
			uniform sampler2D u_textureA;\n\
			uniform sampler2D u_textureB;\n\
			uniform sampler2D u_textureMix;\n\
			\n\
			void main() {\n\
			   gl_FragColor = mix( texture2D(u_textureA, v_coord), texture2D(u_textureB, v_coord), texture2D(u_textureMix, v_coord) );\n\
			}\n\
			";

	LiteGraph.registerNodeType("texture/mix", LGraphTextureMix );
	window.LGraphTextureMix = LGraphTextureMix;

	// Texture Depth *****************************************
	function LGraphTextureDepthRange()
	{
		this.addInput("Texture","Texture");
		this.addInput("Distance","number");
		this.addInput("Range","number");
		this.addOutput("Texture","Texture");
		this.properties = { distance:100, range: 50 };

		if(!LGraphTextureDepthRange._shader)
			LGraphTextureDepthRange._shader = new GL.Shader( LGraphTextureDepthRange.vertex_shader, LGraphTextureDepthRange.pixel_shader );
	}

	LGraphTextureDepthRange.title = "Depth Range";
	LGraphTextureDepthRange.desc = "Generates a texture with a depth range";

	LGraphTextureDepthRange.prototype.onExecute = function()
	{
		var tex = this.getInputData(0);
		if(!tex) return;

		if(!this._temp_texture || this._temp_texture.width != tex.width || this._temp_texture.height != tex.height)
			this._temp_texture = new GL.Texture( tex.width, tex.height, { format: gl.RGBA, filter: gl.LINEAR });

		//iterations
		var distance = this.properties.distance;
		if( this.isInputConnected(1) )
		{
			distance = this.getInputData(1);
			this.properties.distance = distance;
		}

		var range = this.properties.range;
		if( this.isInputConnected(2) )
		{
			range = this.getInputData(2);
			this.properties.range = range;
		}

		gl.disable( gl.BLEND );
		gl.disable( gl.DEPTH_TEST );
		var mesh = Mesh.getScreenQuad();
		var shader = LGraphTextureDepthRange._shader;
		var camera = Renderer.active_camera;

		this._temp_texture.drawTo( function() {
			tex.bind(0);
			shader.uniforms({texture:0, u_distance: distance, u_range: range, u_camera_planes: [Renderer.active_camera.near,Renderer.active_camera.far] })
				.draw(mesh);
		});

		this.setOutputData(0, this._temp_texture);
	}

	LGraphTextureDepthRange.vertex_shader = "precision highp float;\n\
			attribute vec3 a_vertex;\n\
			attribute vec2 a_coord;\n\
			varying vec2 v_coord;\n\
			void main() {\n\
				v_coord = a_coord; gl_Position = vec4(v_coord * 2.0 - 1.0, 0.0, 1.0);\n\
			}\n\
			";

	LGraphTextureDepthRange.pixel_shader = "precision highp float;\n\
			precision highp float;\n\
			varying vec2 v_coord;\n\
			uniform sampler2D u_texture;\n\
			uniform vec2 u_camera_planes;\n\
			uniform float u_distance;\n\
			uniform float u_range;\n\
			\n\
			float LinearDepth()\n\
			{\n\
				float n = u_camera_planes.x;\n\
				float f = u_camera_planes.y;\n\
				return (2.0 * n) / (f + n - texture2D(u_texture, v_coord).x * (f - n));\n\
			}\n\
			\n\
			void main() {\n\
				float diff = abs(LinearDepth() * u_camera_planes.y - u_distance);\n\
				float dof = 1.0;\n\
				if(diff <= u_range)\n\
					dof = diff / u_range;\n\
			   gl_FragColor = vec4(dof);\n\
			}\n\
			";

	LiteGraph.registerNodeType("texture/depth_range", LGraphTextureDepthRange );
	window.LGraphTextureDepthRange = LGraphTextureDepthRange;

	// Texture Blur *****************************************
	function LGraphTextureBlur()
	{
		this.addInput("Texture","Texture");
		this.addInput("Iterations","number");
		this.addInput("Intensity","number");
		this.addOutput("Blurred","Texture");
		this.properties = { intensity: 1, iterations: 1, preserve_aspect: false, scale:[1,1] };

		if(!LGraphTextureBlur._shader)
			LGraphTextureBlur._shader = new GL.Shader( LGraphTextureBlur.vertex_shader, LGraphTextureBlur.pixel_shader );
	}

	LGraphTextureBlur.title = "Blur";
	LGraphTextureBlur.desc = "Blur a texture";

	LGraphTextureBlur.prototype.onExecute = function()
	{
		var tex = this.getInputData(0);
		if(!tex) return;

		var temp = this._temp_texture;

		if(!temp || temp.width != tex.width || temp.height != tex.height || temp.type != tex.type )
		{
			//we need two textures to do the blurring
			this._temp_texture = new GL.Texture( tex.width, tex.height, { type: tex.type, format: gl.RGBA, filter: gl.LINEAR });
			this._final_texture = new GL.Texture( tex.width, tex.height, { type: tex.type, format: gl.RGBA, filter: gl.LINEAR });
		}

		//iterations
		var iterations = this.properties.iterations;
		if( this.isInputConnected(1) )
		{
			iterations = this.getInputData(1);
			this.properties.iterations = iterations;
		}
		iterations = Math.floor(iterations);
		if(iterations == 0) //skip blurring
		{
			this.setOutputData(0, tex);
			return;
		}

		var intensity = this.properties.intensity;
		if( this.isInputConnected(2) )
		{
			intensity = this.getInputData(2);
			this.properties.intensity = intensity;
		}

		gl.disable( gl.BLEND );
		gl.disable( gl.DEPTH_TEST );
		var mesh = Mesh.getScreenQuad();
		var shader = LGraphTextureBlur._shader;
		var scale = this.properties.scale || [1,1];

		//iterate
		var start_texture = tex;
		var aspect = this.properties.preserve_aspect ? Renderer.active_camera.aspect : 1;
		for(var i = 0; i < iterations; ++i)
		{
			this._temp_texture.drawTo( function() {
				start_texture.bind(0);
				shader.uniforms({texture:0, u_intensity: 1, u_offset: [0, aspect/start_texture.height * scale[1] ] })
					.draw(mesh);
			});

			this._temp_texture.bind(0);
			this._final_texture.drawTo( function() {
				shader.uniforms({texture:0, u_intensity: intensity, u_offset: [1/start_texture.width * scale[0], 0] })
					.draw(mesh);
			});
			start_texture = this._final_texture;
		}
		
		this.setOutputData(0, this._final_texture);
	}

	LGraphTextureBlur.vertex_shader = "precision highp float;\n\
			attribute vec3 a_vertex;\n\
			attribute vec2 a_coord;\n\
			varying vec2 v_coord;\n\
			void main() {\n\
				v_coord = a_coord; gl_Position = vec4(v_coord * 2.0 - 1.0, 0.0, 1.0);\n\
			}\n\
			";

	LGraphTextureBlur.pixel_shader = "precision highp float;\n\
			precision highp float;\n\
			varying vec2 v_coord;\n\
			uniform sampler2D u_texture;\n\
			uniform vec2 u_offset;\n\
			uniform float u_intensity;\n\
			void main() {\n\
			   vec4 sum = vec4(0.0);\n\
			   sum += texture2D(u_texture, v_coord + u_offset * -4.0) * 0.05/0.98;\n\
			   sum += texture2D(u_texture, v_coord + u_offset * -3.0) * 0.09/0.98;\n\
			   sum += texture2D(u_texture, v_coord + u_offset * -2.0) * 0.12/0.98;\n\
			   sum += texture2D(u_texture, v_coord + u_offset * -1.0) * 0.15/0.98;\n\
			   sum += texture2D(u_texture, v_coord) * 0.16/0.98;\n\
			   sum += texture2D(u_texture, v_coord + u_offset * 4.0) * 0.05/0.98;\n\
			   sum += texture2D(u_texture, v_coord + u_offset * 3.0) * 0.09/0.98;\n\
			   sum += texture2D(u_texture, v_coord + u_offset * 2.0) * 0.12/0.98;\n\
			   sum += texture2D(u_texture, v_coord + u_offset * 1.0) * 0.15/0.98;\n\
			   gl_FragColor = u_intensity * sum;\n\
			}\n\
			";

	LiteGraph.registerNodeType("texture/blur", LGraphTextureBlur );
	window.LGraphTextureBlur = LGraphTextureBlur;

	// Texture Webcam *****************************************
	function LGraphTextureWebcam()
	{
		this.addOutput("Webcam","Texture");
		this.properties = {};
	}

	LGraphTextureWebcam.title = "Webcam";
	LGraphTextureWebcam.desc = "Webcam texture";


	LGraphTextureWebcam.prototype.openStream = function()
	{
		//Vendor prefixes hell
		navigator.getUserMedia = (navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia);
		window.URL = window.URL || window.webkitURL;

		if (!navigator.getUserMedia) {
		  //console.log('getUserMedia() is not supported in your browser, use chrome and enable WebRTC from about://flags');
		  return;
		}

		this._waiting_confirmation = true;

		// Not showing vendor prefixes.
		navigator.getUserMedia({video: true}, this.streamReady.bind(this), onFailSoHard);		

		var that = this;
		function onFailSoHard(e) {
			trace('Webcam rejected', e);
			that._webcam_stream = false;
			that.box_color = "red";
		};
	}

	LGraphTextureWebcam.prototype.streamReady = function(localMediaStream)
	{
		this._webcam_stream = localMediaStream;
		//this._waiting_confirmation = false;

	    var video = this._video;
		if(!video)
		{
			video = document.createElement("video");
			video.autoplay = true;
		    video.src = window.URL.createObjectURL(localMediaStream);
			this._video = video;
			//document.body.appendChild( video ); //debug
			//when video info is loaded (size and so)
			video.onloadedmetadata = function(e) {
				// Ready to go. Do some stuff.
				console.log(e);
			};
		}


	},

	LGraphTextureWebcam.prototype.onExecute = function()
	{
		if(this._webcam_stream == null && !this._waiting_confirmation)
			this.openStream();

		if(!this._video || !this._video.videoWidth) return;

		var width = this._video.videoWidth;
		var height = this._video.videoHeight;

		var temp = this._temp_texture;
		if(!temp || temp.width != width || temp.height != height )
			this._temp_texture = new GL.Texture( width, height, { format: gl.RGB, filter: gl.LINEAR });

		this._temp_texture.uploadImage( this._video );
		this.setOutputData(0,this._temp_texture);
	}

	LiteGraph.registerNodeType("texture/webcam", LGraphTextureWebcam );
	window.LGraphTextureWebcam = LGraphTextureWebcam;
} //LiteGraph defined