
/**
* Allows to render 2d canvas primitives, but they are rendered into a plane that can be positioned in 3D space.
* It also supports to store the texture so it can be used in another material.
*
* To fill the canvas you must have a Script in the same node, that contains a method called OnRenderCanvas
* @class Canvas3D
* @namespace LS.Components
* @constructor
* @param {String} object to configure from
*/
function Canvas3D(o)
{
	this.enabled = true;

	this.mode = 1;
	this.width = 512;
	this.height = 512;
	this.to_texture = null;
	this.visible = true;
	this.filter = true;

	this._texture = null;
	this._fbo = null;
	this._RI = null;
	this._material = null;

	if(o)
		this.configure(o);
}

Canvas3D.icon = "mini-icon-brush.png";

Canvas3D.MODE_CANVAS2D = 1;
Canvas3D.MODE_WEBGL = 2;
Canvas3D.MODE_IMMEDIATE = 3; //not supported yet

Canvas3D["@mode"] = { type:"enum", values: { "Canvas2D":Canvas3D.MODE_CANVAS2D, "WebGL":Canvas3D.MODE_WEBGL } };
Canvas3D["@width"] = { type:"number", step:1, precision:0 };
Canvas3D["@height"] = { type:"number", step:1, precision:0 };
Canvas3D["@to_texture"] = { type:"string" };

Canvas3D.prototype.onAddedToScene = function(scene)
{
	LEvent.bind(scene,"beforeRender",this.onRender,this);
}

Canvas3D.prototype.onRemovedFromScene = function(scene)
{
	LEvent.unbind(scene,"beforeRender",this.onRender,this);
}

Canvas3D.prototype.onAddedToNode = function( node )
{
	LEvent.bind( node, "collectRenderInstances", this.onCollectInstances, this );
}

Canvas3D.prototype.onRemovedFromNode = function( node )
{
	LEvent.unbind( node, "collectRenderInstances", this.onCollectInstances, this );
}

Canvas3D.prototype.onRender = function()
{
	if(!this.enabled)
		return;

	var w = this.width|0;
	var h = this.height|0;

	if( this.mode == Canvas3D.MODE_CANVAS2D )
	{
		if(!this._canvas)
			this._canvas = document.createElement("canvas");
		this._canvas.width = w;
		this._canvas.height = w;
	}

	if(this.mode != Canvas3D.MODE_IMMEDIATE)
	{
		if(!this._texture || this._texture.width != w || this._texture.height != h)
			this._texture = new GL.Texture(w,h,{ format: GL.RGBA, filter: GL.LINEAR, wrap: GL.CLAMP_TO_EDGE });
	}

	if( this.mode == Canvas3D.MODE_CANVAS2D )
	{
		var ctx = this._canvas.getContext("2d");
		ctx.clearRect(0,0,this._canvas.width,this._canvas.height); //clear
		this._root.processActionInComponents("onRenderCanvas",[ctx,this._canvas]);
		this._texture.uploadImage( this._canvas );
	}
	else if ( this.mode == Canvas3D.MODE_WEBGL )
	{
		var ctx = gl;
		if(!this._fbo)
			this._fbo = new GL.FBO();
		this._fbo.setTextures([this._texture]);
		this._fbo.bind();
		gl.start2D();
		gl.clearColor(0,0,0,0);
		gl.clear(GL.COLOR_BUFFER_BIT);
		this._root.processActionInComponents("onRenderCanvas",[ctx,this._texture]);
		gl.finish2D();
		this._fbo.unbind();
	}
	else //not implemented yet
	{
		//requires to support extra_projection in canvas2DtoWebGL which is not yet implemented
		return;
	}

	this._texture.setParameter( GL.MAG_FILTER, this.filter ? GL.LINEAR : GL.NEAREST );

	if(this.to_texture)
		LS.RM.registerResource( this.to_texture, this._texture );
}

Canvas3D.prototype.onCollectInstances = function(e,instances)
{
	if(!this.enabled || !this.visible)
		return;

	if(!this._RI)
		this._RI = new LS.RenderInstance();
	var RI = this._RI;
	if(!this._material)
		this._material = new LS.newStandardMaterial({ blend_mode: LS.Blend.ALPHA });
	this._material.setTexture("color", this._texture );
	var sampler = this._material.textures["color"];
	sampler.magFilter = this.filter ? GL.LINEAR : GL.NEAREST;

	RI.fromNode( this._root );
	RI.setMaterial( this._material );

	if(!this._mesh)
		this._mesh = GL.Mesh.plane();
	RI.setMesh(this._mesh);
	instances.push(RI);

	return instances;
}

LS.registerComponent( Canvas3D );