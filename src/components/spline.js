///@INFO: UNCOMMON
/**
* Spline allows to define splines in 3D
* @class Spline
* @constructor
* @param {Object} object to configure from
*/

function Spline( o )
{
	this.enabled = true;
	this._render_in_viewport = false;
	this.path = new LS.Path();
	this._must_update = false;
	this._subdivisions = 20;
	this.preserve_tangents = true; //for bezier

	if(o)
		this.configure(o);

	this._max_points = 1024;
	this._range = 0;
	this._middle_points = new Float32Array(3*1024);
}

Spline["@subdivisions"] = { type: "number", step:1, min:1, max:100, precision:0 };
Spline["@type"] = { type: "enum", values: { line: LS.LINEAR, bezier: LS.BEZIER, hermite: LS.HERMITE } };

Spline.prototype.serialize = function()
{
	return {
		enabled: this.enabled,
		render: this._render_in_viewport,
		path: this.path.serialize(),
		subs: this._subdivisions,
		tangents: this.preserve_tangents
	};
}

Spline.prototype.configure = function(o)
{
	this._must_update = true;
	this.enabled = o.enabled;
	this.render_in_viewport = o.render;
	this.path.configure( o.path );
	this.preserve_tangents = o.tangents;
	this._subdivisions = o.subs || 1;
}

Object.defineProperty( Spline.prototype, 'render_in_viewport', {
	get: function() { return this._render_in_viewport; },
	set: function(v) { 
		if(this._render_in_viewport == v)
			return;
		this._render_in_viewport = v;
		//set events
		if(!this._root)
			return;
		if(v)
			LEvent.bind( this._root, "collectRenderInstances", this.onCollectInstances, this );
		else
			LEvent.unbind( this._root, "collectRenderInstances", this.onCollectInstances, this );
	},
	enumerable: true
});

Object.defineProperty( Spline.prototype, 'subdivisions', {
	get: function() { return this._subdivisions; },
	set: function(v) { 
		this._subdivisions = v|0;
		this._must_update = true;
	},
	enumerable: true
});

Object.defineProperty( Spline.prototype, 'closed', {
	get: function() { return this.path.closed; },
	set: function(v) { 
		this.path.closed = v;
		this._must_update = true;
	},
	enumerable: true
});

Object.defineProperty( Spline.prototype, 'type', {
	get: function() { return this.path.type; },
	set: function(v) { 
		this.path.type = v;
		this._must_update = true;
	},
	enumerable: true
});

Object.defineProperty( Spline.prototype, 'numberOfPoints', {
	get: function() { return this.path.points.length; },
	set: function(v) { 
		throw("number of points cannot be set, use addPoint");
	},
	enumerable: false
});


Spline.prototype.onAddedToNode = function(node)
{
	if(this._render_in_viewport)
		LEvent.bind( node, "collectRenderInstances", this.onCollectInstances, this );
}

Spline.prototype.onRemovedFromNode = function(node)
{
	if(this._render_in_viewport)
		LEvent.unbind( node, "collectRenderInstances", this.onCollectInstances, this );
}

Spline.prototype.onCollectInstances = function(e, instances)
{
	if(!this.enabled)
		return;

	if(!this._root)
		return;

	if(this.path.getSegments() == 0)
		return;

	if(!this._mesh || this._must_update)
		this.updateMesh();

	var RI = this._render_instance;
	if(!RI)
		this._render_instance = RI = new LS.RenderInstance(this._root, this);

	RI.fromNode( this._root );
	RI.setMesh( this._mesh, gl.LINE_STRIP );
	RI.setRange( 0, this._range );
	RI.setMaterial( this._root.getMaterial() );

	instances.push(RI);	
}

Spline.prototype.updateMesh = function()
{
	if(!this._mesh)
		this._mesh = GL.Mesh.load( { vertices: new Float32Array( this._max_points * 3 ) } );
	
	var vertices_buffer = this._mesh.getVertexBuffer("vertices");
	var vertices_data = vertices_buffer.data;

	var total = 0;

	if( this.path.type == LS.LINEAR )
		total = this.path.getSegments() + 1;
	else
		total = this.path.getSegments() * this._subdivisions; //20 points per segment

	if(total > this._max_points)
		total = this._max_points;

	this.path.samplePointsTyped( total, vertices_data );
	vertices_buffer.uploadRange( 0, total * 4 * 3 );

	this._range = total;

	this._must_update = false;
}

Spline.prototype.clear = function()
{
	this._must_update = true;
	this.path.clear();
}

Spline.prototype.getPoint = function( f, out )
{
	out = out || vec3.create();

	if(this.path.closed) //cycle
	{
		f = f % 1;
		if(f < 0)
			f = 1 + f;
	}

	this.path.computePoint( f, out );

	if( this._root.transform )
	{
		var model = this._root.transform.getGlobalMatrix();
		mat4.multiplyVec3( out, model, out );
	}

	return out;
}


Spline.prototype.addPoint = function( point )
{
	if( this._root.transform )
	{
		var model = this._root.transform.getGlobalMatrix();
		mat4.invert(model,model);
		point = mat4.multiplyVec3( vec3.create(), model, point );
	}

	this.path.addPoint( point );
	this._must_update = true;
}

Spline.prototype.addPointLocal = function( point )
{
	this.path.addPoint( point );
	this._must_update = true;
}

// to render in the editor

Spline.prototype.renderEditor = function( is_selected )
{
	var path = this.path;

	if(path.points.length < 2)
		return;

	gl.disable( gl.DEPTH_TEST );
	LS.Draw.push();

	if( this._root.transform )
		LS.Draw.setMatrix( this._root.transform.getGlobalMatrixRef(true) );

	if(is_selected)
	{
		LS.Draw.setColor(0.9,0.5,0.9,1);
		LS.Draw.setPointSize( 9 );
		LS.Draw.renderRoundPoints( path.points );
	}

	if(this._render_in_viewport) //already rendered in the 
	{
		LS.Draw.pop();
		gl.enable( gl.DEPTH_TEST );
		return;
	}

	if(!this._mesh || this._must_update)
		this.updateMesh();

	if(!is_selected)
		LS.Draw.setColor(0.6,0.5,0.4,0.5);
	else
		LS.Draw.setColor(0.6,0.6,0.6,0.8);
	LS.Draw.renderMesh( this._mesh, GL.LINE_STRIP, null,null, 0, this._range );
	gl.enable( gl.DEPTH_TEST );
	LS.Draw.pop();
}

//used to allow the editor to edit the points ****************

Spline.prototype.renderPicking = function( ray )
{
	var model = this._root.transform.getGlobalMatrixRef(true);

	var path = this.path;
	for(var i = 0; i < path.points.length; ++i)
	{
		var pos = path.points[i];
		if( this._root.transform )
			pos = mat4.multiplyVec3( vec3.create(), model, pos );
		LS.Picking.addPickingPoint( pos, 9, { instance: this, info: i } );
	}
}

Spline.prototype.applyTransformMatrix = function( matrix, center, info )
{
	var p = this.path.points[info];
	if(!p)
		return false;

	this._must_update = true;
	var new_pos = mat4.multiplyVec3( vec3.create(), matrix, p );
	this.path.movePoint( info, new_pos, this.preserve_tangents );

	return true;
}

Spline.prototype.getTransformMatrix = function( info )
{
	var p = this.path.points[info];
	if(!p)
		return null;

	var model = this._root.transform.getGlobalMatrix();
	mat4.translate( model, model, p );
	return model;
}


LS.registerComponent( Spline );



///@INFO: UNCOMMON
/**
* Allows to set an object position from a spline
* @class FollowSpline
* @constructor
* @param {Object} object to configure from
*/

function FollowSpline( o )
{
	this.enabled = true;
	this.spline = "";
	this.factor = 0;

	this._last_position = vec3.create();
	this._last_position_inc = vec3.create();
	this._last_rotation = quat.create();

	if(o)
		this.configure(o);
}

FollowSpline["@spline"] = { type: LS.TYPES.COMPONENT_ID };
FollowSpline["@factor"] = { type: "number", step:0.001, precision:3 };

FollowSpline.prototype.serialize = function()
{
	return {
		enabled: this.enabled,
		spline: this.spline,
		factor: this.factor
	};
}

FollowSpline.prototype.configure = function(o)
{
	this.enabled = o.enabled;
	this.spline = o.spline;
	this.factor = o.factor;
}

FollowSpline.prototype.onAddedToScene = function( scene )
{
	LEvent.bind( scene, "update", this.onUpdate, this);
}

FollowSpline.prototype.onRemovedFromScene = function( scene )
{
	LEvent.unbind( scene, "update", this.onUpdate, this);
}

FollowSpline.prototype.onUpdate = function(e, dt)
{
	var node = this._root;
	if(!node || !node.transform )
		return;

	var spline = LS.GlobalScene.findComponentByUId( this.spline );
	if(!spline)
		return;

	var pos = this._last_position;
	var pos2 = this._last_position_inc;
	var rot = this._last_rotation;

	spline.getPoint( this.factor, pos );
	spline.getPoint( this.factor+0.001, pos2 );

	if( node._parentNode && node._parentNode.transform )
	{
		var mat = node._parentNode.transform.getGlobalMatrix();
		mat4.invert( mat, mat );
		mat4.multiplyVec3( pos, mat, pos );
		mat4.multiplyVec3( pos2, mat, pos2 );
	}

	if( vec3.distance(pos,pos2) < 0.00001 ) //too close
	{
		node.transform.setPosition(pos);
		return;
	}

	node.transform.lookAt( pos, pos2, LS.TOP );

	/*
	//pos
	node.transform.setPosition(pos);

	//rot
	var mat = mat4.lookAt( mat4.create(), pos, pos2, LS.TOP );
	//mat4.invert(mat,mat);
	quat.fromMat4( rot, mat );
	node.transform.rotation = rot;
	*/
}

LS.registerComponent( FollowSpline );
