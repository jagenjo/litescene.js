
//************************************
/**
* The Renderer is in charge of generating one frame of the scene. Contains all the passes and intermediate functions to create the frame.
*
* @class Renderer
* @namespace LS
* @constructor
*/

var Renderer = {

	default_render_options: new RenderOptions(),
	default_material: new StandardMaterial(), //used for objects without material

	assigned_render_frame_containers: [],

	default_point_size: 5,

	_full_viewport: vec4.create(), //contains info about the full viewport available to render (depends if using FBOs)

	_current_scene: null,
	_current_render_options: null,
	_current_camera: null,
	_current_target: null, //texture where the image is being rendered

	_visible_cameras: null,
	_visible_lights: null,
	_visible_instances: null,

	//stats
	_rendercalls: 0,
	_rendered_instances: 0,

	//reusable locals
	_view_matrix: mat4.create(),
	_projection_matrix: mat4.create(),
	_viewprojection_matrix: mat4.create(),
	_2Dviewprojection_matrix: mat4.create(),
	_mvp_matrix: mat4.create(),
	_temp_matrix: mat4.create(),
	_identity_matrix: mat4.create(),

	//called from...
	init: function()
	{
		Draw.init();
		Draw.onRequestFrame = function() { Scene.refresh(); }
	},

	reset: function()
	{
	},

	/**
	* Overwrites the default rendering to screen function, allowing to render to one or several textures
	* The callback receives the camera, render_options and the output from the previous renderFrameCallback in case you want to chain them
	* Callback must return the texture output or null
	* Warning: this must be set before every frame, becaue this are cleared after rendering the frame
	* @method assignRenderFrameContainer
	* @param {RenderFrameContainer} callback function that will be called one one frame is needed, this function MUST call renderer.renderFrame( current_camera );
	*/
	assignRenderFrameContainer: function( render_frame_container )
	{
		this.assigned_render_frame_containers.push( render_frame_container );
	},

	/**
	* Renders the current scene to the screen
	*
	* @method render
	* @param {SceneTree} scene
	* @param {Camera} camera
	* @param {RenderOptions} render_options
	*/
	render: function(scene, main_camera, render_options)
	{
		render_options = render_options || this.default_render_options;
		render_options.current_renderer = this;
		this._current_render_options = render_options;
		this._current_scene = scene;
		this._main_camera = main_camera;

		//done at the beginning just in case it crashes
		scene._frame += 1;
		scene._must_redraw = false;

		render_options.main_camera = main_camera;
		this._rendercalls = 0;
		this._rendered_instances = 0;

		//events
		LEvent.trigger(scene, "beforeRender", render_options );
		scene.triggerInNodes("beforeRender", render_options );

		//get render instances, lights, materials and all rendering info ready: computeVisibility
		this.processVisibleData(scene, render_options);

		//shadowmaps are generated during processVisibleData but maybe some are missing
		LEvent.trigger(scene, "renderShadows", render_options );
		scene.triggerInNodes("renderShadows", render_options );

		//settings for cameras (if there is a main_camera asigned, render only that one
		var cameras = this._visible_cameras;
		if(main_camera) // && !render_options.render_all_cameras )
			cameras = [ main_camera ];
		render_options.main_camera = cameras[0];

		scene.triggerInNodes("afterVisibility", render_options );		

		//in case some realtime reflections are needed, this is the moment
		LEvent.trigger(scene, "renderReflections", render_options );
		scene.triggerInNodes("renderReflections", render_options );

		LEvent.trigger(scene, "beforeRenderMainPass", render_options );
		scene.triggerInNodes("beforeRenderMainPass", render_options );

		//for each camera
		for(var i in cameras)
		{
			var current_camera = cameras[i];
			LEvent.trigger(current_camera, "beforeRenderFrame", render_options );
			LEvent.trigger(scene, "beforeRenderFrame", render_options );

			//Render scene to screen, to texture, to Color&Depth texture ...
			Renderer._full_viewport.set([0,0,gl.canvas.width, gl.canvas.height]);
			gl.viewport(0,0,gl.canvas.width, gl.canvas.height);

			//use render frame callbacks chain (used for postFX or strange renderers)
			if(render_options.render_fx && this.assigned_render_frame_containers.length)
			{
				var containers = this.assigned_render_frame_containers;
				var output = null;
				for(var j = 0; j < containers.length; j++)
					output = containers[j].onRender( current_camera, render_options, output );
			}
			else
				this.renderFrame( current_camera ); //main render

			LEvent.trigger(current_camera, "afterRenderFrame", render_options );
			LEvent.trigger(scene, "afterRenderFrame", render_options );
		}

		//clear render frame callbacks
		this.assigned_render_frame_containers.length = 0; //clear


		//events
		LEvent.trigger(scene, "afterRender", render_options );
		scene.triggerInNodes("afterRender", render_options );
	},

	//intermediate function to swap order of parameters
	renderFrameToTexture: function( texture, camera )
	{
		this.renderFrame( camera, texture );
	},

	/**
	* renders the view from one camera to the current viewport (could be a texture)
	*
	* @method renderFrame
	* @param {Camera} the camera 
	* @param {Texture} output_texture optional, if you want to render to a texture (otherwise is rendered to the viewport)
	*/
	renderFrame: function ( camera, output_texture, skip_viewport )
	{
		var render_options = this._current_render_options;
		var scene = this._current_scene;

		//get info about the viewport from the output texture
		if(output_texture)
			Renderer._full_viewport.set([0,0,output_texture.width, output_texture.height]);

		this.enableCamera( camera, render_options, skip_viewport ); //set as active camera and set viewport

		//scissors test for the gl.clear, otherwise the clear affects the full viewport
		gl.scissor( gl.viewport_data[0], gl.viewport_data[1], gl.viewport_data[2], gl.viewport_data[3] );
		gl.enable(gl.SCISSOR_TEST);

		//clear (only necessary if working with textures but...)
		gl.clearColor(scene.background_color[0],scene.background_color[1],scene.background_color[2], scene.background_color.length > 3 ? scene.background_color[3] : 0.0);
		if(render_options.ignore_clear != true && (camera.clear_color || camera.clear_depth) )
			gl.clear( ( camera.clear_color ? gl.COLOR_BUFFER_BIT : 0) | (camera.clear_depth ? gl.DEPTH_BUFFER_BIT : 0) );

		gl.disable(gl.SCISSOR_TEST);

		//render scene
		render_options.current_pass = "color";

		LEvent.trigger(scene, "beforeRenderScene", camera);
		scene.triggerInNodes("beforeRenderScene", camera);

		//here we render all the instances
		Renderer.renderInstances(render_options);

		LEvent.trigger(scene, "afterRenderScene", camera);
		scene.triggerInNodes("afterRenderScene", camera);
	},

	/**
	* Set camera as the main scene camera
	*
	* @method enableCamera
	* @param {Camera} camera
	* @param {RenderOptions} render_options
	*/
	enableCamera: function(camera, render_options, skip_viewport)
	{
		LEvent.trigger(camera, "cameraEnabled", render_options);

		//camera.setActive();
		var width = Renderer._full_viewport[2];
		var height = Renderer._full_viewport[3];
		var final_width = width * camera._viewport[2];
		var final_height = height * camera._viewport[3];

		if(!skip_viewport)
		{
			if(render_options && render_options.ignore_viewports)
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

		//2D Camera: TODO: MOVE THIS SOMEWHERE ELSE
		mat4.ortho( this._2Dviewprojection_matrix, -1, 1, -1, 1, 1, -1 );

		//set as the current camera
		this._current_camera = camera;
		if(render_options)
			render_options.current_camera = camera;

		//Draw allows to render debug info easily
		Draw.reset(); //clear 
		Draw.setCameraPosition( camera.getEye() );
		Draw.setViewProjectionMatrix( this._view_matrix, this._projection_matrix, this._viewprojection_matrix );
	},

	
	renderInstances: function(render_options)
	{
		var scene = this._current_scene;
		if(!scene)
			return console.warn("Renderer.renderInstances: no scene found");

		var frustum_planes = geo.extractPlanes( this._viewprojection_matrix, this.frustum_planes );
		this.frustum_planes = frustum_planes;
		var apply_frustum_culling = render_options.frustum_culling;

		LEvent.trigger(scene, "beforeRenderInstances", render_options);
		scene.triggerInNodes("beforeRenderInstances", render_options);

		//compute global scene info
		this.fillSceneShaderMacros( scene, render_options );
		this.fillSceneShaderUniforms( scene, render_options );

		//render background: maybe this should be moved to a component
		if(!render_options.is_shadowmap && !render_options.is_picking && scene.textures["background"])
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
		this.resetGLState();

		//this.updateVisibleInstances(scene,options);
		var lights = this._visible_lights;
		var render_instances = this._visible_instances;

		LEvent.trigger(scene, "renderInstances", render_options);

		//reset again!
		this.resetGLState();

		//compute visibility pass
		for(var i in render_instances)
		{
			//render instance
			var instance = render_instances[i];
			var node_flags = instance.node.flags;
			instance._in_camera = false;

			//hidden nodes
			if(render_options.is_rt && node_flags.seen_by_reflections == false)
				continue;
			if(render_options.is_shadowmap && !(instance.flags & RI_CAST_SHADOWS))
				continue;
			if(node_flags.seen_by_camera == false && !render_options.is_shadowmap && !render_options.is_picking && !render_options.is_reflection)
				continue;
			if(node_flags.seen_by_picking == false && render_options.is_picking)
				continue;
			if(node_flags.selectable == false && render_options.is_picking)
				continue;

			//done here because sometimes some nodes are moved in this action
			if(instance.onPreRender)
				if( instance.onPreRender(render_options) === false)
					continue;

			if(instance.material.opacity <= 0) //TODO: remove this, do it somewhere else
				continue;

			//test visibility against camera frustum
			if(apply_frustum_culling && !(instance.flags & RI_IGNORE_FRUSTUM))
			{
				if(geo.frustumTestBox( frustum_planes, instance.aabb ) == CLIP_OUTSIDE)
					continue;
			}

			//save visibility info
			instance._in_camera = true;
		}

		var close_lights = [];

		//for each render instance
		for(var i in render_instances)
		{
			//render instance
			var instance = render_instances[i];

			if(!instance._in_camera)
				continue;

			if(instance.flags & RI_RENDER_2D)
			{
				this.render2DInstance(instance, scene, render_options );
				if(instance.onPostRender)
					instance.onPostRender(render_options);
				continue;
			}

			this._rendered_instances += 1;

			//choose the appropiate render pass
			if(render_options.is_shadowmap)
				this.renderShadowPassInstance( instance, render_options );
			else if(render_options.is_picking)
				this.renderPickingInstance( instance, render_options );
			else
			{
				//Compute lights affecting this RI (by proximity, only takes into account 
				close_lights.length = 0;
				for(var l = 0; l < lights.length; l++)
				{
					var light = lights[l];
					var light_intensity = light.computeLightIntensity();
					if(light_intensity < 0.0001)
						continue;
					var light_radius = light.computeLightRadius();
					var light_pos = light.position;
					if( light_radius == -1 || instance.overlapsSphere( light_pos, light_radius ) )
						close_lights.push(light);
				}
				//else //use all the lights
				//	close_lights = lights;

				//render multipass
				this.renderColorPassInstance( instance, close_lights, scene, render_options );
			}

			if(instance.onPostRender)
				instance.onPostRender(render_options);
		}

		LEvent.trigger(scene, "renderScreenSpace", render_options);

		//foreground object
		if(!render_options.is_shadowmap && !render_options.is_picking && scene.textures["foreground"])
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

		//restore state
		this.resetGLState();

		LEvent.trigger(scene, "afterRenderInstances", render_options);
		scene.triggerInNodes("afterRenderInstances", render_options);

		//and finally again
		this.resetGLState();
	},

	//to set gl state in a known and constant state in every render
	resetGLState: function()
	{
		gl.enable( gl.CULL_FACE );
		gl.enable( gl.DEPTH_TEST );
		gl.disable( gl.BLEND );
		gl.depthFunc( gl.LESS );
		gl.depthMask(true);
		gl.frontFace(gl.CCW);
		gl.blendFunc( gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA );
		gl.lineWidth(1);
	},

	bindSamplers: function(samplers, shader)
	{
		var sampler_uniforms = {};
		var slot = 0;
		for(var i in samplers)
		{
			var sampler = samplers[i];
			if(!sampler) //weird case
				throw("Samplers should always be valid values"); //assert

			//if(shader && !shader[i]) continue; ¿?

			//REFACTOR THIS
			var tex = null;
			if(sampler.constructor === String || sampler.constructor === Texture) //old way
				tex = sampler;
			else if(sampler.texture)
				tex = sampler.texture;
			else
				continue;

			if(tex.constructor === String)
				tex = ResourcesManager.textures[ tex ];
			if(!tex)
				continue;

			//bind
			sampler_uniforms[ i ] = tex.bind( slot++ );

			//texture properties
			if(sampler.minFilter)
				gl.texParameteri(tex.texture_type, gl.TEXTURE_MIN_FILTER, sampler.minFilter);
			if(sampler.magFilter)
				gl.texParameteri(tex.texture_type, gl.TEXTURE_MAG_FILTER, sampler.magFilter);
			if(sampler.wrap)
			{
				gl.texParameteri(tex.texture_type, gl.TEXTURE_WRAP_S, sampler.wrap);
				gl.texParameteri(tex.texture_type, gl.TEXTURE_WRAP_T, sampler.wrap);
			}
		}

		return sampler_uniforms;
	},

	//possible optimizations: bind the mesh once, bind the surface textures once
	renderColorPassInstance: function(instance, lights, scene, render_options)
	{

		var node = instance.node;
		var material = instance.material;

		//compute matrices
		var model = instance.matrix;
		if(instance.flags & RI_IGNORE_VIEWPROJECTION)
			this._mvp_matrix.set( model );
		else
			mat4.multiply(this._mvp_matrix, this._viewprojection_matrix, model );

		//node matrix info
		var instance_final_macros = instance._final_macros;
		var instance_final_uniforms = instance._final_uniforms;
		var instance_final_samplers = instance._final_samplers;

		//maybe this two should be somewhere else
		instance_final_uniforms.u_model = model; 
		instance_final_uniforms.u_normal_model = instance.normal_matrix; 

		//update matrices (because they depend on the camera) 
		instance_final_uniforms.u_mvp = this._mvp_matrix;


		//FLAGS: enable GL flags like cull_face, CCW, etc
		this.enableInstanceFlags(instance, render_options);

		//set blend flags
		if(material.blend_mode != Blend.NORMAL)
		{
			gl.enable( gl.BLEND );
			gl.blendFunc( instance.blend_func[0], instance.blend_func[1] );
		}
		else
			gl.disable( gl.BLEND );

		//pack material samplers 
		var samplers = {};
		samplers.merge( scene._samplers );
		samplers.merge( instance_final_samplers );

		//enable samplers and store where [TODO: maybe they are not used..., improve here]
		var sampler_uniforms = this.bindSamplers( samplers );

		//find shader name
		var shader_name = render_options.default_shader_id;
		if(render_options.low_quality)
			shader_name = render_options.default_low_shader_id;
		if( material.shader_name )
			shader_name = material.shader_name;

		//multi pass instance rendering
		var num_lights = lights.length;

		//no lights rendering (flat light)
		var ignore_lights = node.flags.ignore_lights || (instance.flags & RI_IGNORE_LIGHTS) || render_options.lights_disabled;
		if(!num_lights || ignore_lights)
		{
			var macros = { FIRST_PASS:"", USE_AMBIENT_ONLY:"" };
			macros.merge(scene._macros);
			macros.merge(instance_final_macros); //contains node, material and instance macros

			if( ignore_lights )
				macros.USE_IGNORE_LIGHT = "";
			if(render_options.clipping_plane && !(instance.flags & RI_IGNORE_CLIPPING_PLANE) )
				macros.USE_CLIPPING_PLANE = "";

			if( material.onModifyMacros )
				material.onModifyMacros( macros );

			var shader = ShadersManager.get(shader_name, macros);

			//assign uniforms
			shader.uniforms( sampler_uniforms );
			shader.uniforms( scene._uniforms );
			shader.uniforms( instance_final_uniforms );

			//render
			instance.render( shader );
			this._rendercalls += 1;
			return;
		}

		//Regular rendering (multipass)
		for(var iLight = 0; iLight < num_lights; iLight++)
		{
			var light = lights[iLight];

			//compute the  shader
			var shader = null;
			if(!shader)
			{
				var light_macros = light.getMacros( instance, render_options );

				var macros = {}; //wipeObject(macros);

				if(iLight == 0) macros.FIRST_PASS = "";
				if(iLight == (num_lights-1)) macros.LAST_PASS = "";

				macros.merge(scene._macros);
				macros.merge(instance_final_macros); //contains node, material and instance macros
				macros.merge(light_macros);

				if(render_options.clipping_plane && !(instance.flags & RI_IGNORE_CLIPPING_PLANE) )
					macros.USE_CLIPPING_PLANE = "";

				if( material.onModifyMacros )
					material.onModifyMacros( macros );

				shader = ShadersManager.get(shader_name, macros);
			}

			//fill shader data
			var light_uniforms = light.getUniforms( instance, render_options );

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
			//set depth func
			if(material.depth_func)
				gl.depthFunc( gl[material.depth_func] );

			//assign uniforms
			shader.uniforms( sampler_uniforms ); //where is every texture binded
			shader.uniforms( scene._uniforms );  //used mostly for environment textures
			shader.uniforms( instance_final_uniforms ); //contains node, material and instance uniforms
			shader.uniforms( light_uniforms ); //should this go before instance_final? to prioritize

			//render the instance
			instance.render( shader );
			this._rendercalls += 1;

			//avoid multipass in simple shaders
			if(shader.global && !shader.global.multipass)
				break; 
		}
	},

	renderShadowPassInstance: function(instance, render_options)
	{
		var scene = this._current_scene;
		var node = instance.node;
		var material = instance.material;

		//compute matrices
		var model = instance.matrix;
		mat4.multiply(this._mvp_matrix, this._viewprojection_matrix, model );

		//node matrix info
		var instance_final_macros = instance._final_macros;
		var instance_final_uniforms = instance._final_uniforms;
		var instance_final_samplers = instance._final_samplers;

		//maybe this two should be somewhere else
		instance_final_uniforms.u_model = model; 
		instance_final_uniforms.u_normal_model = instance.normal_matrix; 

		//update matrices (because they depend on the camera) 
		instance_final_uniforms.u_mvp = this._mvp_matrix;

		//FLAGS
		this.enableInstanceFlags(instance, render_options);

		var macros = {};
		macros.merge( scene._macros );
		macros.merge( instance_final_macros );

		if(this._current_target && this._current_target.texture_type == gl.TEXTURE_CUBE_MAP)
			macros["USE_LINEAR_DISTANCE"] = "";

		/*
		if(node.flags.alpha_shadows == true )
		{
			macros["USE_ALPHA_TEST"] = "0.5";
			var color = material.getTexture("color");
			if(color)
			{
				var color_uvs = material.textures["color_uvs"] || Material.DEFAULT_UVS["color"] || "0";
				macros.USE_COLOR_TEXTURE = "uvs_" + color_uvs;
				color.bind(0);
			}

			var opacity = material.getTexture("opacity");
			if(opacity)	{
				var opacity_uvs = material.textures["opacity_uvs"] || Material.DEFAULT_UVS["opacity"] || "0";
				macros.USE_OPACITY_TEXTURE = "uvs_" + opacity_uvs;
				opacity.bind(1);
			}

			shader = ShadersManager.get("depth", macros);
			shader.uniforms({ texture: 0, opacity_texture: 1 });
		}
		else
		{
			shader = ShadersManager.get("depth", macros );
		}
		*/

		if(node.flags.alpha_shadows == true )
			macros["USE_ALPHA_TEST"] = "0.5";

		var shader = ShadersManager.get("depth", macros );

		var samplers = {};
		samplers.merge( scene._samplers );
		samplers.merge( instance_final_samplers );
		var sampler_uniforms = this.bindSamplers( samplers, shader );
		/*
		var slot = 1;
		for(var i in samplers)
			if(shader.samplers[i]) //only enable a texture if the shader uses it
				sampler_uniforms[ i ] = samplers[i].bind( slot++ );
		*/

		shader.uniforms( sampler_uniforms );
		shader.uniforms( scene._uniforms );
		shader.uniforms( instance._final_uniforms );

		instance.render(shader);
		this._rendercalls += 1;
	},

	//renders using an orthographic projection
	render2DInstance:  function(instance, scene, options)
	{
		var node = instance.node;
		var material = instance.material;

		//compute matrices
		var model = this._temp_matrix;
		mat4.identity(model);

		//project from 3D to 2D
		var pos = vec3.create();

		if(instance.pos2D)
			pos.set(instance.pos2D);
		else
		{
			mat4.projectVec3( pos, this._viewprojection_matrix, instance.center );
			if(pos[2] < 0) return;
			pos[2] = 0;
		}

		mat4.translate( model, model, pos );
		var aspect = gl.canvas.width / gl.canvas.height;
		var scale = vec3.fromValues(1, aspect ,1);
		if(instance.scale_2D)
		{
			scale[0] *= instance.scale_2D[0];
			scale[1] *= instance.scale_2D[1];
		}
		mat4.scale( model, model, scale );
		mat4.multiply(this._mvp_matrix, this._2Dviewprojection_matrix, model );

		var node_uniforms = node._uniforms;
		node_uniforms.u_mvp = this._mvp_matrix;
		node_uniforms.u_model = model;
		node_uniforms.u_normal_model = this._identity_matrix;

		//FLAGS
		this.enableInstanceFlags(instance, options);

		//blend flags
		if(material.blend_mode != Blend.NORMAL)
		{
			gl.enable( gl.BLEND );
			gl.blendFunc( instance.blend_func[0], instance.blend_func[1] );
		}
		else
		{
			gl.enable( gl.BLEND );
			gl.blendFunc( gl.SRC_ALPHA, gl.ONE );
		}

		//assign material samplers (maybe they are not used...)
		/*
		var slot = 0;
		for(var i in material._samplers )
			material._uniforms[ i ] = material._samplers[i].bind( slot++ );
		*/

		var shader_name = "flat_texture";
		var shader = ShadersManager.get(shader_name);

		var samplers = {};
		samplers.merge( scene._samplers );
		samplers.merge( instance._final_samplers );
		var sampler_uniforms = this.bindSamplers( samplers, shader );

		//assign uniforms
		shader.uniforms( sampler_uniforms );
		shader.uniforms( node_uniforms );
		shader.uniforms( material._uniforms );
		shader.uniforms( instance.uniforms );

		//render
		instance.render( shader );
		this._rendercalls += 1;
		return;
	},	

	renderPickingInstance: function(instance, render_options)
	{
		var scene = this._current_scene;
		var node = instance.node;
		var model = instance.matrix;
		mat4.multiply(this._mvp_matrix, this._viewprojection_matrix, model );
		var pick_color = this.getNextPickingColor( node );
		/*
		this._picking_next_color_id += 10;
		var pick_color = new Uint32Array(1); //store four bytes number
		pick_color[0] = this._picking_next_color_id; //with the picking color for this object
		var byte_pick_color = new Uint8Array( pick_color.buffer ); //read is as bytes
		//byte_pick_color[3] = 255; //Set the alpha to 1
		this._picking_nodes[this._picking_next_color_id] = node;
		*/

		var macros = {};
		macros.merge(scene._macros);
		macros.merge(instance._final_macros);

		var shader = ShadersManager.get("flat", macros);
		shader.uniforms(scene._uniforms);
		shader.uniforms({u_model: model, u_pointSize: this.default_point_size, u_mvp: this._mvp_matrix, u_material_color: pick_color });

		//hardcoded, ugly
		/*
		if( macros["USE_SKINNING"] && instance.uniforms["u_bones"] )
			if( macros["USE_SKINNING_TEXTURE"] )
				shader.uniforms({ u_bones: });
		*/

		instance.render(shader);
	},

	//do not reuse the macros, they change between rendering passes (shadows, reflections, etc)
	fillSceneShaderMacros: function( scene, render_options )
	{
		var macros = {};

		if(render_options.current_camera.type == Camera.ORTHOGRAPHIC)
			macros.USE_ORTHOGRAPHIC_CAMERA = "";

		//camera info
		if(render_options == "color")
		{
			if(render_options.brightness_factor && render_options.brightness_factor != 1)
				macros.USE_BRIGHTNESS_FACTOR = "";

			if(render_options.colorclip_factor)
				macros.USE_COLORCLIP_FACTOR = "";
		}

		LEvent.trigger(scene, "fillSceneMacros", macros );

		scene._macros = macros;
	},

	//DO NOT CACHE, parameter can change between render passes
	fillSceneShaderUniforms: function( scene, render_options )
	{
		var camera = render_options.current_camera;

		//global uniforms
		var uniforms = {
			u_camera_eye: camera.getEye(),
			u_camera_front: camera.getFront(),
			u_pointSize: this.default_point_size,
			u_camera_planes: [camera.near, camera.far],
			u_camera_perspective: camera.type == Camera.PERSPECTIVE ? [camera.fov * DEG2RAD, 512 / Math.tan( camera.fov * DEG2RAD ) ] : [ camera._frustum_size, 512 / camera._frustum_size ],
			//u_viewprojection: this._viewprojection_matrix,
			u_time: scene._time || getTime() * 0.001,
			u_brightness_factor: render_options.brightness_factor != null ? render_options.brightness_factor : 1,
			u_colorclip_factor: render_options.colorclip_factor != null ? render_options.colorclip_factor : 0,
			u_ambient_light: scene.ambient_color,
			u_background_color: scene.background_color.subarray(0,3)
		};

		if(render_options.clipping_plane)
			uniforms.u_clipping_plane = render_options.clipping_plane;

		scene._uniforms = uniforms;
		scene._samplers = {};


		//if(scene.textures.environment)
		//	scene._samplers.push(["environment" + (scene.textures.environment.texture_type == gl.TEXTURE_2D ? "_texture" : "_cubemap") , scene.textures.environment]);

		for(var i in scene.textures)
		{
			var texture = LS.getTexture( scene.textures[i] );
			if(!texture) continue;
			if(i != "environment" && i != "irradiance") continue; //TO DO: improve this, I dont want all textures to be binded 
			var type = (texture.texture_type == gl.TEXTURE_2D ? "_texture" : "_cubemap");
			if(texture.texture_type == gl.TEXTURE_2D)
			{
				texture.bind(0);
				texture.setParameter( gl.TEXTURE_MIN_FILTER, gl.LINEAR ); //avoid artifact
			}
			scene._samplers[i + type] = texture;
			scene._macros[ "USE_" + (i + type).toUpperCase() ] = "uvs_polar_reflected";
		}

		LEvent.trigger(scene, "fillSceneUniforms", scene._uniforms );
	},	

	//you tell what info you want to retrieve associated with this color
	getNextPickingColor: function(info)
	{
		this._picking_next_color_id += 10;
		var pick_color = new Uint32Array(1); //store four bytes number
		pick_color[0] = this._picking_next_color_id; //with the picking color for this object
		var byte_pick_color = new Uint8Array( pick_color.buffer ); //read is as bytes
		//byte_pick_color[3] = 255; //Set the alpha to 1

		this._picking_nodes[ this._picking_next_color_id ] = info;
		return new Float32Array([byte_pick_color[0] / 255,byte_pick_color[1] / 255,byte_pick_color[2] / 255, 1]);
	},

	enableInstanceFlags: function(instance, render_options)
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
		if(render_options.reverse_backfacing)
			order = order == gl.CW ? gl.CCW : gl.CW;
		gl.frontFace(order);
	},

	//collects and process the rendering instances, cameras and lights that are visible
	//its like a prepass shared among all rendering passes
	processVisibleData: function(scene, render_options)
	{
		//options = options || {};
		//options.scene = scene;

		//update containers in scene
		scene.collectData();

		if(!render_options.main_camera)
		{
			if( scene._cameras.length )
				render_options.main_camera = scene._cameras[0];
			else
				render_options.main_camera = new Camera();
		}

		var opaque_instances = [];
		var blend_instances = [];
		var materials = {}; //I dont want repeated materials here

		var instances = scene._instances;
		var camera = render_options.main_camera; // || scene.getCamera();
		var camera_eye = camera.getEye();

		//process render instances (add stuff if needed)
		for(var i in instances)
		{
			var instance = instances[i];
			if(!instance) continue;
			var node_flags = instance.node.flags;

			//materials
			if(!instance.material)
				instance.material = this.default_material;
			materials[instance.material._uid] = instance.material;

			//add extra info
			instance._dist = vec3.dist( instance.center, camera_eye );

			//change conditionaly
			if(render_options.force_wireframe && instance.primitive != gl.LINES ) 
			{
				instance.primitive = gl.LINES;
				if(instance.mesh)
				{
					if(!instance.mesh.indexBuffers["wireframe"])
						instance.mesh.computeWireframe();
					instance.index_buffer = instance.mesh.indexBuffers["wireframe"];
				}
			}

			//and finally, the alpha thing to determine if it is visible or not
			if(instance.flags & RI_BLEND)
				blend_instances.push(instance);
			else
				opaque_instances.push(instance);

			//node & mesh constant information
			var macros = instance.macros;
			if(instance.flags & RI_ALPHA_TEST)
				macros.USE_ALPHA_TEST = "0.5";
			else if(macros["USE_ALPHA_TEST"])
				delete macros["USE_ALPHA_TEST"];

			var buffers = instance.vertex_buffers;
			if(!("normals" in buffers))
				macros.NO_NORMALS = "";
			if(!("coords" in buffers))
				macros.NO_COORDS = "";
			if(("coords1" in buffers))
				macros.USE_COORDS1_STREAM = "";
			if(("colors" in buffers))
				macros.USE_COLOR_STREAM = "";
			if(("tangents" in buffers))
				macros.USE_TANGENT_STREAM = "";
		}

		//sort RIs in Z for alpha sorting
		if(render_options.sort_instances_by_distance)
		{
			opaque_instances.sort(this._sort_near_to_far_func);
			blend_instances.sort(this._sort_far_to_near_func);
		}

		var all_instances = opaque_instances.concat(blend_instances); //merge

		if(render_options.sort_instances_by_priority)
			all_instances.sort( this._sort_by_priority_func );


		//update materials info only if they are in use
		if(render_options.update_materials)
		{
			for(var i in materials)
			{
				var material = materials[i];
				if(!material._macros)
				{
					material._macros = {};
					material._uniforms = {};
					material._samplers = {};
				}
				material.fillSurfaceShaderMacros(scene); //update shader macros on this material
				material.fillSurfaceUniforms(scene); //update uniforms
			}
		}

		//pack all macros, uniforms, and samplers relative to this instance in single containers
		for(var i in instances)
		{
			var instance = instances[i];
			var node = instance.node;
			var material = instance.material;

			var macros = instance._final_macros;
			wipeObject(macros);
			macros.merge(node._macros);
			macros.merge(material._macros);
			macros.merge(instance.macros);

			var uniforms = instance._final_uniforms;
			wipeObject(uniforms);
			uniforms.merge( node._uniforms );
			uniforms.merge( material._uniforms );
			uniforms.merge( instance.uniforms );

			var samplers = instance._final_samplers;
			wipeObject(samplers);
			//samplers.merge( node._samplers );
			samplers.merge( material._samplers );
			samplers.merge( instance.samplers );			
		}


		var lights = scene._lights;

		this._blend_instances = blend_instances;
		this._opaque_instances = opaque_instances;
		this._visible_instances = all_instances; //sorted version
		this._visible_lights = scene._lights; //sorted version
		this._visible_cameras = scene._cameras; //sorted version
		this._visible_materials = materials;

		//prepare lights (collect data and generate shadowmaps)
		for(var i in lights)
			lights[i].prepare(render_options);
	},

	_sort_far_to_near_func: function(a,b) { return b._dist - a._dist; },
	_sort_near_to_far_func: function(a,b) { return a._dist - b._dist; },
	_sort_by_priority_func: function(a,b) { return b.priority - a.priority; },

	//Renders the scene to an RT
	renderInstancesToRT: function(cam, texture, render_options)
	{
		render_options = render_options || this.default_render_options;
		this._current_target = texture;

		if(texture.texture_type == gl.TEXTURE_2D)
		{
			this.enableCamera(cam, render_options);
			texture.drawTo( inner_draw_2d );
		}
		else if( texture.texture_type == gl.TEXTURE_CUBE_MAP)
			this.renderToCubemap(cam.getEye(), texture.width, texture, render_options, cam.near, cam.far);
		this._current_target = null;

		function inner_draw_2d()
		{
			var scene = Renderer._current_scene;
			gl.clearColor(scene.background_color[0], scene.background_color[1], scene.background_color[2], scene.background_color.length > 3 ? scene.background_color[3] : 0.0);
			if(render_options.ignore_clear != true)
				gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
			//render scene
			Renderer.renderInstances(render_options);
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
				Renderer.renderInstances(options);
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

	//renders the current scene to a cubemap centered in the given position
	renderToCubemap: function(position, size, texture, render_options, near, far)
	{
		size = size || 256;
		near = near || 1;
		far = far || 1000;

		var eye = position;
		if( !texture || texture.constructor != Texture) texture = null;

		var scene = this._current_scene;

		texture = texture || new Texture(size,size,{texture_type: gl.TEXTURE_CUBE_MAP, minFilter: gl.NEAREST});
		this._current_target = texture;
		texture.drawTo( function(texture, side) {

			var cams = Camera.cubemap_camera_parameters;
			if(render_options.is_shadowmap)
				gl.clearColor(0,0,0,0);
			else
				gl.clearColor( scene.background_color[0], scene.background_color[1], scene.background_color[2], scene.background_color.length > 3 ? scene.background_color[3] : 1.0);

			gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
			var cubemap_cam = new Camera({ eye: eye, center: [ eye[0] + cams[side].dir[0], eye[1] + cams[side].dir[1], eye[2] + cams[side].dir[2]], up: cams[side].up, fov: 90, aspect: 1.0, near: near, far: far });

			Renderer.enableCamera( cubemap_cam, render_options, true );
			Renderer.renderInstances( render_options );
		});

		this._current_target = null;
		return texture;
	},


	//picking
	_pickingMap: null,
	_picking_color: new Uint8Array(4),
	_picking_depth: 0,
	_picking_next_color_id: 0,
	_picking_nodes: {},
	_picking_render_options: new RenderOptions({is_picking: true}),

	renderPickingBuffer: function(scene, camera, x,y)
	{
		if(this._pickingMap == null || this._pickingMap.width != gl.canvas.width || this._pickingMap.height != gl.canvas.height )
		{
			this._pickingMap = new GL.Texture( gl.canvas.width, gl.canvas.height, { format: gl.RGBA, filter: gl.NEAREST });
			ResourcesManager.textures[":picking"] = this._pickingMap;
		}

		y = gl.canvas.height - y; //reverse Y
		var small_area = true;
		this._picking_next_color_id = 0;

		this._current_target = this._pickingMap;
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

			Renderer.enableCamera(camera, Renderer._picking_render_options);

			//gl.viewport(x-20,y-20,40,40);
			Renderer._picking_render_options.current_pass = "picking";
			Renderer.renderInstances(Renderer._picking_render_options);
			//gl.scissor(0,0,gl.canvas.width,gl.canvas.height);

			LEvent.trigger(scene,"renderPicking", [x,y] );

			gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,Renderer._picking_color);

			if(small_area)
				gl.disable(gl.SCISSOR_TEST);
		});
		this._current_target = null;

		//if(!this._picking_color) this._picking_color = new Uint8Array(4); //debug
		//trace(" END Rendering: ", this._picking_color );
		return this._picking_color;
	},

	getNodeAtCanvasPosition: function(scene, camera, x,y)
	{
		var instance = this.getInstanceAtCanvasPosition(scene, camera, x,y);
		if(!instance)
			return null;

		if(instance.constructor == SceneNode)
			return instance;

		if(instance._root && instance._root.constructor == SceneNode)
			return instance._root;

		if(instance.node)
			return instance.node;

		return null;

		/*
		camera = camera || scene.getCamera();

		this._picking_nodes = {};

		//render all Render Instances
		this.renderPickingBuffer(scene, camera, x,y);

		this._picking_color[3] = 0; //remove alpha, because alpha is always 255
		var id = new Uint32Array(this._picking_color.buffer)[0]; //get only element

		var info = this._picking_nodes[id];
		this._picking_nodes = {};

		if(!info) return null;

		return info.node;
		*/
	},

	//used to get special info about the instance below the mouse
	getInstanceAtCanvasPosition: function(scene, camera, x,y)
	{
		camera = camera || scene.getCamera();

		this._picking_nodes = {};

		//render all Render Instances
		this.renderPickingBuffer(scene, camera, x,y);

		this._picking_color[3] = 0; //remove alpha, because alpha is always 255
		var id = new Uint32Array(this._picking_color.buffer)[0]; //get only element

		var instance_info = this._picking_nodes[id];
		this._picking_nodes = {};
		return instance_info;
	},	

	//similar to Physics.raycast but using only visible meshes
	raycast: function(scene, origin, direction, max_dist)
	{
		max_dist = max_dist || Number.MAX_VALUE;

		var instances = scene._instances;
		var collisions = [];

		var local_start = vec3.create();
		var local_direction = vec3.create();

		//for every instance
		for(var i = 0; i < instances.length; ++i)
		{
			var instance = instances[i];

			if(!(instance.flags & RI_RAYCAST_ENABLED))
				continue;

			if(instance.flags & RI_BLEND)
				continue; //avoid semitransparent

			//test against AABB
			var collision_point = vec3.create();
			if( !geo.testRayBBox( origin, direction, instance.aabb, null, collision_point, max_dist) )
				continue;

			var model = instance.matrix;

			//ray to local
			var inv = mat4.invert( mat4.create(), model );
			mat4.multiplyVec3( local_start, inv, origin );
			mat4.rotateVec3( local_direction, inv, direction );

			//test against OOBB (a little bit more expensive)
			if( !geo.testRayBBox(local_start, local_direction, instance.oobb, null, collision_point, max_dist) )
				continue;

			//test against mesh
			if( instance.collision_mesh )
			{
				var mesh = instance.collision_mesh;
				var octree = mesh.octree;
				if(!octree)
					octree = mesh.octree = new Octree( mesh );
				var hit = octree.testRay( local_start, local_direction, 0.0, max_dist );
				if(!hit)
					continue;
				mat4.multiplyVec3(collision_point, model, hit.pos);
			}
			else
				vec3.transformMat4(collision_point, collision_point, model);

			var distance = vec3.distance( origin, collision_point );
			if(distance < max_dist)
				collisions.push([instance, collision_point, distance]);
		}

		collisions.sort( function(a,b) { return a[2] - b[2]; } );
		return collisions;
	}
};

//Add to global Scope
LS.Renderer = Renderer;