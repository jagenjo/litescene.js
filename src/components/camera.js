// ******* CAMERA **************************

/**
* Camera that contains the info about a camera
* @class Camera
* @namespace LS.Components
* @constructor
* @param {String} object to configure from
*/

function Camera(o)
{
	this.enabled = true;

	this._type = Camera.PERSPECTIVE;

	this._eye = vec3.fromValues(0,100, 100); //change to position
	this._center = vec3.fromValues(0,0,0);	//change to target
	this._up = vec3.fromValues(0,1,0);
	
	this._near = 1;
	this._far = 1000;

	this._ortho = new Float32Array([-1,1,-1,1]);

	this._aspect = 1.0;
	this._fov = 45; //persp
	this._frustum_size = 50; //ortho

	this._viewport = new Float32Array([0,0,1,1]);

	this._view_matrix = mat4.create();
	this._projection_matrix = mat4.create();
	this._viewprojection_matrix = mat4.create();
	this._model_matrix = mat4.create(); //inverse of viewmatrix (used for local vectors)

	this._to_texture = ""; //name
	this._texture_size = 512;

	if(o) this.configure(o);
	//this.updateMatrices(); //done by configure

	//LEvent.bind(this,"cameraEnabled", this.onCameraEnabled.bind(this));
}

Camera.icon = "mini-icon-camera.png";

Camera.PERSPECTIVE = 1;
Camera.ORTHOGRAPHIC = 2;
Camera.ORTHO2D = 3;

/*
Camera.prototype.onCameraEnabled = function(e,options)
{
	if(this.flip_x)
		options.reverse_backfacing = !options.reverse_backfacing;
}
*/

/**
* Camera type, could be Camera.PERSPECTIVE or Camera.ORTHOGRAPHIC
* @property type {vec3}
* @default Camera.PERSPECTIVE;
*/
Object.defineProperty( Camera.prototype, "type", {
	get: function() {
		return this._type;
	},
	set: function(v) {
		if(	this._type != v)
			this._dirty_matrices = true;
		this._type = v;
	}
});

/**
* The position of the camera (in local space form the node)
* @property eye {vec3}
* @default [0,100,100]
*/
Object.defineProperty( Camera.prototype, "eye", {
	get: function() {
		return this._eye;
	},
	set: function(v) {
		this._eye.set(v);
		this._dirty_matrices = true;
	}
});

/**
* The center where the camera points (in node space)
* @property center {vec3}
* @default [0,0,0]
*/
Object.defineProperty( Camera.prototype, "center", {
	get: function() {
		return this._center;
	},
	set: function(v) {
		this._center.set(v);
		this._dirty_matrices = true;
	}
});

/**
* The up vector of the camera (in node space)
* @property up {vec3}
* @default [0,1,0]
*/
Object.defineProperty( Camera.prototype, "up", {
	get: function() {
		return this._up;
	},
	set: function(v) {
		this._up.set(v);
		this._dirty_matrices = true;
	}
});

/**
* The near plane
* @property near {number}
* @default 1
*/
Object.defineProperty( Camera.prototype, "near", {
	get: function() {
		return this._near;
	},
	set: function(v) {
		if(	this._near != v)
			this._dirty_matrices = true;
		this._near = v;
	}
});

/**
* The far plane
* @property far {number}
* @default 1000
*/
Object.defineProperty( Camera.prototype, "far", {
	get: function() {
		return this._far;
	},
	set: function(v) {
		if(	this._far != v)
			this._dirty_matrices = true;
		this._far = v;
	}
});

/**
* The camera aspect ratio
* @property aspect {number}
* @default 1
*/
Object.defineProperty( Camera.prototype, "aspect", {
	get: function() {
		return this._aspect;
	},
	set: function(v) {
		if(	this._aspect != v)
			this._dirty_matrices = true;
		this._aspect = v;
	}
});
/**
* The field of view in degrees
* @property fov {number}
* @default 45
*/
Object.defineProperty( Camera.prototype, "fov", {
	get: function() {
		return this._fov;
	},
	set: function(v) {
		if(	this._fov != v)
			this._dirty_matrices = true;
		this._fov  = v;
	}
});

/**
* The frustum size when working in ORTHOGRAPHIC
* @property frustum_size {number}
* @default 50
*/

Object.defineProperty( Camera.prototype, "frustum_size", {
	get: function() {
		return this._frustum_size;
	},
	set: function(v) {
		if(	this._frustum_size != v)
			this._dirty_matrices = true;
		this._frustum_size  = v;
	}
});


Camera.prototype.onAddedToNode = function(node)
{
	if(!node.camera)
		node.camera = this;
	LEvent.bind(node, "collectCameras", this.onCollectCameras, this );
}

Camera.prototype.onRemovedFromNode = function(node)
{
	if(node.camera == this)
		delete node.camera;

}

Camera.prototype.onCollectCameras = function(e, cameras)
{
	if(!this.enabled)
		return;
	cameras.push(this);
}

/**
* 
* @method lookAt
* @param {vec3} eye
* @param {vec3} center
* @param {vec3} up
*/
Camera.prototype.lookAt = function(eye,center,up)
{
	vec3.copy(this._eye, eye);
	vec3.copy(this._center, center);
	vec3.copy(this._up,up);
	this._dirty_matrices = true;
}

/**
* Update matrices according to the eye,center,up,fov,aspect,...
* @method updateMatrices
*/
Camera.prototype.updateMatrices = function()
{
	if(this.type == Camera.ORTHOGRAPHIC)
		mat4.ortho(this._projection_matrix, -this._frustum_size*this._aspect*0.5, this._frustum_size*this._aspect*0.5, -this._frustum_size*0.5, this._frustum_size*0.5, this._near, this._far);
	else if (this.type == Camera.ORTHO2D)
		mat4.ortho(this._projection_matrix, this._ortho[0], this._ortho[1], this._ortho[2], this._ortho[3], this._near, this._far);
	else
		mat4.perspective(this._projection_matrix, this._fov * DEG2RAD, this._aspect, this._near, this._far);

	//if (this.type != Camera.ORTHO2D)
	mat4.lookAt(this._view_matrix, this._eye, this._center, this._up);

	/*
	if(this.flip_x) //used in reflections
	{
		//mat4.scale(this._projection_matrix,this._projection_matrix, [-1,1,1]);
	};
	*/
	//if(this._root && this._root.transform)

	mat4.multiply(this._viewprojection_matrix, this._projection_matrix, this._view_matrix );
	mat4.invert(this._model_matrix, this._view_matrix );
	this._dirty_matrices = false;
}

Camera.prototype.getModelMatrix = function(m)
{
	m = m || mat4.create();
	if(this._dirty_matrices)
		this.updateMatrices();
	return mat4.copy( m, this._model_matrix );
}

Camera.prototype.getViewMatrix = function(m)
{
	m = m || mat4.create();
	if(this._dirty_matrices)
		this.updateMatrices();
	return mat4.copy( m, this._view_matrix );
}

Camera.prototype.getProjectionMatrix = function(m)
{
	m = m || mat4.create();
	if(this._dirty_matrices)
		this.updateMatrices();
	return mat4.copy( m, this._projection_matrix );
}

Camera.prototype.getViewProjectionMatrix = function(m)
{
	m = m || mat4.create();
	if(this._dirty_matrices)
		this.updateMatrices();
	return mat4.copy( m, this._viewprojection_matrix );
}

Camera.prototype.updateVectors = function(model)
{
	var front = vec3.subtract(vec3.create(), this._center, this._eye);
	var dist = vec3.length(front);
	this._eye = mat4.multiplyVec3(vec3.create(), model, vec3.create() );
	this._center = mat4.multiplyVec3(vec3.create(), model, vec3.fromValues(0,0,-dist));
	this._up = mat4.rotateVec3(vec3.create(), model, vec3.fromValues(0,1,0));
	this.updateMatrices();
}

Camera.prototype.getLocalPoint = function(v, dest)
{
	dest = dest || vec3.create();
	if(this._dirty_matrices)
		this.updateMatrices();
	var temp = this._model_matrix; //mat4.create();
	//mat4.invert( temp, this._view_matrix );
	if(this._root && this._root.transform)
		mat4.multiply( temp, temp, this._root.transform.getGlobalMatrixRef() );
	return mat4.multiplyVec3(dest, temp, v );
}

Camera.prototype.getLocalVector = function(v, dest)
{
	dest = dest || vec3.create();
	if(this._dirty_matrices)
		this.updateMatrices();
	var temp = this._model_matrix; //mat4.create();
	//mat4.invert( temp, this._view_matrix );
	if(this._root && this._root.transform)
		mat4.multiply(temp, temp, this._root.transform.getGlobalMatrixRef() );
	return mat4.rotateVec3(dest, temp, v );
}

Camera.prototype.getEye = function()
{
	var eye = vec3.clone( this._eye );
	if(this._root && this._root.transform && this._root._parent)
		return mat4.multiplyVec3(eye, this._root.transform.getGlobalMatrixRef(), eye );
	return eye;
}

Camera.prototype.getFront = function()
{
	var front = vec3.sub( vec3.create(), this._center, this._eye ); 
	if(this._root && this._root.transform && this._root._parent)
		return mat4.rotateVec3(front, this._root.transform.getGlobalMatrixRef(), front );
	return vec3.normalize(front, front);
}


Camera.prototype.getUp = function()
{
	var up = vec3.clone( this._up );
	if(this._root && this._root.transform && this._root._parent)
		return mat4.rotateVec3( up, this._root.transform.getGlobalMatrixRef(), up );
	return up;
}

Camera.prototype.getTop = function()
{
	var front = vec3.sub( vec3.create(), this._center, this._eye ); 
	var right = vec3.cross( vec3.create(), this._up, front );
	var top = vec3.cross( vec3.create(), front, right );
	vec3.normalize(top,top);

	if(this._root && this._root.transform && this._root._parent)
		return mat4.rotateVec3( top, this._root.transform.getGlobalMatrixRef(), top );
	return top;
}


Camera.prototype.getCenter = function()
{
	var center = vec3.clone( this._center );
	if(this._root && this._root.transform && this._root._parent)
		return mat4.multiplyVec3(center, this._root.transform.getGlobalMatrixRef(), center );
	return center;
}

Camera.prototype.setEye = function(v)
{
	return vec3.copy( this._eye, v );
}

Camera.prototype.setCenter = function(v)
{
	return vec3.copy( this._center, v );
}

/*
//in global coordinates (when inside a node)
Camera.prototype.getGlobalFront = function(dest)
{
	dest = dest || vec3.create();
	vec3.subtract( dest, this._center, this._eye);
	vec3.normalize(dest, dest);
	if(this._root && this._root.transform)
		this._root.transform.transformVector(dest, dest);
	return dest;
}

Camera.prototype.getGlobalTop = function(dest)
{
	dest = dest || vec3.create();
	vec3.subtract( dest, this._center, this._eye);
	vec3.normalize(dest, dest);
	var right = vec3.cross( vec3.create(), dest, this._up );
	vec3.cross( dest, dest, right );
	vec3.scale( dest, dest, -1.0 );

	if(this._root && this._root.transform)
		this._root.transform.transformVector(dest, dest);
	return dest;
}
*/

Camera.prototype.setOrthographic = function( left,right, bottom,top, near, far )
{
	this._near = near;
	this._far = far;
	this._ortho.set([left,right,bottom,top]);
	this._type = Camera.ORTHO2D;
	this._dirty_matrices = true;
}

Camera.prototype.move = function(v)
{
	vec3.add(this._center, this._center, v);
	vec3.add(this._eye, this._eye, v);
	this._dirty_matrices = true;
}


Camera.prototype.rotate = function(angle_in_deg, axis, in_local_space)
{
	if(in_local_space)
		this.getLocalVector(axis, axis);

	var R = quat.setAxisAngle( quat.create(), axis, angle_in_deg * 0.0174532925 );
	var front = vec3.subtract( vec3.create(), this._center, this._eye );

	vec3.transformQuat(front, front, R );
	vec3.add(this._center, this._eye, front);
	this._dirty_matrices = true;
}

Camera.prototype.orbit = function(angle_in_deg, axis, center)
{
	center = center || this._center;
	var R = quat.setAxisAngle( quat.create(), axis, angle_in_deg * 0.0174532925 );
	var front = vec3.subtract( vec3.create(), this._eye, center );
	vec3.transformQuat(front, front, R );
	vec3.add(this._eye, center, front);
	this._dirty_matrices = true;
}

Camera.prototype.orbitDistanceFactor = function(f, center)
{
	center = center || this._center;
	var front = vec3.subtract( vec3.create(), this._eye, center );
	vec3.scale(front, front, f);
	vec3.add(this._eye, center, front);
	this._dirty_matrices = true;
}

Camera.prototype.setOrientation = function(q, use_oculus)
{
	var center = this.getCenter();
	var eye = this.getEye();
	var up = [0,1,0];

	var to_target = vec3.sub( vec3.create(), center, eye );
	var dist = vec3.length( to_target );

	var front = null;
	front = vec3.fromValues(0,0,-dist);

	if(use_oculus)
	{
		vec3.rotateY( front, front, Math.PI * -0.5 );
		vec3.rotateY( up, up, Math.PI * -0.5 );
	}

	vec3.transformQuat(front, front, q);
	vec3.transformQuat(up, up, q);

	if(use_oculus)
	{
		vec3.rotateY( front, front, Math.PI * 0.5 );
		vec3.rotateY( up, up, Math.PI * 0.5 );
	}

	this.center = vec3.add( vec3.create(), eye, front );
	this.up = up;

	this._dirty_matrices = true;
}

Camera.prototype.setEulerAngles = function(yaw,pitch,roll)
{
	var q = quat.create();
	quat.fromEuler(q, [yaw, pitch, roll] );
	this.setOrientation(q);
}


Camera.prototype.fromViewmatrix = function(mat)
{
	var M = mat4.invert( mat4.create(), mat );
	this.eye = vec3.transformMat4(vec3.create(),vec3.create(),M);
	this.center = vec3.transformMat4(vec3.create(),[0,0,-1],M);
	this.up = mat4.rotateVec3( vec3.create(), M, [0,1,0] );
	this._dirty_matrices = true;
}


/**
* Applies the camera transformation (from eye,center,up) to the node.
* @method updateNodeTransform
*/

/* DEPRECATED
Camera.prototype.updateNodeTransform = function()
{
	if(!this._root) return;
	this._root.transform.fromMatrix( this.getModel() );
}
*/

/**
* Converts from 3D to 2D
* @method project
* @param {vec3} vec 3D position we want to proyect to 2D
* @param {Array[4]} viewport viewport coordinates (if omited full viewport is used)
* @param {vec3} result where to store the result, if omited it is created
* @return {vec3} the coordinates in 2D
*/

Camera.prototype.project = function( vec, viewport, result )
{
	viewport = viewport ||  gl.getParameter(gl.VIEWPORT);
	if( this._dirty_matrices )
		this.updateMatrices();
	var result = mat4.multiplyVec3(result || vec3.create(), this._viewprojection_matrix, vec );
	result[0] /= result[2];
	result[1] /= result[2];
	vec3.set(result, (result[0]+1) * (viewport[2]*0.5) + viewport[0], (result[1]+1) * (viewport[3]*0.5) + viewport[1], result[2] );
	return result;
}

/**
* Converts from 2D to 3D
* @method unproject
* @param {vec3} vec 2D position we want to proyect to 3D
* @param {Array[4]} viewport viewport coordinates (if omited full viewport is used)
* @param {vec3} result where to store the result, if omited it is created
* @return {vec3} the coordinates in 2D
*/

Camera.prototype.unproject = function( vec, viewport, result )
{
	viewport = viewport ||  gl.getParameter(gl.VIEWPORT);
	if( this._dirty_matrices )
		this.updateMatrices();
	return gl.unproject(result || vec3.create(), vec, this._view_matrix, this._projection_matrix, viewport );
}

Camera.prototype.getRayInPixel = function(x,y, viewport)
{
	viewport = viewport ||  gl.getParameter(gl.VIEWPORT);
	if( this._dirty_matrices )
		this.updateMatrices();
	var eye = this.getEye();
	var pos = vec3.unproject(vec3.create(), [x,y,1], this._view_matrix, this._projection_matrix, viewport );

	if(this.type == Camera.ORTHOGRAPHIC)
		eye = vec3.unproject(vec3.create(), [x,y,0], this._view_matrix, this._projection_matrix, viewport );

	var dir = vec3.subtract( vec3.create(), pos, eye );
	vec3.normalize(dir, dir);
	return { start: eye, direction: dir };
}

Camera.prototype.configure = function(o)
{
	if(o.enabled != null) this.enabled = o.enabled;
	if(o.type != null) this._type = o.type;

	if(o.eye != null) this._eye.set(o.eye);
	if(o.center != null) this._center.set(o.center);
	if(o.up != null) this._up.set(o.up);

	if(o.near != null) this._near = o.near;
	if(o.far != null) this._far = o.far;
	if(o.fov != null) this._fov = o.fov;
	if(o.aspect != null) this._aspect = o.aspect;
	if(o.frustum_size != null) this._frustum_size = o.frustum_size;
	if(o.viewport != null) this._viewport.set( o.viewport );

	this.updateMatrices();
}

Camera.prototype.serialize = function()
{
	var o = {
		enabled: this.enabled,
		type: this._type,
		eye: vec3.toArray(this._eye),
		center: vec3.toArray(this._center),
		up: vec3.toArray(this._up),
		near: this._near,
		far: this._far,
		fov: this._fov,
		aspect: this._aspect,
		frustum_size: this._frustum_size,
		viewport: toArray( this._viewport ),
		to_texture: this._to_texture,
		texture_size: this._texture_size
	};

	//clone
	return o;
}

LS.registerComponent(Camera);
LS.Camera = Camera;