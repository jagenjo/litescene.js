/**
* This component allow to create basic FX applied to the whole scene
* @class GlobalFX
* @param {Object} o object with the serialized info
*/
function GlobalFX(o)
{
	this.enabled = true;

	this.fx = new LS.TextureFX( o ? o.fx : null );

	this.use_viewport_size = true;
	this.use_high_precision = false;
	this.use_antialiasing = false;

	if(o)
		this.configure(o);
}

GlobalFX.icon = "mini-icon-fx.png";

Object.defineProperty( GlobalFX.prototype, "use_antialiasing", { 
	set: function(v) { this.fx.apply_fxaa = v; },
	get: function() { return this.fx.apply_fxaa; },
	enumerable: true
});

GlobalFX.prototype.configure = function(o)
{
	this.enabled = !!o.enabled;
	this.use_viewport_size = !!o.use_viewport_size;
	this.use_high_precision = !!o.use_high_precision;
	if(o.fx)
		this.fx.configure(o.fx);
}

GlobalFX.prototype.serialize = function()
{
	return { 
		enabled: this.enabled,
		use_high_precision: this.use_high_precision,
		use_viewport_size: this.use_viewport_size,
		fx: this.fx.serialize()
	};
}

GlobalFX.prototype.getResources = function(res)
{
	//TODO
	return res;
}

GlobalFX.prototype.addFX = function( name )
{
	this.fx.addFX(name);
}

GlobalFX.prototype.getFX = function(index)
{
	return this.fx.getFX( index );
}

GlobalFX.prototype.moveFX = function( fx, offset )
{
	return this.fx.moveFX(fx,offset);
}

GlobalFX.prototype.removeFX = function( fx )
{
	return this.fx.removeFX( fx );
}

GlobalFX.prototype.onAddedToScene = function( scene )
{
	LEvent.bind( scene, "enableFrameBuffer", this.onBeforeRender, this );
	LEvent.bind( scene, "showFrameBuffer", this.onAfterRender, this );
}

GlobalFX.prototype.onRemovedFromScene = function( scene )
{
	LEvent.unbind( scene, "enableFrameBuffer", this.onBeforeRender, this );
	LEvent.unbind( scene, "showFrameBuffer", this.onAfterRender, this );
}

//hook the RFC
GlobalFX.prototype.onBeforeRender = function(e, render_settings)
{
	if(!this.enabled)
		return;

	this.enableGlobalFBO( render_settings );
}

GlobalFX.prototype.onAfterRender = function( e, render_settings )
{
	if(!this.enabled)
		return;
	this.showFBO();
}

GlobalFX.prototype.enableGlobalFBO = function( render_settings )
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

GlobalFX.prototype.showFBO = function()
{
	if(!this.enabled)
		return;

	this._renderFrameContainer.endFBO();

	if( this._viewport )
	{
		gl.setViewport( this._viewport );
		this.applyFX();
		gl.setViewport( this._renderFrameContainer._fbo._old_viewport );
	}
	else
		this.applyFX();
}

GlobalFX.prototype.applyFX = function()
{
	var RFC = this._renderFrameContainer;

	var color_texture = RFC.color_texture;
	var depth_texture = RFC.depth_texture;

	this.fx.apply_fxaa = this.use_antialiasing;
	this.fx.applyFX( color_texture, null, { depth_texture: depth_texture } );
}

LS.registerComponent( GlobalFX );