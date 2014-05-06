if(typeof(LiteGraph) != "undefined")
{
	/* Scene LNodes ***********************/

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
		var node = this._node;
		if(	this.properties.node_id )
			node = Scene.getNode( this.properties.node_id );

		if(!node)
			node = this.graph._scenenode;

		//read inputs
		for(var i in this.inputs)
		{
			var input = this.inputs[i];
			var v = this.getInputData(i);
			if(v == undefined)
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

	function LGraphSceneNode()
	{
		this.properties = {node_id:""};

		if(LGraphSceneNode._current_node_id)
			this.properties.node_id = LGraphSceneNode._current_node_id;
	}

	LGraphSceneNode.title = "SceneNode";
	LGraphSceneNode.desc = "Node on the scene";

	LGraphSceneNode.prototype.getNode = function()
	{
		var node = this._node;
		if(	this.properties.node_id )
			node = Scene.getNode( this.properties.node_id );

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
			if(v == undefined)
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

	LGraphSceneNode.prototype.onGetInputs = function()
	{
		return [["Transform","Transform"],["Material","Material"],["Mesh","Mesh"],["Enabled","boolean"]];
	}

	LGraphSceneNode.prototype.onGetOutputs = function()
	{
		var node = this.getNode();
		/*
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

		var r = [["Transform","Transform"],["Material","Material"],["Mesh","Mesh"],["Enabled","boolean"]];
		if(node.light)
			r.push(["Light","Light"]);
		if(node.camera)
			r.push(["Camera","Camera"]);
		return r;
	}

	LiteGraph.registerNodeType("scene/node", LGraphSceneNode );
	window.LGraphSceneNode = LGraphSceneNode;

	//********************************************************

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
			if(v == undefined)
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
		var node = this._node;
		if(	this.properties.node_id )
			node = Scene.getNode( this.properties.node_id );
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
		var node = this._node;
		if(	this.properties.node_id )
			node = Scene.getNode( this.properties.node_id );

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
		for(var i in this.inputs)
		{
			var input = this.inputs[i];
			var v = this.getInputData(i);
			if(v == undefined)
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
		for(var i in this.outputs)
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

	//********************************************************

	function LGraphScene()
	{
		this.addOutput("Time","number");
	}

	LGraphScene.title = "Scene";
	LGraphScene.desc = "Scene";

	LGraphScene.prototype.onExecute = function()
	{
		//read inputs
		for(var i in this.inputs)
		{
			var input = this.inputs[i];
			var v = this.getInputData(i);
			if(v == undefined)
				continue;

			switch( input.name )
			{
				case "Ambient color": vec3.copy(Scene.ambient_color,v); break;
				case "Bg Color": vec3.copy(Scene.background_color,v); break;
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
				case "Light": this.setOutputData(i, Scene.light ); break;
				case "Camera": this.setOutputData(i, Scene.camera ); break;
				case "Ambient color": this.setOutputData(i, Scene.ambient_color ); break;
				case "Bg Color": this.setOutputData(i, Scene.background_color ); break;
				case "Time": this.setOutputData(i, Scene._time ); break;
				case "Elapsed": this.setOutputData(i, Scene._last_dt != null ? Scene._last_dt : 0); break;
				case "Frame": this.setOutputData(i, Scene._frame != null ? Scene._frame : 0 ); break;
			}
		}
	}

	LGraphScene.prototype.onGetOutputs = function()
	{
		return [["Light","Light"],["Camera","Camera"],["Ambient color","color"],["Bg Color","color"],["Elapsed","number"],["Frame","number"]];
	}

	LiteGraph.registerNodeType("scene/scene", LGraphScene );
	window.LGraphScene = LGraphScene;

	//************************************

	function LGraphGlobal()
	{
		this.addOutput("Value","number");
		this.properties = {name:"myvar", value: 0, min:0, max:1 };
	}

	LGraphGlobal.title = "Global";
	LGraphGlobal.desc = "Global var for the graph";

	LGraphGlobal.prototype.onExecute = function()
	{
		if(!this.properties.name)
			return;

		this.setOutputData(0, this.properties.value);
	}

	LiteGraph.registerNodeType("scene/global", LGraphGlobal );
	window.LGraphGlobal = LGraphGlobal;

	//************************************
};