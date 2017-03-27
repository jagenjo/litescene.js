/**
* Transitions between different poses
* @class Poser
* @constructor
* @param {String} object to configure from
*/


function Poser(o)
{
	this.enabled = true;

	this.only_internal_nodes = true;
	this.base_nodes = []; //uids and original transform of the nodes affected by the poser
	this.poses = [];

	if(o)
		this.configure(o);
}

//Poser["@animation"] = { widget: "resource" };

Poser.prototype.configure = function(o)
{
}

Poser.icon = "mini-icon-clock.png";

Poser.prototype.onAddedToScene = function( scene )
{
	LEvent.bind(scene,"update",this.onUpdate, this);
}

Poser.prototype.onRemovedFromScene = function(scene)
{
	LEvent.unbind(scene,"update",this.onUpdate, this);
}

Poser.prototype.onUpdate = function(e, dt)
{
	this.applyPoses();

	var scene = this._root.scene;
	if(!scene)
		scene.requestFrame();
}

Poser.prototype.addBaseNode = function( node )
{
	var node_data = null;
	var uid = node.uid;

	//check if it is already in this.base_nodes
	for(var i = 0; i < this.base_nodes.length; ++i)
	{
		var v = this.base_nodes[i];
		if( v.node_uid != uid )
			continue;
		node_data = v;
		break;
	}

	//add new base node
	if(!node_data)
	{
		node_data = { 
			node_uid: uid, 
			position: vec3.create(),
			scaling: vec3.create(),
			rotation: quat.create()
		};
		this.base_nodes.push( node_data );
	}
	
	node_data.position.set( node.transform._position );
	node_data.scaling.set( node.transform._scaling );
	node_data.rotation.set( node.transform._rotation );
}


Poser.prototype.addPose = function( name )
{

}

Poser.prototype.updatePose = function( name )
{

}

Poser.prototype.getResources = function(res)
{
}

Poser.prototype.onResourceRenamed = function (old_name, new_name, resource)
{
}

LS.registerComponent( Poser );