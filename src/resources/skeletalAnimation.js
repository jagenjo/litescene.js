//standalone class for skeletal animations

function lerp(a,b,f) { return a*(1.0-f)+b*f; }

if(!Math.lerp)
	Math.lerp = lerp;

function Skeleton()
{
	this.bones = []; //array of bones
	this.global_bone_matrices = []; //internal array of mat4
	this.bones_by_name = new Map(); //map of nodenames and index in the bones array
}

Skeleton.EXTENSION = "skanim";


function Bone()
{
	this.name = "";
	this.model = mat4.create();
	this.parent = -1;
	this.layer = 0;
	this.num_children = 0;
	this.children = new Int8Array(16);
}

Bone.prototype.serialize = function()
{
	return {
		name: this.name,
		model: typedArrayToArray( this.model ),
		parent: this.parent,
		layer: this.layer,
		children: this.num_children ? typedArrayToArray( this.children.subarray(0,this.num_children) ) : null
	};
}

Bone.prototype.configure = function(o)
{
	this.name = o.name;
	this.model.set( o.model );
	this.parent = o.parent;
	this.layer = o.layer;
	this.num_children = 0;
	if(o.children)
	{
		this.children.set(o.children);
		if(o.children.constructor === Array)
			this.num_children = o.children.length;
		else
			this.num_children = o.num_children;
	}
}

Bone.prototype.copyFrom = Bone.prototype.configure;

Skeleton.Bone = Bone;

//given a bone name and matrix, it multiplies the matrix to the bone
Skeleton.prototype.applyTransformToBones = function(root, transform)
{
	var bone = this.getBone(root);
	if (!bone)
		return;
	mat4.multiply( bone.model, bone.model, transform );
};

Skeleton.prototype.getBone = function(name)
{
	return this.bones[ this.bones_by_name.get(name) ];
}

Skeleton.identity = mat4.create();

Skeleton.prototype.getBoneMatrix = function( name, local )
{
	if(local === undefined)
		local = true;
	var index = this.bones_by_name.get(name);
	if( index === undefined )
		return Skeleton.identity;
	if(local)
		return this.bones[ index ].model;
	return this.global_bone_matrices[ index ];
}

Skeleton.temp_mat4 = mat4.create();
Skeleton.temp_mat43 = Skeleton.temp_mat4.subarray(0,12);

//fills the array with the bones ready for the shader
//simplify allows to store as mat4x3 instead of mat4x4 (because the last column is always 0,0,0,1)
Skeleton.prototype.computeFinalBoneMatrices = function( bone_matrices, mesh, simplify )
{
	if(!this.bones.length || !mesh || !mesh.bones)
		return bone_matrices || [];

	this.updateGlobalMatrices();

	var size = simplify ? mesh.bones.length * 12 : mesh.bones.length * 16;

	if(!bone_matrices || bone_matrices.length != size )
		bone_matrices = new Float32Array( size );

	if(simplify) //convert to mat4x3
	{
		var m = Skeleton.temp_mat4;
		var m43 = Skeleton.temp_mat43;
		for (var i = 0; i < mesh.bones.length; ++i)
		{
			var bone_info = mesh.bones[i];
			mat4.multiply( temp_mat4, this.getBoneMatrix( bone_info[0], false ), bone_info[1] ); //use globals
			mat4.transpose( temp_mat4, temp_mat4 );
			bone_matrices.set(m43,i*12);
		}
	}
	else
		for (var i = 0; i < mesh.bones.length; ++i)
		{
			var bone_info = mesh.bones[i];
			var m = bone_matrices.subarray(i*16,i*16+16);
			mat4.multiply( m, this.getBoneMatrix( bone_info[0], false ), bone_info[1] ); //use globals
		}

	return bone_matrices;
}

//returns an array with the final global bone matrix in the order specified by the mesh, global_model is optional
Skeleton.prototype.computeFinalBoneMatricesAsArray = function( bone_matrices, mesh, global_model )
{
	if(!this.bones.length || !mesh || !mesh.bones)
		return bone_matrices || [];

	this.updateGlobalMatrices();

	bone_matrices = bone_matrices || [];
	bone_matrices.length = mesh.bones.length;

	for (var i = 0; i < mesh.bones.length; ++i)
	{
		var bone_info = mesh.bones[i];
		if(!bone_matrices[i])
			bone_matrices[i] = mat4.create();
		var m = bone_matrices[i];
		mat4.multiply( m, this.getBoneMatrix( bone_info[0], false ), bone_info[1] ); //use globals
		if(mesh.bind_matrix)
			mat4.multiply( m, m, mesh.bind_matrix );
		if(global_model)
			mat4.multiply( m, global_model, m );
	}

	return bone_matrices;
}

//updates the list of global matrices according to the local matrices
Skeleton.prototype.updateGlobalMatrices = function()
{
	var bones = this.bones;
	if(!bones.length)
		return;

	var num_bones = this.bones.length;

	//compute global matrices
	this.global_bone_matrices[0].set( bones[0].model );
	//order dependant
	for (var i = 1; i < num_bones; ++i)
	{
		var bone = bones[i];
		mat4.multiply( this.global_bone_matrices[i], this.global_bone_matrices[ bone.parent ], bone.model );
	}
}

//assigns a layer to a node and all its children
Skeleton.prototype.assignLayer = function(bone, layer)
{
	//TODO
}

//for rendering the skeleton
Skeleton.prototype.getVertices = function()
{
	if(!this.bones.length)
		return null;
	var size = (this.bones.length - 1) * 3 * 2;
	if(!this._vertices || this._vertices.length != size)
		this._vertices = new Float32Array( size );
	var vertices = this._vertices;
	for (var i = 0; i < this.bones.length - 1; ++i)
	{
		var bone = this.bones[i+1];
		var parent_global_matrix = this.global_bone_matrices[ bone.parent ];
		var global_matrix = this.global_bone_matrices[i+1];
		var v1 = vertices.subarray(i*6,i*6+3);
		var v2 = vertices.subarray(i*6+3,i*6+6);
		mat4.getTranslation( v1, global_matrix );
		mat4.getTranslation( v2, parent_global_matrix );
	}
	return vertices;
}

Skeleton.prototype.resizeBones = function(num)
{
	if(this.bones.length == num)
		return;
	if(this.bones.length > num)
	{
		this.bones.length = num;
		this.global_bone_matrices.length = num;
		return;
	}

	var old_num = this.bones.length;
	this.bones.length = num;
	for(var i = old_num; i < num; ++i)
	{
		this.bones[i] = new Bone();
		this.global_bone_matrices[i] = mat4.create();
	}
}

Skeleton.prototype.copyFrom = function( skeleton )
{
	this.resizeBones( skeleton.bones.length );
	for(var i = 0; i < skeleton.bones.length; ++i)
	{
		this.bones[i].copyFrom( skeleton.bones[i] );
		this.global_bone_matrices[i].set( skeleton.global_bone_matrices[i] );
	}
	this.bones_by_name = new Map( skeleton.bones_by_name );
}

Skeleton.prototype.serialize = function()
{
	var o = {
		bones: [],
		bone_names: {}
	};

	for(var i = 0; i < this.bones.length; ++i)
		o.bones.push(this.bones[i].serialize());
	return o;
}

Skeleton.prototype.configure = function(o)
{
	this.resizeBones( o.bones.length );
	if(o.bones_by_name)
		this.bones_by_name = new Map( o.bones_by_name );
	else
		this.bones_by_name.clear();
	for(var i = 0; i < o.bones.length; ++i)
	{
		this.bones[i].copyFrom( o.bones[i] );
		if(o.global_bone_matrices) //is an skeleton
			this.global_bone_matrices[i].set( o.global_bone_matrices[i] );
		else //is an object
			this.bones_by_name[this.bones[i].name] = i;
	}
}

var temp_axis = vec3.create();

//blends between two skeletons
Skeleton.blend = function(a, b, w, result, layer, skip_normalize )
{
	if(a.bones.length != b.bones.length)
	{
		console.error("skeleton must contain the same number of bones");
		return;
	}

	w = Math.clamp(w, 0.0, 1.0);//safety

	if (layer == 0xFF)
	{
		if (w == 0.0)
		{
			if(result == a) //nothing to do
				return;
			result.copyFrom(a); //copy A in Result
			return;
		}
		if (w == 1.0) //copy B in result
		{
			result.copyFrom(b);
			return;
		}
	}

	if (result != a) //copy bone names
	{
		result.bones.length = a.bones.length;
		for (var i = 0; i < result.bones.length; ++i)
		{
			var b = result.bones[i];
			if(!b)
				b = new Skeleton.Bone();
			b.copyFrom(a.bones[i]);
		}
		result.bones_by_name = new Map(a.bones_by_name); //TODO: IMPROVE!
	}

	//blend bones locally
	for (var i = 0; i < result.bones.length; ++i)
	{
		var bone = result.bones[i];
		var boneA = a.bones[i];
		var boneB = b.bones[i];
		//if ( layer != 0xFF && !(bone.layer & layer) ) //not in the same layer
		//	continue;
		for (var j = 0; j < 16; ++j)
			bone.model[j] = Math.lerp( boneA.model[j], boneB.model[j], w);

		if(!skip_normalize)
		{
			var m = bone.model;
			//not sure which one is the right one, row major or column major
			//vec3.normalize(m.subarray(0,3),	m.subarray(0,3) );
			//vec3.normalize(m.subarray(4,7),	m.subarray(4,7) );
			//vec3.normalize(m.subarray(8,11), m.subarray(8,11) );
			//*
			for(var j = 0; j < 3; ++j)
			{
				temp_axis[0] = m[0+j]; temp_axis[1] = m[4+j]; temp_axis[2] = m[8+j];
				vec3.normalize(temp_axis,temp_axis);
				m[0+j] = temp_axis[0]; m[4+j] = temp_axis[1]; m[8+j] = temp_axis[2];
			}
			//*/
		}
	}
}

Skeleton.shader_code = '\n\
	attribute vec4 a_bone_indices;\n\
	attribute vec4 a_weights;\n\
	uniform mat4 u_bones[64];\n\
	void computeSkinning(inout vec3 vertex, inout vec3 normal)\n\
	{\n\
		vec4 v = vec4(vertex,1.0);\n\
		vertex = (u_bones[int(a_bone_indices.x)] * a_weights.x * v + \n\
				u_bones[int(a_bone_indices.y)] * a_weights.y * v + \n\
				u_bones[int(a_bone_indices.z)] * a_weights.z * v + \n\
				u_bones[int(a_bone_indices.w)] * a_weights.w * v).xyz;\n\
		vec4 N = vec4(normal,0.0);\n\
		normal =	(u_bones[int(a_bone_indices.x)] * a_weights.x * N + \n\
				u_bones[int(a_bone_indices.y)] * a_weights.y * N + \n\
				u_bones[int(a_bone_indices.z)] * a_weights.z * N + \n\
				u_bones[int(a_bone_indices.w)] * a_weights.w * N).xyz;\n\
		normal = normalize(normal);\n\
	}\n\
';

//*******************************************************

function SkeletalAnimation()
{
	this.skeleton = new Skeleton();

	this.duration = 0;
	this.samples_per_second = 0;
	this.num_animated_bones = 0;
	this.num_keyframes = 0;
	this.bones_map = new Uint8Array(64); //maps from keyframe data index to bone

	this.keyframes = null; //mat4 array
}

//change the skeleton to the given pose according to time
SkeletalAnimation.prototype.assignTime = function(time, loop, interpolate, layers )
{
	if(!this.duration)
		return;

	if (loop || loop === undefined)
	{
		time = time % this.duration;
		if (time < 0)
			time = this.duration + time;
	}
	else
		time = Math.clamp( time, 0.0, this.duration - (1.0/this.samples_per_second) );

	if(interpolate === undefined)
		interpolate = true;

	var v = this.samples_per_second * time;
	var index = Math.floor(v);
	var index2 = (index + 1) % this.num_keyframes;
	index = index % this.num_keyframes;
	var f = v - Math.floor(v);
	var num_animated_bones = this.num_animated_bones;

	var offset = 16 * num_animated_bones;
	var k = index * offset;
	var k2 = index2 * offset;
	var skeleton = this.skeleton;
	var keyframes = this.keyframes;
	var bones_map = this.bones_map;

	//compute local bones
	for (var i = 0; i < num_animated_bones; ++i)
	{
		var bone_index = bones_map[i];
		var bone = skeleton.bones[bone_index];
		var offset = i*16;
		//if (layers != 0xFF && !(bone.layer & layers))
		//	continue;
		if(!interpolate)
			bone.model.set( keyframes.subarray( k + offset, k + offset + 16) );
		else
			for (var j = 0; j < 16; ++j)
			{
				//lerp matrix
				bone.model[j] = lerp( keyframes[ k + offset + j ], keyframes[ k2 + offset + j ], f );
			}
	}
}

SkeletalAnimation.prototype.resize = function( num_keyframes, num_animated_bones )
{
	this.num_keyframes = num_keyframes;
	this.num_animated_bones = num_animated_bones;
	this.keyframes = new Float32Array( num_keyframes * num_animated_bones * 16);
}

SkeletalAnimation.prototype.fromData = function(txt)
{
	var lines = txt.split("\n");
	var header = lines[0].split(",");
	this.duration = Number(header[0]);
	this.samples_per_second = Number(header[1]);
	this.num_keyframes = Number(header[2]);
	
	this.skeleton.resizeBones( Number(header[3]) );
	var current_keyframe = 0;
	for(var i = 1; i < lines.length; ++i)
	{
		var line = lines[i];
		var type = line[0];
		var t = line.substr(1).split(",");
		if( type == 'B')
		{
			var index = Number(t[0]);
			var bone = this.skeleton.bones[index];
			bone.name = t[1];
			bone.parent = Number(t[2]);
			for(var j = 0; j < 16; ++j)
				bone.model[j] = Number(t[3+j]);
			if (bone.parent != -1)
			{
				var parent_bone = this.skeleton.bones[ bone.parent ];
				if(parent_bone.num_children >= 16)
					console.warn("too many child bones, max is 16");
				else
					parent_bone.children[ parent_bone.num_children++ ] = index;
			}
			this.skeleton.bones_by_name.set(bone.name,index);
		}
		else if( type == '@')
		{
			this.num_animated_bones = Number(t[0]);
			for(var j = 0; j < this.num_animated_bones; ++j)
				this.bones_map[j] = Number(t[j+1]);
			this.resize( this.num_keyframes, this.num_animated_bones );
		}
		else if( type == 'K')
		{
			var pos = current_keyframe * this.num_animated_bones * 16;
			for(var j = 0, l = this.num_animated_bones * 16; j < l; ++j)
				this.keyframes[ pos + j ] = Number( t[j+1] );
			current_keyframe++;
		}
		else 
			break;
	}

	this.assignTime(0,false,false);
}

SkeletalAnimation.prototype.toData = function()
{
	var str = "";
	return str;
}

//so it can be used from LiteScene or Rendeer
if(typeof(LS) != "undefined")
{
	LS.Skeleton = Skeleton;
	LS.Classes["SkeletalAnimation"] = LS.SkeletalAnimation = SkeletalAnimation;
	LS.registerResourceClass( SkeletalAnimation );
}





