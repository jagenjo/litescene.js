
function Collider(o)
{
	this.shape = 1;
	this.mesh = null;
	this.size = vec3.fromValues(0.5,0.5,0.5);
	this.center = vec3.create();
	if(o)
		this.configure(o);
}

Collider.icon = "mini-icon-teapot.png";

//vars
Collider["@size"] = { type: "vec3", step: 0.01 };
Collider["@center"] = { type: "vec3", step: 0.01 };
Collider["@mesh"] = { type: "mesh" };
Collider["@shape"] = { widget:"combo", values: {"Box":1, "Sphere": 2, "Mesh":5 }};

Collider.prototype.onAddedToNode = function(node)
{
	LEvent.bind(node, "collectPhysicInstances", this.onGetColliders, this);
}

Collider.prototype.onRemovedFromNode = function(node)
{
	LEvent.unbind(node, "collectPhysicInstances", this.onGetColliders, this);
}

Collider.prototype.getMesh = function() {
	if(typeof(this.mesh) === "string")
		return ResourcesManager.meshes[this.mesh];
	return this.mesh;
}

Collider.prototype.getResources = function(res)
{
	if(!this.mesh) return;
	if(typeof(this.mesh) == "string")
		res[this.mesh] = Mesh;
	return res;
}

Collider.prototype.onResourceRenamed = function (old_name, new_name, resource)
{
	if(this.mesh == old_name)
		this.mesh = new_name;
}

Collider.prototype.onGetColliders = function(e, colliders)
{
	var PI = this._PI;
	if(!PI)
		this._PI = PI = new PhysicsInstance(this._root, this);

	PI.matrix.set( this._root.transform._global_matrix );
	PI.type = this.shape;

	if(PI.type == PhysicsInstance.SPHERE)
		BBox.setCenterHalfsize( PI.oobb, this.center, [this.size[0],this.size[0],this.size[0]]);
	else
		BBox.setCenterHalfsize( PI.oobb, this.center, this.size);
	vec3.copy( PI.center, this.center );
	if(PI.type == PhysicsInstance.MESH)
	{
		var mesh = this.getMesh();
		if(!mesh) return;
		PI.setMesh(mesh);
	}
	colliders.push(PI);
}


LS.registerComponent(Collider);