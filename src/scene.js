/* Dependencies
	+ Shaders.js: shaders compilation
	+ glMatrix: for maths
	+ litegl.js: for meshes and textures
	+ core.js: for main core functionality
	+ jQuery: for AJAX calls

*/




//To store all the registered components, useful for editors

/**
* The SceneTree contains all the info about the Scene and nodes
*
* @class SceneTree
* @constructor
*/

function SceneTree()
{
	this.init();
}

//globals
SceneTree.DEFAULT_BACKGROUND_COLOR = new Float32Array([0,0,0,1]);
SceneTree.DEFAULT_AMBIENT_COLOR = vec3.fromValues(0.2, 0.2, 0.2);

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
	this.materials = {}; //material cache
	this.local_repository = null;

	this.nodes = [];
	this.nodes_by_id = {};
	this.rt_cameras = [];

	this._components = []; //remove all components

	//this.camera = new Camera();
	if(this.camera) this.camera = null;
	this.addComponent( new Camera() );
	this.current_camera = this.camera;

	//this.light = new Light({ position: [100,100,100], target:[0,0,0]});
	if(this.light) this.light = null;
	this.addComponent( new Light({ position: vec3.fromValues(100,100,100), target: vec3.fromValues(0,0,0) }) );

	this.ambient_color = new Float32Array( SceneTree.DEFAULT_AMBIENT_COLOR );
	this.background_color = new Float32Array( SceneTree.DEFAULT_BACKGROUND_COLOR );
	this.textures = {};

	this.active_viewport = null;
	this.viewport = null;

	this.settings = {
		//auto_picking: true,	
		enable_shadows: true,
		enable_rts: true
	};

	this._frame = 0;
	this._time = 0;
	this._global_time = 0; //in seconds
	this._start_time = 0; //in seconds
	this._last_dt = 1/60; //in seconds
	this._must_redraw = true;

	if(this.selected_node) delete this.selected_node;

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
	while(this.nodes.length)
		this.removeNode(this.nodes[0]);

	//remove scene components
	this.processActionInComponents("onRemovedFromNode",this); //send to components
	this.processActionInComponents("onRemovedFromScene",this); //send to components

	this.init();
	LEvent.trigger(this,"clear");
	LEvent.trigger(this,"change");
}

/**
* Configure the Scene using an object (the object can be obtained from the function serialize)
* Inserts the nodes, configure them, and change the parameters
*
* @method configure
* @param {Object} scene_info the object containing all the info about the nodes and config of the scene
*/
SceneTree.prototype.configure = function(scene_info)
{
	this._components = [];
	this.camera = this.light = null; //legacy

	if(scene_info.object_type != "Scene")
		trace("Warning: object set to scene doesnt look like a propper one.");
	if(scene_info.local_repository)
		this.local_repository = scene_info.local_repository;
	//parse basics
	if(scene_info.background_color)
		this.background_color.set(scene_info.background_color);
	if(scene_info.ambient_color)
		this.ambient_color.set(scene_info.ambient_color);

	if(scene_info.textures)
		this.textures = scene_info.textures;

	//extra info that the user wanted to save (comments, etc)
	if(scene_info.extra)
		this.extra = scene_info.extra;

	//parse nodes and preserve ierarchy
	if(scene_info.nodes)
	{
		var with_parent = [];
		for(var i in scene_info.nodes)
		{
			var info = scene_info.nodes[i];
			var node = new SceneNode(info.id);
			node.configure(info);
			this.addNode(node);
			if(node._parent)
				with_parent.push(node);
		}
		//restore ierarchy
		for(var i in with_parent)
		{
			var node = with_parent[i];
			var parent = Scene.getNode( node._parent );
			if(parent)
				parent.addChild(node);
			LEvent.trigger(this,"nodeChangeParent", [parent, node]);
		}
	}

	//parse materials
	if(scene_info.materials)
		for(var i in scene_info.materials)
			this.materials[ i ] = new Material( scene_info.materials[i] );

	if(scene_info.components)
		this.configureComponents(scene_info);

	// LEGACY...
	if(scene_info.camera)
	{
		if(this.camera)
			this.camera.configure( scene_info.camera );
		else
			this.addComponent( new Camera( scene_info.camera ) );
	}

	if(scene_info.light)
	{
		if(this.light)
			this.light.configure( scene_info.light );
		else
			this.addComponent( new Light(scene_info.light) );
	}


	LEvent.trigger(this,"configure",scene_info);
	LEvent.trigger(this,"change");

	this.current_camera = this.camera;
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

	o.object_type = "Scene";
	o.ambient_color = toArray( this.ambient_color );
	o.background_color = toArray( this.background_color ); //to non-typed
	o.textures = cloneObject(this.textures);
	o.local_repository = this.local_repository;

	/*
	o.light = this.light.serialize();
	o.camera = this.camera.serialize();
	*/

	o.nodes = [];
	o.extra = this.extra || {};
	for(var i in this.nodes)
		o.nodes.push(this.nodes[i].serialize());

	if(this.materials)
	{
		o.materials = {};
		for(var i in this.materials)
			o.materials[ i ] = this.materials[i].serialize();
	}

	this.serializeComponents(o);

	LEvent.trigger(this,"serializing",o);

	return o;
}

/**
* loads a Scene from an Ajax call and pass it to the configure method.
*
* @method loadScene
* @param {String} url where the JSON object containing the scene is stored
* @param {Function}[on_complete=null] the callback to call when the loading is complete
* @param {Function}[on_error=null] the callback to call if there is a  loading error
*/

SceneTree.prototype.loadScene = function(url, on_complete, on_error)
{
	var that = this;
	var nocache = ResourcesManager.getNoCache(true);
	LS.request({
		url: url + nocache,
		dataType: 'json',
		success: inner_success,
		error: inner_error
	});

	function inner_success(response)
	{
		that.configure(response);
		that.loadResources();
		if(on_complete)
			on_complete();
	}

	function inner_error(err)
	{
		trace("Error loading scene: " + url + " -> " + err);
		if(on_error)
			on_error(url);
	}
}

SceneTree.prototype.appendScene = function(scene)
{
	if( getObjectClassName(scene) == "SceneTree")
		scene = scene.serialize();
	scene = { nodes: scene.nodes }
	this.configure(scene);
}

/**
* inserts a Node in the scene
*
* @method addNode
* @param {Object} node the node object
* @param {Number}[index=null] index to specify if you want to insert it after another node
*/

SceneTree.prototype.addNode = function(node, index)
{
	//node.scene = this;
	if(index == undefined)
		this.nodes.push(node);
	else
		this.nodes.splice(index,0,node);

	//generate unique id
	if(node.id && node.id != -1)
	{
		if(this.nodes_by_id[node.id] != null)
			node.id = node.id + "_" + (Math.random() * 1000).toFixed(0);
		this.nodes_by_id[node.id] = node;
	}

	node._on_scene = true;


	//LEvent.trigger(node,"onAddedToScene", this);
	node.processActionInComponents("onAddedToScene",this); //send to components
	LEvent.trigger(this,"nodeAdded", node);
	LEvent.trigger(this,"change");
	//$(this).trigger("nodeAdded", node);
}


/**
* removes the node from the scene
*
* @method removeNode
* @param {Object} node the node
* @return {Boolean} returns true if it was found and deleted
*/

SceneTree.prototype.removeNode = function(node)
{
	var pos = this.nodes.indexOf(node);
	if(pos != -1)
	{
		delete node.scene;
		this.nodes.splice(pos,1);
		if(node.id)
			delete this.nodes_by_id[ node.id ];
		node._on_scene = false;
		node.processActionInComponents("onRemovedFromNode",this); //send to components
		node.processActionInComponents("onRemovedFromScene",this); //send to components
		LEvent.trigger(this,"nodeRemoved", node);
		LEvent.trigger(this,"change");
		return true;
	}
	return false;
}

/**
* retrieves a Node
*
* @method getNode
* @param {String} id node id
* @return {Object} the node or null if it didnt find it
*/
SceneTree.prototype.getNode = function(id)
{
	return this.nodes_by_id[id];
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
	return this.nodes[index];
}

/**
* retrieves a Node index
*
* @method getNodeIndex
* @param {Node} node
* @return {Number} returns the node index in the nodes array
*/
SceneTree.prototype.getNodeIndex = function(node)
{
	return this.nodes.indexOf(node);
}

/**
* retrieves a Node
*
* @method getNodesByClass
* @param {String} className class name
* @return {Object} returns all the nodes that match this class name
*/

SceneTree.prototype.getNodesByClass = function(classname)
{
	var r = [];
	for (var i in this.nodes)
		if(this.nodes[i].className && this.nodes[i].className.split(" ").indexOf(classname) != -1)
			r.push(this.nodes[i]);
	return r;
}


/**
* loads all the resources of all the nodes in this scene
* it sends a signal to every node to get all the resources info
* and load them in bulk using the ResourceManager
*
* @method loadResources
*/

SceneTree.prototype.loadResources = function()
{
	var res = {};

	//scene resources
	for(var i in this.textures)
		if(this.textures[i])
			res[ this.textures[i] ] = Texture;

	if(this.light) this.light.getResources(res);

	//resources from nodes
	for(var i in this.nodes)
		this.nodes[i].getResources(res);

	//used for scenes with special repository folders
	var options = {};
	if(this.local_repository)
		options.local_repository = this.local_repository;

	ResourcesManager.loadResources(res);
	/* moved to Core
	for(var i in res)
	{
		if( typeof(i) != "string" || i[0] == ":" )
			continue;
	
		if(res[i] == Mesh)
			ResourcesManager.loadMesh( i, options );
		else if(res[i] == Texture)
			ResourcesManager.loadImage( i, options );
		else
			trace("Unknown resource type");
	}
	*/
}

/**
* updates the scene and nodes
*
* @method update
* @param {Number} dt delta time
*/
SceneTree.prototype.start = function(dt)
{
	LEvent.trigger(this,"start",this);
	this.sendEventToNodes("start");
}

/**
* renders the scene using the assigned renderer
*
* @method render
*/
SceneTree.prototype.render = function(camera, options)
{
	this._renderer.render(this, camera, options);
}


SceneTree.prototype.update = function(dt)
{
	LEvent.trigger(this,"beforeUpdate", this);

	this._global_time = new Date().getTime() * 0.001;
	this._time = this._start_time - this._global_time;
	this._last_dt = dt;

	LEvent.trigger(this,"update", dt);
	this.sendEventToNodes("update",dt, true);

	LEvent.trigger(this,"afterUpdate", this);
}

/**
* dispatch event to all nodes in the scene
*
* @method sendEventToNodes
* @param {String} event_type event type name
* @param {Object} data data to send associated to the event
*/

SceneTree.prototype.sendEventToNodes = function(event_type, data)
{
	for(var i in this.nodes)
	{
		LEvent.trigger( this.nodes[i], event_type, data);
	}
}


SceneTree.prototype.generateUniqueNodeName = function(prefix)
{
	prefix = prefix || "node";
	var i = 1;
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
	return this._global_time;
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

function SceneNode(id)
{
	//Generic
	this.id = id || ("node_" + (Math.random() * 10000).toFixed(0)); //generate random number
	this._uid = LS.generateUId();

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
	//this.material = new Material();
	this.extra = {}; //for extra info
}

//get methods from other classes
LS.extendClass(ComponentContainer, SceneTree); //container methods
LS.extendClass(ComponentContainer, SceneNode); //container methods

/**
* changes the node id (its better to do not change the id, it can lead to unexpected results)
* remember that two nodes can't have the same id
* @method setId
* @param {String} new_id the new id
* @return {Object} returns true if the name changed
*/

SceneNode.prototype.setId = function(new_id)
{
	if(Scene.getNode(new_id) != null)
	{
		trace("ID already in use");
		return false;
	}

	if(this.id == new_id) return;

	if(this.id)
		delete Scene.nodes_by_id[this.id];

	this.id = new_id;
	if(this.id)
		Scene.nodes_by_id[this.id] = this;

	LEvent.trigger(this,"id_changed", new_id);
	//$(this).trigger("id_changed");
	return true;
}

SceneNode.prototype.getResources = function(res)
{
	//resources in components
	for(var i in this._components)
		if( this._components[i].getResources )
			this._components[i].getResources( res );
	//res in material
	if(this.material)
		this.getMaterial().getResources( res );
	return res;
}

SceneNode.prototype.getTransform = function() {
	return this.transform;
}

//Mesh component
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

	if(ResourcesManager.meshes[mesh_filename] || !mesh_filename )
	{
		this.setMesh( mesh_filename );
		if(options.on_complete) options.on_complete( ResourcesManager.meshes[mesh_filename] ,this);
		return;
	}

	var that = this;
	var loaded = ResourcesManager.loadMesh(mesh_filename, options, function(mesh){
		that.setMesh(mesh.filename);
		that.loading -= 1;
		if(that.loading == 0)
		{
			LEvent.trigger(that,"resource_loaded",that);
			delete that.loading;
		}
		if(options.on_complete) options.on_complete(mesh,that);
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
	if (!this.material) return null;
	return this.material.constructor === String ? Scene.materials[this.material] : this.material;
}

// related to materials
/*
SceneNode.prototype.setTexture = function(texture_or_filename, channel)
{
	if(!this.material) this.material = new Material();
	this.material.setTexture(texture_or_filename,channel);
}

SceneNode.prototype.getTexture = function(channel) {
	channel = channel || "diffuse";
	if(!this.material) return null;
	var tex_name = this.material.textures[channel];
	if(tex_name)
		return ResourcesManager.textures[ tex_name ];
	return null;
}
*/

/**
* remember clones this node and returns the new copy (you need to add it to the scene to see it)
* @method clone
* @return {Object} returns a cloned version of this node
*/

SceneNode.prototype.clone = function()
{
	//TODO: improve this code
	var new_name = Scene.generateUniqueNodeName( this.id );

	var newnode = new SceneNode( new_child_name );
	newnode.configure( this.serialize() );

	for(var i in this._children)
	{
		var new_child_name = Scene.generateUniqueNodeName( this._children[i].id );
		var childnode = new SceneNode( new_child_name );
		childnode.configure( this._children[i].serialize() );
		newnode.addChild(childnode);
	}

	return newnode;
}

/**
* Configure this node from an object containing the info
* @method configure
* @param {Object} info the object with all the info (comes from the serialize method)
*/
SceneNode.prototype.configure = function(info)
{
	//if (info.id) this.id = info.id;	//id ignored, already set on constructor and avoid for cloning
	if (info.className)	this.className = info.className;

	if(info.mesh)
		this.addComponent( new MeshRenderer({ mesh: info.mesh, submesh_id: info.submesh_id }) );

	//first the no components
	if(info.material)
		this.material = typeof(info.material) == "string" ? info.material : new Material(info.material);
	//if(info.mesh) this.loadAndSetMesh(info.mesh);
	//if(info.submesh_id != null) this.submesh_id = info.submesh_id; //0 is valid

	if(info.flags) //merge
		for(var i in info.flags)
			this.flags[i] = info.flags[i];
	
	//DEPRECATED: hardcoded components
	if(info.transform) this.transform.configure( info.transform ); //all nodes have a transform
	if(info.light) this.addComponent( new Light(info.light) );
	if(info.camera)	this.addComponent( new Camera(info.camera) );

	//DEPRECATED: model in matrix format
	if(info.model) this.transform.fromMatrix( info.model ); 

	//ierarchy, TO DO
	if(info.children)
		this.children = info.children;

	//extra user info
	if(info.extra)
		this.extra = info.extra;

	if(info.comments)
		this.comments = info.comments;

	//ierarchy
	if(info.parent)
		this._parent = info.parent;

	//restore components
	if(info.components)
		this.configureComponents(info);

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

	if(this.id) o.id = this.id;
	if(this.className) o.className = this.className;

	//modules
	if(this.mesh && typeof(this.mesh) == "string") o.mesh = this.mesh; //do not save procedural meshes
	if(this.submesh_id != null) o.submesh_id = this.submesh_id;
	if(this.material) o.material = typeof(this.material) == "string" ? this.material : this.material.serialize();

	//DEPRECATED: they will be saved from the components
	/*
	if(this.transform) o.transform = this.transform.serialize();
	if(this.light) o.light = this.light.serialize();
	if(this.camera) o.camera = this.camera.serialize();
	*/

	if(this.flags) o.flags = cloneObject(this.flags);

	//extra user info
	if(this.extra) o.extra = this.extra;
	if(this.comments) o.comments = this.comments;

	//save children ierarchy
	if(this._parent)
		o.parent = this._parent.id;
	/*
	if(this._children && this._children.length)
	{
		o.children = [];
		for(var i in this._children)
			o.children.push( this._children[i].id );
	}
	*/

	//save components
	this.serializeComponents(o);

	//extra serializing info
	LEvent.trigger(this,"serialize",o);

	return o;
}

//scene graph tree ************************

/**
* Adds to this node a child node (use it carefully)
* @method addChild
* @param {Object} node the node to add as child
*/
SceneNode.prototype.addChild = function(node, recompute_transform )
{
	node._parent = this;
	if( !this._children )
		this._children = [node];
	else
		this._children.push(node);

	if(recompute_transform)
	{
		var M = node.transform.getGlobalMatrix(); //get son transform
		var M_parent = this.transform.getGlobalMatrix(); //parent transform
		mat4.invert(M_parent,M_parent);
		node.transform.fromMatrix( mat4.multiply(M_parent,M_parent,M) );
	}

	//link transform
	node.transform._parent = this.transform;

	LEvent.trigger(this,"nodeAdded", node);
}

/**
* Removes a node child from this node
* @method removeChild
* @param {Object} node the node to remove
*/
SceneNode.prototype.removeChild = function(node, recompute_transform)
{
	if(!this._children || node._parent != this) return;
	if( node._parent != this) return; //not his son
	var pos = this._children.indexOf(node);
	if(pos == -1) return; //not his son ¿?
	this._children.splice(pos,1);

	//unlink transform
	if(recompute_transform)
	{
		var m = node.transform.getGlobalMatrix();
		node.transform._parent = null;
		node.transform.fromMatrix(m);
	}
	node.transform._parent = null;
	LEvent.trigger(this,"nodeRemoved", node);
}

/**
* Removes a node child from this node
* @method removeChild
* @param {Object} node the node to remove
*/
SceneNode.prototype.getAllChildNodes = function(container)
{
	container = container || [];

	if(!this._children)
		return container;
	for(var i in this._children)
	{
		container.push(this._children[i]);
		this._children[i].getAllChildNodes(container);
	}
	return container;
}

/*
SceneNode.prototype.renderEditor = function(selected)
{
	Draw.setColor([1,0,1]);
	Draw.setLineWidth(2);
	Draw.renderCircle(10);
}
*/





//***************************************************************************

//create one default scene
var Scene = new SceneTree();

LS.SceneTree = SceneTree;
LS.SceneNode = SceneNode;

LS.ResourcesManager = ResourcesManager;
LS.Generators = Generators;


LS.newMeshNode = function(id,mesh_name)
{
	var node = new SceneNode(id);
	node.addComponent( new MeshRenderer() );
	node.setMesh(mesh_name);
	return node;
}

LS.newLightNode = function(id)
{
	var node = new SceneNode(id);
	node.addComponent( new Light() );
	return node;
}

LS.newCameraNode = function(id)
{
	var node = new SceneNode(id);
	node.addComponent( new Camera() );
	return node;
}

//*******************************/

