
//************************************
/**
* The Renderer is in charge of generating one frame of the scene. Contains all the passes and intermediate functions to create the frame.
*
* @class Renderer
* @namespace LS
* @constructor
*/

//passes
var COLOR_PASS = 1;
var SHADOW_PASS = 2;
var PICKING_PASS = 3;

var Renderer = {

	default_render_settings: new LS.RenderSettings(), //overwritten by the global info or the editor one
	default_material: new LS.StandardMaterial(), //used for objects without material

	render_passes: {}, //used to specify the render function for every kind of render pass (color, shadow, picking, etc)
	renderPassFunction: null, //function to call when rendering instances

	global_aspect: 1, //used when rendering to a texture that doesnt have the same aspect as the screen

	default_point_size: 1, //point size in pixels (could be overwritte by render instances)

	_global_viewport: vec4.create(), //the viewport we have available to render the full frame (including subviewports), usually is the 0,0,gl.canvas.width,gl.canvas.height
	_full_viewport: vec4.create(), //contains info about the full viewport available to render (current texture size or canvas size)

	//temporal info during rendering
	_current_scene: null,
	_current_render_settings: null,
	_current_camera: null,
	_current_target: null, //texture where the image is being rendered
	_current_pass: null,

	_main_camera: null,

	_visible_cameras: null,
	_visible_lights: null,
	_visible_instances: null,
	_near_lights: [],
	_active_samples: [],

	//stats
	_rendercalls: 0, //calls to instance.render
	_rendered_instances: 0, //instances processed
	_frame: 0,

	//settings
	_collect_frequency: 1, //used to reuse info (WIP)

	//reusable locals
	_view_matrix: mat4.create(),
	_projection_matrix: mat4.create(),
	_viewprojection_matrix: mat4.create(),
	_2Dviewprojection_matrix: mat4.create(),

	_temp_matrix: mat4.create(),
	_identity_matrix: mat4.create(),
	_render_uniforms: {},

	//fixed texture slots for global textures
	SHADOWMAP_TEXTURE_SLOT: 6,
	ENVIRONMENT_TEXTURE_SLOT: 5,
	IRRADIANCE_TEXTURE_SLOT: 4,
	LIGHTPROJECTOR_TEXTURE_SLOT: 3,
	LIGHTEXTRA_TEXTURE_SLOT: 2,

	//used in special cases
	BONES_TEXTURE_SLOT: 3,
	MORPHS_TEXTURE_SLOT: 2,


	//called from...
	init: function()
	{
		//this is used in case a texture is missing
		this._missing_texture = new GL.Texture(1,1, { pixel_data: [128,128,128,255] });

		//draw helps rendering debug stuff
		LS.Draw.init();
		LS.Draw.onRequestFrame = function() { LS.GlobalScene.refresh(); }

		//there are different render passes, they have different render functions
		this.registerRenderPass( "color", { id: COLOR_PASS, render_instance: this.renderColorPassInstance } );
		this.registerRenderPass( "shadow", { id: SHADOW_PASS, render_instance: this.renderShadowPassInstance } );
		this.registerRenderPass( "picking", { id: PICKING_PASS, render_instance: this.renderPickingPassInstance } );

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

		this._active_samples.length = max_texture_units;
	},

	reset: function()
	{
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
	* @param {SceneTree} scene
	* @param {RenderSettings} render_settings
	* @param {Array} [cameras=null] if no cameras are specified the cameras are taken from the scene
	*/
	render: function( scene, render_settings, cameras )
	{
		if(!LS.ShadersManager.ready)
			return; //not ready

		render_settings = render_settings || this.default_render_settings;
		this._current_render_settings = render_settings;
		this._current_scene = scene;
		this._main_camera = cameras ? cameras[0] : null;

		//done at the beginning just in case it crashes
		scene._frame += 1;
		this._frame += 1;
		scene._must_redraw = false;

		this._rendercalls = 0;
		this._rendered_instances = 0;

		//force fullscreen viewport
		if( !render_settings.keep_viewport )
		{
			gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
			this.setFullViewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
		}
		else
			this.setFullViewport( gl.viewport_data );
		this._global_viewport.set( gl.viewport_data );

		//Event: beforeRender used in actions that could affect which info is collected for the rendering
		LEvent.trigger(scene, "beforeRender", render_settings );
		scene.triggerInNodes("beforeRender", render_settings );

		//get render instances, cameras, lights, materials and all rendering info ready: computeVisibility
		this.processVisibleData( scene, render_settings, cameras );

		//Define the main camera, the camera that should be the most important (used for LOD info, or shadowmaps)
		cameras = cameras || this._visible_cameras;
		this._visible_cameras = cameras; //the cameras being rendered
		this._main_camera = cameras[0];

		//remove the lights that do not lay in front of any camera (this way we avoid creating shadowmaps)
		//TODO

		//Event: renderShadowmaps helps to generate shadowMaps that need some camera info (which could be not accessible during processVisibleData)
		LEvent.trigger(scene, "renderShadows", render_settings );
		scene.triggerInNodes("renderShadows", render_settings ); //TODO: remove

		//Event: afterVisibility allows to cull objects according to the main camera
		scene.triggerInNodes("afterVisibility", render_settings ); //TODO: remove	

		//Event: renderReflections in case some realtime reflections are needed, this is the moment to render them inside textures
		LEvent.trigger(scene, "renderReflections", render_settings );
		scene.triggerInNodes("renderReflections", render_settings ); //TODO: remove

		//Event: beforeRenderMainPass in case a last step is missing
		LEvent.trigger(scene, "beforeRenderMainPass", render_settings );
		scene.triggerInNodes("beforeRenderMainPass", render_settings ); //TODO: remove

		//allows to overwrite renderer
		if(this.custom_renderer && this.custom_renderer.render && render_settings.custom_renderer )
		{
			this.custom_renderer.render( cameras, render_settings );
		}
		else
		{
			//enable FX
			if(render_settings.render_fx)
				LEvent.trigger( scene, "enableFrameContext", render_settings );

			//render
			this.renderFrameCameras( cameras, render_settings );

			//keep original viewport
			if( render_settings.keep_viewport )
				gl.setViewport( this._global_viewport );

			//disable and show FX
			if(render_settings.render_fx)
				LEvent.trigger( scene, "showFrameContext", render_settings );
		}

		if(render_settings.render_gui)
			LEvent.trigger( scene, "renderGUI", render_settings );

		//Event: afterRender to give closure to some actions
		LEvent.trigger(scene, "afterRender", render_settings );
		scene.triggerInNodes("afterRender", render_settings ); //TODO: remove
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
	* @param {Object} render_settings
	* @param {SceneTree} scene [optional] this can be passed when we are rendering a different scene from LS.GlobalScene (used in renderMaterialPreview)
	*/
	renderFrame: function ( camera, render_settings, scene )
	{
		//get all the data
		if(scene) //in case we use another scene
			this.processVisibleData(scene, render_settings);
		scene = scene || this._current_scene;

		//set as active camera and set viewport
		this.enableCamera( camera, render_settings, render_settings.skip_viewport ); 

		//compute the rendering order
		this.sortRenderInstances( camera, render_settings );

		//clear buffer
		this.clearBuffer( camera, render_settings );

		//send before events
		LEvent.trigger(scene, "beforeRenderScene", camera );
		scene.triggerInNodes("beforeRenderScene", camera ); //TODO remove
		LEvent.trigger(this, "beforeRenderScene", camera );

		//here we render all the instances
		this.renderInstances(render_settings);

		//send after events
		LEvent.trigger(scene, "afterRenderScene", camera );
		scene.triggerInNodes("afterRenderScene", camera ); //TODO remove
		LEvent.trigger(this, "afterRenderScene", camera );

		//render helpers (guizmos)
		if(render_settings.render_helpers)
			LEvent.trigger(this, "renderHelpers", camera );
	},

	/**
	* Sets camera as the current camera, sets the viewport according to camera info, updates matrices, and prepares LS.Draw
	*
	* @method enableCamera
	* @param {Camera} camera
	* @param {RenderSettings} render_settings
	*/
	enableCamera: function(camera, render_settings, skip_viewport)
	{
		var scene = this._current_scene;

		LEvent.trigger( camera, "beforeEnabled", render_settings );
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

		camera.updateMatrices();

		//store matrices locally
		mat4.copy( this._view_matrix, camera._view_matrix );
		mat4.copy( this._projection_matrix, camera._projection_matrix );
		mat4.copy( this._viewprojection_matrix, camera._viewprojection_matrix );

		//2D Camera: TODO: MOVE THIS SOMEWHERE ELSE
		mat4.ortho( this._2Dviewprojection_matrix, -1, 1, -1, 1, 1, -1 );

		//set as the current camera
		this._current_camera = camera;

		//Draw allows to render debug info easily
		Draw.reset(); //clear 
		Draw.setCameraPosition( camera.getEye() );
		Draw.setViewProjectionMatrix( this._view_matrix, this._projection_matrix, this._viewprojection_matrix );

		LEvent.trigger( camera, "afterEnabled", render_settings );
		LEvent.trigger( scene, "afterCameraEnabled", camera ); //used to change stuff according to the current camera (reflection textures)
	},

	//clear color using camerae info
	clearBuffer: function( camera, render_settings )
	{
		if( render_settings.ignore_clear || (!camera.clear_color && !camera.clear_depth) )
			return;

		//scissors test for the gl.clear, otherwise the clear affects the full viewport
		gl.scissor( gl.viewport_data[0], gl.viewport_data[1], gl.viewport_data[2], gl.viewport_data[3] );
		gl.enable(gl.SCISSOR_TEST);

		//clear buffer 
		gl.clearColor( camera.background_color[0], camera.background_color[1], camera.background_color[2], camera.background_color[3] );
		gl.clear( ( camera.clear_color ? gl.COLOR_BUFFER_BIT : 0) | (camera.clear_depth ? gl.DEPTH_BUFFER_BIT : 0) );

		gl.disable(gl.SCISSOR_TEST);
	},

	sortRenderInstances: function( camera, render_settings )
	{
		//nothing to do
		if(!render_settings.sort_instances_by_distance && !render_settings.sort_instances_by_priority)
			return;

		var opaque_instances = this._opaque_instances;
		var blend_instances = this._blend_instances;
		var instances = this._visible_instances;

		var camera_eye = camera.getEye();

		//process render instances (add stuff if needed)
		for(var i = 0, l = instances.length; i < l; ++i)
		{
			var instance = instances[i];
			if(!instance)
				continue;
			instance._dist = vec3.dist( instance.center, camera_eye );
		}

		//sort opaque from far to near, and blend from far to near
		if(render_settings.sort_instances_by_distance) 
		{
			opaque_instances.sort(this._sort_near_to_far_func);
			blend_instances.sort(this._sort_far_to_near_func);
		}

		 //sort by priority (we do this before merging because otherwise the distance sorting gets messed up
		if(render_settings.sort_instances_by_priority)
		{
			opaque_instances.sort(this._sort_by_priority_and_near_to_far_func);
			blend_instances.sort(this._sort_by_priority_and_far_to_near_func);
		}

		//merge them into a single final container
		this._visible_instances = opaque_instances.concat( blend_instances );
	},

	//sorting functions used to sort RenderInstances before rendering
	_sort_far_to_near_func: function(a,b) { return b._dist - a._dist; },
	_sort_near_to_far_func: function(a,b) { return a._dist - b._dist; },
	_sort_by_priority_func: function(a,b) { return b.priority - a.priority; },
	_sort_by_priority_and_near_to_far_func: function(a,b) { var r = b.priority - a.priority; return r ? r : (a._dist - b._dist) },
	_sort_by_priority_and_far_to_near_func: function(a,b) { var r = b.priority - a.priority; return r ? r : (b._dist - a._dist) },
	
	/**
	* To set gl state to a known and constant state in every render pass
	*
	* @method resetGLState
	* @param {RenderSettings} render_settings
	*/
	resetGLState: function( render_settings )
	{
		render_settings = render_settings || this._current_render_settings;

		gl.enable( gl.CULL_FACE );
		if(render_settings.depth_test)
			gl.enable( gl.DEPTH_TEST );
		else
			gl.disable( gl.DEPTH_TEST );
		gl.disable( gl.BLEND );
		gl.depthFunc( gl.LESS );
		gl.depthMask(true);
		gl.frontFace(gl.CCW);
		gl.blendFunc( gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA );
		//gl.lineWidth(1);
	},

	/**
	* Calls the render method for every RenderInstance (it also takes into account events and frustrum culling)
	*
	* @method renderInstances
	* @param {RenderSettings} render_settings
	* @param {Array} instances array of RIs, if not specified the last visible_instances are rendered
	*/
	renderInstances: function( render_settings, instances )
	{
		var scene = this._current_scene;
		if(!scene)
		{
			console.warn("LS.Renderer.renderInstances: no scene found");
			return 0;
		}

		var pass = this._current_pass;
		var camera = this._current_camera;
		var camera_index_flag = camera._rendering_index != -1 ? (1<<(camera._rendering_index)) : 0;
		var apply_frustum_culling = render_settings.frustum_culling;
		var frustum_planes = camera.updateFrustumPlanes();
		var layers_filter = camera.layers;
		if( render_settings.layers !== undefined )
			layers_filter = render_settings.layers;

		LEvent.trigger( scene, "beforeRenderInstances", render_settings );
		scene.triggerInNodes( "beforeRenderInstances", render_settings );

		//compute global scene info
		this.fillSceneShaderQuery( scene, render_settings );
		this.fillSceneShaderUniforms( scene, render_settings );

		//reset state of everything!
		this.resetGLState( render_settings );

		//this.updateVisibleInstances(scene,options);
		var render_instances = instances || this._visible_instances;

		LEvent.trigger( scene, "renderInstances", render_settings );
		LEvent.trigger( this, "renderInstances", render_settings );

		//reset again!
		this.resetGLState( render_settings );

		var render_instance_func = pass.render_instance;
		if(!render_instance_func)
			return 0;

		//compute visibility pass
		for(var i = 0, l = render_instances.length; i < l; ++i)
		{
			//render instance
			var instance = render_instances[i];
			var node_flags = instance.node.flags;
			instance._is_visible = false;

			//hidden nodes
			if( pass.id == SHADOW_PASS && !(instance.flags & RI_CAST_SHADOWS) )
				continue;
			if( pass.id == PICKING_PASS && node_flags.selectable === false )
				continue;
			if( (layers_filter & instance.layers) === 0 )
				continue;

			//done here because sometimes some nodes are moved in this action
			if(instance.onPreRender)
				if( instance.onPreRender( render_settings ) === false)
					continue;

			if(instance.material.opacity <= 0) //TODO: remove this, do it somewhere else
				continue;

			//test visibility against camera frustum
			if(apply_frustum_culling && !(instance.flags & RI_IGNORE_FRUSTUM))
			{
				if(geo.frustumTestBox( frustum_planes, instance.aabb ) == CLIP_OUTSIDE )
					continue;
			}

			//save visibility info
			instance._is_visible = true;
			if(camera_index_flag) //shadowmap cameras dont have an index
				instance._camera_visibility |= camera_index_flag;
		}

		var start = this._rendered_instances;

		//for each render instance
		for(var i = 0, l = render_instances.length; i < l; ++i)
		{
			//render instance
			var instance = render_instances[i];

			if(!instance._is_visible || !instance.mesh)
				continue;

			this._rendered_instances += 1;

			//choose the appropiate render pass
			render_instance_func.call( this, instance, render_settings ); //by default calls renderColorInstance but it could call renderShadowPassInstance

			//some instances do a post render action
			if(instance.onPostRender)
				instance.onPostRender( render_settings );
		}

		LEvent.trigger( scene, "renderScreenSpace", render_settings);

		//restore state
		this.resetGLState( render_settings );

		LEvent.trigger( scene, "afterRenderInstances", render_settings);
		scene.triggerInNodes("afterRenderInstances", render_settings);

		//and finally again
		this.resetGLState( render_settings );

		return this._rendered_instances - start;
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
			if( (light._root.layers & instance.layers) == 0 || (light._root.layers & this._current_camera.layers) == 0)
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

	//this function is in charge of rendering the regular color pass (used also for reflections)
	renderColorPassInstance: function( instance, render_settings )
	{
		//render instance
		var renderered = false;
		if( instance.material && instance.material.renderInstance )
			renderered = instance.material.renderInstance( instance, render_settings );

		//render using default system (slower but it works)
		if(!renderered)
			this.renderStandardColorMultiPassLightingInstance( instance, render_settings );
	},

	//this function is in charge of rendering an instance in the shadowmap
	renderShadowPassInstance: function( instance, render_settings )
	{
		//render instance
		var renderered = false;
		if( instance.material && instance.material.renderShadowInstance )
			renderered = instance.material.renderShadowInstance( instance, render_settings );

		//render using default system (slower but it works)
		if(!renderered)
			this.renderStandardShadowPassInstance( instance, render_settings);
	},


	/**
	* Renders the RenderInstance taking into account all the lights that affect it and doing a render for every light
	* This function it is not as fast as I would like but enables lots of interesting features
	*
	* @method renderColorMultiPassLightingInstance
	* @param {RenderInstance} instance
	* @param {RenderSettings} render_settings
	* @param {Array} lights array containing al the lights affecting this RI
	*/
	renderStandardColorMultiPassLightingInstance: function( instance, render_settings )
	{
		var camera = this._current_camera;
		var node = instance.node;
		var material = instance.material;
		var scene = this._current_scene;
		var renderer_uniforms = this._render_uniforms;
		var instance_final_query = instance._final_query;
		var lights = this.getNearLights( instance, this._near_lights );

		//compute matrices
		var model = instance.matrix;

		renderer_uniforms.u_model = model; 
		renderer_uniforms.u_normal_model = instance.normal_matrix; 

		//FLAGS: enable GL flags like cull_face, CCW, etc
		this.enableInstanceFlags(instance, render_settings);

		//set blend flags
		if(material.blend_mode !== Blend.NORMAL)
		{
			gl.enable( gl.BLEND );
			if(instance.blend_func)
				gl.blendFunc( instance.blend_func[0], instance.blend_func[1] );
		}
		else
			gl.disable( gl.BLEND );

		//merge all samplers
		var samplers = [];
		this.mergeSamplers([ scene._samplers, material._samplers, instance.samplers ], samplers);

		//enable samplers and store where [TODO: maybe they are not used..., improve here]
		this.bindSamplers( samplers );

		//find shader name
		var shader_name = render_settings.default_shader_id;
		if(render_settings.low_quality)
			shader_name = render_settings.default_low_shader_id;
		if( material.shader_name )
			shader_name = material.shader_name;

		//multi pass instance rendering
		var num_lights = lights.length;

		//no lights rendering (flat light)
		var ignore_lights = node.flags.ignore_lights || !!(instance.flags & RI_IGNORE_LIGHTS) || render_settings.lights_disabled;
		if(!num_lights || ignore_lights)
		{
			var query = new LS.ShaderQuery( shader_name, { FIRST_PASS:"", LAST_PASS:"", USE_AMBIENT_ONLY:"" });
			query.add( scene._query );
			query.add( camera._query );
			query.add( instance_final_query ); //contains node, material and instance macros

			if( ignore_lights )
				query.setMacro( "USE_IGNORE_LIGHTS" );
			if(render_settings.clipping_plane && !(instance.flags & RI_IGNORE_CLIPPING_PLANE) )
				query.setMacro( "USE_CLIPPING_PLANE" );

			if( material.onModifyQuery )
				material.onModifyQuery( query );

			//resolve the shader
			var shader = ShadersManager.resolve( query );

			//assign uniforms
			shader.uniformsArray( [ scene._uniforms, camera._uniforms, material._uniforms, renderer_uniforms, instance.uniforms ] );

			if(instance.flags & RI_IGNORE_VIEWPROJECTION)
				shader.setUniform("u_viewprojection", mat4.IDENTITY );

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
			query.add( scene._query );

			var light_query = light.getQuery( instance, render_settings );
			if(iLight === 0)
				query.setMacro("FIRST_PASS");
			if(iLight === (num_lights-1))
				query.setMacro("LAST_PASS");

			query.add( light_query );
			query.add( instance_final_query ); //contains node, material and instance macros

			if(render_settings.clipping_plane && !(instance.flags & RI_IGNORE_CLIPPING_PLANE) )
				query.setMacro("USE_CLIPPING_PLANE");

			if( material.onModifyQuery )
				material.onModifyQuery( query );

			var shader = LS.ShadersManager.resolve( query );

			//light textures like shadowmap or projective texture
			this.bindSamplers( light._samplers );

			//secondary pass flags to make it additive
			if(iLight > 0)
			{
				gl.enable(gl.BLEND);
				gl.blendFunc( gl.SRC_ALPHA, gl.ONE );
				if(render_settings.depth_test)
				{
					gl.depthFunc( gl.LEQUAL );
					//gl.depthMask(true);
					if( node.flags.depth_test )
						gl.enable( gl.DEPTH_TEST );
					else
						gl.disable( gl.DEPTH_TEST );
				}
			}
			//set depth func
			if(material.depth_func)
				gl.depthFunc( gl[material.depth_func] );

			//assign uniforms
			shader.uniformsArray( [ scene._uniforms, camera._uniforms, light._uniforms, material._uniforms, renderer_uniforms, instance.uniforms ] );

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
	* @param {RenderSettings} render_settings
	*/
	renderStandardShadowPassInstance: function( instance, render_settings )
	{
		var scene = this._current_scene;
		var camera = this._current_camera;
		var node = instance.node;
		var material = instance.material;
		var scene = this._current_scene;
		var renderer_uniforms = this._render_uniforms;

		//compute matrices
		var model = instance.matrix;

		renderer_uniforms.u_model = model; 
		renderer_uniforms.u_normal_model = instance.normal_matrix; 

		var instance_final_query = instance._final_query;

		//FLAGS
		this.enableInstanceFlags( instance, render_settings );

		var query = new ShaderQuery("depth");
		query.add( scene._query );
		query.add( instance_final_query ); //final = node + material + instance

		//not fully supported yet
		/*
		if(material.alpha_test_shadows == true )
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
		*/

		var shader = ShadersManager.resolve( query );

		var samplers = [];
		this.mergeSamplers([ material._samplers, instance.samplers ], samplers);
		this.bindSamplers( samplers );

		shader.uniformsArray([ scene._uniforms, camera._uniforms, renderer_uniforms, material._uniforms, instance.uniforms ]);

		instance.render(shader);
		this._rendercalls += 1;
	},

	/**
	* Render instance into the picking buffer
	*
	* @method renderPickingInstance
	* @param {RenderInstance} instance
	* @param {RenderSettings} render_settings
	*/
	renderPickingPassInstance: function( instance, render_settings )
	{
		var scene = this._current_scene;
		var camera = this._current_camera;
		var node = instance.node;
		var material = instance.material;
		var model = instance.matrix;
		var renderer_uniforms = this._render_uniforms;

		renderer_uniforms.u_model = model; 
		renderer_uniforms.u_normal_model = instance.normal_matrix; 

		var pick_color = LS.Picking.getNextPickingColor( node );

		var query = new LS.ShaderQuery("flat");
		query.add( scene._query );
		query.add( instance._final_query );

		var shader = ShadersManager.resolve( query );
		shader.uniformsArray([ scene._uniforms, camera._uniforms, material._uniforms, renderer_uniforms, instance.uniforms ]);
		shader.uniforms({ u_material_color: pick_color });

		instance.render( shader );
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
			else
				continue;

			if(tex.constructor === String)
				tex = LS.ResourcesManager.textures[ tex ];
			if(!tex)
				tex = this._missing_texture;

			if(tex._locked) //locked textures are usually the render target where we are rendering right now, so we cannot read and write at the same texture
				tex = this._missing_texture;

			tex.bind( i );
			this._active_samples[i] = tex;

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
	},

	/**
	* Update the scene shader query according to the render pass
	* Do not reuse the query, they change between rendering passes (shadows, reflections, etc)
	*
	* @method fillSceneShaderQuery
	* @param {SceneTree} scene
	* @param {RenderSettings} render_settings
	*/
	fillSceneShaderQuery: function( scene, render_settings )
	{
		var query = new LS.ShaderQuery();

		//camera info
		if( this._current_pass.id == COLOR_PASS )
		{
			if(render_settings.linear_pipeline)
				query.setMacro("USE_LINEAR_PIPELINE");
		}

		if(this._current_renderframe && this._current_renderframe.use_extra_texture && gl.extensions["WEBGL_draw_buffers"])
			query.setMacro("USE_DRAW_BUFFERS");

		//so components can add stuff (like Fog, etc)
		LEvent.trigger( scene, "fillSceneQuery", query );

		scene._query = query;
	},

	//Called at the beginning of renderInstances (once per renderFrame)
	//DO NOT CACHE, parameters can change between render passes
	fillSceneShaderUniforms: function( scene, render_settings )
	{
		//global uniforms
		var uniforms = {
			u_point_size: this.default_point_size,
			u_time: scene._time || getTime() * 0.001,
			u_ambient_light: scene.info.ambient_color,
			u_viewport: gl.viewport_data
		};

		if(render_settings.clipping_plane)
			uniforms.u_clipping_plane = render_settings.clipping_plane;

		if( this._current_pass.id == COLOR_PASS && render_settings.linear_pipeline )
			uniforms.u_gamma = 2.2;

		scene._uniforms = uniforms;
		scene._samplers = scene._samplers || [];
		scene._samplers.length = 0;

		for(var i in scene.info.textures)
		{
			var texture = LS.getTexture( scene.info.textures[i] );
			if(!texture)
				continue;

			var slot = 0;
			if( i == "environment" )
				slot = LS.Renderer.ENVIRONMENT_TEXTURE_SLOT;
			else if( i == "irradiance" )
				slot = LS.Renderer.IRRADIANCE_TEXTURE_SLOT;
			else
				continue; 

			var type = (texture.texture_type == gl.TEXTURE_2D ? "_texture" : "_cubemap");
			if(texture.texture_type == gl.TEXTURE_2D)
			{
				texture.bind(0);
				texture.setParameter( gl.TEXTURE_MIN_FILTER, gl.LINEAR ); //avoid artifact
			}
			scene._samplers[ slot ] = texture;
			scene._uniforms[ i + type ] = slot;
			scene._query.macros[ "USE_" + (i + type).toUpperCase() ] = "uvs_polar_reflected";
		}

		LEvent.trigger( scene, "fillSceneUniforms", scene._uniforms );
	},	

	/**
	* Switch WebGL flags according to the RenderInstance flags
	*
	* @method enableInstanceFlags
	* @param {RenderInstance} instance
	* @param {RenderSettings} render_settings
	*/
	enableInstanceFlags: function(instance, render_settings)
	{
		var flags = instance.flags;

		//backface culling
		if( flags & RI_CULL_FACE )
			gl.enable( gl.CULL_FACE );
		else
			gl.disable( gl.CULL_FACE );

		//  depth
		if(render_settings.depth_test)
		{
			gl.depthFunc( gl.LEQUAL );
			if( flags & RI_DEPTH_TEST )
				gl.enable( gl.DEPTH_TEST );
			else
				gl.disable( gl.DEPTH_TEST );

			if(flags & RI_DEPTH_WRITE)
				gl.depthMask(true);
			else
				gl.depthMask(false);
		}

		//when to reverse the normals?
		var order = gl.CCW;
		if(flags & RI_CW)
			order = gl.CW;
		if(render_settings.reverse_backfacing)
			order = order == gl.CW ? gl.CCW : gl.CW;
		gl.frontFace(order);
	},


	/**
	* Collects and process the rendering instances, cameras and lights that are visible
	* Its a prepass shared among all rendering passes
	* Warning: rendering order is computed here, so it is shared among all the cameras (TO DO, move somewhere else)
	*
	* @method processVisibleData
	* @param {SceneTree} scene
	* @param {RenderSettings} render_settings
	* @param {Array} cameras in case you dont want to use the scene cameras
	*/
	processVisibleData: function( scene, render_settings, cameras )
	{
		//options = options || {};
		//options.scene = scene;

		//update info about scene (collecting it all or reusing the one collected in the frame before)
		if( this._frame % this._collect_frequency == 0)
			scene.collectData();
		else
			scene.updateCollectedData();
		LEvent.trigger( scene, "afterCollectData", scene );

		cameras = cameras || scene._cameras;

		//prepare cameras
		for(var i = 0, l = cameras.length; i < l; ++i)
		{
			var camera = cameras[i];
			camera._rendering_index = i;
			camera.prepare();
		}

		//meh!
		if(!this._main_camera)
		{
			if( cameras.length )
				this._main_camera = cameras[0];
			else
				this._main_camera = new LS.Camera(); // ??
		}

		var opaque_instances = [];
		var blend_instances = [];
		var materials = {}; //I dont want repeated materials here

		var instances = scene._instances;
		var camera = this._main_camera; // || scene.getCamera();
		var camera_eye = camera.getEye();

		//process render instances (add stuff if needed)
		for(var i = 0, l = instances.length; i < l; ++i)
		{
			var instance = instances[i];
			if(!instance)
				continue;
			var node_flags = instance.node.flags;

			if(!instance.mesh)
			{
				console.warn("RenderInstance must have mesh");
				continue;
			}

			//materials
			if(!instance.material)
				instance.material = this.default_material;
			materials[ instance.material.uid ] = instance.material;

			//add extra info
			instance._dist = vec3.dist( instance.center, camera_eye );

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

			//check if it has alpha, and put in right container
			if(instance.flags & RI_BLEND)
				blend_instances.push(instance);
			else
				opaque_instances.push(instance);

			//node & mesh constant information
			var query = instance.query;
			if(instance.flags & RI_ALPHA_TEST || instance.material.alpha_test)
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

			instance._camera_visibility = 0|0;
		}

		//update materials info only if they are in use
		if(render_settings.update_materials)
			this._prepareMaterials( materials, scene );

		//pack all macros, uniforms, and samplers relative to this instance in single containers
		for(var i = 0, l = instances.length; i < l; ++i)
		{
			var instance = instances[i];
			var node = instance.node;
			var material = instance.material;
			instance.index = i;

			var query = instance._final_query;
			query.clear();
			query.add( node._query );
			query.add( material._query );
			query.add( instance.query );
		}

		//store all the info
		this._opaque_instances = opaque_instances;
		this._blend_instances = blend_instances;

		this._visible_instances = this._opaque_instances.concat( this._blend_instances );
		this._visible_lights = scene._lights;
		this._visible_cameras = cameras; 
		this._visible_materials = materials;

		//prepare lights (collect data and generate shadowmaps)
		for(var i = 0, l = this._visible_lights.length; i < l; ++i)
			this._visible_lights[i].prepare( render_settings );
	},

	//outside of processVisibleData to allow optimizations in processVisibleData
	_prepareMaterials: function( materials, scene )
	{
		for(var i in materials)
		{
			var material = materials[i];
			material.prepareMaterial( scene );
		}
	},

	/**
	* Renders a frame into a texture (could be a cubemap, in which case does the six passes)
	*
	* @method renderInstancesToRT
	* @param {Camera} cam
	* @param {Texture} texture
	* @param {RenderSettings} render_settings
	*/
	renderInstancesToRT: function( cam, texture, render_settings )
	{
		render_settings = render_settings || this.default_render_settings;
		this._current_target = texture;
		var scene = LS.Renderer._current_scene;
		texture._locked = true;

		if(texture.texture_type == gl.TEXTURE_2D)
		{
			this.enableCamera(cam, render_settings);
			texture.drawTo( inner_draw_2d );
		}
		else if( texture.texture_type == gl.TEXTURE_CUBE_MAP)
			this.renderToCubemap( cam.getEye(), texture.width, texture, render_settings, cam.near, cam.far );
		this._current_target = null;
		texture._locked = false;

		function inner_draw_2d()
		{
			LS.Renderer.clearBuffer( cam, render_settings );
			/*
			gl.clearColor(cam.background_color[0], cam.background_color[1], cam.background_color[2], cam.background_color[3] );
			if(render_settings.ignore_clear != true)
				gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
			*/
			//render scene
			LS.Renderer.renderInstances( render_settings );
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
	renderToCubemap: function( position, size, texture, render_settings, near, far, background_color )
	{
		size = size || 256;
		near = near || 1;
		far = far || 1000;

		var eye = position;
		if( !texture || texture.constructor != GL.Texture)
			texture = null;

		var scene = this._current_scene;

		texture = texture || new GL.Texture(size,size,{texture_type: gl.TEXTURE_CUBE_MAP, minFilter: gl.NEAREST});
		this._current_target = texture;
		texture.drawTo( function(texture, side) {

			var info = LS.Camera.cubemap_camera_parameters[side];
			if(texture._is_shadowmap || !background_color )
				gl.clearColor(0,0,0,0);
			else
				gl.clearColor( background_color[0], background_color[1], background_color[2], background_color[3] );
			gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
			var cubemap_cam = new LS.Camera({ eye: eye, center: [ eye[0] + info.dir[0], eye[1] + info.dir[1], eye[2] + info.dir[2]], up: info.up, fov: 90, aspect: 1.0, near: near, far: far });

			LS.Renderer.enableCamera( cubemap_cam, render_settings, true );
			LS.Renderer.renderInstances( render_settings );
		});

		this._current_target = null;
		return texture;
	},

	/**
	* Renders the material preview to an image (or to the screen)
	*
	* @method renderMaterialPreview
	* @param {Material} material
	* @param {number} size image size
	* @param {Object} options could be environment_texture, to_viewport
	* @return {Image} the preview image (in canvas format) or null if it was rendered to the viewport
	*/
	renderMaterialPreview: function( material, size, options )
	{
		options = options || {};

		//create scene
		var scene = this._material_scene;
		if(!scene)
		{
			scene = this._material_scene = new LS.SceneTree();
			scene.root.camera.background_color.set([0.0,0.0,0.0,0]);
			if(options.environment_texture)
				scene.info.textures.environment = options.environment_texture;
			var node = new LS.SceneNode( "sphere" );
			var compo = new LS.Components.GeometricPrimitive( { size: 40, subdivisions: 50, geometry: LS.Components.GeometricPrimitive.SPHERE } );
			node.addComponent( compo );
			scene.root.addChild( node );
		}

		if(options.background_color)
			scene.root.camera.background_color.set(options.background_color);

		var node = scene.getNode( "sphere");
		if(!node)
		{
			console.error("Node not found in Material Preview Scene");
			return null;
		}

		if(options.rotate)
			node.transform.rotateY( options.rotate );

		node.material = material;

		if(options.to_viewport)
		{
			LS.Renderer.renderFrame( scene.root.camera, { skip_viewport: true, render_helpers: false, update_materials: true }, scene );
			return;
		}

		var tex = this._material_preview_texture || new GL.Texture(size,size);
		if(!this._material_preview_texture)
			this._material_preview_texture = tex;

		tex.drawTo( function()
		{
			//it already clears everything
			//just render
			LS.Renderer.renderFrame( scene.root.camera, { skip_viewport: true, render_helpers: false }, scene );
		});

		var canvas = tex.toCanvas(null, true);
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
	},

	/**
	* Sets the render pass to use, this allow to change between "color","shadow","picking",etc
	*
	* @method setRenderPass
	* @param {String} name name of the render pass as in render_passes
	*/
	setRenderPass: function( name )
	{
		this._current_pass = this.render_passes[ name ] || this.render_passes[ "color" ];
	},

	/**
	* Register a render pass to be used during the rendering
	*
	* @method registerRenderPass
	* @param {String} name name of the render pass as in render_passes
	* @param {Object} info render pass info, { render_instance: Function( instance, render_settings ) }
	*/
	registerRenderPass: function( name, info )
	{
		info.name = name;
		this.render_passes[ name ] = info;
		if(!this._current_pass)
			this._current_pass = info;
	}
};

//Add to global Scope
LS.Renderer = Renderer;
