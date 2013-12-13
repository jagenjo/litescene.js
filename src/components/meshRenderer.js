
function MeshRenderer(o)
{
	this.mesh = null;
	this.lod_mesh = null;
	this.submesh_id = -1;
	this.material = null;
	this.primitive = null;
	this.two_sided = false;

	if(o)
		this.configure(o);

	if(!MeshRenderer._identity) //used to avoir garbage
		MeshRenderer._identity = mat4.create();
}

MeshRenderer.icon = "mini-icon-teapot.png";

//vars
MeshRenderer["@mesh"] = { widget: "mesh" };
MeshRenderer["@lod_mesh"] = { widget: "mesh" };
MeshRenderer["@primitive"] = {widget:"combo", values: {"Default":null, "Points": 0, "Lines":1, "Triangles":4 }};
MeshRenderer["@submesh_id"] = {widget:"combo", values: function() {
	var component = this.instance;
	var mesh = component.getMesh();
	if(!mesh) return null;
	if(!mesh || !mesh.info || !mesh.info.groups || mesh.info.groups.length < 2)
		return null;

	var t = {"all":null};
	for(var i = 0; i < mesh.info.groups.length; ++i)
		t[mesh.info.groups[i].name] = i;
	return t;
}};

MeshRenderer.prototype.onAddedToNode = function(node)
{
	if(!node.meshrenderer)
		node.meshrenderer = this;
	LEvent.bind(node, "collectRenderInstances", this.onCollectInstances, this);
}

MeshRenderer.prototype.onRemovedFromNode = function(node)
{
	if(node.meshrenderer)
		delete node["meshrenderer"];
	LEvent.unbind(node, "collectRenderInstances", this.onCollectInstances, this);
}

/**
* Configure from a serialized object
* @method configure
* @param {Object} object with the serialized info
*/
MeshRenderer.prototype.configure = function(o)
{
	this.mesh = o.mesh;
	this.lod_mesh = o.lod_mesh;
	this.submesh_id = o.submesh_id;
	this.primitive = o.primitive; //gl.TRIANGLES
	this.two_sided = !!o.two_sided;
	if(o.material)
		this.material = typeof(o.material) == "string" ? o.material : new Material(o.material);

	if(o.morph_targets)
		this.morph_targets = o.morph_targets;
}

/**
* Serialize the object 
* @method serialize
* @return {Object} object with the serialized info
*/
MeshRenderer.prototype.serialize = function()
{
	var o = { 
		mesh: this.mesh,
		lod_mesh: this.lod_mesh
	};

	if(this.material)
		o.material = typeof(this.material) == "string" ? this.material : this.material.serialize();

	if(this.primitive != null)
		o.primitive = this.primitive;
	if(this.submesh_id)
		o.submesh_id = this.submesh_id;
	if(this.two_sided)
		o.two_sided = this.two_sided;
	return o;
}

MeshRenderer.prototype.getMesh = function() {
	if(typeof(this.mesh) === "string")
		return ResourcesManager.meshes[this.mesh];
	return this.mesh;
}

MeshRenderer.prototype.getLODMesh = function() {
	if(typeof(this.lod_mesh) === "string")
		return ResourcesManager.meshes[this.lod_mesh];
	return this.low_mesh;
}

MeshRenderer.prototype.getResources = function(res)
{
	if(typeof(this.mesh) == "string")
		res[this.mesh] = Mesh;
	if(typeof(this.lod_mesh) == "string")
		res[this.lod_mesh] = Mesh;
	return res;
}

//MeshRenderer.prototype.getRenderInstance = function(options)
MeshRenderer.prototype.onCollectInstances = function(e, instances)
{
	var mesh = this.getMesh();
	if(!mesh) return null;

	var node = this._root;
	if(!this._root) return;

	var RI = this._render_instance;
	if(!RI)
		this._render_instance = RI = new RenderInstance(this._root, this);

	//do not need to update
	RI.matrix.set( this._root.transform._global_matrix );
	//this._root.transform.getGlobalMatrix(RI.matrix);
	mat4.multiplyVec3( RI.center, RI.matrix, vec3.create() );

	//buffers
	RI.setMesh( mesh, this.primitive );

	if(this.submesh_id != -1 && this.submesh_id != null)
		RI.submesh_id = this.submesh_id;

	RI.material = this.material || this._root.getMaterial();

	RI.flags = RI_DEFAULT_FLAGS;
	RI.applyNodeFlags();
	if(this.two_sided)
		RI.flags &= ~RI_CULL_FACE;

	instances.push(RI);
	//return RI;
}

LS.registerComponent(MeshRenderer);
LS.MeshRenderer = MeshRenderer;