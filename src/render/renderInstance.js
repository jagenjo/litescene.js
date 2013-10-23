/**
* RenderInstance contains info of one object to be rendered on the scene.
*
* @class RenderInstance
* @namespace LS
* @constructor
*/

//flags
RenderInstance.TWO_SIDED = 1;

function RenderInstance(node, component)
{
	this._key = "";
	this._uid = LS.generateUId();
	this.mesh = null;
	this.node = node;
	this.component = component;
	this.primitive = gl.TRIANGLES;
	this.material = null;
	this.flags = 0;
	this.matrix = mat4.create();
	this.normal_matrix = mat4.create();
	this.center = vec3.create();
	this.oobb_center = vec3.create();
	this.oobb_halfsize = vec3.create();
	this.aabb_center = vec3.create();
	this.aabb_halfsize = vec3.create();
}


RenderInstance.prototype.generateKey = function(step, options)
{
	this._key = step + "|" + this.node._uid + "|" + this.material._uid + "|";
	return this._key;
}

/**
* Enable flag in the flag bit field
*
* @method enableFlag
* @param {number} flag id
*/
RenderInstance.prototype.enableFlag = function(flag)
{
	this.flags |= (1 << flag);
}

/**
* Disable flag in the flag bit field
*
* @method enableFlag
* @param {number} flag id
*/
RenderInstance.prototype.disableFlag = function(flag)
{
	this.flags &= (1 << flag);
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
	return (this.flags & (1 << flag));
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
* @method computeBounding
*/
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

/**
* Calls render taking into account primitive and submesh id
*
* @method render
* @param {Shader} shader
*/
RenderInstance.prototype.render = function(shader)
{
	if(this.submesh_id != null && this.submesh_id != -1 && this.mesh.info.groups && this.mesh.info.groups.length > this.submesh_id)
		shader.drawRange(this.mesh, this.primitive, this.mesh.info.groups[this.submesh_id].start, this.mesh.info.groups[this.submesh_id].length);
	else if(this.start || this.length)
		shader.drawRange(this.mesh, this.primitive, this.start || 0, this.length);
	else
		shader.draw(this.mesh, this.primitive);
}
