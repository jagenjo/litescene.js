
function SkinnedMeshRenderer(o)
{
	this.enabled = true;
	this.cpu_skinning = false;
	this.mesh = null;
	this.lod_mesh = null;
	this.submesh_id = -1;
	this.material = null;
	this.primitive = null;
	this.two_sided = false;
	//this.factor = 1;

	if(o)
		this.configure(o);

	if(!MeshRenderer._identity) //used to avoir garbage
		MeshRenderer._identity = mat4.create();
}

SkinnedMeshRenderer.icon = "mini-icon-teapot.png";

//vars
SkinnedMeshRenderer["@mesh"] = { widget: "mesh" };
SkinnedMeshRenderer["@lod_mesh"] = { widget: "mesh" };
SkinnedMeshRenderer["@primitive"] = {widget:"combo", values: {"Default":null, "Points": 0, "Lines":1, "Triangles":4 }};
SkinnedMeshRenderer["@submesh_id"] = {widget:"combo", values: function() {
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

SkinnedMeshRenderer.prototype.onAddedToNode = function(node)
{
	if(!node.meshrenderer)
		node.meshrenderer = this;
	LEvent.bind(node, "collectRenderInstances", this.onCollectInstances, this);
}

SkinnedMeshRenderer.prototype.onRemovedFromNode = function(node)
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
SkinnedMeshRenderer.prototype.configure = function(o)
{
	this.mesh = o.mesh;
	this.lod_mesh = o.lod_mesh;
	this.submesh_id = o.submesh_id;
	this.primitive = o.primitive; //gl.TRIANGLES
	this.two_sided = !!o.two_sided;
	if(o.material)
		this.material = typeof(o.material) == "string" ? o.material : new Material(o.material);
}

/**
* Serialize the object 
* @method serialize
* @return {Object} object with the serialized info
*/
SkinnedMeshRenderer.prototype.serialize = function()
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

SkinnedMeshRenderer.prototype.getMesh = function() {
	if(typeof(this.mesh) === "string")
		return ResourcesManager.meshes[this.mesh];
	return this.mesh;
}

SkinnedMeshRenderer.prototype.getLODMesh = function() {
	if(typeof(this.lod_mesh) === "string")
		return ResourcesManager.meshes[this.lod_mesh];
	return this.low_mesh;
}

SkinnedMeshRenderer.prototype.getResources = function(res)
{
	if(typeof(this.mesh) == "string")
		res[this.mesh] = Mesh;
	if(typeof(this.lod_mesh) == "string")
		res[this.lod_mesh] = Mesh;
	return res;
}

SkinnedMeshRenderer.mat_identity = mat4.create();

SkinnedMeshRenderer.prototype.getBoneMatrix = function(name)
{
	var node = Scene.getNode(name);
	if(!node)
		return SkinnedMeshRenderer.mat_identity;
	node._is_bone = true;
	return node.transform.getGlobalMatrixRef();
}

SkinnedMeshRenderer.prototype.getBones = function(ref_mesh)
{
	//bone matrices
	var bones = this._last_bones;

	//reuse bone matrices
	if(!this._last_bones || this._last_bones.length != ref_mesh.bones.length )
	{
		bones = this._last_bones = [];
		for(var i = 0; i < ref_mesh.bones.length; ++i)
			bones[i] = mat4.create();
	}

	for(var i = 0; i < ref_mesh.bones.length; ++i)
	{
		var m = bones[i]; //mat4.create();
		var mat = this.getBoneMatrix( ref_mesh.bones[i][0] ); //get the current matrix from the bone Node transform

		var inv = ref_mesh.bones[i][1];
		mat4.multiply( m, mat, inv );
		if(ref_mesh.bind_matrix)
			mat4.multiply( m, m, ref_mesh.bind_matrix);

		//bones[i].push( m ); //multiply by the inv bindpose matrix
	}

	return bones;
}

SkinnedMeshRenderer.zero_matrix = new Float32Array(16);

SkinnedMeshRenderer.prototype.applySkin = function(ref_mesh, skin_mesh)
{
	var original_vertices = ref_mesh.getBuffer("vertices").data;

	var weights = ref_mesh.getBuffer("weights").data;
	var bone_indices = ref_mesh.getBuffer("bone_indices").data;

	var vertices_buffer = skin_mesh.getBuffer("vertices");
	var vertices = vertices_buffer.data;

	//bone matrices
	var bones = this.getBones( ref_mesh );
	if(bones.length == 0) //no bones found
		return null;

	//var factor = this.factor; //for debug

	//apply skinning per vertex
	var temp = vec3.create();
	var ov_temp = vec3.create();
	var temp_matrix = mat4.create();
	for(var i = 0, l = vertices.length / 3; i < l; ++i)
	{
		var ov = original_vertices.subarray(i*3, i*3+3);
		ov_temp.set(ov);
		var b = bone_indices.subarray(i*4, i*4+4);
		var w = weights.subarray(i*4, i*4+4);
		var v = vertices.subarray(i*3, i*3+3);

		var bmat = [ bones[ b[0] ], bones[ b[1] ], bones[ b[2] ], bones[ b[3] ] ];

		temp_matrix.set( SkinnedMeshRenderer.zero_matrix );
		mat4.scaleAndAdd( temp_matrix, temp_matrix, bmat[0], w[0] );
		if(w[1] > 0.0) mat4.scaleAndAdd( temp_matrix, temp_matrix, bmat[1], w[1] );
		if(w[2] > 0.0) mat4.scaleAndAdd( temp_matrix, temp_matrix, bmat[2], w[2] );
		if(w[3] > 0.0) mat4.scaleAndAdd( temp_matrix, temp_matrix, bmat[3], w[3] );

		mat4.multiplyVec3(v, temp_matrix, ov_temp);
		//we could also multiply the normal but this is already superslow...

		/* apply weights
		v[0] = v[1] = v[2] = 0.0; //reset
		mat4.multiplyVec3(v, bmat[0], ov_temp);
		vec3.scale(v,v,w[0]);
		for(var j = 1; j < 4; ++j)
			if(w[j] > 0.0)
			{
				mat4.multiplyVec3(temp, bmat[j], ov_temp);
				vec3.scaleAndAdd(v, v, temp, w[j]);
			}
		//*/

		//if(factor != 1) vec3.lerp( v, ov, v, factor);
	}

	//upload
	vertices_buffer.compile(gl.STREAM_DRAW);
}


//MeshRenderer.prototype.getRenderInstance = function(options)
SkinnedMeshRenderer.prototype.onCollectInstances = function(e, instances, options)
{
	var mesh = this.getMesh();
	if(!mesh) return null;

	var node = this._root;
	if(!this._root) return;

	var RI = this._render_instance;
	if(!RI)
		this._render_instance = RI = new RenderInstance(this._root, this);

	//this mesh doesnt have skinning info
	if(!mesh.getBuffer("vertices") || !mesh.getBuffer("bone_indices"))
		return;

	if(!this.enabled)
	{
		RI.setMesh(mesh, this.primitive);
		delete RI.macros["USE_SKINNING"]; //just in case
	}
	else if(this.cpu_skinning)
	{
		if(!this._skinned_mesh || this._skinned_mesh._reference != mesh)
		{
			this._skinned_mesh = new GL.Mesh();
			this._skinned_mesh._reference = mesh;
			var vertex_buffer = mesh.getBuffer("vertices");

			//clone 
			for (var i in mesh.vertexBuffers)
				this._skinned_mesh.vertexBuffers[i] = mesh.vertexBuffers[i];
			for (var i in mesh.indexBuffers)
				this._skinned_mesh.indexBuffers[i] = mesh.indexBuffers[i];

			//new ones clonning old ones
			this._skinned_mesh.addVertexBuffer("vertices","a_vertex", 3, new Float32Array( vertex_buffer.data ), gl.STREAM_DRAW );
		}


		//apply cpu skinning
		this.applySkin(mesh, this._skinned_mesh);
		RI.setMesh(this._skinned_mesh, this.primitive);
		delete RI.macros["USE_SKINNING"]; //just in case
	}
	else
	{
		RI.setMesh(mesh, this.primitive);

		//add skinning
		RI.macros["USE_SKINNING"] = "";
		var bones = this.getBones(mesh);
		var size = bones.length * 16;
		var u_bones = this._u_bones;
		if(!u_bones || u_bones.length != size)
			this._u_bones = u_bones = new Float32Array( size );
		for(var i = 0; i < bones.length; i++)
		{
			mat4.transpose( bones[i], bones[i] );
			u_bones.set( bones[i], i * 16 );
		}
		RI.uniforms["u_bones"] = u_bones;
	}

	//do not need to update
	//RI.matrix.set( this._root.transform._global_matrix );
	this._root.transform.getGlobalMatrix(RI.matrix);
	mat4.multiplyVec3( RI.center, RI.matrix, vec3.create() );

	if(this.submesh_id != -1 && this.submesh_id != null)
		RI.submesh_id = this.submesh_id;
	RI.material = this.material || this._root.getMaterial();

	RI.flags = RI_DEFAULT_FLAGS;
	RI.applyNodeFlags();
	if(this.two_sided)
		RI.flags &= ~RI_CULL_FACE;

	if(this.enabled)
		RI.flags |= RI_IGNORE_FRUSTUM; //no frustum test

	instances.push(RI);
	//return RI;
}

LS.registerComponent(SkinnedMeshRenderer);
LS.SkinnedMeshRenderer = SkinnedMeshRenderer;