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

		for(var i in compos)
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
		for(var i in this.inputs)
		{
			var input = this.inputs[i];
			var v = this.getInputData(i);
			if(v === undefined)
				continue;

			switch( input.name )
			{
				case "Ambient color": vec3.copy(scene.ambient_color,v); break;
				case "Bg Color": vec3.copy(scene.background_color,v); break;
			}
		}

		//write outputs
		for(var i in this.outputs)
		{
			var output = this.outputs[i];
			if(!output.links || !output.links.length)
				continue;
			var result = null;
			switch( output.name )
			{
				case "Ambient color": result = scene.ambient_color; break;
				case "Bg Color": result = scene.background_color; break;
				case "Time": result = scene.getTime(); break;
				case "Elapsed": result = (scene._last_dt != null ? scene._last_dt : 0); break;
				case "Frame": result = (scene._frame != null ? scene._frame : 0); break;
				default:
					result = scene.root.getComponent(output.name);
			}
			this.setOutputData(i,result);
		}
	}

	LGraphScene.prototype.onGetInputs = function()
	{
		return [["Ambient color","color"],["Bg Color","color"]];
	}

	LGraphScene.prototype.onGetOutputs = function()
	{
		var r = [["Ambient color","color"],["Bg Color","color"],["Elapsed","number"],["Frame","number"]];
		return LGraphScene.getComponents( this.graph.getScene().root, r);
	}

	LiteGraph.registerNodeType("scene/scene", LGraphScene );
	window.LGraphScene = LGraphScene;

	//********************************************************

	function LGraphSceneNode()
	{
		this.properties = {node_id:""};
		this.size = [90,20];

		if(LGraphSceneNode._current_node_id)
			this.properties.node_id = LGraphSceneNode._current_node_id;
	}

	LGraphSceneNode.title = "SceneNode";
	LGraphSceneNode.desc = "Node on the scene";

	LGraphSceneNode.prototype.getNode = function()
	{
		var scene = this.graph.getScene();

		var node = this._node;
		if(	this.properties.node_id )
			node = scene.getNode( this.properties.node_id );

		if(!node)
			node = this.graph._scenenode;
		return node;
	}

	LGraphSceneNode.prototype.onExecute = function()
	{
		var node = this.getNode();
	
		//read inputs
		for(var i in this.inputs)
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
			}
		}

		//write outputs
		for(var i in this.outputs)
		{
			var output = this.outputs[i];
			if(!output.links || !output.links.length)
				continue;
			switch( output.name )
			{
				case "Transform": this.setOutputData(i, node.getTransform() ); break;
				case "Material": this.setOutputData(i, node.getMaterial() ); break;
				case "Light": this.setOutputData(i, node.getLight() ); break;
				case "Camera": this.setOutputData(i, node.getCamera() ); break;
				case "Mesh": this.setOutputData(i, node.getMesh()); break;
				case "Visible": this.setOutputData(i, node.flags.visible ); break;
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

		for(var i in compos)
		{
			var name = LS.getClassName( compos[i].constructor );
			result.push( [name, name] );
		}

		return result;
	}

	LGraphSceneNode.prototype.onGetInputs = function()
	{
		var result = [["Visible","boolean"]];
		return this.getComponents(result);
		//return [["Transform","Transform"],["Material","Material"],["Mesh","Mesh"],["Enabled","boolean"]];
	}

	LGraphSceneNode.prototype.onGetOutputs = function()
	{
		var result = [["Visible","boolean"]];
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
			this.properties.node_id = LGraphSceneNode._current_node_id;
		this.addInput("Transform","Transform");
		this.addOutput("Position","vec3");
	}

	LGraphTransform.title = "Transform";
	LGraphTransform.desc = "Transform info of a node";

	LGraphTransform.prototype.onExecute = function()
	{
		var scene = this.graph.getScene();
		if(!scene)
			return;

		var node = this._node;
		if(	this.properties.node_id )
			node = scene.getNode( this.properties.node_id );

		if(!node)
			node = this.graph._scenenode;

		//read inputs
		for(var i in this.inputs)
		{
			var input = this.inputs[i];
			var v = this.getInputData(i);
			if(v === undefined)
				continue;
			switch( input.name )
			{
				case "Position": node.transform.setPosition(v); break;
				case "Rotation": node.transform.setRotation(v); break;
				case "Scale": node.transform.setScale(v); break;
			}
		}

		//write outputs
		for(var i in this.outputs)
		{
			var output = this.outputs[i];
			if(!output.links || !output.links.length)
				continue;

			switch( output.name )
			{
				case "Position": this.setOutputData(i, node.transform.getPosition()); break;
				case "Rotation": this.setOutputData(i, node.transform.getRotation()); break;
				case "Scale": this.setOutputData(i, node.transform.getScale(scale)); break;
			}
		}

		//this.setOutputData(0, parseFloat( this.properties["value"] ) );
	}

	LGraphTransform.prototype.onGetInputs = function()
	{
		return [["Position","vec3"],["Rotation","quat"],["Scale","number"],["Enabled","boolean"]];
	}

	LGraphTransform.prototype.onGetOutputs = function()
	{
		return [["Position","vec3"],["Rotation","quat"],["Scale","number"],["Enabled","boolean"]];
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
		for(var i in this.inputs)
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
		for(var i in this.outputs)
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
		var scene = this.graph.getScene();
		if(!scene)
			return;

		var node = this._node;
		if(	this.properties.node_id )
			node = scene.getNode( this.properties.node_id );
		if(!node)
			node = this.graph._scenenode; //use the attached node

		if(!node) 
			return null;

		var mat = null;

		//if it has an input material, use that one
		var slot = this.findInputSlot("Material");
		if( slot != -1)
			return this.getInputData(slot);

		//otherwise return the node material
		return node.getMaterial();
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

		this.addInput("Component");

		this._component = null;
	}

	LGraphComponent.title = "Component";
	LGraphComponent.desc = "A component from a node";

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
			LS.setObjectAttribute( compo, input.name, v );
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
		var node = null;
		if(node_id.charAt(0) == "@")
			node = scene.getNodeByUId( node_id.substr(1) );
		else
			node = scene.getNode( node_id );
		if(!node)
			return null;

		//find compo
		var compo_id = this.properties.component;
		var compo = null;
		if(compo_id.charAt(0) == "@")
			compo = node.getComponentByUId( compo_id.substr(1) );
		else if( LS.Components[ compo_id ] )
			compo = node.getComponent( LS.Components[ compo_id ] );
		else
			return null;

		this._component = compo;
		return compo;
	}

	LGraphComponent.prototype.getComponentAttributes = function()
	{
		var compo = this.getComponent();
		if(!compo)
			return null;
		var attrs = LS.getObjectAttributes( compo );
		var result = [];
		for(var i in attrs)
			result.push( [i, attrs[i]] );
		return result;
	}

	LGraphComponent.prototype.onGetInputs = LGraphComponent.prototype.getComponentAttributes;
	LGraphComponent.prototype.onGetOutputs = LGraphComponent.prototype.getComponentAttributes;

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
		for(var i = 0; this.inputs.length; ++i)
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
		for(var i = 0; this.outputs.length; ++i)
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
	LGraphGlobal["@type"] = { type:"enum", values:["number","string","vec2","vec3","vec4","color","texture"]};

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
};