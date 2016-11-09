
function Skybox(o)
{
	this.enabled = true;
	this.texture = null;
	this.material = null;
	this._intensity = 1;
	this.use_environment = true;
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
		if (this.use_environment)
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
			mat = this._material = new LS.StandardMaterial({ 
				queue: LS.RenderQueue.BACKGROUND, 
				flags: { 
					two_sided: true, 
					cast_shadows: false, 
					receive_shadows: false,
					ignore_frustum: true,
					ignore_lights: true,
					depth_test: false 
					},
				use_scene_ambient:false,
				color: [ this.intensity, this.intensity, this.intensity, 1 ]
			});
		var sampler = mat.setTexture( LS.Material.COLOR, texture_name );

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

	RI.setMesh( mesh );
	RI.setMaterial( mat );

	instances.push(RI);
}

LS.registerComponent(Skybox);
LS.Skybox = Skybox;