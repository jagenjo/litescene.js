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

Transform.temp_matrix = mat4.create();
Transform.icon = "mini-icon-gizmo.png";

Transform.attributes = {
		position:"vec3",
		scale:"vec3",
		rotation:"quat"
	};

Transform.prototype.onAddedToNode = function(node)
{
	if(!node.transform)
		node.transform = this;
}

Transform.prototype.onRemovedFromNode = function(node)
{
	if(node.transform == this)
		delete node["transform"];
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
		scale: [ this._scale[0],this._scale[1],this._scale[2] ],
		matrix: toArray( this._local_matrix ) //could be useful
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
* @method getGlobalPosition
* @return {[[x,y,z]]} the position
*/
Transform.prototype.getGlobalPosition = function(p)
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
Transform.prototype.getGlobalRotation = function()
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
* @method getGlobalScale
* @return {[[x,y,z]]} the scale
*/
Transform.prototype.getGlobalScale = function()
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
* updates the global matrix using the parents transformation
* @method updateGlobalMatrix
* @param {bool} fast it doesnt recompute parent matrices, just uses the stored one, is faster but could create errors if the parent doesnt have its global matrix update
*/
Transform.prototype.updateGlobalMatrix = function (fast)
{
	if(this._dirty)
		this.updateMatrix();
	if (this._parent)
		mat4.multiply( this._global_matrix, fast ? this._parent._global_matrix : this._parent.getGlobalMatrix(), this._local_matrix );
	else
		this._global_matrix.set( this._local_matrix ); 
}

/**
* Returns a copy of the local matrix of this transform (it updates the matrix automatically)
* @method getLocalMatrix
* @return {mat4} the matrix in array format
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
* @return {mat4} the matrix in array format
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
* @return {mat4} the matrix in array format
*/
Transform.prototype.getGlobalMatrix = function (m, fast)
{
	if(this._dirty)
		this.updateMatrix();
	m = m || mat4.create();
	if (this._parent)
		mat4.multiply( this._global_matrix, fast ? this._parent._global_matrix : this._parent.getGlobalMatrix(), this._local_matrix );
	else
		this._global_matrix.set( this._local_matrix ); 
	m.set(this._global_matrix);
	return m;
}

/**
* Returns a quaternion with all parents rotations
* @method getGlobalRotation
* @return {quat} Quaternion
*/
Transform.prototype.getGlobalRotation = function (q)
{
	q = q || quat.create();
	q.set(this._rotation);

	//concatenate all parents rotations
	var aux = this._parent;
	while(aux)
	{
		quat.multiply(q,q,aux._rotation);
		aux = aux._parent;
	}
	return q;
}

/**
* Returns a Matrix with all parents rotations
* @method getGlobalRotationMatrix
* @return {mat4} Matrix rotation
*/
Transform.prototype.getGlobalRotationMatrix = function (m)
{
	var q = quat.clone(this._rotation);

	var aux = this._parent;
	while(aux)
	{
		quat.multiply(q, q, aux._rotation);
		aux = aux._parent;
	}

	m = m || mat4.create();
	return mat4.fromQuat(m,q);
}

/**
* Returns a copy of the global matrix of this transform (it updates the matrix automatically)
* @method getGlobalMatrix
* @return {mat4} the matrix in array format
*/
Transform.prototype.getGlobalMatrixRef = function ()
{
	return this._global_matrix;
}

/**
* Returns the world matrix of this transform without the scale
* @method getMatrixWithoutScale
* @return {mat4} the matrix in array format
*/
Transform.prototype.getMatrixWithoutScale = function ()
{
	var pos = this.getGlobalPosition();
	return mat4.fromRotationTranslation(mat4.create(), this.getGlobalRotation(), pos) 
}

/**
* Returns the world matrix of this transform without the scale
* @method getMatrixWithoutRotation
* @return {mat4} the matrix in array format
*/
Transform.prototype.getMatrixWithoutRotation = function ()
{
	var pos = this.getGlobalPosition();
	return mat4.clone([1,0,0,0, 0,1,0,0, 0,0,1,0, pos[0], pos[1], pos[2], 1]);
}


/**
* Returns the matrix for the normals in the shader
* @method getNormalMatrix
* @return {mat4} the matrix in array format
*/
Transform.prototype.getNormalMatrix = function (m)
{
	if(this._dirty)
		this.updateMatrix();

	m = m || mat4.create();
	if (this._parent)
		mat4.multiply( this._global_matrix, this._parent.getGlobalMatrix(), this._local_matrix );
	else
		m.set(this._local_matrix); //return local because it has no parent
	return mat4.transpose(m, mat4.invert(m,m));
}

/**
* Configure the transform from a local Matrix (do not tested carefully)
* @method fromMatrix
* @param {mat4} src, the matrix in array format
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
	//quat.fromMat4(this._rotation, M);
	//*
	vec3.normalize( M.subarray(0,3), M.subarray(0,3) );
	vec3.normalize( M.subarray(4,7), M.subarray(4,7) );
	vec3.normalize( M.subarray(8,11), M.subarray(8,11) );
	var M3 = mat3.fromMat4( mat3.create(), M);
	mat3.transpose(M3, M3);
	quat.fromMat3(this._rotation, M3);
	quat.normalize(this._rotation, this._rotation);
	//*/

	if(m != this._local_matrix)
		mat4.copy(this._local_matrix, m);
	this._dirty = false;
	this._on_change();
}

/**
* Configure the transform rotation from a vec3 Euler angles (heading,attitude,bank)
* @method setRotationFromEuler
* @param {mat4} src, the matrix in array format
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
* @param {number} x 
* @param {number} y
* @param {number} z 
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
* @param {number} x 
* @param {number} y
* @param {number} z 
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
* @param {number} x 
* @param {number} y
* @param {number} z 
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
* @param {number} x 
* @param {number} y
* @param {number} z 
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
* @param {number} angle_in_deg 
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
* @param {number} angle_in_deg 
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
* rotate object in world space using a quat
* @method rotateQuat
* @param {quat} quaternion
*/
Transform.prototype.rotateQuat = function(quaternion)
{
	quat.multiply(this._rotation, quaternion, this._rotation);
	this._dirty = true;
	this._on_change();
}

/**
* rotate object in world space using a quat
* @method rotateQuat
* @param {quat} quaternion
*/
Transform.prototype.rotateQuatLocal = function(quaternion)
{
	quat.multiply(this._rotation, this._rotation, quaternion);
	this._dirty = true;
	this._on_change();
}

/**
* scale the object
* @method scale
* @param {number} x 
* @param {number} y
* @param {number} z 
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
* @param {number} factor from 0 to 1 
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
* @param {vec3} position
* @param {vec3} target
* @param {vec3} up
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
* @return {vec3}
*/
Transform.prototype.getFront = function(dest) {
	return vec3.transformQuat(dest || vec3.create(), vec3.fromValues(0,0,1), this.getGlobalRotation() );
}

/**
* returns the [0,1,0] vector in world space
* @method getTop
* @return {vec3}
*/
Transform.prototype.getTop = function(dest) {
	return vec3.transformQuat(dest || vec3.create(), vec3.fromValues(0,1,0), this.getGlobalRotation() );
}

/**
* returns the [1,0,0] vector in world space
* @method getRight
* @return {vec3}
*/
Transform.prototype.getRight = function(dest) {
	//return mat4.rotateVec3( this._matrix, vec3.create([1,0,0]) );
	return vec3.transformQuat(dest || vec3.create(), vec3.fromValues(1,0,0), this.getGlobalRotation() );
}

/**
* Applies the local transformation to a point (multiply it by the matrix)
* If no destination is specified the transform is applied to vec
* @method transformPoint
* @param {vec3} point
* @param {vec3} destination (optional)
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
* @param {vec3} point
* @param {vec3} destination (optional)
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
* @param {vec3} vector
* @param {vec3} destination (optional)
*/
Transform.prototype.transformVector = function(vec, dest) {
	return vec3.transformQuat(dest || vec3.create(), vec, this._rotation );
}

/**
* Applies the transformation to a vector (rotate but not translate)
* If no destination is specified the transform is applied to vec
* @method transformVectorGlobal
* @param {vec3} vector
* @param {vec3} destination (optional)
*/
Transform.prototype.transformVectorGlobal = function(vec, dest) {
	return vec3.transformQuat(dest || vec3.create(), vec, this.getGlobalRotation() );
}

/**
* Applies the transformation using a matrix
* @method applyTransformMatrix
* @param {mat4} matrix with the transform
* @param {bool} is_global (optional)
*/
Transform.prototype.applyTransformMatrix = function(t, is_global) {
	if(!this._parent)
	{
		if(is_global)
			mat4.multiply(this._local_matrix, t, this._local_matrix);
		else
			mat4.multiply(this._local_matrix, this._local_matrix, t);
		this.fromMatrix(this._local_matrix);
		mat4.copy(this._global_matrix, this._local_matrix); //no parent? then is the global too
		return;
	}

	var g = this.getGlobalMatrix();
	var pg = this._parent._global_matrix;
	var temp = mat4.create();
	mat4.multiply( this._global_matrix, t, g );

	mat4.invert(temp,pg);
	mat4.multiply(this._local_matrix, temp, this._global_matrix );
	this.fromMatrix(this._local_matrix);
}


LS.registerComponent(Transform);
LS.Transform = Transform;