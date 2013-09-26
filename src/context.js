/**
* Context class allows to handle the app context easily without having to glue manually all events
* @namespace LS
* @class Context
* @constructor
* @param {Object} options settings for the webgl context creation
*/
function Context(options)
{
	options = options || {};
	this.gl = GL.create(options);
	this.canvas = this.gl.canvas;
	this.render_options = {};

	this.force_redraw = false;
	this.interactive = true;

	this.gl.ondraw = Context.prototype._ondraw.bind(this);
	this.gl.onupdate = Context.prototype._onupdate.bind(this);
	this.gl.onmousedown = Context.prototype._onmouse.bind(this);
	this.gl.onmousemove = Context.prototype._onmouse.bind(this);
	this.gl.onmouseup = Context.prototype._onmouse.bind(this);
	this.gl.onkey = Context.prototype._onkey.bind(this);

	gl.captureMouse();
	gl.captureKeys(true);
}

Context.prototype._ondraw = function()
{
	if(this.onPreDraw)
		this.onPreDraw();

	if(Scene._must_redraw || this.force_redraw )
	{
		LEvent.trigger(Scene, "pre_scene_render");
		Renderer.render(Scene, Scene.current_camera, this.render_options );
		LEvent.trigger(Scene, "post_scene_render");
	}

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
	if(e.type == "mousedown" && this.interactive )
	{
		var node = Renderer.getNodeAtCanvasPosition(Scene, e.mousex,e.mousey);
		this._clicked_node = node;
	}

	if(this._clicked_node && this._clicked_node.interactive)
	{
		e.scene_node = this._clicked_node;
		LEvent.trigger(Scene,e.type,e);
		LEvent.trigger(this._clicked_node,e.type,e);
	}

	if(e.type == "mouseup")
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

	LEvent.trigger(Scene,e.type,e);
}

LS.Context = Context;
