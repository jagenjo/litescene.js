///@INFO: GRAPHS
if(typeof(LiteGraph) != "undefined")
{
	function LGraphTween() {
		this.addInput("tween", LiteGraph.ACTION);
		this.addInput("value", "");
		this.addInput("prop", "");
		this.addOutput("start", LiteGraph.EVENT);
		this.addOutput("finish", LiteGraph.EVENT);

		this.properties = {
			duration: 1,
			locator: ""
		};
	}

	LGraphTween.title = "Tween";
	LGraphTween.desc = "tween between two values";

	LGraphTween.prototype.onAction = function( action, param )
	{
		var in_node = this.getInputNode(2);
		var scene = this.graph._scene || ONE.GlobalScene; //subgraphs do not have an scene assigned
		var info = null;

		if(in_node)
		{	
			if(!in_node.getLocatorInfo )
				return;
			info = in_node.getLocatorInfo();
		}
		else if( this.properties.locator )
		{
			if(!this._locator_split)
				this._locator_split = this.properties.locator.split("/");
			info = scene.getPropertyInfoFromPath( this._locator_split );
		}

		if(!info)
			return;

		var target_value = this.getInputData(1);
		if( target_value == null )
			return;

		var that = this;

		this.triggerSlot(0);
		ONE.Tween.easeProperty( info.target, info.name, target_value, this.properties.duration, null, inner_complete );

		function inner_complete()
		{
			that.triggerSlot(1);			
		}
	}

	LGraphTween.prototype.onPropertyChanged = function(name,value)
	{
		if(name == "locator")
		{
			if( value )
				this._locator_split = value.split("/");
			else
				this._locator_split = null;
		}
	}

	LGraphTween.prototype.onDropItem = function( event )
	{
		var locator = event.dataTransfer.getData("uid");
		if(!locator)
			return;
		this.properties.locator = locator;
		return true;
	}

	LiteGraph.registerNodeType( "core/tween", LGraphTween );	

	//gets a resource
	function LGraphResource() {
		this.addOutput("out", "");
		this.properties = {
			filename: "",
			type: ""
		};
	}

	LGraphResource.title = "resource";
	LGraphResource.desc = "gets a resource";

	LGraphResource.widgets_info = {
		filename: { widget: "resource" }
	};

	LGraphResource.prototype.onExecute = function() {
		var res = null;
		if(this.properties.filename)
			res = ONE.ResourcesManager.resources[this.properties.filename];

		//wrong type
		if( res && this.properties.type && res.constructor.name.toLowerCase() !== this.properties.type.toLowerCase() )
			res = null;

		this.setOutputData(0,res);
	}

	LGraphResource.prototype.getResources = function(o)
	{
		if(this.properties.filename)
			o[this.properties.filename] = true;
	}

	LiteGraph.registerNodeType( "core/resource", LGraphResource );	


	function LGraphGetMesh() {
		this.addOutput("out", "mesh");
		this.properties = {
			name: ""
		};
	}

	LGraphGetMesh.title = "mesh";
	LGraphGetMesh.desc = "gets mesh";

	LGraphGetMesh.widgets_info = {
		name: { widget: "mesh" }
	};

	LGraphGetMesh.prototype.onExecute = function() {
		var mesh = null;
		if(this.properties.name)
			mesh = ONE.ResourcesManager.meshes[this.properties.name];
		if(mesh && (mesh.constructor !== GL.Mesh || mesh.ready === false) )
			mesh = null;
		this.setOutputData(0,mesh);
	}

	LGraphGetMesh.prototype.getResources = function(o)
	{
		if(this.properties.name)
			o[this.properties.name] = true;
	}

	LiteGraph.registerNodeType( "geometry/mesh", LGraphGetMesh );	


	//****************************************

	function LGraphRenderMeshInScene() {
		this.addInput("mesh", "mesh");
		this.addInput("material", "material");
		this.addInput("mat4", "mat4");
		this.addInput("instances", "[mat4]");

		this.properties = {
			enabled: true,
			primitive: GL.TRIANGLES,
			use_node_transform: true,
			use_node_material: true
		};
	}

	LGraphRenderMeshInScene.title = "Render";
	LGraphRenderMeshInScene.desc = "renders a mesh with a material inside the scene";

	LGraphRenderMeshInScene.PRIMITIVE_VALUES = { "points":GL.POINTS, "lines":GL.LINES, "line_loop":GL.LINE_LOOP,"line_strip":GL.LINE_STRIP, "triangles":GL.TRIANGLES, "triangle_fan":GL.TRIANGLE_FAN, "triangle_strip":GL.TRIANGLE_STRIP };

	LGraphRenderMeshInScene.widgets_info = {
		primitive: { widget: "combo", values: LGraphRenderMeshInScene.PRIMITIVE_VALUES }
	};

	LGraphRenderMeshInScene.prototype.onExecute = function() {

		if(!this.properties.enabled)
			return;

		//as renderinstance
		if(!this._RI)
			this._RI = new ONE.RenderInstance();

		//root node
		var node = this.graph._scenenode;
		if(!node)
			return;
		this._RI.fromNode( node, true );

		var mesh = this.getInputData(0);
		if(!mesh)
			return;
		this._RI.setMesh( mesh );

		//material
		var material = this.getInputData(1);
		if(!material && this.properties.use_node_material)
			material = node.getMaterial();
		if(!material)
			material = ONE.Renderer.default_material;
		this._RI.setMaterial( material );

		this._RI.primitive = this.properties.primitive;

		//transform
		var model = this.getInputData(2);
		if(!model)
		{
			if(this.properties.use_node_transform && node && node.transform )
				model = node.transform.getGlobalMatrixRef();
			else
				model = ONE.IDENTITY;
		}
			
		this._RI.setMatrix( model );

		//instancing
		var instances = this.getInputData(3);
		if(instances)
		{
			//if(model == ONE.IDENTITY) //if not multiply all by model?
				this._RI.instanced_models = instances;
		}
		else
			this._RI.instanced_models = null;
		this._RI.use_bounding = !instances;

		ONE.Renderer.addImmediateRenderInstance( this._RI );
	}

	LiteGraph.registerNodeType( "geometry/render_mesh_in_scene", LGraphRenderMeshInScene );
	
}