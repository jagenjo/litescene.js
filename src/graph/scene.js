if(typeof(LiteGraph) != "undefined")
{
	/* Scene LNodes ***********************/

	function LGraphScene()
	{
		this.addOutput("Time","number");
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
			var name = LS.getClassName( compos[i].constructor );
			result.push( [name, name] );
		}

		return result;
	}

	LGraphScene.prototype.onExecute = function()
	{
		var scene = this.graph.getScene();

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
			if(!output.links || !output.links.length)
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
		var r = [["Elapsed","number"],["Frame","number"]];
		return LGraphScene.getComponents( this.graph.getScene().root, r);
	}

	LiteGraph.registerNodeType("scene/scene", LGraphScene );
	window.LGraphScene = LGraphScene;

	//********************************************************

	function LGraphSceneNode()
	{
		this.properties = {node_id:""};
		this.size = [100,20];

		this.addInput("node_id", "string", { locked: true });

		if(LGraphSceneNode._current_node_id)
			this.properties.node_id = LGraphSceneNode._current_node_id;
	}

	LGraphSceneNode.title = "SceneNode";
	LGraphSceneNode.desc = "Node on the scene";

	LGraphSceneNode.prototype.getNode = function()
	{
		var node_id = null;

		//first check input
		if(this.inputs && this.inputs[0])
			node_id = this.getInputData(0);
		if(node_id)
			this.properties.node_id = node_id;

		var scene = this.graph.getScene();
		var node = null;

		//then check properties
		if(	!node_id && this.properties.node_id )
			node_id = this.properties.node_id;

		if(node_id)
			node = scene.getNode( node_id );

		//otherwise use the graph node
		if(!node)
			node = this.graph._scenenode;
		return node;
	}

	LGraphSceneNode.prototype.onExecute = function()
	{
		var node = this.getNode();

		//read inputs
		if(this.inputs) //there must be inputs always but just in case
		{
			for(var i = 1; i < this.inputs.length; ++i)
			{
				var input = this.inputs[i];
				var v = this.getInputData(i);
				if(v === undefined)
					continue;
				switch( input.name )
				{
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
			if(!output.links || !output.links.length)
				continue;
			switch( output.name )
			{
				case "Material": this.setOutputData( i, node.getMaterial() ); break;
				case "Transform": this.setOutputData( i, node.transform ); break;
				case "Mesh": this.setOutputData(i, node.getMesh()); break;
				case "Visible": this.setOutputData(i, node.flags.visible ); break;
				default:
					var compo = node.getComponentByUId( output.name );
					if(!compo)
					{
						//SPECIAL CASE: maybe the node id changed so the output.name contains the uid of another node, in that case replace it
						var old_compo = node.scene.findComponentByUId( output.name );
						if(old_compo)
						{
							var class_name = LS.getObjectClassName( old_compo );
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
			var name = LS.getClassName( compos[i].constructor );
			result.push( [ compos[i].uid, name, { label: name } ] );
		}

		return result;
	}

	LGraphSceneNode.prototype.onDropItem = function( event )
	{
		var node_id = event.dataTransfer.getData("node_id");
		if(!node_id)
			return;
		this.properties.node_id = node_id;
		this.onExecute();
		return true;
	}

	LGraphSceneNode.prototype.onGetInputs = function()
	{
		var result = [["Visible","boolean"],["Material","Material"]];
		return this.getComponents(result);
		//return [["Transform","Transform"],["Material","Material"],["Mesh","Mesh"],["Enabled","boolean"]];
	}

	LGraphSceneNode.prototype.onGetOutputs = function()
	{
		var result = [["Visible","boolean"],["Material","Material"]];
		return this.getComponents(result);
		//return [["Transform","Transform"],["Material","Material"],["Mesh","Mesh"],["Enabled","boolean"]];
	}

	/*
	LGraphSceneNode.prototype.onGetOutputs = function()
	{
		var node = this.getNode();
		var r = [];
		for(var i = 0; i < node._components.length; ++i)
		{
			var comp = node._components[i];
			var classname = getObjectClassName(comp);
			var vars = getObjectAttributes(comp);
			r.push([classname,vars]);
		}
		return r;
		*/

		/*
		var r = [["Transform","Transform"],["Material","Material"],["Mesh","Mesh"],["Enabled","boolean"]];
		if(node.light)
			r.push(["Light","Light"]);
		if(node.camera)
			r.push(["Camera","Camera"]);
		return r;
	}
	*/

	LiteGraph.registerNodeType("scene/node", LGraphSceneNode );
	window.LGraphSceneNode = LGraphSceneNode;


	//********************************************************

	/* LGraphNode representing an object in the Scene */

	function LGraphTransform()
	{
		this.properties = {node_id:""};
		if(LGraphSceneNode._current_node_id)
			this.properties.node = LGraphSceneNode._current_node_id;
		this.addInput("Transform", "Transform", { locked: true });
		this.addOutput("Position","vec3");
	}

	LGraphTransform.title = "Transform";
	LGraphTransform.desc = "Transform info of a node";

	LGraphTransform.prototype.onExecute = function()
	{
		var transform = null;

		if(this.inputs && this.inputs[0])
			transform = this.getInputData(0);

		if(!transform)
		{
			var scene = this.graph.getScene();
			if(!scene)
				return;

			var node = this._node;
			if(	this.properties.node )
			{
				node = scene.getNode( this.properties.node );
				if(!node)
					return;
			}

			if(!node)
				node = this.graph._scenenode;

			transform = node.transform;
		}

		if(!transform)
			return;

		//read inputs
		if(this.inputs)
		for(var i = 1; i < this.inputs.length; ++i)
		{
			var input = this.inputs[i];
			var v = this.getInputData(i);
			if(v === undefined)
				continue;
			switch( input.name )
			{
				case "x": transform.x = v; break;
				case "y": transform.y = v; break;
				case "z": transform.z = v; break;
				case "Position": transform.setPosition(v); break;
				case "Rotation": transform.setRotation(v); break;
				case "Scale": transform.setScale(v); break;
				case "Matrix": transform.fromMatrix(v); break;
				case "Translate": transform.translate(v); break;
				case "Translate Local": transform.translateLocal(v); break;
				case "RotateY": transform.rotateY(v); break;
			}
		}

		//write outputs
		if(this.outputs)
		for(var i = 0; i < this.outputs.length; ++i)
		{
			var output = this.outputs[i];
			if(!output.links || !output.links.length)
				continue;

			var value = undefined;
			switch( output.name )
			{
				case "x": value = transform.x; break;
				case "y": value = transform.y; break;
				case "z": value = transform.z; break;
				case "Position": value = transform.position; break;
				case "Global Position": value = transform.getGlobalPosition(); break;
				case "Rotation": value = transform.rotation; break;
				case "Global Rotation": value = transform.getGlobalRotation(); break;
				case "Scale": value = transform.scaling; break;
				case "Matrix": value = transform.getMatrix(); break;
				default:
					break;
			}

			if(value !== undefined)
				this.setOutputData( i, value );
		}
	}

	LGraphTransform.prototype.onGetInputs = function()
	{
		return [["Position","vec3"],["Rotation","quat"],["Scale","number"],["x","number"],["y","number"],["z","number"],["Global Position","vec3"],["Global Rotation","quat"],["Matrix","mat4"],["Translate","vec3"],["Translate Local","vec3"],["RotateY","number"]];
	}

	LGraphTransform.prototype.onGetOutputs = function()
	{
		return [["Position","vec3"],["Rotation","quat"],["Scale","number"],["x","number"],["y","number"],["z","number"],["Global Position","vec3"],["Global Rotation","quat"],["Matrix","mat4"]];
	}

	LiteGraph.registerNodeType("scene/transform", LGraphTransform );
	window.LGraphTransform = LGraphTransform;

	//***********************************************************************

	function LGraphMaterial()
	{
		this.properties = {mat_name:""};
		this.addInput("Material","Material");
		this.size = [100,20];
	}

	LGraphMaterial.title = "Material";
	LGraphMaterial.desc = "Material of a node";

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

			mat.setProperty(input.name, v);

			/*
			switch( input.name )
			{
				case "Alpha": mat.alpha = v; break;
				case "Specular f.": mat.specular_factor = v; break;
				case "Diffuse": vec3.copy(mat.diffuse,v); break;
				case "Ambient": vec3.copy(mat.ambient,v); break;
				case "Emissive": vec3.copy(mat.emissive,v); break;
				case "UVs trans.": mat.uvs_matrix.set(v); break;
				default:
					if(input.name.substr(0,4) == "tex_")
					{
						var channel = input.name.substr(4);
						mat.setTexture(v, channel);
					}
					break;
			}
			*/
		}

		//write outputs
		if(this.outputs)
		for(var i = 0; i < this.outputs.length; ++i)
		{
			var output = this.outputs[i];
			if(!output.links || !output.links.length)
				continue;
			var v = mat.getProperty( output.name );
			/*
			var v;
			switch( output.name )
			{
				case "Material": v = mat; break;
				case "Alpha": v = mat.alpha; break;
				case "Specular f.": v = mat.specular_factor; break;
				case "Diffuse": v = mat.diffuse; break;
				case "Ambient": v = mat.ambient; break;
				case "Emissive": v = mat.emissive; break;
				case "UVs trans.": v = mat.uvs_matrix; break;
				default: continue;
			}
			*/
			this.setOutputData( i, v );
		}

		//this.setOutputData(0, parseFloat( this.properties["value"] ) );
	}

	LGraphMaterial.prototype.getMaterial = function()
	{
		//if it has an input material, use that one
		var slot = this.findInputSlot("Material");
		if( slot != -1)
			return this.getInputData( slot );

		if(	this.properties.mat_name )
			return LS.RM.materials[ this.properties.mat_name ];

		return null;
	}

	LGraphMaterial.prototype.onGetInputs = function()
	{
		var mat = this.getMaterial();
		if(!mat) return;
		var o = mat.getProperties();
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
		if(!mat) return;
		var o = mat.getProperties();
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

	LiteGraph.registerNodeType("scene/material", LGraphMaterial );
	window.LGraphMaterial = LGraphMaterial;

	//********************************************************


	function LGraphComponent()
	{
		this.properties = {
			node: "",
			component: ""
		};

		this.addInput("Component", undefined, { locked: true });

		this._component = null;
	}

	LGraphComponent.title = "Component";
	LGraphComponent.desc = "A component from a node";

	LGraphComponent.prototype.onConnectInput = function( slot, type )
	{
		if (slot == 0 && !LS.Components[type])
			return false;
	}

	LGraphComponent.prototype.onExecute = function()
	{
		var compo = this.getComponent();
		if(!compo)
			return;

		//read inputs (skip 1, is the component)
		for(var i = 1; i < this.inputs.length; i++)
		{
			var input = this.inputs[i];
			var v = this.getInputData(i);
			if(v === undefined)
				continue;
			LS.setObjectProperty( compo, input.name, v );
		}

		//write outputs
		for(var i in this.outputs)
		{
			var output = this.outputs[i];
			if(!output.links || !output.links.length)
				continue;

			//could be better...
			this.setOutputData(i, compo[ output.name ] );
		}
	}

	LGraphComponent.prototype.onDrawBackground = function()
	{
		var compo = this.getComponent();
		if(compo)
			this.title = LS.getClassName( compo.constructor );
	}

	LGraphComponent.prototype.getComponent = function()
	{
		var v = this.getInputData(0);
		if(v)
			return v;

		var scene = this.graph._scene;
		if(!scene) 
			return null;

		var node_id = this.properties.node;
		if(!node_id)
			return;

		//find node
		var node = scene.getNode( node_id );
		if(!node)
			return null;

		//find compo
		var compo_id = this.properties.component;
		var compo = null;
		if(compo_id.charAt(0) == "@")
			compo = node.getComponentByUId( compo_id );
		else if( LS.Components[ compo_id ] )
			compo = node.getComponent( LS.Components[ compo_id ] );
		else
			return null;

		if(compo && !compo.constructor.is_component)
			return null;

		this._component = compo;
		return compo;
	}

	LGraphComponent.prototype.getComponentProperties = function( v )
	{
		var compo = this.getComponent();
		if(!compo)
			return null;

		var attrs = null;
		if(compo.getProperties)
			attrs = compo.getProperties( v );
		else
			attrs = LS.getObjectProperties( compo );

		var result = [];
		for(var i in attrs)
			result.push( [i, attrs[i]] );
		return result;
	}

	LGraphComponent.prototype.onGetInputs = function() { return this.getComponentProperties("input"); }
	LGraphComponent.prototype.onGetOutputs = function() { return this.getComponentProperties("output"); }

	LiteGraph.registerNodeType("scene/component", LGraphComponent );
	window.LGraphComponent = LGraphComponent;

	//************************************************************

	function LGraphLight()
	{
		this.properties = {mat_name:""};
		this.addInput("Light","Light");
		this.addOutput("Intensity","number");
		this.addOutput("Color","color");
	}

	LGraphLight.title = "Light";
	LGraphLight.desc = "Light from a scene";

	LGraphLight.prototype.onExecute = function()
	{
		var scene = this.graph.getScene();
		if(!scene)
			return;

		var node = this._node;
		if(	this.properties.node_id )
			node = scene.getNode( this.properties.node_id );

		if(!node)
			node = this.graph._scenenode;

		var light = null;
		if(node) //use light of the node
			light = node.getLight();
		//if it has an input light
		var slot = this.findInputSlot("Light");
		if( slot != -1 )
			light = this.getInputData(slot);
		if(!light)
			return;

		//read inputs
		for(var i = 0; i < this.inputs.length; ++i)
		{
			var input = this.inputs[i];
			var v = this.getInputData(i);
			if(v === undefined)
				continue;

			switch( input.name )
			{
				case "Intensity": light.intensity = v; break;
				case "Color": vec3.copy(light.color,v); break;
				case "Eye": vec3.copy(light.eye,v); break;
				case "Center": vec3.copy(light.center,v); break;
			}
		}

		//write outputs
		for(var i = 0; i < this.outputs.length; ++i)
		{
			var output = this.outputs[i];
			if(!output.links || !output.links.length)
				continue;

			switch( output.name )
			{
				case "Light": this.setOutputData(i, light ); break;
				case "Intensity": this.setOutputData(i, light.intensity ); break;
				case "Color": this.setOutputData(i, light.color ); break;
				case "Eye": this.setOutputData(i, light.eye ); break;
				case "Center": this.setOutputData(i, light.center ); break;
			}
		}
	}

	LGraphLight.prototype.onGetInputs = function()
	{
		return [["Light","Light"],["Intensity","number"],["Color","color"],["Eye","vec3"],["Center","vec3"]];
	}

	LGraphLight.prototype.onGetOutputs = function()
	{
		return [["Light","Light"],["Intensity","number"],["Color","color"],["Eye","vec3"],["Center","vec3"]];
	}

	LiteGraph.registerNodeType("scene/light", LGraphLight );
	window.LGraphLight = LGraphLight;

	//************************************

	function LGraphGlobal()
	{
		this.addOutput("Value");
		this.properties = {name:"myvar", value: 0, type: "number", min:0, max:1 };
	}

	LGraphGlobal.title = "Global";
	LGraphGlobal.desc = "Global var for the graph";
	LGraphGlobal["@type"] = { type:"enum", values:["number","string","node","vec2","vec3","vec4","color","texture"]};

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
	window.LGraphGlobal = LGraphGlobal;

	//************************************

	function LGraphLocatorProperty()
	{
		this.addInput("in");
		this.addOutput("out");
		this.size = [80,20];
		this.properties = {locator:""};
	}

	LGraphLocatorProperty.title = "Property";
	LGraphLocatorProperty.desc = "A property of a node or component of the scene specified by its locator string";

	LGraphLocatorProperty.prototype.onExecute = function()
	{
		var locator = this.properties.locator;
		if(!this.properties.locator)
			return;

		var info = this._locator_info = LS.GlobalScene.getPropertyInfo( locator );

		if(info && info.target)
		{
			this.title = info.name;
			if( this.inputs.length && this.inputs[0].link !== null )
				LSQ.setFromInfo( info, this.getInputData(0) );
			if( this.outputs.length && this.outputs[0].links && this.outputs[0].links.length )
				this.setOutputData( 0, LSQ.getFromInfo( info ));
		}
	}

	LiteGraph.registerNodeType("scene/property", LGraphLocatorProperty );

	//************************************

	function LGraphFrame()
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

	LiteGraph.registerNodeType("scene/frame", LGraphFrame );
	window.LGraphFrame = LGraphFrame;
};