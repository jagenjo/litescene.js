
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

MeshRenderer["@mesh"] = { widget: "mesh" };
MeshRenderer["@lod_mesh"] = { widget: "mesh" };
MeshRenderer["@primitive"] = {widget:"combo", values: {"Default":null, "Points": 0, "Lines":1, "Triangles":4 }};


MeshRenderer.prototype.onAddedToNode = function(node)
{
	if(!node.meshrenderer)
		node.meshrenderer = this;
}

MeshRenderer.prototype.onRemovedFromNode = function(node)
{
	if(node.meshrenderer)
		delete node["meshrenderer"];
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
	this.two_sided = !!o.two_sided; //true or false
	if(o.material)
		this.material = typeof(o.material) == "string" ? o.material : new Material(o.material);
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
		o.two_sided = this.two_sided
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

MeshRenderer.prototype.getRenderInstance = function(options)
{
	var mesh = this.getMesh();
	if(!mesh) return null;

	var node = this._root;

	if(options.step == "reflection" && !node.flags.seen_by_reflections)
		return null;
	if(options.step == "main" && !node.flags.seen_by_camera)
		return null;
	if(options.step == "shadow" && !node.flags.cast_shadows)
		return null;

	var matrix = this._root ? this._root.transform.getGlobalMatrix() : MeshRenderer._identity;
	var center = mat4.multiplyVec3(vec3.create(), matrix, vec3.create());

	var RI = this._render_instance || new RenderInstance();

	RI.mesh = mesh;
	RI.submesh_id = this.submesh_id;
	RI.primitive = this.primitive == null ? gl.TRIANGLES : this.primitive;
	RI.material = this.material || this._root.getMaterial();
	RI.two_sided = this.two_sided;
	RI.matrix.set(matrix);
	RI.center.set(center);
	RI.scene = Scene;

	return RI;
}

LS.registerComponent(MeshRenderer);
LS.MeshRenderer = MeshRenderer;