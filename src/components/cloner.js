///@INFO: UNCOMMON
function Cloner(o)
{
	this.enabled = true;

	this.mode = Cloner.GRID_MODE;

	this.createProperty( "count", vec3.fromValues(10,1,1) );
	this.createProperty( "size", vec3.fromValues(100,100,100) );

	this.mesh = null;
	this.lod_mesh = null;
	this.material = null;

	this._instances_matrix = [];

	this._RI = new LS.RenderInstance( null, this );

	if(o)
		this.configure(o);
}

Cloner.GRID_MODE = 1;
Cloner.RADIAL_MODE = 2;
Cloner.MESH_MODE = 3;
Cloner.CHILDREN_MODE = 4;
Cloner.CUSTOM_MODE = 5;

Cloner.icon = "mini-icon-cloner.png";

//vars
Cloner["@mesh"] = { type: "mesh" };
Cloner["@lod_mesh"] = { type: "mesh" };
Cloner["@mode"] = { type:"enum", values: { "Grid": Cloner.GRID_MODE, "Radial": Cloner.RADIAL_MODE, /* "Mesh": Cloner.MESH_MODE ,*/ "Children": Cloner.CHILDREN_MODE, "Custom": Cloner.CUSTOM_MODE } };
Cloner["@count"] = { type:"vec3", min:1, step:1, precision: 0 };

Cloner.prototype.onAddedToScene = function(scene)
{
	LEvent.bind(scene, "collectRenderInstances", this.onCollectInstances, this);
	//LEvent.bind(scene, "afterCollectData", this.onUpdateInstances, this);
}

Cloner.prototype.onRemovedFromScene = function(scene)
{
	LEvent.unbind(scene, "collectRenderInstances", this.onCollectInstances, this);
	//LEvent.unbind(scene, "afterCollectData", this.onUpdateInstances, this);
}

Cloner.prototype.getMesh = function() {
	if( this.mesh && this.mesh.constructor === String )
		return LS.ResourcesManager.meshes[ this.mesh ];
	return this.mesh;
}

Cloner.prototype.getLODMesh = function() {
	if( this.lod_mesh && this.lod_mesh.constructor === String )
		return LS.ResourcesManager.meshes[this.lod_mesh];
	return this.lod_mesh;
}

Cloner.prototype.getAnyMesh = function() {
	return (this.getMesh() || this.getLODMesh());
}

Cloner.prototype.getResources = function(res)
{
	if( this.mesh && this.mesh.constructor === String )
		res[this.mesh] = Mesh;
	if( this.lod_mesh && this.lod_mesh.constructor === String )
		res[this.lod_mesh] = Mesh;
	return res;
}

Cloner.prototype.onResourceRenamed = function( old_name, new_name, resource )
{
	if( this.mesh == old_name )
		this.mesh = new_name;

	if( this.lod_mesh == old_name )
		this.lod_mesh = new_name;
}

Cloner.prototype.onCollectInstances = function(e, instances)
{
	if(!this.enabled)
		return;

	var mesh = this.getAnyMesh();
	if(!mesh)
		return null;

	var node = this._root;
	if(!this._root)
		return;

	var RI = this._RI;
	var is_static = this._root.flags && this._root.flags.is_static;
	var transform = this._root.transform;
	RI.layers = node.layers;

	RI.fromNode( this._root, true );
	RI.setMatrix( LS.IDENTITY, LS.IDENTITY ); //RI matrix is ignored in instanced rendering

	//material (after flags because it modifies the flags)
	var material = null;
	if(this.material)
		material = LS.ResourcesManager.getResource( this.material );
	else
		material = this._root.getMaterial();
	RI.setMaterial( material );

	//buffers from mesh and bounding
	RI.setMesh( mesh, this.primitive );
	RI.use_bounding = false; //TODO: use the bounding

	if(this.submesh_id != -1 && this.submesh_id != null && mesh.info && mesh.info.groups)
	{
		var group = mesh.info.groups[this.submesh_id];
		if(group)
		{
			RI.setRange( group.start, group.length );
			if( group.bounding )
				RI.setBoundingBox( group.bounding );
		}
	}
	else
		RI.setRange(0,-1);

	RI.collision_mesh = mesh;

	//compute the matrices for every instance
	this.computeInstancesMatrix(RI);

	//no instances?
	if(this._instances_matrix.length == 0)
		return;

	instances.push( RI );
}

Cloner.prototype.computeInstancesMatrix = function( RI )
{
	var global = this._root.transform.getGlobalMatrixRef();
	RI.instanced_models = this._instances_matrix;

	var countx = this._count[0]|0;
	var county = this._count[1]|0;
	var countz = this._count[2]|0;

	var node = this._root;
	var hsize = vec3.create();
	var offset = vec3.create();
	var tmp = vec3.create();
	var zero = vec3.create();
	RI.picking_node = null; //?

	//Set position according to the cloner mode
	if(this.mode == Cloner.GRID_MODE)
	{
		var total = countx * county * countz;
		this._instances_matrix.length = total;
		if( total == 0 )
			return;

		//compute offsets
		vec3.scale( hsize, this.size, 0.5 );
		if( countx > 1) offset[0] = this.size[0] / ( countx - 1);
		else hsize[0] = 0;
		if( county > 1) offset[1] = this.size[1] / ( county - 1);
		else hsize[1] = 0;
		if( countz > 1) offset[2] = this.size[2] / ( countz - 1);
		else hsize[2] = 0;

		var i = 0;

		for(var x = 0; x < countx; ++x)
		for(var y = 0; y < county; ++y)
		for(var z = 0; z < countz; ++z)
		{
			var model = this._instances_matrix[i];
			if(!model)
				model = this._instances_matrix[i] = mat4.create();
			tmp[0] = x * offset[0] - hsize[0];
			tmp[1] = y * offset[1] - hsize[1];
			tmp[2] = z * offset[2] - hsize[2];
			mat4.translate( model, global, tmp );
			++i;
		}
	}
	else if(this.mode == Cloner.RADIAL_MODE)
	{
		var total = countx;
		this._instances_matrix.length = total;
		if( total == 0 )
			return;
		var offset = Math.PI * 2 / total;

		for(var i = 0; i < total; ++i)
		{
			var model = this._instances_matrix[i];
			if(!model)
				model = this._instances_matrix[i] = mat4.create();
			tmp[0] = Math.sin( offset * i ) * this.size[0];
			tmp[1] = 0;
			tmp[2] = Math.cos( offset * i ) * this.size[0];
			model.set( global );
			mat4.translate( model, model, tmp );
			mat4.rotateY( model,model, offset * i );
		}
	}
	else if(this.mode == Cloner.CHILDREN_MODE)
	{
		if(!this._root || !this._root._children)
		{
			this._instances_matrix.length = 0;
			return;
		}

		var total = this._root._children.length;
		this._instances_matrix.length = total;
		if( total == 0 )
			return;

		for(var i = 0; i < total; ++i)
		{
			var model = this._instances_matrix[i];
			if(!model)
				model = this._instances_matrix[i] = mat4.create();
			var childnode = this._root._children[i];
			if(!childnode)
				continue;
			if( childnode.transform )
				childnode.transform.getGlobalMatrix( model );
		}
	}
	else if( this.mode == Cloner.CUSTOM_MODE )
	{
		//nothing, should be done by a script modifying this._instances_matrix
	}
}

Cloner.prototype.setInstancesMatrices = function(a)
{
	this._instances_matrix = a;
}

/*
Cloner.prototype.onCollectInstances = function(e, instances)
{
	if(!this.enabled)
		return;

	var mesh = this.getMesh();
	if(!mesh) 
		return null;

	var node = this._root;
	if(!this._root)
		return;

	this.updateRenderInstancesArray();

	var RIs = this._RIs;
	var material = this.material || this._root.getMaterial();
	var flags = 0;

	if(!RIs)
		return;

	//resize the instances array to fit the new RIs (avoids using push)
	var start_array_pos = instances.length;
	instances.length = start_array_pos + RIs.length;

	//update parameters
	for(var i = 0, l = RIs.length; i < l; ++i)
	{
		var RI = RIs[i];

		RI.setMesh(mesh);
		RI.layers = node.layers;
		RI.setMaterial( material );
		instances[ start_array_pos + i ] = RI;
	}
}

Cloner.prototype.updateRenderInstancesArray = function()
{
	var total = 0;
	if(this.mode === Cloner.GRID_MODE)
		total = (this.count[0]|0) * (this.count[1]|0) * (this.count[2]|0);
	else if(this.mode === Cloner.RADIAL_MODE)
		total = this.count[0]|0;
	else if(this.mode === Cloner.MESH_MODE)
	{
		total = 0; //TODO
	}
	else if(this.mode === Cloner.CHILDREN_MODE)
	{
		if(this._root && this._root._children)
			total = this._root._children.length;
	}

	if(!total) 
	{
		if(this._RIs)
			this._RIs.length = 0;
		return;
	}

	if(!this._RIs || this._RIs.length != total)
	{
		//create RIs
		if(!this._RIs)
			this._RIs = new Array(total);
		else
			this._RIs.length = total;

		for(var i = 0; i < total; ++i)
			if(!this._RIs[i])
				this._RIs[i] = new LS.RenderInstance(this._root, this);
	}
}

Cloner.prototype.onUpdateInstances = function(e, dt)
{
	if(!this.enabled)
		return;

	var RIs = this._RIs;
	if(!RIs || !RIs.length)
		return;

	var global = this._root.transform.getGlobalMatrix(mat4.create());

	var countx = this._count[0]|0;
	var county = this._count[1]|0;
	var countz = this._count[2]|0;

	var node = this._root;

	//Set position according to the cloner mode
	if(this.mode == Cloner.GRID_MODE)
	{
		//compute offsets
		var hsize = vec3.scale( vec3.create(), this.size, 0.5 );
		var offset = vec3.create();
		if( countx > 1) offset[0] = this.size[0] / ( countx - 1);
		else hsize[0] = 0;
		if( county > 1) offset[1] = this.size[1] / ( county - 1);
		else hsize[1] = 0;
		if( countz > 1) offset[2] = this.size[2] / ( countz - 1);
		else hsize[2] = 0;

		var i = 0;
		var tmp = vec3.create(), zero = vec3.create();
		for(var x = 0; x < countx; ++x)
		for(var y = 0; y < county; ++y)
		for(var z = 0; z < countz; ++z)
		{
			var RI = RIs[i];
			if(!RI)
				return;
			tmp[0] = x * offset[0] - hsize[0];
			tmp[1] = y * offset[1] - hsize[1];
			tmp[2] = z * offset[2] - hsize[2];
			mat4.translate( RI.matrix, global, tmp );
			RI.setMatrix( RI.matrix ); //force normal matrix generation
			mat4.multiplyVec3( RI.center, RI.matrix, zero );
			++i;
			RI.picking_node = null;
		}
	}
	else if(this.mode == Cloner.RADIAL_MODE)
	{
		var offset = Math.PI * 2 / RIs.length;
		var tmp = vec3.create(), zero = vec3.create();
		for(var i = 0, l = RIs.length; i < l; ++i)
		{
			var RI = RIs[i];
			if(!RI)
				return;

			tmp[0] = Math.sin( offset * i ) * this.size[0];
			tmp[1] = 0;
			tmp[2] = Math.cos( offset * i ) * this.size[0];
			RI.matrix.set( global );
			mat4.translate( RI.matrix, RI.matrix, tmp );
			mat4.rotateY( RI.matrix,RI.matrix, offset * i );
			RI.setMatrix( RI.matrix ); //force normal matrix generation
			mat4.multiplyVec3( RI.center, RI.matrix, zero );
			RI.picking_node = null;
		}
	}
	else if(this.mode == Cloner.CHILDREN_MODE)
	{
		if(!this._root || !this._root._children)
			return;

		for(var i = 0, l = RIs.length; i < l; ++i)
		{
			var RI = RIs[i];
			if(!RI)
				return;
			var childnode = this._root._children[i];
			if(!childnode)
				continue;
			if( childnode.transform )
				childnode.transform.getGlobalMatrix( global );
			RI.setMatrix( global );
			RI.picking_node = childnode;
		}
	}
}
*/


LS.registerComponent(Cloner);