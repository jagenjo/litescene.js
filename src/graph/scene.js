///@INFO: GRAPHS
if(typeof(LiteGraph) != "undefined")
{
	//scene/component is in another file, components.js
	
	/* Scene LNodes ***********************/

	global.LGraphScene = function()
	{
		this.addOutput("Time","number");
		this._scene = null;
	}

	LGraphScene.title = "Scene";
	LGraphScene.desc = "Scene";

	LGraphScene.getComponents = function(node, result)
	{
		result = result || [];
		var compos = node.getComponents();
		if(!compos)
			return result;

		for(var i = 0; i < compos.length; ++i)
		{
			var name = ONE.getClassName( compos[i].constructor );
			result.push( [name, name] );
		}

		return result;
	}

	LGraphScene.prototype.onAdded = function( graph )
	{
		this.bindEvents( this.graph.getScene ? this.graph.getScene() : ONE.GlobalScene );
	}

	LGraphScene.prototype.onRemoved = function()
	{
		this.bindEvents( null );
	}

	LGraphScene.prototype.onConnectionsChange = function()
	{
		this.bindEvents( this.graph.getScene ? this.graph.getScene() : ONE.GlobalScene );
	}

	//bind events attached to this component
	LGraphScene.prototype.bindEvents = function( scene )
	{
		if(this._scene)
			LEvent.unbindAll( this._scene, this );

		this._scene = scene;
		if( !this._scene )
			return;
		
		//iterate outputs
		if(this.outputs && this.outputs.length)
			for(var i = 0; i < this.outputs.length; ++i )
			{
				var output = this.outputs[i];
				if( output.type !== LiteGraph.EVENT )
					continue;
				var event_name = output.name.substr(3);
				LEvent.bind( this._scene, event_name, this.onEvent, this );
			}
	}

	LGraphScene.prototype.onEvent = function( event_name, params )
	{
		this.trigger( "on_" + event_name, params );
	}

	LGraphScene.prototype.onExecute = function()
	{
		var scene = this.graph.getScene ? this.graph.getScene() : ONE.GlobalScene;

		//read inputs
		if(this.inputs)
		for(var i = 0; i < this.inputs.length; ++i)
		{
			var input = this.inputs[i]; //??
			var v = this.getInputData(i);
			if(v === undefined)
				continue;
		}

		//write outputs
		if(this.outputs)
		for(var i = 0; i < this.outputs.length; ++i)
		{
			var output = this.outputs[i];
			if(!output.links || !output.links.length || output.type == LiteGraph.EVENT )
				continue;
			var result = null;
			switch( output.name )
			{
				case "Time": result = scene.getTime(); break;
				case "Elapsed": result = (scene._last_dt != null ? scene._last_dt : 0); break;
				case "Frame": result = (scene._frame != null ? scene._frame : 0); break;
				default:
					result = scene.root.getComponent(output.name);
			}
			this.setOutputData(i,result);
		}
	}

	LGraphScene.prototype.onGetOutputs = function()
	{
		var r = [["Elapsed","number"],["Frame","number"],["on_start",LiteGraph.EVENT],["on_finish",LiteGraph.EVENT]];
		return LGraphScene.getComponents( this.graph.getScene().root, r);
	}

	LiteGraph.registerNodeType("scene/scene", LGraphScene );

	//********************************************************

	global.LGraphSceneNode = function()
	{
		this.properties = { node_id: "" };
		this.size = [140,30];
		this._node = null;
	}

	LGraphSceneNode.title = "SceneNode";
	LGraphSceneNode.desc = "Node on the scene";
	LGraphSceneNode.highlight_color = "#CCC";

	LGraphSceneNode.prototype.onRemoved = function()
	{
		if(this._node)
			this.bindNodeEvents(null);
	}

	LGraphSceneNode.prototype.onConnectionsChange = function()
	{
		this.bindNodeEvents( this._component );
	}

	LGraphSceneNode.prototype.getTitle = function()
	{
		var node = this._node || this.getNode();
		if(node)
			return node.name;
		return this.title;
	}

	LGraphSceneNode.prototype.getNode = function()
	{
		var node_id = null;

		if(!this.graph)
			return null;

		//first check input
		if(this.inputs && this.inputs[0])
			node_id = this.getInputData(0);

		//hardcoded node
		if( node_id && node_id.constructor === ONE.SceneNode )
		{
			if(this._node != node_id)
				this.bindNodeEvents(node_id);
			return node_id;
		}

		if(node_id && node_id.constructor === String)
			this.properties.node_id = node_id;

		//then check properties
		if(	!node_id && this.properties.node_id )
			node_id = this.properties.node_id;

		if( node_id == "@" || !node_id )
		{
			if( this.graph._scenenode )
				return this.graph._scenenode;
			return null;
		}

		//get node from scene
		var scene = this.graph && this.graph.getScene ? this.graph.getScene() : ONE.GlobalScene;
		if(!scene)
			return;

		var node = null;
		if(node_id)
			node = scene.getNode( node_id );

		//hook events
		if(this._node != node)
			this.bindNodeEvents(node);

		return node;
	}

	LGraphSceneNode.prototype.onExecute = function()
	{
		var node = this.getNode();
		if(!node)
			return;

		//read inputs
		if(this.inputs) //there must be inputs always but just in case
		{
			for(var i = 0; i < this.inputs.length; ++i)
			{
				var input = this.inputs[i];
				if( input.type === LiteGraph.ACTION )
					continue;
				var v = this.getInputData(i);
				if(v === undefined)
					continue;
				switch( input.name )
				{
					case "UID": this.properties.node_id = v; break;
					case "SceneNode": this.properties.node_id = v ? v.uid : null; if(v) node = v; break;
					case "Transform": node.transform.copyFrom(v); break;
					case "Material": node.material = v;	break;
					case "Visible": node.flags.visible = v; break;
					default:
						break;
				}
			}
		}

		//write outputs
		if(this.outputs)
		for(var i = 0; i < this.outputs.length; ++i)
		{
			var output = this.outputs[i];
			if(!output.links || !output.links.length || output.type == LiteGraph.EVENT )
				continue;
			switch( output.name )
			{
				case "SceneNode": this.setOutputData( i, node ); break;
				case "Material": this.setOutputData( i, node.getMaterial() ); break;
				case "Mesh": this.setOutputData( i, node.getMesh() ); break;
				case "Transform": this.setOutputData( i, node.transform ); break;
				case "Global Model": this.setOutputData( i, node.transform ? node.transform._global_matrix : ONE.IDENTITY ); break;
				case "Name": this.setOutputData( i, node.name ); break;
				case "Children": this.setOutputData( i, node.children ); break;
				case "UID": this.setOutputData( i, node.uid ); break;
				case "Mesh": this.setOutputData(i, node.getMesh()); break;
				case "Visible": this.setOutputData(i, node.flags.visible ); break;
				default:
					//this must be refactored
					var compo = node.getComponentByUId( output.name );
					if(!compo)
					{
						//SPECIAL CASE: maybe the node id changed so the output.name contains the uid of another node, in that case replace it
						var old_compo = node.scene.findComponentByUId( output.name );
						if(old_compo)
						{
							var class_name = ONE.getObjectClassName( old_compo );
							compo = node.getComponent( class_name );
							if( compo )
								output.name = compo.uid; //replace the uid
						}
					}

					this.setOutputData(i, compo );
					break;
			}
		}
	}

	LGraphSceneNode.prototype.onDrawBackground = function(ctx)
	{
		var node = this.getNode();
		if(!node)
		{
			this.boxcolor = "red";
			return;
		}

		var highlight = node._is_selected;

		if(highlight)
		{
			this.boxcolor = LGraphSceneNode.highlight_color;
			if(!this.flags.collapsed)
			{
				ctx.fillStyle = LGraphSceneNode.highlight_color;
				ctx.fillRect(0,0,this.size[0],2);
			}
		}
		else
			this.boxcolor = null;
	}

	LGraphSceneNode.prototype.getComponents = function(result)
	{
		result = result || [];
		var node = this.getNode();
		if(!node)
			return result;
		var compos = node.getComponents();
		if(!compos)
			return result;

		for(var i = 0; i < compos.length; ++i)
		{
			var name = ONE.getClassName( compos[i].constructor );
			result.push( [ compos[i].uid, name, { label: name } ] );
		}

		return result;
	}

	LGraphSceneNode.prototype.onDropItem = function( event )
	{
		var node_id = event.dataTransfer.getData("node_uid");
		if(!node_id)
			return;
		this.properties.node_id = node_id;
		this.onExecute();
		return true;
	}

	LGraphSceneNode.prototype.onPropertyChanged = function(name,value)
	{
		if(name == "node_id")
			this.getNode(); //updates this._node and binds events
	}

	//bind events attached to this component
	LGraphSceneNode.prototype.bindNodeEvents = function( node )
	{
		if(this._node)
			LEvent.unbindAll( this._node, this );

		this._node = node;
		if( !this._node )
			return;
		
		//iterate outputs
		if(this.outputs && this.outputs.length)
			for(var i = 0; i < this.outputs.length; ++i )
			{
				var output = this.outputs[i];
				if( output.type !== LiteGraph.EVENT )
					continue;
				var event_name = output.name.substr(3);
				LEvent.bind( this._node, event_name, this.onNodeEvent, this );
			}
	}

	LGraphSceneNode.prototype.onNodeEvent = function( e, params )
	{
		//trigger event
		this.trigger( "on_" + e, params );
	}

	LGraphSceneNode.prototype.onGetInputs = function()
	{
		var result = [["Visible","boolean"],["UID","string"],["SceneNode","SceneNode"],["Material","Material"]];
		return this.getComponents(result);
	}

	LGraphSceneNode.prototype.onGetOutputs = function()
	{
		var result = [["SceneNode","SceneNode"],["Visible","boolean"],["Material","Material"],["Mesh","Mesh"],["Name","string"],["UID","string"],["Global Model","mat4"],["Children","scenenode[]"],["on_clicked",LiteGraph.EVENT]];
		return this.getComponents(result);
	}

	LGraphSceneNode.prototype.onInspect = function( inspector )
	{
		var that = this;
		inspector.addButton(null, "Inspect node", function(){
			var node = that.getNode();
			if(node)
				EditorModule.inspect( node );
		});
	}


	LiteGraph.registerNodeType("scene/node", LGraphSceneNode );

	//********************************************************

	global.LGraphMaterial = function()
	{
		this.properties = { material_id: "", node_id: "" };
		this.addInput("","Material");
		this.addOutput("","Material");
		this.material = null;

		this.addWidget("button","Create", "", this.onCreateMaterial.bind(this) );
	}

	LGraphMaterial.title = "Material";
	LGraphMaterial.desc = "Material of a node";

	LGraphMaterial.prototype.onCreateMaterial = function(w, graphcanvas, node, pos, event)
	{
		var types = Object.keys( ONE.MaterialClasses );
		types.push(null,"clear");
		var menu = new LiteGraph.ContextMenu(types, { event: event, callback: inner });
		var that = this;
		function inner(v)
		{
			if(v == "clear")
			{
				that.material = null;
				return;
			}

			if(!ONE.MaterialClasses[ v ])
				return;
			var mat = new ONE.MaterialClasses[ v ];
			that.material = mat;
			EditorModule.inspect( that );
		}
	}

	LGraphMaterial.prototype.getResources = function(res)
	{
		if(this.material && this.material.getResources)
			this.material.getResources(res);
	}

	LGraphTexture.prototype.onResourceRenamed = function( old_name, new_name ) {
		if(this.material && this.material.onResourceRenamed)
			this.material.onResourceRenamed( old_name, new_name );
	};

	LGraphMaterial.prototype.onExecute = function()
	{
		var mat = this.getMaterial();
		if(!mat)
			return;

		//read inputs
		for(var i = 0; i < this.inputs.length; ++i)
		{
			var input = this.inputs[i];
			var v = this.getInputData(i);
			if(v === undefined)
				continue;

			if(input.name == "Material")
				continue;
			mat.setProperty( input.name, v );
		}

		//write outputs
		if(this.outputs)
		{
			this.setOutputData( 0, mat );
			for(var i = 1; i < this.outputs.length; ++i)
			{
				var output = this.outputs[i];
				if(!output.links || !output.links.length)
					continue;
				var v = mat.getProperty( output.name );
				this.setOutputData( i, v );
			}
		}
	}

	LGraphMaterial.prototype.getMaterial = function()
	{
		if(this.material)
			return this.material;

		//if it has an input material, use that one
		var slot = this.findInputSlot("Material");
		if( slot != -1)
			return this.getInputData( slot );

		if(	this.properties.material_id && ONE.RM.materials[ this.properties.material_id ] )
			return ONE.RM.materials[ this.properties.material_id ];

		if(	this.properties.node_id )
		{
			var scene = this.graph.getScene();
			var node = scene.getNode( this.properties.node_id );
			if(node)
				return node.getMaterial();
		}

		return null;
	}

	LGraphMaterial.prototype.onGetInputs = function()
	{
		var mat = this.getMaterial();
		if(!mat)
			return;
		var o = mat.getPropertiesInfo();
		var results = [["Material","Material"]];
		for(var i in o)
			results.push([i,o[i]]);
		return results;

		/*
		var results = [["Material","Material"],["Alpha","number"],["Specular f.","number"],["Diffuse","color"],["Ambient","color"],["Emissive","color"],["UVs trans.","texmatrix"]];
		for(var i in Material.TEXTURE_CHANNELS)
			results.push(["Tex." + Material.TEXTURE_CHANNELS[i],"Texture"]);
		return results;
		*/
	}

	LGraphMaterial.prototype.onGetOutputs = function()
	{
		var mat = this.getMaterial();
		if(!mat)
			return;
		var o = mat.getPropertiesInfo();
		var results = [["Material","Material"]];
		for(var i in o)
			results.push([i,o[i]]);
		return results;

		/*
		var results = [["Material","Material"],["Alpha","number"],["Specular f.","number"],["Diffuse","color"],["Ambient","color"],["Emissive","color"],["UVs trans.","texmatrix"]];
		for(var i in Material.TEXTURE_CHANNELS)
			results.push(["Tex." + Material.TEXTURE_CHANNELS[i],"Texture"]);
		return results;
		*/
	}

	LGraphMaterial.prototype.onSerialize = function(o)
	{
		if( this.material && this.material.serialize )
		{
			o.material = this.material.serialize();
			o.material.className = ONE.getObjectClassName( this.material );
		}
	}

	LGraphMaterial.prototype.onConfigure = function(o)
	{
		if(o.material)
		{
			var ctor = ONE.MaterialClasses[ o.material.className ];
			if(ctor)
			{
				this.material = new ctor();
				this.material.configure( o.material );
			}
		}
	}

	LGraphMaterial.prototype.onInspect = function( inspector )
	{
		var that = this;
		var mat = this.getMaterial();
		if(mat)
		{
			inspector.addTitle("Material (" + ONE.getObjectClassName(mat) + ")" );
			EditorModule.showMaterialProperties( mat, inspector );
		}
		/*
		inspector.addButton(null, "Inspect material", function(){
			var mat = that.getMaterial();
			if(mat)
				EditorModule.inspect( mat );
		});
		*/
	}

	LiteGraph.registerNodeType("scene/material", LGraphMaterial );
	global.LGraphMaterial = LGraphMaterial;

	//************************************

	global.LGraphGlobal = function LGraphGlobal()
	{
		this.addOutput("Value");
		this.properties = {name:"myvar", value: 0, type: "number", widget: "default", min:0, max:1 };
	}

	LGraphGlobal.title = "Global";
	LGraphGlobal.desc = "Global var for the graph";
	LGraphGlobal["@type"] = { type:"enum", values:["number","boolean","string","node","vec2","vec3","vec4","color","texture"]};
	LGraphGlobal["@widget"] = { type:"enum", values:[ "default", "slider", "pad" ]};

	LGraphGlobal.prototype.onExecute = function()
	{
		if(!this.properties.name)
			return;

		this.setOutputData(0, this.properties.value);
	}

	LGraphGlobal.prototype.onDrawBackground = function()
	{
		var name = this.properties.name;
		this.outputs[0].label = name;
	}

	LiteGraph.registerNodeType("scene/global", LGraphGlobal );

	global.LGraphSceneTime = function()
	{
		this.addOutput("Time","number");
		this._scene = null;
	}


	LGraphSceneTime.title = "Time";
	LGraphSceneTime.desc = "Time";

	LGraphSceneTime.prototype.onExecute = function()
	{
		var scene = this.graph.getScene();
		if(!scene)
			return;

		//read inputs
		if(this.inputs)
		for(var i = 0; i < this.inputs.length; ++i)
		{
			var input = this.inputs[i]; //??
			var v = this.getInputData(i);
			if(v === undefined)
				continue;
		}

		//write outputs
		if(this.outputs)
		for(var i = 0; i < this.outputs.length; ++i)
		{
			var output = this.outputs[i];
			if(!output.links || !output.links.length || output.type == LiteGraph.EVENT )
				continue;
			var result = null;
			switch( output.name )
			{
				case "Time": result = scene.getTime(); break;
				case "Elapsed": result = (scene._last_dt != null ? scene._last_dt : 0); break;
				case "Frame": result = (scene._frame != null ? scene._frame : 0); break;
				default:
					continue;
			}
			this.setOutputData(i,result);
		}
	}

	LGraphSceneTime.prototype.onGetOutputs = function()
	{
		return [["Elapsed","number"],["Time","number"]];
	}

	LiteGraph.registerNodeType("scene/time", LGraphSceneTime );

	//************************************

	global.LGraphLocatorProperty = function LGraphLocatorProperty()
	{
		this.addInput("in");
		this.addOutput("out");
		this.properties = { locator: "", cache_object: true };
		this._locator_split = null;
		this._locator_info = null;
	}

	LGraphLocatorProperty.title = "Property";
	LGraphLocatorProperty.desc = "A property of a node or component of the scene specified by its locator string";
	LGraphLocatorProperty.highlight_color = "#CCC";

	LGraphLocatorProperty.prototype.getLocatorInfo = function( force )
	{
		if(!this._locator_split)
			return null;
		if( !force && this.properties.cache_object && this._locator_info )
			return this._locator_info;
		if( !this.graph )
			return null;
		var scene = this.graph._scene || ONE.GlobalScene; //subgraphs do not have an scene assigned
		this._locator_info = scene.getPropertyInfoFromPath( this._locator_split );
		if(this._locator_info && this.inputs && this.inputs.length)
			this.inputs[0].type = this._locator_info.type;
		return this._locator_info;
	}

	LGraphLocatorProperty.prototype.onDropItem = function( event )
	{
		var item_type = event.dataTransfer.getData("type");
		//if(item_type != "property")
		//	return;
		var locator = event.dataTransfer.getData("uid");
		if(!locator)
			return;
		this.properties.locator = locator;
		this.onExecute();
		return true;
	}

	LGraphLocatorProperty.prototype.onPropertyChanged = function(name,value)
	{
		if(name == "locator")
		{
			if( value )
				this._locator_split = value.split("/");
			else
				this._locator_split = null;
		}
	}

	LGraphLocatorProperty.prototype.onAction = function( action, param )
	{
		//toggle
		var info = this.getLocatorInfo();
		LSQ.setFromInfo( info, !LSQ.getFromInfo( info ) );
	}

	LGraphLocatorProperty.prototype.getTitle = function()
	{
		if( (!this.title || this.title == LGraphLocatorProperty.title) && this._locator_info)
			return this._locator_info.name;
		return this.title || LGraphLocatorProperty.title;
	}

	LGraphLocatorProperty.prototype.onDrawBackground = function(ctx)
	{
		var info = this.getLocatorInfo();
		if(!info)
		{
			this.boxcolor = "red";
			return;
		}

		var highlight = info.node && info.node._is_selected;

		if(highlight)
		{
			this.boxcolor = LGraphLocatorProperty.highlight_color;
			if(!this.flags.collapsed) //render line
			{
				ctx.fillStyle = LGraphLocatorProperty.highlight_color;
				ctx.fillRect(0,0,this.size[0],2);
			}
		}
		else
			this.boxcolor = null;
	}

	LGraphLocatorProperty.prototype.onExecute = function()
	{
		var info = this.getLocatorInfo();
		this._last_info = info;

		if(info && info.target)
		{
			if( this.inputs.length && this.inputs[0].link !== null )
			{
				var v = this.getInputData(0);
				if(v !== undefined)
					LSQ.setFromInfo( info, v );
			}
			if( this.outputs.length && this.outputs[0].links && this.outputs[0].links.length )
				this.setOutputData( 0, LSQ.getFromInfo( info ));
		}

		this.setOutputData( 1, this.properties.locator );
	}

	LGraphLocatorProperty.prototype.onInspect = function( inspector )
	{
		var info = this.getLocatorInfo(true);
		if(!info)
			return;
		inspector.addSeparator();
		var type = info.type;
		var var_info = null;
		if( info.target && info.target.constructor["@" + info.name] )
		{
			var_info = info.target.constructor["@" + info.name];
			if( var_info.widget )
				type = var_info.widget;
			else if( var_info.type )
				type = var_info.type;
		}
		inspector.add( type, info.name, info.value, { callback: function(v){
			ONE.setObjectProperty( info.target, info.name, v );
		}});
	}

	LGraphLocatorProperty.prototype.onGetOutputs = function()
	{
		return [["locator","string"]];
	}

	LiteGraph.registerNodeType("scene/property", LGraphLocatorProperty );

	//***********************************

	//*
	global.LGraphToggleValue = function()
	{
		this.addInput("target","Component");
		this.addInput("toggle",LiteGraph.ACTION);
		this.properties = { property_name: "enabled" };
	}

	LGraphToggleValue.title = "Toggle";
	LGraphToggleValue.desc = "Toggle a property value";

	LGraphToggleValue.prototype.getTitle = function()
	{
		return "Toggle: " + this.properties.property_name;
	}

	LGraphToggleValue.prototype.onAction = function( action_name, params ) { 

		var target = this.getInputData(0,true);
		if(!target)
			return;
		var prop_name = this.properties.property_name || "enabled";
		if( target[ prop_name ] !== undefined )
			target[ prop_name ] = !target[ prop_name ];
	}

	LiteGraph.registerNodeType("scene/toggle", LGraphToggleValue );
	//*/

	//************************************

	global.LGraphFrame = function LGraphFrame()
	{
		this.addOutput("Color","Texture");
		this.addOutput("Depth","Texture");
		this.addOutput("Extra","Texture");
		this.addOutput("Camera","Camera");
		this.properties = {};
	}

	LGraphFrame.title = "Frame";
	LGraphFrame.desc = "One frame rendered from the scene renderer";

	LGraphFrame.prototype.onExecute = function()
	{
		this.setOutputData(0, LGraphTexture.getTexture( this._color_texture ) );
		this.setOutputData(1, LGraphTexture.getTexture( this._depth_texture ) );
		this.setOutputData(2, LGraphTexture.getTexture( this._extra_texture ) );
		this.setOutputData(3, this._camera );
	}

	LGraphFrame.prototype.onDrawBackground = function( ctx )
	{
		if( this.flags.collapsed || this.size[1] <= 20 )
			return;

		if(!this._color_texture)
			return;

		if( !ctx.webgl )
			return; //is not working well

		//Different texture? then get it from the GPU
		if(this._last_preview_tex != this._last_tex || !this._last_preview_tex)
		{
			if( ctx.webgl && this._canvas && this._canvas.constructor === GL.Texture )
			{
				this._canvas = this._last_tex;
			}
			else
			{
				var texture = LGraphTexture.getTexture( this._color_texture );
				if(!texture)
					return;

				var tex_canvas = LGraphTexture.generateLowResTexturePreview( texture );
				if(!tex_canvas) 
					return;
				this._last_preview_tex = this._last_tex;
				this._canvas = cloneCanvas( tex_canvas );
			}
		}

		if(!this._canvas)
			return;

		//render to graph canvas
		ctx.save();
		if(!ctx.webgl) //reverse image
		{
			if( this._canvas.constructor === GL.Texture )
			{
				this._canvas = null;
				return;
			}

			ctx.translate( 0,this.size[1] );
			ctx.scale(1,-1);
		}
		ctx.drawImage( this._canvas, 0, 0, this.size[0], this.size[1] );
		ctx.restore();
	}

	LGraphFrame.prototype.onInspect = function( inspector )
	{
		var that = this;
		if(this.graph.component)
		{
			var render_context = this.graph.component.frame;
			inspector.showObjectFields( render_context );
			inspector.addSeparator();
			inspector.addCheckbox("Antialiasing", this.graph.component.use_antialiasing, function(v){ that.graph.component.use_antialiasing = v; });
		}
	}

	LiteGraph.registerNodeType("scene/frame", LGraphFrame );
};

