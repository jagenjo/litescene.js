//***** LIGHT ***************************

/**
* Light that contains the info about the camera
* @class Light
* @constructor
* @param {Object} object to configure from
*/

function Light(o)
{
	/**
	* Position of the light in world space
	* @property position
	* @type {[[x,y,z]]}
	* @default [0,0,0]
	*/
	this.position = vec3.create();
	/**
	* Position where the light is pointing at (in world space)
	* @property target
	* @type {[[x,y,z]]}
	* @default [0,0,1]
	*/
	this.target = vec3.fromValues(0,0,1);
	/**
	* Up vector (in world coordinates)
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

	this.constant_diffuse = false;
	this.use_specular = true;
	this.linear_attenuation = false;
	this.range_attenuation = false;
	this.att_start = 0;
	this.att_end = 1000;
	this.offset = 0;
	this.spot_cone = true;

	//use target (when attached to node)
	this.use_target = false;

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
	this.frustum_size = 50; //ortho

	//vectors in world space
	this._front = vec3.clone( Light.FRONT_VECTOR );
	this._right = vec3.clone( Light.RIGHT_VECTOR );
	this._top = vec3.clone( Light.UP_VECTOR );

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

//do not change
Light.FRONT_VECTOR = new Float32Array([0,0,-1]); //const
Light.RIGHT_VECTOR = new Float32Array([1,0,0]); //const
Light.UP_VECTOR = new Float32Array([0,1,0]); //const

Light.OMNI = 1;
Light.SPOT = 2;
Light.DIRECTIONAL = 3;

Light.DEFAULT_SHADOWMAP_RESOLUTION = 1024;
Light.DEFAULT_DIRECTIONAL_FRUSTUM_SIZE = 50;

Light.prototype.onAddedToNode = function(node)
{
	if(!node.light) node.light = this;

	LEvent.bind(node, "collectLights", this.onCollectLights, this );
}

Light.prototype.onRemovedFromNode = function(node)
{
	if(node.light == this) delete node.light;
	delete ResourcesManager.textures[":shadowmap_" + this._uid ];
}

Light.prototype.onCollectLights = function(e, lights)
{
	if(!this.enabled)
		return;

	//add to lights vector
	lights.push(this);
}

Light._temp_matrix = mat4.create();
Light._temp2_matrix = mat4.create();
Light._temp3_matrix = mat4.create();
Light._temp_position = vec3.create();
Light._temp_target = vec3.create();
Light._temp_up = vec3.create();
Light._temp_front = vec3.create();

Light.prototype.updateLightCamera = function()
{
	if(!this._light_camera)
		this._light_camera = new Camera();

	var camera = this._light_camera;
	camera.eye = this.getPosition(Light._temp_position);
	camera.center = this.getTarget(Light._temp_target);

	var up = this.getUp(Light._temp_up);
	var front = this.getFront(Light._temp_front);
	if( Math.abs( vec3.dot(front,up) ) > 0.999 ) 
		vec3.set(up,0,0,1);
	camera.up = up;

	camera.type = this.type == Light.DIRECTIONAL ? Camera.ORTHOGRAPHIC : Camera.PERSPECTIVE;

	camera._frustum_size = this.frustum_size || Light.DEFAULT_DIRECTIONAL_FRUSTUM_SIZE;
	camera.near = this.near;
	camera.far = this.far;
	camera.fov = (this.angle_end || 45); //fov is in degrees

	camera.updateMatrices();
	this._light_matrix = camera._viewprojection_matrix;

	/* ALIGN TEXEL OF SHADOWMAP IN DIRECTIONAL
	if(this.type == Light.DIRECTIONAL && this.cast_shadows && this.enabled)
	{
		var shadowmap_resolution = this.shadowmap_resolution || Light.DEFAULT_SHADOWMAP_RESOLUTION;
		var texelSize = frustum_size / shadowmap_resolution;
		view_matrix[12] = Math.floor( view_matrix[12] / texelSize) * texelSize;
		view_matrix[13] = Math.floor( view_matrix[13] / texelSize) * texelSize;
	}
	*/	

	return camera;
}

Light.prototype.getLightCamera = function()
{
	if(!this._light_camera)
		this.updateLightCamera();
	return this._light_camera;
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

Light.prototype.updateVectors = function()
{
	if(!this._root || !this._root.transform) 
	{
		//position, target and up are already valid
		 //front
		 //vec3.subtract(this._front, this.position, this.target ); //positive z front
		 vec3.subtract(this._front, this.target, this.position ); //positive z front
		 vec3.normalize(this._front,this._front);
		 //right
		 vec3.normalize( temp_v3, this.up );
		 vec3.cross( this._right, this._front, temp_v3 );
		 //top
		 vec3.cross( this._top, this._right, this._front );
		 return;
	}

	var mat = this._root.transform.getGlobalMatrixRef();
	//position
	mat4.getTranslation( this.position, mat);
	//target
	if (!this.use_target)
		mat4.multiplyVec3( this.target, mat, Light.FRONT_VECTOR ); //right in front of the object
	//up
	mat4.multiplyVec3( this.up, mat, Light.UP_VECTOR ); //right in front of the object

	//vectors
	mat4.rotateVec3( this._front, mat, Light.FRONT_VECTOR ); 
	mat4.rotateVec3( this._right, mat, Light.RIGHT_VECTOR ); 
	vec3.copy( this._top, this.up ); 
}

Light.prototype.getPosition = function(p)
{
	//if(this._root && this._root.transform) return this._root.transform.transformPointGlobal(this.position, p || vec3.create() );
	if(this._root && this._root.transform) return this._root.transform.getGlobalPosition();
	return vec3.clone(this.position);
}

Light.prototype.getTarget = function(p)
{
	//if(this._root && this._root.transform && !this.use_target) 
	//	return this._root.transform.transformPointGlobal(this.target, p || vec3.create() );
	if(this._root && this._root.transform && !this.use_target) 
		return this._root.transform.transformPointGlobal( Light.FRONT_VECTOR , p || vec3.create() );
	return vec3.clone(this.target);
}

Light.prototype.getUp = function(p)
{
	if(this._root && this._root.transform) return this._root.transform.transformVector( Light.UP_VECTOR , p || vec3.create() );
	return vec3.clone(this.up);
}

Light.prototype.getFront = function(p) {
	var front = p || vec3.create();
	vec3.subtract(front, this.getPosition(), this.getTarget() ); //front is reversed?
	//vec3.subtract(front, this.getTarget(), this.getPosition() ); //front is reversed?
	vec3.normalize(front, front);
	return front;
}

Light.prototype.getLightRotationMatrix = function()
{

}

Light.prototype.getResources = function (res)
{
	if(this.projective_texture)
		res[ this.projective_texture ] = Texture;
	return res;
}

Light.prototype.onResourceRenamed = function (old_name, new_name, resource)
{
	if(this.projective_texture == old_name)
		this.projective_texture = new_name;
}


Light.prototype.prepare = function( render_options )
{
	var uniforms = this._uniforms;
	var macros = this._macros;
	wipeObject(macros); //delete all properties (I dont like to generate garbage)

	//projective texture needs the light matrix to compute projection
	if(this.projective_texture || this.cast_shadows || this.average_texture)
		this.updateLightCamera();

	this.updateVectors();

	//PREPARE MACROS
	if(this.type == Light.DIRECTIONAL)
		macros.USE_DIRECTIONAL_LIGHT = "";
	else if(this.type == Light.SPOT)
		macros.USE_SPOT_LIGHT = "";
	if(this.spot_cone)
		macros.USE_SPOT_CONE = "";
	if(this.linear_attenuation)
		macros.USE_LINEAR_ATTENUATION = "";
	if(this.range_attenuation)
		macros.USE_RANGE_ATTENUATION = "";
	if(this.offset > 0.001)
		macros.USE_LIGHT_OFFSET = "";

	if(this.projective_texture)
	{
		var light_projective_texture = this.projective_texture.constructor === String ? ResourcesManager.textures[this.projective_texture] : this.projective_texture;
		if(light_projective_texture)
		{
			macros.USE_PROJECTIVE_LIGHT = "";
			if(light_projective_texture.texture_type == gl.TEXTURE_CUBE_MAP)
				macros.USE_PROJECTIVE_LIGHT_CUBEMAP = "";
		}
	}

	if(this.average_texture)
	{
		var light_average_texture = this.average_texture.constructor === String ? ResourcesManager.textures[ this.average_texture ] : this.average_texture;
		if(light_average_texture)
			macros.USE_TEXTURE_AVERAGE_LIGHT = "";
	}

	//if(vec3.squaredLength( light.color ) < 0.001 || node.flags.ignore_lights)
	//	macros.USE_IGNORE_LIGHT = "";

	//PREPARE UNIFORMS
	if(this.type == Light.DIRECTIONAL || this.type == Light.SPOT)
		uniforms.u_light_front = this._front;
	if(this.type == Light.SPOT)
		uniforms.u_light_angle = [ this.angle * DEG2RAD, this.angle_end * DEG2RAD, Math.cos( this.angle * DEG2RAD * 0.5 ), Math.cos( this.angle_end * DEG2RAD * 0.5 ) ];

	uniforms.u_light_pos = this.position;
	uniforms.u_light_color = vec3.scale( uniforms.u_light_color || vec3.create(), this.color, this.intensity );
	uniforms.u_light_att = [this.att_start,this.att_end];
	uniforms.u_light_offset = this.offset;

	//generate shadowmaps
	if( render_options.update_shadowmaps && !render_options.shadows_disabled && !render_options.lights_disabled && !render_options.low_quality )
		this.generateShadowmap( render_options );
	if(this._shadowmap && !this.cast_shadows)
		this._shadowmap = null; //remove shadowmap

	this._uniforms = uniforms;
}

// gets the macros of the light (some macros have to be computed now because they depend not only on the light, also on the node or material)
Light.prototype.getMacros = function(instance, render_options)
{
	var macros = this._macros;

	var use_shadows = this.cast_shadows && this._shadowmap && this._light_matrix != null && !render_options.shadows_disabled;

	if(!this.constant_diffuse && !instance.material.constant_diffuse)
		macros.USE_DIFFUSE_LIGHT = "";
	else
		delete macros["USE_DIFFUSE_LIGHT"];

	if(this.use_specular && instance.material.specular_factor > 0)
		macros.USE_SPECULAR_LIGHT = "";	
	else
		delete macros["USE_SPECULAR_LIGHT"];

	if(use_shadows && instance.flags & RI_RECEIVE_SHADOWS)
	{
		macros.USE_SHADOW_MAP = "";
		if(this._shadowmap && this._shadowmap.texture_type == gl.TEXTURE_CUBE_MAP)
			macros.USE_SHADOW_CUBEMAP = "";
		if(this.hard_shadows || macros.USE_SHADOW_CUBEMAP != null)
			macros.USE_HARD_SHADOWS = "";
		macros.SHADOWMAP_OFFSET = "";
	}
	else
		delete macros["USE_SHADOW_MAP"];

	return macros;
}

Light.prototype.getUniforms = function( instance, render_options )
{
	var uniforms = this._uniforms;
	var use_shadows = this.cast_shadows && 
					instance.flags & RI_RECEIVE_SHADOWS && 
					this._shadowmap && this._light_matrix != null && 
					!render_options.shadows_disabled;

	//compute the light mvp
	if(this._light_matrix)
		uniforms.u_lightMatrix = mat4.multiply( uniforms.u_lightMatrix || mat4.create(), this._light_matrix, instance.matrix );

	//projective texture
	if(this.projective_texture)
	{
		var light_projective_texture = this.projective_texture.constructor === String ? ResourcesManager.textures[this.projective_texture] : this.projective_texture;
		if(light_projective_texture)
		{
			uniforms.light_texture = light_projective_texture.bind(11); //fixed slot
			//if(light_projective_texture.texture_type == gl.TEXTURE_CUBE_MAP)
			//	uniforms.light_rotation_matrix = 
		}
	}
	else
		delete uniforms["light_texture"];

	//average texture
	if(this.average_texture)
	{
		var light_average_texture = this.average_texture.constructor === String ? ResourcesManager.textures[ this.average_texture ] : this.average_texture;
		if(light_average_texture)
			uniforms.light_average_texture = light_average_texture.bind(12); //fixed slot
	}
	else
		delete uniforms["light_average_texture"];

	//use shadows?
	if(use_shadows)
	{
		uniforms.u_shadow_params = [ 1.0 / this._shadowmap.width, this.shadow_bias, this.near, this.far ];
		uniforms.shadowmap = this._shadowmap.bind(10); //fixed slot
	}
	else
	{
		delete uniforms["u_shadow_params"];
		delete uniforms["shadowmap"];
	}

	return uniforms;
}

Light.prototype.generateShadowmap = function (render_options)
{
	if(!this.cast_shadows)
		return;

	var renderer = render_options.current_renderer;

	//create the texture
	var shadowmap_resolution = this.shadowmap_resolution;
	if(!shadowmap_resolution)
		shadowmap_resolution = Light.DEFAULT_SHADOWMAP_RESOLUTION;

	var tex_type = this.type == Light.OMNI ? gl.TEXTURE_CUBE_MAP : gl.TEXTURE_2D;
	if(this._shadowmap == null || this._shadowmap.width != shadowmap_resolution || this._shadowmap.texture_type != tex_type)
	{
		this._shadowmap = new GL.Texture( shadowmap_resolution, shadowmap_resolution, { texture_type: tex_type, format: gl.RGBA, magFilter: gl.NEAREST, minFilter: gl.NEAREST });
		ResourcesManager.textures[":shadowmap_" + this._uid ] = this._shadowmap; //debug
	}

	//render the scene inside the texture
	if(this.type == Light.OMNI) //render to cubemap
	{
		render_options.current_pass = "shadow";
		render_options.is_shadowmap = true;
		this._shadowmap.unbind(); 
		renderer.renderToCubemap( this.getPosition(), shadowmap_resolution, this._shadowmap, render_options, this.near, this.far );
		render_options.is_shadowmap = false;
	}
	else //DIRECTIONAL and SPOTLIGHT
	{
		var shadow_camera = this.getLightCamera();
		renderer.enableCamera( shadow_camera, render_options, true );

		// Render the object viewed from the light using a shader that returns the
		// fragment depth.
		this._shadowmap.unbind(); 
		renderer._current_target = this._shadowmap;
		this._shadowmap.drawTo(function() {

			gl.clearColor(0, 0, 0, 1);
			//gl.clearColor(1, 1, 1, 1);
			gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

			render_options.current_pass = "shadow";
			render_options.is_shadowmap = true;

			//RENDER INSTANCES in the shadowmap
			renderer.renderInstances( render_options );
			render_options.is_shadowmap = false;
		});
		renderer._current_target = null;
	}
}

//Mostly used for gizmos
Light.prototype.getTransformMatrix = function( element )
{
	if( this._root && this._root.transform )
		return null; //use the node transform

	var p = null;
	if (element == "target")
		p = this.target;
	else
		p = this.position;

	var T = mat4.create();
	mat4.setTranslation( T, p );
	return T;
}

Light.prototype.applyTransformMatrix = function( matrix, center, element )
{
	if( this._root && this._root.transform )
		return false; //ignore transform

	var p = null;
	if (element == "target")
		p = this.target;
	else
		p = this.position;

	mat4.multiplyVec3( p, matrix, p );
	return true;
}


LS.registerComponent(Light);
LS.Light = Light;