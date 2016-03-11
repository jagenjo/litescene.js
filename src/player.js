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
		LEvent.bind( LS.ResourcesManager, "start_loading_resources", (function(e,v){ this.loading_bar = 0.0; }).bind(this) );
		LEvent.bind( LS.ResourcesManager, "loading_resources_progress", (function(e,v){ 
			if( this.loading_bar < v )
				this.loading_bar = v;
		}).bind(this) );
		LEvent.bind( LS.ResourcesManager, "end_loading_resources", (function(e,v){ this.loading_bar = this._total_loading = undefined; }).bind(this) );
	}

	LS.Renderer.init();

	//this will repaint every frame and send events when the mouse clicks objects
	this.force_redraw = options.redraw || false;
	this.state = "playing";

	if( this.gl.ondraw )
		throw("There is already a litegl attached to this context");

	//bind all the events 
	this.gl.ondraw = LS.Player.prototype._ondraw.bind(this);
	this.gl.onupdate = LS.Player.prototype._onupdate.bind(this);
	this.gl.onmousedown = LS.Player.prototype._onmouse.bind(this);
	this.gl.onmousemove = LS.Player.prototype._onmouse.bind(this);
	this.gl.onmouseup = LS.Player.prototype._onmouse.bind(this);
	this.gl.onmousewheel = LS.Player.prototype._onmouse.bind(this);
	this.gl.onkeydown = LS.Player.prototype._onkey.bind(this);
	this.gl.onkeyup = LS.Player.prototype._onkey.bind(this);

	//capture input
	gl.captureMouse(true);
	gl.captureKeys(true);

	//launch render loop
	gl.animate();
}

/**
* Loads an scene and triggers start
* @method loadScene
* @param {String} url url to the JSON file containing all the scene info
* @param {Function} on_complete callback trigged when the scene and the resources are loaded
*/
Player.prototype.loadScene = function(url, on_complete)
{
	var that = this;
	var scene = this.scene;
	scene.load( url, inner_start );

	function inner_start()
	{
		//start playing once loaded the json
		if(that.autoplay)
			that.play();
		console.log("Scene playing");
		if(on_complete)
			on_complete();
	}
}

/**
* loads Scene from object or JSON
* @method setScene
* @param {Object} scene
* @param {Function} on_complete callback trigged when the scene and the resources are loaded
*/
Player.prototype.setScene = function( scene_info, on_complete )
{
	var that = this;
	var scene = this.scene;
	if(typeof(scene_info) == "string")
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
		scene.loadResources( inner_all_loaded );
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
	this.state = "paused";
}

Player.prototype.play = function()
{
	if(this.debug)
		console.log("Start");
	this.state = "playing";
	this.scene.start();
}

Player.prototype.stop = function()
{
	this.state = "stopped";
	this.scene.finish();
}

Player.prototype._ondraw = function()
{
	if(this.state != "playing")
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

	if(this.loading_bar !== undefined )
		this.renderLoadingBar();
}

Player.prototype._onupdate = function(dt)
{
	if(this.state != "playing")
		return;

	LS.Tween.update(dt);

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
	if(this.state != "playing")
		return;

	LEvent.trigger( this.scene, e.eventType, e );

	//hardcoded event handlers in the player
	if(this.onMouse)
		this.onMouse(e);
}

Player.prototype._onkey = function(e)
{
	if(this.state != "playing")
		return;

	//hardcoded event handlers in the player
	if(this.onKey)
	{
		var r = this.onKey(e);
		if(r) return;
	}

	LEvent.trigger( this.scene, e.eventType, e );
}

Player.prototype.renderLoadingBar = function()
{
	if(!window.enableWebGLCanvas)
		return;

	if( gl.canvas.canvas2DtoWebGL_enabled )
		enableWebGLCanvas( gl.canvas );

	gl.start2D();
	var y = 0;//gl.drawingBufferHeight - 6;
	gl.fillStyle = [0,0,0,0.5];
	gl.fillRect( 0, y, gl.drawingBufferWidth, 6);
	gl.fillColor = this.loadingbar_color || [0.9,0.5,1.0,1.0];
	gl.fillRect(0,y,gl.drawingBufferWidth * this.loading_bar,6);
	gl.finish2D();
}

Player.prototype.enableDebug = function()
{
	LS.Script.catch_important_exceptions = false;
	LS.catch_exceptions = false;
}

LS.Player = Player;
