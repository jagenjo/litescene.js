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
	this.force_redraw = false;

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
	this.uid = o.uid;
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
		uid: this.uid,
		enabled: this.enabled, 
		force_redraw: this.force_redraw , 
		graph_data: JSON.stringify( this._graph.serialize() ),
		on_event: this.on_event
	};
}

GraphComponent.prototype.onAddedToNode = function(node)
{
	this._graph._scenenode = node;
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
	LEvent.bind( scene ,"start", this.onEvent, this );
	LEvent.bind( scene , "beforeRenderMainPass", this.onEvent, this );
	LEvent.bind( scene ,"update", this.onEvent, this );
}

GraphComponent.prototype.onRemovedFromScene = function( scene )
{
	LEvent.unbind( scene,"start", this.onEvent, this );
	LEvent.unbind( scene,"beforeRenderMainPass", this.onEvent, this );
	LEvent.unbind( scene,"update", this.onEvent, this );
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
	if(!this._root._in_tree || !this.enabled)
		return;
	if(this._graph)
		this._graph.runStep(1);
	if(this.force_redraw)
		this._root.scene.refresh();
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

LS.registerComponent( GraphComponent );



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
	this.use_node_camera = false;


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
		this._graph_frame_node = LiteGraph.createNode("scene/frame","Rendered Frame");
		this._graph_frame_node.ignore_remove = true;
		this._graph_frame_node.ignore_rename = true;
		this._graph.add( this._graph_frame_node );

		this._graph_viewport_node = LiteGraph.createNode("texture/toviewport","Viewport");
		this._graph_viewport_node.pos[0] = 500;
		this._graph.add( this._graph_viewport_node );

		this._graph_frame_node.connect(0, this._graph_viewport_node );

		/*
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
		*/
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

	this.uid = o.uid;
	this.enabled = !!o.enabled;
	this.use_viewport_size = !!o.use_viewport_size;
	this.use_high_precision = !!o.use_high_precision;
	this.use_antialiasing = !!o.use_antialiasing;
	this.use_extra_texture = !!o.use_extra_texture;
	this.use_node_camera = !!o.use_node_camera;

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
		uid: this.uid,
		enabled: this.enabled,
		use_antialiasing: this.use_antialiasing,
		use_high_precision: this.use_high_precision,
		use_extra_texture: this.use_extra_texture,
		use_viewport_size: this.use_viewport_size,
		use_node_camera: this.use_node_camera,

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


FXGraphComponent.prototype.getGraph = function()
{
	return this._graph;
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
	LEvent.bind( scene, "enableFrameBuffer", this.onBeforeRender, this );
	LEvent.bind( scene, "showFrameBuffer", this.onAfterRender, this );
}

FXGraphComponent.prototype.onRemovedFromScene = function( scene )
{
	LEvent.unbind( scene, "enableFrameBuffer", this.onBeforeRender, this );
	LEvent.unbind( scene, "showFrameBuffer", this.onAfterRender, this );

	LS.ResourcesManager.unregisterResource( ":color_" + this.uid );
	LS.ResourcesManager.unregisterResource( ":depth_" + this.uid );
	LS.ResourcesManager.unregisterResource( ":extra_" + this.uid );
}


FXGraphComponent.prototype.onBeforeRender = function(e, render_settings)
{
	this._last_camera = LS.Renderer._current_camera;

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
			LEvent.bind( camera, "enableFrameBuffer", this.enableCameraFBO, this );
			LEvent.bind( camera, "showFrameBuffer", this.showCameraFBO, this );
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

	if(!this._renderFrameContainer)
		this._renderFrameContainer = new LS.RenderFrameContainer();
	var camera = this._binded_camera;
	
	var viewport = this._viewport = camera.getLocalViewport( null, this._viewport );
	this._renderFrameContainer.setSize( viewport[2], viewport[3] );
	this._renderFrameContainer.use_high_precision = this.use_high_precision;
	this._renderFrameContainer.preRender( render_settings );

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

	var RFC = this._renderFrameContainer;
	if(!RFC)
		RFC = this._renderFrameContainer = new LS.RenderFrameContainer();

	//configure
	if(this.use_viewport_size)
		RFC.useCanvasSize();
	RFC.use_high_precision = this.use_high_precision;
	RFC.use_extra_texture = this.use_extra_texture;
	RFC.preRender( render_settings );
}

FXGraphComponent.prototype.showFBO = function()
{
	if(!this.enabled)
		return;

	var RFC = this._renderFrameContainer;
	RFC.endFBO();

	LS.ResourcesManager.textures[":color_" + this.uid] = RFC.color_texture;
	LS.ResourcesManager.textures[":depth_" + this.uid] = RFC.depth_texture;
	if(this.extra_texture)
		LS.ResourcesManager.textures[":extra_" + this.uid] = RFC.extra_texture;

	if(this.use_node_camera && this._viewport)
	{
		gl.setViewport( this._viewport );
		this.applyGraph();
		gl.setViewport( RFC._fbo._old_viewport );
	}
	else
		this.applyGraph();
}



/*
//used to create the buffers
FXGraphComponent.prototype.onBeforeRender = function(e, render_settings)
{
	if(!this._graph || !render_settings.render_fx || !this.enabled ) 
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
	//LS.Renderer.assignGlobalRenderFrameContainer( RFC );
}
*/


//take the resulting textures and pass them through the graph
FXGraphComponent.prototype.applyGraph = function()
{
	if(!this._graph)
		return;

	if(!this._graph_frame_node)
		this._graph_frame_node = this._graph.findNodesByTitle("Rendered Frame")[0];
	this._graph_frame_node._color_texture = ":color_" + this.uid;
	this._graph_frame_node._depth_texture = ":depth_" + this.uid;
	this._graph_frame_node._extra_texture = ":extra_" + this.uid;
	this._graph_frame_node._camera = this._last_camera;

	if(this._graph_viewport_node) //force antialiasing
		this._graph_viewport_node.properties.antialiasing = this.use_antialiasing;

	//find graph nodes that contain the texture info
	/*
	if(!this._graph_color_texture_node)
		this._graph_color_texture_node = this._graph.findNodesByTitle("Color Buffer")[0];
	if(!this._graph_depth_texture_node)
		this._graph_depth_texture_node = this._graph.findNodesByTitle("Depth Buffer")[0];
	if(!this._graph_extra_texture_node)
		this._graph_extra_texture_node = this._graph.findNodesByTitle("Extra Buffer")[0];
	if(!this._graph_viewport_node)
		this._graph_viewport_node = this._graph.findNodesByType("texture/toviewport")[0];

	if(!this._graph_color_texture_node)
		return;

	//fill the graph nodes with proper info
	this._graph_color_texture_node.properties.name = ":color_" + this.uid;
	if(this._graph_depth_texture_node)
		this._graph_depth_texture_node.properties.name = ":depth_" + this.uid;
	if(this._graph_extra_texture_node)
		this._graph_extra_texture_node.properties.name = ":extra_" + this.uid;
	if(this._graph_viewport_node) //force antialiasing
		this._graph_viewport_node.properties.antialiasing = this.use_antialiasing;
	*/

	//execute graph
	this._graph.runStep(1);
}

//Executed inside RenderFrameContainer **********
/*
FXGraphComponent.prototype.onPreRender = function( cameras, render_settings )
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


//Executed inside RFC
FXGraphComponent.postRender = function()
{
	this.endFBO();

	LS.ResourcesManager.textures[":color_" + this.component.uid] = this.color_texture;
	if(this.extra_texture)
		LS.ResourcesManager.textures[":extra_" + this.component.uid] = this.extra_texture;
	if(this.depth_texture)
		LS.ResourcesManager.textures[":depth_" + this.component.uid] = this.depth_texture;

	//apply FX
	this.component.applyGraph();
}
*/

//************************************




LS.registerComponent( FXGraphComponent );








