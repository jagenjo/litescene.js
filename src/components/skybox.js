/**
* Skybox allows to render a cubemap or polar image as a background for the 3D scene
* @class Skybox
* @namespace LS.Components
* @constructor
* @param {Object} object [optional] to configure from
*/

function Skybox(o)
{
	this.enabled = true;
	this.texture = null;
	this.material = null;
	this._intensity = 1;
	this.use_environment = true;
	this.gamma = false;
	this._bake_to_cubemap = false;
	if(o)
		this.configure(o);
}

Skybox.icon = "mini-icon-dome.png";

//vars
Skybox["@material"] = { type: LS.TYPES.MATERIAL };
Skybox["@texture"] = { type: LS.TYPES.TEXTURE };

Skybox.prototype.onAddedToNode = function(node)
{
	LEvent.bind(node, "collectRenderInstances", this.onCollectInstances, this);
}

Skybox.prototype.onRemovedFromNode = function(node)
{
	LEvent.unbind(node, "collectRenderInstances", this.onCollectInstances, this);
}

Skybox.prototype.onAddedToScene = function(scene)
{
	LEvent.bind(scene, "start", this.onStart, this);
}

Skybox.prototype.onRemovedFromScene = function(scene)
{
	LEvent.unbind(scene, "start", this.onStart, this);
}


Object.defineProperty( Skybox.prototype, "intensity", {
	set: function(v){
		this._intensity = v;
		if(this._material)
			this._material._color.set([v,v,v,1]);
	},
	get: function()
	{
		return this._intensity;
	},
	enumerable: true
});

Object.defineProperty( Skybox.prototype, "bake_to_cubemap", {
	set: function(v){
		this._bake_to_cubemap = v;
		if(v)
			this.bakeToCubemap();
	},
	get: function()
	{
		return this._bake_to_cubemap;
	},
	enumerable: true
});


Skybox.prototype.getResources = function(res)
{
	if(this.texture && this.texture.constructor === String)
		res[this.texture] = GL.Texture;
	if(this.material && this.material.constructor === String)
		res[this.material] = LS.Material;
	return res;
}

Skybox.prototype.onResourceRenamed = function (old_name, new_name, resource)
{
	if(this.texture == old_name)
		this.texture = new_name;
}

Skybox.prototype.onCollectInstances = function(e, instances)
{
	if(!this._root || !this.enabled)
		return;

	var mesh = this._mesh;
	if(!mesh)
		mesh = this._mesh = GL.Mesh.cube({size: 10});

	var node = this._root;

	var RI = this._render_instance;
	if(!RI)
	{
		this._render_instance = RI = new LS.RenderInstance(this._root, this);
		RI.priority = 100;

		//to position the skybox on top of the camera
		RI.onPreRender = function(render_settings) { 
			var camera = LS.Renderer._current_camera;
			var cam_pos = camera.getEye();
			mat4.identity(this.matrix);
			mat4.setTranslation( this.matrix, cam_pos );
			var size = (camera.near + camera.far) * 0.5;
			//mat4.scale( this.matrix, this.matrix, [ size, size, size ]);
			if(this.node.transform)
			{
				var R = this.node.transform.getGlobalRotationMatrix();
				mat4.multiply( this.matrix, this.matrix, R );
			}

			//this.updateAABB(); this node doesnt have AABB (its always visible)
			vec3.copy( this.center, cam_pos );
		};
	}

	var mat = null;
	if(this.material)
	{
		mat = LS.ResourcesManager.getResource( this.material );
	}
	else
	{
		var texture_name = null;
		if (this.use_environment && LS.Renderer._current_scene.info)
			texture_name = LS.Renderer._current_scene.info.textures["environment"];
		else
			texture_name = this.texture;

		if(!texture_name)
			return;

		var texture = LS.ResourcesManager.textures[ texture_name ];
		if(!texture)
			return;

		mat = this._material;
		if(!mat)
		{
			//mat = this._material = new LS.ShaderMaterial({});


			mat = this._material = new LS.StandardMaterial({ 
				flags: { 
					two_sided: true, 
					cast_shadows: false, 
					receive_shadows: false,
					ignore_frustum: true,
					ignore_lights: true,
					depth_test: false 
					},
				use_scene_ambient:false,
				color: [ this.intensity, this.intensity, this.intensity ]
			});
		}
		else
			mat.color.set([this.intensity, this.intensity, this.intensity]);

		var sampler = mat.setTexture( LS.Material.COLOR, texture_name );
		//sampler.gamma = this.gamma;

		if(texture && texture.texture_type == gl.TEXTURE_2D)
		{
			sampler.uvs = "polar_vertex";
			texture.bind(0);
			texture.setParameter( gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE ); //to avoid going up
			texture.setParameter( gl.TEXTURE_MIN_FILTER, gl.LINEAR ); //avoid ugly error in atan2 edges
		}
		else
			sampler.uvs = "0";
	}

	//render first
	if(mat)
	{
		mat.queue = LS.RenderQueue.BACKGROUND;
		mat.render_state.cull_face = false;
		mat.render_state.front_face = GL.CW;
		mat.render_state.depth_test = false;
		mat.flags.ignore_frustum = true;
		mat.flags.ignore_lights = true;
		mat.flags.cast_shadows = false;
		mat.flags.receive_shadows = false;
		mat.flags.flip_normals = true;
		mat.flags.depth_test = false;
		mat.use_scene_ambient = false;
	}

	RI.setMesh( mesh );
	RI.setMaterial( mat );
	instances.push(RI);

	//if we have a material we can bake and it has changed...
	if( this.material && mat && this._bake_to_cubemap && (this._prev_mat != mat || this._mat_version != mat.version ) )
	{
		this._prev_mat = mat;
		this._mat_version = mat.version;
		this.bakeToCubemap();
	}
}

Skybox.prototype.onStart = function(e)
{
	if( this._bake_to_cubemap )
		this.bakeToCubemap();
}

Skybox.prototype.bakeToCubemap = function( size, render_settings )
{
	var that = this;
	size = size || 512;
	render_settings = render_settings || new LS.RenderSettings();

	if( !this.root || !this.root.scene )
		return;

	var scene = this.root.scene;

	if( !this._render_instance || !this._render_instance.material ) //generate the skybox render instance
	{
		//wait till we have the material loaded
		setTimeout( function(){ that.bakeToCubemap.bind( that ); },500 );
		return;
	}

	//this will ensure the materials and instances are in the queues
	var instances = [];
	this.onCollectInstances(null, instances);
	LS.Renderer.processVisibleData( scene, render_settings, null, instances, true );

	render_settings.render_helpers = false;

	this._baked_texture = LS.Renderer.renderToCubemap( vec3.create(), size, this._baked_texture, render_settings, 0.001, 100, vec4.create(), instances);
	LS.ResourcesManager.registerResource( ":baked_skybox", this._baked_texture );
	if( this.root.scene.info )
		this.root.scene.info.textures[ "environment" ] = ":baked_skybox";
}

Skybox.shader_code = "\\color.vs\n\
	precision mediump float;\n\
	attribute vec3 a_vertex;\n\
	varying vec3 v_world_position;\n\
	uniform mat4 u_model;\n\
	uniform mat4 u_viewprojection;\n\
	void main() {\n\
		vec4 vertex4 = u_model * vec4(a_vertex,1.0);\n\
		v_world_position = vertex4.xyz;\n\
		gl_Position = u_viewprojection * vertex4;\n\
	}\n\
\\color.fs\n\
	precision mediump float;\n\
	varying vec3 v_world_position;\n\
	uniform vec4 u_material_color;\n\
	uniform vec3 u_camera_eye;\n\
	uniform samplerCube u_color_texture;\n\
	vec2 polarToCartesian(in vec3 V)\n\
	{\n\
		return vec2( 0.5 - (atan(V.z, V.x) / -6.28318531), asin(V.y) / 1.57079633 * 0.5 + 0.5);\n\
	}\n\
	void main() {\n\
		vec3 E = normalize( v_world_position - u_camera_eye);\n\
		vec4 color = textureCube( u_color_texture, E );\n\
		gl_FragColor = u_material_color;\n\
	}\n\
\\picking.vs\n\
	precision mediump float;\n\
	attribute vec3 a_vertex;\n\
	uniform mat4 u_model;\n\
	uniform mat4 u_viewprojection;\n\
	void main() {\n\
		vec4 vertex4 = vec4(a_vertex,1.0);\n\
		gl_Position = (u_viewprojection * u_model) * vertex4;\n\
	}\n\
\\picking.fs\n\
	precision mediump float;\n\
	uniform vec4 u_material_color;\n\
	void main() {\n\
		gl_FragColor = u_material_color;\n\
	}\n\
";


LS.registerComponent(Skybox);
LS.Skybox = Skybox;