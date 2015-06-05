/** Transform that contains the position (vec3), rotation (quat) and scale (vec3) 
* @class Transform
* @constructor
* @param {String} object to configure from
*/

function Transform(o)
{
	this._position = vec3.create();
	this._rotation = quat.create();
	this._scaling = vec3.fromValues(1,1,1);
	this._local_matrix = mat4.create();
	this._global_matrix = mat4.create();

	this._must_update_matrix = false; //matrix must be redone?

	//Testing using observers (DO NOT WORK IN FIREFOX)
	if(Object.observe)
	{
		var inner_transform_change = (function(c) { 
			this._must_update_matrix = true;
		}).bind(this);
		Object.observe( this._position, inner_transform_change );
		Object.observe( this._rotation, inner_transform_change );
		Object.observe( this._scaling, inner_transform_change );
	}

	if(o)
		this.configure(o);
}

Transform.temp_matrix = mat4.create();
Transform.icon = "mini-icon-gizmo.png";
Transform.ZERO = vec3.create();
Transform.UP = vec3.fromValues(0,1,0);
Transform.RIGHT = vec3.fromValues(1,0,0);
Transform.FRONT = vec3.fromValues(0,0,-1);

Transform.attributes = {
	position:"vec3",
	scaling:"vec3",
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

Transform.prototype.mustUpdate = function()
{
	this._must_update_matrix = true;
}

/**
* The position relative to its parent in vec3 format
* @property position {vec3}
*/
Object.defineProperty( Transform.prototype, 'position', {
	get: function() { return this._position; },
	set: function(v) { 
		this._position.set(v); 
		this._must_update_matrix = true; 
	},
	enumerable: true
});

/**
* The orientation relative to its parent in quaternion format
* @property rotation {quat}
*/
Object.defineProperty( Transform.prototype, 'rotation', {
	get: function() { return this._rotation; },
	set: function(v) { 
		this._rotation.set(v);
		this._must_update_matrix = true;
	},
	enumerable: true //avoid problems
});

/**
* The scaling relative to its parent in vec3 format (default is [1,1,1])
* @property scaling {vec3}
*/
Object.defineProperty( Transform.prototype, 'scaling', {
	get: function() { return this._scaling; },
	set: function(v) { 
		if(v.constructor === Number)
			this._scaling[0] = this._scaling[1] = this._scaling[2] = v;
		else
			this._scaling.set(v);
		this._must_update_matrix = true;
	},
	enumerable: true
});

/**
* The local matrix transform relative to its parent in mat4 format
* @property matrix {mat4}
*/
Object.defineProperty( Transform.prototype, 'matrix', {
	get: function() { 
		if(this._must_update_matrix)
			this.updateMatrix();
		return this._local_matrix;
	},
	set: function(v) { 
		this.fromMatrix(v);	
	},
	enumerable: true
});


/**
* The position relative to its parent in vec3 format
* @property position {vec3}
*/
Object.defineProperty( Transform.prototype, 'globalPosition', {
	get: function() { return this.getGlobalPosition(); },
	set: function(v) { 
	},
	enumerable: true
});

/**
* The local matrix transform relative to its parent in mat4 format
* @property matrix {mat4}
*/
Object.defineProperty( Transform.prototype, 'globalMatrix', {
	get: function() { 
		this.updateGlobalMatrix();
		return this._global_matrix;
	},
	set: function(v) { 
	},
	enumerable: true
});

Transform.prototype.getAttributes = function(v)
{
	if(v == "output")
	{
		return {
			position:"vec3",
			scaling:"vec3",
			rotation:"quat",
			matrix:"mat4",
			globalPosition:"vec3",
			globalMatrix:"mat4"
		};
	} 
	else //if(v == "input")
	{
		return {
			position:"vec3",
			scaling:"vec3",
			rotation:"quat",
			matrix:"mat4"
		};
	}
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
	if(o.scaling)
		vec3.copy( this._scaling, o.scaling );

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

	this._must_update_matrix = true;
	this.updateGlobalMatrix();
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
		scaling: [ this._scaling[0],this._scaling[1],this._scaling[2] ],
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
	vec3.copy(this._scaling, [1,1,1]);
	mat4.identity(this._local_matrix);
	mat4.identity(this._global_matrix);
	this._must_update_matrix = false;
}

Transform.prototype.reset = Transform.prototype.identity;

/**
* Returns a copy of the local position
* @method getPosition
* @param {vec3} out [optional] where to store the result, otherwise one vec3 is created and returned
* @return {vec3} the position
*/
Transform.prototype.getPosition = function(out)
{
	out = out || vec3.create();
	out.set( this._position );
	return out;
}

/**
* Returns a copy of the global position
* @method getGlobalPosition
* @param {vec3} out [optional] where to store the result, otherwise one vec3 is created and returned
* @return {vec3} the position
*/
Transform.prototype.getGlobalPosition = function(out)
{
	out = out || vec3.create();
	if(this._parent)
		return mat4.multiplyVec3( out, this.getGlobalMatrix(), Transform.ZERO );
	return vec3.copy(out, this._position );
}

/**
* Returns the rotation in quaternion array (a copy)
* @method getRotation
* @param {quat} out [optional] where to store the result, otherwise one quat is created and returned
* @return {quat} the rotation
*/
Transform.prototype.getRotation = function(out)
{
	out = out || quat.create();
	return vec3.copy(out,this._rotation);
}

/**
* Returns the global rotation in quaternion array (a copy)
* @method getRotation
* @param {quat} out [optional] where to store the result, otherwise one quat is created and returned
* @return {quat} the rotation
*/
Transform.prototype.getGlobalRotation = function(out)
{
	out = out || quat.create();
	if( !this._parent )
	{
		quat.copy(out, this._rotation);
		return out;
	}

	var aux = this._parent;
	quat.copy(out,this._rotation);
	while(aux)
	{
		quat.multiply(out, aux._rotation, out);
		aux = aux._parent;
	}
	return out;
}


/**
* Returns the scale (its a copy)
* @method getScale
* @param {vec3} out [optional] where to store the result, otherwise one vec3 is created and returned
* @return {vec3} the scale
*/
Transform.prototype.getScale = function(out)
{
	out = out || vec3.create();
	return vec3.copy(out,this._scaling);
}

/**
* Returns a copy of the global scale
* @method getGlobalScale
* @param {vec3} out [optional] where to store the result, otherwise one vec3 is created and returned
* @return {vec3} the scale
*/
Transform.prototype.getGlobalScale = function(out)
{
	out = out || vec3.create();
	if( this._parent )
	{
		var aux = this;
		vec3.copy(out,this._scaling);
		while(aux._parent)
		{
			vec3.multiply(out, out, aux._scaling);
			aux = aux._parent;
		}
		return out;
	}
	return vec3.copy(out, this._scaling);
}

/**
* update the local Matrix to match the position,scale and rotation
* @method updateMatrix
*/
Transform.prototype.updateMatrix = function()
{
	mat4.fromRotationTranslation( this._local_matrix , this._rotation, this._position );
	mat4.scale(this._local_matrix, this._local_matrix, this._scaling);
	this._must_update_matrix = false;
}
Transform.prototype.updateLocalMatrix = Transform.prototype.updateMatrix;

/**
* updates the global matrix using the parents transformation
* @method updateGlobalMatrix
* @param {bool} fast it doesnt recompute parent matrices, just uses the stored one, is faster but could create errors if the parent doesnt have its global matrix update
*/
Transform.prototype.updateGlobalMatrix = function (fast)
{
	if(this._must_update_matrix)
		this.updateMatrix();
	if (this._parent)
		mat4.multiply( this._global_matrix, fast ? this._parent._global_matrix : this._parent.getGlobalMatrix(), this._local_matrix );
	else
		this._global_matrix.set( this._local_matrix ); 
}

/**
* Returns a copy of the local matrix of this transform (it updates the matrix automatically)
* @method getMatrix
* @param {mat4} out [optional] where to store the result, otherwise one mat4 is created and returned
* @return {mat4} the matrix
*/
Transform.prototype.getMatrix = function (out)
{
	out = out || mat4.create();
	if(this._must_update_matrix)
		this.updateMatrix();
	return mat4.copy(out, this._local_matrix);
}
Transform.prototype.getLocalMatrix = Transform.prototype.getMatrix; //alias

/**
* Returns the original local matrix of this transform (it updates the matrix automatically)
* @method getLocalMatrixRef
* @return {mat4} the matrix in array format
*/
Transform.prototype.getLocalMatrixRef = function ()
{
	if(this._must_update_matrix)
		this.updateMatrix();
	return this._local_matrix;
}


/**
* Returns a copy of the global matrix of this transform (it updates the matrix automatically)
* @method getGlobalMatrix
* @param {mat4} out optional
* @param {boolean} fast this flags skips recomputing parents matrices
* @return {mat4} the matrix in array format
*/
Transform.prototype.getGlobalMatrix = function (out, fast)
{
	if(this._must_update_matrix)
		this.updateMatrix();
	out = out || mat4.create();
	if (this._parent)
		mat4.multiply( this._global_matrix, fast ? this._parent._global_matrix : this._parent.getGlobalMatrix(), this._local_matrix );
	else
		mat4.copy( this._global_matrix, this._local_matrix ); 
	return mat4.copy(out, this._global_matrix);
}

/**
* Returns a copy of the global matrix of this transform (it updates the matrix automatically)
* @method getGlobalMatrix
* @return {mat4} the matrix in array format
*/
Transform.prototype.getGlobalMatrixRef = function ()
{
	this.updateGlobalMatrix();
	return this._global_matrix;
}



/**
* Returns an array with all the ancestors
* @method getAncestors
* @return {Array} 
*/
Transform.prototype.getAncestors = function()
{
	var r = [ this ];
	var aux = this;
	while(aux = aux._parent)
		r.unshift(aux);	
	return r;
}

/**
* Returns a quaternion with all parents rotations
* @method getGlobalRotation
* @return {quat} Quaternion
*/
/*
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
*/
/**
* Returns a Matrix with all parents rotations
* @method getGlobalRotationMatrix
* @return {mat4} Matrix rotation
*/
/*
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
*/


/**
* Returns the local matrix of this transform without the rotation or scale
* @method getGlobalTranslationMatrix
* @return {mat4} the matrix in array format
*/
Transform.prototype.getGlobalTranslationMatrix = function ()
{
	var pos = this.getGlobalPosition();
	return mat4.fromValues(1,0,0,0, 0,1,0,0, 0,0,1,0, pos[0], pos[1], pos[2], 1);
}

/**
* Returns the global rotation in quaternion array (a copy)
* @method getGlobalRotationMatrix
* @return {mat4} the rotation
*/
Transform.prototype.getGlobalRotationMatrix = function(out)
{
	var out = out || mat4.create();
	if( !this._parent )
		return mat4.fromQuat( out, this._rotation );
		
	var r = mat4.create();
	var aux = this;
	while( aux )
	{
		mat4.fromQuat(r, aux._rotation);
		mat4.multiply(out,out,r);
		aux = aux._parent;
	}
	return out;
}


/**
* Returns the local matrix of this transform without the scale
* @method getGlobalTranslationRotationMatrix
* @return {mat4} the matrix in array format
*/
Transform.prototype.getGlobalTranslationRotationMatrix = function ()
{
	var pos = this.getGlobalPosition();
	return mat4.fromRotationTranslation(mat4.create(), this.getGlobalRotation(), pos);
}
Transform.prototype.getGlobalMatrixWithoutScale = Transform.prototype.getGlobalTranslationRotationMatrix;



/**
* Returns the matrix for the normals in the shader
* @method getNormalMatrix
* @return {mat4} the matrix in array format
*/
Transform.prototype.getNormalMatrix = function (m)
{
	if(this._must_update_matrix)
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
* @param {mat4} matrix the matrix in array format
* @param {bool} is_global tells if the matrix is in global space [optional]
*/
Transform.prototype.fromMatrix = function(m, is_global)
{
	if(is_global && this._parent)
	{
		mat4.copy(this._global_matrix, m); //assign to global
		var M_parent = this._parent.getGlobalMatrix(); //get parent transform
		mat4.invert(M_parent,M_parent); //invert
		m = mat4.multiply( this._local_matrix, M_parent, m ); //transform from global to local
	}

	//pos
	var M = mat4.clone(m);
	mat4.multiplyVec3(this._position, M, [0,0,0]);

	//scale
	var tmp = vec3.create();
	this._scaling[0] = vec3.length( mat4.rotateVec3(tmp,M,[1,0,0]) );
	this._scaling[1] = vec3.length( mat4.rotateVec3(tmp,M,[0,1,0]) );
	this._scaling[2] = vec3.length( mat4.rotateVec3(tmp,M,[0,0,1]) );

	mat4.scale( mat4.create(), M, [1/this._scaling[0],1/this._scaling[1],1/this._scaling[2]] );

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
	this._must_update_matrix = false;
	this._on_change(true);
}

/**
* Configure the transform rotation from a vec3 Euler angles (heading,attitude,bank)
* @method setRotationFromEuler
* @param {mat4} src, the matrix in array format
*/
Transform.prototype.setRotationFromEuler = function(v)
{
	quat.fromEuler( this._rotation, v );
	this._must_update_matrix = true;
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
	this._must_update_matrix = true;
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
	this._must_update_matrix = true;
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
		vec3.set(this._scaling, x,y,z);
	else
		vec3.set(this._scaling, x,x,x);
	this._must_update_matrix = true;
	this._on_change();
}

/**
* translates object in local coordinates (adds to the position)
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
	this._must_update_matrix = true;
	this._on_change();
}

/**
* NOT TESTED
* translates object in global coordinates (using the rotation and the scale)
* @method translateGlobal
* @param {number} x 
* @param {number} y
* @param {number} z 
*/
Transform.prototype.translateGlobal = function(x,y,z)
{
	if(arguments.length == 3)
		vec3.add( this._position, this._position, this.transformVector([x,y,z]) );
	else
		vec3.add( this._position, this._position, this.transformVector(x) );
	this._must_update_matrix = true;
	this._on_change();
}

/**
* rotate object in local space (axis is in local space)
* @method rotate
* @param {number} angle_in_deg 
* @param {vec3} axis
*/
Transform.prototype.rotate = (function(){

	var temp = quat.create();

	return function(angle_in_deg, axis)
	{
		quat.setAxisAngle( temp, axis, angle_in_deg * 0.0174532925 );
		quat.multiply( this._rotation, this._rotation, temp );
		this._must_update_matrix = true;
		this._on_change();
	}
})();

/**
* rotate object in local space in local X axis
* @method rotateX
* @param {number} angle_in_deg 
*/
Transform.prototype.rotateX = function(angle_in_deg)
{
	quat.rotateX( this._rotation, this._rotation, angle_in_deg * 0.0174532925 );
	this._must_update_matrix = true;
	this._on_change();
}

/**
* rotate object in local space in local Y axis
* @method rotateY
* @param {number} angle_in_deg 
*/
Transform.prototype.rotateY = function(angle_in_deg)
{
	quat.rotateY( this._rotation, this._rotation, angle_in_deg * 0.0174532925 );
	this._must_update_matrix = true;
	this._on_change();
}

/**
* rotate object in local space in local Z axis
* @method rotateZ
* @param {number} angle_in_deg 
*/
Transform.prototype.rotateZ = function(angle_in_deg)
{
	quat.rotateZ( this._rotation, this._rotation, angle_in_deg * 0.0174532925 );
	this._must_update_matrix = true;
	this._on_change();
}


/**
* rotate object in global space (axis is in global space)
* @method rotateGlobal
* @param {number} angle_in_deg 
* @param {vec3} axis
*/
Transform.prototype.rotateGlobal = function(angle_in_deg, axis)
{
	var R = quat.setAxisAngle(quat.create(), axis, angle_in_deg * 0.0174532925);
	quat.multiply(this._rotation, R, this._rotation);
	this._must_update_matrix = true;
	this._on_change();
}

/**
* rotate object in local space using a quat
* @method rotateQuat
* @param {quat} quaternion
*/
Transform.prototype.rotateQuat = function(quaternion)
{
	quat.multiply(this._rotation, this._rotation, quaternion);
	this._must_update_matrix = true;
	this._on_change();
}

/**
* rotate object in global space using a quat
* @method rotateQuatGlobal
* @param {quat} quaternion
*/
Transform.prototype.rotateQuatGlobal = function(quaternion)
{
	quat.multiply(this._rotation, quaternion, this._rotation);
	this._must_update_matrix = true;
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
		vec3.multiply(this._scaling, this._scaling, [x,y,z]);
	else
		vec3.multiply(this._scaling, this._scaling,x);
	this._must_update_matrix = true;
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
	vec3.lerp(result._scaling, a._scaling, b._scaling, factor); //scale
	vec3.lerp(result._position, a._position, b._position, factor); //position
	quat.slerp(result._rotation, a._rotation, b._rotation, factor); //rotation
	this._must_update_matrix = true;
	this._on_change();
}

/**
* Orients the transform to look from one position to another
* @method lookAt
* @param {vec3} position
* @param {vec3} target
* @param {vec3} up
* @param {boolean} in_world tells if the values are in world coordinates (otherwise asume its in local coordinates)
*/
Transform.prototype.lookAt = (function() { 

	//avoid garbage
	var GM = mat4.create();
	var temp = mat4.create();
	var temp_pos = vec3.create();
	var temp_target = vec3.create();
	var temp_up = vec3.create();
	
	return function(pos, target, up, in_world)
	{

	//convert to local space
	if(in_world && this._parent)
	{
		this._parent.getGlobalMatrix( GM );
		var inv = mat4.invert(GM,GM);
		mat4.multiplyVec3(temp_pos, inv, pos);
		mat4.multiplyVec3(temp_target, inv, target);
		mat4.rotateVec3(temp_up, inv, up );
	}
	else
	{
		temp_pos.set( pos );
		temp_target.set( target );
		temp_up.set( up );
	}

	mat4.lookAt(temp, temp_pos, temp_target, temp_up);
	//mat4.invert(temp, temp);

	quat.fromMat4( this._rotation, temp );
	this._position.set( temp_pos );	
	this._must_update_matrix = true;

	/*
	mat4.lookAt(temp, pos, target, up);
	mat4.invert(temp, temp);
	this.fromMatrix(temp);
	this.updateGlobalMatrix();
	*/
	}
})();

//Events
Transform.prototype._on_change = function(only_events)
{
	if(!only_events)
		this._must_update_matrix = true;
	LEvent.trigger(this, "changed", this);
	if(this._root)
		LEvent.trigger(this._root, "transformChanged", this);
}

//Transform
/**
* returns the [0,0,-1] vector in global space
* @method getFront
* @return {vec3}
*/
Transform.prototype.getFront = function(out) {
	return vec3.transformQuat(out || vec3.create(), Transform.FRONT, this.getGlobalRotation() );
}

/**
* returns the [0,1,0] vector in global space
* @method getTop
* @return {vec3}
*/
Transform.prototype.getTop = function(out) {
	return vec3.transformQuat(out || vec3.create(), Transform.UP, this.getGlobalRotation() );
}

/**
* returns the [1,0,0] vector in global space
* @method getRight
* @return {vec3}
*/
Transform.prototype.getRight = function(out) {
	return vec3.transformQuat(out || vec3.create(), Transform.RIGHT, this.getGlobalRotation() );
}

/**
* Multiplies a point by the local matrix (not global)
* If no destination is specified a new vector is created
* @method transformPoint
* @param {vec3} point
* @param {vec3} destination (optional)
*/
Transform.prototype.transformPoint = function(vec, dest) {
	dest = dest || vec3.create();
	if(this._must_update_matrix) this.updateMatrix();
	return mat4.multiplyVec3( dest, this._local_matrix, vec );
}


/**
* convert from local coordinates to global coordinates
* If no destination is specified a new vector is created
* @method transformPointGlobal
* @param {vec3} point
* @param {vec3} destination (optional)
*/
Transform.prototype.transformPointGlobal = function(vec, dest) {
	dest = dest || vec3.create();
	if(this._must_update_matrix) this.updateMatrix();
	return mat4.multiplyVec3( dest, this.getGlobalMatrixRef(), vec );
}

/**
* convert from local coordinates to global coordinates
* If no destination is specified a new vector is created
* @method localToGlobal
* @param {vec3} point
* @param {vec3} destination (optional)
*/
Transform.prototype.localToGlobal = Transform.prototype.transformPointGlobal;

/**
* convert from global coordinates to local coordinates
* If no destination is specified a new vector is created
* @method transformPoint
* @param {vec3} point
* @param {vec3} destination (optional)
*/
Transform.prototype.globalToLocal = function(vec, dest) {
	dest = dest || vec3.create();
	if(this._must_update_matrix) this.updateMatrix();
	var inv = mat4.invert( mat4.create(), this.getGlobalMatrixRef() );
	return mat4.multiplyVec3( dest, inv, vec );
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

Transform.prototype.localVectorToGlobal = Transform.prototype.transformVectorGlobal;

Transform.prototype.globalVectorToLocal = function(vec, dest) {
	var Q = this.getGlobalRotation();
	quat.invert(Q,Q);
	return vec3.transformQuat(dest || vec3.create(), vec, Q );
}


Transform.prototype.applyTransform = function( transform, center, is_global )
{
	//is local

	//apply translation
	vec3.add( this._position, this._position, transform._position );

	//apply rotation
	quat.multiply( this._rotation, this._rotation, transform._rotation );

	//apply scale
	vec3.multiply( this._scaling, this._scaling, transform._scaling );

	this._must_update_matrix = true; //matrix must be redone?
}



/**
* Applies the transformation using a matrix
* @method applyTransformMatrix
* @param {mat4} matrix with the transform
* @param {vec3} center different pivot [optional] if omited 0,0,0 will be used
* @param {bool} is_global (optional) tells if the transformation should be applied in global space or local space
*/
Transform.prototype.applyTransformMatrix = function(matrix, center, is_global)
{
	var M = matrix;

	if(center)
	{
		var T = mat4.setTranslation( mat4.create(), center);
		var inv_center = vec3.scale( vec3.create(), center, -1 );
		var iT = mat4.setTranslation( mat4.create(), inv_center);

		M = mat4.create();
		mat4.multiply( M, T, matrix );
		mat4.multiply( M, M, iT );
	}


	if(!this._parent)
	{
		if(is_global)
		{
			this.applyLocalTransformMatrix( M );
			return;
		}

		//is local
		this.applyLocalTransformMatrix( M );
		return;
	}

	/*
	//convert transform to local coordinates
	var GM = this.getGlobalMatrix();
	var temp_mat = mat4.multiply( mat4.create(), M, GM );

	var PGM = this._parent._global_matrix;
	var inv_pgm = mat4.invert( mat4.create(), PGM );

	mat4.multiply(temp_mat, inv_pgm, temp_mat );
	this.applyLocalTransformMatrix( temp_mat );
	//*/

	//*
	var GM = this.getGlobalMatrix();
	var PGM = this._parent._global_matrix;
	var temp = mat4.create();
	mat4.multiply( this._global_matrix, M, GM );

	mat4.invert(temp,PGM);
	mat4.multiply(this._local_matrix, temp, this._global_matrix );
	this.fromMatrix(this._local_matrix);
	//*/
}

//applies matrix to position, rotation and scale individually, doesnt take into account parents
Transform.prototype.applyLocalTransformMatrix = function( M )
{
	var temp = vec3.create();

	//apply translation
	vec3.transformMat4( this._position, this._position, M );

	//apply scale
	mat4.rotateVec3( temp, M, [1,0,0] );
	this._scaling[0] *= vec3.length( temp );
	mat4.rotateVec3( temp, M, [0,1,0] );
	this._scaling[1] *= vec3.length( temp );
	mat4.rotateVec3( temp, M, [0,0,1] );
	this._scaling[2] *= vec3.length( temp );

	//apply rotation
	var m = mat4.invert(mat4.create(), M);
	mat4.transpose(m, m);
	var m3 = mat3.fromMat4( mat3.create(), m);
	var q = quat.fromMat3(quat.create(), m3);
	quat.normalize(q, q);
	quat.multiply( this._rotation, q, this._rotation );

	this._must_update_matrix = true; //matrix must be redone?
	return;
}



/*
Transform.prototype.applyTransformMatrix = function(matrix, center, is_global)
{
	var M = matrix;

	if(center)
	{
		var T = mat4.setTranslation( mat4.create(), center);
		var inv_center = vec3.scale( vec3.create(), center, -1 );
		var iT = mat4.setTranslation( mat4.create(), inv_center);

		M = mat4.create();
		mat4.multiply( M, T, matrix );
		mat4.multiply( M, M, iT );
	}

	if(!this._parent)
	{
		if(is_global)
			mat4.multiply(this._local_matrix, M, this._local_matrix);
		else
			mat4.multiply(this._local_matrix, this._local_matrix, M);
		this.fromMatrix(this._local_matrix);
		mat4.copy(this._global_matrix, this._local_matrix); //no parent? then is the global too
		return;
	}

	var GM = this.getGlobalMatrix();
	var PGM = this._parent._global_matrix;
	var temp = mat4.create();
	mat4.multiply( this._global_matrix, M, GM );

	mat4.invert(temp,PGM);
	mat4.multiply(this._local_matrix, temp, this._global_matrix );
	this.fromMatrix(this._local_matrix);
}
*/

LS.registerComponent(Transform);
LS.Transform = Transform;
