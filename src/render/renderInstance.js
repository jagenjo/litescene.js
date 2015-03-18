/**
* RenderInstance contains info of one object to be rendered on the scene.
*
* @class RenderInstance
* @namespace LS
* @constructor
*/

//Flags to control rendering states
//0-7: render state flags
var RI_CULL_FACE =			1;		//for two sided
var RI_CW =					1 << 1; //reverse normals
var RI_DEPTH_TEST =			1 << 2; //use depth test
var RI_DEPTH_WRITE = 		1 << 3; //write in the depth buffer
var RI_ALPHA_TEST =			1 << 4; //do alpha test
var RI_BLEND = 				1 << 5; //use blend function

//8-16: rendering pipeline flags
var RI_CAST_SHADOWS = 		1 << 8;	//render in shadowmaps
var RI_RECEIVE_SHADOWS =	1 << 9;	//receive shadowmaps
var RI_IGNORE_LIGHTS = 		1 << 10;//render without taking into account light info
var RI_IGNORE_FRUSTUM = 	1 << 11;//render even when outside of frustum //CHANGE TO VALID_BOUNDINGBOX
var RI_RENDER_2D = 			1 << 12;//render in screen space using the position projection (similar to billboard)
var RI_IGNORE_VIEWPROJECTION = 1 << 13; //do not multiply by viewprojection, use model as mvp
var RI_IGNORE_CLIPPING_PLANE = 1 << 14; //ignore the plane clipping (in reflections)

//16-24: instance properties
var RI_RAYCAST_ENABLED = 1 << 16; //if it could be raycasted


//default flags for any instance
var RI_DEFAULT_FLAGS = RI_CULL_FACE | RI_DEPTH_TEST | RI_DEPTH_WRITE | RI_CAST_SHADOWS | RI_RECEIVE_SHADOWS;
var RI_2D_FLAGS = RI_RENDER_2D | RI_CULL_FACE | RI_BLEND | RI_IGNORE_LIGHTS | RI_IGNORE_FRUSTUM;

function RenderInstance(node, component)
{
	this._key = ""; //not used yet
	this._uid = LS.generateUId(); //unique identifier for this RI

	//info about the mesh
	this.vertex_buffers = null;
	this.index_buffer = null;
	this.wireframe_index_buffer = null;
	this.range = new Int32Array([0,-1]); //start, offset
	this.primitive = gl.TRIANGLES;

	this.mesh = null; //shouldnt be used (buffers are added manually), but just in case
	this.collision_mesh = null; //in case of raycast

	//used in case the object has a secondary mesh
	this.lod_mesh = null;
	this.lod_vertex_buffers = null;
	this.lod_index_buffer = null;

	//where does it come from
	this.node = node;
	this.component = component;
	this.priority = 10; //instances are rendered from higher to lower priority

	//rendering flags
	this.flags = RI_DEFAULT_FLAGS;
	this.blend_func = BlendFunctions["normal"]; //Blend.funcs["add"], ...

	//transformation
	this.matrix = mat4.create();
	this.normal_matrix = mat4.create();
	this.center = vec3.create();

	//for visibility computation
	this.oobb = BBox.create(); //object space bounding box
	this.aabb = BBox.create(); //axis aligned bounding box

	//info about the material
	this.material = null;

	//for extra data for the shader
	this.macros = {};
	this.uniforms = {};
	this.samplers = {};

	//for internal use
	this._dist = 0; //computed during rendering, tells the distance to the current camera
	this._final_macros = {};
	this._final_uniforms = {};
	this._final_samplers = {};
}


RenderInstance.prototype.generateKey = function(step, options)
{
	this._key = step + "|" + this.node._uid + "|" + this.material._uid + "|";
	return this._key;
}

//set the material and apply material flags to render instance
RenderInstance.prototype.setMatrix = function(matrix)
{
	this.matrix.set( matrix );
}


//set the material and apply material flags to render instance
RenderInstance.prototype.setMaterial = function(material)
{
	this.material = material;
	if(material)
		material.applyToRenderInstance(this);
}

//sets the buffers to render, the primitive, and the bounding
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
			/*
			if(!mesh.indexBuffers["lines"])
				mesh.computeWireframe();
			*/
			this.index_buffer = mesh.indexBuffers["lines"];
			break;
		case 10:  //wireframe
			this.primitive = gl.LINES;
			if(!mesh.indexBuffers["wireframe"])
				mesh.computeWireframe();
			this.index_buffer = mesh.indexBuffers["wireframe"];
			break;

		case gl.POINTS: 
		default:
			this.index_buffer = null;
			break;
	}

	if(mesh.bounding)
	{
		this.oobb.set( mesh.bounding ); //copy
		this.flags &= ~RI_IGNORE_FRUSTUM; //test against frustum
	}
	else
		this.flags |= RI_IGNORE_FRUSTUM; //no frustum, no test
}

//assigns a secondary mesh in case the object is too small on the screen
RenderInstance.prototype.setLODMesh = function(lod_mesh)
{
	if(!lod_mesh)
	{
		this.lod_mesh = null;
		this.lod_vertex_buffers = null;
		this.lod_index_buffer = null;
		return;
	}

	this.lod_mesh = lod_mesh;
	this.lod_vertex_buffers = lod_mesh.vertexBuffers;

	switch(this.primitive)
	{
		case gl.TRIANGLES: 
			this.lod_index_buffer = lod_mesh.indexBuffers["triangles"]; //works for indexed and non-indexed
			break;
		case gl.LINES: 
			/*
			if(!mesh.indexBuffers["lines"])
				mesh.computeWireframe();
			*/
			this.lod_index_buffer = lod_mesh.indexBuffers["lines"];
			break;
		case 10:  //wireframe
			if(!lod_mesh.indexBuffers["wireframe"])
				lod_mesh.computeWireframe();
			this.lod_index_buffer = lod_mesh.indexBuffers["wireframe"];
			break;
		case gl.POINTS: 
		default:
			this.lod_index_buffer = null;
			break;
	}
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
	else this.flags |= RI_CULL_FACE;

	if(node_flags.flip_normals == true) this.flags |= RI_CW;
	else this.flags &= ~RI_CW;

	if(node_flags.depth_test == false) this.flags &= ~RI_DEPTH_TEST;
	else this.flags |= RI_DEPTH_TEST;

	if(node_flags.depth_write == false) this.flags &= ~RI_DEPTH_WRITE;
	else this.flags |= RI_DEPTH_WRITE;

	if(node_flags.alpha_test == true) this.flags |= RI_ALPHA_TEST;
	else this.flags &= ~RI_ALPHA_TEST;

	if(node_flags.cast_shadows == false) this.flags &= ~RI_CAST_SHADOWS;
	else this.flags |= RI_CAST_SHADOWS;

	if(node_flags.receive_shadows == false) this.flags &= ~RI_RECEIVE_SHADOWS;	
	else this.flags |= RI_RECEIVE_SHADOWS;	
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
* Computes the instance bounding box in world space from the one in local space
*
* @method updateAABB
*/
RenderInstance.prototype.updateAABB = function()
{
	BBox.transformMat4(this.aabb, this.oobb, this.matrix );
}

/**
* Calls render taking into account primitive and range
*
* @method render
* @param {Shader} shader
*/
RenderInstance.prototype.render = function(shader)
{
	if(this.lod_mesh)
	{
		//very bad LOD function...
		var f = this.oobb[12] / Math.max(0.1, this._dist);
		if( f < 0.1 )
		{
			shader.drawBuffers( this.lod_vertex_buffers,
			  this.lod_index_buffer,
			  this.primitive);
			return;
		}
	}

	shader.drawBuffers( this.vertex_buffers,
	  this.index_buffer,
	  this.primitive, this.range[0], this.range[1] );
}

RenderInstance.prototype.overlapsSphere = function(center, radius)
{
	//we dont know if the bbox of the instance is valid
	if(this.flags & RI_IGNORE_FRUSTUM)
		return true;
	return geo.testSphereBBox( center, radius, this.aabb );
}


/* moved to PhysicsInstance
RenderInstance.prototype.setCollisionMesh = function(mesh)
{
	this.flags |= RI_USE_MESH_AS_COLLIDER;
	this.collision_mesh = mesh;
}
*/

LS.RenderInstance = RenderInstance;