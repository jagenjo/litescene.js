
function SpriteRenderer(o)
{
	if(o)
		this.configure(o);
}

SpriteRenderer.icon = "mini-icon-teapot.png";

SpriteRenderer.prototype.onAddedToNode = function(node)
{
	LEvent.bind(node, "collectRenderInstances", this.onCollectInstances, this);
}

SpriteRenderer.prototype.onRemovedFromNode = function(node)
{
	LEvent.unbind(node, "collectRenderInstances", this.onCollectInstances, this);
}


//MeshRenderer.prototype.getRenderInstance = function(options)
SpriteRenderer.prototype.onCollectInstances = function(e, instances, options)
{
	var node = this._root;
	if(!this._root) return;

	var mesh = this._mesh;
	if(!this._mesh)
	{
		this._mesh = GL.Mesh.plane();
		mesh = this._mesh;
	}

	var RI = this._render_instance;
	if(!RI)
		this._render_instance = RI = new RenderInstance(this._root, this);

	//do not need to update
	RI.matrix.set( this._root.transform._global_matrix );
	mat4.multiplyVec3( RI.center, RI.matrix, vec3.create() );

	RI.mesh = mesh;
	RI.material = this._root.getMaterial();

	RI.flags = RI_DEFAULT_FLAGS;
	RI.applyNodeFlags();

	instances.push(RI);
}

LS.registerComponent(SpriteRenderer);