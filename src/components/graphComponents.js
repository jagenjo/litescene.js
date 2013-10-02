/* Requires LiteGraph.js ******************************/

/**
* This component allow to integrate a behaviour graph on any object
* @class GraphComponent
* @param {Object} o object with the serialized info
*/
function GraphComponent(o)
{
	this._graph = new LGraph();
	this.force_redraw = true;
	if(o)
		this.configure(o);
	else //default
	{
		var graphnode = LiteGraph.createNode("scene/node");
		this._graph.add(graphnode);
	}
}

/**
* Returns the first component of this container that is of the same class
* @method configure
* @param {Object} o object with the configuration info from a previous serialization
*/
GraphComponent.prototype.configure = function(o)
{
	if(o.graph_data)
		this._graph.unserialize( o.graph_data );
}

GraphComponent.prototype.serialize = function()
{
	return { force_redraw: this.force_redraw , graph_data: this._graph.serialize() };
}

GraphComponent.prototype.onAddedToNode = function(node)
{
	this._graph._scenenode = node;
	this._onStart_bind = this.onStart.bind(this);
	this._onUpdate_bind = this.onUpdate.bind(this);
	LEvent.bind(Scene,"start", this._onStart_bind );
	LEvent.bind(Scene,"update", this._onUpdate_bind );
}

GraphComponent.prototype.onRemovedFromNode = function(node)
{
	LEvent.unbind(Scene,"start", this._onStart_bind );
	LEvent.unbind(Scene,"update", this._onUpdate_bind );
}

GraphComponent.prototype.onStart = function()
{
}

GraphComponent.prototype.onUpdate = function(e,dt)
{
	if(!this._root._on_scene) return;
	if(this._graph)
		this._graph.runStep(1);
	if(this.force_redraw)
		LEvent.trigger(Scene,"change");
}


LS.registerComponent(GraphComponent);
window.GraphComponent = GraphComponent;

if(window.LiteGraph != undefined)
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
		var r = [["Transform","Transform"],["Material","Material"],["Mesh","Mesh"],["Enabled","boolean"]];
		var node = this.getNode();
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
		var node = this._node;
		if(	this.properties.node_id )
			node = Scene.getNode( this.properties.node_id );

		if(!node)
			node = this.graph._scenenode;

		var mat = null;
		if(node) //use material of the node
			mat = node.getMaterial();
		//if it has an input material
		var slot = this.findInputSlot("Material");
		if( slot != -1)
			mat = this.getInputData(slot);
		if(!mat)
			mat = new Material();

		//read inputs
		for(var i in this.inputs)
		{
			var input = this.inputs[i];
			var v = this.getInputData(i);
			if(v == undefined)
				continue;

			switch( input.name )
			{
				case "Alpha": mat.alpha = v; break;
				case "Specular f.": mat.specular_factor = v; break;
				case "Diffuse": vec3.copy(mat.diffuse,v); break;
				case "Ambient": vec3.copy(mat.ambient,v); break;
				case "Emissive": vec3.copy(mat.emissive,v); break;
				case "UVs trans.": mat.uvs_matrix.set(v); break;
				default:
					if(input.name.substr(0,4) == "Tex.")
					{
						var channel = input.name.substr(4);
						mat.setTexture(v, channel);
					}
					break;
			}

		}

		//write outputs
		for(var i in this.outputs)
		{
			var output = this.outputs[i];
			if(!output.links || !output.links.length)
				continue;

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
			this.setOutputData(i, v );
		}

		//this.setOutputData(0, parseFloat( this.properties["value"] ) );
	}

	LGraphMaterial.prototype.onGetInputs = function()
	{
		var results = [["Material","Material"],["Alpha","number"],["Specular f.","number"],["Diffuse","color"],["Ambient","color"],["Emissive","color"],["UVs trans.","texmatrix"]];
		for(var i in Material.TEXTURE_CHANNELS)
			results.push(["Tex." + Material.TEXTURE_CHANNELS[i],"Texture"]);
		return results;
	}

	LGraphMaterial.prototype.onGetOutputs = function()
	{
		var results = [["Material","Material"],["Alpha","number"],["Specular f.","number"],["Diffuse","color"],["Ambient","color"],["Emissive","color"],["UVs trans.","texmatrix"]];
		for(var i in Material.TEXTURE_CHANNELS)
			results.push(["Tex." + Material.TEXTURE_CHANNELS[i],"Texture"]);
		return results;
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


	function LGraphTexture()
	{
		this.addOutput("Texture","Texture");
		this.properties = {name:""};
	}

	LGraphTexture.title = "Texture";
	LGraphTexture.desc = "Texture";

	LGraphTexture.prototype.onExecute = function()
	{
		if(!this.properties.name)
			return;

		var tex = ResourcesManager.textures[ this.properties.name ];
		if(!tex)
			ResourcesManager.loadImage( this.properties.name );
		this.setOutputData(0, tex);
	}

	LiteGraph.registerNodeType("texture/texture", LGraphTexture );
	window.LGraphTexture = LGraphTexture;

	//**************************************

	function LGraphTextureOperation()
	{
		this.addInput("Texture","Texture");
		this.addInput("TextureB","Texture");
		this.addInput("value","number");
		this.addOutput("Texture","Texture");
		this.help = "<p>pixelcode must be vec3</p>\
			<p>uvcode must be vec2, is optional</p>\
			<p><strong>uv:</strong> tex. coords, <strong>color:</strong> texture, <strong>colorB:</strong> textureB, <strong>time:</strong> scene time,<strong>value:</strong> input value</p>";
		this.properties = {value:1, uvcode:"", pixelcode:"color*2.0"};
		if(!LGraphTextureOperation._mesh) //first time
		{
			var vertices = new Float32Array(18);
			var coords = [-1,-1, 1,1, -1,1,  -1,-1, 1,-1, 1,1 ];
			LGraphTextureOperation._mesh = new GL.Mesh.load({
				vertices: vertices,
				coords: coords});
			Shaders.addGlobalShader( LGraphTextureOperation.vertex_shader, 
									LGraphTextureOperation.pixel_shader,
									"LGraphTextureOperation",{"UV_CODE":true,"PIXEL_CODE":true});
		}
	}

	LGraphTextureOperation.title = "Tex. Op";
	LGraphTextureOperation.desc = "Texture shader operation";

	LGraphTextureOperation.prototype.onExecute = function()
	{
		var tex = this.getInputData(0);
		var texB = this.getInputData(1);

		if(!this.properties.uvcode && !this.properties.pixelcode)
			return;

		var width = 512;
		var height = 512;
		if(tex)
		{
			width = tex.width;
			height = tex.height;
		}
		else if (texB)
		{
			width = texB.width;
			height = texB.height;
		}

		if(!this._tex || this._tex.width != width || this._tex.height != height )
			this._tex = new GL.Texture( width, height, { format: gl.RGBA, filter: gl.LINEAR });

		var uvcode = "";
		if(this.properties.uvcode)
		{
			uvcode = "uv = " + this.properties.uvcode;
			if(this.properties.uvcode.indexOf(";") != -1) //there are line breaks, means multiline code
				uvcode = this.properties.uvcode;
		}
		
		var pixelcode = "";
		if(this.properties.pixelcode)
		{
			pixelcode = "result = " + this.properties.pixelcode;
			if(this.properties.pixelcode.indexOf(";") != -1) //there are line breaks, means multiline code
				pixelcode = this.properties.pixelcode;
		}

		var shader = Shaders.get("LGraphTextureOperation", { UV_CODE: uvcode, PIXEL_CODE: pixelcode });
		if(shader)
		{
			var value = this.getInputData(2);
			if(value != null)
				this.properties.value = value;
			else
				value = parseFloat( this.properties.value );

			this._tex.drawTo(function() {
				gl.disable( gl.DEPTH_TEST );
				gl.disable( gl.CULL_FACE );
				gl.disable( gl.BLEND );
				if(tex)	tex.bind(0);
				if(texB) texB.bind(1);
				shader.uniforms({texture:0, textureB:1, value: value, texSize:[width,height], time: Scene._global_time - Scene._start_time}).draw( LGraphTextureOperation._mesh );
			});

			this.setOutputData(0, this._tex);
		}
	}

	LGraphTextureOperation.vertex_shader = "precision highp float;\n\
			attribute vec3 a_vertex;\n\
			attribute vec2 a_coord;\n\
			varying vec2 coord;\n\
			void main() {\n\
				coord = a_coord; gl_Position = vec4(coord * 2.0 - 1.0, 0.0, 1.0);\n\
			}\n\
			";

	LGraphTextureOperation.pixel_shader = "precision highp float;\n\
			\n\
			uniform sampler2D texture;\n\
			uniform sampler2D textureB;\n\
			varying vec2 coord;\n\
			uniform vec2 texSize;\n\
			uniform float time;\n\
			uniform float value;\n\
			\n\
			void main() {\n\
				vec2 uv = coord;\n\
				UV_CODE;\n\
				vec3 color = texture2D(texture, uv).rgb;\n\
				vec3 colorB = texture2D(textureB, uv).rgb;\n\
				vec3 result = vec3(0.0);\n\
				PIXEL_CODE;\n\
				gl_FragColor = vec4(result, 1.0);\n\
			}\n\
			";

	LiteGraph.registerNodeType("texture/textureop", LGraphTextureOperation );
	window.LGraphTextureOperation = LGraphTextureOperation;

	//**************************
	function LGraphTexturePreview()
	{
		this.addInput("Texture","Texture");
		this.size = [LGraphTexturePreview.img_size, LGraphTexturePreview.img_size];
	}

	LGraphTexturePreview.title = "Texture preview";
	LGraphTexturePreview.desc = "Show a texture in the graph canvas";
	LGraphTexturePreview.img_size = 256;

	LGraphTexturePreview.prototype.onDrawBackground = function(ctx)
	{
		var tex = this.getInputData(0);
		if(!tex) return;
		var size = LGraphTexturePreview.img_size;

		//Generate low-level version in the GPU to speed up
		if(tex.width > size || tex.height > size)
		{
			var temp_tex = this._temp_tex;
			if(!this._temp_tex)
			{
				temp_tex = new GL.Texture(size,size, { minFilter: gl.NEAREST });
				this._temp_tex = temp_tex;
			}

			//copy
			tex.copyTo(temp_tex);
			tex = temp_tex;
		}

		//create intermediate canvas with lowquality version
		var tex_canvas = this._canvas;
		if(!tex_canvas)
		{
			tex_canvas = createCanvas(size,size);
			this._canvas = tex_canvas;
		}
		temp_tex.toCanvas(tex_canvas);

		//render to graph canvas
		ctx.drawImage(tex_canvas,0,0,this.size[0],this.size[1]);
	}

	LiteGraph.registerNodeType("texture/texpreview", LGraphTexturePreview );
	window.LGraphTexturePreview = LGraphTexturePreview;
}