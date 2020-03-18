///@INFO: UNCOMMON
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
	this.use_iterative_method = false; //this method reuses previous orientation as a reinforcement to avoid weird cases but it gives an approxiate orientation
	
	this._global_position = vec3.create();
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

Target["@node_id"] = { type: 'node_id' };
Target["@front"] = { type: 'enum', values: { "-Z": Target.NEGZ,"+Z": Target.POSZ, "-Y": Target.NEGY,"+Y": Target.POSY,"-X": Target.NEGX,"+X": Target.POSX }};
Target["@up"] = { type: 'enum', values: { "-Z": Target.NEGZ,"+Z": Target.POSZ, "-Y": Target.NEGY,"+Y": Target.POSY,"-X": Target.NEGX,"+X": Target.POSX }};

Target.prototype.onAddedToScene = function( scene )
{
	//it must be done before collect, otherwise elements wont have the right orientation
	LEvent.bind( scene, LS.EVENT.BEFORE_RENDER, this.onBeforeRender, this);
}

Target.prototype.onRemovedFromScene = function( scene )
{
	LEvent.unbind( scene, LS.EVENT.BEFORE_RENDER, this.onBeforeRender, this);
}

Target.prototype.onBeforeRender = function(e)
{
	if(!this.enabled)
		return;

	this.updateOrientation();
}

Target.temp_mat3 = mat3.create();

//*
Target.temp_mat = mat4.create();

Target.prototype.updateOrientation = function()
{
	if(!this._root || !this._root.transform ) 
		return;
	var scene = this._root.scene;

	var transform = this._root.transform;

	var eye = null;
	var target_position = null;
	var up = null;
	var position = transform.getGlobalPosition( this._global_position );

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
		if(!node || node == this._root || !node.transform ) //avoid same node
			return;
		target_position = node.transform.getGlobalPosition( this._target_position );
	}
	else if( this.face_camera )
	{
		var camera = LS.Renderer._current_camera ||  LS.Renderer._main_camera;
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

	/*
	mat4.lookAt( Target.temp_mat, position, target_position, up );
	quat.fromMat4( transform._rotation, Target.temp_mat );
	*/

	//transform.lookAt( position, target_position, up, true );
	transform.orientTo( target_position, true, up, this.use_iterative_method );

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

	transform._on_change();
}
//*/

LS.registerComponent( Target );