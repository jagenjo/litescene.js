///@INFO: GRAPHS
/* Requires LiteGraph.js ******************************/

//on include, link to resources manager
if(typeof(LGraphTexture) != "undefined")
{
	//link LGraph textures system with LiteScene
	LGraphTexture.getTexturesContainer = function() { return LS.ResourcesManager.textures };
	LGraphTexture.storeTexture = function(name, texture) { return LS.ResourcesManager.registerResource(name, texture); };
	LGraphTexture.loadTexture = LS.ResourcesManager.load.bind( LS.ResourcesManager );
}


if( typeof(LGAudio) != "undefined" )
{
	LGAudio.onProcessAudioURL = function(url)
	{
		return LS.RM.getFullURL(url);
	}
}


/**
* This component allow to integrate a behaviour graph on any object
* @class GraphComponent
* @namespace LS.Components
* @param {Object} o object with the serialized info
*/
function GraphComponent(o)
{
	this.enabled = true;
	this.from_file = false;
	this.force_redraw = false;
	this._filename = null;
	this._graphcode = null;
	this._graph_properties = null;
	//this._properties_by_id = {};

	this.on_event = "update";

	if(typeof(LiteGraph) == "undefined")
		return console.error("Cannot use GraphComponent if LiteGraph is not installed");

	this._graph_version = -1;
	this._graph = new LGraph();
	this._graph.getScene = function() { return this._scene || LS.GlobalScene; } //this OR is ugly
	this._graph._scenenode = null;
	this._loading = false;

	if(o)
		this.configure(o);
	else if(!this.from_file)//default
	{
		var graphnode = this._default_node = LiteGraph.createNode("scene/node");
		this._graph.add( graphnode );
	}
	
	LEvent.bind( this,"trigger", this.trigger, this );	
}

GraphComponent["@on_event"] = { type:"enum", values: ["start","render","beforeRenderScene","update","trigger"] };
GraphComponent["@filename"] = { type:"resource", data_type: "graph" };


Object.defineProperty( GraphComponent.prototype, "graph", {
	enumerable: false,
	get: function() {
		return this._graph;
	},
	set: function(v) {
		console.error("graph cannot be set manually");
	}
});


Object.defineProperty( GraphComponent.prototype, "filename", {
	enumerable: false,
	get: function() {
		return this._filename;
	},
	set: function(v) {
		if(this._filename == v)
			return;
		if(v) //to avoid double slashes
			v = LS.ResourcesManager.cleanFullpath( v );
		this.from_file = true;
		this._filename = v;
		this._loading = false;
		this._graphcode = null;
		this.processGraph();
	}
});

Object.defineProperty( GraphComponent.prototype, "graphcode", {
	enumerable: false,
	get: function() {
		return this._graphcode;
	},
	set: function(v) {
		//if(this._graphcode == v) return; //disabled because sometimes we want to force reload
		this._loading = false;
		this._graphcode = v;
		this.from_file = true; //if assigning a graphcode, then its a from_file, even if it is null
		if( this._graphcode )
			this._filename = this._graphcode.fullpath || this._graphcode.filename;
		else 
			this._filename = null;
		this._graph_properties = this.serializeProperties();
		this.processGraph();
	}
});

/*
GraphComponent.events_translator = {
	beforeRender: "beforeRenderMainPass",
	render: "beforeRenderScene"
};
*/

GraphComponent.icon = "mini-icon-graph.png";

/**
* Returns the first component of this container that is of the same class
* @method configure
* @param {Object} o object with the configuration info from a previous serialization
*/
GraphComponent.prototype.configure = function(o)
{
	this._graph_version = -1;

	if(o.uid)
		this.uid = o.uid;
	if(o.enabled != null)
		this.enabled = !!o.enabled;
	if(o.from_file)
	{
		this.from_file = true;
		this.filename = o.filename;
		if( o.graph_properties )
		{
			if(this._loading)
				this._graph_properties = o.graph_properties; //should be cloned?
			else
				this.configureProperties( o.graph_properties );
		}
	}
	else if(o.graph_data)
	{
		this.from_file = false;
		if(LS.catch_exceptions)
		{
			try
			{
				var obj = JSON.parse( o.graph_data );
				this._graph.configure( obj );
			}
			catch (err)
			{
				console.error("Error configuring Graph data: " + err);
			}
		}
		else
		{
			var obj = JSON.parse( o.graph_data );
			this._graph.configure( obj );
		}
	}

	if(o.on_event)
		this.on_event = o.on_event;
	if(o.force_redraw != null)
		this.force_redraw = o.force_redraw;
}

GraphComponent.prototype.serialize = function()
{
	return { 
		object_class: "GraphComponent",
		uid: this.uid,
		enabled: this.enabled, 
		from_file: this.from_file,
		force_redraw: this.force_redraw , 
		filename: this._filename,
		graph_properties: this.from_file ? this.serializeProperties() : null,
		graph_data: this.from_file ? null : JSON.stringify( this._graph.serialize() ),
		on_event: this.on_event
	};
}

GraphComponent.prototype.getResources = function(res)
{
	if(this._filename)
		res[this._filename] = true;
	this._graph.sendEventToAllNodes("getResources",res);
	return res;
}

GraphComponent.prototype.onAddedToNode = function(node)
{
	this._graph._scenenode = node;
	if( this._default_node )
		this._default_node.properties.node_id = node.uid;
	//catch the global rendering
	//LEvent.bind( LS.GlobalScene, "beforeRenderMainPass", this.onBeforeRender, this );
}

GraphComponent.prototype.onRemovedFromNode = function(node)
{
	this._graph._scenenode = null;
	//LEvent.unbind( LS.GlobalScene, "beforeRenderMainPass", this.onBeforeRender, this );
}

GraphComponent.prototype.onAddedToScene = function( scene )
{
	this._graph._scene = scene;
	LEvent.bind( scene , "init", this.onSceneEvent, this );
	LEvent.bind( scene , "start", this.onSceneEvent, this );
	LEvent.bind( scene , "pause", this.onSceneEvent, this );
	LEvent.bind( scene , "unpause", this.onSceneEvent, this );
	LEvent.bind( scene , "finish", this.onSceneEvent, this );
	LEvent.bind( scene , "beforeRenderMainPass", this.onSceneEvent, this );
	LEvent.bind( scene , "beforeRenderScene", this.onSceneEvent, this );
	LEvent.bind( scene , "update", this.onSceneEvent, this );
}

GraphComponent.prototype.onRemovedFromScene = function( scene )
{
	this._graph._scene = null;
	LEvent.unbind( scene, "init", this.onSceneEvent, this );
	LEvent.unbind( scene, "start", this.onSceneEvent, this );
	LEvent.unbind( scene, "pause", this.onSceneEvent, this );
	LEvent.unbind( scene, "unpause", this.onSceneEvent, this );
	LEvent.unbind( scene, "finish", this.onSceneEvent, this );
	LEvent.unbind( scene, "beforeRenderMainPass", this.onSceneEvent, this );
	LEvent.unbind( scene, "beforeRenderScene", this.onSceneEvent, this );
	LEvent.unbind( scene, "update", this.onSceneEvent, this );
}

GraphComponent.prototype.onResourceRenamed = function( old_name, new_name, resource )
{
	if( old_name == this._filename)
		this._filename = new_name;
	this._graph.sendEventToAllNodes("onResourceRenamed",[ old_name, new_name, resource ]);
}

GraphComponent.prototype.onSceneEvent = function( event_type, event_data )
{
	if(event_type == "beforeRenderMainPass")
		event_type = "render";
	//if( GraphComponent.events_translator[ event_type ] )
	//	event_type = GraphComponent.events_translator[ event_type ];

	if(event_type == "init")
		this._graph.sendEventToAllNodes("onInit");
	else if(event_type == "start")
	{
		this._graph.sendEventToAllNodes("onStart");
		this._graph.status = LGraph.STATUS_RUNNING;
	}
	else if(event_type == "pause")
	{
		this._graph.sendEventToAllNodes("onPause");
		this._graph.status = LGraph.STATUS_RUNNING;
	}
	else if(event_type == "unpause")
	{
		this._graph.sendEventToAllNodes("onUnpause");
		this._graph.status = LGraph.STATUS_RUNNING;
	}
	else if(event_type == "finish")
	{
		this._graph.sendEventToAllNodes("onStop");
		this._graph.status = LGraph.STATUS_STOPPED;
	}

	if(this.on_event == event_type)
		this.runGraph();
}

GraphComponent.prototype.trigger = function(e)
{
	if(this.on_event == "trigger")
		this.runGraph();
}

GraphComponent.prototype.runGraph = function()
{
	if(!this._root._in_tree || !this.enabled)
		return;

	//if(!this._graphcode || this._graphcode._version != this._graph_version )
	//	this.processGraph();

	if(!this._graphcode)
		return;

	this._graph.runStep( 1, LS.catch_exceptions );
	if(this.force_redraw)
		this._root.scene.requestFrame();
}

GraphComponent.prototype.processGraph = function( skip_events, on_complete )
{
	//use inner graph
	if(!this.from_file)
		return;

	var that = this;
	this._graphcode = LS.ResourcesManager.getResource( this._filename );
	if(!this._graphcode && !this._loading) //must be loaded
	{
		this._loading = true;
		LS.ResourcesManager.load( this._filename, null, function( res, url ){
			this._loading = false;
			if( url != that.filename )
				return;
			that.processGraph( skip_events );
			if(on_complete)
				on_complete(that);
		});
		return;
	}

	this._graph.configure( this._graphcode.data );
	if( this._graph_properties )
	{
		this.configureProperties( this._graph_properties );
		this._graph_properties = null;
	}
	this._graph_version = this._graphcode._version;
}

GraphComponent.prototype.getResources = function(res)
{
	res[ this._filename ] = true;
	this._graph.sendEventToAllNodes("getResources",res);
	return res;
}

GraphComponent.prototype.serializeProperties = function()
{
	var properties = {};

	var nodes = this._graph.findNodesByType("scene/global");
	if(!nodes.length)
		return properties;

	for(var i = 0; i < nodes.length; ++i)
	{
		var n = nodes[i];
		properties[ n.id ] = n.properties.value;
	}

	return properties;
}

GraphComponent.prototype.configureProperties = function( properties )
{
	var nodes = this._graph.findNodesByType("scene/global");
	if(!nodes.length)
		return properties;

	for(var i = 0; i < nodes.length; ++i)
	{
		var n = nodes[i];
		if( properties[ n.id ] === undefined )
			continue;
		n.properties.value = properties[ n.id ];
	}
}

GraphComponent.prototype.getPropertyValue = function( property )
{
	var nodes = this._graph.findNodesByType("scene/global");
	if(!nodes.length)
		return null;
	for(var i = 0; i < nodes.length; ++i)
	{
		var n = nodes[i];
		var type = n.properties.type;
		if(n.properties.name != property)
			continue;

		return n.properties.value;
	}
}

//TODO: optimize this precaching nodes of type scene/global
GraphComponent.prototype.setPropertyValue = function( property, value )
{
	var nodes = this._graph.findNodesByType("scene/global");
	if(!nodes.length)
		return;
	for(var i = 0; i < nodes.length; ++i)
	{
		var n = nodes[i];
		var type = n.properties.type;
		if(n.properties.name != property)
			continue;

		if(n.properties.value && n.properties.value.set)
			n.properties.value.set(value);
		else
			n.properties.value = value;
		return true;
	}
}

LS.registerComponent( GraphComponent );




/**
* This component allow to integrate a rendering post FX using a graph
* @class FXGraphComponent
* @param {Object} o object with the serialized info
*/
function FXGraphComponent(o)
{
	this.enabled = true;
	this.frame = new LS.RenderFrameContext();
	this.use_antialiasing = false;
	this.use_node_camera = false;

	if(typeof(LGraphTexture) == "undefined")
		return console.error("Cannot use FXGraphComponent if LiteGraph is not installed");

	this._graph = new LGraph();
	this._graph.getScene = function() { return this._scene; }

	if(o)
	{
		this.configure(o);
	}
	else //default
	{
		this._graph_frame_node = LiteGraph.createNode("scene/frame","Rendered Frame");
		this._graph_frame_node.ignore_remove = true;
		this._graph_frame_node.ignore_rename = true;
		this._graph.add( this._graph_frame_node );

		this._graph_viewport_node = LiteGraph.createNode("texture/toviewport","Viewport");
		this._graph_viewport_node.pos[0] = 500;
		this._graph_viewport_node.properties.disable_alpha = true;
		this._graph.add( this._graph_viewport_node );

		this._graph_frame_node.connect(0, this._graph_viewport_node );
	}

	if(FXGraphComponent.high_precision_format == null && global.gl)
	{
		if(gl.half_float_ext)
			FXGraphComponent.high_precision_format = gl.HALF_FLOAT_OES;
		else if(gl.float_ext)
			FXGraphComponent.high_precision_format = gl.FLOAT;
		else
			FXGraphComponent.high_precision_format = gl.UNSIGNED_BYTE;
	}
}

FXGraphComponent.icon = "mini-icon-graph.png";
FXGraphComponent.buffer_size = [1024,512];


Object.defineProperty( FXGraphComponent.prototype, "graph", {
	enumerable: false,
	get: function() {
		return this._graph;
	},
	set: function(v) {
		console.error("graph cannot be set manually");
	}
});

/**
* Returns the first component of this container that is of the same class
* @method configure
* @param {Object} o object with the configuration info from a previous serialization
*/
FXGraphComponent.prototype.configure = function(o)
{
	if(!o.graph_data)
		return;

	this.uid = o.uid;
	this.enabled = !!o.enabled;
	this.use_antialiasing = !!o.use_antialiasing;
	this.use_node_camera = !!o.use_node_camera;
	if(o.frame)
		this.frame.configure(o.frame);

	this._graph.configure( JSON.parse( o.graph_data ) );

	this._graph_frame_node = this._graph.findNodesByTitle("Rendered Frame")[0];
	this._graph_viewport_node = this._graph.findNodesByType("texture/toviewport")[0];

	if(!this._graph_frame_node) //LEGACY CODE, DELETE AT SOME POINT
	{
		console.log("CONVERTING LEGACY DATA TO NEW FORMAT");
		
		this._graph_frame_node = LiteGraph.createNode("scene/frame","Rendered Frame");
		this._graph_frame_node.ignore_remove = true;
		this._graph_frame_node.ignore_rename = true;
		this._graph.add( this._graph_frame_node );

		var old_nodes = ["Color Buffer","Depth Buffer","Extra Buffer"];
		for(var j = 0; j < old_nodes.length; ++j)
		{
			var old_node = this._graph.findNodesByTitle(old_nodes[j])[0];
			if(!old_node)
				continue;

			var connection_info = old_node.getOutputInfo(0);
			if(!connection_info.links)
				continue;
			var links = connection_info.links.concat();
			for(var i in links)
			{
				var link = this._graph.links[ links[i] ];
				if(!link)
					continue;
				this._graph_frame_node.connect( j, link.target_id, link.target_slot ); 
			}
			this._graph.remove( old_node );
		}
	}
}

FXGraphComponent.prototype.serialize = function()
{
	return {
		object_class: "FXGraphComponent",
		uid: this.uid,
		enabled: this.enabled,
		use_antialiasing: this.use_antialiasing,
		frame: this.frame.serialize(),
		use_node_camera: this.use_node_camera,

		graph_data: JSON.stringify( this._graph.serialize() )
	};
}

FXGraphComponent.prototype.getResources = function(res)
{
	this._graph.sendEventToAllNodes("getResources",res);
	return res;
}

FXGraphComponent.prototype.getPropertyValue = function( property )
{
	var nodes = this._graph.findNodesByType("scene/global");
	if(nodes.length)
	{
		for(var i = 0; i < nodes.length; ++i)
		{
			var n = nodes[i];
			var type = n.properties.type;
			if(n.properties.name != property)
				continue;

			return n.properties.value;
		}
	}
}


FXGraphComponent.prototype.setPropertyValue = function( property, value )
{
	var nodes = this._graph.findNodesByType("scene/global");
	if(nodes.length)
	{
		for(var i = 0; i < nodes.length; ++i)
		{
			var n = nodes[i];
			var type = n.properties.type;
			if(n.properties.name != property)
				continue;

			if(n.properties.value && n.properties.value.set)
				n.properties.value.set(value);
			else
				n.properties.value = value;
			return true;
		}
	}
}


FXGraphComponent.prototype.onResourceRenamed = function(old_name, new_name, res)
{
	this._graph.sendEventToAllNodes("onResourceRenamed",[old_name, new_name, res]);
}

FXGraphComponent.prototype.onAddedToNode = function(node)
{
	this._graph._scenenode = node;
	//catch the global rendering
	//LEvent.bind( LS.GlobalScene, "beforeRenderMainPass", this.onBeforeRender, this );
}

FXGraphComponent.prototype.onRemovedFromNode = function(node)
{
	this._graph._scenenode = null;
	//LEvent.unbind( LS.GlobalScene, "beforeRenderMainPass", this.onBeforeRender, this );
}

FXGraphComponent.prototype.onAddedToScene = function( scene )
{
	this._graph._scene = scene;
	LEvent.bind( scene, "enableFrameContext", this.onBeforeRender, this );
	LEvent.bind( scene, "showFrameContext", this.onAfterRender, this );
}

FXGraphComponent.prototype.onRemovedFromScene = function( scene )
{
	this._graph._scene = null;
	LEvent.unbind( scene, "enableFrameContext", this.onBeforeRender, this );
	LEvent.unbind( scene, "showFrameContext", this.onAfterRender, this );

	LS.ResourcesManager.unregisterResource( ":color_" + this.uid );
	LS.ResourcesManager.unregisterResource( ":depth_" + this.uid );
	LS.ResourcesManager.unregisterResource( ":extra_" + this.uid );
}


FXGraphComponent.prototype.onBeforeRender = function(e, render_settings)
{
	this._last_camera = LS.Renderer._main_camera; //LS.Renderer._current_camera;

	if(!this.enabled)
	{
		if( this._binded_camera )
		{
			LEvent.unbindAll( this._binded_camera, this );
			this._binded_camera = null;
		}
		return;
	}

	//FBO for one camera
	if(this.use_node_camera)
	{
		var camera = this._root.camera;
		if(camera && camera != this._binded_camera)
		{
			if(this._binded_camera)
				LEvent.unbindAll( this._binded_camera, this );
			LEvent.bind( camera, "enableFrameContext", this.enableCameraFBO, this );
			LEvent.bind( camera, "showFrameContext", this.showCameraFBO, this );
		}
		this._binded_camera = camera;
		return;
	}
	else if( this._binded_camera )
	{
		LEvent.unbindAll( this._binded_camera, this );
		this._binded_camera = null;
	}

	this.enableGlobalFBO( render_settings );
}

FXGraphComponent.prototype.onAfterRender = function(e, render_settings )
{
	if(!this.enabled)
		return;

	if(this.use_node_camera)
		return;

	this.showFBO();
}

FXGraphComponent.prototype.enableCameraFBO = function(e, render_settings )
{
	if(!this.enabled)
		return;

	var camera = this._binded_camera;
	
	var viewport = this._viewport = camera.getLocalViewport( null, this._viewport );
	this.frame.enable( render_settings, viewport );
	render_settings.ignore_viewports = true;
}

FXGraphComponent.prototype.showCameraFBO = function(e, render_settings )
{
	if(!this.enabled)
		return;
	render_settings.ignore_viewports = false;

	this.showFBO();
}

FXGraphComponent.prototype.enableGlobalFBO = function( render_settings )
{
	if(!this.enabled)
		return;

	//configure
	this.frame.enable( render_settings, null, LS.Renderer._main_camera );
}

FXGraphComponent.prototype.showFBO = function()
{
	if(!this.enabled)
		return;

	this.frame.disable();

	LS.ResourcesManager.textures[":color_" + this.uid] = this.frame._color_texture;
	LS.ResourcesManager.textures[":depth_" + this.uid] = this.frame._depth_texture;
	if(this.frame.num_extra_textures)
	{
		for(var i = 0; i < this.frame.num_extra_textures; ++i)
			LS.ResourcesManager.textures[":extra"+ i +"_" + this.uid] = this.frame._textures[i+1];
	}

	if(this.use_node_camera && this._viewport)
	{
		gl.setViewport( this._viewport );
		this.applyGraph();
		gl.setViewport( this.frame._fbo._old_viewport );
	}
	else
		this.applyGraph();
}


//take the resulting textures and pass them through the graph
FXGraphComponent.prototype.applyGraph = function()
{
	if(!this._graph)
		return;

	if(!this._graph_frame_node)
		this._graph_frame_node = this._graph.findNodesByTitle("Rendered Frame")[0];
	this._graph_frame_node._color_texture = ":color_" + this.uid;
	this._graph_frame_node._depth_texture = ":depth_" + this.uid;
	this._graph_frame_node._extra_texture = ":extra0_" + this.uid;
	this._graph_frame_node._camera = this._last_camera;

	if(this._graph_viewport_node) //force antialiasing
	{
		this._graph_viewport_node.properties.filter = this.frame.filter_texture;
		this._graph_viewport_node.properties.antialiasing = this.use_antialiasing;
	}

	//execute graph
	this._graph.runStep(1, LS.catch_exceptions );
}

LS.registerComponent( FXGraphComponent );








