/**
* Context class allows to handle the app context easily without having to glue manually all events
	There is a list of options
	==========================
	- canvas: the canvas where the scene should be rendered, if not specified one will be created
	- container_id: string with container id where to create the canvas, width and height will be those from the container
	- width: the width for the canvas in case it is created without a container_id
	- height: the height for the canvas in case it is created without a container_id
	- resources: string with the path to the resources folder
	- shaders: string with the url to the shaders.xml file
	- redraw: boolean to force to render the scene constantly (useful for animated scenes)
	Optional callbacks to attach
	============================
	- onPreDraw: executed before drawing a frame
	- onDraw: executed after drawing a frame
	- onPreUpdate(dt): executed before updating the scene (delta_time as parameter)
	- onUpdate(dt): executed after updating the scene (delta_time as parameter)
	- onMouse(e): when a mouse event is triggered
	- onKey(e): when a key event is triggered
* @namespace LS
* @class Context
* @constructor
* @param {Object} options settings for the webgl context creation
*/
function Context(options)
{
	options = options || {};

	if(options.container_id)
	{
		var container = document.getElementById(options.container_id);
		if(container)
		{
			var canvas = document.createElement("canvas");
			canvas.width = container.offsetWidth;
			canvas.height = container.offsetHeight;
			container.appendChild(canvas);
			options.canvas = canvas;
		}
	}

	this.gl = GL.create(options);
	this.canvas = this.gl.canvas;
	this.render_options = {};

	if(options.resources)
		LS.ResourcesManager.path = options.resources;
	if(options.shaders)
		Shaders.init(options.shaders);

	this.force_redraw = options.redraw || false;
	this.interactive = true;

	this.gl.ondraw = Context.prototype._ondraw.bind(this);
	this.gl.onupdate = Context.prototype._onupdate.bind(this);
	this.gl.onmousedown = Context.prototype._onmouse.bind(this);
	this.gl.onmousemove = Context.prototype._onmouse.bind(this);
	this.gl.onmouseup = Context.prototype._onmouse.bind(this);
	this.gl.onmousewheel = Context.prototype._onmouse.bind(this);
	this.gl.onkeydown = Context.prototype._onkey.bind(this);
	this.gl.onkeyup = Context.prototype._onkey.bind(this);

	gl.captureMouse(true);
	gl.captureKeys(true);
	gl.animate();
}

/**
* Loads an scene and triggers start
* @method loadScene
* @param {String} url url to the JSON file containing all the scene info
* @param {Function} on_complete callback trigged when the scene and the resources are loaded
*/
Context.prototype.loadScene = function(url, on_complete)
{
	Scene.loadScene(url, inner_start);

	function inner_start()
	{
		Scene.start();
		if(on_complete)
			on_complete();
	}
}

Context.prototype._ondraw = function()
{
	if(this.onPreDraw)
		this.onPreDraw();

	if(Scene._must_redraw || this.force_redraw )
		Scene.render( Scene.getCamera(), this.render_options );

	if(this.onDraw)
		this.onDraw();
}

Context.prototype._onupdate = function(dt)
{
	if(this.onPreUpdate)
		this.onPreUpdate(dt);

	Scene.update(dt);

	if(this.onUpdate)
		this.onUpdate(dt);
}

//input
Context.prototype._onmouse = function(e)
{
	//trace(e);

	//check which node was clicked
	if(this.interactive && (e.eventType == "mousedown" || e.eventType == "mousewheel" ))
	{
		var node = Renderer.getNodeAtCanvasPosition(Scene, null, e.mousex,e.mousey);
		this._clicked_node = node;
	}

	var levent = null; //levent dispatched

	//send event to clicked node
	if(this._clicked_node && this._clicked_node.interactive)
	{
		e.scene_node = this._clicked_node;
		levent = LEvent.trigger(this._clicked_node,e.eventType,e);
	}

	//send event to root
	if(!levent || !levent.stop)
		LEvent.trigger(Scene.root,e.eventType,e);

	if(e.eventType == "mouseup")
		this._clicked_node = null;

	if(this.onMouse)
	{
		e.scene_node = this._clicked_node;
		var r = this.onMouse(e);
		if(r) return;
	}
}

Context.prototype._onkey = function(e)
{
	if(this.onKey)
	{
		var r = this.onKey(e);
		if(r) return;
	}

	LEvent.trigger(Scene,e.eventType,e);
}

LS.Context = Context;
