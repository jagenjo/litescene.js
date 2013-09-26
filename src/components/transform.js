/** Transform that contains the position (vec3), rotation (quat) and scale (vec3) 
* @class Transform
* @constructor
* @param {String} object to configure from
*/

function Transform(o)
{
	this._position = vec3.create();
	this._rotation = quat.create();
	this._scale = vec3.fromValues(1,1,1);
	this._local_matrix = mat4.create();
	this._global_matrix = mat4.create();

	this._dirty = false; //matrix must be redone?

	if(o)
		this.configure(o);
}

Transform.prototype.onAddedToNode = function(node)
{
	if(!node.transform)
		node.transform = this;
}

/**
* Copy the transform from another Transform
* @method copyFrom
* @param {Transform} src
*/
Transform.prototype.copyFrom = function(src)
{
	this.configure( src.serialize() );
}

/**
* Configure from a serialized object
* @method configure
* @param {Object} object with the serialized info
*/
Transform.prototype.configure = function(o)
{
	if(o.position) vec3.copy( this._position, o.position );
	if(o.scale) vec3.copy( this._scale, o.scale );

	if(o.rotation && o.rotation.length == 4)
		quat.copy( this._rotation, o.rotation );
	if(o.rotation && o.rotation.length == 3)
	{
		quat.identity( this._rotation );
		var R = quat.setAngleAxis( quat.create(), [1,0,0], o.rotation[0] * DEG2RAD);
		quat.multiply(this._rotation, this._rotation, R ); 
		quat.setAngleAxis( R, [0,1,0], o.rotation[1] * DEG2RAD );
		quat.multiply(this._rotation, this._rotation, R ); 
		quat.setAngleAxis( R, [0,0,1], o.rotation[2] * DEG2RAD );
		quat.multiply(this._rotation, this._rotation, R ); 
	}

	this._dirty = true;
	this._on_change();
}

/**
* Serialize the object 
* @method serialize
* @return {Object} object with the serialized info
*/
Transform.prototype.serialize = function()
{
	return {
		position: [ this._position[0],this._position[1],this._position[2] ],
		rotation: [ this._rotation[0],this._rotation[1],this._rotation[2],this._rotation[3] ],
		scale: [ this._scale[0],this._scale[1],this._scale[2] ]
	};
}

/**
* Reset this transform
* @method identity
*/
Transform.prototype.identity = function()
{
	vec3.copy(this._position, [0,0,0]);
	quat.copy(this._rotation, [0,0,0,1]);
	vec3.copy(this._scale, [1,1,1]);
	mat4.identity(this._local_matrix);
	mat4.identity(this._global_matrix);
	this._dirty = false;
}

Transform.prototype.reset = Transform.prototype.identity;

/**
* Returns the local position (its a copy)
* @method getPosition
* @return {[[x,y,z]]} the position
*/
Transform.prototype.getPosition = function(p)
{
	if(p) return vec3.copy(p, this._position);
	return vec3.clone( this._position );
}

/**
* Returns the global position (its a copy)
* @method getPosition
* @return {[[x,y,z]]} the position
*/
Transform.prototype.getPositionGlobal = function(p)
{
	if(this._parent)
	{
		var tmp = vec3.create();
		return mat4.multiplyVec3( tmp || p, this.getGlobalMatrix(), tmp );
	}
	if(p) return vec3.copy(p,this._position);
	return vec3.clone( this._position);
}

/**
* Returns the rotation in quaternion array (a copy)
* @method getRotation
* @return {[[x,y,z,w]]} the rotation
*/
Transform.prototype.getRotation = function()
{
	return quat.clone(this._rotation);
}

/**
* Returns the global rotation in quaternion array (a copy)
* @method getRotation
* @return {[[x,y,z,w]]} the rotation
*/
Transform.prototype.getRotationGlobal = function()
{
	if( this._parent )
	{
		var aux = this._parent;
		var R = quat.clone(this._rotation);
		while(aux)
		{
			quat.multiply(R, aux._rotation, R);
			aux = aux._parent;
		}
		return R;
	}
	return quat.clone(this._rotation);
}


/**
* Returns the scale (its a copy)
* @method getScale
* @return {[[x,y,z]]} the scale
*/
Transform.prototype.getScale = function()
{
	return vec3.clone(this._scale);
}

/**
* Returns the scale in global (its a copy)
* @method getScaleGlobal
* @return {[[x,y,z]]} the scale
*/
Transform.prototype.getScaleGlobal = function()
{
	if( this._parent )
	{
		var aux = this;
		var S = vec3.clone(this._scale);
		while(aux._parent)
		{
			vec3.multiply(S, S, aux._scale);
			aux = aux._parent;
		}
		return S;
	}
	return vec3.clone(this._scale);
}

/**
* update the Matrix to match the position,scale and rotation
* @method updateMatrix
*/
Transform.prototype.updateMatrix = function()
{
	mat4.fromRotationTranslation( this._local_matrix , this._rotation, this._position );
	mat4.scale(this._local_matrix, this._local_matrix, this._scale);
	this._dirty = false;
}

/**
* update the Global Matrix to match the position,scale and rotation in world space
* @method updateGlobalMatrix
*/
Transform.prototype.updateGlobalMatrix = function()
{
	if(this._dirty)
		this.updateMatrix();
	if (this._parent)
		mat4.multiply(this._global_matrix, this._parent.updateGlobalMatrix(), this._local_matrix );
	else
		mat4.copy( this._local_matrix , this._global_matrix);
	return this._global_matrix;
}


/**
* Returns a copy of the local matrix of this transform (it updates the matrix automatically)
* @method getLocalMatrix
* @return {Matrix} the matrix in array format
*/
Transform.prototype.getLocalMatrix = function ()
{
	if(this._dirty)
		this.updateMatrix();
	return mat4.clone(this._local_matrix);
}

/**
* Returns the original world matrix of this transform (it updates the matrix automatically)
* @method getLocalMatrixRef
* @return {Matrix} the matrix in array format
*/
Transform.prototype.getLocalMatrixRef = function ()
{
	if(this._dirty)
		this.updateMatrix();
	return this._local_matrix;
}

/**
* Returns a copy of the global matrix of this transform (it updates the matrix automatically)
* @method getGlobalMatrix
* @return {Matrix} the matrix in array format
*/
Transform.prototype.getGlobalMatrix = function ()
{
	if(this._dirty)
		this.updateMatrix();
	if (this._parent)
		return mat4.multiply( this._global_matrix, this._parent.getGlobalMatrix(), this._local_matrix );
	return mat4.clone(this._local_matrix);
}

/**
* Returns a copy of the global matrix of this transform (it updates the matrix automatically)
* @method getGlobalMatrix
* @return {Matrix} the matrix in array format
*/
Transform.prototype.getGlobalMatrixRef = function ()
{
	return this._global_matrix;
}

/**
* Returns the world matrix of this transform without the scale
* @method getMatrixWithoutScale
* @return {Matrix} the matrix in array format
*/
Transform.prototype.getMatrixWithoutScale = function ()
{
	var pos = this.getPositionGlobal();
	return mat4.fromRotationTranslation(mat4.create(), this.getRotationGlobal(), pos) 
}

/**
* Returns the world matrix of this transform without the scale
* @method getMatrixWithoutRotation
* @return {Matrix} the matrix in array format
*/
Transform.prototype.getMatrixWithoutRotation = function ()
{
	var pos = this.getPositionGlobal();
	return mat4.clone([1,0,0,0, 0,1,0,0, 0,0,1,0, pos[0], pos[1], pos[2], 1]);
}

/**
* Configure the transform from a local Matrix (do not tested carefully)
* @method fromMatrix
* @param {Matrix} src, the matrix in array format
*/
Transform.prototype.fromMatrix = function(m)
{
	//pos
	var M = mat4.clone(m);
	mat4.multiplyVec3(this._position, M, [0,0,0]);

	//scale
	var tmp = vec3.create();
	this._scale[0] = vec3.length( mat4.rotateVec3(tmp,M,[1,0,0]) );
	this._scale[1] = vec3.length( mat4.rotateVec3(tmp,M,[0,1,0]) );
	this._scale[2] = vec3.length( mat4.rotateVec3(tmp,M,[0,0,1]) );

	mat4.scale( mat4.create(), M, [1/this._scale[0],1/this._scale[1],1/this._scale[2]] );

	//rot
	var M3 = mat3.fromMat4( mat3.create(), M);
	mat3.transpose(M3, M3);
	quat.fromMat3(this._rotation, M3);
	quat.normalize(this._rotation, this._rotation);

	mat4.copy(this._local_matrix, m);
	this._dirty = false;
	this._on_change();
}

/**
* Configure the transform rotation from a vec3 Euler angles (heading,attitude,bank)
* @method setRotationFromEuler
* @param {Matrix} src, the matrix in array format
*/
Transform.prototype.setRotationFromEuler = function(v)
{
	quat.fromEuler( this._rotation, v );
	this._dirty = true;
	this._on_change();
}

/**
* sets the position
* @method setPosition
* @param {Number} x 
* @param {Number} y
* @param {Number} z 
*/
Transform.prototype.setPosition = function(x,y,z)
{
	if(arguments.length == 3)
		vec3.set(this._position, x,y,z);
	else
		vec3.copy(this._position, x);
	this._dirty = true;
	this._on_change();
}

/**
* sets the rotation
* @method setRotation
* @param {quat} rotation in quaterion format
*/
Transform.prototype.setRotation = function(q)
{
	quat.copy(this._rotation, q);
	this._dirty = true;
	this._on_change();
}

/**
* sets the scale
* @method setScale
* @param {Number} x 
* @param {Number} y
* @param {Number} z 
*/
Transform.prototype.setScale = function(x,y,z)
{
	if(arguments.length == 3)
		vec3.set(this._scale, x,y,z);
	else
		vec3.set(this._scale, x,x,x);
	this._dirty = true;
	this._on_change();
}

/**
* translates object (addts to the position)
* @method translate
* @param {Number} x 
* @param {Number} y
* @param {Number} z 
*/
Transform.prototype.translate = function(x,y,z)
{
	if(arguments.length == 3)
		vec3.add( this._position, this._position, [x,y,z] );
	else
		vec3.add( this._position, this._position, x );
	this._dirty = true;
	this._on_change();
}

/**
* translates object in local coordinates (using the rotation and the scale)
* @method translateLocal
* @param {Number} x 
* @param {Number} y
* @param {Number} z 
*/
Transform.prototype.translateLocal = function(x,y,z)
{
	if(arguments.length == 3)
		vec3.add( this._position, this._position, this.transformVector([x,y,z]) );
	else
		vec3.add( this._position, this._position, this.transformVector(x) );
	this._dirty = true;
	this._on_change();
}

/**
* rotate object in world space
* @method rotate
* @param {Number} angle_in_deg 
* @param {vec3} axis
*/
Transform.prototype.rotate = function(angle_in_deg, axis)
{
	var R = quat.setAxisAngle(quat.create(), axis, angle_in_deg * 0.0174532925);
	quat.multiply(this._rotation, R, this._rotation);
	this._dirty = true;
	this._on_change();
}

/**
* rotate object in object space
* @method rotateLocal
* @param {Number} angle_in_deg 
* @param {vec3} axis
*/
Transform.prototype.rotateLocal = function(angle_in_deg, axis)
{
	var R = quat.setAxisAngle(quat.create(), axis, angle_in_deg * 0.0174532925 );
	quat.multiply(this._rotation, this._rotation, R);
	this._dirty = true;
	this._on_change();
}

/**
* scale the object
* @method scale
* @param {Number} x 
* @param {Number} y
* @param {Number} z 
*/
Transform.prototype.scale = function(x,y,z)
{
	if(arguments.length == 3)
		vec3.multiply(this._scale, this._scale, [x,y,z]);
	else
		vec3.multiply(this._scale, this._scale,x);
	this._dirty = true;
	this._on_change();
}

/**
* This method is static (call it from Transform.interpolate)
* interpolate the transform between two transforms and stores the result in another Transform
* @method interpolate
* @param {Transform} a 
* @param {Transform} b
* @param {Number} factor from 0 to 1 
* @param {Transform} the destination
*/
Transform.interpolate = function(a,b,factor, result)
{
	vec3.lerp(result._scale, a._scale, b._scale, factor); //scale
	vec3.lerp(result._position, a._position, b._position, factor); //position
	quat.slerp(result._rotation, a._rotation, b._rotation, factor); //rotation
	this._dirty = true;
	this._on_change();
}

/**
* Orients the transform to look from one position to another (overwrites scale)
* @method lookAt
* @param {[[x,y,z]]} position
* @param {[[x,y,z]]} target
* @param {[[x,y,z]]} up
*/
Transform.prototype.lookAt = function(pos,target,up)
{
	var temp = mat4.create();
	if(this._parent)
	{
		var M = this._parent.getGlobalMatrix();
		pos = mat4.multiplyVec3(vec3.create(), M, pos);
		target = mat4.multiplyVec3(vec3.create(), M,target);
		up = mat4.multiplyVec3(vec3.create(), M,up);
	}
	mat4.lookAt(temp, pos, target, up);
	mat4.invert(temp, temp);
	this.fromMatrix(temp);
}

//Events
Transform.prototype._on_change = function()
{
	this._dirty = true;
	LEvent.trigger(this, "changed", this);
	if(this._root)
		LEvent.trigger(this._root, "transformChanged", this);
}

//Transform
/**
* returns the [0,0,1] vector in world space
* @method getFront
* @return {[[x,y,z]]}
*/
Transform.prototype.getFront = function(dest) {
	return vec3.transformQuat(dest || vec3.create(), vec3.fromValues(0,0,1), this.getRotationGlobal() );
}

/**
* returns the [0,1,0] vector in world space
* @method getTop
* @return {[[x,y,z]]}
*/
Transform.prototype.getTop = function(dest) {
	return vec3.transformQuat(dest || vec3.create(), vec3.fromValues(0,1,0), this.getRotationGlobal() );
}

/**
* returns the [1,0,0] vector in world space
* @method getRight
* @return {[[x,y,z]]}
*/
Transform.prototype.getRight = function(dest) {
	//return mat4.rotateVec3( this._matrix, vec3.create([1,0,0]) );
	return vec3.transformQuat(dest || vec3.create(), vec3.fromValues(1,0,0), this.getRotationGlobal() );
}

/**
* Applies the local transformation to a point (multiply it by the matrix)
* If no destination is specified the transform is applied to vec
* @method transformPoint
* @param {[[x,y,z]]} point
* @param {[[x,y,z]]} destination (optional)
*/
Transform.prototype.transformPoint = function(vec, dest) {
	dest = dest || vec3.create();
	if(this._dirty) this.updateMatrix();
	return mat4.multiplyVec3( dest, this._local_matrix, vec );
}

/**
* Applies the global transformation to a point (multiply it by the matrix)
* If no destination is specified the transform is applied to vec
* @method transformPointGlobal
* @param {[[x,y,z]]} point
* @param {[[x,y,z]]} destination (optional)
*/
Transform.prototype.transformPointGlobal = function(vec, dest) {
	dest = dest || vec3.create();
	if(this._dirty) this.updateMatrix();
	return mat4.multiplyVec3( dest, this.getGlobalMatrix(), vec );
}


/**
* Applies the transformation to a vector (rotate but not translate)
* If no destination is specified the transform is applied to vec
* @method transformVector
* @param {[[x,y,z]]} vector
* @param {[[x,y,z]]} destination (optional)
*/
Transform.prototype.transformVector = function(vec, dest) {
	return vec3.transformQuat(dest || vec3.create(), vec, this._rotation );
}

/**
* Applies the transformation to a vector (rotate but not translate)
* If no destination is specified the transform is applied to vec
* @method transformVectorGlobal
* @param {[[x,y,z]]} vector
* @param {[[x,y,z]]} destination (optional)
*/
Transform.prototype.transformVectorGlobal = function(vec, dest) {
	return vec3.transformQuat(dest || vec3.create(), vec, this.getRotationGlobal() );
}

LS.registerComponent(Transform);
LS.Transform = Transform;