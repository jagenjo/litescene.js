
function Skybox(o)
{
	this.texture = null;
	this.intensity = 1;
	this.use_environment = true;
	if(o)
		this.configure(o);
}

Skybox.icon = "mini-icon-teapot.png";

//vars
Skybox["@texture"] = { widget: "texture" };

Skybox.prototype.onAddedToNode = function(node)
{
	LEvent.bind(node, "collectRenderInstances", this.onCollectInstances, this);
}

Skybox.prototype.onRemovedFromNode = function(node)
{
	LEvent.unbind(node, "collectRenderInstances", this.onCollectInstances, this);
}

Skybox.prototype.getResources = function(res)
{
	if(typeof(this.texture) == "string")
		res[this.texture] = Texture;
	return res;
}

Skybox.prototype.onCollectInstances = function(e, instances)
{
	var texture = null;
	if (this.use_environment)
		texture = Renderer._current_scene.textures["environment"];
	else
		texture = this.texture;

	if(!texture) return;

	if(texture.constructor === String)
		texture = LS.ResourcesManager.textures[texture];

	var mesh = this._mesh;
	if(!mesh)
		mesh = this._mesh = GL.Mesh.cube({size: 10});

	var node = this._root;
	if(!this._root) return;

	var RI = this._render_instance;
	if(!RI)
	{
		this._render_instance = RI = new RenderInstance(this._root, this);
		RI.priority = 100;

		RI.onPreRender = function(options) { 
			var cam_pos = options.camera.getEye();
			mat4.setTranslation( this.matrix, cam_pos );
			vec3.copy( this.center, cam_pos );
		};
	}

	var mat = this._material;
	if(!mat)
		mat = this._material = new LS.Material({use_scene_ambient:false});

	vec3.copy( mat.color, [ this.intensity, this.intensity, this.intensity ] );
	mat.textures["color"] = texture;

	RI.setMesh(mesh);
	RI.material = mat;

	RI.flags = RI_DEFAULT_FLAGS;
	RI.applyNodeFlags();
	RI.disableFlag( RI_CAST_SHADOWS ); //never cast shadows
	RI.enableFlag( RI_IGNORE_LIGHTS ); //no lights
	RI.enableFlag( RI_CW ); //no lights
	RI.disableFlag( RI_DEPTH_WRITE ); 
	RI.disableFlag( RI_DEPTH_TEST ); 
	RI.enableFlag( RI_IGNORE_FRUSTRUM );

	instances.push(RI);
}

LS.registerComponent(Skybox);
LS.Skybox = Skybox;