///@INFO: BASE

//************************************
/**
* The Renderer is in charge of generating one frame of the scene. Contains all the passes and intermediate functions to create the frame.
*
* @class Renderer
* @namespace LS
* @constructor
*/

//passes
var COLOR_PASS = LS.COLOR_PASS = { name: "color", id: 1 };
var SHADOW_PASS = LS.SHADOW_PASS = { name: "shadow", id: 2 };
var PICKING_PASS = LS.PICKING_PASS = { name: "picking", id: 3 };

var Renderer = {

	default_render_settings: new LS.RenderSettings(), //overwritten by the global info or the editor one
	default_material: new LS.StandardMaterial(), //used for objects without material

	global_aspect: 1, //used when rendering to a texture that doesnt have the same aspect as the screen
	default_point_size: 1, //point size in pixels (could be overwritte by render instances)

	_global_viewport: vec4.create(), //the viewport we have available to render the full frame (including subviewports), usually is the 0,0,gl.canvas.width,gl.canvas.height
	_full_viewport: vec4.create(), //contains info about the full viewport available to render (current texture size or canvas size)

	//temporal info during rendering
	_current_scene: null,
	_current_render_settings: null,
	_current_camera: null,
	_current_target: null, //texture where the image is being rendered
	_current_pass: COLOR_PASS, //object containing info about the pass
	_global_textures: {}, //used to speed up fetching global textures
	_global_shader_blocks: [], //used to add extra shaderblocks to all objects in the scene (it gets reseted every frame)
	_global_shader_blocks_flags: 0, 

	_queues: [], //render queues in order

	_main_camera: null,

	_visible_cameras: null,
	_visible_lights: null,
	_visible_instances: null,
	_visible_materials: [],
	_near_lights: [],
	_active_samples: [],

	//stats
	_frame_cpu_time: 0,
	_rendercalls: 0, //calls to instance.render
	_rendered_instances: 0, //instances processed
	_rendered_passes: 0,
	_frame: 0,

	//settings
	_collect_frequency: 1, //used to reuse info (WIP)

	//reusable locals
	_view_matrix: mat4.create(),
	_projection_matrix: mat4.create(),
	_viewprojection_matrix: mat4.create(),
	_2Dviewprojection_matrix: mat4.create(),

	_temp_matrix: mat4.create(),
	_temp_cameye: vec3.create(),
	_identity_matrix: mat4.create(),
	_uniforms: {},
	_samplers: [],
	_instancing_data: [],

	//safety
	_is_rendering_frame: false,
	_ignore_reflection_probes: false,

	//debug
	allow_textures: true,
	_sphere_mesh: null,

	//fixed texture slots for global textures
	SHADOWMAP_TEXTURE_SLOT: 7,
	ENVIRONMENT_TEXTURE_SLOT: 6,
	IRRADIANCE_TEXTURE_SLOT: 5,
	LIGHTPROJECTOR_TEXTURE_SLOT: 4,
	LIGHTEXTRA_TEXTURE_SLOT: 3,

	//used in special cases
	BONES_TEXTURE_SLOT: 3,
	MORPHS_TEXTURE_SLOT: 2,
	MORPHS_TEXTURE2_SLOT: 1,

	//called from...
	init: function()
	{
		//create some useful textures: this is used in case a texture is missing
		this._black_texture = new GL.Texture(1,1, { pixel_data: [0,0,0,255] });
		this._gray_texture = new GL.Texture(1,1, { pixel_data: [128,128,128,255] });
		this._white_texture = new GL.Texture(1,1, { pixel_data: [255,255,255,255] });
		this._normal_texture = new GL.Texture(1,1, { pixel_data: [128,128,255,255] });
		this._missing_texture = this._gray_texture;
		var internal_textures = [ this._black_texture, this._gray_texture, this._white_texture, this._normal_texture, this._missing_texture ];
		internal_textures.forEach(function(t){ t._is_internal = true; });
		LS.ResourcesManager.textures[":black"] = this._black_texture;
		LS.ResourcesManager.textures[":gray"] = this._gray_texture;
		LS.ResourcesManager.textures[":white"] = this._white_texture;
		LS.ResourcesManager.textures[":flatnormal"] = this._normal_texture;

		//some global meshes could be helpful: used for irradiance probes
		this._sphere_mesh = GL.Mesh.sphere({ size:1, detail:32 });

		//draw helps rendering debug stuff
		if(LS.Draw)
		{
			LS.Draw.init();
			LS.Draw.onRequestFrame = function() { LS.GlobalScene.requestFrame(); }
		}

		//enable webglCanvas lib so it is easy to render in 2D
		if(global.enableWebGLCanvas && !gl.canvas.canvas2DtoWebGL_enabled)
			global.enableWebGLCanvas( gl.canvas );

		// we use fixed slots to avoid changing texture slots all the time
		// from more common to less (to avoid overlappings with material textures)
		// the last slot is reserved for litegl binding stuff
		var max_texture_units = this._max_texture_units = gl.getParameter( gl.MAX_TEXTURE_IMAGE_UNITS );
		this.SHADOWMAP_TEXTURE_SLOT = max_texture_units - 2;
		this.ENVIRONMENT_TEXTURE_SLOT = max_texture_units - 3;
		this.IRRADIANCE_TEXTURE_SLOT = max_texture_units - 4;

		this.LIGHTPROJECTOR_TEXTURE_SLOT = max_texture_units - 5;
		this.LIGHTEXTRA_TEXTURE_SLOT = max_texture_units - 6;

		this.BONES_TEXTURE_SLOT = max_texture_units - 7;
		this.MORPHS_TEXTURE_SLOT = max_texture_units - 8;
		this.MORPHS_TEXTURE2_SLOT = max_texture_units - 9;

		this._active_samples.length = max_texture_units;

		//set render queues
		this.createRenderQueue( LS.RenderQueue.BACKGROUND, LS.RenderQueue.NO_SORT );
		this.createRenderQueue( LS.RenderQueue.GEOMETRY, LS.RenderQueue.SORT_NEAR_TO_FAR );
		this.createRenderQueue( LS.RenderQueue.TRANSPARENT, LS.RenderQueue.SORT_FAR_TO_NEAR );

		//very special queue that must change the renderframecontext before start rendering anything
		this.createRenderQueue( LS.RenderQueue.READBACK_COLOR, LS.RenderQueue.SORT_FAR_TO_NEAR, {
			onStart: function( render_settings, pass ){
				if( LS.RenderFrameContext.current && pass.name === "color" )
					LS.RenderFrameContext.current.cloneBuffers();
			}
		});

		this.createRenderQueue( LS.RenderQueue.OVERLAY, LS.RenderQueue.NO_SORT );
		this._full_viewport.set([0,0,gl.drawingBufferWidth,gl.drawingBufferHeight]);

		this._uniforms.u_viewport = gl.viewport_data;
		this._uniforms.environment_texture = this.ENVIRONMENT_TEXTURE_SLOT;
	},

	reset: function()
	{
	},

	//used to clear the state
	resetState: function()
	{
		this._is_rendering_frame = false;
	},

	//used to store which is the current full viewport available (could be different from the canvas in case is a FBO or the camera has a partial viewport)
	setFullViewport: function(x,y,w,h)
	{
		if(x.constructor === Number)
		{
			this._full_viewport[0] = x; this._full_viewport[1] = y; this._full_viewport[2] = w; this._full_viewport[3] = h;
		}
		else if(x.length)
			this._full_viewport.set(x);
	},

	/**
	* Renders the current scene to the screen
	* Many steps are involved, from gathering info from the scene tree, generating shadowmaps, setup FBOs, render every camera
	* If you want to change the rendering pipeline, do not overwrite this function, try to understand it first, otherwise you will miss lots of features
	*
	* @method render
	* @param {Scene} scene
	* @param {RenderSettings} render_settings
	* @param {Array} [cameras=null] if no cameras are specified the cameras are taken from the scene
	*/
	render: function( scene, render_settings, cameras )
	{
		scene = scene || LS.GlobalScene;

		if( this._is_rendering_frame )
		{
			console.error("Last frame didn't finish and a new one was issued. Remember that you cannot call LS.Renderer.render from an event dispatched during the render, this would cause a recursive loop. Call LS.Renderer.reset() to clear from an error.");
			//this._is_rendering_frame = false; //for safety, we setting to false 
			return;
		}

		//init frame
		this._is_rendering_frame = true;
		render_settings = render_settings || this.default_render_settings;
		this._current_render_settings = render_settings;
		this._current_scene = scene;
		this._main_camera = cameras ? cameras[0] : null;
		scene._frame += 1; //done at the beginning just in case it crashes
		this._frame += 1;
		scene._must_redraw = false;
		var start_time = getTime();
		this._rendercalls = 0;
		this._rendered_instances = 0;
		this._rendered_passes = 0;
		this._global_shader_blocks.length = 0;
		this._global_shader_blocks_flags = 0;
		for(var i in this._global_textures)
			this._global_textures[i] = null;
		if(!this._current_pass)
			this._current_pass = COLOR_PASS;

		//to restore from a possible exception (not fully tested, remove if problem)
		if(!render_settings.ignore_reset)
			LS.RenderFrameContext.reset();

		if(gl.canvas.canvas2DtoWebGL_enabled)
			gl.resetTransform(); //reset 

		//force fullscreen viewport
		if( !render_settings.keep_viewport )
		{
			gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight );
			this.setFullViewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight); //assign this as the full available viewport
		}
		else
			this.setFullViewport( gl.viewport_data );
		this._global_viewport.set( gl.viewport_data );

		//Event: beforeRender used in actions that could affect which info is collected for the rendering
		LEvent.trigger( scene, "beforeRender", render_settings );

		//get render instances, cameras, lights, materials and all rendering info ready (computeVisibility)
		this.processVisibleData( scene, render_settings, cameras );

		//Define the main camera, the camera that should be the most important (used for LOD info, or shadowmaps)
		cameras = cameras && cameras.length ? cameras : this._visible_cameras;
		if(cameras.length == 0)
			throw("no cameras");
		this._visible_cameras = cameras; //the cameras being rendered
		this._main_camera = cameras[0];

		//Event: readyToRender when we have all the info to render
		LEvent.trigger( scene, "readyToRender", render_settings );

		//remove the lights that do not lay in front of any camera (this way we avoid creating shadowmaps)
		//TODO

		//Event: renderShadowmaps helps to generate shadowMaps that need some camera info (which could be not accessible during processVisibleData)
		LEvent.trigger(scene, "renderShadows", render_settings );

		//Event: afterVisibility allows to cull objects according to the main camera
		LEvent.trigger(scene, "afterVisibility", render_settings );

		//Event: renderReflections in case some realtime reflections are needed, this is the moment to render them inside textures
		LEvent.trigger(scene, "renderReflections", render_settings );

		//Event: beforeRenderMainPass in case a last step is missing
		LEvent.trigger(scene, "beforeRenderMainPass", render_settings );

		//enable global FX context
		if(render_settings.render_fx)
			LEvent.trigger( scene, "enableFrameContext", render_settings );

		//render all cameras
		this.renderFrameCameras( cameras, render_settings );

		//keep original viewport
		if( render_settings.keep_viewport )
			gl.setViewport( this._global_viewport );

		//disable and show final FX context
		if(render_settings.render_fx)
			LEvent.trigger( scene, "showFrameContext", render_settings );

		//renderGUI
		this.renderGUI( render_settings );

		//profiling must go here
		this._frame_cpu_time = getTime() - start_time;
		if( LS.Draw ) //developers may decide not to include LS.Draw
			this._rendercalls += LS.Draw._rendercalls; LS.Draw._rendercalls = 0; //stats are not centralized

		//Event: afterRender to give closure to some actions
		LEvent.trigger( scene, "afterRender", render_settings ); 
		this._is_rendering_frame = false;

		//coroutines
		LS.triggerCoroutines("render");
	},

	/**
	* Calls renderFrame of every camera in the cameras list (triggering the appropiate events)
	*
	* @method renderFrameCameras
	* @param {Array} cameras
	* @param {RenderSettings} render_settings
	*/
	renderFrameCameras: function( cameras, render_settings )
	{
		var scene = this._current_scene;

		//for each camera
		for(var i = 0; i < cameras.length; ++i)
		{
			var current_camera = cameras[i];

			LEvent.trigger(scene, "beforeRenderFrame", render_settings );
			LEvent.trigger(current_camera, "beforeRenderFrame", render_settings );
			LEvent.trigger(current_camera, "enableFrameContext", render_settings );

			//main render
			this.renderFrame( current_camera, render_settings ); 

			LEvent.trigger(current_camera, "showFrameContext", render_settings );
			LEvent.trigger(current_camera, "afterRenderFrame", render_settings );
			LEvent.trigger(scene, "afterRenderFrame", render_settings );
		}
	},

	/**
	* renders the view from one camera to the current viewport (could be the screen or a texture)
	*
	* @method renderFrame
	* @param {Camera} camera 
	* @param {Object} render_settings [optional]
	* @param {Scene} scene [optional] this can be passed when we are rendering a different scene from LS.GlobalScene (used in renderMaterialPreview)
	*/
	renderFrame: function ( camera, render_settings, scene )
	{
		render_settings = render_settings || this.default_render_settings;

		//get all the data
		if(scene) //in case we use another scene than the default one
		{
			scene._frame++;
			this.processVisibleData( scene, render_settings );
		}
		this._current_scene = scene = scene || this._current_scene; //ugly, I know

		//set as active camera and set viewport
		this.enableCamera( camera, render_settings, render_settings.skip_viewport, scene ); 

		//compute the rendering order
		this.sortRenderQueues( camera, render_settings );

		//clear buffer
		this.clearBuffer( camera, render_settings );

		//send before events
		LEvent.trigger(scene, "beforeRenderScene", camera );
		LEvent.trigger(this, "beforeRenderScene", camera );

		//in case the user wants to filter instances
		LEvent.trigger(this, "computeVisibility", this._visible_instances );

		//here we render all the instances
		this.renderInstances( render_settings, this._visible_instances );

		//send after events
		LEvent.trigger( scene, "afterRenderScene", camera );
		LEvent.trigger( this, "afterRenderScene", camera );
		if(this.onRenderScene)
			this.onRenderScene( camera, render_settings, scene);

		//render helpers (guizmos)
		if(render_settings.render_helpers)
			LEvent.trigger(this, "renderHelpers", camera );
	},

	//shows a RenderFrameContext to the viewport (warning, some components may do it bypassing this function)
	showRenderFrameContext: function( render_frame_context, camera )
	{
		//if( !this._current_render_settings.onPlayer)
		//	return;
		LEvent.trigger(this, "beforeShowFrameContext", render_frame_context );
		render_frame_context.show();
	},

	/**
	* Sets camera as the current camera, sets the viewport according to camera info, updates matrices, and prepares LS.Draw
	*
	* @method enableCamera
	* @param {Camera} camera
	* @param {RenderSettings} render_settings
	*/
	enableCamera: function(camera, render_settings, skip_viewport, scene )
	{
		scene = scene || this._current_scene || LS.GlobalScene;

		LEvent.trigger( camera, "beforeEnabled", render_settings );
		LEvent.trigger( scene, "beforeCameraEnabled", camera );

		//assign viewport manually (shouldnt use camera.getLocalViewport to unify?)
		var startx = this._full_viewport[0];
		var starty = this._full_viewport[1];
		var width = this._full_viewport[2];
		var height = this._full_viewport[3];
		if(width == 0 && height == 0)
		{
			console.warn("enableCamera: full viewport was 0, assigning to full viewport");
			width = gl.viewport_data[2];
			height = gl.viewport_data[3];
		}

		var final_x = Math.floor(width * camera._viewport[0] + startx);
		var final_y = Math.floor(height * camera._viewport[1] + starty);
		var final_width = Math.ceil(width * camera._viewport[2]);
		var final_height = Math.ceil(height * camera._viewport[3]);

		if(!skip_viewport)
		{
			//force fullscreen viewport?
			if(render_settings && render_settings.ignore_viewports )
			{
				camera.final_aspect = this.global_aspect * camera._aspect * (width / height);
				gl.viewport( this._full_viewport[0], this._full_viewport[1], this._full_viewport[2], this._full_viewport[3] );
			}
			else
			{
				camera.final_aspect = this.global_aspect * camera._aspect * (final_width / final_height); //what if we want to change the aspect?
				gl.viewport( final_x, final_y, final_width, final_height );
			}
		}
		camera._last_viewport_in_pixels.set( gl.viewport_data );

		//recompute the matrices (view,proj and viewproj)
		camera.updateMatrices();

		//store matrices locally
		mat4.copy( this._view_matrix, camera._view_matrix );
		mat4.copy( this._projection_matrix, camera._projection_matrix );
		mat4.copy( this._viewprojection_matrix, camera._viewprojection_matrix );

		//safety in case something went wrong in the camera
		for(var i = 0; i < 16; ++i)
			if( isNaN( this._viewprojection_matrix[i] ) )
				console.warn("warning: viewprojection matrix contains NaN when enableCamera is used");

		//2D Camera: TODO: MOVE THIS SOMEWHERE ELSE
		mat4.ortho( this._2Dviewprojection_matrix, -1, 1, -1, 1, 1, -1 );

		//set as the current camera
		this._current_camera = camera;

		//Draw allows to render debug info easily
		if(LS.Draw)
		{
			LS.Draw.reset(); //clear 
			LS.Draw.setCamera( camera );
		}

		LEvent.trigger( camera, "afterEnabled", render_settings );
		LEvent.trigger( scene, "afterCameraEnabled", camera ); //used to change stuff according to the current camera (reflection textures)
	},

	/**
	* Returns the camera active
	*
	* @method getCurrentCamera
	* @return {Camera} camera
	*/
	getCurrentCamera: function()
	{
		return this._current_camera;
	},

	/**
	* clear color using camera info ( background color, viewport scissors, clear depth, etc )
	*
	* @method clearBuffer
	* @param {Camera} camera
	* @param {LS.RenderSettings} render_settings
	*/
	clearBuffer: function( camera, render_settings )
	{
		if( render_settings.ignore_clear || (!camera.clear_color && !camera.clear_depth) )
			return;

		//scissors test for the gl.clear, otherwise the clear affects the full viewport
		gl.scissor( gl.viewport_data[0], gl.viewport_data[1], gl.viewport_data[2], gl.viewport_data[3] );
		gl.enable(gl.SCISSOR_TEST);

		//clear color buffer 
		gl.colorMask( true, true, true, true );
		gl.clearColor( camera.background_color[0], camera.background_color[1], camera.background_color[2], camera.background_color[3] );

		//clear depth buffer
		gl.depthMask( true );

		//to clear the stencil
		gl.enable( gl.STENCIL_TEST );
		gl.clearStencil( 0x0 );

		//do the clearing
		gl.clear( ( camera.clear_color ? gl.COLOR_BUFFER_BIT : 0) | (camera.clear_depth ? gl.DEPTH_BUFFER_BIT : 0) | gl.STENCIL_BUFFER_BIT );

		gl.disable( gl.SCISSOR_TEST );
		gl.disable( gl.STENCIL_TEST );
	},

	sortRenderQueues: function( camera, render_settings )
	{
		var instances = this._visible_instances;
		if(!instances)
			return;

		//compute distance to camera
		var camera_eye = camera.getEye( this._temp_cameye );
		for(var i = 0, l = instances.length; i < l; ++i)
		{
			var instance = instances[i];
			if(instance)
				instance._dist = vec3.dist( instance.center, camera_eye );
		}

		//sort queues
		for(var i = 0, l = this._queues.length; i < l; ++i)
		{
			var queue = this._queues[i];
			if(!queue || !queue.sort_mode)
				continue;
			queue.sort();
		}
	},

	/**
	* To set gl state to a known and constant state in every render pass
	*
	* @method resetGLState
	* @param {RenderSettings} render_settings
	*/
	resetGLState: function( render_settings )
	{
		render_settings = render_settings || this._current_render_settings;

		//maybe we should use this function instead
		//LS.RenderState.reset(); 

		gl.enable( gl.CULL_FACE );
		gl.frontFace(gl.CCW);

		gl.colorMask(true,true,true,true);

		gl.enable( gl.DEPTH_TEST );
		gl.depthFunc( gl.LESS );
		gl.depthMask(true);

		gl.disable( gl.BLEND );
		gl.blendFunc( gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA );

		gl.disable( gl.STENCIL_TEST );
		gl.stencilMask( 0xFF );
		gl.stencilOp( gl.KEEP, gl.KEEP, gl.KEEP );
		gl.stencilFunc( gl.ALWAYS, 1, 0xFF );
	},

	/**
	* Calls the render method for every RenderInstance (it also takes into account events and frustrum culling)
	*
	* @method renderInstances
	* @param {RenderSettings} render_settings
	* @param {Array} instances array of RIs, if not specified the last visible_instances are rendered
	*/
	renderInstances: function( render_settings, instances, scene )
	{
		scene = scene || this._current_scene;
		if(!scene)
		{
			console.warn("LS.Renderer.renderInstances: no scene found in LS.Renderer._current_scene");
			return 0;
		}

		this._rendered_passes += 1;

		var pass = this._current_pass;
		var camera = this._current_camera;
		var camera_index_flag = camera._rendering_index != -1 ? (1<<(camera._rendering_index)) : 0;
		var apply_frustum_culling = render_settings.frustum_culling;
		var frustum_planes = camera.updateFrustumPlanes();
		var layers_filter = camera.layers & render_settings.layers;
		var instancing_supported = gl.webgl_version > 1 || gl.extensions["ANGLE_instanced_arrays"];

		LEvent.trigger( scene, "beforeRenderInstances", render_settings );
		//scene.triggerInNodes( "beforeRenderInstances", render_settings );

		//reset state of everything!
		this.resetGLState( render_settings );

		LEvent.trigger( scene, "renderInstances", render_settings );
		LEvent.trigger( this, "renderInstances", render_settings );

		//reset again!
		this.resetGLState( render_settings );

		/*
		var render_instance_func = pass.render_instance;
		if(!render_instance_func)
			return 0;
		*/

		var render_instances = instances || this._visible_instances;

		//global samplers
		this.bindSamplers( this._samplers );

		var instancing_data = this._instancing_data;


		//compute visibility pass: checks which RIs are visible from this camera
		for(var i = 0, l = render_instances.length; i < l; ++i)
		{
			//render instance
			var instance = render_instances[i];
			var node_flags = instance.node.flags;
			instance._is_visible = false;

			//hidden nodes
			if( pass == SHADOW_PASS && !(instance.material.flags.cast_shadows) )
				continue;
			if( pass == PICKING_PASS && node_flags.selectable === false )
				continue;
			if( (layers_filter & instance.layers) === 0 )
				continue;

			//done here because sometimes some nodes are moved in this action
			if(instance.onPreRender)
				if( instance.onPreRender( render_settings ) === false)
					continue;

			if(!instance.material) //in case something went wrong...
				continue;

			var material = camera._overwrite_material || instance.material;

			if(material.opacity <= 0) //TODO: remove this, do it somewhere else
				continue;

			//test visibility against camera frustum
			if( apply_frustum_culling && instance.use_bounding && !material.flags.ignore_frustum )
			{
				if(geo.frustumTestBox( frustum_planes, instance.aabb ) == CLIP_OUTSIDE )
					continue;
			}

			//save visibility info
			instance._is_visible = true;
			if(camera_index_flag) //shadowmap cameras dont have an index
				instance._camera_visibility |= camera_index_flag;

			//TODO: if material supports instancing WIP
			/*
			if( instancing_supported && material._allows_instancing && !instance._shader_blocks.length )
			{
				var instancing_ri_info = null;
				if(!instancing_data[ material._index ] )
					instancing_data[ material._index ] = instancing_ri_info = [];
				instancing_ri_info.push( instance );
			}
			*/
		}

		var start = this._rendered_instances;

		//process render queues
		for(var j = 0; j < this._queues.length; ++j)
		{
			var queue = this._queues[j];
			if(!queue || !queue.instances.length) //empty
				continue;

			//used to change RenderFrameContext stuff (cloning textures for refraction, etc)
			if(queue.onStart)
				if( queue.onStart( render_settings, pass ) === false )
					continue;

			var render_instances = queue.instances;

			//for each render instance
			for(var i = 0, l = render_instances.length; i < l; ++i)
			{
				//render instance
				var instance = render_instances[i];

				if( !instance._is_visible || !instance.mesh )
					continue;

				this._rendered_instances += 1;

				var material = camera._overwrite_material || instance.material;

				if( pass == PICKING_PASS && material.renderPickingInstance )
					material.renderPickingInstance( instance, render_settings, pass );
				else if( material.renderInstance )
					material.renderInstance( instance, render_settings, pass );
				else
					continue;

				//some instances do a post render action
				if(instance.onPostRender)
					instance.onPostRender( render_settings );
			}

			if(queue.onFinish)
				queue.onFinish( render_settings, pass );
		}

		this.resetGLState( render_settings );

		LEvent.trigger( scene, "renderScreenSpace", render_settings);

		//restore state
		this.resetGLState( render_settings );

		LEvent.trigger( scene, "afterRenderInstances", render_settings );
		LEvent.trigger( this, "afterRenderInstances", render_settings );

		//and finally again
		this.resetGLState( render_settings );

		return this._rendered_instances - start;
	},

	renderGUI: function( render_settings )
	{
		//renders GUI items using mostly the Canvas2DtoWebGL library
		gl.viewport( this._full_viewport[0], this._full_viewport[1], this._full_viewport[2], this._full_viewport[3] ); //assign full viewport always?
		if(gl.start2D) //in case we have Canvas2DtoWebGL installed (it is optional)
			gl.start2D();
		if( render_settings.render_gui )
		{
			if( LEvent.hasBind( this._current_scene, "renderGUI" ) ) //to avoid forcing a redraw if no gui is set
			{
				if(LS.GUI)
					LS.GUI.ResetImmediateGUI(); //mostly to change the cursor (warning, true to avoid forcing redraw)
				LEvent.trigger( this._current_scene, "renderGUI", gl );
			}
		}
		if( this.on_render_gui ) //used by the editor (here to ignore render_gui flag)
			this.on_render_gui( render_settings );
		if( gl.finish2D )
			gl.finish2D();
	},

	/**
	* returns a list of all the lights overlapping this instance (it uses sperical bounding so it could returns lights that are not really overlapping)
	* It is used by the multipass lighting to iterate 
	*
	* @method getNearLights
	* @param {RenderInstance} instance the render instance
	* @param {Array} result [optional] the output array
	* @return {Array} array containing a list of LS.Light affecting this RenderInstance
	*/
	getNearLights: function( instance, result )
	{
		result = result || [];

		result.length = 0; //clear old lights

		//it uses the lights gathered by prepareVisibleData
		var lights = this._visible_lights;
		if(!lights || !lights.length)
			return result;

		//Compute lights affecting this RI (by proximity, only takes into account spherical bounding)
		result.length = 0;
		var numLights = lights.length;
		for(var j = 0; j < numLights; j++)
		{
			var light = lights[j];
			//same layer?
			if( (light.layers & instance.layers) == 0 || (light.layers & this._current_camera.layers) == 0)
				continue;
			var light_intensity = light.computeLightIntensity();
			//light intensity too low?
			if(light_intensity < 0.0001)
				continue;
			var light_radius = light.computeLightRadius();
			var light_pos = light.position;
			//overlapping?
			if( light_radius == -1 || instance.overlapsSphere( light_pos, light_radius ) )
				result.push( light );
		}

		return result;
	},

	regenerateShadowmaps: function( scene, render_settings )
	{
		scene = scene || this._current_scene;
		render_settings = render_settings || this.default_render_settings;
		LEvent.trigger( scene, "renderShadows", render_settings );
		for(var i = 0; i < this._visible_lights.length; ++i)
			this._visible_lights[i].prepare( render_settings );
	},

	mergeSamplers: function( samplers, result )
	{
		result = result || [];
		result.length = this._max_texture_units;

		for(var i = 0; i < result.length; ++i)
		{
			for(var j = samplers.length - 1; j >= 0; --j)
			{
				if(	samplers[j][i] )
				{
					result[i] = samplers[j][i];
					break;
				}
			}
		}

		return result;
	},

	//to be sure we dont have anything binded
	clearSamplers: function()
	{
		for(var i = 0; i < this._max_texture_units; ++i)
		{
			gl.activeTexture(gl.TEXTURE0 + i);
			gl.bindTexture( gl.TEXTURE_2D, null );
			gl.bindTexture( gl.TEXTURE_CUBE_MAP, null );
			this._active_samples[i] = null;
		}
	},

	bindSamplers: function( samplers )
	{
		if(!samplers)
			return;

		var allow_textures = this.allow_textures; //used for debug

		for(var i = 0; i < samplers.length; ++i)
		{
			var sampler = samplers[i];
			if(!sampler) 
				continue;

			//REFACTOR THIS
			var tex = null;
			if(sampler.constructor === String || sampler.constructor === GL.Texture) //old way
			{
				tex = sampler;
				sampler = null;
			}
			else if(sampler.texture)
				tex = sampler.texture;
			else //dont know what this var type is?
			{
				//continue; //if we continue the sampler slot will remain empty which could lead to problems
			}

			if( tex && tex.constructor === String)
				tex = LS.ResourcesManager.textures[ tex ];
			if(!allow_textures)
				tex = null;

			if(!tex)
			{
				if(sampler)
				{
					switch( sampler.missing )
					{
						case "black": tex = this._black_texture; break;
						case "white": tex = this._white_texture; break;
						case "gray": tex = this._gray_texture; break;
						case "normal": tex = this._normal_texture; break;
						default: tex = this._missing_texture;
					}
				}
				else
					tex = this._missing_texture;
			}

			//avoid to read from the same texture we are rendering to (generates warnings)
			if(tex._in_current_fbo) 
				tex = this._missing_texture;

			tex.bind( i );
			this._active_samples[i] = tex;

			//texture properties
			if(sampler)// && sampler._must_update ) //disabled because samplers ALWAYS must set to the value, in case the same texture is used in several places in the scene
			{
				if(sampler.minFilter)
				{
					if( sampler.minFilter !== gl.LINEAR_MIPMAP_LINEAR || (GL.isPowerOfTwo( tex.width ) && GL.isPowerOfTwo( tex.height )) )
						gl.texParameteri(tex.texture_type, gl.TEXTURE_MIN_FILTER, sampler.minFilter);
				}
				if(sampler.magFilter)
					gl.texParameteri(tex.texture_type, gl.TEXTURE_MAG_FILTER, sampler.magFilter);
				if(sampler.wrap)
				{
					gl.texParameteri(tex.texture_type, gl.TEXTURE_WRAP_S, sampler.wrap);
					gl.texParameteri(tex.texture_type, gl.TEXTURE_WRAP_T, sampler.wrap);
				}
				if(sampler.anisotropic != null && gl.extensions.EXT_texture_filter_anisotropic )
					gl.texParameteri(tex.texture_type, gl.extensions.EXT_texture_filter_anisotropic.TEXTURE_MAX_ANISOTROPY_EXT, sampler.anisotropic );

				//sRGB textures must specified ON CREATION, so no
				//if(sampler.anisotropic != null && gl.extensions.EXT_sRGB )
				//sampler._must_update = false;
			}
		}
	},

	//Called at the beginning of processVisibleData 
	fillSceneUniforms: function( scene, render_settings )
	{
		//global uniforms
		var uniforms = scene._uniforms;
		uniforms.u_time = scene._time || getTime() * 0.001;
		uniforms.u_ambient_light = scene.info ? scene.info.ambient_color : vec3.create();

		this._samplers.length = 0;

		//clear globals
		this._global_textures.environment = null;

		//fetch global textures
		if(scene.info)
		for(var i in scene.info.textures)
		{
			var texture = LS.getTexture( scene.info.textures[i] );
			if(!texture)
				continue;

			var slot = 0;
			if( i == "environment" )
				slot = LS.Renderer.ENVIRONMENT_TEXTURE_SLOT;
			else
				continue; 

			var type = (texture.texture_type == gl.TEXTURE_2D ? "_texture" : "_cubemap");
			if(texture.texture_type == gl.TEXTURE_2D)
			{
				texture.bind(0);
				texture.setParameter( gl.TEXTURE_MIN_FILTER, gl.LINEAR ); //avoid artifact
			}
			this._samplers[ slot ] = texture;
			scene._uniforms[ i + "_texture" ] = slot; 
			scene._uniforms[ i + type ] = slot; //LEGACY

			if( i == "environment" )
				this._global_textures.environment = texture;
		}

		LEvent.trigger( scene, "fillSceneUniforms", scene._uniforms );
	},	

	/**
	* Collects and process the rendering instances, cameras and lights that are visible
	* Its a prepass shared among all rendering passes
	* Warning: rendering order is computed here, so it is shared among all the cameras (TO DO, move somewhere else)
	*
	* @method processVisibleData
	* @param {Scene} scene
	* @param {RenderSettings} render_settings
	* @param {Array} cameras in case you dont want to use the scene cameras
	*/
	processVisibleData: function( scene, render_settings, cameras, instances, skip_collect_data )
	{
		//options = options || {};
		//options.scene = scene;
		var frame = scene._frame;

		this._current_scene = scene;
		//compute global scene info
		this.fillSceneUniforms( scene, render_settings );

		//update info about scene (collecting it all or reusing the one collected in the frame before)
		if(!skip_collect_data)
		{
			if( this._frame % this._collect_frequency == 0)
				scene.collectData( cameras );
			LEvent.trigger( scene, "afterCollectData", scene );
		}

		//set cameras: use the parameters ones or the ones found in the scene
		cameras = (cameras && cameras.length) ? cameras : scene._cameras;
		if( cameras.length == 0 )
		{
			console.error("no cameras found");
			return;
		}
				
		//find which materials are going to be seen
		var materials = this._visible_materials; 
		materials.length = 0;

		//prepare cameras: TODO: sort by priority
		for(var i = 0, l = cameras.length; i < l; ++i)
		{
			var camera = cameras[i];
			camera._rendering_index = i;
			camera.prepare();
			if(camera.overwrite_material)
			{
				var material = camera.overwrite_material.constructor === String ? LS.ResourcesManager.resources[ camera.overwrite_material ] : camera.overwrite_material;
				if(material)
				{
					camera._overwrite_material = material;
					materials.push( material );
				}
			}
			else
				camera._overwrite_material = null;

		}

		//define the main camera (the camera used for some algorithms)
		if(!this._main_camera)
		{
			if( cameras.length )
				this._main_camera = cameras[0];
			else
				this._main_camera = new LS.Camera(); // ??
		}

		instances = instances || scene._instances;
		var camera = this._main_camera; // || scene.getCamera();
		var camera_eye = camera.getEye( this._temp_cameye );

		//clear render queues
		for(var i = 0; i < this._queues.length; ++i)
			if(this._queues[i])
				this._queues[i].clear();

		//process render instances (add stuff if needed, gather materials)
		for(var i = 0, l = instances.length; i < l; ++i)
		{
			var instance = instances[i];
			if(!instance)
				continue;

			var node_flags = instance.node.flags;

			if(!instance.mesh)
			{
				console.warn("RenderInstance must always have mesh");
				continue;
			}

			//materials
			if(!instance.material)
				instance.material = this.default_material;

			if( instance.material._last_frame_update != frame )
			{
				instance.material._last_frame_update = frame;
				materials.push( instance.material );
			}

			//add extra info: distance to main camera (used for sorting)
			instance._dist = vec3.dist( instance.center, camera_eye );

			//find nearest reflection probe
			if( scene._reflection_probes.length && !this._ignore_reflection_probes )
				instance._nearest_reflection_probe = scene.findNearestReflectionProbe( instance.center );
			else
				instance._nearest_reflection_probe = null;

			//change conditionaly
			if(render_settings.force_wireframe && instance.primitive != gl.LINES ) 
			{
				instance.primitive = gl.LINES;
				if(instance.mesh)
				{
					if(!instance.mesh.indexBuffers["wireframe"])
						instance.mesh.computeWireframe();
					instance.index_buffer = instance.mesh.indexBuffers["wireframe"];
				}
			}

			//add to queues
			var queue_index = instance.material.queue;
			var queue = null;
			if( queue_index === undefined || queue_index === LS.RenderQueue.DEFAULT )
			{
				//TODO: maybe this case should be treated directly in StandardMaterial
				if( instance.material._render_state.blend )
					queue = this._queues[ LS.RenderQueue.TRANSPARENT ];
				else
					queue = this._queues[ LS.RenderQueue.GEOMETRY ];
			}
			else
			{
				queue = this._queues[ queue_index ];
				if(!queue)
					LS.Renderer.createRenderQueue( queue_index );
			}
			if(!queue)
				continue;
			queue.add( instance );

			instance._camera_visibility = 0|0;
		}

		//prepare materials 
		for(var i = 0; i < materials.length; ++i)
		{
			var material = materials[i];
			material._index = i;
			if( material.prepare )
				material.prepare( scene );
		}

		LEvent.trigger( scene, "prepareMaterials" );

		//pack all macros, uniforms, and samplers relative to this instance in single containers
		for(var i = 0, l = instances.length; i < l; ++i)
		{
			var instance = instances[i];
			var node = instance.node;
			var material = instance.material;
			instance.index = i;

			/*
			var query = instance._final_query;
			query.clear();
			query.add( node._query );
			if(material)
				query.add( material._query );
			query.add( instance.query );
			*/
		}

		//store all the info
		this._visible_instances = scene._instances;
		this._visible_lights = scene._lights;
		this._visible_cameras = cameras; 
		//this._visible_materials = materials;

		//prepare lights (collect data and generate shadowmaps)
		for(var i = 0, l = this._visible_lights.length; i < l; ++i)
			this._visible_lights[i].prepare( render_settings );

		LEvent.trigger( scene, "afterCollectData", scene );
	},

	/**
	* Renders a frame into a texture (could be a cubemap, in which case does the six passes)
	*
	* @method renderInstancesToRT
	* @param {Camera} cam
	* @param {Texture} texture
	* @param {RenderSettings} render_settings
	*/
	renderInstancesToRT: function( cam, texture, render_settings, instances )
	{
		render_settings = render_settings || this.default_render_settings;
		this._current_target = texture;
		var scene = LS.Renderer._current_scene;
		texture._in_current_fbo = true;

		if(texture.texture_type == gl.TEXTURE_2D)
		{
			this.enableCamera(cam, render_settings);
			texture.drawTo( inner_draw_2d );
		}
		else if( texture.texture_type == gl.TEXTURE_CUBE_MAP)
			this.renderToCubemap( cam.getEye(), texture.width, texture, render_settings, cam.near, cam.far );
		this._current_target = null;
		texture._in_current_fbo = false;

		function inner_draw_2d()
		{
			LS.Renderer.clearBuffer( cam, render_settings );
			/*
			gl.clearColor(cam.background_color[0], cam.background_color[1], cam.background_color[2], cam.background_color[3] );
			if(render_settings.ignore_clear != true)
				gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
			*/
			//render scene
			LS.Renderer.renderInstances( render_settings, instances );
		}
	},

	/**
	* Renders the current scene to a cubemap centered in the given position
	*
	* @method renderToCubemap
	* @param {vec3} position center of the camera where to render the cubemap
	* @param {number} size texture size
	* @param {Texture} texture to reuse the same texture
	* @param {RenderSettings} render_settings
	* @param {number} near
	* @param {number} far
	* @return {Texture} the resulting texture
	*/
	renderToCubemap: function( position, size, texture, render_settings, near, far, background_color, instances )
	{
		size = size || 256;
		near = near || 1;
		far = far || 1000;

		if(render_settings && render_settings.constructor !== LS.RenderSettings)
			throw("render_settings parameter must be LS.RenderSettings.");

		var eye = position;
		if( !texture || texture.constructor != GL.Texture)
			texture = null;

		var scene = this._current_scene;
		if(!scene)
			scene = this._current_scene = LS.GlobalScene;

		var camera = this._cubemap_camera;
		if(!camera)
			camera = this._cubemap_camera = new LS.Camera();
		camera.configure({ fov: 90, aspect: 1.0, near: near, far: far });

		texture = texture || new GL.Texture(size,size,{texture_type: gl.TEXTURE_CUBE_MAP, minFilter: gl.NEAREST});
		this._current_target = texture;
		texture._in_current_fbo = true; //block binding this texture during rendering of the reflection

		texture.drawTo( function(texture, side) {

			var info = LS.Camera.cubemap_camera_parameters[side];
			if(texture._is_shadowmap || !background_color )
				gl.clearColor(0,0,0,0);
			else
				gl.clearColor( background_color[0], background_color[1], background_color[2], background_color[3] );
			gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
			camera.configure({ eye: eye, center: [ eye[0] + info.dir[0], eye[1] + info.dir[1], eye[2] + info.dir[2]], up: info.up });
			LS.Renderer.enableCamera( camera, render_settings, true );
			LS.Renderer.renderInstances( render_settings, instances, scene );
		});

		this._current_target = null;
		texture._in_current_fbo = false;
		return texture;
	},

	/**
	* Renders the material preview to an image (or to the screen)
	*
	* @method renderMaterialPreview
	* @param {Material} material
	* @param {number} size image size
	* @param {Object} options could be environment_texture, to_viewport
	* @param {HTMLCanvas} canvas [optional] the output canvas where to store the preview
	* @return {Image} the preview image (in canvas format) or null if it was rendered to the viewport
	*/
	renderMaterialPreview: function( material, size, options, canvas )
	{
		options = options || {};

		if(!material)
		{
			console.error("No material provided to renderMaterialPreview");
			return;
		}

		//create scene
		var scene = this._material_scene;
		if(!scene)
		{
			scene = this._material_scene = new LS.Scene();
			scene.root.camera.background_color.set([0.0,0.0,0.0,0]);
			if(options.environment_texture)
				scene.info.textures.environment = options.environment_texture;
			var node = new LS.SceneNode( "sphere" );
			var compo = new LS.Components.GeometricPrimitive( { size: 40, subdivisions: 50, geometry: LS.Components.GeometricPrimitive.SPHERE } );
			node.addComponent( compo );
			scene.root.addChild( node );
		}

		if(!this._preview_material_render_settings)
			this._preview_material_render_settings = new LS.RenderSettings({ skip_viewport: true, render_helpers: false, update_materials: true });
		var render_settings = this._preview_material_render_settings;

		if(options.background_color)
			scene.root.camera.background_color.set(options.background_color);

		var node = scene.getNode( "sphere");
		if(!node)
		{
			console.error("Node not found in Material Preview Scene");
			return null;
		}

		if(options.rotate)
		{
			node.transform.reset();
			node.transform.rotateY( options.rotate );
		}

		var new_material = null;
		if( material.constructor === String )
			new_material = material;
		else
		{
			new_material = new material.constructor();
			new_material.configure( material.serialize() );
		}
		node.material = new_material;

		if(options.to_viewport)
		{
			LS.Renderer.renderFrame( scene.root.camera, render_settings, scene );
			return;
		}

		var tex = this._material_preview_texture || new GL.Texture(size,size);
		if(!this._material_preview_texture)
			this._material_preview_texture = tex;

		tex.drawTo( function()
		{
			//it already clears everything
			//just render
			LS.Renderer.renderFrame( scene.root.camera, render_settings, scene );
		});

		var canvas = tex.toCanvas( canvas, true );
		return canvas;
	},

	/**
	* Returns the last camera that falls into a given screen position
	*
	* @method getCameraAtPosition
	* @param {number} x in canvas coordinates (0,0 is bottom-left)
	* @param {number} y in canvas coordinates (0,0 is bottom-left)
	* @param {Scene} scene if not specified last rendered scene will be used
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

			if( camera.isPoint2DInCameraViewport(x,y) )
				return camera;
		}
		return null;
	},

	/**
	* Adds a new RenderQueue to the Renderer.
	*
	* @method addRenderQueue
	* @param {RenderQueue} name name of the render pass as in render_passes
	* @param {Number} sorting which algorithm use to sort ( LS.RenderQueue.NO_SORT, LS.RenderQueue.SORT_NEAR_TO_FAR, LS.RenderQueue.SORT_FAR_TO_NEAR )
	* @param {Object} options extra stuff to add to the queue ( like callbacks onStart, onFinish )
	* @return {Number} index of the render queue
	*/
	createRenderQueue: function( index, sorting, options )
	{
		if(index === undefined)
			throw("RenderQueue must have index");
		var queue = new LS.RenderQueue( sorting );
		if( this._queues[ index ] )
			console.warn("There is already a RenderQueue in slot ",index );
		this._queues[ index ] = queue;

		if(options)
			for(var i in options)
				queue[i] = options[i];
	},

	setRenderPass: function( pass )
	{
		if(!pass)
			pass = COLOR_PASS;
		this._current_pass = pass;
	},
	
	/**
	* Enables a ShaderBlock ONLY DURING THIS FRAME
	* must be called during frame rendering (event like fillSceneUniforms)
	*
	* @method enableFrameShaderBlock
	* @param {String} shader_block_name
	*/
	enableFrameShaderBlock: function( shader_block_name, uniforms, samplers )
	{
		var shader_block = shader_block_name.constructor === LS.ShaderBlock ? shader_block_name : LS.Shaders.getShaderBlock( shader_block_name );

		if( !shader_block || this._global_shader_blocks_flags & shader_block.flag_mask )
			return; //already added

		this._global_shader_blocks.push( shader_block );
		this._global_shader_blocks_flags |= shader_block.flag_mask;

		//add uniforms to renderer uniforms?
		if(uniforms)
			for(var i in uniforms)
				this._uniforms[i] = uniforms[i];

		if(samplers)
			for(var i = 0; i < samplers.length; ++i)
				if( samplers[i] )
					this._samplers[i] = samplers[i];
	},

	/**
	* Disables a ShaderBlock ONLY DURING THIS FRAME
	* must be called during frame rendering (event like fillSceneUniforms)
	*
	* @method disableFrameShaderBlock
	* @param {String} shader_block_name
	*/
	disableFrameShaderBlock:  function( shader_block_name, uniforms, samplers )
	{
		var shader_block = shader_block_name.constructor === LS.ShaderBlock ? shader_block_name : LS.Shaders.getShaderBlock( shader_block_name );
		if( !shader_block || !(this._global_shader_blocks_flags & shader_block.flag_mask) )
			return; //not active

		var index = this._global_shader_blocks.indexOf( shader_block );
		if(index != -1)
			this._global_shader_blocks.splice( index, 1 );
		this._global_shader_blocks_flags &= ~( shader_block.flag_mask ); //disable bit
	},

	/**
	* Renders one texture into another texture, it allows to apply a shader
	*
	* @method blit
	* @param {GL.Texture} source
	* @param {GL.Texture} destination
	* @param {GL.Shader} shader [optional] shader to apply, it must use the GL.Shader.QUAD_VERTEX_SHADER as vertex shader
	* @param {Object} uniforms [optional] uniforms for the shader
	*/
	blit: function( source, destination, shader, uniforms )
	{
		if(!source || !destination)
			throw("data missing in blit");

		if(source != destination)
		{
			destination.drawTo( function(){
				source.toViewport( shader, uniforms );
			});
			return;
		}

		if(!shader)
			throw("blitting texture to the same texture doesnt makes sense unless a shader is specified");

		var temp = GL.Texture.getTemporary( source.width, source.height, source );
		source.copyTo( temp );
		temp.copyTo( source, shader, uniforms );
		GL.Texture.releaseTemporary( temp );
	}
};

//Add to global Scope
LS.Renderer = Renderer;


