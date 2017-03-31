
//Add some functions to the classes in LiteGL to fit better in the LiteScene engine

//when working with animations sometimes you want the bones to be referenced by node name and no node uid, because otherwise you cannot reuse
//the same animation with different characters in the same scene.
GL.Mesh.prototype.convertBoneNames = function( root_node, use_uids )
{
	if(!this.bones || !this.bones.length)
		return 0;

	root_node = root_node || LS.GlobalScene;
	if( root_node.constructor == LS.SceneTree )
		root_node = root_node.root;
	if(!root_node.findNode)
	{
		console.error("convertBoneNames first parameter must be node or scene");
		return 0;
	}

	var modified = false;

	//Rename the id to a relative name
	for(var i = 0; i < this.bones.length; ++i)
	{
		var bone = this.bones[i];
		var bone_name = bone[0];

		if( !use_uids )
		{
			if( bone_name[0] != LS._uid_prefix)
				continue; //already using a name, not a uid
			var node = root_node.findNode( bone_name );
			if(!node)
			{
				console.warn("Bone node not found: " + bone_name );
				continue;
			}
			bone[0] = node.name;
			modified = true;
		}
		else
		{
			if( bone_name[0] == LS._uid_prefix)
				continue; //already using a uid
			var node = root_node.findNode( bone_name );
			if(!node)
			{
				console.warn("Bone node not found: " + bone_name );
				continue;
			}
			bone[0] = node.uid;
			modified = true;
		}
	}

	//flag it
	if(modified)
		LS.RM.resourceModified( this );
}

GL.Mesh.fromBinary = function( data_array )
{
	var o = null;
	if(data_array.constructor == ArrayBuffer )
		o = WBin.load( data_array );
	else
		o = data_array;

	var vertex_buffers = {};
	for(var i in o.vertex_buffers)
		vertex_buffers[ o.vertex_buffers[i] ] = o[ o.vertex_buffers[i] ];

	var index_buffers = {};
	for(var i in o.index_buffers)
		index_buffers[ o.index_buffers[i] ] = o[ o.index_buffers[i] ];

	var mesh = new GL.Mesh(vertex_buffers, index_buffers);
	mesh.info = o.info;
	mesh.bounding = o.bounding;
	if(o.bones)
	{
		mesh.bones = o.bones;
		//restore Float32array
		for(var i = 0; i < mesh.bones.length; ++i)
			mesh.bones[i][1] = mat4.clone(mesh.bones[i][1]);
		if(o.bind_matrix)
			mesh.bind_matrix = mat4.clone( o.bind_matrix );		
	}
	
	return mesh;
}

GL.Mesh.prototype.toBinary = function()
{
	if(!this.info)
		this.info = {};

	//clean data
	var o = {
		object_class: "Mesh",
		info: this.info,
		groups: this.groups
	};

	if(this.bones)
	{
		var bones = [];
		//convert to array
		for(var i = 0; i < this.bones.length; ++i)
			bones.push([ this.bones[i][0], mat4.toArray( this.bones[i][1] ) ]);
		o.bones = bones;
		if(this.bind_matrix)
			o.bind_matrix = this.bind_matrix;
	}

	//bounding box
	if(!this.bounding)	
		this.updateBounding();
	o.bounding = this.bounding;

	var vertex_buffers = [];
	var index_buffers = [];

	for(var i in this.vertexBuffers)
	{
		var stream = this.vertexBuffers[i];
		o[ stream.name ] = stream.data;
		vertex_buffers.push( stream.name );

		if(stream.name == "vertices")
			o.info.num_vertices = stream.data.length / 3;
	}

	for(var i in this.indexBuffers)
	{
		var stream = this.indexBuffers[i];
		o[i] = stream.data;
		index_buffers.push( i );
	}

	o.vertex_buffers = vertex_buffers;
	o.index_buffers = index_buffers;

	//create pack file
	var bin = WBin.create(o, "Mesh");

	return bin;
}
