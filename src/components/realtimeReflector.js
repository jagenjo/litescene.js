/**
* Realtime Reflective surface
* @class RealtimeReflector
* @constructor
* @param {String} object to configure from
*/


function RealtimeReflector(o)
{
	this.texture_size = 512;
	this.brightness_factor = 1.0;
	this.colorclip_factor = 0.0;
	this.clip_offset = 0.5; //to avoid ugly edges near clipping plane
	this.rt_name = "";
	this.use_cubemap = false;
	this.use_mesh_info = false;
	this.refresh_rate = 1; //in frames
	this._rt = null;

	if(o)
		this.configure(o);
}

RealtimeReflector.prototype.onAddedToNode = function(node)
{
	if(!this._bind_onRenderRT)
		this._bind_onRenderRT = this.onRenderRT.bind(this);

	LEvent.bind(node,"afterRenderShadows",this._bind_onRenderRT,this);
}


RealtimeReflector.prototype.onRemoveFromNode = function(node)
{
	LEvent.unbind(node,"afterRenderShadows",this._bind_onRenderRT,this);
}


RealtimeReflector.prototype.onRenderRT = function(e,camera)
{
	if(!this._root) return;

	this.refresh_rate = this.refresh_rate << 0;

	if( (Scene._frame == 0 || (Scene._frame % this.refresh_rate) != 0) && this._rt)
		return;

	//texture
	if( !isPowerOfTwo(this.texture_size) )
		this.texture_size = 256;

	var texture_type = this.use_cubemap ? gl.TEXTURE_CUBE_MAP : gl.TEXTURE_2D;
	if(!this._rt || this._rt.width != this.texture_size || this._rt.texture_type != texture_type )
		this._rt = new Texture(this.texture_size,this.texture_size, { texture_type: texture_type });

	var plane_center = this._root.transform.getPositionGlobal();
	var plane_normal = this._root.transform.getTop();

	//use the first vertex and normal from a mesh
	if(this.use_mesh_info)
	{
		var mesh = this._root.getMesh();
		if(mesh)
		{
			plane_center = this._root.transform.transformPointGlobal( [mesh.vertices[0],mesh.vertices[1],mesh.vertices[2]] );
			plane_normal = this._root.transform.transformVectorGlobal( [mesh.normals[0],mesh.normals[1],mesh.normals[2]] );
		}
	}

	//camera
	var cam = new Camera( camera.serialize() );
	var visible = this._root.flags.visible;
	this._root.flags.visible = false;

	if( !this.use_cubemap )
	{
		cam.aspect = camera.aspect;
		cam.eye = geo.reflectPointInPlane( camera.eye, plane_center, plane_normal );
		cam.center = geo.reflectPointInPlane( camera.center, plane_center, plane_normal );
		cam.up = geo.reflectPointInPlane( camera.up, [0,0,0], plane_normal );

		//little offset
		vec3.add(plane_center, plane_center,vec3.scale(vec3.create(), plane_normal, -this.clip_offset));
		var clipping_plane = [plane_normal[0], plane_normal[1], plane_normal[2], vec3.dot(plane_center, plane_normal)  ];

		Renderer.renderSceneMeshesToRT(cam,this._rt, {clipping_plane: clipping_plane, is_rt: true, is_reflection: true, brightness_factor: this.brightness_factor, colorclip_factor: this.colorclip_factor});
	}
	else
	{
		cam.eye = plane_center;
		Renderer.renderSceneMeshesToRT(cam,this._rt, {is_rt: true, is_reflection: true, brightness_factor: this.brightness_factor, colorclip_factor: this.colorclip_factor});
	}

	this._root.flags.visible = visible;

	if(this.rt_name)
		ResourcesManager.registerResource(this.rt_name, this._rt);

	if(!this._root.material) return;
	
	this._root.material.setTexture(this.rt_name ? this.rt_name : this._rt, Material.ENVIRONMENT_TEXTURE, Material.COORDS_SCREEN);
}

LS.registerComponent(RealtimeReflector);