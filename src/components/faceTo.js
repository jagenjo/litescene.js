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
	this.scale = 1;
	this.target = null;
	this.cylindrical = false;
	this.reverse = false;
}

FaceTo.icon = "mini-icon-billboard.png";

FaceTo["@target"] = {type:'node'};

FaceTo.prototype.onAddedToNode = function(node)
{
	LEvent.bind(node,"computeVisibility",this.updateOrientation,this);
}

FaceTo.prototype.updateOrientation = function(e,info)
{
	if(!this._root) return;
	var scene = this._root._on_scene;

	/*
	var dir = vec3.subtract( info.camera.getEye(), this._root.transform.getPosition(), vec3.create() );
	quat.lookAt( this._root.transform._rotation, dir, [0,1,0] );
	this._root.transform._dirty = true;
	*/

	var eye = null;
	
	if(this.target)
	{
		var node = scene.getNode( this.target );
		if(!node)
			return;
		eye = node.transform.getPosition();
	}
	else
		eye = info.camera.getEye();
	var pos = this._root.transform.getPosition();
	var up = info.camera.getLocalVector([0,1,0]);
	if( this.cylindrical )
	{
		eye[1] = pos[1];
		up.set([0,1,0]);
	}
	if(!this.reverse)
		vec3.subtract(eye,pos,eye);
	this._root.transform.lookAt( pos, eye, up );
	this._root.transform.setScale( this.scale );
}

LS.registerComponent(FaceTo);