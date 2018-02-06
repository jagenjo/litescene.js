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
		this._irradiance_texture = ReflectionProbe.objectToCubemap( o.irradiance_info, this._irradiance_texture );
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

	LS.Renderer.renderToCubemap( position, 0, texture, render_settings, this.near, this.far, this.background_color );

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

	if(!ReflectionProbe._downscale_cubemap)
		ReflectionProbe._downscale_cubemap = new GL.Texture( 32, 32, { texture_type: gl.TEXTURE_CUBE_MAP, format: gl.RGB, filter: gl.LINEAR } );
	var downscale_cubemap = ReflectionProbe._downscale_cubemap;

	//downscale
	cubemap.copyTo( downscale_cubemap );
	
	//blur
	for(var i = 0; i < 8; ++i)
	{
		downscale_cubemap._tmp = downscale_cubemap.applyBlur( i,i,1, null, downscale_cubemap._tmp );
		downscale_cubemap._tmp.copyTo( downscale_cubemap );
	}

	//downscale again
	var irradiance_cubemap = this._irradiance_texture;
	if(!irradiance_cubemap)
		irradiance_cubemap = this._irradiance_texture = new GL.Texture( 4, 4, { texture_type: gl.TEXTURE_CUBE_MAP, format: gl.RGB, filter: gl.LINEAR } );
	downscale_cubemap.copyTo( irradiance_cubemap );

	//blur again
	for(var i = 0; i < 4; ++i)
	{
		irradiance_cubemap._tmp = irradiance_cubemap.applyBlur( i,i,1, null, irradiance_cubemap._tmp );
		irradiance_cubemap._tmp.copyTo( irradiance_cubemap );
	}

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


ReflectionProbe.prototype.renderProbe = function( picking_color )
{
	if( !this._texture || !this._enabled )
		return;

	LS.Draw.push();
	LS.Draw.translate( this._position );
	LS.Draw.scale( ReflectionProbe.helper_size );

	if(!picking_color) //regular texture
	{
		var shader = GL.Shader.getCubemapShowShader();
		this._texture.bind(0);
		LS.Draw.renderMesh( LS.Renderer._sphere_mesh, GL.TRIANGLES, shader );
		LS.Draw.setColor( LS.WHITE );
		LS.Draw.scale( 1.1 );
		gl.enable( gl.CULL_FACE );
		gl.frontFace( gl.CW );
		LS.Draw.renderMesh( LS.Renderer._sphere_mesh, GL.TRIANGLES );
		gl.frontFace( gl.CCW );
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
		faces.push( typedArrayToArray( cubemap.getPixels(null,null,i) ) );
	return {
		texture_type: cubemap.texture_type,
		size: cubemap.width,
		format: cubemap.format,
		faces: faces
	};
}

ReflectionProbe.objectToCubemap = function( data, out )
{
	if(!out)
		out = new GL.Texture( data.size, data.size, { texture_type: gl.TEXTURE_CUBE_MAP, format: GL.RGBA });
	for(var i = 0; i < data.faces.length; ++i )
		out.setPixels( new Uint8Array( data.faces[i] ), true, i == 5, i );
	return out;
}

ReflectionProbe.render_helpers = true;
ReflectionProbe.helper_size = 1;

LS.registerComponent( ReflectionProbe );