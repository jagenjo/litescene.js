/**
* The SceneTree contains all the info about the Scene and nodes
*
* @class SceneTree
* @constructor
*/

function SceneTree()
{
	this.uid = LS.generateUId("TREE-");

	this._root = new LS.SceneNode("root");
	this._root.removeAllComponents();
	this._root._is_root  = true;
	this._root._in_tree = this;
	this._nodes = [ this._root ];
	this._nodes_by_name = {"root":this._root};
	this._nodes_by_uid = {};
	this._nodes_by_uid[ this._root.uid ] = this._root;

	//FEATURES NOT YET FULLY IMPLEMENTED
	this._paths = []; //FUTURE FEATURE: to store splines I think
	this._local_resources = {}; //used to store resources that go with the scene
	this.animation = null;

	LEvent.bind( this, "treeItemAdded", this.onNodeAdded, this );
	LEvent.bind( this, "treeItemRemoved", this.onNodeRemoved, this );

	this.init();
}

Object.defineProperty( SceneTree.prototype, "root", {
	enumerable: true,
	get: function() {
		return this._root;
	},
	set: function(v) {
		throw("Root node cannot be replaced");
	}
});

//methods

/**
* This initializes the content of the scene.
* Call it to clear the scene content
*
* @method init
* @return {Boolean} Returns true on success
*/
SceneTree.prototype.init = function()
{
	this.id = "";
	//this.materials = {}; //shared materials cache: moved to LS.RM.resources
	this.local_repository = null;

	this._root.removeAllComponents();
	this._root.uid = LS.generateUId("NODE-");

	this._nodes = [ this._root ];
	this._nodes_by_name = { "root": this._root };
	this._nodes_by_uid = {};
	this._nodes_by_uid[ this._root.uid ] = this._root;

	//default components
	this.info = new LS.Components.GlobalInfo();
	this._root.addComponent( this.info );
	this._root.addComponent( new LS.Camera() );
	this.current_camera = this._root.camera;
	this._root.addComponent( new LS.Light({ position: vec3.fromValues(100,100,100), target: vec3.fromValues(0,0,0) }) );

	this._frame = 0;
	this._last_collect_frame = -1; //force collect

	this._time = 0;
	this._global_time = 0; //in seconds
	this._start_time = 0; //in seconds
	this._last_dt = 1/60; //in seconds
	this._must_redraw = true;

	if(this.selected_node) 
		delete this.selected_node;

	this.animation = null;
	this._local_resources = {};
	this.extra = {};

	this._renderer = LS.Renderer;
}

/**
* Clears the scene using the init function
* and trigger a "clear" LEvent
*
* @method clear
*/
SceneTree.prototype.clear = function()
{
	//remove all nodes to ensure no lose callbacks are left
	while(this._root._children && this._root._children.length)
		this._root.removeChild(this._root._children[0]);

	//remove scene components
	this._root.processActionInComponents("onRemovedFromNode",this); //send to components
	this._root.processActionInComponents("onRemovedFromScene",this); //send to components

	this.init();
	/**
	 * Fired when the whole scene is cleared
	 *
	 * @event clear
	 */
	LEvent.trigger(this,"clear");
	LEvent.trigger(this,"change");
}

/**
* Configure the Scene using an object (the object can be obtained from the function serialize)
* Inserts the nodes, configure them, and change the parameters
* Destroys previously existing info
*
* @method configure
* @param {Object} scene_info the object containing all the info about the nodes and config of the scene
*/
SceneTree.prototype.configure = function(scene_info)
{
	this._root.removeAllComponents(); //remove light and camera

	//this._components = [];
	//this.camera = this.light = null; //legacy

	if(scene_info.uid)
		this.uid = scene_info.uid;

	if(scene_info.object_type != "SceneTree")
		console.warn("Warning: object set to scene doesnt look like a propper one.");

	if(scene_info.local_repository)
		this.local_repository = scene_info.local_repository;

	//extra info that the user wanted to save (comments, etc)
	if(scene_info.extra)
		this.extra = scene_info.extra;

	if(scene_info.root)
		this.root.configure( scene_info.root );

	//LEGACY
	if(scene_info.nodes)
		this.root.configure( { children: scene_info.nodes } );

	//parse materials
	/*
	if(scene_info.materials)
		for(var i in scene_info.materials)
			this.materials[ i ] = new Material( scene_info.materials[i] );
	*/

	//LEGACY
	if(scene_info.components)
		this._root.configureComponents(scene_info);

	// LEGACY...
	if(scene_info.camera)
	{
		if(this._root.camera)
			this._root.camera.configure( scene_info.camera );
		else
			this._root.addComponent( new Camera( scene_info.camera ) );
	}

	if(scene_info.light)
	{
		if(this._root.light)
			this._root.light.configure( scene_info.light );
		else
			this._root.addComponent( new Light(scene_info.light) );
	}
	else if(scene_info.hasOwnProperty("light")) //light is null
	{
		//skip default light
		if(this._root.light)
		{
			this._root.removeComponent( this._root.light );
			this._root.light = null;
		}
	}

	//TODO
	if( scene_info._local_resources )
	{
	}

	if(scene_info.animation)
		this.animation = new LS.Animation( scene_info.animation );

	//if(scene_info.animations)
	//	this._root.animations = scene_info.animations;

	/**
	 * Fired after the scene has been configured
	 * @event configure
	 * @param {Object} scene_info contains all the info to do the configuration
	 */
	LEvent.trigger(this,"configure",scene_info);
	LEvent.trigger(this,"change");
}

/**
* Creates and object containing all the info about the scene and nodes.
* The oposite of configure.
* It calls the serialize method in every node
*
* @method serialize
* @return {Object} return a JS Object with all the scene info
*/

SceneTree.prototype.serialize = function()
{
	var o = {};

	o.uid = this.uid;
	o.object_type = LS.getObjectClassName(this);

	//legacy
	o.local_repository = this.local_repository;

	//o.nodes = [];
	o.extra = this.extra || {};

	//add nodes
	o.root = this.root.serialize();

	if(this.animation)
		o.animation = this.animation.serialize();

	//add shared materials
	/*
	if(this.materials)
	{
		o.materials = {};
		for(var i in this.materials)
			o.materials[ i ] = this.materials[i].serialize();
	}
	*/

	//serialize scene components
	//this.serializeComponents(o);

	/**
	 * Fired after the scene has been serialized to an object
	 * @event serialize
	 * @param {Object} object to store the persistent info
	 */
	LEvent.trigger(this,"serialize",o);

	return o;
}

/**
* loads a scene from a JSON description
*
* @method load
* @param {String} url where the JSON object containing the scene is stored
* @param {Function}[on_complete=null] the callback to call when the loading is complete
* @param {Function}[on_error=null] the callback to call if there is a  loading error
*/

SceneTree.prototype.load = function(url, on_complete, on_error)
{
	if(!url) return;
	var that = this;
	var nocache = LS.ResourcesManager.getNoCache(true);
	if(nocache)
		url += (url.indexOf("?") == -1 ? "?" : "&") + nocache;


	LS.Network.request({
		url: url,
		dataType: 'json',
		success: inner_success,
		error: inner_error
	});

	/**
	 * Fired before loading scene
	 * @event beforeLoad
	 */
	LEvent.trigger(this,"beforeLoad");

	function inner_success(response)
	{
		that.init();
		that.configure(response);
		that.loadResources(inner_all_loaded);
		/**
		 * Fired when the scene has been loaded but before the resources
		 * @event load
		 */
		LEvent.trigger(that,"load");
	}

	function inner_all_loaded()
	{
		if(on_complete)
			on_complete(that, url);
		/**
		 * Fired after all resources have been loaded
		 * @event loadCompleted
		 */
		LEvent.trigger(that,"loadCompleted");
	}

	function inner_error(err)
	{
		console.warn("Error loading scene: " + url + " -> " + err);
		if(on_error)
			on_error(url);
	}
}

SceneTree.prototype.appendScene = function(scene)
{
	//clone: because addNode removes it from scene.nodes array
	var nodes = scene.root.childNodes;

	/*
	//bring materials
	for(var i in scene.materials)
		this.materials[i] = scene.materials[i];
	*/
	
	//add every node one by one
	for(var i in nodes)
	{
		var node = nodes[i];
		var new_node = new LS.SceneNode( node.id );
		this.root.addChild( new_node );
		new_node.configure( node.constructor == LS.SceneNode ? node.serialize() : node  );
	}
}

SceneTree.prototype.getCamera = function()
{
	var camera = this._root.camera;
	if(camera) 
		return camera;

	if(this._cameras && this._cameras.length)
		return this._cameras[0];

	this.collectData(); //slow
	return this._cameras[0];
}

SceneTree.prototype.getLight = function()
{
	return this._root.light;
}

SceneTree.prototype.onNodeAdded = function(e,node)
{
	//remove from old scene
	if(node._in_tree && node._in_tree != this)
		throw("Cannot add a node from other scene, clone it");

	if( node._name && !this._nodes_by_name[ node._name ] )
		this._nodes_by_name[ node._name ] = node;

	/*
	//generate unique id
	if(node.id && node.id != -1)
	{
		if(this._nodes_by_id[node.id] != null)
			node.id = node.id + "_" + (Math.random() * 1000).toFixed(0);
		this._nodes_by_id[node.id] = node;
	}
	*/

	//store by uid
	if(!node.uid)
		node.uid = LS.generateUId("NODE-");
	this._nodes_by_uid[ node.uid ] = node;

	//store nodes linearly
	this._nodes.push(node);

	//LEvent.trigger(node,"onAddedToScene", this);
	node.processActionInComponents("onAddedToScene",this); //send to components
	/**
	 * Fired when a new node is added to this scene
	 *
	 * @event nodeAdded
	 * @param {LS.SceneNode} node
	 */
	LEvent.trigger(this,"nodeAdded", node);
	LEvent.trigger(this,"change");
}

SceneTree.prototype.onNodeRemoved = function(e,node)
{
	var pos = this._nodes.indexOf(node);
	if(pos == -1) 
		return;

	this._nodes.splice(pos,1);
	if(node._name && this._nodes_by_name[ node._name ] == node )
		delete this._nodes_by_name[ node._name ];
	if(node.uid)
		delete this._nodes_by_uid[ node.uid ];

	//node.processActionInComponents("onRemovedFromNode",node);
	node.processActionInComponents("onRemovedFromScene",this); //send to components

	/**
	 * Fired after a node has been removed
	 *
	 * @event nodeRemoved
	 * @param {LS.SceneNode} node
	 */
	LEvent.trigger(this,"nodeRemoved", node);
	LEvent.trigger(this,"change");
	return true;
}


SceneTree.prototype.getNodes = function()
{
	return this._nodes;
}

/**
* retrieves a Node based on the name or uid
*
* @method getNode
* @param {String} id node id
* @return {Object} the node or null if it didnt find it
*/
SceneTree.prototype.getNode = function( name )
{
	if(!name)
		return null;
	if(name.charAt(0) == LS._uid_prefix)
		return this._nodes_by_uid[ name ];
	return this._nodes_by_name[ name ];
}

/**
* retrieves a Node that matches that name. It is fast because they are stored in an object.
* If more than one object has the same name, the first one added to the tree is returned
*
* @method getNodeByName
* @param {String} name name of the node
* @return {Object} the node or null if it didnt find it
*/
SceneTree.prototype.getNodeByName = function(name)
{
	return this._nodes_by_name[ name ];
}


/**
* retrieves a Node based on a given uid. It is fast because they are stored in an object
*
* @method getNodeByUId
* @param {String} uid uid of the node
* @return {Object} the node or null if it didnt find it
*/
SceneTree.prototype.getNodeByUId = function(uid)
{
	return this._nodes_by_uid[ uid ];
}

/**
* retrieves a Node by its index
*
* @method getNodeByIndex
* @param {Number} node index
* @return {Object} returns the node at the 'index' position in the nodes array
*/
SceneTree.prototype.getNodeByIndex = function(index)
{
	return this._nodes[ index ];
}

//for those who are more traditional
SceneTree.prototype.getElementById = SceneTree.prototype.getNode;

/**
* retrieves a node array filtered by the filter function
*
* @method filterNodes
* @param {function} filter a callback function that receives every node and must return true or false
* @return {Array} array containing the nodes that passes the filter
*/
SceneTree.prototype.filterNodes = function( filter )
{
	var r = [];
	for(var i = 0; i < this._nodes.length; ++i)
		if( filter(this._nodes[i]) )
			r.push(this._nodes[i]);
	return r;
}

/**
* searches the component with this uid, it iterates through all the nodes and components (slow)
*
* @method findComponentByUId
* @param {String} uid uid of the node
* @return {Object} component or null
*/
SceneTree.prototype.findComponentByUId = function(uid)
{
	for(var i = 0; i < this._nodes.length; ++i)
	{
		var compo = this._nodes[i].getComponentByUId( uid );
		if(compo)
			return compo;
	}
	return null;
}

/**
* Returns information of a node component property based on the locator of that property
* Locators are in the form of "{NODE_UID}/{COMPONENT_UID}/{property_name}"
*
* @method getPropertyInfo
* @param {String} locator locator of the property
* @return {Object} object with node, component, name, and value
*/
SceneTree.prototype.getPropertyInfo = function( property_uid )
{
	var path = property_uid.split("/");
	var node = this.getNode( path[0] );
	if(!node)
		return null;

	return node.getPropertyInfoFromPath( path );
}

/**
* Returns information of a node component property based on the locator of that property
* Locators are in the form of "{NODE_UID}/{COMPONENT_UID}/{property_name}"
*
* @method getPropertyInfoFromPath
* @param {Array} path
* @return {Object} object with node, component, name, and value
*/
SceneTree.prototype.getPropertyInfoFromPath = function( path )
{
	var node = this.getNode( path[0] );
	if(!node)
		return null;
	return node.getPropertyInfoFromPath( path );
}



/**
* Assigns a value to the property of a component in a node based on the locator of that property
* Locators are in the form of "{NODE_UID}/{COMPONENT_UID}/{property_name}"
*
* @method setPropertyValue
* @param {String} locator locator of the property
* @param {*} value the value to assign
* @param {Component} target [Optional] used to avoid searching for the component every time
* @return {Component} the target where the action was performed
*/
SceneTree.prototype.setPropertyValue = function( locator, value )
{
	var path = locator.split("/");

	//get node
	var node = this.getNode( path[0] );
	if(!node)
		return null;

	return node.setPropertyValueFromPath( path, value );
}

/**
* Assigns a value to the property of a component in a node based on the locator that property
* Locators are in the form of "{NODE_UID}/{COMPONENT_UID}/{property_name}"
*
* @method setPropertyValueFromPath
* @param {Array} path a property locator split by "/"
* @param {*} value the value to assign
* @return {Component} the target where the action was performed
*/
SceneTree.prototype.setPropertyValueFromPath = function( property_path, value )
{
	//get node
	var node = this.getNode( property_path[0] );
	if(!node)
		return null;

	return node.setPropertyValueFromPath( property_path, value );
}


/**
* loads all the resources of all the nodes in this scene
* it sends a signal to every node to get all the resources info
* and load them in bulk using the ResourceManager
*
* @method loadResources
*/

SceneTree.prototype.loadResources = function(on_complete)
{
	var res = {};

	//scene resources
	for(var i in this.textures)
		if(this.textures[i])
			res[ this.textures[i] ] = Texture;

	if(this.light) this.light.getResources(res);

	//resources from nodes
	for(var i in this._nodes)
		this._nodes[i].getResources(res);

	//used for scenes with special repository folders
	var options = {};
	if(this.local_repository)
		options.local_repository = this.local_repository;

	//count resources
	var num_resources = 0;
	for(var i in res)
		++num_resources;

	//load them
	if(num_resources == 0)
	{
		if(on_complete)
			on_complete();
		return;
	}

	LEvent.bind( LS.ResourcesManager, "end_loading_resources", on_loaded );
	LS.ResourcesManager.loadResources(res);

	function on_loaded()
	{
		LEvent.unbind( LS.ResourcesManager, "end_loading_resources", on_loaded );
		if(on_complete)
			on_complete();
	}
}

/**
* start the scene (triggers and start event)
*
* @method start
* @param {Number} dt delta time
*/
SceneTree.prototype.start = function()
{
	if(this._state == "running") return;

	this._state = "running";
	this._start_time = getTime() * 0.001;
	/**
	 * Fired when the scene is starting to play
	 *
	 * @event start
	 * @param {LS.SceneTree} scene
	 */
	LEvent.trigger(this,"start",this);
	this.triggerInNodes("start");
}

/**
* stop the scene (triggers and start event)
*
* @method stop
* @param {Number} dt delta time
*/
SceneTree.prototype.stop = function()
{
	if(this._state == "stopped") return;

	this._state = "stopped";
	/**
	 * Fired when the scene stops playing
	 *
	 * @event stop
	 * @param {LS.SceneTree} scene
	 */
	LEvent.trigger(this,"stop",this);
	this.triggerInNodes("stop");
	this.purgeResidualEvents();
}


/**
* renders the scene using the assigned renderer
*
* @method render
*/
SceneTree.prototype.render = function(options)
{
	this._renderer.render(this, options);
}

//This methods crawls the whole tree and collects all the useful info (cameras, lights, render instances, colliders, etc)
SceneTree.prototype.collectData = function()
{
	//var nodes = scene.nodes;
	var nodes = this.getNodes();
	var instances = [];
	var lights = [];
	var cameras = [];
	var colliders = [];

	//collect render instances, lights and cameras
	for(var i = 0, l = nodes.length; i < l; ++i)
	{
		var node = nodes[i];

		if(node.flags.visible == false) //skip invisibles
			continue;

		//trigger event 
		LEvent.trigger(node, "computeVisibility"); //, {camera: camera} options: options }

		//compute global matrix
		if(node.transform)
			node.transform.updateGlobalMatrix();

		//special node deformers (done here because they are shared for every node)
			//this should be moved to Renderer but not a clean way to do it
			var node_macros = {};
			LEvent.trigger(node, "computingShaderMacros", node_macros );

			var node_uniforms = {};
			LEvent.trigger(node, "computingShaderUniforms", node_uniforms );

		//store info
		node._macros = node_macros;
		node._uniforms = node_uniforms;
		node._instances = [];

		//get render instances: remember, triggers only support one parameter
		LEvent.trigger(node,"collectRenderInstances", node._instances );
		LEvent.trigger(node,"collectPhysicInstances", colliders );
		LEvent.trigger(node,"collectLights", lights );
		LEvent.trigger(node,"collectCameras", cameras );

		instances = instances.concat( node._instances );
	}

	//we also collect from the scene itself just in case (TODO: REMOVE THIS)
	LEvent.trigger(this, "collectRenderInstances", instances );
	LEvent.trigger(this, "collectPhysicInstances", colliders );
	LEvent.trigger(this, "collectLights", lights );
	LEvent.trigger(this, "collectCameras", cameras );

	//for each render instance collected
	for(var i = 0, l = instances.length; i < l; ++i)
	{
		var instance = instances[i];
		//compute the axis aligned bounding box
		if(!(instance.flags & RI_IGNORE_FRUSTUM))
			instance.updateAABB();
	}

	//for each physics instance collected
	for(var i = 0, l = colliders.length; i < l; ++i)
	{
		var collider = colliders[i];
		collider.updateAABB();
	}

	this._instances = instances;
	this._lights = lights;
	this._cameras = cameras;
	this._colliders = colliders;

	//remember when was last time I collected to avoid repeating it
	this._last_collect_frame = this._frame;
}

//instead of recollect everything, we can reuse the info from previous frame, but objects need to be updated
SceneTree.prototype.updateCollectedData = function()
{
	var nodes = this._nodes;
	var instances = this._instances;
	var lights = this._lights;
	var cameras = this._cameras;
	var colliders = this._colliders;

	//update matrices
	for(var i = 0, l = nodes.length; i < l; ++i)
		if(nodes[i].transform)
			nodes[i].transform.updateGlobalMatrix();
	
	//render instances: just update them
	for(var i = 0, l = instances.length; i < l; ++i)
	{
		var instance = instances[i];
		if(instance.flags & RI_IGNORE_AUTOUPDATE)
			instance.update();
		//compute the axis aligned bounding box
		if(!(instance.flags & RI_IGNORE_FRUSTUM))
			instance.updateAABB();
	}

	//lights
	for(var i = 0, l = lights.length; i < l; ++i)
	{
	}

	//cameras
	for(var i = 0, l = cameras.length; i < l; ++i)
	{
	}

	//colliders
	for(var i = 0, l = colliders.length; i < l; ++i)
	{
		var collider = colliders[i];
		collider.updateAABB();
	}
}

SceneTree.prototype.update = function(dt)
{
	/**
	 * Fired before doing an update
	 *
	 * @event beforeUpdate
	 * @param {LS.SceneTree} scene
	 */
	LEvent.trigger(this,"beforeUpdate", this);

	this._global_time = getTime() * 0.001;
	this._time = this._global_time - this._start_time;
	this._last_dt = dt;

	/**
	 * Fired while updating
	 *
	 * @event update
	 * @param {number} dt
	 */
	LEvent.trigger(this,"update", dt);
	this.triggerInNodes("update",dt, true);

	/**
	 * Fired after updating the scene
	 *
	 * @event afterUpdate
	 */
	LEvent.trigger(this,"afterUpdate", this);
}

/**
* triggers an event to all nodes in the scene
*
* @method triggerInNodes
* @param {String} event_type event type name
* @param {Object} data data to send associated to the event
*/

SceneTree.prototype.triggerInNodes = function(event_type, data)
{
	LEvent.triggerArray( this._nodes, event_type, data);
}


SceneTree.prototype.generateUniqueNodeName = function(prefix)
{
	prefix = prefix || "node";
	var i = 1;

	var pos = prefix.lastIndexOf("_");
	if(pos)
	{
		var n = prefix.substr(pos+1);
		if( parseInt(n) )
		{
			i = parseInt(n);
			prefix = prefix.substr(0,pos);
		}
	}

	var node_name = prefix + "_" + i;
	while( this.getNode(node_name) != null )
		node_name = prefix + "_" + (i++);
	return node_name;
}


SceneTree.prototype.refresh = function()
{
	this._must_redraw = true;
}


SceneTree.prototype.getTime = function()
{
	return this._time;
}

//This is ugly but sometimes if scripts fail there is a change the could get hooked to the scene forever
//so this way we remove any event that belongs to a component thats doesnt belong to this scene tree
SceneTree.prototype.purgeResidualEvents = function()
{
	//crawl all 
	for(var i in this)
	{
		if(i.substr(0,5) != "__on_")
			continue;

		var event = this[i];
		if(!event)
			continue;
		var to_keep = [];
		for(var j = 0; j < event.length; ++j)
		{
			var inst = event[j][1];
			if(inst && LS.isClassComponent( inst.constructor ) )
			{
				//no attached node or node not attached to any scene
				if(!inst._root || inst._root.scene !== this )
					continue; //skip keeping it, so it will no longer exist
			}
			to_keep.push(event[j]);
		}
		this[i] = to_keep;
	}
}


//****************************************************************************

/**
* The SceneNode class represents and object in the scene
* Is the base class for all objects in the scene as meshes, lights, cameras, and so
*
* @class SceneNode
* @param{String} id the id (otherwise a random one is computed)
* @constructor
*/

function SceneNode( name )
{
	//Generic
	this._name = name || ("node_" + (Math.random() * 10000).toFixed(0)); //generate random number
	this.uid = LS.generateUId("NODE-");

	this._classList = {};
	//this.className = "";
	//this.mesh = "";

	//flags
	this.flags = {
		visible: true,
		selectable: true,
		two_sided: false,
		flip_normals: false,
		//seen_by_camera: true,
		//seen_by_reflections: true,
		cast_shadows: true,
		receive_shadows: true,
		ignore_lights: false, //not_affected_by_lights
		alpha_test: false,
		alpha_shadows: false,
		depth_test: true,
		depth_write: true
	};

	//Basic components
	this._components = []; //used for logic actions
	this.addComponent( new Transform() );

	//material
	this._material = null;
	//this.material = new Material();
	this.extra = {}; //for extra info
}

//get methods from other classes
LS.extendClass(SceneNode, ComponentContainer); //container methods
LS.extendClass(SceneNode, CompositePattern); //container methods

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

Object.defineProperty( SceneNode.prototype, 'material', {
	set: function(v)
	{
		this._material = v;
		if(!v)
			return;
		if(v.constructor === String)
			return;
		if(v._root && v._root != this)
			console.warn( "Cannot assign a material of one SceneNode to another, you must clone it or register it" )
		else
			v._root = this; //link
	},
	get: function(){
		return this._material;
	},
	enumerable: true
});
	

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

SceneNode.prototype.getPropertyInfoFromPath = function( path )
{
	var target = this;
	var varname = path[1];

	if(path.length == 1)
		return {
			node: this,
			target: null,
			name: "",
			value: null,
			type: "node"
		};
    else if(path.length == 2) //compo/var
	{
		if(path[1][0] == "@")
		{
			target = this.getComponentByUId( path[1] );
			return {
				node: this,
				target: target,
				name: target ? LS.getObjectClassName( target ) : "",
				type: "component"
			};
		}
		else if (path[1] == "material")
		{
			target = this.getMaterial();
			return {
				node: this,
				target: target,
				name: target ? LS.getObjectClassName( target ) : "",
				type: "material"
			};
		}

		var target = this.getComponent( path[1] );
		return {
			node: this,
			target: target,
			name: target ? LS.getObjectClassName( target ) : "",
			type: "component"
		};
	}
    else if(path.length > 2) //compo/var
	{
		if(path[1][0] == "@")
		{
			varname = path[2];
			target = this.getComponentByUId( path[1] );
		}
		else if (path[1] == "material")
		{
			target = this.getMaterial();
			varname = path[2];
		}
		else
		{
			target = this.getComponent( path[1] );
			varname = path[2];
		}

		if(!target)
			return null;
	}
	else if(path[1] == "matrix") //special case
		target = this.transform;

	var v = undefined;

	if( target.getPropertyInfoFromPath && target != this )
	{
		var r = target.getPropertyInfoFromPath( path );
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

SceneNode.prototype.setPropertyValueFromPath = function( path, value )
{
	var target = null;
	var varname = path[1];

	if(path.length > 2)
	{
		if(path[1][0] == "@")
		{
			varname = path[2];
			target = this.getComponentByUId( path[1] );
		}
		else if( path[1] == "material" )
		{
			target = this.getMaterial();
			varname = path[2];
		}
		else 
		{
			target = this.getComponent( path[1] );
			varname = path[2];
		}

		if(!target)
			return null;
	}
	else if(path[1] == "matrix") //special case
		target = this.transform;
	else
		target = this;

	if(target.setPropertyValueFromPath && target != this)
		if( target.setPropertyValueFromPath(path, value) === true )
			return target;
	
	if(target.setPropertyValue)
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

SceneNode.prototype.getResources = function(res, include_children)
{
	//resources in components
	for(var i in this._components)
		if( this._components[i].getResources )
			this._components[i].getResources( res );

	//res in material
	if(this.material)
	{
		if(typeof(this.material) == "string")
		{
			if(this.material[0] != ":") //not a local material, then its a reference
			{
				res[this.material] = LS.Material;
			}
		}
		else //get the material to get the resources
		{
			var mat = this.getMaterial();
			if(mat)
				mat.getResources( res );
		}
	}

	//prefab
	if(this.prefab)
		res[this.prefab] = LS.Prefab;

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
		this.addComponent(new MeshRenderer({ mesh: mesh_name, submesh_id: submesh_id }));
}

SceneNode.prototype.loadAndSetMesh = function(mesh_filename, options)
{
	options = options || {};

	if(LS.ResourcesManager.meshes[mesh_filename] || !mesh_filename )
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
		return this._in_tree ? LS.ResourcesManager.materials[ this.material ] : null;
	return this.material;
}


SceneNode.prototype.setPrefab = function(prefab_name)
{
	this._prefab_name = prefab_name;
	var prefab = LS.ResourcesManager.resources[prefab_name];
	if(!prefab)
		return;


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

	if (info.uid)
	{
		if( this._in_tree && this._in_tree._nodes_by_uid[ this.uid ] )
			delete this._in_tree._nodes_by_uid[ this.uid ];
		this.uid = info.uid;
		if( this._in_tree )
			this._in_tree._nodes_by_uid[ this.uid ] = this;
	}
	if (info.className && info.className.constructor == String)	
		this.className = info.className;

	//TO DO: Change this to more generic stuff
	//some helpers (mostly for when loading from js object that come from importers
	if(info.mesh)
	{
		var mesh_id = info.mesh;

		var mesh = LS.ResourcesManager.meshes[ mesh_id ];
		var mesh_render_config = { mesh: mesh_id };

		if(info.submesh_id !== undefined)
			mesh_render_config.submesh_id = info.submesh_id;
		if(info.morph_targets !== undefined)
			mesh_render_config.morph_targets = info.morph_targets;

		if(mesh && mesh.bones)
			this.addComponent( new LS.Components.SkinnedMeshRenderer(mesh_render_config) );
		else
			this.addComponent( new LS.Components.MeshRenderer(mesh_render_config) );
	}

	//transform in matrix format could come from importers so we leave it
	if(info.model) 
		this.transform.fromMatrix( info.model ); 

	//first the no components
	if(info.material)
	{
		var mat_class = info.material.material_class;
		if(!mat_class) 
			mat_class = "Material";
		this.material = typeof(info.material) == "string" ? info.material : new LS.MaterialClasses[mat_class](info.material);
	}

	if(info.flags) //merge
		for(var i in info.flags)
			this.flags[i] = info.flags[i];
	
	if(info.prefab) 
		this.prefab = info.prefab;

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

	//configure children too
	this.configureChildren(info);

	LEvent.trigger(this,"configure",info);
}

/**
* Serializes this node by creating an object with all the info
* it contains info about the components too
* @method serialize
* @return {Object} returns the object with the info
*/
SceneNode.prototype.serialize = function()
{
	var o = {};

	if(this._name) 
		o.name = this._name;
	if(this.uid) 
		o.uid = this.uid;
	if(this.className) 
		o.className = this.className;

	//modules
	if(this.mesh && typeof(this.mesh) == "string") 
		o.mesh = this.mesh; //do not save procedural meshes
	if(this.submesh_id != null) 
		o.submesh_id = this.submesh_id;
	if(this.material) 
		o.material = typeof(this.material) == "string" ? this.material : this.material.serialize();
	if(this.prefab) 
		o.prefab = this.prefab;

	if(this.flags) 
		o.flags = LS.cloneObject(this.flags);

	//extra user info
	if(this.extra) 
		o.extra = this.extra;
	if(this.comments) 
		o.comments = this.comments;

	if(this._children)
		o.children = this.serializeChildren();

	//save components
	this.serializeComponents(o);

	//extra serializing info
	LEvent.trigger(this,"serialize",o);

	return o;
}

//used to recompute matrix so when parenting one node it doesnt lose its global transformation
SceneNode.prototype._onChildAdded = function(child_node, recompute_transform)
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

SceneNode.prototype._onChangeParent = function(future_parent, recompute_transform)
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

SceneNode.prototype._onChildRemoved = function(node, recompute_transform)
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
}


//***************************************************************************

//create one default scene

LS.SceneTree = SceneTree;
LS.SceneNode = SceneNode;
var Scene = LS.GlobalScene = new SceneTree();

LS.newMeshNode = function(id,mesh_name)
{
	var node = new LS.SceneNode(id);
	node.addComponent( new LS.Components.MeshRenderer() );
	node.setMesh(mesh_name);
	return node;
}

LS.newLightNode = function(id)
{
	var node = new LS.SceneNode(id);
	node.addComponent( new LS.Components.Light() );
	return node;
}

LS.newCameraNode = function(id)
{
	var node = new LS.SceneNode(id);
	node.addComponent( new LS.Components.Camera() );
	return node;
}

//*******************************/

