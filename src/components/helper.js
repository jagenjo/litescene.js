///@INFO: UNCOMMON
/**
* Spline allows to define splines in 3D
* @class Spline
* @constructor
* @param {Object} object to configure from
*/

function Helper( o )
{
	this.enabled = true;
	this.in_editor = true;
	this.in_player = false;
	this.type = Helper.CIRCLE;
	this.color = [1,1,1,1];
	this.size = 1;
	this.fill = false;
	this.always_on_top = true;
	this.vertical = true;

	this._is_visible = false;

	if(o)
		this.configure(o);
}

Helper["@color"] = { type: "vec4", step:0.01 };

Helper.CIRCLE = 1;
Helper.SQUARE = 2;

Helper["@subdivisions"] = { type: "number", step:1, min:1, max:100, precision:0 };
Helper["@type"] = { type: "enum", values: { circle: Helper.CIRCLE, square: Helper.SQUARE } };

Helper.prototype.onAddedToScene = function(scene)
{
	LEvent.bind( LS.Renderer, "renderHelpers", this.onRender, this );
}

Helper.prototype.onRemovedFromScene = function(scene)
{
	LEvent.unbind( LS.Renderer, "renderHelpers", this.onRender, this );
}

Helper.prototype.onRender = function( event, camera )
{
	if( !this.enabled || !((LS.Renderer._in_player && this.in_player) || (!LS.Renderer._in_player && this.in_editor)) )
	{
		this._is_visible = false;
		return;
	}

	this._is_visible = true;

	var node = this._root;
	if(!node || !node.visible || !node.transform)
		return;

	var m = node.transform.getGlobalMatrixRef();
	gl.enable( gl.BLEND );
	gl.blendFunc( gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA );
	this.renderHelper( m, this.color, this.fill );
	gl.disable( gl.BLEND );
}

Helper.prototype.renderHelper = function( model, color, fill )
{
	if(this.always_on_top)
		gl.disable( gl.DEPTH_TEST );

	gl.disable( gl.CULL_FACE );
	LS.Draw.push();
	LS.Draw.setMatrix( model );
	LS.Draw.setColor( color );
	if(this.type == Helper.CIRCLE )
		LS.Draw.renderCircle( this.size, 32, !this.vertical, fill );
	else if(this.type == Helper.SQUARE )
	{
		if(fill)
			LS.Draw.renderRectangle( this.size, this.size, !this.vertical, true );
		else
			LS.Draw.renderRectangle( this.size, this.size, !this.vertical );
			//LS.Draw.renderSolidBox( this.size, this.vertical ? this.size : 0, this.vertical ? 0 : this.size );
	}
	LS.Draw.pop();
	gl.enable( gl.CULL_FACE );
	gl.enable( gl.DEPTH_TEST );
}

Helper.prototype.renderPicking = function( ray )
{
	if(!this._is_visible)
		return;

	var model = this._root.transform.getGlobalMatrixRef(true);
	var color = LS.Picking.getNextPickingColor( { instance: this } );
	this.renderHelper( model, color, true );
}


LS.registerComponent( Helper );

