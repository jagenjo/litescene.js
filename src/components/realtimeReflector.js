/**
* Realtime Reflective surface
* @class RealtimeReflector
* @constructor
* @param {String} object to configure from
*/


function RealtimeReflector(o)
{
	this.enabled = true;
	this.texture_size = 512;
	this.brightness_factor = 1.0;
	this.colorclip_factor = 0.0;
	this.clip_offset = 0.5; //to avoid ugly edges near clipping plane
	this.rt_name = "";
	this.use_cubemap = false;
	this.blur = 0;
	this.generate_mipmaps = false;
	this.use_mesh_info = false;
	this.offset = vec3.create();
	this.ignore_this_mesh = true;
	this.high_precision = false;
	this.refresh_rate = 1; //in frames
	this._rt = null;

	if(o)
		this.configure(o);
}

RealtimeReflector.icon = "mini-icon-reflector.png";

RealtimeReflector["@texture_size"] = { type:"enum", values:[64,128,256,512,1024,2048] };

RealtimeReflector.prototype.onAddedToNode = function(node)
{
	LEvent.bind(node,"renderReflections", this.onRenderRT, this );
}


RealtimeReflector.prototype.onRemoveFromNode = function(node)
{
	LEvent.unbind(node,"renderReflections", this.onRenderRT, this);
}


RealtimeReflector.prototype.onRenderRT = function(e, render_options)
{
	if(!this.enabled || !this._root) return;

	var camera = render_options.main_camera;

	this.refresh_rate = this.refresh_rate << 0;

	if( (Scene._frame == 0 || (Scene._frame % this.refresh_rate) != 0) && this._rt)
		return;

	//texture
	if( !isPowerOfTwo(this.texture_size) )
		this.texture_size = 256;

	var texture_type = this.use_cubemap ? gl.TEXTURE_CUBE_MAP : gl.TEXTURE_2D;
	var type = this.high_precision ? gl.HIGH_PRECISION_FORMAT : gl.UNSIGNED_BYTE;
	if(!this._rt || this._rt.width != this.texture_size || this._rt.type != type || this._rt.texture_type != texture_type || this._rt.mipmaps != this.generate_mipmaps)
	{
		this._rt = new Texture(this.texture_size,this.texture_size, { type: type, texture_type: texture_type, minFilter: this.generate_mipmaps ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR });
		this._rt.mipmaps = this.generate_mipmaps;
	}

	//compute planes
	var plane_center = this._root.transform.getGlobalPosition();
	var plane_normal = this._root.transform.getTop();
	var cam_eye = camera.getEye();
	var cam_center = camera.getCenter();
	var cam_up = camera.getUp();

	//use the first vertex and normal from a mesh
	if(this.use_mesh_info)
	{
		var mesh = this._root.getMesh();
		if(mesh)
		{
			plane_center = this._root.transform.transformPointGlobal( mesh.vertices.subarray(0,3) );
			plane_normal = this._root.transform.transformVectorGlobal( mesh.normals.subarray(0,3) );
		}
	}

	vec3.add( plane_center, plane_center, this.offset );

	//camera
	var reflected_camera = this._reflected_camera || new Camera();
	this._reflected_camera = reflected_camera;
	reflected_camera.configure( camera.serialize() );

	var visible = this._root.flags.visible;
	if(this.ignore_this_mesh)
		this._root.flags.visible = false;

	//add flags
	render_options.is_rt = true;
	render_options.is_reflection = true;
	render_options.brightness_factor = this.brightness_factor;
	render_options.colorclip_factor = this.colorclip_factor;

	if( !this.use_cubemap ) //planar reflection
	{
		reflected_camera.fov = camera.fov;
		reflected_camera.aspect = camera.aspect;
		reflected_camera.eye = geo.reflectPointInPlane( cam_eye, plane_center, plane_normal );
		reflected_camera.center = geo.reflectPointInPlane( cam_center, plane_center, plane_normal );
		reflected_camera.up = geo.reflectPointInPlane( cam_up, [0,0,0], plane_normal );
		//reflected_camera.up = cam_up;

		//little offset
		vec3.add(plane_center, plane_center,vec3.scale(vec3.create(), plane_normal, -this.clip_offset));
		var clipping_plane = [plane_normal[0], plane_normal[1], plane_normal[2], vec3.dot(plane_center, plane_normal)  ];
		render_options.clipping_plane = clipping_plane;
		Renderer.renderInstancesToRT(reflected_camera,this._rt, render_options);
	}
	else //spherical reflection
	{
		reflected_camera.eye = plane_center;
		Renderer.renderInstancesToRT(reflected_camera,this._rt, render_options );
	}

	//remove flags
	delete render_options.clipping_plane;
	delete render_options.is_rt;
	delete render_options.is_reflection;
	delete render_options.brightness_factor;
	delete render_options.colorclip_factor;

	if(this.blur)
	{
		if( this._temp_blur_texture && !Texture.compareFormats(this._temp_blur_texture, this._rt) )
			this._temp_blur_texture = null;	 //remove old one
		this._temp_blur_texture = this._rt.applyBlur( this.blur, this.blur, 1, this._temp_blur_texture);
		//ResourcesManager.registerResource(":BLUR", this._temp_blur_texture);//debug
	}


	if(this.generate_mipmaps)
	{
		this._rt.bind();
		gl.generateMipmap(this._rt.texture_type);
		this._rt.unbind();
	}

	this._root.flags.visible = visible;

	if(this.rt_name)
		ResourcesManager.registerResource(this.rt_name, this._rt);

	if(!this._root.material) return;
	
	var mat = this._root.getMaterial();
	if(mat)
		mat.setTexture(this.rt_name ? this.rt_name : this._rt, Material.ENVIRONMENT_TEXTURE, Material.COORDS_FLIPPED_SCREEN);
}

LS.registerComponent(RealtimeReflector);