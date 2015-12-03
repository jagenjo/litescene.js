/**
* This component allow to create basic FX
* @class CameraFX
* @param {Object} o object with the serialized info
*/
function CameraFX(o)
{
	this.enabled = true;

	this.fx = new LS.TextureFX( o ? o.fx : null );

	this.use_viewport_size = true;
	this.use_high_precision = false;
	this.use_node_camera = false;
	this.use_antialiasing = false;

	if(o)
		this.configure(o);
}

CameraFX.icon = "mini-icon-fx.png";

Object.defineProperty( CameraFX.prototype, "use_antialiasing", { 
	set: function(v) { this.fx.apply_fxaa = v; },
	get: function() { return this.fx.apply_fxaa; },
	enumerable: true
});

CameraFX.prototype.configure = function(o)
{
	this.enabled = !!o.enabled;
	this.use_viewport_size = !!o.use_viewport_size;
	this.use_high_precision = !!o.use_high_precision;
	this.use_node_camera = !!o.use_node_camera;
	if(o.fx)
		this.fx.configure(o.fx);
}

CameraFX.prototype.serialize = function()
{
	return { 
		enabled: this.enabled,
		use_high_precision: this.use_high_precision,
		use_viewport_size: this.use_viewport_size,
		use_node_camera: this.use_node_camera,
		fx: this.fx.serialize()
	};
}

CameraFX.prototype.getResources = function(res)
{
	//TODO
	return res;
}

CameraFX.prototype.addFX = function( name )
{
	this.fx.addFX(name);
}

CameraFX.prototype.getFX = function(index)
{
	return this.fx.getFX( index );
}

CameraFX.prototype.moveFX = function( fx, offset )
{
	return this.fx.moveFX(fx,offset);
}

CameraFX.prototype.removeFX = function( fx )
{
	return this.fx.removeFX( fx );
}

CameraFX.prototype.onAddedToScene = function( scene )
{
	LEvent.bind( scene, "enableFrameBuffer", this.onBeforeRender, this );
	LEvent.bind( scene, "showFrameBuffer", this.onAfterRender, this );
}

CameraFX.prototype.onRemovedFromScene = function( scene )
{
	LEvent.unbind( scene, "enableFrameBuffer", this.onBeforeRender, this );
	LEvent.unbind( scene, "showFrameBuffer", this.onAfterRender, this );
}

//hook the RFC
CameraFX.prototype.onBeforeRender = function(e, render_settings)
{
	if(!this.enabled)
	{
		if( this._binded_camera )
		{
			LEvent.unbindAll( this._binded_camera, this );
			this._binded_camera = null;
		}
		return;
	}

	//FBO for one camera
	if(this.use_node_camera)
	{
		var camera = this._root.camera;
		if(camera && camera != this._binded_camera)
		{
			if(this._binded_camera)
				LEvent.unbindAll( this._binded_camera, this );
			LEvent.bind( camera, "enableFrameBuffer", this.enableCameraFBO, this );
			LEvent.bind( camera, "showFrameBuffer", this.showCameraFBO, this );
		}
		this._binded_camera = camera;
		return;
	}
	else if( this._binded_camera )
	{
		LEvent.unbindAll( this._binded_camera, this );
		this._binded_camera = null;
	}

	this.enableGlobalFBO( render_settings );
}

CameraFX.prototype.onAfterRender = function(e, render_settings )
{
	if(!this.enabled)
		return;

	if(this.use_node_camera)
		return;

	this.showFBO();
}

CameraFX.prototype.enableCameraFBO = function(e, render_settings )
{
	if(!this.enabled)
		return;

	var RFC = this._renderFrameContainer;
	if(!RFC)
		RFC = this._renderFrameContainer = new LS.RenderFrameContainer();
	var camera = this._binded_camera;
	
	var viewport = this._viewport = camera.getLocalViewport( null, this._viewport );
	RFC.setSize( viewport[2], viewport[3] );
	RFC.use_high_precision = this.use_high_precision;
	RFC.preRender( render_settings );

	render_settings.ignore_viewports = true;
}

CameraFX.prototype.showCameraFBO = function(e, render_settings )
{
	if(!this.enabled)
		return;
	render_settings.ignore_viewports = false;
	this.showFBO();
}

CameraFX.prototype.enableGlobalFBO = function( render_settings )
{
	if(!this.enabled)
		return;

	var RFC = this._renderFrameContainer;
	if(!RFC)
		RFC = this._renderFrameContainer = new LS.RenderFrameContainer();

	//configure
	if(this.use_viewport_size)
		RFC.useCanvasSize();
	RFC.use_high_precision = this.use_high_precision;

	RFC.preRender( render_settings );
}

CameraFX.prototype.showFBO = function()
{
	if(!this.enabled)
		return;

	this._renderFrameContainer.endFBO();

	if(this.use_node_camera && this._viewport)
	{
		gl.setViewport( this._viewport );
		this.applyFX();
		gl.setViewport( this._renderFrameContainer._fbo._old_viewport );
	}
	else
		this.applyFX();
}

CameraFX.prototype.applyFX = function()
{
	var RFC = this._renderFrameContainer;

	var color_texture = RFC.color_texture;
	var depth_texture = RFC.depth_texture;

	this.fx.apply_fxaa = this.use_antialiasing;
	this.fx.applyFX( color_texture, null, { depth_texture: depth_texture } );
}

LS.registerComponent( CameraFX );