/**
* RenderInstance contains info of one object to be rendered on the scene.
*
* @class RenderInstance
* @namespace LS
* @constructor
*/

//flags
RenderInstance.TWO_SIDED = 1;

function RenderInstance()
{
	this._key = "";
	this._uid = LS.generateUId();
	this.mesh = null;
	this.primitive = gl.TRIANGLES;
	this.material = null;
	this.flags = 0;
	this.matrix = mat4.create();
	this.center = vec3.create();
}

RenderInstance.prototype.generateKey = function(step, options)
{
	this._key = step + "|" + this.node._uid + "|" + this.material._uid + "|";
	return this._key;
}

	//this func is executed using the instance as SCOPE: TODO, change it
RenderInstance.prototype.render = function(shader)
{
	if(this.submesh_id != null && this.submesh_id != -1 && this.mesh.info.groups && this.mesh.info.groups.length > this.submesh_id)
		shader.drawRange(this.mesh, this.primitive, this.mesh.info.groups[this.submesh_id].start, this.mesh.info.groups[this.submesh_id].length);
	else if(this.start || this.length)
		shader.drawRange(this.mesh, this.primitive, this.start || 0, this.length);
	else
		shader.draw(this.mesh, this.primitive);
}


//************************************
/**
* The Renderer is in charge of generating one frame of the scene. Contains all the passes and intermediate functions to create the frame.
*
* @class Renderer
* @namespace LS
* @constructor
*/

var Renderer = {

	apply_postfx: true,
	generate_shadowmaps: true,
	sort_nodes_in_z: true,
	z_pass: false, //enable when the shaders are too complex (normalmaps, etc) to reduce work of the GPU (still some features missing)

	//TODO: postfx integrated in render pipeline, not in use right now
	postfx_settings: { width: 1024, height: 512 },
	postfx: [], //
	_postfx_texture_a: null,
	_postfx_texture_b: null,

	_renderkeys: {},

	//temp variables for rendering pipeline passes
	_current_scene: null,
	_default_material: new Material(), //used for objects without material
	_visible_lights: [],

	_visible_meshes: [],
	_opaque_meshes: [],
	_alpha_meshes: [],

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

		//events
		LEvent.trigger(Scene, "beforeRender", camera);
		scene.sendEventToNodes("beforeRender", camera);

		if(scene.light && scene.light.onBeforeRender) 
			scene.light.onBeforeRender(); //ugly hack because the scene could have a light and it is not a node

		//get lights
		this.updateVisibleLights(scene, options.nodes);

		//generate shadowmap
		if(scene.settings.enable_shadows && !options.skip_shadowmaps && this.generate_shadowmaps && !options.shadows_disabled && !options.lights_disabled)
			this.renderShadowMaps();

		LEvent.trigger(Scene, "afterRenderShadows", camera);
		scene.sendEventToNodes("afterRenderShadows", camera);

		//generate RTs
		if(scene.settings.enable_rts && !options.skip_rts)
			if(scene.rt_cameras.length > 0)
				this.renderRTCameras();

		//Render scene to PostFX buffer, to Color&Depth buffer or directly to screen
		scene.active_viewport = scene.viewport || [0,0,gl.canvas.width, gl.canvas.height];
		scene.current_camera.aspect = scene.active_viewport[2]/scene.active_viewport[3];

		if(this.apply_postfx && this.postfx.length) //render to RT and apply FX //NOT IN USE
			this.renderPostFX(inner_draw);
		else if(options.texture && options.depth_texture) //render to RT COLOR & DEPTH
			Texture.drawToColorAndDepth(options.texture, options.depth_texture, inner_draw);
		else if(options.texture) //render to RT
			options.texture.drawTo(inner_draw)
		else //render directly to screen (better antialiasing)
		{
			gl.viewport( scene.active_viewport[0], scene.active_viewport[1], scene.active_viewport[2], scene.active_viewport[3] );
			inner_draw(); //main render
			gl.viewport(0,0,gl.canvas.width,gl.canvas.height);
		}

		//events
		LEvent.trigger(Scene, "afterRender", camera);
		Scene.sendEventToNodes("afterRender", camera);
		if(scene.light && scene.light.onAfterRender) //fix this plz
			scene.light.onAfterRender();
		Scene._frame += 1;
		Scene._must_redraw = false;

		//render scene (callback format for render targets)
		function inner_draw()
		{
			//gl.scissor( this.active_viewport[0], this.active_viewport[1], this.active_viewport[2], this.active_viewport[3] );
			//gl.enable(gl.SCISSOR_TEST);
			gl.clearColor(scene.background_color[0],scene.background_color[1],scene.background_color[2], scene.background_color.length > 3 ? scene.background_color[3] : 1.0);
			if(options.ignore_clear != true)
				gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

			Renderer.enableCamera( camera ); //set as active camera
			//render scene
			//RenderPipeline.renderSceneMeshes(options);
			Renderer.renderSceneMeshes("main",options);

			LEvent.trigger(Scene, "afterRenderScene", camera);
			//gl.disable(gl.SCISSOR_TEST);
		}

	},

	//reusable locals
	_view_matrix: mat4.create(),
	_projection_matrix: mat4.create(),
	_viewprojection_matrix: mat4.create(),
	_mvp_matrix: mat4.create(),

	_temp_matrix: mat4.create(),
	_world_model: mat4.create(),
	_object_model: mat4.create(),
	_normal_model: mat4.create(),

	/**
	* Set camera as the main scene camera
	*
	* @method enableCamera
	* @param {Camera} camera
	*/
	enableCamera: function(camera)
	{
		//camera.setActive();
		camera.updateMatrices();
		mat4.copy( this._view_matrix, camera._view_matrix );
		mat4.copy( this._projection_matrix, camera._projection_matrix );
		mat4.copy( this._viewprojection_matrix, camera._viewprojection_matrix );
		this.active_camera = camera;
	},

	/**
	* This function renderes all the meshes to the current rendering context (screen, Texture...)
	*
	* @method renderSceneMeshes
	* @param {Object} options
	*/
	renderSceneMeshesOld: function(options)
	{
		var scene = this.current_scene || Scene;
		options = options || {};

		var picking_next_color_id = 0;
		var brightness_factor = options.brightness_factor != null ? options.brightness_factor : 1;
		var colorclip_factor = options.colorclip_factor != null ? options.colorclip_factor : 0;

		options.camera = this.active_camera;

		LEvent.trigger(Scene, "beforeRenderPass", options);
		Scene.sendEventToNodes("beforeRenderPass", options);

		gl.enable( gl.DEPTH_TEST );
		gl.depthFunc( gl.LESS );
		gl.disable( gl.BLEND );
		gl.lineWidth(1);

		//EVENT SCENE before_render

		var overwrite_shader = null;
		if(options.force_shader)
			overwrite_shader = Shaders.get(options.force_shader);

		var temp_vector = vec3.create();

		//generic uniforms
		var uniforms = {
			u_camera_eye: this.active_camera.eye,
			u_camera_planes: [this.active_camera.near, this.active_camera.far],
			u_viewprojection: this._viewprojection_matrix,
			u_brightness_factor: brightness_factor,
			u_colorclip_factor: colorclip_factor,
			u_time: Scene.current_time || new Date().getTime() * 0.001
		};

		var renderpass_info = { camera: this.active_camera, instance: null, node:null, uniforms: uniforms, macros:null, light: null, lights: this._visible_lights };

		LEvent.trigger(Scene,"fillGlobalUniforms", renderpass_info );

		var clipping_plane = options.clipping_plane;

		//SORTING meshes
		this.updateVisibleMeshesOld(scene,options);

		//Z Draw
		options.pass = "z";
		if(this.z_pass)
		{
			gl.enable( gl.DEPTH_TEST );
			gl.depthFunc( gl.LESS );
			gl.disable( gl.BLEND );

			var shader = Shaders.get("flat");
			gl.colorMask(false,false,false,false);
			for(var i in this._opaque_meshes)
			{
				var instance = this._opaque_meshes[i];
				if(instance.two_sided)
					gl.disable( gl.CULL_FACE );
				else
					gl.enable( gl.CULL_FACE );

				mat4.multiply( this._mvp_matrix, this._viewprojection_matrix, instance.matrix );
				shader.uniforms({u_material_color:[1,0,0,1],u_mvp: this._mvp_matrix});
				instance.renderFunc(shader);
			}
			gl.colorMask(true,true,true,true);
		}

		//global textures
		var depth_texture = ResourcesManager.textures[":scene_depth"];

		//for each node
		options.pass = "main";
		for(var i in this._visible_meshes)
		{
			var instance = this._visible_meshes[i];
			var node = instance.node;
			var mesh = instance.mesh;

			renderpass_info.instance = instance;
			renderpass_info.node = node;

			LEvent.trigger(node, "beforeRenderMeshes",options);

			var mat = instance.material;
			if(typeof(mat) === "string")
				mat = scene.materials[mat];
			if(!mat) mat = this._default_material;

			var low_quality = options.low_quality || node.flags.low_quality;

			if(instance.two_sided)
				gl.disable( gl.CULL_FACE );
			else
				gl.enable( gl.CULL_FACE );

			//depth
			gl.depthFunc( gl.LEQUAL );
			if(node.flags.depth_test)
				gl.enable( gl.DEPTH_TEST );
			else
				gl.disable( gl.DEPTH_TEST );

			if(node.flags.depth_write)
				gl.depthMask(true);
			else
				gl.depthMask(false);

			//main rendering (no picking or shadowmap)
			if(!options.is_shadowmap && !options.is_picking)
			{
				if(mat.blending == Material.ADDITIVE_BLENDING)
				{
					gl.enable( gl.BLEND );
					gl.blendFunc( gl.SRC_ALPHA, gl.ONE );
				}
				else if(mat.alpha < 0.999 )
				{
					gl.enable( gl.BLEND );
					gl.blendFunc( gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA );
				}
				else
					gl.disable( gl.BLEND );
			} //shadowmaps or picking buffer
			else
				gl.disable( gl.BLEND );

			//when to reverse the normals?
			if(node.flags.flip_normals)
				gl.frontFace(gl.CW);
			else
				gl.frontFace(gl.CCW);

			//compute world matrix
			var model = instance.matrix;
			mat4.copy(this._object_model, model ); 
			//mat3.fromMat4(this._normal_model, model );
			mat4.copy(this._normal_model, model );
			mat4.setTranslation(this._normal_model,vec3.create());
			mat4.multiply(this._mvp_matrix, this._viewprojection_matrix, this._object_model );

			var shader = null;
		
			if(options.is_shadowmap) //rendering to the shadowmap, just need the Z
			{
				if(node.flags.cast_shadows != false)
				{
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
						shader = Shaders.get("depth",macros);
						shader.uniforms({u_mvp: this._mvp_matrix, u_material_color: [0,0,0, mat.alpha], texture: 0, opacity_texture: 1, u_texture_matrix: [mat.uvs_matrix[0],0,mat.uvs_matrix[2], 0,mat.uvs_matrix[1],mat.uvs_matrix[3], 0,0,1] });
					}
					else
					{
						shader = Shaders.get("depth");
						shader.uniforms({u_mvp: this._mvp_matrix});
					}
					instance.render(shader);
				}
			}
			else if(options.is_picking) //rendering to the picking buffer? need specific color per object
			{
				picking_next_color_id += 10;
				var pick_color = new Uint32Array(1); //store four bytes number
				pick_color[0] = picking_next_color_id; //with the picking color for this object
				var byte_pick_color = new Uint8Array( pick_color.buffer ); //read is as bytes
				//byte_pick_color[3] = 255; //Set the alpha to 1
				node._picking_color = picking_next_color_id;

				shader = Shaders.get("flat");
				shader.uniforms({u_mvp: this._mvp_matrix, u_material_color: new Float32Array([byte_pick_color[0] / 255,byte_pick_color[1] / 255,byte_pick_color[2] / 255, 1]) });
				instance.render(shader);
			}
			else //regular rendering
			{
				//generic uniforms
				uniforms.u_mvp = this._mvp_matrix;
				uniforms.u_model = this._object_model;
				uniforms.u_normal_model = this._normal_model;

				var material_uniforms = mat.getMaterialShaderData(instance, node, scene, options);
				for(var im in material_uniforms)
					uniforms[im] = material_uniforms[im];

				if(clipping_plane)
					uniforms.u_clipping_plane = clipping_plane;


				LEvent.trigger(Scene,"fillMeshUniforms", renderpass_info );

				//if the shader is hardcoded
				var render_shader = null;
				if(overwrite_shader) render_shader = overwrite_shader;
				else if(node.shader) render_shader = node.shader; //node shader has priority over mat shader
				else if(mat.shader) render_shader = mat.shader;
				else render_shader = "globalshader";

				//multipass lighting
				var texture = null;
				var first_light = true;
				var num_lights = this._visible_lights.length;
				for(var light_iterator = 0; light_iterator < num_lights; ++light_iterator)
				{
					var light = this._visible_lights[light_iterator];
					renderpass_info.light = light;

					if(light_iterator > 0)
					{
						gl.enable(gl.BLEND);
						gl.blendFunc(gl.SRC_ALPHA,gl.ONE);
						///uniforms.u_ambient_color = [0,0,0];
						///uniforms.u_emissive_color = [0,0,0];

						gl.depthFunc( gl.LEQUAL );
						//gl.depthMask(true);
						if(node.flags.depth_test)
							gl.enable(gl.DEPTH_TEST);
						else
							gl.disable( gl.DEPTH_TEST );
					}

					LEvent.trigger(Scene,"fillLightUniforms", renderpass_info );

					//ADD MACROS info			
					for(var im in material_uniforms)
						uniforms[im] = material_uniforms[im];
					var light_uniforms = mat.getLightShaderData(light, instance, node, scene, options);
					for(var im in light_uniforms)
						uniforms[im] = light_uniforms[im];

					//shader is an string: COMPILE
					if(render_shader.constructor == String) 
					{
						var macros = {};
						renderpass_info.macros = macros;

						//material & light macros
						if(material_uniforms.MACROS)
							for(var im in material_uniforms.MACROS)
								macros[im] = material_uniforms.MACROS[im];
						if(light_uniforms.MACROS)
							for(var im in light_uniforms.MACROS)
								macros[im] = light_uniforms.MACROS[im];

						//camera info
						if(this.active_camera.type == Camera.ORTHOGRAPHIC)
							macros.USE_ORTHOGRAPHIC_CAMERA = "";

						if(light_iterator == 0) macros.FIRST_PASS = "";
						if(light_iterator == (num_lights-1)) macros.LAST_PASS = "";

						if(node.flags.alpha_test == true)
							macros.USE_ALPHA_TEST = "0.5";

						if(clipping_plane)
							macros.USE_CLIPPING_PLANE = "";

						if(brightness_factor != 1)
							macros.USE_BRIGHTNESS_FACTOR = "";

						if(colorclip_factor > 0.0)
							macros.USE_COLORCLIP_FACTOR = "";

						//mesh information
						if(!("a_normal" in mesh.vertexBuffers))
							macros.NO_NORMALS = "";
						if(!("a_coord" in mesh.vertexBuffers))
							macros.NO_COORDS = "";
						if(("a_color" in mesh.vertexBuffers))
							macros.USE_COLOR_STREAM = "";
						if(("a_tangent" in mesh.vertexBuffers))
							macros.USE_TANGENT_STREAM = "";


						//if(mat.soft_particles && depth_texture) macros.USE_SOFT_PARTICLES = "";

						//macros.USE_POINTS = "";

						LEvent.trigger(Scene,"fillMacros", renderpass_info );

						shader = mat.getShader(render_shader, macros );
						//shader = Shaders.get(render_shader, macros );
					}
					else //const shader
					{
						shader = render_shader;
						renderpass_info.macros = null;
					}

					//render
					shader.uniforms(uniforms);

					if(mat.uniforms) //extra uniforms
						shader.uniforms(mat.uniforms);

					if(mat.depth_func)
						gl.depthFunc( gl[mat.depth_func] );

					//submesh rendering
					instance.render(shader);

					if(options.lights_disabled)
						break;

					if(shader.global && !shader.global.multipass)
						break; //avoid multipass in simple shaders
				}//multipass render

			} //global render


			LEvent.trigger(node, "afterRenderMeshes",options);
		}

		LEvent.trigger(Scene, "afterRenderPass",options);
		Scene.sendEventToNodes("afterRenderPass",options);

		//restore state
		gl.depthFunc(gl.LEQUAL);
		gl.depthMask(true);
		gl.disable(gl.BLEND);
		gl.frontFace(gl.CCW);

		//EVENT SCENE after_render
	},

	//Work in progress: not finished
	renderSceneMeshes: function(step, options)
	{
		var scene = this.current_scene || Scene;
		options = options || {};
		options.camera = this.active_camera;
		options.step = step;

		LEvent.trigger(Scene, "beforeRenderPass", options);
		Scene.sendEventToNodes("beforeRenderPass", options);

		gl.enable( gl.DEPTH_TEST );
		gl.depthFunc( gl.LESS );
		gl.disable( gl.BLEND );
		gl.lineWidth(1);

		//SORTING meshes
		this.updateVisibleMeshesNew(scene,options);
		var lights = this._visible_lights;

		//for each node
		for(var i in this._visible_meshes)
		{
			//render instances
			var instance = this._visible_meshes[i];
			//TODO: compute lights affecting this RI
			if(options.is_shadowmap)
				this.renderShadowPassInstance(step, instance, options );
			else
				this.renderMultiPassInstance(step, instance, lights, options );
		}

		LEvent.trigger(Scene, "afterRenderPass",options);
		Scene.sendEventToNodes("afterRenderPass",options);

		//restore state
		gl.depthFunc(gl.LEQUAL);
		gl.depthMask(true);
		gl.disable(gl.BLEND);
		gl.frontFace(gl.CCW);

		//EVENT SCENE after_render
	},

	renderMultiPassInstance: function(step, instance, lights, options)
	{
		//for every light
		//1. Generate the renderkey:  step|nodeuid|matuid|lightuid
		//2. Get shader, if it doesnt exist:
		//		a. Compute the shader
		//		b. Store shader with renderkey
		//3. Fill the shader with uniforms
		//4. Render instance
		var scene = Scene;
		var node = instance.node;
		var mat = instance.material;

		//compute matrices
		var model = instance.matrix;
		mat4.copy(this._object_model, model ); 
		mat4.multiply(this._mvp_matrix, this._viewprojection_matrix, this._object_model );
		mat4.copy(this._normal_model, model );
		mat4.setTranslation(this._normal_model,vec3.create()); //remove translation from normal matrix

		//global uniforms
		var uniforms = {
			u_camera_eye: this.active_camera.eye,
			u_camera_planes: [this.active_camera.near, this.active_camera.far],
			//u_viewprojection: this._viewprojection_matrix,
			u_time: Scene.current_time || new Date().getTime() * 0.001
		};

		//node matrix info
		uniforms.u_mvp = this._mvp_matrix;
		uniforms.u_model = this._object_model;
		uniforms.u_normal_model = this._normal_model;

		//FLAGS
		this.enableInstanceFlags(instance, node, options);

		//alpha blending flags
		if(mat.blending == Material.ADDITIVE_BLENDING)
		{
			gl.enable( gl.BLEND );
			gl.blendFunc( gl.SRC_ALPHA, gl.ONE );
		}
		else if(mat.alpha < 0.999 )
		{
			gl.enable( gl.BLEND );
			gl.blendFunc( gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA );
		}
		else
			gl.disable( gl.BLEND );


		//multi pass instance rendering
		var num_lights = lights.length;
		for(var iLight = 0; iLight < num_lights; iLight++)
		{
			var light = lights[iLight];

			//generate renderkey
			var renderkey = instance.generateKey(step, options);

			//compute the  shader
			var shader = null; //this._renderkeys[renderkey];
			if(!shader)
			{
				var shader_name = instance.material.shader || "globalshader";

				var macros = {};
				instance.material.getSurfaceShaderMacros(macros, step, shader_name, instance, node, scene, options);
				instance.material.getLightShaderMacros(macros, step, light, instance, shader_name, node, scene, options);
				instance.material.getSceneShaderMacros(macros, step, instance, node, scene, options);
				if(iLight == 0) macros.FIRST_PASS = "";
				if(iLight == (num_lights-1)) macros.LAST_PASS = "";
				shader = Shaders.get(shader_name, macros);
			}

			//fill shader data
			instance.material.fillSurfaceUniforms(shader, uniforms, instance, node, scene, options );
			instance.material.fillLightUniforms(shader, uniforms, light, instance, node, scene, options );

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

			//render
			shader.uniforms( uniforms );
			instance.render( shader );

			if(shader.global && !shader.global.multipass)
				break; //avoid multipass in simple shaders
		}
	},

	renderShadowPassInstance: function(step, instance, options)
	{
		var scene = Scene;
		var node = instance.node;
		var mat = instance.material;

		var model = instance.matrix;
		mat4.copy(this._object_model, model ); 
		//mat3.fromMat4(this._normal_model, model );
		mat4.copy(this._normal_model, model );
		mat4.setTranslation(this._normal_model,vec3.create());
		mat4.multiply(this._mvp_matrix, this._viewprojection_matrix, this._object_model );

		//global uniforms
		var uniforms = {};

		//node matrix info
		uniforms.u_mvp = this._mvp_matrix;
		uniforms.u_model = this._object_model;
		uniforms.u_normal_model = this._normal_model;

		//FLAGS
		this.enableInstanceFlags(instance, node, options);

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
			shader = Shaders.get("depth",macros);
			shader.uniforms({u_mvp: this._mvp_matrix, u_material_color: [0,0,0, mat.alpha], texture: 0, opacity_texture: 1, u_texture_matrix: [mat.uvs_matrix[0],0,mat.uvs_matrix[2], 0,mat.uvs_matrix[1],mat.uvs_matrix[3], 0,0,1] });
		}
		else
		{
			shader = Shaders.get("depth");
			shader.uniforms({u_mvp: this._mvp_matrix});
		}
		instance.render(shader);
	},

	enableInstanceFlags: function(instance, node, options)
	{
		if(instance.two_sided)
			gl.disable( gl.CULL_FACE );
		else
			gl.enable( gl.CULL_FACE );

		//  depth
		gl.depthFunc( gl.LEQUAL );
		if(node.flags.depth_test)
			gl.enable( gl.DEPTH_TEST );
		else
			gl.disable( gl.DEPTH_TEST );
		if(node.flags.depth_write)
			gl.depthMask(true);
		else
			gl.depthMask(false);

		//when to reverse the normals?
		if(node.flags.flip_normals)
			gl.frontFace(gl.CW);
		else
			gl.frontFace(gl.CCW);
	},

	//Work in progress, not finished
	updateVisibleMeshesOld: function(scene, options)
	{
		var nodes = scene.nodes;
		if (options.nodes)
			nodes = options.nodes;
		var camera = this.active_camera;
		var camera_eye = camera.getEye();

		var opaque_meshes = [];
		var alpha_meshes = [];
		for(var i in nodes)
		{
			var node = nodes[i];

			//check if the node is visible
			LEvent.trigger(node, "computeVisibility", {camera: this.active_camera, options: options});

			//update matrix
			//TODO...

			//search components with rendering instances
			if(!node._components) continue;
			for(var j in node._components)
			{
				var component = node._components[j];
				if( !component.getRenderInstance ) continue;
				var instance = component.getRenderInstance(options, this.active_camera);
				if(!instance) continue;

				//skip hidden objects
				if(node.flags.seen_by_camera == false && !options.is_shadowmap && !options.is_picking && !options.is_reflection)
					continue;
				if(node.flags.seen_by_picking == false && options.is_picking)
					continue;

				//default values when something is missing
				if(!instance.matrix) instance.matrix = node.transform.getGlobalMatrix();
				if(!instance.center) instance.center = mat4.multiplyVec3(vec3.create(), instance.matrix, vec3.create());
				if(instance.primitive == null) instance.primitive = gl.TRIANGLES;
				instance.two_sided = instance.two_sided || node.flags.two_sided;
				if(!instance.renderFunc) instance.renderFunc = Renderer.renderMeshInstance;
				instance.material = instance.material || node.material || this._default_material; //order
				if( instance.material.constructor === String) instance.material = scene.materials[instance.material];
				if(!instance.material) continue;

				//add extra info
				instance.node = node;
				instance.component = component;

				//change conditionaly
				if(options.force_wireframe) instance.primitive = gl.LINES;
				if(instance.primitive == gl.LINES && !instance.mesh.lines)
					instance.mesh.computeWireframe();

				//and finally, the alpha thing to determine if it is visible or not
				var mat = instance.material;
				if(mat.alpha >= 1.0 && mat.blending != Material.ADDITIVE_BLENDING)
					opaque_meshes.push(instance);
				else //if(!options.is_shadowmap)
					alpha_meshes.push(instance);

				instance._dist = vec3.dist( instance.center, camera_eye );
			}
		}

		//sort nodes in Z
		if(this.sort_nodes_in_z)
		{
			opaque_meshes.sort(function(a,b) { return a._dist < b._dist ? -1 : (a._dist > b._dist ? +1 : 0); });
			alpha_meshes.sort(function(a,b) { return a._dist < b._dist ? 1 : (a._dist > b._dist ? -1 : 0); });
			//opaque_meshes = opaque_meshes.sort( function(a,b){return vec3.dist( a.center, camera.eye ) - vec3.dist( b.center, camera.eye ); });
			//alpha_meshes = alpha_meshes.sort( function(b,a){return vec3.dist( a.center, camera.eye ) - vec3.dist( b.center, camera.eye ); }); //reverse sort
		}

		this._alpha_meshes = alpha_meshes;
		this._opaque_meshes = opaque_meshes;
		this._visible_meshes = opaque_meshes.concat(alpha_meshes);
	},

	//Generates the rendering instances that are visible
	updateVisibleMeshesNew: function(scene, options)
	{
		var nodes = scene.nodes;
		if (options.nodes)
			nodes = options.nodes;
		var camera = this.active_camera;
		var camera_eye = camera.getEye();

		var opaque_meshes = [];
		var alpha_meshes = [];
		for(var i in nodes)
		{
			var node = nodes[i];
			LEvent.trigger(node, "computeVisibility", {camera: this.active_camera, options: options});

			//update matrix
			//TODO...

			//hidden nodes
			if(!node.flags.visible || (options.is_rt && node.flags.seen_by_reflections == false)) //mat.alpha <= 0.0
				continue;
			if(node.flags.seen_by_camera == false && !options.is_shadowmap && !options.is_picking && !options.is_reflection)
				continue;
			if(node.flags.seen_by_picking == false && options.is_picking)
				continue;

			//render component renderinstances
			if(!node._components) continue;
			for(var j in node._components)
			{
				//extract renderable object from this component
				var component = node._components[j];
				if( !component.getRenderInstance ) continue;
				var instance = component.getRenderInstance(options, this.active_camera);
				if(!instance) continue;

				if(!instance.material)
					instance.material = this._default_material;

				//default
				if(!instance.center) mat4.multiplyVec3( instance.center, instance.matrix, vec3.create() );

				//add extra info
				instance.node = node;
				instance.component = component;

				//change conditionaly
				if(options.force_wireframe) instance.primitive = gl.LINES;
				if(instance.primitive == gl.LINES && !instance.mesh.lines)
					instance.mesh.computeWireframe();

				//and finally, the alpha thing to determine if it is visible or not
				var mat = instance.material;
				if(mat.alpha >= 1.0 && mat.blending != Material.ADDITIVE_BLENDING)
					opaque_meshes.push(instance);
				else //if(!options.is_shadowmap)
					alpha_meshes.push(instance);

				instance._dist = vec3.dist( instance.center, camera_eye );
			}
		}

		//sort nodes in Z
		if(this.sort_nodes_in_z)
		{
			opaque_meshes.sort(function(a,b) { return a._dist < b._dist ? -1 : (a._dist > b._dist ? +1 : 0); });
			alpha_meshes.sort(function(a,b) { return a._dist < b._dist ? 1 : (a._dist > b._dist ? -1 : 0); });
			//opaque_meshes = opaque_meshes.sort( function(a,b){return vec3.dist( a.center, camera.eye ) - vec3.dist( b.center, camera.eye ); });
			//alpha_meshes = alpha_meshes.sort( function(b,a){return vec3.dist( a.center, camera.eye ) - vec3.dist( b.center, camera.eye ); }); //reverse sort
		}

		this._alpha_meshes = alpha_meshes;
		this._opaque_meshes = opaque_meshes;
		this._visible_meshes = opaque_meshes.concat(alpha_meshes);
	},

	null_light: null,
	updateVisibleLights: function(scene, nodes)
	{
		this._visible_lights = [];
		if(scene.light && scene.light.enabled != false)
			this._visible_lights.push(scene.light);

		nodes = nodes || scene.nodes;

		for(var i = 0; i < nodes.length; ++i)
		{
			var node = nodes[i];
			if(!node.flags.visible) continue;
			for(var j in node._components)
				if (node._components[j].constructor === Light && node._components[j].enabled)
					this._visible_lights.push(node._components[j]);

			/*
			if(!node.light || node.light.enabled == false)
				continue;
			//TODO: test in frustrum
			this._visible_lights.push(node.light);
			*/
		}

		//if there is no lights it wont render anything, so create a dummy one
		if(this._visible_lights.length == 0)
		{
			if(!this.null_light)
			{
				this.null_light = new Light();
				this.null_light.color = [0,0,0];
			}
			this._visible_lights.push(this.null_light);
		}
	},

	//Renders the scene to an RT
	renderSceneMeshesToRT: function(cam, texture, options)
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
			gl.clearColor(Scene.background_color[0],Scene.background_color[1],Scene.background_color[2], Scene.background_color.length > 3 ? Scene.background_color[3] : 1.0);
			if(options.ignore_clear != true)
				gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
			//render scene
			Renderer.renderSceneMeshes("main",options);
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

					Renderer.renderSceneMeshes("shadow", { is_shadowmap:true });
				});
			}
		}
	},

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
				Renderer.renderSceneMeshes("rts",options);
			});
		}
	},

	//not in use yet
	renderPostFX: function(render_callback)
	{
		//prepare postfx
		if(!this._postfx_texture_a || this._postfx_texture_a.width != this.postfx_settings.width || this._postfx_texture_a.height != this.postfx_settings.height)
		{
			this._postfx_texture_a = new GL.Texture(postfx_settings.width,postfx_settings.height, {magFilter: gl.LINEAR, minFilter: gl.NEAREST});
			this._postfx_texture_b = new GL.Texture(postfx_settings.width,postfx_settings.height, {magFilter: gl.LINEAR, minFilter: gl.NEAREST});
		}

		//store the scene in texture A
		this._postfx_texture_a.drawTo(render_callback);
		for(var i in this.postfx)
		{
			var fx = this.postfx[i];
			var shader = null;
			if(typeof(fx) == "string")
			{
				shader = Shaders.get(fx);
				//apply FX to tex A and store the result in tex B
				this._postfx_texture_b.drawTo(function() {
					Renderer._postfx_texture_a.bind();
					shader.uniforms({color: [1,1,1,1], texSize:[Renderer._postfx_texture_a.width,Renderer._postfx_texture_a.height], time: new Date().getTime() * 0.001 }).draw(Renderer.viewport3d.screen_plane);
				});
			}
			else if(fx && fx.callback)
			{
				fx.callback(this._postfx_texture_a,this._postfx_texture_b);
			}
			//swap
			var tmp = this._postfx_texture_b;
			this._postfx_texture_b = this._postfx_texture_a;
			this._postfx_texture_a = tmp;
		}

		if(options.texture)
		{
			options.texture.drawTo(function() {
				Renderer._postfx_texture_a.bind();
				Shaders.get("screen").uniforms({color: [1,1,1,1]}).draw(Renderer.viewport3d.screen_plane);
			});
		}
		else
		{
			gl.viewport( scene.active_viewport[0], scene.active_viewport[1], scene.active_viewport[2], scene.active_viewport[3] );
			Renderer._postfx_texture_a.bind();
			Shaders.get("screen").uniforms({color: [1,1,1,1]}).draw(Renderer.viewport3d.screen_plane);
		}
	},

	cubemap_camera_parameters: [
		{dir: [1,0,0], up:[0,1,0]}, //positive X
		{dir: [-1,0,0], up:[0,1,0]}, //negative X
		{dir: [0,-1,0], up:[0,0,-1]}, //positive Y
		{dir: [0,1,0], up:[0,0,1]}, //negative Y
		{dir: [0,0,-1], up:[0,1,0]}, //positive Z
		{dir: [0,0,1], up:[0,1,0]} //negative Z
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
		texture.drawTo(function(side) {
			var cams = Renderer.cubemap_camera_parameters;
			if(step == "shadow")
				gl.clearColor(0,0,0,0);
			else
				gl.clearColor(Scene.background_color[0],Scene.background_color[1],Scene.background_color[2], Scene.background_color.length > 3 ? Scene.background_color[3] : 1.0);
			gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
			var cam = new Camera({ eye: eye, center: [ eye[0] + cams[side].dir[0], eye[1] + cams[side].dir[1], eye[2] + cams[side].dir[2]], up: cams[side].up, fov: 90, aspect: 1.0, near: near, far: far });
			Renderer.enableCamera(cam);
			Renderer.renderSceneMeshes(step,options);
		});

		return texture;
	},


	//picking
	pickingMap: null,
	_picking_color: null,
	picking_depth: 0,

	renderPickingBuffer: function(x,y)
	{
		var scene = this.current_scene || Scene;

		//trace("Starting Picking at : (" + x + "," + y + ")  T:" + new Date().getTime() );
		if(this.pickingMap == null || this.pickingMap.width != gl.canvas.width || this.pickingMap.height != gl.canvas.height )
			this.pickingMap = new GL.Texture( gl.canvas.width, gl.canvas.height, { format: gl.RGBA, magFilter: gl.NEAREST });

		y = gl.canvas.height - y; //reverse Y
		small_area = true;

		this.pickingMap.drawTo(function() {
			//trace(" START Rendering ");

			var viewport = scene.viewport || [0,0,gl.canvas.width, gl.canvas.height];
			scene.current_camera.aspect = viewport[2] / viewport[3];
			gl.viewport( viewport[0], viewport[1], viewport[2], viewport[3] );

			if(small_area)
			{
				gl.scissor(x-1,y-1,2,2);
				gl.enable(gl.SCISSOR_TEST);
			}

			gl.clearColor(0,0,0,0);
			gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

			Renderer.enableCamera(scene.current_camera);

			//gl.viewport(x-20,y-20,40,40);
			Renderer.renderSceneMeshes("picking",{is_picking:true});
			//gl.scissor(0,0,gl.canvas.width,gl.canvas.height);

			Renderer._picking_color = new Uint8Array(4);
			gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,Renderer._picking_color);

			if(small_area)
				gl.disable(gl.SCISSOR_TEST);
			//trace(" END Rendering: " + array2string(Scene.picking_color) );
		});

		if(!this._picking_color) this._picking_color = new Uint8Array(4); //debug
		return this._picking_color;
	},

	projectToCanvas: function(x,y,z)
	{

	},

	getNodeAtCanvasPosition: function(scene, x,y)
	{
		scene = scene || Scene;
		this.renderPickingBuffer(x,y);

		this._picking_color[3] = 0; //remove alpha
		var v1 = new Uint32Array(this._picking_color.buffer)[0];

		//find node
		var closer_node = null;
		for(var i in scene.nodes)
		{
			var node = scene.nodes[i];
			if(!node._picking_color)
				continue;

			if(v1 == node._picking_color)
			{
				closer_node = node;
				closer_dist = 0;
				break;
			}
		}

		var viewport = scene.viewport ? scene.viewport : [0,0,gl.canvas.width, gl.canvas.height ];
		//trace("Picking node: " + (closer_node ? closer_node.id : "null") + " Color: " + this._picking_color[0] + "," + this._picking_color[1] + "," + this._picking_color[2] + "," + this._picking_color[3]);
		return closer_node;
	}
};

//Add to global Scope
LS.Renderer = Renderer;