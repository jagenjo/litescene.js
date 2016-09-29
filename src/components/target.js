/**
* Target rotate a mesh to look at the camera or another object
* @class Target
* @constructor
* @param {Object} object to configure from
*/

function Target(o)
{
	this.enabled = true;
	this.node_id = null;
	this.face_camera = false;
	this.cylindrical = false;
	this.front = Target.NEGZ;
	this.up = Target.POSY;
	
	this._target_position = vec3.create();

	if(o)
		this.configure(o);
}

Target.icon = "mini-icon-billboard.png";

Target.POSX = 1;
Target.NEGX = 2;
Target.POSY = 3;
Target.NEGY = 4;
Target.POSZ = 5;
Target.NEGZ = 6;

Target["@node_id"] = { type: 'node' };
Target["@front"] = { type: 'enum', values: { "-Z": Target.NEGZ,"+Z": Target.POSZ, "-Y": Target.NEGY,"+Y": Target.POSY,"-X": Target.NEGX,"+X": Target.POSX }};
Target["@up"] = { type: 'enum', values: { "-Z": Target.NEGZ,"+Z": Target.POSZ, "-Y": Target.NEGY,"+Y": Target.POSY,"-X": Target.NEGX,"+X": Target.POSX }};

Target.prototype.onAddedToNode = function(node)
{
	LEvent.bind( node, "computeVisibility", this.updateOrientation, this);
}

Target.prototype.onRemovedFromNode = function(node)
{
	LEvent.unbind( node, "computeVisibility", this.updateOrientation, this);
}


Target.prototype.updateOrientation = function(e)
{
	if(!this.enabled)
		return;

	if(!this._root || !this._root.transform ) 
		return;
	var scene = this._root.scene;

	var transform = this._root.transform;

	/*
	var dir = vec3.subtract( info.camera.getEye(), this._root.transform.getPosition(), vec3.create() );
	quat.lookAt( this._root.transform._rotation, dir, [0,1,0] );
	this._root.transform._must_update = true;
	*/

	var eye = null;
	var target_position = null;
	var up = null;
	var position = transform.getGlobalPosition();

	switch( this.up )
	{
		case Target.NEGX: up = vec3.fromValues(-1,0,0); break;
		case Target.POSX: up = vec3.fromValues(1,0,0); break;
		case Target.NEGZ: up = vec3.fromValues(0,0,-1); break;
		case Target.POSZ: up = vec3.fromValues(0,0,1); break;
		case Target.NEGY: up = vec3.fromValues(0,-1,0); break;
		case Target.POSY: 
		default:
			up = vec3.fromValues(0,1,0);
	}

	if( this.node_id )
	{
		var node = scene.getNode( this.node_id );
		if(!node || node == this._root ) //avoid same node
			return;
		target_position = node.transform.getGlobalPosition( this._target_position );
	}
	else if( this.face_camera )
	{
		var camera = LS.Renderer._main_camera ||  LS.Renderer._current_camera;
		if(!camera)
			return;
		target_position = camera.getEye();
	}
	else
		return;

	if( this.cylindrical )
	{
		target_position[1] = position[1];
		//up.set([0,1,0]);
	}

	transform.lookAt( position, target_position, up, true );

	switch( this.front )
	{
		case Target.POSY: quat.rotateX( transform._rotation, transform._rotation, Math.PI * -0.5 );	break;
		case Target.NEGY: quat.rotateX( transform._rotation, transform._rotation, Math.PI * 0.5 );	break;
		case Target.POSX: quat.rotateY( transform._rotation, transform._rotation, Math.PI * 0.5 );	break;
		case Target.NEGX: quat.rotateY( transform._rotation, transform._rotation, Math.PI * -0.5 );	break;
		case Target.POSZ: quat.rotateY( transform._rotation, transform._rotation, Math.PI );	break;
		case Target.NEGZ:
		default:
	}
}

LS.registerComponent( Target );