/**
* Transitions between different poses
* @class Poser
* @namespace LS.Components
* @constructor
* @param {String} object to configure from
*/


function Poser(o)
{
	this.enabled = true;

	this.only_internal_nodes = true;
	this.base_nodes = []; //uids and original transform of the nodes affected by the poser
	this.poses = {};

	if(o)
		this.configure(o);
}

/*
Poser.prototype.configure = function(o)
{
	
}
*/

Poser.icon = "mini-icon-clock.png";

Poser.prototype.onAddedToScene = function( scene )
{
	//LEvent.bind(scene,"update",this.onUpdate, this);
}


Poser.prototype.onRemovedFromScene = function(scene)
{
	//LEvent.unbind(scene,"update",this.onUpdate, this);
}

/*
Poser.prototype.onUpdate = function(e, dt)
{
	this.applyPose();

	var scene = this._root.scene;
	if(!scene)
		scene.requestFrame();
}
*/

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
			data: Array(10)
		};
		this.base_nodes.push( node_data );
	}
	
	if(node.transform)
		node_data.data = node.transform.data;
}

Poser.prototype.removeBaseNode = function( node )
{
	if(!node)
		return;

	if(node.constructor === String)
		node = this._root.scene.getNode( node );

	if(!node)
	{
		console.warn("Node not found");
		return;
	}

	//check if it is already in this.base_nodes
	for(var i = 0; i < this.base_nodes.length; ++i)
	{
		var v = this.base_nodes[i];
		if( v.node_uid != node.uid )
			continue;

		this.base_nodes.splice(i,1);
		this.purgePoses();
		break;
	}
}

Poser.prototype.setChildrenAsBaseNodes = function( include_root )
{
	this.base_nodes.length = 0;
	if(include_root)
		this.addBaseNode( this._root );
	var descendants = this._root.getDescendants();
	for(var i = 0; i < descendants.length; ++i)
		this.addBaseNode( descendants[i] );
}

Poser.prototype.addPose = function( name )
{
	var pose = {
		name: name,
		nodes: []
	};
	this.poses[ name ] = pose;
	this.updatePose( name );
}

Poser.prototype.removePose = function( name )
{
	delete this.poses[ name ];
}

//call to update the value of a pose using the current nodes transform
Poser.prototype.updatePose = function( name )
{
	if(!this._root || !this._root.scene) //could happen
		return;

	var pose = this.poses[ name ];
	if(!pose)
		return null;

	var scene = this._root.scene;
	pose.nodes.length = 0;

	for(var i = 0; i < this.base_nodes.length; ++i)
	{
		var base_node_info = this.base_nodes[i];
		var node = scene.getNode( base_node_info.node_uid );
		if(!node)
		{
			console.warn("addPose error, node not found in scene");
			continue; 
		}

		var pose_info = {
			node_uid: node.uid,
			data: toArray( node.transform.data )
		};

		pose.nodes.push( pose_info );
	}

	this.poses[ name ] = pose;
	return pose;
}

//call to apply one pose to the nodes
Poser.prototype.applyPose = function( name, weight )
{
	if(!name || !this._root || !this._root.scene)
		return;

	if(weight === undefined)
		weight = 1;
	if(weight <= 0)
		return;

	var pose = this.poses[ name ];
	if(!pose)
		return null;

	var scene = this._root.scene;
	if(!scene)
		return;

	for(var i = 0; i < pose.nodes.length; ++i)
	{
		var info = pose.nodes[i];
		var node = scene.getNode( info.node_uid );
		if(!node || !node.transform)
			continue; //maybe the node was removed from the scene

		//overwrite
		if(weight >= 1)		
		{
			node.transform.data = info.data;
			continue;
		}

		var a = node.transform;
		var b = info.data;

		//interpolate
		vec3.lerp( a._position, a._position, b, weight ); //position
		vec3.lerp( a._scaling, a._scaling, b.subarray(7,10), weight ); //scale
		quat.slerp( a._rotation, a._rotation, b.subarray(3,7), weight ); //rotation
		node.transform._must_update = true;
	}

	this.poses[ name ] = pose;
	return pose;
}

//remove nodes from poses if they are not used
Poser.prototype.purgePoses = function()
{
	var valid_nodes = {};
	var scene = this._root.scene;
	if(!scene)
		return;

	for(var i = 0; i < this.base_nodes.length; ++i)
	{
		var info = this.base_nodes[i];
		var node = scene.getNode( info.node_uid );
		if(node)
			valid_nodes[ node.uid ] = true;
	}


	for(var i in this.poses)
	{
		var pose = this.poses[i];
		var pose_nodes = pose.nodes;

		for( var j = 0; j < pose_nodes.length; ++j )
		{
			var uid = pose_nodes[j].node_uid;
			if(valid_nodes[uid])
				continue;
			pose_nodes.splice(j,1);
			j--;
		}
	}
}

LS.registerComponent( Poser );