
function Cloner(o)
{
	this.count = [10,1,1];
	this.size = [100,100,100];
	this.mesh = null;
	this.lod_mesh = null;
	this.material = null;
	this.mode = Cloner.GRID_MODE;

	if(o)
		this.configure(o);

	if(!Cloner._identity) //used to avoir garbage
		Cloner._identity = mat4.create();
}

Cloner.GRID_MODE = 1;
Cloner.RADIAL_MODE = 2;

Cloner.icon = "mini-icon-teapot.png";

//vars
Cloner["@mesh"] = { widget: "mesh" };
Cloner["@lod_mesh"] = { widget: "mesh" };
Cloner["@mode"] = {widget:"combo", values: {"Grid":1, "Radial": 2}};
Cloner["@count"] = {widget:"vector3", min:1, step:1 };

Cloner.prototype.onAddedToNode = function(node)
{
	LEvent.bind(node, "collectRenderInstances", this.onCollectInstances, this);
}

Cloner.prototype.onRemovedFromNode = function(node)
{
	LEvent.unbind(node, "collectRenderInstances", this.onCollectInstances, this);
}

Cloner.prototype.getMesh = function() {
	if(typeof(this.mesh) === "string")
		return ResourcesManager.meshes[this.mesh];
	return this.mesh;
}

Cloner.prototype.getLODMesh = function() {
	if(typeof(this.lod_mesh) === "string")
		return ResourcesManager.meshes[this.lod_mesh];
	return this.low_mesh;
}

Cloner.prototype.getResources = function(res)
{
	if(typeof(this.mesh) == "string")
		res[this.mesh] = Mesh;
	if(typeof(this.lod_mesh) == "string")
		res[this.lod_mesh] = Mesh;
	return res;
}

Cloner.generateTransformKey = function(count, hsize, offset)
{
	var key = new Float32Array(9);
	key.set(count);
	key.set(hsize,3);
	key.set(offset,6);
	return key;
}

Cloner.compareKeys = function(a,b)
{
	for(var i = 0; i < a.length; ++i)
		if(a[i] != b[i])
			return false;
	return true;
}


Cloner.prototype.onCollectInstances = function(e, instances)
{
	var mesh = this.getMesh();
	if(!mesh) return null;

	var node = this._root;
	if(!this._root) return;

	var total = this.count[0] * this.count[1] * this.count[2];
	if(!total) return;

	if(!this._RIs || this._RIs.length != total)
	{
		//create RIs
		if(!this._RIs)
			this._RIs = new Array(total);
		else
			this._RIs.length = total;

		for(var i = 0; i < total; ++i)
			if(!this._RIs[i])
				this._RIs[i] = new RenderInstance(this._root, this);
	}

	var RIs = this._RIs;
	var global = this._root.transform.getGlobalMatrix(mat4.create());
	var material = this.material || this._root.getMaterial();

	var hsize = vec3.scale( vec3.create(), this.size, 0.5 );
	var offset = [0,0,0];
	if(this.count[0] > 1) offset[0] = this.size[0] / (this.count[0]-1);
	else hsize[0] = 0;
	if(this.count[1] > 1) offset[1] = this.size[1] / (this.count[1]-1);
	else hsize[1] = 0;
	if(this.count[2] > 1) offset[2] = this.size[2] / (this.count[2]-1);
	else hsize[2] = 0;

	var flags = 0;

	/*
	var update_transform = true;
	var current_key = Cloner.generateTransformKey(this.count,hsize,offset);
	if( this._genereate_key && Cloner.compareKeys(current_key, this._genereate_key))
		update_transform = false;
	this._genereate_key = current_key;
	*/

	var start_array_pos = instances.length;
	instances.length = start_array_pos + total;

	var i = 0;
	var tmp = vec3.create(), zero = vec3.create();
	for(var x = 0; x < this.count[0]; ++x)
	for(var y = 0; y < this.count[1]; ++y)
	for(var z = 0; z < this.count[2]; ++z)
	{
		var RI = RIs[i];

		//genereate flags for the first instance
		if(i == 0)
		{
			RI.flags = RI_DEFAULT_FLAGS;
			RI.applyNodeFlags();
			flags = RI.flags;
		}
		else //for the rest just reuse the same as the first one
			RI.flags = flags;

		RI.mesh = mesh;
		RI.material = material;

		tmp.set([x * offset[0] - hsize[0],y * offset[1] - hsize[1], z * offset[2] - hsize[2]]);
		mat4.translate( RI.matrix, global, tmp );
		mat4.multiplyVec3( RI.center, RI.matrix, zero );

		instances[start_array_pos + i] = RI;
		++i;
	}


	//return RI;
}

LS.registerComponent(Cloner);
LS.Cloner = Cloner;