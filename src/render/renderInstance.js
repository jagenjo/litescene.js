/**
* RenderInstance contains info of one object to be rendered on the scene.
*
* @class RenderInstance
* @namespace LS
* @constructor
*/

//flags enums
var RI_CULL_FACE =	1;		//two sided
var RI_CW =		1 << 2; //reverse normals
var RI_DEPTH_TEST =	1 << 3; 
var RI_DEPTH_WRITE = 1 << 4; 
var RI_ALPHA_TEST =	1 << 5; 
var RI_BLEND = 1 << 6; 

var RI_CAST_SHADOWS = 1 << 8;	//render in shadowmaps
var RI_IGNORE_LIGHTS = 1 << 9;	//render without taking into account light info
var RI_RENDER_2D = 1 << 10;		//render in screen space using the position projection (similar to billboard)
var RI_IGNORE_FRUSTRUM = 1 << 11; //render even when outside of frustrum 

var RI_USE_MESH_AS_COLLIDER = 1 << 12; //use mesh to compute ray collisions


//default flags for any instance
var RI_DEFAULT_FLAGS = RI_CULL_FACE | RI_DEPTH_TEST | RI_DEPTH_WRITE | RI_CAST_SHADOWS;
var RI_2D_FLAGS = RI_RENDER_2D | RI_CULL_FACE | RI_BLEND | RI_IGNORE_LIGHTS;

function RenderInstance(node, component)
{
	this._key = ""; //not used yet
	this._uid = LS.generateUId(); //unique identifier for this RI

	//info about the mesh
	this.vertex_buffers = null;
	this.index_buffer = null;
	this.wireframe_index_buffer = null;
	this.range = new Int32Array([0,-1]); //start, offset
	this.mesh = null; //shouldnt be used, but just in case
	this.primitive = gl.TRIANGLES;

	//where does it come from
	this.node = node;
	this.component = component;
	this.priority = 10; //instances are rendered from higher to lower priority

	//rendering flags
	this.flags = RI_DEFAULT_FLAGS;

	//transformation
	this.matrix = mat4.create();
	this.normal_matrix = mat4.create();
	this.center = vec3.create();

	//for visibility computation
	this.oobb = BBox.create(); //object space bounding box
	this.aabb = BBox.create(); //axis aligned bounding box

	//info about the material
	this.material = null;

	//globals, never reseted
	this.macros = {};
	this.uniforms = {};
}


RenderInstance.prototype.generateKey = function(step, options)
{
	this._key = step + "|" + this.node._uid + "|" + this.material._uid + "|";
	return this._key;
}

RenderInstance.prototype.setMesh = function(mesh, primitive)
{
	if( !primitive && primitive != 0)
		primitive = gl.TRIANGLES;

	this.mesh = mesh;
	this.primitive = primitive;
	this.vertex_buffers = mesh.vertexBuffers;

	switch(primitive)
	{
		case gl.TRIANGLES: 
			this.index_buffer = mesh.indexBuffers["triangles"]; //works for indexed and non-indexed
			break;
		case gl.LINES: 
			if(!mesh.indexBuffers["lines"])
				mesh.computeWireframe();
			this.index_buffer = mesh.indexBuffers["lines"];
			break;
		case gl.POINTS: 
		default:
			this.index_buffer = null;
			break;
	}

	if(mesh.bounding)
	{
		BBox.setCenterHalfsize(this.oobb, mesh.bounding.aabb_center, mesh.bounding.aabb_halfsize );
		this.flags &= ~RI_IGNORE_FRUSTRUM; //test against frustrum
	}
	else
		this.flags |= RI_IGNORE_FRUSTRUM; //no frustrum, no test
}

RenderInstance.prototype.setRange = function(start, offset)
{
	this.range[0] = start;
	this.range[1] = offset;
}

/**
* takes the flags on the node and update the render instance flags
*
* @method applyNodeFlags
*/
RenderInstance.prototype.applyNodeFlags = function()
{
	var node_flags = this.node.flags;

	if(node_flags.two_sided == true) this.flags &= ~RI_CULL_FACE;
	if(node_flags.cast_shadows == false) this.flags &= ~RI_CAST_SHADOWS;
	if(node_flags.flip_normals == true) this.flags |= RI_CW;
	if(node_flags.depth_test == false) this.flags &= ~RI_DEPTH_TEST;
	if(node_flags.depth_write == false) this.flags &= ~RI_DEPTH_WRITE;
	if(node_flags.alpha_test == true) this.flags |= RI_ALPHA_TEST;
}

/**
* Enable flag in the flag bit field
*
* @method enableFlag
* @param {number} flag id
*/
RenderInstance.prototype.enableFlag = function(flag)
{
	this.flags |= flag;
}

/**
* Disable flag in the flag bit field
*
* @method enableFlag
* @param {number} flag id
*/
RenderInstance.prototype.disableFlag = function(flag)
{
	this.flags &= ~flag;
}

/**
* Tells if a flag is enabled
*
* @method enableFlag
* @param {number} flag id
* @return {boolean} flag value
*/
RenderInstance.prototype.isFlag = function(flag)
{
	return (this.flags & flag);
}

/**
* Updates the normal matrix using the matrix
*
* @method computeNormalMatrix
*/
RenderInstance.prototype.computeNormalMatrix = function()
{
	var m = mat4.invert(this.normal_matrix, this.matrix);
	if(m)
		mat4.transpose(this.normal_matrix, m);
}

/**
* Computes the instance bounding box
*
* @method updateBounding
*/
RenderInstance.prototype.updateAABB = function()
{
	BBox.transformMat4(this.aabb, this.oobb, this.matrix );
}



/*
RenderInstance.prototype.computeBounding = function()
{
	if(!this.mesh ||!this.mesh.bounding) return;

	var temp = vec3.create();
	var matrix = this.matrix;
	var bbmax = this.mesh.bounding.aabb_max;
	var bbmin = this.mesh.bounding.aabb_min;

	var center = this.oobb_center;
	var halfsize = this.oobb_halfsize;

	var aabbmax = vec3.create();
	var aabbmin = vec3.create();

	mat4.multiplyVec3( aabbmax, matrix, bbmax );
	aabbmin.set(aabbmax);
	mat4.multiplyVec3( temp, matrix, [bbmax[0],bbmax[1],bbmin[2]] );
	vec3.max( aabbmax, temp, aabbmax ); vec3.min( aabbmin, temp, aabbmin );
	mat4.multiplyVec3( temp, matrix, [bbmax[0],bbmin[1],bbmax[2]] );
	vec3.max( aabbmax, temp, aabbmax ); vec3.min( aabbmin, temp, aabbmin );
	mat4.multiplyVec3( temp, matrix, [bbmax[0],bbmin[1],bbmin[2]] );
	vec3.max( aabbmax, temp, aabbmax ); vec3.min( aabbmin, temp, aabbmin );
	mat4.multiplyVec3( temp, matrix, [bbmin[0],bbmax[1],bbmax[2]] );
	vec3.max( aabbmax, temp, aabbmax ); vec3.min( aabbmin, temp, aabbmin );
	mat4.multiplyVec3( temp, matrix, [bbmin[0],bbmax[1],bbmin[2]] );
	vec3.max( aabbmax, temp, aabbmax ); vec3.min( aabbmin, temp, aabbmin );
	mat4.multiplyVec3( temp, matrix, [bbmin[0],bbmin[1],bbmax[2]] );
	vec3.max( aabbmax, temp, aabbmax ); vec3.min( aabbmin, temp, aabbmin );
	mat4.multiplyVec3( temp, matrix, [bbmin[0],bbmin[1],bbmin[2]] );
	vec3.max( aabbmax, temp, aabbmax ); vec3.min( aabbmin, temp, aabbmin );

	this.aabb_center.set([ (aabbmax[0]+aabbmin[0])*0.5, (aabbmax[1]+aabbmin[1])*0.5, (aabbmax[2]+aabbmin[2])*0.5 ]);
	vec3.sub(this.aabb_halfsize, aabbmax, this.aabb_center);
}
*/

/**
* Calls render taking into account primitive and submesh id
*
* @method render
* @param {Shader} shader
*/
RenderInstance.prototype.render = function(shader)
{
	shader.drawBuffers( this.vertex_buffers,
	  this.index_buffer,
	  this.primitive, this.range[0], this.range[1] );


	/*
	if(this.submesh_id != null && this.submesh_id != -1 && this.mesh.info.groups && this.mesh.info.groups.length > this.submesh_id)
		shader.drawRange(this.mesh, this.primitive, this.mesh.info.groups[this.submesh_id].start, this.mesh.info.groups[this.submesh_id].length);
	else if(this.start || this.length)
		shader.drawRange(this.mesh, this.primitive, this.start || 0, this.length);
	else
		shader.draw(this.mesh, this.primitive);
	*/
}



RenderInstance.prototype.setCollisionMesh = function(mesh)
{
	this.flags |= RI_USE_MESH_AS_COLLIDER;
	this.collision_mesh = mesh;
}
