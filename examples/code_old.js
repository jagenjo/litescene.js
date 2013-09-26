function trace(msg) { if (typeof(console) != "undefined") { console.log(msg); } };
var DEG2RAD = 0.0174532925;

var APP = {
	cam_dist: 7.5,
	render_options: {},
	
	init: function() {
		//create canvas 3D
		try
		{
			gl = GL.create({alpha:false, premultipliedAlpha: false});
		}
		catch (e)
		{
			document.getElementById("visor").innerHTML = "<a href='blog'><img src='preview.png' /></a>";
			return;
		}

		gl.canvas.width = 1000;
		gl.canvas.height = 800;

		//capture interaction events
		gl.captureMouse();
		gl.captureKeys(true);
		gl.ondraw = this.ondraw;
		gl.onupdate = this.onupdate;
		gl.onmousedown = this.onmousedown;
		gl.onmouseup = this.onmouseup;
		gl.onmousemove = this.onmousemove;
		gl.onkeydown = this.onkeydown;

		//screen plane
		this.screen_plane = new GL.Mesh.plane({ coords: true });

		Shaders.init("../data/shaders.xml");
		Scene.init();
		Scene.ambient_color = [0.5,0.5,0.5];
		ResourcesManager.path = "assets/";

		Scene.background_color = [0.1,0.1,0.1,1];
		Scene.ambient_color = [0.2,0.2,0.2];

		//mesh
		var node = new SceneNode("monitor");
		node.material = new Material({ textures: { color: "monitor_textura.png" } });
		node.loadAndSetMesh("monitor.obj");
		Scene.addNode(node);
		var root = node;

		node = new SceneNode("screen");
		node.material = new Material({ color: [0.5,0.5,0.5], emissive: [1.0,1.0,1.0], detail:[0,256,256], specular_factor: 2, specular_gloss: 100,
			textures: { detail:"pattern_rgb.png", 
						color: "empty-screen.png" }});
		//node.material.blending = "additive";
		node.loadAndSetMesh("screen.obj");
		Scene.addNode(node);
		root.addChild(node);

		node = new SceneNode("light"); //screen light
		node.addComponent( new Light() );
		node.light.color = [0.4,0.5,1.0];
		node.light.range_attenuation = true;
		node.light.att_end = 120;
		node.transform.setPosition(20,35,-32);
		node.light.enabled = false;
		Scene.addNode(node);
		root.addChild(node);

		node = new SceneNode("button");
		node.material = new Material({ emissive:[0.5,0.5,0.5], textures: { color:"button_power.png", emissive: "button_power.png" } });
		node.flags.cast_shadows = false;
		node.transform.setPosition([-8.5,9.5,-34.0]); //-9.5,9.5,33.8
		quat.setAxisAngle(node.transform._rotation,[0,1,0],-18*DEG2RAD);
		node.loadAndSetMesh("button.obj");
		node.interactive = true;
		LEvent.bind(node, "mouseup", function(e,v) { 
			this.clicked = !this.clicked;
			quat.setAxisAngle(this.transform._rotation, [0,1,0], 18 * (this.clicked ? 1 : -1 ) * DEG2RAD);
			this.transform._dirty = true;
			SillyTerminal.switchPower(this.clicked);
		}, node);
		Scene.addNode(node);
		root.addChild(node);

		node = createKnob("knob");
		node.transform.setPosition([14.5,9.5,-34.0]); //-9.5,9.5,33.8
		node.transform.setScale(1.2,1.2,1.2);
		LEvent.bind(node, "knobChange", function(e,v) { SillyTerminal.brightness = v * 2; } );
		Scene.addNode(node);
		root.addChild(node);

		node = createKnob("knob2");
		node.transform.setPosition([21,9.5,-34.0]); //-9.5,9.5,33.8
		node.transform.setScale(1.2,1.2,1.2);
		LEvent.bind(node, "knobChange", function(e,v) { SillyTerminal.tv_hscale = 0.5 + v; } );
		Scene.addNode(node);
		root.addChild(node);

		node = createKnob("knob3",true);
		node.transform.setPosition([-26,42,-34.5]); //-9.5,9.5,33.8
		node.transform.setScale(1.2,1.2,1.2);
		LEvent.bind(node, "knobChange", function(e,v) { if( SillyTerminal.resource_to_show && SillyTerminal.resource_to_show.volume != null) SillyTerminal.resource_to_show.volume = v; } );
		Scene.addNode(node);
		root.addChild(node);

		node = new SceneNode("postit");
		node.material = new Material({alpha: 0.99, emissive:[0.05,0.05,0.05], textures: { color: "postit.png", emissive: "postit_hidden.png"} });
		node.flags.twosided = true;
		node.flags.cast_shadows = false;
		node.loadAndSetMesh("postit.obj");
		Scene.addNode(node);
		root.addChild(node);

		APP.rotateScene(250);


		//global camera
		Scene.camera.center = [0,35,0];
		Scene.camera.eye = [150,40,150];
		Scene.camera.far = 1000;
		Scene.camera.near = 1;

		//light
		Scene.light.color = [0.6,0.6,0.6];
		Scene.light.position = [0,100,150];
		Scene.light.type = Light.SPOT;
		Scene.light.spot_cone = true;
		Scene.light.far = 500;
		Scene.light.near = 1;
		Scene.light.size = 200;
		Scene.light.resolution = 2048;
		Scene.light.cast_shadows = true;
		Scene.light.hard_shadows = false;
		Scene.light.shadow_bias = 0.001;
		Scene.light.projective_texture = "window.png";//"stained-glass.png";

		//fx
		this.screen_plane = new GL.Mesh.plane({ coords: true });
		//this.rt = new Texture(1024,1024, { minFilter: gl.LINEAR_MIPMAP_LINEAR, magFilter: gl.NEAREST} );
		//this.fxshader = "tvFX"; //8bitsFX


		//gl.animate();
		this.glcanvas = gl.canvas;
		document.getElementById("visor").appendChild(gl.canvas);
		this.gl = gl;

		this.temp_texture = new Texture(512,512,{ minFilter: gl.LINEAR_MIPMAP_LINEAR, magFilter: gl.NEAREST});

		SillyTerminal.init();
		SillyTerminal.commands["video"] = function(){
			APP.showVideo();
		};

		var screen = Scene.getNode("screen");
		if(screen)
			screen.material.textures.emissive = ":terminal";
		//SillyTerminal.powerOn();

		Scene.loadResources();

		function createKnob(name, big)
		{
			var node = new SceneNode(name);
			node.material = new Material({specular_factor: 0.5, textures: { color: big ? "knob2.png" : "knob.png" }} );
			node.flags.cast_shadows = !!big;
			node.loadAndSetMesh( big ? "bigknob.obj" : "knob.obj");
			node.addComponent( new KnobComponent({value: 0.5}) );

			return node;
		}
	},

	showVideo: function()
	{
		var video = document.createElement("video");
		video.src = "assets/c64games.webm";
		//$("body").append(video);
		video.play();
		video.volume = 0.3;
		SillyTerminal.showResource(video);
	},

	retroMode: function()
	{
		this.rt = new Texture(128,256, { minFilter: gl.LINEAR_MIPMAP_LINEAR, magFilter: gl.NEAREST} );
		this.fxshader = "8bitsFX";
	},

	switchLights: function(v)
	{
		if(v == false)
		{
			Scene.background_color = [0.01,0.01,0.01,1];
			Scene.light.enabled = false;
			Scene.ambient_color = [0.05,0.05,0.05];
			Scene.getNode("postit").material.emissive = [0.2,0.2,0.2];
		}
		else if(v == true)
		{
			Scene.background_color = [0.1,0.1,0.1,1];
			Scene.light.enabled = true;
			Scene.ambient_color = [0.2,0.2,0.2];
			Scene.getNode("postit").material.emissive = [0.05,0.05,0.05];
		}
		else
			this.switchLights(!Scene.light.enabled);
	},
	
	ondraw: function()
	{
		var idle = 0.2 * Math.sin(new Date().getTime() * 0.0005);
		Scene.camera.eye = [15 * (APP.cam_dist + idle),40, 15 * (APP.cam_dist + idle)];
		var node = Scene.getNode("light");
		//node.light.updateFromMatrix( node.transform.getLocalMatrix() );
		node = Scene.getNode("screen");

		APP.render_options.texture = APP.rt;

		RenderPipeline.render(Scene, Scene.current_camera,APP.render_options);

		if(APP.rt) //apply fx
		{
			gl.viewport(0,0,gl.canvas.width,gl.canvas.height);
			APP.rt.bind();
			gl.generateMipmap(gl.TEXTURE_2D);
			Shaders.get(APP.fxshader).uniforms({color: [1,1,1,1], texSize:[APP.rt.width,APP.rt.height], time: new Date().getTime() * 0.001 }).draw(APP.screen_plane);
		}
	},

	rotateScene: function(angle)
	{
		Scene.getNode("monitor").transform.rotate(angle,[0,1,0]);
	},

	onupdate: function(dt)
	{
		var now = new Date().getTime();
		var tex = SillyTerminal.update(dt);

		/*
		APP.temp_texture.drawTo(function() {
			tex.bind(0);
			Shaders.get("tvFX").uniforms({texture:0, color: [1,1,1,1], texSize:[tex.width,tex.height], time: new Date().getTime() * 0.001 }).draw(APP.screen_plane);
		});
		*/

		APP.temp_texture.bind();
		//gl.generateMipmap(gl.TEXTURE_2D);
		ResourcesManager.textures[":terminal"] = tex;

		Scene.update(dt);
		//APP.rotateScene(dt * Math.sin(now * 0.0005));

		var node = Scene.getNode("screen");
		if(node)
		{
			if(SillyTerminal.powered)
				node.material.alpha = now % 10 < 5 ? 0.9 : 0.85 ;
			else if( SillyTerminal.power == 0)
				node.material.color = [0.5,0.5,0.5];

			node.material.detail = [SillyTerminal.power * 0.5,256,256];
		}
	},

	click_time: 0,
	clicked_node: null,

	onmousedown: function(e)
	{
		APP.click_time = new Date().getTime();

		var node = RenderPipeline.getNodeAtCanvasPosition(Scene, e.mousex,e.mousey);
		if(node && node.interactive)
		{
			LEvent.trigger(node,"mousedown",e);
			APP.clicked_node = node;
		} 
	},

	onmouseup: function(e)
	{
		APP.click_time = 0;
		if(APP.clicked_node)
			LEvent.trigger(APP.clicked_node,"mouseup",e);
		 APP.clicked_node = null;
	},

	onmousemove: function(e)
	{
		if(e.dragging)
		{
			if(APP.clicked_node)
				LEvent.trigger(APP.clicked_node,"mousemove",e);
			else
			{
				APP.rotateScene(e.deltaX);
				APP.cam_dist += e.deltaY * 0.01;
				if(APP.cam_dist < 5) APP.cam_dist = 5;
				else if(APP.cam_dist > 10) APP.cam_dist = 10;
			}
		}
	},

	onkeydown: function(e)
	{
		return SillyTerminal.onkeydown(e);
	}
};

var SillyTerminal = {
	buffer: [],
	commands: {},
	line: "",
	mode: "console",
	resource_to_show: null,
	powered: false,
	power: 0,
	ready: false,
	startup_time: 0,
	light_color: [0.4,0.5,1.0],
	brightness: 1,
	tv_hoffset: 0,
	tv_hscale: 1,
	MAX_LINES: 19,
	LINE_HEIGHT: 20,

	init: function() {
		//terminal canvas
		var canvas = document.createElement("canvas");
		canvas.width = canvas.height = 512;
		this.canvas = canvas;
		//$("body").append(canvas);
		this.texture = new Texture(512,512, {magFilter: gl.LINEAR, minFilter: gl.LINEAR_MIPMAP_LINEAR}); //LINEAR_MIPMAP_LINEAR
		//ResourcesManager.textures[":terminal"] = this.texture;

		this.commands["print"] = function(t,text) { this.addLine(text.substring(6,text.length)); };
		this.commands["clear"] = function() { this.buffer = []; };
		this.commands["help"] = function() { 
			this.executeCommand("clear");
			this.addLine("  APP MENU \n ********** \n1 ABOUT\n2 BLOG\n3 APPS\n4 SWITCH LIGHTS\n5 SHOW GAMES\n6 PRIVATE\nTYPE OPTION AND THE NUMBER:'OPTION 5'.\n");
		};
		this.commands["option"] = function(t) { 
			if(t.length > 1 && t[1] == "1")
			{
				this.executeCommand("clear");
				this.addLine("TAMAT OS is a testdemo with some of\nthe technology I've coded in the\nlasts months.\n\nCode and art by tamat, August 2012\ntwitter: tamat\nemail: javi.agenjo@gmail.com\n\nBoot sample by Sempo\nGames video by einokeino303\n\nCheck my blog for more info:\nhttp://tamats.com/blog"); 
			}
			else if(t.length > 1 && t[1] == "2")
				window.open("http://www.tamats.com/blog","_blank");
			else if(t.length > 1 && t[1] == "4")
				APP.switchLights()
			else if(t.length > 1 && t[1] == "5")
			{
				this.addLine("loading.");
				this.ready = false;
				setTimeout(function() { SillyTerminal.mode = "loading"; },2000);
				setTimeout(function() { SillyTerminal.ready = true; APP.showVideo(); },6000);
			}
			else if(t.length > 1 && t[1] == "6")
				this.addLine("restricted area.\ntype 'PASSWORD' followed by the word");
			else
				this.addLine("option not available at this moment"); 
		};
		this.commands["sleep"] = function(t) { 
			this.ready = false; 
			var time = parseInt(t[1]);
			setTimeout( function() { SillyTerminal.ready = true; },time);
		};
		this.commands["password"] = function(t) { 
			if(t[1] != "tmt")
			{
				this.addLine("wrong password");
				return;
			}
			this.ready = false;
			this.addLine("access granted.");

			setTimeout(function() { 
				SillyTerminal.executeCommand("clear");
				SillyTerminal.addLine("accesing private documents");
				SillyTerminal.addLine("loading.");
			},2000);
			setTimeout(function() { 
				SillyTerminal.addLine("no personal files found.");
				SillyTerminal.addLine("check drives");
				SillyTerminal.ready = true;
			},5000);
		};

		var audio = document.createElement("audio");
		audio.preload ="auto";
		audio.setAttribute('src', 'assets/150037__sempoo__computer-start-fade.ogg');
		audio.onload = function() {
			trace("Audio loaded");
		};
		this.audio = audio;
		document.body.appendChild(audio);
	},

	switchPower: function(v)
	{
		if(v)
		{
			this.audio.currentTime = 0;
			this.audio.play();

			//switch on screen
			setTimeout(function() {
				var node = Scene.getNode("screen");
				node.material.color = [1,1,1];
				node.material.detail = [1,256,256];
				SillyTerminal.powered = true;
				SillyTerminal.mode = "console";

				SillyTerminal.startup_time = new Date().getTime();

				//launch intro sequence
				if(SillyTerminal.session_buffer.length)
					SillyTerminal.showSession(SillyTerminal.session_buffer, 3000);
			},2000);
		}
		else
		{
			this.pauseVideo();
			this.audio.pause();
			this.powered = false;
		}
	},

	paintCanvas: function()
	{
		var canvas = this.canvas;
		var ctx = canvas.getContext("2d");
		ctx.globalAlpha = 1;
		ctx.fillStyle = "black";
		ctx.fillRect(0,0,512,512);
		if(!this.powered && this.power == 0) return;

		var now = new Date().getTime();
		var powered_time = (now - this.startup_time) / 1000;
		if(this.startup_time == 0) return;

		var power_factor = this.power;

		ctx.save();
		ctx.globalAlpha = power_factor; 
		ctx.translate(256 * (1 - this.tv_hscale) + this.tv_hoffset,(1-power_factor) * 256);
		ctx.scale(this.tv_hscale,power_factor);
		ctx.fillStyle = "#a0a0ff";
		ctx.fillRect(0,0,512,512); //out rect
		ctx.fillStyle = "#4040e0";
		if(powered_time > 2.0)
			ctx.fillRect(50,50,412,412); //in rect

		ctx.save();

		if(this.mode == "console")
			this.renderConsole(canvas,ctx);
		else if (this.mode == "resource")
			this.renderResource(canvas,ctx);
		else if (this.mode == "loading")
			this.renderLoading(canvas,ctx);

		ctx.restore();
		ctx.restore();

		if(this.brightness < 1)
		{
			ctx.globalAlpha = 1 - this.brightness;
			ctx.fillStyle = "black";
			ctx.fillRect(0,0,512,512);
		}
	},

	computeLightColor: function()
	{
		if(!this.light_samples)
		{
			this.light_samples = [];
			for(var i = 0; i < 64; i++)
				this.light_samples.push([ Math.floor(Math.random() * this.canvas.width), Math.floor(Math.random() * this.canvas.height)]);
		}

		var color = [0,0,0];
		var pixels = this.canvas.getContext("2d").getImageData(0,0,512,512);
		//var positions = [[64,64],[128,128],[192,192],[256,256],[320,320],[384,384],[448,448]];
		for(var i in this.light_samples)
		{
			var pos = this.light_samples[i];
			//var pos = [ Math.floor(Math.random() * this.canvas.width), Math.floor(Math.random() * this.canvas.height)];
			var pixel_index = pixels.width * pos[1] * 4 + pos[0] * 4;
			color[0] += pixels.data[pixel_index] / 255;
			color[1] += pixels.data[pixel_index+1] / 255;
			color[2] += pixels.data[pixel_index+2] / 255;
		}

		var size = this.light_samples.length;
		color[0] *= (1.5 / size) * this.brightness;
		color[1] *= (1.5 / size) * this.brightness;
		color[2] *= (1.5 / size) * this.brightness;
		this.light_color = color;
	},

	renderConsole: function(canvas,ctx)
	{
		ctx.scale(0.8,1);

		ctx.fillStyle = "#a0a0ff";
		ctx.font = "14px commodore";

		for(var i = 0; i < this.buffer.length; i++)
			ctx.fillText(this.buffer[i],64,70 + i * this.LINE_HEIGHT);

		if(this.ready)
		{
			var cursor_x = 0;
			if(this.line)
			{
				var text = this.line.toUpperCase();
				ctx.fillText(text,64,70 + this.buffer.length * this.LINE_HEIGHT);
				cursor_x += ctx.measureText(text).width;
			}

			if(new Date().getTime() % 1000 < 500)
				ctx.fillRect(64 + cursor_x,74 + (this.buffer.length-1) * this.LINE_HEIGHT,16,this.LINE_HEIGHT-4);
		}

	},

	renderResource: function(canvas,ctx)
	{
		if(!this.resource_to_show) return;
		ctx.drawImage(this.resource_to_show,0,0,canvas.width,canvas.height);
	},

	renderLoading: function(canvas,ctx)
	{
		var colors = ["#000","#00F","#0F0","#0FF","#F00","#F0F","#FF0","#FFF"];
		for(var i = 0; i < 32; i++)
		{
			ctx.fillStyle = colors[ Math.floor(Math.random() * colors.length) ];
			ctx.fillRect(0,i*16,512,16); //out rect
		}

		ctx.fillStyle = "#FFF";
		ctx.fillRect(50,50,412,412); //in rect
	},

	showResource: function(resource)
	{
		this.resource_to_show = resource;
		this.mode = "resource";
	},

	frame: 0,
	update: function(dt)
	{
		if(this.powered) this.power += dt * 0.5;
		else this.power -= dt * 2;
		if(this.power > 1) this.power = 1;
		else if(this.power < 0) this.power = 0;

		var node = Scene.getNode("light");
		if(node)
		{
			node.light.enabled = this.power > 0;
			node.light.color = [this.light_color[0] * this.power,this.light_color[1] * this.power,this.light_color[2] * this.power];
		}

		this.frame++;

		//upload the canvas once every 10 frames
		//if(this.frame % 10 == 0 || (this.power < 1.0 && this.power > 0.0) )
		{
			this.paintCanvas();
			this.computeLightColor();
			this.texture.uploadImage(this.canvas);
			this.texture.bind();
			gl.generateMipmap(gl.TEXTURE_2D);
			this.texture.unbind();

		}
		return this.texture;
	},

	executeCommand: function(text)
	{
		text = text.toLowerCase();
		if(text == "") return true;

		var tokens = text.split(" ");
		if(this.commands[ tokens[0] ])
			this.commands[tokens[0]].call(this,tokens,text);
		else
			return false;
		return true;
	},

	executeScript: function(text)
	{
		var lines = text.split("\n");
		for(var i in lines)
			this.executeCommand(lines[i]);
	},

	addLine: function(text)
	{
		var lines = text.split("\n");

		for(var i in lines)
		{
			this.buffer.push( lines[i].toUpperCase() );
			if(this.buffer.length > this.MAX_LINES)
				this.buffer.shift();
		}
	},

	session_buffer: ["   **** TAMAT OS 64 BASIC V4 **** \n 64 KB RAM SYSTEM WEBGL ENABLED\nREADY.",
		"load \"*\",8,1",
		"searching for *",
		"loading",
		"ready",
		"",
		"  APP MENU \n ********** \n1 ABOUT\n2 BLOG\n3 APPS\n4 SWITCH LIGHTS\n5 SHOW GAMES\n6 PRIVATE\nTYPE OPTION AND THE NUMBER:'OPTION 5'.\n"
		],

	showSession: function(buffer, time)
	{
		setTimeout(function() {
			var msg = buffer.shift();
			SillyTerminal.addLine( msg );
			var delay_time = 500 + Math.random() * 500;
			//if(msg.indexOf("\n") != -1)	delay_time = 0;
			if (buffer.length)
			{
				SillyTerminal.ready = false;
				SillyTerminal.showSession(buffer, delay_time);
			}
			else 
				SillyTerminal.ready = true;
		},time);
	},

	stopAll: function()
	{
		if(this.resource_to_show)
		{
			if(this.resource_to_show.pause)
				this.resource_to_show.pause();
			this.resource_to_show = null;
		}
	},

	pauseVideo: function()
	{
		if(this.resource_to_show)
		{
			if(this.resource_to_show.pause)
				this.resource_to_show.pause();
		}
	},

	onkeydown: function(e)
	{
		if(!this.ready) return;
		if(e.keyCode == 27)
		{
			this.mode = "console";
			this.stopAll();
		}
		else if(e.keyCode == 13)
		{
			this.addLine( this.line );
			if( !this.executeCommand(this.line) )
				this.addLine("?SYNTAX ERROR\nREADY.");
			this.line = "";
		}
		else if(e.keyCode == 8) 
		{
			if(this.line.length > 0)
				this.line = this.line.substring(0,this.line.length-1);
		}
		else if(e.character && e.character.charCodeAt(0) >= 32)
		{
			trace("char: " + e.character);
			this.line += e.character;
		}
		else 
			return true;

		e.preventDefault();
		e.stopPropagation();
		return false;
	}
};

var debug_var = null;
function debug()
{
}


