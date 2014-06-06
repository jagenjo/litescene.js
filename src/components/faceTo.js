/**
* FaceTo rotate a mesh to look at the camera or another object
* @class FaceTo
* @constructor
* @param {String} object to configure from
*/

function FaceTo(o)
{
	/*
	this.width = 10;
	this.height = 10;
	this.roll = 0;
	*/

	this.factor = 1;
	this.target = null;
	this.cylindrical = false;

	this.configure(o);
}

FaceTo.icon = "mini-icon-billboard.png";

FaceTo["@target"] = {type:'node'};

FaceTo.prototype.onAddedToNode = function(node)
{
	LEvent.bind(node,"computeVisibility",this.updateOrientation,this);
}

FaceTo.prototype.updateOrientation = function(e)
{
	if(!this._root) return;
	var scene = this._root._in_tree;

	/*
	var dir = vec3.subtract( info.camera.getEye(), this._root.transform.getPosition(), vec3.create() );
	quat.lookAt( this._root.transform._rotation, dir, [0,1,0] );
	this._root.transform._dirty = true;
	*/

	var eye = null;
	var target_position = null;
	var up = vec3.fromValues(0,1,0);
	var position = this._root.transform.getGlobalPosition();

	if(this.target)
	{
		var node = scene.getNode( this.target );
		if(!node || node == this._root ) //avoid same node
			return;
		target_position = node.transform.getGlobalPosition();
	}
	else
	{
		var camera = Renderer._main_camera;
		if(camera)
			target_position = camera.getEye();
	}

	if( this.cylindrical )
	{
		target_position[1] = position[1];
		up.set([0,1,0]);
	}

	/*
	if(this._root.transform._parent)
	{
		var mat = this._root.transform._parent.getGlobalMatrix();
		var inv = mat4.invert( mat4.create(), mat );
		mat4.multiplyVec3(target_position, inv, target_position);
		//mat4.rotateVec3(up, inv, up);
	}
	//var up = camera.getLocalVector([0,1,0]);
	*/

	this._root.transform.lookAt( position, target_position, up, true );
}

LS.registerComponent(FaceTo);