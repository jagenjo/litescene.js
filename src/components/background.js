
function BackgroundRenderer(o)
{
	this.texture = null;
	if(o)
		this.configure(o);
}

BackgroundRenderer.icon = "mini-icon-teapot.png";
BackgroundRenderer["@texture"] = { widget: "texture" };

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
	var texture = this.texture;
	if(!texture) return;
	if(texture.constructor === String)
		texture = LS.ResourcesManager.textures[texture];

	var mesh = this._mesh;
	if(!mesh)
		mesh = this._mesh = GL.Mesh.getScreenQuad();

	var mat = this._material;
	if(!mat)
		mat = this._material = new LS.Material({use_scene_ambient:false});
	mat.textures["color"] = texture;

	var RI = this._render_instance;
	if(!RI)
	{
		this._render_instance = RI = new RenderInstance(this._root, this);
		RI.priority = 100;
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
	RI.enableFlag( RI_IGNORE_FRUSTRUM );
	RI.enableFlag( RI_IGNORE_VIEWPROJECTION );

	instances.push(RI);
}

//Not working
//LS.registerComponent(BackgroundRenderer);
//LS.BackgroundRenderer = BackgroundRenderer;