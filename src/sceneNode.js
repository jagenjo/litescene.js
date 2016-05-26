//****************************************************************************

/**
* The SceneNode class represents and object in the scene
* Is the base class for all objects in the scene as meshes, lights, cameras, and so
*
* @class SceneNode
* @param {String} name the name for this node (otherwise a random one is computed)
* @constructor
*/

function SceneNode( name )
{
	if(name && name.constructor !== String)
	{
		name = null;
		console.warn("SceneNode constructor first parameter must be a String with the name");
	}

	//Generic
	this._name = name || ("node_" + (Math.random() * 10000).toFixed(0)); //generate random number
	this._uid = LS.generateUId("NODE-");
	this._classList = {}; //to store classes
	this.layers = 3|0; //32 bits for layers (force to int)
	this.node_type = null; //used to store a string defining the node info

	this._components = []; //used for logic actions
	this._missing_components = null;

	this._prefab = null;
	this._parentNode = null;
	this._children = null;

	this._material = null;
	this.node_type = null;

	//flags
	this.flags = {
		visible: true,
		is_static: false,
		selectable: true,
		two_sided: false,
		flip_normals: false,
		cast_shadows: true,
		receive_shadows: true,
		ignore_lights: false,
		depth_test: true,
		depth_write: true
	};

	this.init(false,true);
}

SceneNode.prototype.init = function( keep_components, keep_info )
{
	if(!keep_info)
	{
		this.layers = 3|0; //32 bits for layers (force to int)
		this._name = name || ("node_" + (Math.random() * 10000).toFixed(0)); //generate random number
		this._uid = LS.generateUId("NODE-");
		this._classList = {};

		//material
		this._material = null;
		this.extra = {}; //for extra info
		this.node_type = null;

		//flags
		this.flags = {
			visible: true,
			is_static: false,
			selectable: true,
			two_sided: false,
			flip_normals: false,
			cast_shadows: true,
			receive_shadows: true,
			ignore_lights: false, //not_affected_by_lights
			depth_test: true,
			depth_write: true
		};
	}

	//Basic components
	if(!keep_components)
	{
		if( this._components && this._components.length )
			console.warn("SceneNode.init() should not be called if it contains components, call clear instead");
		this._components = []; //used for logic actions
		this._missing_components = null;
		this.addComponent( new LS.Transform() );
	}
}

//get methods from other classes
LS.extendClass( SceneNode, ComponentContainer ); //container methods
LS.extendClass( SceneNode, CompositePattern ); //container methods

/**
* changes the node name
* @method setName
* @param {String} new_name the new name
* @return {Object} returns true if the name changed
*/

Object.defineProperty( SceneNode.prototype, 'name', {
	set: function(name)
	{
		this.setName( name );
	},
	get: function(){
		return this._name;
	},
	enumerable: true
});

Object.defineProperty( SceneNode.prototype, 'fullname', {
	set: function(name)
	{
		throw("You cannot set fullname, it depends on the parent nodes");
	},
	get: function(){
		return this.getPathName();
	},
	enumerable: false
});

//Changing the UID  has lots of effects (because nodes are indexed by UID in the scene)
//If you want to catch the event of the uid_change, remember, the previous uid is stored in LS.SceneNode._last_uid_changed (it is not passed in the event)
Object.defineProperty( SceneNode.prototype, 'uid', {
	set: function(uid)
	{
		if(!uid)
			return;

		//valid uid?
		if(uid[0] != LS._uid_prefix)
		{
			console.warn("Invalid UID, renaming it to: " + uid );
			uid = LS._uid_prefix + uid;
		}

		//no changes?
		if(uid == this._uid)
			return;

		SceneNode._last_uid_changed = this._uid; //hack, in case we want the previous uid of a node 

		//update scene tree indexing
		if( this._in_tree && this._in_tree._nodes_by_uid[ this.uid ] )
			delete this._in_tree._nodes_by_uid[ this.uid ];
		this._uid = uid;
		if( this._in_tree )
			this._in_tree._nodes_by_uid[ this.uid ] = this;
		//events
		LEvent.trigger( this, "uid_changed", uid );
		if(this._in_tree)
			LEvent.trigger( this._in_tree, "node_uid_changed", this );
	},
	get: function(){
		return this._uid;
	},
	enumerable: true
});


Object.defineProperty( SceneNode.prototype, 'visible', {
	set: function(v)
	{
		this.flags.visible = v;
	},
	get: function(){
		return this.flags.visible;
	},
	enumerable: true
});

Object.defineProperty( SceneNode.prototype, 'is_static', {
	set: function(v)
	{
		this.flags.is_static = v;
	},
	get: function(){
		return this.flags.is_static;
	},
	enumerable: true
});

Object.defineProperty( SceneNode.prototype, 'material', {
	set: function(v)
	{
		this._material = v;
		if(!v)
			return;
		if(v.constructor === String)
			return;
		if(v._root && v._root != this) //has root and its not me
			console.warn( "Cannot assign a material of one SceneNode to another, you must clone it or register it" )
		else
			v._root = this; //link
	},
	get: function(){
		return this._material;
	},
	enumerable: true
});

Object.defineProperty( SceneNode.prototype, 'prefab', {
	set: function(name)
	{
		this._prefab = name;
		var prefab = LS.RM.getResource(name);
		if(prefab)
			this.reloadFromPrefab();
	},
	get: function(){
		return this._prefab;
	},
	enumerable: true
});

SceneNode.prototype.clear = function()
{
	this.removeAllComponents();
	this.removeAllChildren();
	this.init();
}

SceneNode.prototype.setName = function(new_name)
{
	if(this._name == new_name) 
		return true; //no changes

	//check that the name is valid (doesnt have invalid characters)
	if(!LS.validateName(new_name))
		return false;

	var scene = this._in_tree;
	if(!scene)
	{
		this._name = new_name;
		return true;
	}

	//remove old link
	if( this._name )
		delete scene._nodes_by_name[ this._name ];

	//assign name
	this._name = new_name;

	//we already have another node with this name
	if( new_name && !scene._nodes_by_name[ new_name ] )
		scene._nodes_by_name[ this._name ] = this;

	/**
	 * Node changed name
	 *
	 * @event name_changed
	 * @param {String} new_name
	 */
	LEvent.trigger( this, "name_changed", new_name );
	if(scene)
		LEvent.trigger( scene, "node_name_changed", this );
	return true;
}

Object.defineProperty( SceneNode.prototype, 'classList', {
	get: function() { return this._classList },
	set: function(v) {},
	enumerable: false
});

/**
* @property className {String}
*/
Object.defineProperty( SceneNode.prototype, 'className', {
	get: function() {
			var keys = null;
			if(Object.keys)
				keys = Object.keys(this._classList); 
			else
			{
				keys = [];
				for(var k in this._classList)
					keys.push(k);
			}
			return keys.join(" ");
		},
	set: function(v) { 
		this._classList = {};
		if(!v)
			return;
		var t = v.split(" ");
		for(var i in t)
			this._classList[ t[i] ] = true;
	},
	enumerable: true
});

SceneNode.prototype.destroy = function()
{
	LEvent.trigger( this, "destroy" );
	this.removeAllComponents();
	if(this.children)
		while(this.children.length)
			this.children[0].destroy();
	if(this._parent)
		this._parent.removeChild( this );
}

SceneNode.prototype.getLocator = function()
{
	return this.uid;
}

SceneNode.prototype.getPropertyInfo = function( locator )
{
	var path = locator.split("/");
	return this.getPropertyInfoFromPath(path);
}

SceneNode.prototype.getPropertyInfoFromPath = function( path )
{
	var target = this;
	var varname = path[0];

	if(path.length == 0)
	{
		return {
			node: this,
			target: null,
			name: "",
			value: this,
			type: "node" //node because thats the global type for nodes
		};
	}
    else if(path.length == 1) //compo or //var
	{
		if(path[0][0] == "@")
		{
			target = this.getComponentByUId( path[0] );
			return {
				node: this,
				target: target,
				name: target ? LS.getObjectClassName( target ) : "",
				type: "component",
				value: target
			};
		}
		else if (path[0] == "material")
		{
			target = this.getMaterial();
			return {
				node: this,
				target: target,
				name: target ? LS.getObjectClassName( target ) : "",
				type: "material",
				value: target
			};
		}

		var target = this.getComponent( path[0] );
		if(target)
		{
			return {
				node: this,
				target: target,
				name: target ? LS.getObjectClassName( target ) : "",
				type: "component",
				value: target
			};
		}

		switch(path[0])
		{
			case "matrix":
			case "x":
			case "y": 
			case "z": 
			case "position":
			case "rotX":
			case "rotY":
			case "rotZ":
				target = this.transform;
				varname = path[0];
				break;
			default: 
				target = this;
				varname = path[0];
			break;
		}
	}
    else if(path.length > 1) //compo/var
	{
		if(path[0][0] == "@")
		{
			varname = path[1];
			target = this.getComponentByUId( path[0] );
		}
		else if (path[0] == "material")
		{
			target = this.getMaterial();
			varname = path[1];
		}
		else if (path[0] == "flags")
		{
			target = this.flags;
			varname = path[1];
		}
		else
		{
			target = this.getComponent( path[0] );
			varname = path[1];
		}

		if(!target)
			return null;
	}
	else //¿?
	{
	}

	var v = undefined;

	if( target.getPropertyInfoFromPath && target != this )
	{
		var r = target.getPropertyInfoFromPath( path.slice(1) );
		if(r)
			return r;
	}

	if( target.getPropertyValue )
		v = target.getPropertyValue( varname );

	if(v === undefined && target[ varname ] === undefined)
		return null;

	var value = v !== undefined ? v : target[ varname ];

	var extra_info = target.constructor[ "@" + varname ];
	var type = "";
	if(extra_info)
		type = extra_info.type;
	if(!type && value !== null && value !== undefined)
	{
		if(value.constructor === String)
			type = "string";
		else if(value.constructor === Boolean)
			type = "boolean";
		else if(value.length)
			type = "vec" + value.length;
		else if(value.constructor === Number)
			type = "number";
	}

	return {
		node: this,
		target: target,
		name: varname,
		value: value,
		type: type
	};
}

SceneNode.prototype.setPropertyValue = function( locator, value )
{
	var path = locator.split("/");
	return this.setPropertyValueFromPath(path, value, 0);
}

SceneNode.prototype.setPropertyValueFromPath = function( path, value, offset )
{
	offset = offset || 0;

	var target = null;
	var varname = path[offset];

	if(path.length > (offset+1))
	{
		if(path[offset][0] == "@")
		{
			varname = path[offset+1];
			target = this.getComponentByUId( path[offset] );
		}
		else if( path[offset] == "material" )
		{
			target = this.getMaterial();
			varname = path[offset+1];
		}
		else if( path[offset] == "flags" )
		{
			target = this.flags;
			varname = path[offset+1];
		}
		else 
		{
			target = this.getComponent( path[offset] );
			varname = path[offset+1];
		}

		if(!target)
			return null;
	}
	else { //special cases 
		switch ( path[offset] )
		{
			case "matrix": target = this.transform; break;
			case "x":
			case "y":
			case "z":
			case "xrotation": 
			case "yrotation": 
			case "zrotation": 
				target = this.transform; 
				varname = path[offset];
				break;
			case "translate.X": target = this.transform; varname = "x"; break;
			case "translate.Y": target = this.transform; varname = "y"; break;
			case "translate.Z": target = this.transform; varname = "z"; break;
			case "rotateX.ANGLE": target = this.transform; varname = "pitch"; break;
			case "rotateY.ANGLE": target = this.transform; varname = "yaw"; break;
			case "rotateZ.ANGLE": target = this.transform; varname = "roll"; break;
			default: target = this; //null
		}
	}

	if(!target)
		return null;

	if(target.setPropertyValueFromPath && target != this)
		if( target.setPropertyValueFromPath( path, value, offset+1 ) === true )
			return target;
	
	if(target.setPropertyValue  && target != this)
		if( target.setPropertyValue( varname, value ) === true )
			return target;

	if( target[ varname ] === undefined )
		return;

	//disabled because if the vars has a setter it wont be called using the array.set
	//if( target[ varname ] !== null && target[ varname ].set )
	//	target[ varname ].set( value );
	//else
		target[ varname ] = value;

	return target;
}

SceneNode.prototype.getResources = function( res, include_children )
{
	//resources in components
	for(var i in this._components)
		if( this._components[i].getResources )
			this._components[i].getResources( res );

	//res in material
	if(this.material)
	{
		if( this.material.constructor === String )
		{
			if(this.material[0] != ":") //not a local material, then its a reference
			{
				res[this.material] = LS.Material;
			}
		}

		var mat = this.getMaterial();
		if(mat)
			mat.getResources( res );
	}

	//prefab
	if(this.prefab)
		res[ this.prefab ] = LS.Prefab;

	//propagate
	if(include_children)
		for(var i in this._children)
			this._children[i].getResources(res, true);

	return res;
}

SceneNode.prototype.getTransform = function() {
	return this.transform;
}

//Helpers

SceneNode.prototype.getMesh = function() {
	var mesh = this.mesh;
	if(!mesh && this.meshrenderer)
		mesh = this.meshrenderer.mesh;
	if(!mesh) return null;
	if(mesh.constructor === String)
		return ResourcesManager.meshes[mesh];
	return mesh;
}

//Light component
SceneNode.prototype.getLight = function() {
	return this.light;
}

//Camera component
SceneNode.prototype.getCamera = function() {
	return this.camera;
}

SceneNode.prototype.getLODMesh = function() {
	var mesh = this.lod_mesh;
	if(!mesh && this.meshrenderer)
		mesh = this.meshrenderer.lod_mesh;
	if(!mesh) return null;
	if(mesh.constructor === String)
		return ResourcesManager.meshes[mesh];
	return mesh;
}

SceneNode.prototype.setMesh = function(mesh_name, submesh_id)
{
	if(this.meshrenderer)
	{
		if(typeof(mesh_name) == "string")
			this.meshrenderer.configure({ mesh: mesh_name, submesh_id: submesh_id });
		else
			this.meshrenderer.mesh = mesh_name;
	}
	else
		this.addComponent( new LS.MeshRenderer({ mesh: mesh_name, submesh_id: submesh_id }) );
}

SceneNode.prototype.loadAndSetMesh = function(mesh_filename, options)
{
	options = options || {};

	if( LS.ResourcesManager.meshes[mesh_filename] || !mesh_filename )
	{
		this.setMesh( mesh_filename );
		if(options.on_complete) options.on_complete( LS.ResourcesManager.meshes[mesh_filename] ,this);
		return;
	}

	var that = this;
	var loaded = LS.ResourcesManager.load(mesh_filename, options, function(mesh){
		that.setMesh(mesh.filename);
		that.loading -= 1;
		if(that.loading == 0)
		{
			LEvent.trigger(that,"resource_loaded",that);
			delete that.loading;
		}
		if(options.on_complete)
			options.on_complete(mesh,that);
	});

	if(!loaded)
	{
		if(!this.loading)
		{
			this.loading = 1;

			LEvent.trigger(this,"resource_loading");
		}
		else
			this.loading += 1;
	}
}

SceneNode.prototype.getMaterial = function()
{
	if (!this.material)
		return null;
	if(this.material.constructor === String)
	{
		if( !this._in_tree )
			return null;
		if( this.material[0] == "@" )//uid
			return LS.ResourcesManager.materials_by_uid[ this.material ];
		return LS.ResourcesManager.materials[ this.material ];
	}
	return this.material;
}

//Apply prefab info (skipping the root components) to node
//It is called from prefab.applyToNodes when a prefab is loaded in memory
SceneNode.prototype.reloadFromPrefab = function()
{
	if(!this.prefab)
		return;

	var prefab = LS.ResourcesManager.resources[ this.prefab ];
	if(!prefab)
		return;

	//apply info
	this.removeAllChildren();
	this.init( true, true );
	//remove all but children info (prefabs overwrite only children info)
	var prefab_data = { children: prefab.prefab_data.children };
	//uid data is already removed from the prefab
	this.configure( prefab_data );

	//load secondary resources 
	var resources = this.getResources( {}, true );
	LS.ResourcesManager.loadResources( resources );

	LEvent.trigger( this, "prefabReady", prefab );
}


/**
* Assigns this node to one layer
* @method setLayer
* @param {number} num layer number
* @param {boolean} value 
*/
SceneNode.prototype.setLayer = function(num, value)
{
	var f = 1<<num;
	this.layers = (this.layers & (~f));
	if(value)
		this.layers |= f;
}

SceneNode.prototype.isInLayer = function(num)
{
	return (this.layers & (1<<num)) !== 0;
}

SceneNode.prototype.getLayers = function()
{
	var r = [];
	if(!this.scene)
		return r;

	for(var i = 0; i < 32; ++i)
	{
		if( this.layers & (1<<i) )
			r.push( this.scene.layer_names[i] || ("layer"+i) );
	}
	return r;
}

/**
* Returns the root node of the prefab incase it is inside a prefab, otherwise null
* @method insidePrefab
* @return {Object} returns the node where the prefab starts
*/
SceneNode.prototype.insidePrefab = function()
{
	var aux = this;
	while( aux )
	{
		if(aux.prefab)
			return aux;
		aux = aux._parentNode;
	}
	return null;
}

/**
* remember clones this node and returns the new copy (you need to add it to the scene to see it)
* @method clone
* @return {Object} returns a cloned version of this node
*/
SceneNode.prototype.clone = function()
{
	var scene = this._in_tree;

	var new_name = scene ? scene.generateUniqueNodeName( this._name ) : this._name ;
	var newnode = new LS.SceneNode( new_name );
	var info = this.serialize();

	//remove all uids from nodes and components
	LS.clearUIds( info );

	info.uid = LS.generateUId("NODE-");
	newnode.configure( info );

	return newnode;
}

/**
* Configure this node from an object containing the info
* @method configure
* @param {Object} info the object with all the info (comes from the serialize method)
*/
SceneNode.prototype.configure = function(info)
{
	//identifiers parsing
	if (info.name)
		this.setName(info.name);
	else if (info.id)
		this.setName(info.id);
	if(info.layers !== undefined)
		this.layers = info.layers;

	if (info.uid)
		this.uid = info.uid;

	if (info.className && info.className.constructor == String)	
		this.className = info.className;

	if(info.node_type)
	{
		this.node_type = info.node_type;
		if(info.node_type == "JOINT")
			this._is_bone = true;
	}

	//some helpers (mostly for when loading from js object that come from importers or code)
	if(info.camera)
		this.addComponent( new LS.Camera( info.camera ) );

	if(info.light)
		this.addComponent( new LS.Light( info.light ) );

	//in case more than one mesh in on e node
	if(info.meshes)
	{
		for(var i = 0; i < info.meshes.length; ++i)
			this.addMeshComponents( info.meshes[i], info );
	}
	else if(info.mesh)
		this.addMeshComponents( info.mesh, info );

	//transform in matrix format could come from importers so we leave it
	if(info.position) 
		this.transform.position = info.position;
	if(info.model) 
		this.transform.fromMatrix( info.model ); 
	if(info.transform) 
		this.transform.configure( info.transform ); 

	//first the no components
	if(info.material)
	{
		var mat_classname = info.material.material_class;
		if(!mat_classname) 
			mat_classname = "StandardMaterial";
		var constructor = LS.MaterialClasses[mat_classname];
		if(constructor)
			this.material = typeof(info.material) == "string" ? info.material : new constructor( info.material );
		else
			console.warn("Material not found: " + mat_classname );
	}

	if(info.flags) //merge
		for(var i in info.flags)
			this.flags[i] = info.flags[i];
	
	//add animation tracks player
	if(info.animations)
	{
		this.animations = info.animations;
		this.addComponent( new LS.Components.PlayAnimation({animation:this.animations}) );
	}

	//extra user info
	if(info.extra)
		this.extra = info.extra;

	if(info.comments)
		this.comments = info.comments;

	//restore components
	if(info.components)
		this.configureComponents(info);

	if(info.prefab) 
		this.prefab = info.prefab; //assign and calls this.reloadFromPrefab();
	else //configure children if it is not a prefab
		this.configureChildren(info);

	LEvent.trigger(this,"configure",info);
}

//adds components according to a mesh
SceneNode.prototype.addMeshComponents = function( mesh_id, extra_info )
{
	extra_info = extra_info || {};

	var mesh = LS.ResourcesManager.meshes[ mesh_id ];

	if(!mesh)
	{
		console.warn( "SceneNode mesh not found: " + mesh_id );
		return;
	}

	var mesh_render_config = { mesh: mesh_id };

	if(extra_info.submesh_id !== undefined)
		mesh_render_config.submesh_id = extra_info.submesh_id;
	if(extra_info.morph_targets !== undefined)
		mesh_render_config.morph_targets = extra_info.morph_targets;

	var compo = new LS.Components.MeshRenderer( mesh_render_config );

	//parsed meshes have info about primitive
	if( mesh.primitive === "line_strip" )
	{
		compo.primitive = 3;
		delete mesh.primitive;
	}

	//add MeshRenderer
	this.addComponent( compo );

	//skinning
	if(mesh && mesh.bones)
	{
		compo = new LS.Components.SkinDeformer();
		this.addComponent( compo );
	}

	//morph targets
	if( mesh && mesh.morph_targets )
	{
		var compo = new LS.Components.MorphDeformer( { morph_targets: mesh.morph_targets } );
		this.addComponent( compo );
	}

}

/**
* Serializes this node by creating an object with all the info
* it contains info about the components too
* @method serialize
* @param {bool} ignore_prefab serializing wont returns children if it is a prefab, if you set this to ignore_prefab it will return all the info
* @return {Object} returns the object with the info
*/
SceneNode.prototype.serialize = function( ignore_prefab )
{
	var o = {};

	if(this._name) 
		o.name = this._name;
	if(this.uid) 
		o.uid = this.uid;
	if(this.className) 
		o.className = this.className;
	o.layers = this.layers;

	//work in progress
	if(this.node_type)
		o.node_type = this.node_type;

	//modules
	if(this.mesh && typeof(this.mesh) == "string") 
		o.mesh = this.mesh; //do not save procedural meshes
	if(this.submesh_id != null) 
		o.submesh_id = this.submesh_id;
	if(this.material) 
		o.material = typeof(this.material) == "string" ? this.material : this.material.serialize();
	if(this.prefab && !ignore_prefab) 
		o.prefab = this.prefab;

	if(this.flags) 
		o.flags = LS.cloneObject(this.flags);

	//extra user info
	if(this.extra) 
		o.extra = this.extra;
	if(this.comments) 
		o.comments = this.comments;

	if(this._children && (!this.prefab || ignore_prefab) )
		o.children = this.serializeChildren();

	//save components
	this.serializeComponents(o);

	//extra serializing info
	LEvent.trigger(this,"serialize",o);

	return o;
}

//used to recompute matrix so when parenting one node it doesnt lose its global transformation
SceneNode.prototype._onChildAdded = function( child_node, recompute_transform )
{
	if(recompute_transform && this.transform)
	{
		var M = child_node.transform.getGlobalMatrix(); //get son transform
		var M_parent = this.transform.getGlobalMatrix(); //parent transform
		mat4.invert(M_parent,M_parent);
		child_node.transform.fromMatrix( mat4.multiply(M_parent,M_parent,M) );
		child_node.transform.getGlobalMatrix(); //refresh
	}
	//link transform
	if(this.transform)
		child_node.transform._parent = this.transform;
}

SceneNode.prototype._onChangeParent = function( future_parent, recompute_transform )
{
	if(recompute_transform && future_parent.transform)
	{
		var M = this.transform.getGlobalMatrix(); //get son transform
		var M_parent = future_parent.transform.getGlobalMatrix(); //parent transform
		mat4.invert(M_parent,M_parent);
		this.transform.fromMatrix( mat4.multiply(M_parent,M_parent,M) );
	}
	//link transform
	if(future_parent.transform)
		this.transform._parent = future_parent.transform;
}

SceneNode.prototype._onChildRemoved = function( node, recompute_transform, remove_components )
{
	if(this.transform)
	{
		//unlink transform
		if(recompute_transform)
		{
			var m = node.transform.getGlobalMatrix();
			node.transform._parent = null;
			node.transform.fromMatrix(m);
		}
		else
			node.transform._parent = null;
	}

	if( remove_components )
		node.removeAllComponents();
}

//Computes the bounding box from the render instance of this node
//doesnt take into account children
SceneNode.prototype.getBoundingBox = function( bbox, only_instances )
{
	bbox = bbox || BBox.create();
	var render_instances = this._instances;
	if(render_instances)
		for(var i = 0; i < render_instances.length; ++i)
		{
			if(i == 0)
				bbox.set( render_instances[i].aabb );
			else
				BBox.merge( bbox, bbox, render_instances[i].aabb );
		}

	if(only_instances)
		return bbox;

	if( (!render_instances || render_instances.length == 0) && this.transform )
		return BBox.fromPoint( this.transform.getGlobalPosition() );

	return bbox;
}

LS.SceneNode = SceneNode;
LS.Classes.SceneNode = SceneNode;
