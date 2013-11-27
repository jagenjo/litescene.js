//************************************
/**
* The Renderer is in charge of generating one frame of the scene. Contains all the passes and intermediate functions to create the frame.
*
* @class Renderer
* @namespace LS
* @constructor
*/

var Renderer = {

	default_shader: "globalshader",
	default_low_shader: "lowglobalshader",

	color_rendertarget: null, //null means screen, otherwise if texture it will render to that texture
	depth_rendertarget: null, //depth texture to store depth
	generate_shadowmaps: true,
	update_materials: true,
	sort_nodes_in_z: true,
	z_pass: false, //enable when the shaders are too complex (normalmaps, etc) to reduce work of the GPU (still some features missing)

	/*
	//TODO: postfx integrated in render pipeline, not in use right now
	apply_postfx: true,
	postfx_settings: { width: 1024, height: 512 },
	postfx: [], //
	_postfx_texture_a: null,
	_postfx_texture_b: null,
	*/

	_renderkeys: {}, //not used
	_full_viewport: vec4.create(), //contains info about the full viewport available to render (depends if using FBOs)

	//temp variables for rendering pipeline passes
	_current_scene: null,
	_default_material: new Material(), //used for objects without material

	//stats
	_rendercalls: 0,

	reset: function()
	{
		this.color_rendertarget = null;
		this.depth_rendertarget = null;
	},

	/**
	* Renders the current scene to the screen
	*
	* @method render
	* @param {SceneTree} scene
	* @param {Camera} camera
	* @param {Object} options
	*/
	render: function(scene, camera, options)
	{
		options = options || {};

		scene = scene || Scene;
		this._current_scene = scene;
		options.main_camera = camera;
		this._rendercalls = 0;

		//events
		LEvent.trigger(Scene, "beforeRender" );
		scene.sendEventToNodes("beforeRender" );

		//get render instances, lights, materials and all rendering info ready
		this.updateVisibleData(scene, options);

		//settings for cameras
		var cameras = this._visible_cameras;
		if(camera && !options.render_all_cameras )
			cameras = [ camera ];
		Renderer.main_camera = cameras[0];

		//generate shadowmap
		if(scene.settings.enable_shadows && !options.skip_shadowmaps && this.generate_shadowmaps && !options.shadows_disabled && !options.lights_disabled && !options.low_quality)
			this.renderShadowMaps();

		LEvent.trigger(Scene, "afterRenderShadows" );
		scene.sendEventToNodes("afterRenderShadows" );

		//render one camera or all the cameras
		var current_camera = null;

		for(var i in cameras)
		{
			current_camera = cameras[i];
			LEvent.trigger(current_camera, "beforeRender" );

			//Render scene to screen, buffer, to Color&Depth buffer 
			Renderer._full_viewport.set([0,0,gl.canvas.width, gl.canvas.height]);

			if(this.color_rendertarget && this.depth_rendertarget) //render color & depth to RT
				Texture.drawToColorAndDepth(this.color_rendertarget, this.depth_rendertarget, inner_draw);
			else if(this.color_rendertarget) //render color to RT
				this.color_rendertarget.drawTo(inner_draw);
			else //Screen render
			{
				gl.viewport(0,0,gl.canvas.width,gl.canvas.height);
				inner_draw(); //main render
				//gl.viewport(0,0,gl.canvas.width,gl.canvas.height);
			}
			LEvent.trigger(current_camera, "afterRender" );
		}

		//foreground
		if(scene.textures["foreground"])
		{
			var texture = null;
			if(typeof(scene.textures["foreground"]) == "string")
				texture = LS.ResourcesManager.textures[ scene.textures["foreground"] ];
			if(texture)
			{
				gl.enable( gl.BLEND );
				gl.blendFunc( gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA );
				gl.disable( gl.DEPTH_TEST );
				texture.toViewport();
				gl.disable( gl.BLEND );
				gl.enable( gl.DEPTH_TEST );
			}
		}

		//events
		LEvent.trigger(Scene, "afterRender" );
		Scene.sendEventToNodes("afterRender" );

		Scene._frame += 1;
		Scene._must_redraw = false;

		//render scene (callback format for render targets)
		function inner_draw(tex)
		{
			var camera = current_camera;
			//gl.scissor( this.active_viewport[0], this.active_viewport[1], this.active_viewport[2], this.active_viewport[3] );
			//gl.enable(gl.SCISSOR_TEST);
			if(tex)
				Renderer._full_viewport.set([0,0,tex.width, tex.height]);

			Renderer.enableCamera( camera, options ); //set as active camera and set viewport

			//clear
			gl.clearColor(scene.background_color[0],scene.background_color[1],scene.background_color[2], scene.background_color.length > 3 ? scene.background_color[3] : 0.0);
			if(options.ignore_clear != true && !camera._ignore_clear)
				gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

			//render scene
			//RenderPipeline.renderInstances(options);

			LEvent.trigger(scene, "beforeRenderScene", camera);
			scene.sendEventToNodes("beforeRenderScene", camera);

			Renderer.renderInstances("main",options);

			LEvent.trigger(scene, "afterRenderScene", camera);
			scene.sendEventToNodes("afterRenderScene", camera);

			//gl.disable(gl.SCISSOR_TEST);
		}

	},

	//reusable locals
	_view_matrix: mat4.create(),
	_projection_matrix: mat4.create(),
	_viewprojection_matrix: mat4.create(),
	_mvp_matrix: mat4.create(),
	_temp_matrix: mat4.create(),

	/**
	* Set camera as the main scene camera
	*
	* @method enableCamera
	* @param {Camera} camera
	*/
	enableCamera: function(camera, options, skip_viewport)
	{
		LEvent.trigger(camera, "cameraEnabled", options);

		//camera.setActive();
		var width = Renderer._full_viewport[2];
		var height = Renderer._full_viewport[3];
		var final_width = width * camera._viewport[2];
		var final_height = height * camera._viewport[3];

		if(!skip_viewport)
		{
			if(options && options.ignore_viewports)
			{
				camera._aspect = width / height;
				gl.viewport( this._full_viewport[0], this._full_viewport[1], this._full_viewport[2], this._full_viewport[3] );
			}
			else
			{
				camera._aspect = final_width / final_height;
				gl.viewport( camera._viewport[0] * width, camera._viewport[1] * height, camera._viewport[2] * width, camera._viewport[3] * height );
			}
		}

		//compute matrices
		camera.updateMatrices();

		//store matrices locally
		mat4.copy( this._view_matrix, camera._view_matrix );
		mat4.copy( this._projection_matrix, camera._projection_matrix );
		mat4.copy( this._viewprojection_matrix, camera._viewprojection_matrix );

		//set as the current camera
		this.active_camera = camera;
	},

	//Work in progress
	renderInstances: function(step, options)
	{
		var scene = this.current_scene || Scene;
		options = options || {};
		options.camera = this.active_camera;
		options.step = step;

		LEvent.trigger(scene, "beforeRenderPass", options);
		scene.sendEventToNodes("beforeRenderPass", options);

		//compute global scene info
		this.fillSceneShaderMacros( scene, options );
		this.fillSceneShaderUniforms( scene, options );

		//render background
		if(scene.textures["background"])
		{
			var texture = null;
			if(typeof(scene.textures["background"]) == "string")
				texture = LS.ResourcesManager.textures[ scene.textures["background"] ];
			if(texture)
			{
				gl.disable( gl.BLEND );
				gl.disable( gl.DEPTH_TEST );
				texture.toViewport();
			}
		}

		//reset state of everything!
		gl.enable( gl.DEPTH_TEST );
		gl.depthFunc( gl.LESS );
		gl.disable( gl.BLEND );
		gl.lineWidth(1);

		//this.updateVisibleInstances(scene,options);
		var lights = this._visible_lights;
		var render_instances = this._visible_instances;

		//for each render instance
		for(var i in render_instances)
		{
			//render instance
			var instance = render_instances[i];

			var flags = instance.node.flags;

			//hidden nodes
			if(options.is_rt && flags.seen_by_reflections == false)
				continue;
			if(options.is_shadowmap && !(instance.flags & RI_CAST_SHADOWS))
				continue;
			if(flags.seen_by_camera == false && !options.is_shadowmap && !options.is_picking && !options.is_reflection)
				continue;
			if(flags.seen_by_picking == false && options.is_picking)
				continue;
			if(instance.material.opacity <= 0)
				continue;

			//Compute lights affecting this RI
			//TODO

			//choose the appropiate render pass
			if(options.is_shadowmap)
				this.renderShadowPassInstance(step, instance, options );
			else if(options.is_picking)
				this.renderPickingInstance(step, instance, options );
			else
				this.renderMultiPassInstance(step, instance, lights, scene, options );
		}

		//restore state
		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(gl.LESS);
		gl.depthMask(true);
		gl.disable(gl.BLEND);
		gl.frontFace(gl.CCW);

		LEvent.trigger(scene, "afterRenderPass",options);
		scene.sendEventToNodes("afterRenderPass",options);

		//EVENT SCENE after_render
		//restore state
		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(gl.LESS);
		gl.depthMask(true);
		gl.disable(gl.BLEND);
		gl.frontFace(gl.CCW);
	},

	//possible optimizations: bind the mesh once, bind the surface textures once
	renderMultiPassInstance: function(step, instance, lights, scene, options)
	{
		//for every light
		//1. Generate the renderkey:  step|nodeuid|matuid|lightuid
		//2. Get shader, if it doesnt exist:
		//		a. Compute the shader
		//		b. Store shader with renderkey
		//3. Fill the shader with uniforms
		//4. Render instance
		var node = instance.node;
		var mat = instance.material;

		//compute matrices
		var model = instance.matrix;
		mat4.multiply(this._mvp_matrix, this._viewprojection_matrix, model );

		//node matrix info
		var node_macros = node._macros;
		var node_uniforms = node._uniforms;

		node_uniforms.u_mvp = this._mvp_matrix;
		node_uniforms.u_model = model;
		node_uniforms.u_normal_model = instance.normal_matrix; 

		//FLAGS
		this.enableInstanceFlags(instance, options);

		//alpha blending flags
		if(mat.blending == Material.ADDITIVE_BLENDING)
		{
			gl.enable( gl.BLEND );
			gl.blendFunc( gl.SRC_ALPHA, gl.ONE );
		}
		else if(mat.opacity < 0.999 || (instance.flags & RI_BLEND) )
		{
			gl.enable( gl.BLEND );
			gl.blendFunc( gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA );
		}
		else
			gl.disable( gl.BLEND );

		//assign material samplers (maybe they are not used...)
		for(var i = 0; i < mat._samplers.length; i++)
		{
			var s = mat._samplers[i];
			mat._uniforms[ s[0] ] = i;
			s[1].bind(i);
		}

		var shader_name = instance.material.shader_name;
		if(options.low_quality)
			shader_name = Renderer.default_low_shader;
		else
			shader_name = Renderer.default_shader;

		//multi pass instance rendering
		var num_lights = lights.length;

		//no lights
		if(!num_lights)
		{
			var shader = Shaders.get(shader_name, scene._macros, node_macros, instance.macros, mat._macros, { FIRST_PASS:"", USE_AMBIENT_ONLY:"" });
			//assign uniforms
			shader.uniforms( scene._uniforms );
			shader.uniforms( node_uniforms );
			shader.uniforms( mat._uniforms );
			shader.uniforms( instance.uniforms );

			//render
			instance.render( shader );
			this._rendercalls += 1;
			return;
		}


		for(var iLight = 0; iLight < num_lights; iLight++)
		{
			var light = lights[iLight];

			//generate renderkey
			//var renderkey = instance.generateKey(step, options);

			//compute the  shader
			var shader = null; //this._renderkeys[renderkey];
			if(!shader)
			{
				var light_macros = instance.material.getLightShaderMacros(light, node, scene, options);

				if(iLight == 0) light_macros.FIRST_PASS = "";
				if(iLight == (num_lights-1)) light_macros.LAST_PASS = "";

				var macros = {};
				macros.merge(scene._macros);
				macros.merge(node_macros);
				macros.merge(mat._macros);
				macros.merge(instance.macros);
				macros.merge(light_macros);
 
				shader = Shaders.get(shader_name, macros);
			}

			//fill shader data
			var light_uniforms = instance.material.fillLightUniforms( iLight, light, instance, options );

			//secondary pass flags to make it additive
			if(iLight > 0)
			{
				gl.enable(gl.BLEND);
				gl.blendFunc(gl.SRC_ALPHA,gl.ONE);
				gl.depthFunc( gl.LEQUAL );
				//gl.depthMask(true);
				if(node.flags.depth_test)
					gl.enable(gl.DEPTH_TEST);
				else
					gl.disable( gl.DEPTH_TEST );
			}

			if(mat.depth_func)
				gl.depthFunc( gl[mat.depth_func] );

			//assign uniforms
			shader.uniforms( scene._uniforms );
			shader.uniforms( node_uniforms );
			shader.uniforms( mat._uniforms );
			shader.uniforms( light_uniforms );
			shader.uniforms( instance.uniforms );

			//render
			instance.render( shader );
			this._rendercalls += 1;

			if(shader.global && !shader.global.multipass)
				break; //avoid multipass in simple shaders
		}
	},

	renderShadowPassInstance: function(step, instance, options)
	{
		var scene = options.scene || Scene;
		var node = instance.node;
		var mat = instance.material;

		//compute matrices
		var model = instance.matrix;
		mat4.multiply(this._mvp_matrix, this._viewprojection_matrix, model );

		//node matrix info
		var node_macros = node._macros;
		var node_uniforms = node._uniforms;

		node_uniforms.u_mvp = this._mvp_matrix;
		node_uniforms.u_model = model;
		node_uniforms.u_normal_model = instance.normal_matrix; 

		//FLAGS
		this.enableInstanceFlags(instance, options);

		if(node.flags.alpha_shadows == true && (mat.getTexture("color") || mat.getTexture("opacity")))
		{
			var macros = { USE_ALPHA_TEST: "0.5" };

			var color = mat.getTexture("color");
			if(color)
			{
				var color_uvs = mat.textures["color_uvs"] || Material.DEFAULT_UVS["color"] || "0";
				macros.USE_COLOR_TEXTURE = "uvs_" + color_uvs;
				color.bind(0);
			}

			var opacity = mat.getTexture("opacity");
			if(opacity)	{
				var opacity_uvs = mat.textures["opacity_uvs"] || Material.DEFAULT_UVS["opacity"] || "0";
				macros.USE_OPACITY_TEXTURE = "uvs_" + opacity_uvs;
				opacity.bind(1);
			}
			macros.merge(node_macros);
			shader = Shaders.get("depth", macros);
			shader.uniforms({ texture: 0, opacity_texture: 1 });
		}
		else
		{
			//shader = Shaders.get("depth", node._macros );
			var macros = {};
			macros.merge(node_macros);
			macros.merge(mat._macros);
			macros.merge(instance.macros);
			shader = Shaders.get("depth", macros );
		}

		shader.uniforms( mat._uniforms );
		shader.uniforms(node_uniforms);
		instance.render(shader);
		this._rendercalls += 1;
	},

	//do not reuse the macros, they change between rendering passes (shadows, reflections, etc)
	fillSceneShaderMacros: function( scene, options )
	{
		var macros = {};

		//camera info
		if(options.camera.type == Camera.ORTHOGRAPHIC)
			macros.USE_ORTHOGRAPHIC_CAMERA = "";

		if(options.clipping_plane)
			macros.USE_CLIPPING_PLANE = "";

		if(options.brightness_factor && options.brightness_factor != 1)
			macros.USE_BRIGHTNESS_FACTOR = "";

		if(options.colorclip_factor)
			macros.USE_COLORCLIP_FACTOR = "";

		scene._macros = macros;
	},

	//DO NOT CACHE, parameter can change between render passes
	fillSceneShaderUniforms: function( scene, options)
	{
		//global uniforms
		var uniforms = {
			u_camera_eye: this.active_camera.getEye(),
			u_camera_planes: [this.active_camera.near, this.active_camera.far],
			//u_viewprojection: this._viewprojection_matrix,
			u_time: scene.current_time || new Date().getTime() * 0.001,
			u_brightness_factor: options.brightness_factor != null ? options.brightness_factor : 1,
			u_colorclip_factor: options.colorclip_factor != null ? options.colorclip_factor : 0,
			u_ambient_color: scene.ambient_color
		};

		if(options.clipping_plane)
			uniforms.u_clipping_plane = options.clipping_plane;

		scene._uniforms = uniforms;
	},

	renderPickingInstance: function(step, instance, options)
	{
		var node = instance.node;
		var model = instance.matrix;
		mat4.multiply(this._mvp_matrix, this._viewprojection_matrix, model );

		this._picking_next_color_id += 10;
		var pick_color = new Uint32Array(1); //store four bytes number
		pick_color[0] = this._picking_next_color_id; //with the picking color for this object
		var byte_pick_color = new Uint8Array( pick_color.buffer ); //read is as bytes
		//byte_pick_color[3] = 255; //Set the alpha to 1
		this._picking_nodes[this._picking_next_color_id] = node;

		var shader = Shaders.get("flat");
		shader.uniforms({u_mvp: this._mvp_matrix, u_material_color: new Float32Array([byte_pick_color[0] / 255,byte_pick_color[1] / 255,byte_pick_color[2] / 255, 1]) });
		instance.render(shader);
	},

	enableInstanceFlags: function(instance, options)
	{
		var flags = instance.flags;

		//backface culling
		if( flags & RI_CULL_FACE )
			gl.enable( gl.CULL_FACE );
		else
			gl.disable( gl.CULL_FACE );

		//  depth
		gl.depthFunc( gl.LEQUAL );
		if(flags & RI_DEPTH_TEST)
			gl.enable( gl.DEPTH_TEST );
		else
			gl.disable( gl.DEPTH_TEST );

		if(flags & RI_DEPTH_WRITE)
			gl.depthMask(true);
		else
			gl.depthMask(false);

		//when to reverse the normals?
		var order = gl.CCW;
		if(flags & RI_CW)
			order = gl.CW;
		if(options.reverse_backfacing)
			order = order == gl.CW ? gl.CCW : gl.CW;
		gl.frontFace(order);
	},

	//collects the rendering instances and lights that are visible
	updateVisibleData: function(scene, options)
	{
		options = options || {};

		//var nodes = scene.nodes;
		var nodes = scene.getNodes();
		if (options.nodes)
			nodes = options.nodes;

		var camera = options.main_camera;
		options.current_camera = camera;
		var camera_eye = camera.getEye();

		var instances = [];
		var opaque_instances = [];
		var alpha_instances = [];
		var lights = [];
		var cameras = [];
		var materials = {}; //I dont want repeated materials here

		//collect render instances and lights
		for(var i in nodes)
		{
			var node = nodes[i];

			if(node.flags.visible == false) //skip invisibles
				continue;

			//trigger event
			LEvent.trigger(node, "computeVisibility", {camera: camera, options: options});

			//compute global matrix
			if(node.transform)
				node.transform.updateGlobalMatrix();

			//special node deformers
			var node_macros = {};
			LEvent.trigger(node, "computingShaderMacros", node_macros );

			var node_uniforms = {};
			LEvent.trigger(node, "computingShaderUniforms", node_uniforms );

			node._macros = node_macros;
			node._uniforms = node_uniforms;

			//get render instances
			LEvent.trigger(node,"collectRenderInstances", instances );
			LEvent.trigger(node,"collectLights", lights );
			LEvent.trigger(node,"collectCameras", cameras );
		}

		//complete render instances
		for(var i in instances)
		{
			var instance = instances[i];
			if(!instance) continue;
			var node_flags = instance.node.flags;

			//materials
			if(!instance.material)
				instance.material = this._default_material;
			materials[instance.material._uid] = instance.material;

			//add extra info
			instance.computeNormalMatrix();
			instance._dist = vec3.dist( instance.center, camera_eye );

			//add AABBs
			//TODO

			//change conditionaly
			if(options.force_wireframe) instance.primitive = gl.LINES;
			if(instance.primitive == gl.LINES && !instance.mesh.lines)
				instance.mesh.computeWireframe();

			//and finally, the alpha thing to determine if it is visible or not
			var mat = instance.material;
			if(mat.opacity < 1.0 || mat.blending == Material.ADDITIVE_BLENDING || (instance.flags & RI_BLEND) )
				alpha_instances.push(instance);
			else
				opaque_instances.push(instance);

			//node & mesh constant information
			var macros = instance.macros;
			if(instance.flags & RI_ALPHA_TEST)
				macros.USE_ALPHA_TEST = "0.5";
			else if(macros["USE_ALPHA_TEST"])
				delete macros["USE_ALPHA_TEST"];

			var mesh = instance.mesh;
			if(!("a_normal" in mesh.vertexBuffers))
				macros.NO_NORMALS = "";
			if(!("a_coord" in mesh.vertexBuffers))
				macros.NO_COORDS = "";
			if(("a_color" in mesh.vertexBuffers))
				macros.USE_COLOR_STREAM = "";
			if(("a_tangent" in mesh.vertexBuffers))
				macros.USE_TANGENT_STREAM = "";
		}

		//sort RIs in Z for alpha sorting
		if(this.sort_nodes_in_z)
		{
			opaque_instances.sort(function(a,b) { return a._dist - b._dist; });
			alpha_instances.sort(function(a,b) { return b._dist - a._dist; });
			//opaque_meshes = opaque_meshes.sort( function(a,b){return vec3.dist( a.center, camera.eye ) - vec3.dist( b.center, camera.eye ); });
			//alpha_meshes = alpha_meshes.sort( function(b,a){return vec3.dist( a.center, camera.eye ) - vec3.dist( b.center, camera.eye ); }); //reverse sort
		}

		//update materials info only if they are in use
		if(this.update_materials)
		{
			for(var i in materials)
			{
				var material = materials[i];
				if(!material._macros)
				{
					material._macros = {};
					material._uniforms = {};
					material._samplers = [];
				}
				material.fillSurfaceShaderMacros(scene); //update shader macros on this material
				material.fillSurfaceUniforms(scene); //update uniforms
			}
		}

		this._alpha_instances = alpha_instances;
		this._opaque_instances = opaque_instances;
		this._visible_instances = opaque_instances.concat(alpha_instances); //merge
		this._visible_lights = lights;
		this._visible_cameras = cameras;
		this._visible_materials = materials;
	},

	//Renders the scene to an RT, not in use anymore
	renderInstancesToRT: function(cam, texture, options)
	{
		if(texture.texture_type == gl.TEXTURE_2D)
		{
			this.enableCamera(cam);
			texture.drawTo( inner_draw_2d );
		}
		else if( texture.texture_type == gl.TEXTURE_CUBE_MAP)
			this.renderToCubemap(cam.getEye(), texture.width, texture, options, cam.near, cam.far);

		function inner_draw_2d()
		{
			gl.clearColor(Scene.background_color[0],Scene.background_color[1],Scene.background_color[2], Scene.background_color.length > 3 ? Scene.background_color[3] : 0.0);
			if(options.ignore_clear != true)
				gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
			//render scene
			Renderer.renderInstances("main",options);
		}
	},

	//Renders all the shadowmaps in the SCENE
	renderShadowMaps: function(scene)
	{
		scene = scene || Scene;

		for(var i in this._visible_lights)
		{
			var light = this._visible_lights[i];
			if(!light.cast_shadows)
				continue;

			var shadowmap_resolution = light.shadowmap_resolution;
			if(!shadowmap_resolution)
				shadowmap_resolution = Light.DEFAULT_SHADOWMAP_RESOLUTION;

			var tex_type = light.type == Light.OMNI ? gl.TEXTURE_CUBE_MAP : gl.TEXTURE_2D;
			if(light._shadowMap == null || light._shadowMap.width != shadowmap_resolution || light._shadowMap.texture_type != tex_type)
			{
				light._shadowMap = new GL.Texture( shadowmap_resolution, shadowmap_resolution, { texture_type: tex_type, format: gl.RGBA, magFilter: gl.NEAREST, minFilter: gl.NEAREST });
				ResourcesManager.textures[":shadowmap_" + light._uid ] = light._shadowMap;
			}

			if(light.type == Light.OMNI)
			{
				this.renderToCubemap( light.getPosition(), shadowmap_resolution, light._shadowMap, { is_shadowmap: true }, light.near, light.far, "shadow");
			}
			else
			{
				light.computeLightMatrices(this._view_matrix, this._projection_matrix, this._viewprojection_matrix);
				this.active_camera = scene.current_camera; //to avoid nulls

				// Render the object viewed from the light using a shader that returns the
				// fragment depth.
				light._shadowMap.unbind(); //¿?
				light._shadowMap.drawTo(function() {
					gl.clearColor(0, 0, 0, 1);
					//gl.clearColor(1, 1, 1, 1);
					gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

					//save the VP of the shadowmap camera
					if( !light._lightMatrix ) light._lightMatrix = mat4.create();
					mat4.copy( Renderer._viewprojection_matrix, light._lightMatrix );

					Renderer.renderInstances("shadow", { is_shadowmap: true });
				});
			}
		}
	},

	/*
	//Render Cameras that need to store the result in RTs
	renderRTCameras: function()
	{
		var scene = this.current_scene || Scene;

		for(var i in scene.rt_cameras)
		{
			var camera = scene.rt_cameras[i];
			if(camera.texture == null)
			{
				camera.texture = new GL.Texture( camera.resolution || 1024, camera.resolution || 1024, { format: gl.RGB, magFilter: gl.LINEAR });
				ResourcesManager.textures[camera.id] = camera.texture;
			}

			this.enableCamera(camera);

			camera.texture.drawTo(function() {
				gl.clearColor(scene.background_color[0],scene.background_color[1],scene.background_color[2], 0.0);
				gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

				var options = {is_rt: true, clipping_plane: camera.clipping_plane};
				Renderer.renderInstances("rts",options);
			});
		}
	},
	*/

	/* reverse
	cubemap_camera_parameters: [
		{dir: [1,0,0], up:[0,1,0]}, //positive X
		{dir: [-1,0,0], up:[0,1,0]}, //negative X
		{dir: [0,-1,0], up:[0,0,-1]}, //positive Y
		{dir: [0,1,0], up:[0,0,1]}, //negative Y
		{dir: [0,0,-1], up:[0,1,0]}, //positive Z
		{dir: [0,0,1], up:[0,1,0]} //negative Z
	],
	*/

	cubemap_camera_parameters: [
		{dir: [1,0,0], up:[0,-1,0]}, //positive X
		{dir: [-1,0,0], up:[0,-1,0]}, //negative X
		{dir: [0,1,0], up:[0,0,1]}, //positive Y
		{dir: [0,-1,0], up:[0,0,-1]}, //negative Y
		{dir: [0,0,1], up:[0,-1,0]}, //positive Z
		{dir: [0,0,-1], up:[0,-1,0]} //negative Z
	],


	//renders the current scene to a cubemap centered in the given position
	renderToCubemap: function(position, size, texture, options, near, far, step)
	{
		size = size || 256;
		near = near || 1;
		far = far || 1000;
		step = step || "main";

		var eye = position;
		if( !texture || texture.constructor != Texture) texture = null;

		texture = texture || new Texture(size,size,{texture_type: gl.TEXTURE_CUBE_MAP, minFilter: gl.NEAREST});
		texture.drawTo(function(texture, side) {
			var cams = Renderer.cubemap_camera_parameters;
			if(step == "shadow")
				gl.clearColor(0,0,0,0);
			else
				gl.clearColor(Scene.background_color[0],Scene.background_color[1],Scene.background_color[2], Scene.background_color.length > 3 ? Scene.background_color[3] : 1.0);
			gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
			var cam = new Camera({ eye: eye, center: [ eye[0] + cams[side].dir[0], eye[1] + cams[side].dir[1], eye[2] + cams[side].dir[2]], up: cams[side].up, fov: 90, aspect: 1.0, near: near, far: far });
			Renderer.enableCamera(cam,options,true);
			Renderer.renderInstances(step,options);
		});

		return texture;
	},


	//picking
	_pickingMap: null,
	_picking_color: new Uint8Array(4),
	_picking_depth: 0,
	_picking_next_color_id: 0,
	_picking_nodes: {},

	renderPickingBuffer: function(camera, x,y)
	{
		var scene = this.current_scene || Scene;

		//trace("Starting Picking at : (" + x + "," + y + ")  T:" + new Date().getTime() );
		if(this._pickingMap == null || this._pickingMap.width != gl.canvas.width || this._pickingMap.height != gl.canvas.height )
		{
			this._pickingMap = new GL.Texture( gl.canvas.width, gl.canvas.height, { format: gl.RGBA, filter: gl.NEAREST });
			ResourcesManager.textures[":picking"] = this._pickingMap;
		}

		y = gl.canvas.height - y; //reverse Y
		var small_area = true;
		this._picking_next_color_id = 0;


		this._pickingMap.drawTo(function() {
			//trace(" START Rendering ");

			var viewport = scene.viewport || [0,0,gl.canvas.width, gl.canvas.height];
			camera.aspect = viewport[2] / viewport[3];
			gl.viewport( viewport[0], viewport[1], viewport[2], viewport[3] );

			if(small_area)
			{
				gl.scissor(x-1,y-1,2,2);
				gl.enable(gl.SCISSOR_TEST);
			}

			gl.clearColor(0,0,0,0);
			gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

			Renderer.enableCamera(camera);

			//gl.viewport(x-20,y-20,40,40);
			Renderer.renderInstances("picking",{is_picking:true});
			//gl.scissor(0,0,gl.canvas.width,gl.canvas.height);

			gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,Renderer._picking_color);

			if(small_area)
				gl.disable(gl.SCISSOR_TEST);
		});

		//if(!this._picking_color) this._picking_color = new Uint8Array(4); //debug
		//trace(" END Rendering: ", this._picking_color );
		return this._picking_color;
	},

	getNodeAtCanvasPosition: function(scene, camera, x,y)
	{
		scene = scene || Scene;
		camera = camera || Scene.getCamera();

		this._picking_nodes = {};
		this.renderPickingBuffer(camera, x,y);
		this._picking_color[3] = 0; //remove alpha, because alpha is always 255
		var id = new Uint32Array(this._picking_color.buffer)[0]; //get only element

		var node = this._picking_nodes[id];
		this._picking_nodes = {};

		return node;
	},

	projectToCanvas: function(x,y,z)
	{

	}
};

//Add to global Scope
LS.Renderer = Renderer;