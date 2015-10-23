
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

	global_aspect: 1, //used when rendering to a texture that doesnt have the same aspect as the screen

	default_point_size: 1, //point size in pixels (could be overwritte by render instances)

	_full_viewport: vec4.create(), //contains info about the full viewport available to render (current texture size or canvas size)

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
	_frame: 0,

	//settings
	_collect_frequency: 1, //used to reuse info (WIP)

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
		this._missing_texture = new GL.Texture(1,1, { pixel_data: [128,128,128,255] });
		Draw.init();
		Draw.onRequestFrame = function() { LS.GlobalScene.refresh(); }
	},

	reset: function()
	{
	},

	//used to store which is the current full viewport available (could be different from the canvas in case is a FBO or the camera has a partial viewport)
	setFullViewport: function(x,y,w,h)
	{
		this._full_viewport[0] = x; this._full_viewport[1] = y; this._full_viewport[2] = w; this._full_viewport[3] = h;
	},

	/**
	* Renders the current scene to the screen
	* Many steps are involved, from gathering info from the scene tree, generating shadowmaps, setup FBOs, render every camera
	*
	* @method render
	* @param {SceneTree} scene
	* @param {RenderOptions} render_options
	* @param {Array} [cameras=null] if no cameras are specified the cameras are taken from the scene
	*/
	render: function( scene, render_options, cameras )
	{
		if(!LS.ShadersManager.ready)
			return; //not ready

		render_options = render_options || this.default_render_options;
		render_options.current_renderer = this;
		render_options.current_scene = scene;
		this._current_render_options = render_options;
		this._current_scene = scene;

		this._main_camera = cameras ? cameras[0] : null;
		render_options.main_camera = this._main_camera;

		//done at the beginning just in case it crashes
		scene._frame += 1;
		this._frame += 1;
		scene._must_redraw = false;

		this._rendercalls = 0;
		this._rendered_instances = 0;
		gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
		this.setFullViewport(0, 0, gl.canvas.width, gl.canvas.height);

		//Event: beforeRender used in actions that could affect which info is collected for the rendering
		LEvent.trigger(scene, "beforeRender", render_options );
		scene.triggerInNodes("beforeRender", render_options );

		//get render instances, cameras, lights, materials and all rendering info ready: computeVisibility
		this.processVisibleData(scene, render_options);

		//Define the main camera, the camera that should be the most important (used for LOD info, or shadowmaps)
		cameras = cameras || this._visible_cameras;
		this._visible_cameras = cameras; //the cameras being rendered
		render_options.main_camera = cameras[0];

		//remove the lights that do not lay in front of any camera (this way we avoid creating shadowmaps)
		//TODO

		//Event: renderShadowmaps helps to generate shadowMaps that need some camera info (which could be not accessible during processVisibleData)
		LEvent.trigger(scene, "renderShadows", render_options );
		scene.triggerInNodes("renderShadows", render_options ); //TODO: remove

		//Event: afterVisibility allows to cull objects according to the main camera
		scene.triggerInNodes("afterVisibility", render_options ); //TODO: remove	

		//Event: renderReflections in case some realtime reflections are needed, this is the moment to render them inside textures
		LEvent.trigger(scene, "renderReflections", render_options );
		scene.triggerInNodes("renderReflections", render_options ); //TODO: remove

		//Event: beforeRenderMainPass in case a last step is missing
		LEvent.trigger(scene, "beforeRenderMainPass", render_options );
		scene.triggerInNodes("beforeRenderMainPass", render_options ); //TODO: remove

		//enable FX
		if(render_options.render_fx)
			LEvent.trigger( scene, "enableFrameBuffer", render_options );

		//render
		this.renderFrameCameras( cameras, render_options );

		//disable and show FX
		if(render_options.render_fx)
			LEvent.trigger( scene, "showFrameBuffer", render_options );

		//Event: afterRender to give closure to some actions
		LEvent.trigger(scene, "afterRender", render_options );
		scene.triggerInNodes("afterRender", render_options ); //TODO: remove
	},

	/**
	* Calls renderFrame of every camera in the cameras list (triggering the appropiate events)
	*
	* @method renderFrameCameras
	* @param {Array} cameras
	* @param {RenderOptions} render_options
	*/
	renderFrameCameras: function( cameras, render_options, global_render_frame )
	{
		var scene = this._current_scene;

		//for each camera
		for(var i = 0; i < cameras.length; ++i)
		{
			var current_camera = cameras[i];

			LEvent.trigger(scene, "beforeRenderFrame", render_options );
			LEvent.trigger(current_camera, "beforeRenderFrame", render_options );
			LEvent.trigger(current_camera, "enableFrameBuffer", render_options );

			//main render
			this.renderFrame( current_camera, render_options ); 

			LEvent.trigger(current_camera, "showFrameBuffer", render_options );
			LEvent.trigger(current_camera, "afterRenderFrame", render_options );
			LEvent.trigger(scene, "afterRenderFrame", render_options );
		}
	},

	/**
	* renders the view from one camera to the current viewport (could be a texture)
	*
	* @method renderFrame
	* @param {Camera} camera 
	* @param {Object} render_options
	*/
	renderFrame: function ( camera, render_options, scene )
	{
		if(scene) //in case we use another scene
			this.processVisibleData(scene, render_options);

		scene = scene || this._current_scene;

		this.enableCamera( camera, render_options, render_options.skip_viewport ); //set as active camera and set viewport

		//scissors test for the gl.clear, otherwise the clear affects the full viewport
		gl.scissor( gl.viewport_data[0], gl.viewport_data[1], gl.viewport_data[2], gl.viewport_data[3] );
		gl.enable(gl.SCISSOR_TEST);

		//clear buffer
		var info = scene.info;
		if(info)
			gl.clearColor( info.background_color[0],info.background_color[1],info.background_color[2], info.background_color[3] );
		else
			gl.clearColor(0,0,0,0);

		if(render_options.ignore_clear != true && (camera.clear_color || camera.clear_depth) )
			gl.clear( ( camera.clear_color ? gl.COLOR_BUFFER_BIT : 0) | (camera.clear_depth ? gl.DEPTH_BUFFER_BIT : 0) );

		gl.disable(gl.SCISSOR_TEST);

		//render scene
		render_options.current_pass = "color";

		LEvent.trigger(scene, "beforeRenderScene", camera );
		scene.triggerInNodes("beforeRenderScene", camera ); //TODO remove

		//here we render all the instances
		this.renderInstances(render_options);

		LEvent.trigger(scene, "afterRenderScene", camera );
		scene.triggerInNodes("afterRenderScene", camera ); //TODO remove
	},

	/**
	* Set camera as the current camera, sets the viewport according to camera info, updates matrices, and prepares LS.Draw
	*
	* @method enableCamera
	* @param {Camera} camera
	* @param {RenderOptions} render_options
	*/
	enableCamera: function(camera, render_options, skip_viewport)
	{
		var scene = this._current_scene;

		LEvent.trigger( camera, "beforeEnabled", render_options );
		LEvent.trigger( scene, "beforeCameraEnabled", camera );

		//assign viewport manually (shouldnt use camera.getLocalViewport to unify?)
		var startx = this._full_viewport[0];
		var starty = this._full_viewport[1];
		var width = this._full_viewport[2];
		var height = this._full_viewport[3];

		var final_x = Math.floor(width * camera._viewport[0] + startx);
		var final_y = Math.floor(height * camera._viewport[1] + starty);
		var final_width = Math.ceil(width * camera._viewport[2]);
		var final_height = Math.ceil(height * camera._viewport[3]);

		if(!skip_viewport)
		{
			//force fullscreen viewport?
			if(render_options && render_options.ignore_viewports )
			{
				camera._final_aspect = this.global_aspect * camera._aspect * (width / height);
				gl.viewport( this._full_viewport[0], this._full_viewport[1], this._full_viewport[2], this._full_viewport[3] );
			}
			else
			{
				camera._final_aspect = this.global_aspect * camera._aspect * (final_width / final_height); //what if we want to change the aspect?
				gl.viewport( final_x, final_y, final_width, final_height );
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

		//prepare camera
		camera.fillCameraShaderUniforms( scene );

		//Draw allows to render debug info easily
		Draw.reset(); //clear 
		Draw.setCameraPosition( camera.getEye() );
		Draw.setViewProjectionMatrix( this._view_matrix, this._projection_matrix, this._viewprojection_matrix );

		LEvent.trigger( camera, "afterEnabled", render_options );
		LEvent.trigger( scene, "afterCameraEnabled", camera ); //used to change stuff according to the current camera (reflection textures)
	},

	/**
	* Calls the render method for every instance (it also takes into account events and frustrum culling 
	*
	* @method renderInstances
	* @param {RenderOptions} render_options
	* @param {Array} instances array of RIs, if not specified the last visible_instances are rendered
	*/
	renderInstances: function( render_options, instances )
	{
		var scene = this._current_scene;
		if(!scene)
			return console.warn("Renderer.renderInstances: no scene found");

		var camera = this._current_camera;
		var frustum_planes = geo.extractPlanes( this._viewprojection_matrix, this.frustum_planes );
		this.frustum_planes = frustum_planes;
		var apply_frustum_culling = render_options.frustum_culling;
		var layers_filter = camera.layers;
		if( render_options.layers )
			layers_filter = render_options.layers;
		var is_color_render = !render_options.is_shadowmap && !render_options.is_picking;

		LEvent.trigger(scene, "beforeRenderInstances", render_options);
		scene.triggerInNodes("beforeRenderInstances", render_options);

		//compute global scene info
		this.fillSceneShaderQuery( scene, render_options );
		this.fillSceneShaderUniforms( scene, render_options );

		//render background: maybe this should be moved to a component
		if(is_color_render && scene.info.textures["background"])
		{
			var texture = scene.info.textures["background"];
			if(texture)
			{
				if( texture.constructor === String)
					texture = LS.ResourcesManager.textures[ scene.info.textures["background"] ];
				if( texture && texture.constructor === GL.Texture )
				{
					gl.disable( gl.BLEND );
					gl.disable( gl.DEPTH_TEST );
					texture.toViewport();
				}
			}
		}

		//reset state of everything!
		this.resetGLState();

		//this.updateVisibleInstances(scene,options);
		var lights = this._visible_lights;
		var numLights = lights.length;
		var render_instances = instances || this._visible_instances;

		LEvent.trigger( scene, "renderInstances", render_options );

		//reset again!
		this.resetGLState();

		//compute visibility pass
		for(var i = 0, l = render_instances.length; i < l; ++i)
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
			if(node_flags.seen_by_camera == false && is_color_render && !render_options.is_reflection)
				continue;
			if(node_flags.seen_by_picking == false && render_options.is_picking)
				continue;
			if(node_flags.selectable == false && render_options.is_picking)
				continue;
			if( (layers_filter & instance.layers) === 0 )
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
		for(var i = 0, l = render_instances.length; i < l; ++i)
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
				//Compute lights affecting this RI (by proximity, only takes into account spherical bounding)
				if( is_color_render )
				{
					close_lights.length = 0;
					for(var j = 0; j < numLights; j++)
					{
						var light = lights[j];
						if( (light._root.layers & instance.layers) == 0 || (light._root.layers & camera.layers) == 0)
							continue;
						var light_intensity = light.computeLightIntensity();
						if(light_intensity < 0.0001)
							continue;
						var light_radius = light.computeLightRadius();
						var light_pos = light.position;
						if( light_radius == -1 || instance.overlapsSphere( light_pos, light_radius ) )
							close_lights.push(light);
					}
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
		if(is_color_render && scene.info.textures["foreground"])
		{
			var texture = scene.info.textures["foreground"];
			if( texture )
			{
				if (texture.constructor === String )
					texture = LS.ResourcesManager.textures[ scene.info.textures["foreground"] ];

				if(texture && texture.constructor === GL.Texture )
				{
					gl.enable( gl.BLEND );
					gl.blendFunc( gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA );
					gl.disable( gl.DEPTH_TEST );
					texture.toViewport();
					gl.disable( gl.BLEND );
					gl.enable( gl.DEPTH_TEST );
				}
			}
		}

		//restore state
		this.resetGLState();

		LEvent.trigger(scene, "afterRenderInstances", render_options);
		scene.triggerInNodes("afterRenderInstances", render_options);

		//and finally again
		this.resetGLState();
	},

	/**
	* To set gl state to a known and constant state in every render pass
	*
	* @method resetGLState
	* @param {RenderOptions} render_options
	*/
	resetGLState: function()
	{
		gl.enable( gl.CULL_FACE );
		gl.enable( gl.DEPTH_TEST );
		gl.disable( gl.BLEND );
		gl.depthFunc( gl.LESS );
		gl.depthMask(true);
		gl.frontFace(gl.CCW);
		gl.blendFunc( gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA );
		//gl.lineWidth(1);
	},

	bindSamplers: function(samplers, shader)
	{
		var sampler_uniforms = {};
		var slot = 0;
		for(var i in samplers)
		{
			var sampler = samplers[i];
			if(!sampler) //weird case
			{
				throw("Samplers should always be valid values"); //assert
			}

			//if(shader && !shader[i]) continue; ¿?

			//REFACTOR THIS
			var tex = null;
			if(sampler.constructor === String || sampler.constructor === Texture) //old way
			{
				tex = sampler;
				sampler = null;
			}
			else if(sampler.texture)
				tex = sampler.texture;
			else
				continue;

			if(tex.constructor === String)
				tex = LS.ResourcesManager.textures[ tex ];
			if(!tex)
			{
				tex = this._missing_texture;
				//continue;
			}

			//bind
			sampler_uniforms[ i ] = tex.bind( slot++ );

			//texture properties
			if(sampler)
			{
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
		}

		return sampler_uniforms;
	},

	/**
	* Renders this render instance taking into account all the lights that affect it
	*
	* @method renderColorPassInstance
	* @param {RenderInstance} instance
	* @param {Array} lights array containing al the lights affecting this RI
	* @param {SceneTree} scene
	* @param {RenderOptions} render_options
	*/
	renderColorPassInstance: function(instance, lights, scene, render_options)
	{
		var camera = this._current_camera;
		var node = instance.node;
		var material = instance.material;

		//compute matrices
		var model = instance.matrix;
		if(instance.flags & RI_IGNORE_VIEWPROJECTION)
			this._mvp_matrix.set( model );
		else
			mat4.multiply(this._mvp_matrix, this._viewprojection_matrix, model );

		//node matrix info
		var instance_final_query = instance._final_query;
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
		if(material.blend_mode !== Blend.NORMAL)
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
			var query = new LS.ShaderQuery( shader_name, { FIRST_PASS:"", LAST_PASS:"", USE_AMBIENT_ONLY:"" });
			query.add( scene._query );
			query.add( instance_final_query ); //contains node, material and instance macros

			if( ignore_lights )
				query.setMacro( "USE_IGNORE_LIGHTS" );
			if(render_options.clipping_plane && !(instance.flags & RI_IGNORE_CLIPPING_PLANE) )
				query.setMacro( "USE_CLIPPING_PLANE" );

			if( material.onModifyQuery )
				material.onModifyQuery( query );

			//resolve the shader
			var shader = ShadersManager.resolve( query );

			//assign uniforms
			shader.uniformsArray( [ sampler_uniforms, scene._uniforms, camera._uniforms, instance_final_uniforms ] );

			//render
			instance.render( shader );
			this._rendercalls += 1;
			return;
		}

		//Regular rendering (multipass)
		for(var iLight = 0; iLight < num_lights; iLight++)
		{
			var light = lights[iLight];

			var query = new LS.ShaderQuery( shader_name );

			var light_query = light.getQuery( instance, render_options );

			if(iLight === 0)
				query.setMacro("FIRST_PASS");
			if(iLight === (num_lights-1))
				query.setMacro("LAST_PASS");

			query.add( scene._query );
			query.add( instance_final_query ); //contains node, material and instance macros
			query.add( light_query );

			if(render_options.clipping_plane && !(instance.flags & RI_IGNORE_CLIPPING_PLANE) )
				query.setMacro("USE_CLIPPING_PLANE");

			if( material.onModifyQuery )
				material.onModifyQuery( query );

			var shader = LS.ShadersManager.resolve( query );

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
			shader.uniformsArray( [sampler_uniforms, scene._uniforms, camera._uniforms, instance_final_uniforms, light_uniforms] );

			//render the instance
			instance.render( shader );
			this._rendercalls += 1;

			//avoid multipass in simple shaders
			if(shader.global && !shader.global.multipass)
				break; 
		}
	},

	/**
	* Renders this RenderInstance into the shadowmap
	*
	* @method renderShadowPassInstance
	* @param {RenderInstance} instance
	* @param {RenderOptions} render_options
	*/
	renderShadowPassInstance: function(instance, render_options)
	{
		var scene = this._current_scene;
		var camera = this._current_camera;
		var node = instance.node;
		var material = instance.material;

		//compute matrices
		var model = instance.matrix;
		mat4.multiply(this._mvp_matrix, this._viewprojection_matrix, model );

		//node matrix info
		var instance_final_query = instance._final_query;
		var instance_final_uniforms = instance._final_uniforms;
		var instance_final_samplers = instance._final_samplers;

		//maybe this two should be somewhere else
		instance_final_uniforms.u_model = model; 
		instance_final_uniforms.u_normal_model = instance.normal_matrix; 

		//update matrices (because they depend on the camera) 
		instance_final_uniforms.u_mvp = this._mvp_matrix;

		//FLAGS
		this.enableInstanceFlags( instance, render_options );

		var query = new ShaderQuery("depth");
		query.add( scene._query );
		query.add( instance_final_query );

		//if(this._current_target && this._current_target.texture_type === gl.TEXTURE_CUBE_MAP)
		//	query.setMacro("USE_LINEAR_SHADOWMAP");

		//not fully supported yet
		if(node.flags.alpha_shadows == true )
		{
			query.setMacro("USE_ALPHA_TEST","0.5");
			var color = material.getTexture("color");
			if(color)
			{
				var color_uvs = material.textures["color_uvs"] || Material.DEFAULT_UVS["color"] || "0";
				query.setMacro("USE_COLOR_TEXTURE","uvs_" + color_uvs);
				color.bind(0);
			}

			var opacity = material.getTexture("opacity");
			if(opacity)	{
				var opacity_uvs = material.textures["opacity_uvs"] || Material.DEFAULT_UVS["opacity"] || "0";
				query.setMacro("USE_OPACITY_TEXTURE","uvs_" + opacity_uvs);
				opacity.bind(1);
			}
			//shader.uniforms({ texture: 0, opacity_texture: 1 });
		}

		if(node.flags.alpha_shadows == true )
			query.setMacro("USE_ALPHA_TEST","0.5");

		var shader = ShadersManager.resolve( query );

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

		shader.uniformsArray([ sampler_uniforms, scene._uniforms, camera._uniforms, instance._final_uniforms ]);

		instance.render(shader);
		this._rendercalls += 1;
	},

	/**
	* Special case of render instance that uses a 2D projection (used for GUIS)
	* Will be refactored for a better system
	*
	* @method render2DInstance
	* @param {RenderInstance} instance
	* @param {SceneTree} scene
	* @param {RenderOptions} render_options
	*/
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
		var shader = ShadersManager.get( shader_name );

		var samplers = {};
		samplers.merge( scene._samplers );
		samplers.merge( instance._final_samplers );
		var sampler_uniforms = this.bindSamplers( samplers, shader );

		//assign uniforms
		shader.uniformsArray( [ sampler_uniforms, node_uniforms, material._uniforms, instance.uniforms ]);

		//render
		instance.render( shader );
		this._rendercalls += 1;
		return;
	},	

	/**
	* Render instance into the picking buffer
	*
	* @method renderPickingInstance
	* @param {RenderInstance} instance
	* @param {RenderOptions} render_options
	*/
	renderPickingInstance: function( instance, render_options )
	{
		var scene = this._current_scene;
		var camera = this._current_camera;
		var node = instance.node;
		var model = instance.matrix;
		mat4.multiply(this._mvp_matrix, this._viewprojection_matrix, model );
		var pick_color = LS.Picking.getNextPickingColor( node );
		/*
		this._picking_next_color_id += 10;
		var pick_color = new Uint32Array(1); //store four bytes number
		pick_color[0] = this._picking_next_color_id; //with the picking color for this object
		var byte_pick_color = new Uint8Array( pick_color.buffer ); //read is as bytes
		//byte_pick_color[3] = 255; //Set the alpha to 1
		this._picking_nodes[this._picking_next_color_id] = node;
		*/

		var query = new LS.ShaderQuery("flat");
		query.add( scene._query );
		query.add( instance._final_query );

		var shader = ShadersManager.resolve( query );
		shader.uniforms(scene._uniforms);
		shader.uniforms(camera._uniforms);
		shader.uniforms(instance.uniforms);
		shader.uniforms({u_model: model, u_mvp: this._mvp_matrix, u_material_color: pick_color });

		instance.render(shader);
	},

	/**
	* Update the scene shader query according to the render pass
	* Do not reuse the query, they change between rendering passes (shadows, reflections, etc)
	*
	* @method fillSceneShaderQuery
	* @param {SceneTree} scene
	* @param {RenderOptions} render_options
	*/
	fillSceneShaderQuery: function( scene, render_options )
	{
		var query = new ShaderQuery();

		if( render_options.current_camera.type == Camera.ORTHOGRAPHIC )
			query.setMacro("USE_ORTHOGRAPHIC_CAMERA");

		//camera info
		if(render_options == "color")
		{
			if(render_options.brightness_factor && render_options.brightness_factor != 1)
				query.setMacro("USE_BRIGHTNESS_FACTOR");

			if(render_options.colorclip_factor)
				query.setMacro("USE_COLORCLIP_FACTOR");
		}

		if(render_options.current_renderframe && render_options.current_renderframe.use_extra_texture)
			query.setMacro("USE_DRAW_BUFFERS");

		LEvent.trigger( scene, "fillSceneQuery", query );

		scene._query = query;
	},

	//Called at the beginning of renderInstances (once per renderFrame)
	//DO NOT CACHE, parameters can change between render passes
	fillSceneShaderUniforms: function( scene, render_options )
	{
		//global uniforms
		var uniforms = {
			u_point_size: this.default_point_size,
			u_time: scene._time || getTime() * 0.001,
			u_brightness_factor: render_options.brightness_factor != null ? render_options.brightness_factor : 1,
			u_colorclip_factor: render_options.colorclip_factor != null ? render_options.colorclip_factor : 0,
			u_ambient_light: scene.info.ambient_color,
			u_background_color: scene.info.background_color.subarray(0,3),
			u_viewport: gl.viewport_data
		};

		if(render_options.clipping_plane)
			uniforms.u_clipping_plane = render_options.clipping_plane;

		scene._uniforms = uniforms;
		scene._samplers = {};

		for(var i in scene.info.textures)
		{
			var texture = LS.getTexture( scene.info.textures[i] );
			if(!texture)
				continue;
			if(i != "environment" && i != "irradiance") continue; //TO DO: improve this, I dont want all textures to be binded 
			var type = (texture.texture_type == gl.TEXTURE_2D ? "_texture" : "_cubemap");
			if(texture.texture_type == gl.TEXTURE_2D)
			{
				texture.bind(0);
				texture.setParameter( gl.TEXTURE_MIN_FILTER, gl.LINEAR ); //avoid artifact
			}
			scene._samplers[i + type] = texture;
			scene._query.macros[ "USE_" + (i + type).toUpperCase() ] = "uvs_polar_reflected";
		}

		LEvent.trigger( scene, "fillSceneUniforms", scene._uniforms );
	},	

	/**
	* Switch flags according to the RenderInstance flags
	*
	* @method enableInstanceFlags
	* @param {RenderInstance} instance
	* @param {RenderOptions} render_options
	*/
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


	/**
	* Collects and process the rendering instances, cameras and lights that are visible
	* Its a prepass shared among all rendering passes
	*
	* @method processVisibleData
	* @param {SceneTree} scene
	* @param {RenderOptions} render_options
	*/
	processVisibleData: function(scene, render_options)
	{
		//options = options || {};
		//options.scene = scene;

		//update info about scene (collecting it all or reusing the one collected in the frame before)
		if( this._frame % this._collect_frequency == 0)
			scene.collectData();
		else
			scene.updateCollectedData();
		LEvent.trigger(scene, "afterCollectData", scene );

		//meh!
		if(!render_options.main_camera)
		{
			if( scene._cameras.length )
				render_options.main_camera = scene._cameras[0];
			else
				render_options.main_camera = new LS.Camera();
		}

		var opaque_instances = [];
		var blend_instances = [];
		var materials = {}; //I dont want repeated materials here

		var instances = scene._instances;
		var camera = render_options.main_camera; // || scene.getCamera();
		var camera_eye = camera.getEye();

		//process render instances (add stuff if needed)
		for(var i = 0, l = instances.length; i < l; ++i)
		{
			var instance = instances[i];
			if(!instance)
				continue;
			var node_flags = instance.node.flags;

			//materials
			if(!instance.material)
				instance.material = this.default_material;
			materials[ instance.material.uid ] = instance.material;

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
			var query = instance.query;
			if(instance.flags & RI_ALPHA_TEST)
				query.macros.USE_ALPHA_TEST = "0.5";
			else if(query.macros["USE_ALPHA_TEST"])
				delete query.macros["USE_ALPHA_TEST"];

			var buffers = instance.vertex_buffers;
			if(!("normals" in buffers))
				query.macros.NO_NORMALS = "";
			if(!("coords" in buffers))
				query.macros.NO_COORDS = "";
			if(("coords1" in buffers))
				query.macros.USE_COORDS1_STREAM = "";
			if(("colors" in buffers))
				query.macros.USE_COLOR_STREAM = "";
			if(("tangents" in buffers))
				query.macros.USE_TANGENT_STREAM = "";
		}

		//Sorting
		if(render_options.sort_instances_by_distance) //sort RIs in Z for alpha sorting
		{
			opaque_instances.sort(this._sort_near_to_far_func);
			blend_instances.sort(this._sort_far_to_near_func);
		}
		var all_instances = opaque_instances.concat(blend_instances); //merge
		if(render_options.sort_instances_by_priority) //sort by priority
			all_instances.sort( this._sort_by_priority_func );


		//update materials info only if they are in use
		if(render_options.update_materials)
			this._prepareMaterials( materials, scene );

		//pack all macros, uniforms, and samplers relative to this instance in single containers
		for(var i = 0, l = instances.length; i < l; ++i)
		{
			var instance = instances[i];
			var node = instance.node;
			var material = instance.material;

			var query = instance._final_query;
			query.clear();
			query.add( node._query );
			query.add( material._query );
			query.add( instance.query );

			var uniforms = instance._final_uniforms;
			wipeObject( uniforms );
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
		for(var i = 0, l = lights.length; i < l; ++i)
			lights[i].prepare( render_options );
	},

	//outside of processVisibleData to allow optimizations in processVisibleData
	_prepareMaterials: function( materials, scene )
	{
		for(var i in materials)
		{
			var material = materials[i];
			if(!material._uniforms)
			{
				material._uniforms = {};
				material._samplers = {};
			}
			material.fillShaderQuery(scene); //update shader macros on this material
			material.fillUniforms(scene); //update uniforms
		}
	},

	_sort_far_to_near_func: function(a,b) { return b._dist - a._dist; },
	_sort_near_to_far_func: function(a,b) { return a._dist - b._dist; },
	_sort_by_priority_func: function(a,b) { return b.priority - a.priority; },

	/**
	* Renders a frame into a texture (could be a cubemap, in which case does the six passes)
	*
	* @method renderInstancesToRT
	* @param {Camera} cam
	* @param {Texture} texture
	* @param {RenderOptions} render_options
	*/
	renderInstancesToRT: function(cam, texture, render_options)
	{
		render_options = render_options || this.default_render_options;
		this._current_target = texture;
		var scene = LS.Renderer._current_scene;

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
			gl.clearColor(scene.info.background_color[0], scene.info.background_color[1], scene.info.background_color[2], scene.info.background_color[3] );
			if(render_options.ignore_clear != true)
				gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
			//render scene
			LS.Renderer.renderInstances( render_options );
		}
	},

	/**
	* Renders the current scene to a cubemap centered in the given position
	*
	* @method renderToCubemap
	* @param {vec3} position center of the camera where to render the cubemap
	* @param {number} size texture size
	* @param {Texture} texture to reuse the same texture
	* @param {RenderOptions} render_options
	* @param {number} near
	* @param {number} far
	* @return {Texture} the resulting texture
	*/
	renderToCubemap: function(position, size, texture, render_options, near, far)
	{
		size = size || 256;
		near = near || 1;
		far = far || 1000;

		var eye = position;
		if( !texture || texture.constructor != Texture)
			texture = null;

		var scene = this._current_scene;

		texture = texture || new Texture(size,size,{texture_type: gl.TEXTURE_CUBE_MAP, minFilter: gl.NEAREST});
		this._current_target = texture;
		texture.drawTo( function(texture, side) {

			var cams = Camera.cubemap_camera_parameters;
			if(render_options.is_shadowmap || !scene.info )
				gl.clearColor(0,0,0,0);
			else
				gl.clearColor( scene.info.background_color[0], scene.info.background_color[1], scene.info.background_color[2], scene.info.background_color[3] );

			gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
			var cubemap_cam = new Camera({ eye: eye, center: [ eye[0] + cams[side].dir[0], eye[1] + cams[side].dir[1], eye[2] + cams[side].dir[2]], up: cams[side].up, fov: 90, aspect: 1.0, near: near, far: far });

			Renderer.enableCamera( cubemap_cam, render_options, true );
			Renderer.renderInstances( render_options );
		});

		this._current_target = null;
		return texture;
	},

	/**
	* Renders the material preview to an image
	*
	* @method renderMaterialPreview
	* @param {Material} material
	* @param {number} size image size
	* @param {Object} options could be environment_texture
	* @return {Image} the preview image (in canvas format)
	*/
	renderMaterialPreview: function( material, size, options )
	{
		options = options || {};

		var scene = this._material_scene;
		if(!scene)
		{
			scene = this._material_scene = new LS.SceneTree();
			scene.info.background_color.set([0,0,0,0]);
			if(options.environment_texture)
				scene.info.textures.environment = options.environment_texture;
			var node = new LS.SceneNode( "sphere" );
			var compo = new LS.Components.GeometricPrimitive( { size: 40, subdivisions: 50, geometry: LS.Components.GeometricPrimitive.SPHERE } );
			node.addComponent( compo );
			scene.root.addChild( node );
		}

		var node = scene.getNode( "sphere") ;
		node.material = material;

		var tex = new GL.Texture(size,size);
		tex.drawTo( function()
		{
			LS.Renderer.renderFrame( scene.root.camera, { skip_viewport: true }, scene );
		});

		var canvas = tex.toCanvas(null, true);
		//document.body.appendChild( canvas ); //debug
		return canvas;
	},

	/**
	* Returns the last camera that falls into a given screen position
	*
	* @method getCameraAtPosition
	* @param {number} x
	* @param {number} y
	* @param {SceneTree} scene if not specified last rendered scene will be used
	* @return {Camera} the camera
	*/
	getCameraAtPosition: function(x,y, cameras)
	{
		cameras = cameras || this._visible_cameras;
		if(!cameras || !cameras.length)
			return null;

		for(var i = cameras.length - 1; i >= 0; --i)
		{
			var camera = cameras[i];
			if(!camera.enabled || camera.render_to_texture)
				continue;

			if( camera.isPointInCamera(x,y) )
				return camera;
		}
		return null;
	}
};

//Add to global Scope
LS.Renderer = Renderer;
