/**
* Realtime Reflective surface
* @class RealtimeReflector
* @namespace LS.Components
* @constructor
* @param {String} object to configure from
*/


function ReflectionProbe(o)
{
	this._enabled = true;
	this.texture_size = 512;
	this.high_precision = false;
	this.texture_name = "";
	this.generate_irradiance = true;
	this.generate_mipmaps = false;
	this.refresh_rate = 1; //in frames
	this.layers = 0xFF;

	this.near = 0.1;
	this.far = 1000;
	this.background_color = vec4.create();

	this._position = vec3.create();
	this._current = vec3.create();
	this._version = -1;

	this._texture = null;
	this._irradiance_texture = null;

	this._texid = ":probe_" + ReflectionProbe.last_id;
	ReflectionProbe.last_id++;

	if(o)
		this.configure(o);
}

ReflectionProbe.last_id = 0;

ReflectionProbe.icon = "mini-icon-reflector.png";

ReflectionProbe["@texture_size"] = { type:"enum", values:["viewport",64,128,256,512,1024,2048] };
ReflectionProbe["@layers"] = { type:"layers" };
ReflectionProbe["@background_color"] = { type:"color" };

Object.defineProperty( ReflectionProbe.prototype, "enabled", {
	set: function(v){ 
		if(v == this._enabled)
			return;
		this._enabled = v; 
		if(!this._enabled)
			return;
		this.onRenderReflection();
		LS.GlobalScene.requestFrame();
	},
	get: function() { return this._enabled; },
	enumerable: true
});

ReflectionProbe.prototype.onAddedToScene = function(scene)
{
	LEvent.bind( scene,"start", this.onRenderReflection, this );
	LEvent.bind( scene,"renderReflections", this.onRenderReflection, this );
	//LEvent.bind( scene,"afterCameraEnabled", this.onCameraEnabled, this );
	//LEvent.bind( LS.Renderer,"renderHelpers", this.onVisualizeProbe, this );

	this.assignCubemaps(scene);
}

ReflectionProbe.prototype.onRemovedFromScene = function(scene)
{
	LEvent.unbindAll( scene, this );
	//LEvent.unbindAll( LS.Renderer, this );
	
	if(this._texture)
		LS.ResourcesManager.unregisterResource( this._texid );
	if(this._irradiance_texture)
		LS.ResourcesManager.unregisterResource( this._texid + "_IR" );

	//TODO: USE POOL!!
	this._texture = null;
	this._irradiance_texture = null;
}

ReflectionProbe.prototype.afterSerialize = function(o)
{
	if(this._irradiance_texture)
		o.irradiance_info = ReflectionProbe.cubemapToObject( this._irradiance_texture );
}

ReflectionProbe.prototype.afterConfigure = function(o)
{
	if(o.irradiance_info)
	{
		this._irradiance_texture = ReflectionProbe.objectToCubemap( o.irradiance_info, this._irradiance_texture, this.high_precision );
		this.assignCubemaps();
	}
}

ReflectionProbe.prototype.onRenderReflection = function( e )
{
	this.updateTextures();
}

ReflectionProbe.prototype.updateTextures = function( render_settings, force )
{
	if(!this._enabled || !this._root || !this._root.scene )
		return;

	var scene = this._root.scene;

	this._root.transform.getGlobalPosition( this._current );
	//if ( vec3.distance( this._current, this._position ) < 0.1 )
	//	force = true;

	if( LS.ResourcesManager.isLoading() )
		return;

	this.refresh_rate = this.refresh_rate|0;
	if( this.refresh_rate < 1 && this._texture && !force )
		return;

	if ( this._texture && (scene._frame % this.refresh_rate) != 0 && !force )
		return;

	this.updateCubemap( this._current, render_settings );

	if(this.generate_irradiance)
		this.updateIrradiance();
}

ReflectionProbe.prototype.updateCubemap = function( position, render_settings )
{
	render_settings = render_settings || LS.Renderer.default_render_settings;

	var scene = this._root.scene;
	if(!scene)
		return;

	var texture_size = parseInt( this.texture_size );

	//add flags
	var old_layers = render_settings.layers;
	render_settings.layers = this.layers;

	LS.Renderer.clearSamplers();

	var texture_type = gl.TEXTURE_CUBE_MAP;
	var type = this.high_precision ? gl.HIGH_PRECISION_FORMAT : gl.UNSIGNED_BYTE;

	var texture = this._texture;

	if(!texture || texture.width != texture_size || texture.height != texture_size || texture.type != type || texture.texture_type != texture_type || texture.minFilter != (this.generate_mipmaps ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR) )
	{
		texture = new GL.Texture( texture_size, texture_size, { type: type, texture_type: texture_type, minFilter: this.generate_mipmaps ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR });
		texture.has_mipmaps = this.generate_mipmaps;
		this._texture = texture;
	}

	if(position)
		this._position.set( position );
	else
		position = this._root.transform.getGlobalPosition( this._position );

	texture._in_current_fbo = true; //block binding this texture during rendering of the reflection

	//first render
	if( !LS.Renderer._visible_instances )
	{
		LS.Renderer.processVisibleData( scene, render_settings );
		LS.Renderer.regenerateShadowmaps( scene, render_settings );
	}

	//avoid reusing same irradiance from previous pass
	var tmp = null;
	if( LS.GlobalScene.info.textures.irradiance == this._irradiance_texture )
	{
		tmp = LS.GlobalScene.info.textures.irradiance;
		LS.GlobalScene.info.textures.irradiance = null;
	}

	//render all the scene inside the cubemap
	LS.Renderer.renderToCubemap( position, 0, texture, render_settings, this.near, this.far, this.background_color );

	if(tmp)
		LS.GlobalScene.info.textures.irradiance = tmp;

	texture._in_current_fbo = false;

	if(this.generate_mipmaps && isPowerOfTwo( texture_size ) )
	{
		texture.setParameter( gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR );
		gl.generateMipmap(texture.texture_type);
		texture.unbind();
	}

	if(this.texture_name)
		LS.ResourcesManager.registerResource( this.texture_name, texture );
	LS.ResourcesManager.registerResource( this._texid, texture );

	//add probe to LS.Renderer
	//TODO
	//HACK
	if( scene.info )
		scene.info.textures.environment = this._texid;

	//remove flags
	render_settings.layers = old_layers;
}

ReflectionProbe.prototype.updateIrradiance = function()
{
	var scene = this._root.scene;
	if(!scene)
		return;

	if(!this._texture)
		this.updateCubemap();

	if(!this._texture)
		return;

	var cubemap = this._texture;
	var type = this.high_precision ? gl.HIGH_PRECISION_FORMAT : gl.UNSIGNED_BYTE;

	//create textures for high and low
	if(!ReflectionProbe._downscale_cubemap)
	{
		ReflectionProbe._downscale_cubemap = new GL.Texture( 32, 32, { texture_type: gl.TEXTURE_CUBE_MAP, format: gl.RGB, filter: gl.LINEAR } );
		ReflectionProbe._downscale_cubemap_high = new GL.Texture( 32, 32, { type: gl.HIGH_PRECISION_FORMAT, texture_type: gl.TEXTURE_CUBE_MAP, format: gl.RGB, filter: gl.LINEAR } );
	}

	var downscale_cubemap = this.high_precision ? ReflectionProbe._downscale_cubemap_high : ReflectionProbe._downscale_cubemap;

	//downscale
	cubemap.copyTo( downscale_cubemap );
	
	//blur
	for(var i = 0; i < 8; ++i)
		downscale_cubemap.applyBlur( i,i,1 );

	//downscale again
	var irradiance_cubemap = this._irradiance_texture;
	if(!irradiance_cubemap || irradiance_cubemap.type != type)
		irradiance_cubemap = this._irradiance_texture = new GL.Texture( 4, 4, { type: type, texture_type: gl.TEXTURE_CUBE_MAP, format: gl.RGB, filter: gl.LINEAR } );
	downscale_cubemap.copyTo( irradiance_cubemap );

	//blur again
	for(var i = 0; i < 4; ++i)
		irradiance_cubemap.applyBlur( i,i,1 );

	this.assignCubemaps();

	return irradiance_cubemap;
}

ReflectionProbe.prototype.assignCubemaps = function( scene )
{
	if(!scene && this._root)
		scene = this._root.scene;
	if(!scene)
		scene = LS.GlobalScene;

	if(this._texture)
	{
		var tex = this._texture;
		LS.ResourcesManager.registerResource( this._texid, this._texture );
		if( scene.info )
			scene.info.textures.environment = this._texid;
	}

	if(this._irradiance_texture)
	{
		var ir_name = this._texid + "_IR";
		LS.ResourcesManager.registerResource( ir_name, this._irradiance_texture );
		if( scene.info )
			scene.info.textures.irradiance = ir_name;
	}
}


ReflectionProbe.prototype.renderProbe = function( visualize_irradiance, picking_color )
{
	if( !this._texture || !this._enabled )
		return;

	LS.Draw.push();
	LS.Draw.translate( this._position );
	LS.Draw.scale( ReflectionProbe.helper_size );

	if(!picking_color) //regular texture
	{
		var shader = GL.Shader.getCubemapShowShader();

        if(visualize_irradiance)
		    this._irradiance_texture.bind(0);
        else
		    this._texture.bind(0);
            
		LS.Draw.renderMesh( LS.Renderer._sphere_mesh, GL.TRIANGLES, shader );
        if(1) //contour
        {
            LS.Draw.setColor( LS.WHITE );
            LS.Draw.scale( 1.1 );
            gl.enable( gl.CULL_FACE );
            gl.frontFace( gl.CW );
            LS.Draw.renderMesh( LS.Renderer._sphere_mesh, GL.TRIANGLES );
            gl.frontFace( gl.CCW );
        }
	}
	else
	{
		LS.Draw.setColor( picking_color )
		LS.Draw.renderMesh( LS.Renderer._sphere_mesh, GL.TRIANGLES );
	}

	LS.Draw.pop();
}

ReflectionProbe.cubemapToObject = function( cubemap )
{
	var faces = [];
	for( var i = 0; i < 6; ++i )
	{
		var data = typedArrayToArray( cubemap.getPixels(i) );
		faces.push( data );
	}
	return {
		texture_type: cubemap.texture_type,
		size: cubemap.width,
		format: cubemap.format,
		faces: faces
	};
}

ReflectionProbe.objectToCubemap = function( data, out, high_precision )
{
	var type = high_precision ? gl.HIGH_PRECISION_FORMAT : gl.UNSIGNED_BYTE;
	if(!out)
		out = new GL.Texture( data.size, data.size, { type: type, texture_type: gl.TEXTURE_CUBE_MAP, format: GL.RGBA });
	for(var i = 0; i < data.faces.length; ++i )
	{
		var data_typed;
		if(type == gl.FLOAT)
			data_typed = new Float32Array( data.faces[i] );
		else if(type == gl.HIGH_PRECISION_FORMAT)
			data_typed = new Uint16Array( data.faces[i] );
		else //if(type == gl.UNSIGNED_BYTE)
			data_typed = new Uint8Array( data.faces[i] );
		out.setPixels( data_typed, true, i == 5, i );
	}
	return out;
}

ReflectionProbe.visualize_helpers = true;
ReflectionProbe.visualize_irradiance = false;
ReflectionProbe.helper_size = 1;

LS.registerComponent( ReflectionProbe );



function IrradianceCache( o )
{
	this.subdivisions = new Uint8Array(4,4,4);

	this.mode = IrradianceCache.VERTEX_MODE;

	this._irradiance_texture = null;

	if(o)
		this.configure(o);
}

IrradianceCache.OBJECT_MODE = 1;
IrradianceCache.VERTEX_MODE = 2;
IrradianceCache.FRAGMENT_MODE = 3;

IrradianceCache.prototype.computeCache = function()
{
	//compute cache size
	var num_probes = this.subdivisions[0] * this.subdivisions[1] * this.subdivisions[2];

}

IrradianceCache.prototype.encodeCacheInTexture = function()
{
		
}

IrradianceCache.prototype.renderEditor = function()
{

	var shader = GL.Shader.getCubemapShowShader();
	var mesh = LS.Renderer._sphere_mesh;
	var position = vec3.create();

	var global_matrix = this._root.transform.getGlobalMatrixRef();
	var center = mat4.multiplyVec3( vec3.create(), global_matrix, LS.ZEROS );
	var halfsize = mat4.multiplyVec3( vec3.create(), global_matrix, [0.5,0.5,0.5] );
	
	var min = vec3.sub( vec3.create(), center, halfsize );
	var subs = this.subdivisions;
	var iscale = vec3.fromValues( (2*halfsize[0])/subs[0], (2*halfsize[1])/subs[1], (2*halfsize[2])/subs[2] );
	   
	for(var x = 0; x < subs[0]; ++x)
	for(var y = 0; y < subs[1]; ++y)
	for(var z = 0; z < subs[2]; ++z)
	{
		LS.Draw.push();
		LS.Draw.translate( x * iscale[0] + min[0], y * iscale[1] + min[1], z * iscale[2] + min[2] );
		LS.Draw.scale( ReflectionProbe.helper_size );
		//bind cubemap
		//...
		//LS.Draw.renderMesh( mesh, GL.TRIANGLES, shader );
		LS.Draw.renderSolidSphere(1);
		LS.Draw.pop();
	}
}

//LS.registerComponent( IrradianceCache );
