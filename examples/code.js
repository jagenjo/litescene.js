function trace(msg) { if (typeof(console) != "undefined") { console.log(msg); } };
var DEG2RAD = 0.0174532925;

var APP = {
	cam_dist: 7.5,
	tv_settings:{
		power: false,
		offset: 0,
		delta_offset:0,
		brightness: 1
	},
	render_options: {},
	
	init: function() {
		//create context 3D
		var context = new LS.Context({width:1000, height:800});
		this.context = context;
		this.glcanvas = context.gl.canvas;
		document.getElementById("visor").appendChild( context.canvas );

		ResourcesManager.path = "assets/";
		Shaders.init("../data/shaders.xml");
		Scene.init();

		context.onMouse = APP.onMouse.bind(this);
		context.onUpdate = APP.onUpdate.bind(this);

		this.setupScene();
	},

	setupScene: function()
	{
		Scene.background_color = [0.1,0.1,0.1,1];
		Scene.ambient_color = [0.2,0.2,0.2];

		//mesh
		var node = new SceneNode("monitor");
		node.material = new Material({ textures: { color: "monitor_textura.png" } });
		node.loadAndSetMesh("monitor.obj");
		Scene.addNode(node);
		var root = node;

		node = new SceneNode("screen");
		node.material = new Material({ color: [0.5,0.5,0.5], emissive: [0.0,0.0,0.0], 
			detail:[-0.5,256,256], 
			specular_factor: 2, specular_gloss: 100, specular_ontop: true,
			textures: { emissive: "c64pot.png",
						emissive_uvs: Material.COORDS_UV_TRANSFORMED,
						detail:"pattern_rgb.png", 
						color: "empty-screen.png" }});
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
			APP.tv_settings.power = this.clicked;
		}, node);
		Scene.addNode(node);
		root.addChild(node);

		node = createKnob("knob");
		node.transform.setPosition([14.5,9.5,-34.0]); //-9.5,9.5,33.8
		node.transform.setScale(1.2,1.2,1.2);
		LEvent.bind(node, "knobChange", function(e,v) { 
			APP.tv_settings.brightness = v;
		 });
		Scene.addNode(node);
		root.addChild(node);

		node = createKnob("knob2");
		node.transform.setPosition([21,9.5,-34.0]); //-9.5,9.5,33.8
		node.transform.setScale(1.2,1.2,1.2);
		LEvent.bind(node, "knobChange", function(e,v) { 
			APP.tv_settings.delta_offset = (v-0.5)*0.01;
		});
		Scene.addNode(node);
		root.addChild(node);

		node = createKnob("knob3",true);
		node.transform.setPosition([-26,42,-34.5]); //-9.5,9.5,33.8
		node.transform.setScale(1.2,1.2,1.2);
		LEvent.bind(node, "knobChange", function(e,v) {  
		
		});
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
		Scene.camera.eye = [150,40,100];
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

	rotateScene: function(angle)
	{
		Scene.getNode("monitor").transform.rotate(angle,[0,1,0]);
	},

	onUpdate: function(dt)
	{
		var now = new Date().getTime();
		var idle = 0.2 * Math.sin(new Date().getTime() * 0.0005);
		Scene.camera.eye = [15 * (APP.cam_dist + idle),40, 15 * (APP.cam_dist + idle)];

		//Monitor screen effects
		var mat = Scene.getNode("screen").getMaterial();
		var emissive = mat.emissive;
		if(APP.tv_settings.power && emissive[0] < 3)
			vec3.add(emissive,emissive,[0.1,0.1,0.1]);
		else if(!APP.tv_settings.power && emissive[0] > 0)
			vec3.sub(emissive,emissive,[0.1,0.1,0.1]);
		vec3.scale(emissive,emissive,APP.tv_settings.brightness);
		mat.detail[0] = emissive[0]*0.1;
		if(APP.tv_settings.power)
			mat.alpha = Math.random() * 0.05 + 0.95;
		else
			mat.alpha = 0.9;
		mat.uvs_matrix[7] += APP.tv_settings.offset;
		APP.tv_settings.offset += dt * APP.tv_settings.delta_offset;
	},

	onMouse: function(e)
	{
		if(e.dragging && e.type == "mousemove")
		{
			if(e.scene_node && e.scene_node.interactive)
				LEvent.trigger(e.scene_node,"mousemove",e);
			else
			{
				APP.rotateScene(e.deltaX);
				APP.cam_dist += e.deltaY * 0.01;
				if(APP.cam_dist < 5) APP.cam_dist = 5;
				else if(APP.cam_dist > 10) APP.cam_dist = 10;
			}
		}
	}
};