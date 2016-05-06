/**
* This component allow to create basic FX applied to the whole scene
* @class GlobalFX
* @param {Object} o object with the serialized info
*/
function GlobalFX(o)
{
	this.enabled = true;

	this.fx = new LS.TextureFX( o ? o.fx : null );
	this.frame = new LS.RenderFrameContext();
	this.use_antialiasing = false;
	this.shader_material = null;

	if(o)
		this.configure(o);
}

GlobalFX.icon = "mini-icon-fx.png";

GlobalFX.prototype.configure = function(o)
{
	this.enabled = !!o.enabled;
	this.use_viewport_size = !!o.use_viewport_size;
	this.use_antialiasing = !!o.use_antialiasing;
	this.shader_material = o.shader_material;
	if(o.fx)
		this.fx.configure( o.fx );
	if(o.frame)
		this.frame.configure( o.frame );
}

GlobalFX.prototype.serialize = function()
{
	return { 
		enabled: this.enabled,
		frame: this.frame.serialize(),
		shader_material: this.shader_material,
		use_antialiasing: this.use_antialiasing,
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
	LEvent.bind( scene, "enableFrameContext", this.onBeforeRender, this );
	LEvent.bind( scene, "showFrameContext", this.onAfterRender, this );
}

GlobalFX.prototype.onRemovedFromScene = function( scene )
{
	LEvent.unbind( scene, "enableFrameContext", this.onBeforeRender, this );
	LEvent.unbind( scene, "showFrameContext", this.onAfterRender, this );
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

	this.frame.enable( render_settings );
}

GlobalFX.prototype.showFBO = function()
{
	if(!this.enabled)
		return;

	this.frame.disable();

	if(this.shader_material)
	{
		var material = LS.ResourcesManager.getResource( this.shader_material );
		var rendered = false;
		if(material && material.constructor === LS.ShaderMaterial )
			rendered = material.applyToTexture( this.frame._color_texture );
		if(!rendered)
			this.frame._color_texture.toViewport(); //fallback in case the shader is missing
		return;
	}

	if( this._viewport )
	{
		gl.setViewport( this._viewport );
		this.applyFX();
		gl.setViewport( this.frame._fbo._old_viewport );
	}
	else
		this.applyFX();
}

GlobalFX.prototype.applyFX = function()
{
	var color_texture = this.frame._color_texture;
	var depth_texture = this.frame._depth_texture;

	this.fx.apply_fxaa = this.use_antialiasing;
	this.fx.filter = this.frame.filter_texture;
	this.fx.applyFX( color_texture, null, { depth_texture: depth_texture } );
}

LS.registerComponent( GlobalFX );