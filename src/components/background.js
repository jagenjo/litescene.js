
function BackgroundRenderer(o)
{
	this.texture = null;
	this.color = vec3.fromValues(1,1,1);
	this.material_name = null;

	if(o)
		this.configure(o);
}

BackgroundRenderer.icon = "mini-icon-teapot.png";
BackgroundRenderer["@texture"] = { widget: "texture" };
BackgroundRenderer["@color"] = { widget: "color" };
BackgroundRenderer["@material_name"] = { widget: "material" };

BackgroundRenderer.prototype.onAddedToNode = function(node)
{
	LEvent.bind(node, "collectRenderInstances", this.onCollectInstances, this);
}

BackgroundRenderer.prototype.onRemovedFromNode = function(node)
{
	LEvent.unbind(node, "collectRenderInstances", this.onCollectInstances, this);
}

BackgroundRenderer.prototype.getResources = function(res)
{
	if(typeof(this.texture) == "string")
		res[this.texture] = Texture;
	return res;
}

BackgroundRenderer.prototype.onCollectInstances = function(e, instances)
{
	var mat = null;

	if( this.material_name )
		mat = LS.ResourcesManager.materials[ this.material_name ];

	if(!mat)
	{
		var texture = this.texture;
		if(!texture) 
			return;
		if(texture.constructor === String)
			texture = LS.ResourcesManager.textures[texture];

		if(!this._material)
			mat = this._material = new LS.Material({use_scene_ambient:false});
		else
			mat = this._material;
		mat.textures["color"] = texture;
		mat.color.set( this.color );
	}

	var mesh = this._mesh;
	if(!mesh)
		mesh = this._mesh = GL.Mesh.plane({size:2});

	var RI = this._render_instance;
	if(!RI)
	{
		this._render_instance = RI = new RenderInstance(this._root, this);
		RI.priority = 100; //render the first one (is a background)
	}

	RI.setMesh(mesh);
	RI.material = mat;

	RI.flags = RI_DEFAULT_FLAGS;
	RI.applyNodeFlags();
	RI.disableFlag( RI_CAST_SHADOWS ); //never cast shadows
	RI.enableFlag( RI_IGNORE_LIGHTS ); //no lights
	RI.enableFlag( RI_CW );
	RI.disableFlag( RI_DEPTH_WRITE ); 
	RI.disableFlag( RI_DEPTH_TEST ); 
	RI.disableFlag( RI_CULL_FACE ); 
	RI.enableFlag( RI_IGNORE_FRUSTUM );
	RI.enableFlag( RI_IGNORE_VIEWPROJECTION );

	instances.push(RI);
}

LS.registerComponent(BackgroundRenderer);
LS.BackgroundRenderer = BackgroundRenderer;