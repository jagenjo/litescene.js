///@INFO: UNCOMMON
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
	this.poses = []; //every pose contains 
	this._poses_by_name = {};

	if(o)
		this.configure(o);
}

Poser.icon = "mini-icon-clock.png";

Object.defineProperty( Poser.prototype, "weights", {
	set: function(v) {
		if(!v || !v.length)
			return;
		for(var i = 0; i < v.length; ++i)
			if( this.poses[i] )
				this.poses[i].weight = v[i] || 0;
	},
	get: function()
	{
		var result = new Array( this.poses.length );
		for(var i = 0; i < this.poses.length; ++i)
			result[i] = this.poses[i].weight;
		return result;
	},
	enumeration: false
});

//object with name:weight
Object.defineProperty( Poser.prototype, "name_weights", {
	set: function(v) {
		if(!v)
			return;
		for(var i in v)
		{
			var pose = this._poses_by_name[i];
			if(pose)
				pose.weight = Number(v[i]);
		}
	},
	get: function()
	{
		var result = {};
		for(var i = 0; i < this.poses.length; ++i)
		{
			var pose = this.poses[i];
			result[ pose.name ] = pose.weight;
		}
		return result;
	},
	enumeration: false
});

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
	if(!this.enabled || !this._root)
		return;

	this.applyPoseFromWeights();

	var scene = this._root.scene;
	if(scene)
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
			position: [0,0,0],
			rotation: [0,0,0,1],
			scaling: [1,1,1]
		};
		this.base_nodes.push( node_data );
	}
	
	if(node.transform)
	{
		vec3.copy( node_data.position, node.transform._position );
		quat.copy( node_data.rotation, node.transform._rotation );
		vec3.copy( node_data.scaling, node.transform._scaling );
	}
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
		weight: 0,
		nodes: []
	};
	this.poses.push( pose );
	this._poses_by_name[ name ] = pose;
	this.updatePose( name );
}

Poser.prototype.removePose = function( name )
{
	var pose = this._poses_by_name[ name ];
	if(!pose)
		return;
	var index = this.poses.indexOf(pose);
	if(index != -1)
		this.poses.splice(index,1);
	delete this._poses_by_name[ name ];
}

Poser.prototype.setPoseWeight = function( name, weight )
{
	var pose = this._poses_by_name[ name ];
	if(pose)
		pose.weight = weight;
}


//updates the transform of a pose using the current nodes transform
Poser.prototype.updatePose = function( name )
{
	if(!this._root || !this._root.scene) //could happen
		return;

	var pose = this._poses_by_name[ name ];
	if(!pose)
		return null;

	var scene = this._root.scene;
	pose.nodes.length = 0; //clear

	var delta_pos = vec3.create();
	var delta_rot = quat.create();
	var delta_scale = vec3.create();

	for(var i = 0; i < this.base_nodes.length; ++i)
	{
		var base_node_info = this.base_nodes[i];
		var node = scene.getNode( base_node_info.node_uid );
		if(!node)
		{
			console.warn("addPose error, node not found in scene");
			continue; 
		}

		//compute diff
		vec3.sub( delta_pos, node.transform._position, base_node_info.position );

		quat.invert( delta_rot, node.transform._rotation );
		quat.mul( delta_rot, base_node_info.rotation, delta_rot );
		quat.invert( delta_rot, delta_rot );

		vec3.div( delta_scale, node.transform._scaling, base_node_info.scaling );

		var pose_info = {
			node_uid: node.uid
		};

		//if they are below threshold, do not store deltas
		if( vec3.length(delta_pos) > 0.00001 )
			pose_info.delta_pos = toArray( delta_pos );
		if( vec4.dist(delta_rot,LS.QUAT_IDENTITY) > 0.0001 )
			pose_info.delta_rot = toArray( delta_rot );
		if( Math.abs(vec3.length(delta_scale) - 1.0) > 0.00001 )
			pose_info.delta_scale = toArray( delta_scale );

		pose.nodes.push( pose_info );
	}

	return pose;
}

Poser.prototype.applyBasePose = function()
{
	if( !this._root || !this._root.scene )
		return;

	var scene = this._root.scene;
	if(!scene)
		return;

	for(var i = 0; i < this.base_nodes.length; ++i)
	{
		var base_node_info = this.base_nodes[i];
		var node = scene.getNode( base_node_info.node_uid );
		if(!node || !node.transform)
			continue; 
		node.transform.position = base_node_info.position;
		node.transform.rotation = base_node_info.rotation;
		node.transform.scaling = base_node_info.scaling;
	}
}

Poser.prototype.applyPose = function(name, skip_reset)
{
	if( !this._root || !this._root.scene )
		return;

	var scene = this._root.scene;
	if(!scene)
		return;

	var pose = this._poses_by_name[name];
	if(!pose)
		return;

	for(var i = 0; i < this.base_nodes.length; ++i)
	{
		var base_node_info = this.base_nodes[i];
		var node = scene.getNode( base_node_info.node_uid );
		if(!node || !node.transform)
			continue; 

		var pose_node_info = pose.nodes[i];
		if(!pose_node_info)
		{
			if(!skip_reset)
			{
				node.transform.position = base_node_info.position;
				node.transform.rotation = base_node_info.rotation;
				node.transform.scaling = base_node_info.scaling;
			}
			continue;
		}

		if( pose_node_info.delta_pos )
			vec3.add( node.transform._position, skip_reset ? node.transform._position : base_node_info.position, pose_node_info.delta_pos );
		else if(!skip_reset)
			node.transform.position = base_node_info.position;

		if( pose_node_info.delta_rot )
			quat.mul( node.transform._rotation, pose_node_info.delta_rot, skip_reset ? node.transform._rotation : base_node_info.rotation );
		else if(!skip_reset)
			node.transform.rotation = base_node_info.rotation;

		/*
		if( pose_node_info.delta_scale )
			vec3.mul( node.transform._scaling, skip_reset ? node.transform._scaling : base_node_info.scaling, pose_node_info.delta_scale );
		else if(!skip_reset)
			node.transform.scaling = base_node_info.scaling;
		*/

		node.transform._must_update = true;
	}
}

Poser.temp_quat = quat.create();

Poser.prototype.applyPoseFromWeights = function()
{
	var scene = this._root.scene;
	if(!scene)
		return;

	var num_nodes = this.base_nodes.length;
	var positions = this._positions_array;
	var rotations = this._rotations_array;
	var scalings = this._scalings_array;
	if( !positions || positions.length != num_nodes * 3 )
	{
		positions = this._positions_array = new Float32Array(num_nodes * 3);
		rotations = this._rotations_array = new Float32Array(num_nodes * 4);
		scalings = this._scalings_array = new Float32Array(num_nodes * 3);
	}
	var temp_quat = Poser.temp_quat;

	for(var i = 0; i < num_nodes; ++i)
	{
		positions.set(LS.ZEROS,i*3);
		rotations.set(LS.QUAT_IDENTITY, i*4);
		scalings.set(LS.ONES, i*3);
	}

	for(var j = 0; j < this.poses.length; ++j )
	{
		var pose = this.poses[j];
		if(!pose.weight)
			continue;

		for(var i = 0; i < pose.nodes.length; ++i)
		{
			var pose_node_info = pose.nodes[i];

			if( pose_node_info.delta_pos )
			{
				var pos = positions.subarray(i*3,i*3+3);
				vec3.scaleAndAdd( pos, pos, pose_node_info.delta_pos, pose.weight );
			}

			if( pose_node_info.delta_rot )
			{
				var rot = rotations.subarray(i*4,i*4+4);
				quat.slerp( temp_quat, LS.QUAT_IDENTITY, pose_node_info.delta_rot, pose.weight );
				//quat.scale( temp_quat, pose_node_info.delta_rot, pose.weight );
				quat.mul( rot, rot, temp_quat );
			}

			/*
			if( pose_node_info.delta_scale )
			{
				var scale = scalings.subarray(i*3,i*3+3);
				vec3.scaleAndAdd( scale, scale, pose_node_info.delta_scale, pose.weight );
			}
			*/
		}
	}

	for(var i = 0; i < this.base_nodes.length; ++i)
	{
		var base_node_info = this.base_nodes[i];
		var node = scene.getNode( base_node_info.node_uid );
		if(!node || !node.transform)
			continue; 

		var pos = positions.subarray(i*3,i*3+3);
		var rot = rotations.subarray(i*4,i*4+4);
		var scale = scalings.subarray(i*3,i*3+3);
		quat.normalize( rot, rot );

		if( base_node_info.position ) //patch to avoid weird bug
			vec3.add( node.transform._position, pos, base_node_info.position );
		if( base_node_info.rotation ) //patch to avoid weird bug
			quat.mul( node.transform._rotation, rot, base_node_info.rotation );
		//vec3.mul( node.transform._scaling, scale, base_node_info.scaling );
		node.transform._must_update = true;
	}
}

/*
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
*/

//remove nodes from poses if they are not used
Poser.prototype.purgePoses = function()
{
	//mark which nodes in the pose exist in the scene
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

	//now check all the poses, if they use a node that doesnt exist in the scene, remove it from the pose
	for(var i = 0; i < this.poses.length; ++i)
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

//used for graphs
Poser.prototype.setProperty = function(name, value)
{
	if( name == "enabled" )
		this.enabled = value;
	else if( name.substr(0,5) == "pose_" )
	{
		name = name.substr(5);
		var t = name.split("_");
		var index = Number(t[0]);
		var pose = this.poses[ index ];
		if( pose )
		{
			if( t[1] == "weight" )
				pose.weight = value;
		}
	}
	else if( name == "weights" )
		this.weights = value;
	else if( name == "name_weights" )
		this.name_weights = value;
}

Poser.prototype.getProperty = function(name)
{
	if(name.substr(0,5) == "pose_" && name.length > 5)
	{
		var t = name.substr(5).split("_");
		var index = Number(t[0]);
		var pose = this.poses[ index ];
		if(pose)
		{
			if(t[1] == "weight")
				return pose.weight;
		}
	}
}

Poser.prototype.getPropertiesInfo = function()
{
	var properties = {
		enabled: "boolean",
		weights: "array",
		name_weights: "object"
	};

	for(var i = 0; i < this.poses.length; ++i)
		properties[ "pose_" + i + "_weight" ] = "number";

	return properties;
}

Poser.prototype.configure = function(o)
{
	LS.BaseComponent.prototype.configure.call(this,o);

	for(var i = 0;i < this.poses.length; ++i)
		this._poses_by_name[ this.poses[i].name ] = this.poses[i];
}

LS.registerComponent( Poser );