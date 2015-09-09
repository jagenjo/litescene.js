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
	this.texture_name = "";
	this.use_cubemap = false;
	this.all_cameras = false; //renders the reflection for every active camera (very slow)
	this.blur = 0;
	this.generate_mipmaps = false;
	this.use_mesh_info = false;
	this.offset = vec3.create();
	this.ignore_this_mesh = true;
	this.high_precision = false;
	this.refresh_rate = 1; //in frames

	this._textures = {};

	if(o)
		this.configure(o);
}

RealtimeReflector.icon = "mini-icon-reflector.png";

RealtimeReflector["@texture_size"] = { type:"enum", values:["viewport",64,128,256,512,1024,2048] };

RealtimeReflector.prototype.onAddedToScene = function(scene)
{
	LEvent.bind( scene,"renderReflections", this.onRenderReflection, this );
	LEvent.bind( scene,"afterCameraEnabled", this.onCameraEnabled, this );
}


RealtimeReflector.prototype.onRemovedFromScene = function(scene)
{
	LEvent.unbindAll( scene, this );
	this._textures = {}; //clear textures
}


RealtimeReflector.prototype.onRenderReflection = function(e, render_options)
{
	if(!this.enabled || !this._root)
		return;

	var scene = this._root.scene;
	if(!scene)
		return;

	this.refresh_rate = this.refresh_rate << 0;
	if( (scene._frame == 0 || (scene._frame % this.refresh_rate) != 0) && this._rt)
		return;

	var texture_size = parseInt( this.texture_size );
	var texture_width = texture_size;
	var texture_height = texture_size;

	var visible = this._root.flags.visible;
	if(this.ignore_this_mesh)
		this._root.flags.seen_by_reflections = false;

	//add flags
	render_options.is_rt = true;
	render_options.is_reflection = true;
	render_options.brightness_factor = this.brightness_factor;
	render_options.colorclip_factor = this.colorclip_factor;

	var cameras = LS.Renderer._visible_cameras;

	for(var i = 0; i < cameras.length; i++)
	{
		//var camera = render_options.main_camera;
		var camera = cameras[i];

		if( isNaN( texture_size ) && this.texture_size == "viewport")
		{
			texture_size = 512; //used in cubemaps
			var viewport = camera.getLocalViewport(null, camera._viewport_in_pixels );
			texture_width = viewport[2];//gl.canvas.width;
			texture_height = viewport[3];//gl.canvas.height;
		}

		if(this.use_cubemap)
			texture_width = texture_height = texture_size;

		var texture_type = this.use_cubemap ? gl.TEXTURE_CUBE_MAP : gl.TEXTURE_2D;
		var type = this.high_precision ? gl.HIGH_PRECISION_FORMAT : gl.UNSIGNED_BYTE;

		var texture = this._textures[ camera.uid ];
		if(!texture || texture.width != texture_width || texture.height != texture_height || texture.type != type || texture.texture_type != texture_type || texture.mipmaps != this.generate_mipmaps)
		{
			texture = new GL.Texture(texture_width, texture_height, { type: type, texture_type: texture_type, minFilter: this.generate_mipmaps ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR });
			texture.mipmaps = this.generate_mipmaps;
			this._textures[ camera.uid ] = texture;
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
				plane_center = this._root.transform.transformPointGlobal( BBox.getCenter( mesh.bounding ) );
				plane_normal = this._root.transform.transformVectorGlobal( [0,1,0] );
			}
		}

		vec3.add( plane_center, plane_center, this.offset );

		//camera
		var reflected_camera = this._reflected_camera || new LS.Camera();
		this._reflected_camera = reflected_camera;
		reflected_camera.configure( camera.serialize() );

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
			LS.Renderer.renderInstancesToRT(reflected_camera, texture, render_options);
		}
		else //spherical reflection
		{
			reflected_camera.eye = plane_center;
			LS.Renderer.renderInstancesToRT(reflected_camera, texture, render_options );
		}

		if(this.blur)
		{
			var blur_texture = this._textures[ "blur_" + camera.uid ];
			if( blur_texture && !GL.Texture.compareFormats( blur_texture, texture) )
				blur_texture = null;	 //remove old one
			blur_texture = texture.applyBlur( this.blur, this.blur, 1, blur_texture );
			this._textures[ "blur_" + camera.uid ] = blur_texture;
			//LS.ResourcesManager.registerResource(":BLUR" + camera.uid, blur_texture);//debug
		}

		if(this.generate_mipmaps && isPowerOfTwo(texture_width) && isPowerOfTwo(texture_height) )
		{
			texture.bind();
			gl.generateMipmap(texture.texture_type);
			texture.unbind();
		}

		if(this.texture_name)
			LS.ResourcesManager.registerResource( this.texture_name, texture );
		LS.ResourcesManager.registerResource( ":reflection_" + camera.uid, texture );

		if(!this.all_cameras)
			break;
	}

	//remove flags
	delete render_options.clipping_plane;
	delete render_options.is_rt;
	delete render_options.is_reflection;
	delete render_options.brightness_factor;
	delete render_options.colorclip_factor;

	//make it visible again
	this._root.flags.visible = visible;
}


RealtimeReflector.prototype.onCameraEnabled = function(e, camera)
{
	if(!this.enabled || !this._root)
		return;

	if(!this._root.material)
		return;

	var texture = this._textures[ camera.uid ];
	if(!texture)
		return;
	
	var mat = this._root.getMaterial();
	if(mat)
	{
		var sampler = mat.setTexture( Material.ENVIRONMENT_TEXTURE, ":reflection_" + camera.uid );
		sampler.uvs = Material.COORDS_FLIPPED_SCREEN;
	}
}

LS.registerComponent( RealtimeReflector );