//***** LIGHT ***************************

/**
* Light that contains the info about the camera
* @class Light
* @constructor
* @param {String} object to configure from
*/

function Light(o)
{
	/**
	* Position of the light
	* @property position
	* @type {[[x,y,z]]}
	* @default [0,0,0]
	*/
	this.position = vec3.create();
	/**
	* Position where the light is pointing at (target)
	* @property target
	* @type {[[x,y,z]]}
	* @default [0,0,1]
	*/
	this.target = vec3.fromValues(0,0,1);
	/**
	* Up vector
	* @property up
	* @type {[[x,y,z]]}
	* @default [0,1,0]
	*/
	this.up = vec3.fromValues(0,1,0);

	/**
	* Enabled
	* @property enabled
	* @type {Boolean}
	* @default true
	*/
	this.enabled = true;

	/**
	* Near distance
	* @property near
	* @type {Number}
	* @default 1
	*/
	this.near = 1;
	/**
	* Far distance
	* @property far
	* @type {Number}
	* @default 1000
	*/

	this.far = 1000;
	/**
	* Angle for the spot light inner apperture
	* @property angle
	* @type {Number}
	* @default 45
	*/
	this.angle = 45; //spot cone
	/**
	* Angle for the spot light outer apperture
	* @property angle_end
	* @type {Number}
	* @default 60
	*/
	this.angle_end = 60; //spot cone end

	this.use_diffuse = true;
	this.use_specular = true;
	this.linear_attenuation = false;
	this.range_attenuation = false;
	this.target_in_world_coords = false;
	this.att_start = 0;
	this.att_end = 1000;
	this.offset = 0;
	this.spot_cone = true;

	/**
	* The color of the light
	* @property color
	* @type {[[r,g,b]]}
	* @default [1,1,1]
	*/
	this.color = vec3.fromValues(1,1,1);
	/**
	* The intensity of the light
	* @property intensity
	* @type {Number}
	* @default 1
	*/
	this.intensity = 1;

	/**
	* If the light cast shadows
	* @property cast_shadows
	* @type {Boolean}
	* @default false
	*/
	this.cast_shadows = false;
	this.shadow_bias = 0.005;
	this.shadowmap_resolution = 1024;
	this.type = Light.OMNI;
	this.frustrum_size = 50; //ortho

	this.volume_visibility = 0;
	this.volume_radius = 1;
	this.volume_density = 1;

	//for caching purposes
	this._macros = {};
	this._uniforms = {};

	if(o) 
	{
		this.configure(o);
		if(o.shadowmap_resolution)
			this.shadowmap_resolution = parseInt(o.shadowmap_resolution); //LEGACY: REMOVE
	}
}

Light.OMNI = 1;
Light.SPOT = 2;
Light.DIRECTIONAL = 3;

Light.DEFAULT_SHADOWMAP_RESOLUTION = 1024;
Light.DEFAULT_DIRECTIONAL_FRUSTUM_SIZE = 50;

Light.prototype.onAddedToNode = function(node)
{
	if(!node.light) node.light = this;

	LEvent.bind(node, "collectLights", this.onCollectLights, this );

	if(this.volume_visibility)
	{
		LEvent.bind(node, "collectRenderInstances", this.onCollectInstances, this);
		this._volume_event = true;
	}
}

Light.prototype.onRemovedFromNode = function(node)
{
	if(node.light == this) delete node.light;
	this._volume_event = false;
}

Light.prototype.onCollectLights = function(e, lights)
{
	if(!this.enabled)
		return;

	//projective texture needs the light matrix to compute projection
	if(this.projective_texture)
		this.computeLightMatrices();

	//add to lights vector
	lights.push(this);

	if(this.volume_visibility && !this._volume_event)
	{
		LEvent.bind(this._root, "collectRenderInstances", this.onCollectInstances, this);
		this._volume_event = true;
	}

}

Light.prototype.onCollectInstances = function(e,instances)
{
	if(!this.enabled) return;

	if(!this.volume_visibility) 
	{
		LEvent.unbind(this._root, "collectRenderInstances", this.onCollectInstances, this);
		this._volume_event = false;
		return;
	}

	//sphere
	if(!this._mesh)
	{
		this._mesh = GL.Mesh.cube();
	}

	var RI = this._render_instance;
	if(!RI)
		this._render_instance = RI = new RenderInstance(this._root, this);

	RI.flags = RenderInstance.ALPHA; //reset and set
	
	//material
	var mat = this._material;
	if(!mat)
		mat = this._material = new Material({shader:"volumetric_light", blending: Material.ADDITIVE_BLENDING });
	vec3.copy( mat.color, this.color );
	mat.opacity = this.volume_visibility;
	RI.material = mat;

	//do not need to update
	RI.matrix.set( this._root.transform._global_matrix );
	mat4.multiplyVec3( RI.center, RI.matrix, this.position );
	mat4.scale( RI.matrix, RI.matrix, [this.volume_radius,this.volume_radius,this.volume_radius]);

	var volume_info = vec4.create();
	volume_info.set(RI.center);
	volume_info[3] = this.volume_radius * 0.5;
	RI.uniforms["u_volume_info"] = volume_info;
	RI.uniforms["u_volume_density"] = this.volume_density;
	
	RI.mesh = this._mesh;
	RI.primitive = gl.TRIANGLES;
	RI.flags = RI_CULL_FACE | RI_BLEND | RI_DEPTH_TEST;

	instances.push(RI);
}


Light._temp_matrix = mat4.create();
Light._temp2_matrix = mat4.create();
Light._temp3_matrix = mat4.create();
Light._temp_position = vec3.create();
Light._temp_target = vec3.create();
Light._temp_up = vec3.create();
Light._temp_front = vec3.create();

//parameters are if you want to store the result in different matrices
Light.prototype.computeLightMatrices = function(view_matrix, projection_matrix, viewprojection_matrix)
{
	/*
	var position = vec3.set(this.position, Light._temp_position );
	var target = vec3.set(this.target, Light._temp_target);
	var up = vec3.set(this.up, Light._temp_up);
	*/

	var position = this.getPosition(Light._temp_position);
	var target = this.getTarget(Light._temp_target);
	var up = this.getUp(Light._temp_up);
	var front = this.getFront(Light._temp_front);

	if( Math.abs( vec3.dot(front,up) ) > 0.999 ) vec3.set(up,0,0,1); //avoid problems when the light comes straight from [0,1,0]

	if(!projection_matrix) projection_matrix = Light._temp_matrix;
	if(!view_matrix) view_matrix = Light._temp2_matrix;
	if(!viewprojection_matrix) viewprojection_matrix = Light._temp3_matrix;

	var frustum_size = this.frustrum_size || Light.DEFAULT_DIRECTIONAL_FRUSTUM_SIZE;
	if(this.type == Light.DIRECTIONAL)
		mat4.ortho(projection_matrix, frustum_size*-0.5, frustum_size*0.5, frustum_size*-0.5, frustum_size*0.5, this.near, this.far);
	else
		mat4.perspective(projection_matrix, (this.angle_end || 45) * DEG2RAD, 1, this.near, this.far);

	mat4.lookAt(view_matrix, position, target, up );

	//adjust subpixel shadow movements to avoid flickering
	if(this.type == Light.DIRECTIONAL && this.cast_shadows && this.enabled)
	{
		var shadowmap_resolution = this.shadowmap_resolution || Light.DEFAULT_SHADOWMAP_RESOLUTION;
		var texelSize = frustum_size / shadowmap_resolution;
		view_matrix[12] = Math.floor( view_matrix[12] / texelSize) * texelSize;
		view_matrix[13] = Math.floor( view_matrix[13] / texelSize) * texelSize;
	}
	mat4.multiply(viewprojection_matrix, projection_matrix, view_matrix);

	//save it
	if( !this._lightMatrix ) this._lightMatrix = mat4.create();
	mat4.copy( this._lightMatrix, viewprojection_matrix );
}

Light.prototype.serialize = function()
{
	this.position = vec3.toArray(this.position);
	this.target = vec3.toArray(this.target);
	this.color = vec3.toArray(this.color);
	return cloneObject(this);
}

Light.prototype.configure = function(o)
{
	LS.cloneObject(o,this);
}

Light.prototype.getPosition = function(p)
{
	if(this._root && this._root.transform) return this._root.transform.transformPointGlobal(this.position, p || vec3.create() );
	return vec3.clone(this.position);
}

Light.prototype.getTarget = function(p)
{
	if(this._root && this._root.transform && !this.target_in_world_coords) 
		return this._root.transform.transformPointGlobal(this.target, p || vec3.create() );
	return vec3.clone(this.target);
}

Light.prototype.getUp = function(p)
{
	if(this._root && this._root.transform) return this._root.transform.transformVector(this.up, p || vec3.create() );
	return vec3.clone(this.up);
}

Light.prototype.getFront = function(p) {
	var front = p || vec3.create();
	vec3.subtract(front, this.getPosition(), this.getTarget() ); //front is reversed?
	//vec3.subtract(front, this.getTarget(), this.getPosition() ); //front is reversed?
	vec3.normalize(front, front);
	return front;
}

Light.prototype.getResources = function (res)
{
	if(this.projective_texture)
		res[ this.projective_texture ] = Texture;
	return res;
}

LS.registerComponent(Light);
LS.Light = Light;