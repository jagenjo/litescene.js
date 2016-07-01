
/**
* Renders one mesh, it allows to configure the rendering primitive, the submesh (range of mesh) and a level of detail mesh
* @class MeshRenderer
* @namespace LS.Components
* @constructor
* @param {String} object to configure from
*/
function MeshRenderer(o)
{
	this.enabled = true;

	/**
	* The name of the mesh to render
	* @property mesh {string}
	* @default null;
	*/
	this.mesh = null;
	/**
	* The name of the mesh to render in case the mesh is far away, this mesh is also used for collision testing if using raycast to RenderInstances
	* @property lod_mesh {string}
	* @default null;
	*/
	this.lod_mesh = null;
	/**
	* The id of the submesh group to render, if the id is -1 then all the mesh is rendered.
	* @property submesh_id {number}
	* @default -1;
	*/
	this.submesh_id = -1;
	this.material = null;
	/**
	* The GL primitive to use when rendering this mesh (gl.POINTS, gl.TRIANGLES, etc), -1 is default, it also supports the option 10 which means Wireframe
	* @property primitive {number}
	* @default -1;
	*/
	this._primitive = -1;
	/**
	* If faces are two sided
	* @property two_sided {boolean}
	* @default -1;
	*/
	this.two_sided = false;
	/**
	* When rendering points the point size, if positive is in world space, if negative is in screen space
	* @property point_size {number}
	* @default -1;
	*/
	this.point_size = 0.1;
	/**
	* When rendering points tells if you want to use for every point the texture coordinates of the vertex or the point texture coordinates
	* @property textured_points {boolean}
	* @default false;
	*/
	this.textured_points = false;

	this.material = null;

	this._must_update_static = true; //used in static meshes
	this._transform_version = -1;

	//used to render with several materials
	this.use_submaterials = false;
	this.submaterials = [];

	if(o)
		this.configure(o);

	this._RI = new LS.RenderInstance( null, this );

	if(!MeshRenderer._identity) //used to avoir garbage
		MeshRenderer._identity = mat4.create();
}

Object.defineProperty( MeshRenderer.prototype, 'primitive', {
	get: function() { return this._primitive; },
	set: function(v) { 
		v = (v === undefined || v === null ? -1 : v|0);
		if( v < -1 || v > 10 )
			return;
		this._primitive = v;
	},
	enumerable: true
});

MeshRenderer.icon = "mini-icon-teapot.png";

//vars
MeshRenderer["@mesh"] = { type: "mesh" };
MeshRenderer["@lod_mesh"] = { type: "mesh" };
MeshRenderer["@material"] = { type: "material" };
MeshRenderer["@primitive"] = { type:"enum", values: {"Default":-1, "Points": 0, "Lines":1, "LineLoop":2, "LineStrip":3, "Triangles":4, "TriangleStrip":5, "TriangleFan":6, "Wireframe":10 }};
MeshRenderer["@submesh_id"] = { type:"enum", values: function() {
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

MeshRenderer["@use_submaterials"] = { type: LS.TYPES.BOOLEAN, widget: null }; //avoid widget
MeshRenderer["@submaterials"] = { widget: null }; //avoid 

//we bind to onAddedToNode because the event is triggered per node so we know which RIs belong to which node
MeshRenderer.prototype.onAddedToNode = function(node)
{
	if(!node.meshrenderer)
		node.meshrenderer = this;
	this._RI.node = node;
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
	if(o.enabled !== undefined)
		this.enabled = o.enabled;
	this.mesh = o.mesh;
	this.lod_mesh = o.lod_mesh;
	this.submesh_id = o.submesh_id;
	this.primitive = o.primitive; //gl.TRIANGLES
	this.two_sided = !!o.two_sided;
	this.material = o.material;
	this.use_submaterials = !!o.use_submaterials;
	if(o.submaterials)
		this.submaterials = o.submaterials;
	if(o.point_size !== undefined) //legacy
		this.point_size = o.point_size;
	this.textured_points = !!o.textured_points;
	if(o.material)
		this.material = typeof(o.material) == "string" ? o.material : new LS.Material(o.material);
}

/**
* Serialize the object 
* @method serialize
* @return {Object} object with the serialized info
*/
MeshRenderer.prototype.serialize = function()
{
	var o = { 
		enabled: this.enabled,
		mesh: this.mesh,
		lod_mesh: this.lod_mesh
	};

	if(this.material)
		o.material = typeof(this.material) == "string" ? this.material : this.material.serialize();

	if(this.primitive != -1)
		o.primitive = this.primitive;
	if(this.submesh_id)
		o.submesh_id = this.submesh_id;
	if(this.two_sided)
		o.two_sided = this.two_sided;
	if(this.use_submaterials)
		o.use_submaterials = this.use_submaterials;
	o.submaterials = this.submaterials;
	o.point_size = this.point_size;
	o.textured_points = this.textured_points;
	o.material = this.material;
	return o;
}

MeshRenderer.prototype.getMesh = function() {
	if(!this.mesh)
		return null;

	if( this.mesh.constructor === String )
		return LS.ResourcesManager.meshes[ this.mesh ];
	return this.mesh;
}

MeshRenderer.prototype.getLODMesh = function() {
	if(!this.lod_mesh)
		return null;

	if( this.lod_mesh.constructor === String )
		return LS.ResourcesManager.meshes[ this.lod_mesh ];

	return null;
}

MeshRenderer.prototype.getAnyMesh = function() {
	return (this.getMesh() || this.getLODMesh());
}

MeshRenderer.prototype.getResources = function(res)
{
	if(typeof(this.mesh) == "string")
		res[this.mesh] = GL.Mesh;
	if(typeof(this.lod_mesh) == "string")
		res[this.lod_mesh] = GL.Mesh;
	if(typeof(this.material) == "string")
		res[this.material] = LS.Material;

	if(this.use_submaterials)
	{
		for(var i  = 0; i < this.submaterials.length; ++i)
			if(this.submaterials[i])
				res[this.submaterials[i]] = LS.Material;
	}
	return res;
}

MeshRenderer.prototype.onResourceRenamed = function (old_name, new_name, resource)
{
	if(this.mesh == old_name)
		this.mesh = new_name;
	if(this.lod_mesh == old_name)
		this.lod_mesh = new_name;
	if(this.morph_targets)
		for(var i in this.morph_targets)
			if( this.morph_targets[i].mesh == old_name )
				this.morph_targets[i].mesh = new_name;
}

//MeshRenderer.prototype.getRenderInstance = function(options)
MeshRenderer.prototype.onCollectInstances = function(e, instances)
{
	if(!this.enabled)
		return;

	var mesh = this.getAnyMesh();
	if(!mesh)
		return null;

	var node = this._root;
	if(!this._root)
		return;

	if(this.use_submaterials)
	{
		this.onCollectInstancesSubmaterials(instances);
		return;
	}

	var RI = this._RI;
	var is_static = this._root.flags && this._root.flags.is_static;
	var transform = this._root.transform;

	//optimize
	if( is_static && LS.allow_static && !this._must_update_static && (!transform || (transform && this._transform_version == transform._version)) )
		return instances.push( RI );



	//matrix: do not need to update, already done
	RI.setMatrix( this._root.transform._global_matrix );
	//this._root.transform.getGlobalMatrix(RI.matrix);
	mat4.multiplyVec3( RI.center, RI.matrix, vec3.create() );

	//flags
	RI.flags = RI_DEFAULT_FLAGS | RI_RAYCAST_ENABLED;
	RI.applyNodeFlags();

	if(this.two_sided)
		RI.flags &= ~RI_CULL_FACE;

	//material (after flags because it modifies the flags)
	var material = null;
	if(this.material)
		material = LS.ResourcesManager.getResource( this.material );
	else
		material = this._root.getMaterial();
	RI.setMaterial( material );

	//buffers from mesh and bounding
	RI.setMesh( mesh, this.primitive );

	if(this.submesh_id != -1 && this.submesh_id != null && mesh.info && mesh.info.groups)
	{
		var group = mesh.info.groups[this.submesh_id];
		if(group)
			RI.setRange( group.start, group.length );
	}
	else
		RI.setRange(0,-1);

	//used for raycasting
	if(this.lod_mesh)
	{
		if( this.lod_mesh.constructor === String )
			RI.collision_mesh = LS.ResourcesManager.resources[ this.lod_mesh ];
		else
			RI.collision_mesh = this.lod_mesh;
		RI.setLODMesh( RI.collision_mesh );
	}
	else
		RI.collision_mesh = mesh;

	if(this.primitive == gl.POINTS)
	{
		RI.uniforms.u_point_size = this.point_size;
		RI.query.macros["USE_POINTS"] = "";
		if(this.textured_points)
			RI.query.macros["USE_TEXTURED_POINTS"] = "";
	}
	
	if(!this.textured_points && RI.query.macros["USE_TEXTURED_POINTS"])
		delete RI.query.macros["USE_TEXTURED_POINTS"];



	//mark it as ready once no more changes should be applied
	if( is_static && LS.allow_static && !this.isLoading() )
	{
		this._must_update_static = false;
		this._transform_version = transform ? transform._version : 0;
	}

	instances.push( RI );
}

MeshRenderer.prototype.onCollectInstancesSubmaterials = function(instances)
{
	if(!this._RIs)
		this._RIs = [];

	var mesh = this.getMesh();
	if(!mesh)
		return;

	var groups = mesh.info.groups;
	if(!groups)
		return;

	var global = this._root.transform._global_matrix;
	var center = vec3.create();
	mat4.multiplyVec3( center, global, LS.ZEROS );
	var first_RI = null;

	for(var i = 0; i < this.submaterials.length; ++i)
	{
		var submaterial_name = this.submaterials[i];
		if(!submaterial_name)
			continue;
		var group = groups[i];
		if(!group)
			continue;
		var material = LS.ResourcesManager.getResource( submaterial_name );
		if(!material)
			continue;

		var RI = this._RIs[i];
		if(!RI)
			RI = this._RIs[i] = new LS.RenderInstance(this._root,this);

		if(!first_RI)
			RI.setMatrix( this._root.transform._global_matrix );
		else
			RI.setMatrix( first_RI.matrix, first_RI.normal_matrix );
		RI.center.set(center);

		//flags
		RI.flags = RI_DEFAULT_FLAGS | RI_RAYCAST_ENABLED;
		RI.applyNodeFlags();
		if(this.two_sided)
			RI.flags &= ~RI_CULL_FACE;
		RI.setMaterial( material );
		RI.setMesh( mesh, this.primitive );
		RI.setRange( group.start, group.length );
		instances.push(RI);

		if(!first_RI)
			first_RI = RI;
	}
}

//test if any of the assets is being loaded
MeshRenderer.prototype.isLoading = function()
{
	if( this.mesh && LS.ResourcesManager.isLoading( this.mesh ))
		return true;
	if( this.lod_mesh && LS.ResourcesManager.isLoading( this.lod_mesh ))
		return true;
	if( this.material && LS.ResourcesManager.isLoading( this.material ))
		return true;
	if(this._root && this._root.material && this._root.material.constructor === String && LS.ResourcesManager.isLoading( this._root.material ))
		return true;
	return false;
}


LS.registerComponent( MeshRenderer );
LS.MeshRenderer = MeshRenderer;