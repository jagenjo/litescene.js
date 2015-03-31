/**
* Target rotate a mesh to look at the camera or another object
* @class Target
* @constructor
* @param {Object} object to configure from
*/

function Target(o)
{
	this.enabled = true;
	this.factor = 1;
	this.node_id = null;
	this.face_camera = false;
	this.cylindrical = false;
	
	this._target_position = vec3.create();

	if(o)
		this.configure(o);
}

Target.icon = "mini-icon-billboard.png";

Target["@node_id"] = {type:'node'};

Target.prototype.onAddedToNode = function(node)
{
	LEvent.bind(node,"computeVisibility",this.updateOrientation,this);
}

Target.prototype.updateOrientation = function(e)
{
	if(!this.enabled)
		return;

	if(!this._root) 
		return;
	var scene = this._root.scene;

	/*
	var dir = vec3.subtract( info.camera.getEye(), this._root.transform.getPosition(), vec3.create() );
	quat.lookAt( this._root.transform._rotation, dir, [0,1,0] );
	this._root.transform._dirty = true;
	*/

	var eye = null;
	var target_position = null;
	var up = vec3.fromValues(0,1,0);
	var position = this._root.transform.getGlobalPosition();

	if( this.node_id )
	{
		var node = scene.getNode( this.node_id );
		if(!node || node == this._root ) //avoid same node
			return;
		target_position = node.transform.getGlobalPosition( this._target_position );
	}
	else if( this.face_camera )
	{
		var camera = Renderer._main_camera;
		if(camera)
			target_position = camera.getEye();
	}
	else
		return;

	if( this.cylindrical )
	{
		target_position[1] = position[1];
		up.set([0,1,0]);
	}

	//TODO: this kills the scale, fix it so it only changes the rotation 
	this._root.transform.lookAt( position, target_position, up, true );
}

LS.registerComponent( Target );