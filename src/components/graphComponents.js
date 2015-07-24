/* Requires LiteGraph.js ******************************/

//on include, link to resources manager
if(typeof(LGraphTexture) != "undefined")
{
	//link LGraph textures system with LiteScene
	LGraphTexture.getTexturesContainer = function() { return LS.ResourcesManager.textures };
	LGraphTexture.loadTexture = LS.ResourcesManager.load.bind( LS.ResourcesManager );
}

/**
* This component allow to integrate a behaviour graph on any object
* @class GraphComponent
* @param {Object} o object with the serialized info
*/
function GraphComponent(o)
{
	this.enabled = true;
	this.force_redraw = true;

	this.on_event = "update";

	if(typeof(LGraphTexture) == "undefined")
		return console.error("Cannot use GraphComponent if LiteGraph is not installed");

	this._graph = new LGraph();
	this._graph._scene = Scene;
	this._graph.getScene = function() { return this._scene; }

	if(o)
		this.configure(o);
	else //default
	{
		var graphnode = LiteGraph.createNode("scene/node");
		//graphnode.properties.node_id = ¿? not added yet
		this._graph.add(graphnode);
	}
	
	LEvent.bind(this,"trigger", this.trigger, this );	
}

GraphComponent["@on_event"] = { type:"enum", values: ["start","render","update","trigger"] };

GraphComponent.icon = "mini-icon-graph.png";

/**
* Returns the first component of this container that is of the same class
* @method configure
* @param {Object} o object with the configuration info from a previous serialization
*/
GraphComponent.prototype.configure = function(o)
{
	this.enabled = !!o.enabled;
	if(o.graph_data)
	{
		try
		{
			var obj = JSON.parse(o.graph_data);
			this._graph.configure( obj );
		}
		catch (err)
		{
			console.error("Error configuring Graph data: " + err);
		}
	}

	if(o.on_event)
		this.on_event = o.on_event;
	if(o.force_redraw)
		this.force_redraw = o.force_redraw;
}

GraphComponent.prototype.serialize = function()
{
	return { 
		enabled: this.enabled, 
		force_redraw: this.force_redraw , 
		graph_data: JSON.stringify( this._graph.serialize() ),
		on_event: this.on_event
	};
}

GraphComponent.prototype.onAddedToNode = function(node)
{
	this._graph._scenenode = node;

	LEvent.bind(node,"start", this.onEvent, this );
	LEvent.bind(node,"beforeRenderMainPass", this.onEvent, this );
	LEvent.bind(node,"update", this.onEvent, this );
}

GraphComponent.prototype.onRemovedFromNode = function(node)
{
	LEvent.unbind(node,"start", this.onEvent, this );
	LEvent.unbind(node,"beforeRenderMainPass", this.onEvent, this );
	LEvent.unbind(node,"update", this.onEvent, this );
}

GraphComponent.prototype.onResourceRenamed = function(old_name, new_name, res)
{
	this._graph.sendEventToAllNodes("onResourceRenamed",[old_name, new_name, res]);
}

GraphComponent.prototype.onEvent = function(event_type, event_data)
{
	if(event_type == "beforeRenderMainPass")
		event_type = "render";

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
	if(!this._root._in_tree || !this.enabled) return;
	if(this._graph)
		this._graph.runStep(1);
	if(this.force_redraw)
		LEvent.trigger(this._root._in_tree, "change");
}

GraphComponent.prototype.getGraph = function()
{
	return this._graph;
}

GraphComponent.prototype.getPropertyValue = function( property )
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


GraphComponent.prototype.setPropertyValue = function( property, value )
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

LS.registerComponent(GraphComponent);



/**
* This component allow to integrate a rendering post FX using a graph
* @class FXGraphComponent
* @param {Object} o object with the serialized info
*/
function FXGraphComponent(o)
{
	this.enabled = true;
	this.use_viewport_size = true;
	this.use_high_precision = false;
	this.use_antialiasing = false;
	this.use_extra_texture = false;

	if(typeof(LGraphTexture) == "undefined")
		return console.error("Cannot use GraphComponent if LiteGraph is not installed");

	this._graph = new LGraph();
	this._graph._scene = Scene;
	this._graph.getScene = function() { return this._scene; }

	if(o)
	{
		this.configure(o);
	}
	else //default
	{
		this._graph_color_texture_node = LiteGraph.createNode("texture/texture","Color Buffer");
		this._graph_color_texture_node.ignore_remove = true;

		this._graph_depth_texture_node = LiteGraph.createNode("texture/texture","Depth Buffer");
		this._graph_depth_texture_node.ignore_remove = true;
		this._graph_depth_texture_node.pos[1] = 400;

		this._graph_extra_texture_node = LiteGraph.createNode("texture/texture","Extra Buffer");
		this._graph_extra_texture_node.pos[1] = 800;
		this._graph_extra_texture_node.ignore_remove = true;
	
		this._graph.add( this._graph_color_texture_node );
		this._graph.add( this._graph_extra_texture_node );
		this._graph.add( this._graph_depth_texture_node );

		this._graph_viewport_node = LiteGraph.createNode("texture/toviewport","Viewport");
		this._graph_viewport_node.pos[0] = 500;
		this._graph.add( this._graph_viewport_node );

		this._graph_color_texture_node.connect(0, this._graph_viewport_node );
	}

	if(FXGraphComponent.high_precision_format == null)
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

/**
* Returns the first component of this container that is of the same class
* @method configure
* @param {Object} o object with the configuration info from a previous serialization
*/
FXGraphComponent.prototype.configure = function(o)
{
	if(!o.graph_data)
		return;

	this.enabled = !!o.enabled;
	this.use_viewport_size = !!o.use_viewport_size;
	this.use_high_precision = !!o.use_high_precision;
	this.use_antialiasing = !!o.use_antialiasing;
	this.use_extra_texture = !!o.use_extra_texture;
	this.apply_to_node_camera = false;

	this._graph.configure( JSON.parse( o.graph_data ) );
	this._graph_color_texture_node = this._graph.findNodesByTitle("Color Buffer")[0];
	this._graph_depth_texture_node = this._graph.findNodesByTitle("Depth Buffer")[0];
	this._graph_extra_texture_node = this._graph.findNodesByTitle("Extra Buffer")[0];
	this._graph_viewport_node = this._graph.findNodesByType("texture/toviewport")[0];
}

FXGraphComponent.prototype.serialize = function()
{
	return {
		enabled: this.enabled,
		use_antialiasing: this.use_antialiasing,
		use_high_precision: this.use_high_precision,
		use_extra_texture: this.use_extra_texture,
		use_viewport_size: this.use_viewport_size,
		graph_data: JSON.stringify( this._graph.serialize() )
	};
}

FXGraphComponent.prototype.getResources = function(res)
{
	var nodes = this._graph.findNodesByType("texture/texture");
	for(var i in nodes)
	{
		if(nodes[i].properties.name)
			res[nodes[i].properties.name] = Texture;
	}
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
	LEvent.bind( LS.GlobalScene, "beforeRenderMainPass", this.onBeforeRender, this );
}

FXGraphComponent.prototype.onRemovedFromNode = function(node)
{
	LEvent.unbind( LS.GlobalScene, "beforeRenderMainPass", this.onBeforeRender, this );
}

//used to create the buffers
FXGraphComponent.prototype.onBeforeRender = function(e, render_options)
{
	if(!this._graph || !render_options.render_fx || !this.enabled ) 
		return;

	//create RenderFrameContainer
	var RFC = this._renderFrameContainer;
	if(!RFC)
	{
		RFC = this._renderFrameContainer = new LS.RenderFrameContainer();
		RFC.use_depth_texture = true;
		RFC.component = this;
		RFC.postRender = FXGraphComponent.postRender;
	}

	//configure RFC
	RFC.use_high_precision = this.use_high_precision;
	if(this.use_viewport_size)
		RFC.useCanvasSize();
	else
		RFC.useDefaultSize();
	RFC.use_extra_texture = this.use_extra_texture;

	//assign global render frame container
	LS.Renderer.assignGlobalRenderFrameContainer( RFC );
}

FXGraphComponent.prototype.getGraph = function()
{
	return this._graph;
}

//take the resulting textures and pass them through the graph
FXGraphComponent.prototype.applyGraph = function()
{
	if(!this._graph)
		return;

	//find graph nodes that contain the texture info
	if(!this._graph_color_texture_node)
		this._graph_color_texture_node = this._graph.findNodesByTitle("Color Buffer")[0];
	if(!this._graph_extra_texture_node)
		this._graph_extra_texture_node = this._graph.findNodesByTitle("Extra Buffer")[0];
	if(!this._graph_depth_texture_node)
		this._graph_depth_texture_node = this._graph.findNodesByTitle("Depth Buffer")[0];
	if(!this._graph_viewport_node)
		this._graph_viewport_node = this._graph.findNodesByType("texture/toviewport")[0];

	if(!this._graph_color_texture_node)
		return;

	//fill the graph nodes with proper info
	this._graph_color_texture_node.properties.name = ":color_" + this.uid;
	if(this._graph_extra_texture_node)
		this._graph_extra_texture_node.properties.name = ":extra_" + this.uid;
	if(this._graph_depth_texture_node)
		this._graph_depth_texture_node.properties.name = ":depth_" + this.uid;
	if(this._graph_viewport_node) //force antialiasing
		this._graph_viewport_node.properties.antialiasing = this.use_antialiasing;

	//execute graph
	this._graph.runStep(1);
}

//Executed inside RenderFrameContainer **********
/*
FXGraphComponent.prototype.onPreRender = function( cameras, render_options )
{
	//TODO: MIGRATE TO RenderFrameContainer

	//Setup FBO
	this._fbo = this._fbo || gl.createFramebuffer();
	gl.bindFramebuffer( gl.FRAMEBUFFER, this._fbo );

	var color_texture = this.component.color_texture;
	var depth_texture = this.component.depth_texture;

	gl.viewport(0, 0, color_texture.width, color_texture.height );
	LS.Renderer._full_viewport.set( gl.viewport_data );

	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color_texture.handler, 0);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT,  gl.TEXTURE_2D, depth_texture.handler, 0);

	//set depth info
	var camera = cameras[0];
	if(!depth_texture.near_far_planes)
		depth_texture.near_far_planes = vec2.create();
	depth_texture.near_far_planes[0] = camera.near;
	depth_texture.near_far_planes[1] = camera.far;

	LS.Renderer.global_aspect = (gl.canvas.width / gl.canvas.height) / (color_texture.width / color_texture.height);
	//ready to render the scene, which is done from the LS.Renderer.render
}
*/

//Executed inside RFC
FXGraphComponent.postRender = function()
{
	this.endFBO();

	LS.ResourcesManager.textures[":color_" + this.component.uid] = this.color_texture;
	if(this.extra_texture)
		LS.ResourcesManager.textures[":extra_" + this.component.uid] = this.extra_texture;
	if(this.depth_texture)
		LS.ResourcesManager.textures[":depth_" + this.component.uid] = this.depth_texture;

	/*
	//disable FBO
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	LS.Renderer.global_aspect = 1;

	//restore
	gl.viewport( 0, 0, gl.canvas.width, gl.canvas.height );
	LS.Renderer._full_viewport.set( gl.viewport_data );
	*/

	//apply FX
	this.component.applyGraph();
}
//************************************



LS.registerComponent( FXGraphComponent );








