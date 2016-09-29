/**
* Player class allows to handle the app context easily without having to glue manually all events
	There is a list of options
	==========================
	- canvas: the canvas where the scene should be rendered, if not specified one will be created
	- container_id: string with container id where to create the canvas, width and height will be those from the container
	- width: the width for the canvas in case it is created without a container_id
	- height: the height for the canvas in case it is created without a container_id
	- resources: string with the path to the resources folder
	- shaders: string with the url to the shaders.xml file
	- proxy: string with the url where the proxy is located (useful to avoid CORS)
	- filesystems: object that contains the virtual file systems info { "VFS":"http://litefileserver.com/" } ...
	- redraw: boolean to force to render the scene constantly (useful for animated scenes)
	- autoresize: boolean to automatically resize the canvas when the window is resized
	- autoplay: boolean to automatically start playing the scene once the load is completed
	- loadingbar: boolean to show a loading bar
	- debug: boolean allows to render debug info like nodes and skeletons

	Optional callbacks to attach
	============================
	- onPreDraw: executed before drawing a frame
	- onDraw: executed after drawing a frame
	- onPreUpdate(dt): executed before updating the scene (delta_time as parameter)
	- onUpdate(dt): executed after updating the scene (delta_time as parameter)
	- onMouse(e): when a mouse event is triggered
	- onKey(e): when a key event is triggered
* @namespace LS
* @class Player
* @constructor
* @param {Object} options settings for the webgl context creation
*/
function Player(options)
{
	options = options || {};
	this.options = options;

	if(!options.canvas)
	{
		var container = options.container;
		if(options.container_id)
			container = document.getElementById(options.container_id);

		if(!container)
		{
			console.log("No container specified in LS.Player, using BODY as container");
			container = document.body;
		}

		//create canvas
		var canvas = document.createElement("canvas");
		canvas.width = container.offsetWidth;
		canvas.height = container.offsetHeight;
		if(!canvas.width) canvas.width = options.width || 1;
		if(!canvas.height) canvas.height = options.height || 1;
		container.appendChild(canvas);
		options.canvas = canvas;
	}

	this.debug = false;

	this.gl = GL.create(options); //create or reuse
	this.canvas = this.gl.canvas;
	this.render_settings = new LS.RenderSettings(); //this will be replaced by the scene ones.
	this.scene = LS.GlobalScene;
	this.autoplay = options.autoplay !== undefined ? options.autoplay : true;

	if(options.debug)
	{
		this.debug = true;
		this.enableDebug();
	}
	else
		LS.catch_exceptions = true;

	if(options.resources)
		LS.ResourcesManager.setPath( options.resources );
	else
		console.warn("LS: no resources path specified");

	LS.ShadersManager.init( options.shaders || "data/shaders.xml" );
	if(!options.shaders)
		console.warn("LS: no shaders folder specified, using default file.");

	if(options.proxy)
		LS.ResourcesManager.setProxy( options.proxy );
	if(options.filesystems)
	{
		for(var i in options.filesystems)
			LS.ResourcesManager.registerFileSystem( i, options.filesystems[i] );
	}

	if(options.autoresize)
	{
		window.addEventListener("resize", (function(){
			this.canvas.width = canvas.parentNode.offsetWidth;
			this.canvas.height = canvas.parentNode.offsetHeight;
		}).bind(this));
	}

	if(options.loadingbar)
	{
		this.loading = {
			visible: true,
			scene_loaded: 0,
			resources_loaded: 0
		};
		LEvent.bind( LS.ResourcesManager, "start_loading_resources", (function(e,v){ 
			this.loading.resources_loaded = 0.0; 
		}).bind(this) );
		LEvent.bind( LS.ResourcesManager, "loading_resources_progress", (function(e,v){ 
			if( this.loading.resources_loaded < v )
				this.loading.resources_loaded = v;
		}).bind(this) );
		LEvent.bind( LS.ResourcesManager, "end_loading_resources", (function(e,v){ 
			this._total_loading = undefined; 
			this.loading.resources_loaded = 1; 
			this.loading.visible = false;
		}).bind(this) );
	}

	LS.Renderer.init();

	//this will repaint every frame and send events when the mouse clicks objects
	this.force_redraw = options.redraw || false;
	this.state = LS.Player.STOPPED;

	if( this.gl.ondraw )
		throw("There is already a litegl attached to this context");

	if(options.debug_render)
		this.setDebugRender(true);

	//bind all the events 
	this.gl.ondraw = LS.Player.prototype._ondraw.bind(this);
	this.gl.onupdate = LS.Player.prototype._onupdate.bind(this);

	var mouse_event_callback = LS.Player.prototype._onmouse.bind(this);
	this.gl.onmousedown = mouse_event_callback;
	this.gl.onmousemove = mouse_event_callback;
	this.gl.onmouseup = mouse_event_callback;
	this.gl.onmousewheel = mouse_event_callback;

	var key_event_callback = LS.Player.prototype._onkey.bind(this);
	this.gl.onkeydown = key_event_callback;
	this.gl.onkeyup = key_event_callback;

	var gamepad_event_callback = LS.Player.prototype._ongamepad.bind(this);
	this.gl.ongamepadconnected = gamepad_event_callback;
	this.gl.ongamepaddisconnected = gamepad_event_callback;
	this.gl.ongamepadButtonDown = gamepad_event_callback;
	this.gl.ongamepadButtonUp = gamepad_event_callback;

	//capture input
	gl.captureMouse(true);
	gl.captureKeys(true);
	gl.captureGamepads(true);

	LS.Input.init();

	//launch render loop
	gl.animate();
}

Player.STOPPED = 0;
Player.PLAYING = 1;
Player.PAUSED = 2;

/**
* Loads an scene and triggers start
* @method loadScene
* @param {String} url url to the JSON file containing all the scene info
* @param {Function} on_complete callback trigged when the scene and the resources are loaded
*/
Player.prototype.loadScene = function(url, on_complete, on_progress)
{
	var that = this;
	var scene = this.scene;
	scene.load( url, null, null, inner_progress, inner_start );

	function inner_start()
	{
		//start playing once loaded the json
		if(that.autoplay)
			that.play();
		//console.log("Scene playing");
		that.loading = null;
		if(on_complete)
			on_complete();
	}

	function inner_progress(e)
	{
		if(that.loading === undefined)
			return;
		var partial_load = 0;
		if(e.total) //sometimes we dont have the total so we dont know the amount
			partial_load = e.loaded / e.total;
		that.loading.scene_loaded = partial_load;
		if(on_progress)
			on_progress(partial_load);
	}
}

/**
* loads Scene from object or JSON taking into account external and global scripts
* @method setScene
* @param {Object} scene
* @param {Function} on_complete callback trigged when the scene and the resources are loaded
*/
Player.prototype.setScene = function( scene_info, on_complete )
{
	var that = this;
	var scene = this.scene;
	if(scene_info && scene_info.constructor === String )
		scene_info = JSON.parse(scene_info);

	var scripts = LS.SceneTree.getScriptsList( scene_info );

	if( scripts && scripts.length )
	{
		scene.clear();
		scene.loadScripts( scripts, inner_external_ready );
	}
	else
		inner_external_ready();

	function inner_external_ready()
	{
		scene.configure( scene_info );
		scene.loadResources( inner_all_resources_loaded );
	}

	function inner_all_resources_loaded()
	{
		if( LS.ShadersManager.ready )
			inner_all_loaded();
		else
			LS.ShadersManager.on_ready = inner_all_loaded;
	}

	function inner_all_loaded()
	{
		if(that.autoplay)
			that.play();
		scene._must_redraw = true;
		console.log("Scene playing");
		if(on_complete)
			on_complete();
	}
}


Player.prototype.pause = function()
{
	this.state = LS.Player.PAUSED;
}

Player.prototype.play = function()
{
	if(this.state == LS.Player.PLAYING)
		return;
	if(this.debug)
		console.log("Start");
	this.state = LS.Player.PLAYING;
	LS.Input.reset(); //this force some events to be sent
	LS.GUI.reset(); //clear GUI
	this.scene.start();
}

Player.prototype.stop = function()
{
	this.state = LS.Player.STOPPED;
	this.scene.finish();
	LS.GUI.reset(); //clear GUI
}

Player.prototype._ondraw = function()
{
	if(this.state != LS.Player.PLAYING)
		return;

	if(this.onPreDraw)
		this.onPreDraw();

	var scene = this.scene;

	if(scene._must_redraw || this.force_redraw )
	{
		scene.render( scene.info ? scene.info.render_settings : this.render_settings );
	}

	if(this.onDraw)
		this.onDraw();

	if(this.loading && this.loading.visible )
		this.renderLoadingBar( this.loading );
}

Player.prototype._onupdate = function(dt)
{
	if(this.state != LS.Player.PLAYING)
		return;

	LS.Tween.update(dt);
	LS.Input.update(dt);

	if(this.onPreUpdate)
		this.onPreUpdate(dt);

	this.scene.update(dt);

	if(this.onUpdate)
		this.onUpdate(dt);

}

//input
Player.prototype._onmouse = function(e)
{
	//console.log(e);
	if(this.state != LS.Player.PLAYING)
		return;

	LEvent.trigger( this.scene, e.eventType || e.type, e );

	//hardcoded event handlers in the player
	if(this.onMouse)
		this.onMouse(e);
}

Player.prototype._onkey = function(e)
{
	if(this.state != LS.Player.PLAYING)
		return;

	//hardcoded event handlers in the player
	if(this.onKey)
	{
		var r = this.onKey(e);
		if(r)
			return;
	}

	LEvent.trigger( this.scene, e.eventType || e.type, e );
}

Player.prototype._ongamepad = function(e)
{
	if(this.state != LS.Player.PLAYING)
		return;

	//hardcoded event handlers in the player
	if(this.onGamepad)
	{
		var r = this.onGamepad(e);
		if(r)
			return;
	}

	LEvent.trigger( this.scene, e.eventType || e.type, e );
}

Player.prototype.renderLoadingBar = function( loading )
{
	if(!loading)
		return;

	if(!global.enableWebGLCanvas)
		return;

	if(!gl.canvas.canvas2DtoWebGL_enabled)
		enableWebGLCanvas( gl.canvas );

	gl.start2D();

	var y = 0;//gl.drawingBufferHeight - 6;
	gl.fillColor = [0,0,0,1];
	gl.fillRect( 0, y, gl.drawingBufferWidth, 8);
	//scene
	gl.fillColor = loading.bar_color || [0.5,0.9,1.0,1.0];
	gl.fillRect( 0, y, gl.drawingBufferWidth * loading.scene_loaded, 4 );
	//resources
	gl.fillColor = loading.bar_color || [0.9,0.5,1.0,1.0];
	gl.fillRect( 0, y + 4, gl.drawingBufferWidth * loading.resources_loaded, 4 );
	gl.finish2D();
}

Player.prototype.enableDebug = function()
{
	LS.Script.catch_important_exceptions = false;
	LS.catch_exceptions = false;
}

Player.prototype.setDebugRender = function(v)
{
	if(!this.debug_render)
	{
		if(!v)
			return;
		this.debug_render = new LS.DebugRender();
	}

	if(v)
		this.debug_render.enable();
	else
		this.debug_render.disable();
}


LS.Player = Player;
