///@INFO: UNCOMMON
/**
* Realtime Reflective probe
* @class RealtimeReflector
* @namespace LS.Components
* @constructor
* @param {Object} object to configure from
*/


function ReflectionProbe( o )
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

	this._position = vec3.create(); //position where the cubemap was captured
	this._current = vec3.create(); //position where the node is
	this._version = -1;

	this._texture = null;
	this._irradiance_shs = new Float32Array( 3 * 9 );

	this._tex_id = ":probe_" + ReflectionProbe.last_id;
	ReflectionProbe.last_id++;
	this._registered = false;

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
		var scene = this._root ? this._root.scene : null;
		if(!this._enabled)
		{
			if(this._registered)
				this.unregister(scene);
			return;
		}
		if(!this._registered)
			this.register(scene);
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

	this.register( scene );
}

ReflectionProbe.prototype.onRemovedFromScene = function(scene)
{
	LEvent.unbindAll( scene, this );
	//LEvent.unbindAll( LS.Renderer, this );
	
	if(this._texture)
		LS.ResourcesManager.unregisterResource( this._tex_id );

	//TODO: USE POOL!!
	this._texture = null;

	this.unregister( scene );
}

ReflectionProbe.prototype.onSerialize = function(o)
{
	o.irradiance_shs = typedArrayToArray( this._irradiance_shs );
}

ReflectionProbe.prototype.onConfigure = function(o)
{
	if(o.irradiance_shs)
		this._irradiance_shs.set( o.irradiance_shs );
}

ReflectionProbe.prototype.onRenderReflection = function( e )
{
	if( this._enabled )
		this.recompute();
}

ReflectionProbe.prototype.recompute = function( render_settings, force )
{
	if( !this._root || !this._root.scene )
		return;

	var scene = this._root.scene;

	if( LS.ResourcesManager.isLoading() )
		return;

	this.refresh_rate = this.refresh_rate|0;
	if( this.refresh_rate < 1 && this._texture && !force )
		return;

	if ( this._texture && (scene._frame % this.refresh_rate) != 0 && !force )
		return;

	this._root.transform.getGlobalPosition( this._current );
	//if ( vec3.distance( this._current, this._position ) < 0.1 )
	//	force = true;

	this.updateCubemap( this._current, render_settings, force );
}

ReflectionProbe.prototype.updateCubemap = function( position, render_settings, generate_spherical_harmonics )
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

	//fix: there was a problem because there was no texture bind in ENVIRONMENT_SLOT, this fix it
	for(var i = 0; i < LS.Renderer._visible_instances.length; ++i)
		LS.Renderer._visible_instances[i]._nearest_reflection_probe = null;

	//render all the scene inside the cubemap
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
	LS.ResourcesManager.registerResource( this._tex_id, texture );

	//compute SHs (VERY SLOW)
	if(generate_spherical_harmonics)
	{
		//TODO: copy to lowres cubemap
		var temp_texture = ReflectionProbe._temp_cubemap;
		var texture_size = IrradianceCache.capture_cubemap_size;
		var texture_settings = { type: gl.FLOAT, texture_type: gl.TEXTURE_CUBE_MAP, format: gl.RGB };
		if( !temp_texture || temp_texture.width != texture_size || temp_texture.height != texture_size  )
			ReflectionProbe._temp_cubemap = temp_texture = new GL.Texture( texture_size, texture_size, texture_settings );
		texture.copyTo( temp_texture ); //downsample
		this._irradiance_shs = IrradianceCache.computeSH( temp_texture );
	}

	//remove flags
	render_settings.layers = old_layers;
}

//assigns the cubemaps to the scene global
ReflectionProbe.prototype.assignCubemaps = function( scene )
{
	if(this._texture)
		LS.ResourcesManager.registerResource( this._tex_id, this._texture );
}

/**
* Adds a reflection probe to the scene
*
* @method register
* @param {LS.Scene} scene
*/
ReflectionProbe.prototype.register = function( scene )
{
	if( scene._reflection_probes.indexOf( this ) != -1 )
	{
		console.warn("this reflection probe is already registered");
		return;
	}

	scene._reflection_probes.push( this );
	this._registered = true;
}

/**
* removes a reflection probe from the scene
*
* @method unregister
* @param {ReflectionProbe} probe
*/
ReflectionProbe.prototype.unregister = function( scene )
{
	var index = scene._reflection_probes.indexOf( this );
	if( index == -1 )
	{
		console.warn("this reflection probe is not registered");
		return;
	}

	scene._reflection_probes.splice( index, 1);
	this._registered = false;
}

/**
* visualizes the content of a probe
*
* @method renderProbe
* @param {bool} visualize_irradiance if true the irradiance is shown, otherwise the reflection
* @param {bool} picking_color if true it is rendered with a giben color for mouse picking
*/
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

/**
* Static method to update all the reflection probes active in the scene
*
* @method ReflectionProbe.updateAll
* @param {LS.Scene} scene the scene
* @param {LS.RenderSettings} render_settings the render settings to use while rendering the cubemaps
*/

ReflectionProbe.updateAll = function( scene, render_settings )
{
	scene = scene || LS.GlobalScene;

	for(var i = 0; i < scene._reflection_probes.length; ++i)
	{
		var probe = scene._reflection_probes[i];
		probe.recompute( render_settings, true );
	}
}

ReflectionProbe.visualize_helpers = true;
ReflectionProbe.visualize_irradiance = false;
ReflectionProbe.helper_size = 1;

LS.registerComponent( ReflectionProbe );


/**
* Precomputed Irradiance probes
* @class IrradianceCache
* @namespace LS.Components
* @constructor
* @param {Object} object to configure from
*/


function IrradianceCache( o )
{
	this.enabled = true;
	this.size = vec3.fromValues(10,10,10); //grid size
	this.subdivisions = new Uint8Array([4,1,4]);
	this.layers = 0xFF; //layers that can contribute to the irradiance
	this.force_two_sided = false;

	this.near = 0.1;
	this.far = 1000;
	this.sampling_distance = 0.0;
	this.debug = 0.0;
	this.background_color = vec4.create();
	this.intensity_color = vec3.fromValues(1,1,1);

	this.mode = IrradianceCache.VERTEX_MODE;

	this._irradiance_cubemaps = [];
	this._irradiance_shs = [];
	this._irradiance_matrix = mat4.create();
	this._irradiance_subdivisions = vec3.clone( this.subdivisions );
	this._sh_texture = null;

	this._uniforms = {
		irradiance_texture: LS.Renderer.IRRADIANCE_TEXTURE_SLOT,
		u_irradiance_subdivisions: this._irradiance_subdivisions,
		u_irradiance_color: this.intensity_color,
		u_irradiance_imatrix: mat4.create(),
		u_irradiance_distance: 0
		//u_irradiance_debug: 0
	};
	this._samplers = [];

	this.cache_filename = "";
	this._cache_resource = null;

	if(o)
	{
		this.configure(o);
		if(o.uid && !this.cache_filename)
			this.cache_filename = "IR_cache_" + o.uid.substr(1) + ".bin";
	}
}

IrradianceCache.show_probes = false;
IrradianceCache.show_cubemaps = false;
IrradianceCache.probes_size = 1;
IrradianceCache.capture_cubemap_size = 64; //renders the scene to this size
IrradianceCache.final_cubemap_size = 16; //downsamples to this size

IrradianceCache.OBJECT_MODE = 1;
IrradianceCache.VERTEX_MODE = 2;
IrradianceCache.PIXEL_MODE = 3;

IrradianceCache["@mode"] = { type:"enum", values: { "object": IrradianceCache.OBJECT_MODE, "vertex": IrradianceCache.VERTEX_MODE, "pixel": IrradianceCache.PIXEL_MODE } };
IrradianceCache["@size"] = { type:"vec3", min: 0.1, step: 0.1, precision:3 };
IrradianceCache["@subdivisions"] = { type:"vec3", min: 1, max: 256, step: 1, precision:0 };
IrradianceCache["@layers"] = { widget:"layers" };
IrradianceCache["@background_color"] = { type:"color" };
IrradianceCache["@intensity_color"] = { type:"color" };
IrradianceCache.default_coeffs = new Float32Array([ 0,0,0, 0.5,0.75,1, 0,0,0, 0,0,0, 0,0,0, 0,0,0, 0,0,0, 0,0,0, 0,0,0 ]);

IrradianceCache.use_sh_low = false; //set to false before shader compilation to use 9 coeffs instead of 4

IrradianceCache.prototype.onAddedToScene = function(scene)
{
	LEvent.bind( scene, "fillSceneUniforms", this.fillSceneUniforms, this);
}

IrradianceCache.prototype.onRemovedFromScene = function(scene)
{
	LEvent.unbind( scene, "fillSceneUniforms", this.fillSceneUniforms, this);
}

IrradianceCache.prototype.onConfigure = function(o)
{
	if(!this.cache_filename)
		return; //???

	var that = this;
	LS.ResourcesManager.load( this.cache_filename, function( res ){
		if(!res)
			return;
		that._cache_resource = res;
		if(!that._sh_texture && res._sh_texture) //optimization to avoid to create a texture every time
			that._sh_texture = res._sh_texture; 
		that.fromData( res.data );
		that.encodeCacheInTexture();
		res._sh_texture = that._sh_texture;
		LS.GlobalScene.requestFrame();
	});
}

IrradianceCache.prototype.getResources = function(res)
{
	if( this.cache_filename && this._cache_resource )
		res[ this.cache_filename ] = LS.Resource;
}


IrradianceCache.prototype.onResourceRenamed = function(old_name, new_name)
{
	if( old_name == this.cache_filename)
		this.cache_filename = new_name;
}

IrradianceCache.prototype.fillSceneUniforms = function()
{
	if(!this.enabled || !this._sh_texture)
		return;
	this._samplers[ LS.Renderer.IRRADIANCE_TEXTURE_SLOT ] = this._sh_texture;
	this._uniforms.u_irradiance_distance = this.sampling_distance;
	//this._uniforms.u_irradiance_debug = this.debug;
	LS.Renderer.enableFrameShaderBlock( "applyIrradiance", this._uniforms, this._samplers );
}

IrradianceCache.prototype.recompute = function( camera )
{
	var subs = this.subdivisions;
	var size = this.size;
	if(subs[0] < 1) subs[0] = 1;
	if(subs[1] < 1) subs[1] = 1;
	if(subs[2] < 1) subs[2] = 1;

	var start = getTime();
	console.log("Capturing irradiance...");

	var iscale = vec3.fromValues( size[0]/subs[0], size[1]/subs[1], size[2]/subs[2] );

	//cubemap
	var type = gl.FLOAT; //enforce floats even in low precision, they get better coefficients, I dont use gl.HIGH_PRECISION_FORMAT because I cant read them back
	var render_settings = LS.Renderer.default_render_settings;
	var old_layers = render_settings.layers;
	render_settings.layers = this.layers;
	LS.GlobalScene.info.textures.irradiance = null;

	var final_cubemap_size = IrradianceCache.final_cubemap_size;
	var texture_size = IrradianceCache.capture_cubemap_size; //default is 64
	var texture_settings = { type: type, texture_type: gl.TEXTURE_CUBE_MAP, format: gl.RGB };
	var texture = IrradianceCache._temp_cubemap;
	if( !texture || texture.width != texture_size || texture.height != texture_size || texture.type != texture_settings.type )
		IrradianceCache._temp_cubemap = texture = new GL.Texture( texture_size, texture_size, texture_settings );

	//first render
	if( !LS.Renderer._visible_instances )
	{
		var scene = this._root.scene;
		if(!scene)
			throw("cannot compute irradiance without scene");
		LS.Renderer.processVisibleData( scene, render_settings );
		LS.Renderer.regenerateShadowmaps( scene, render_settings );
	}

	//compute cache size
	var num_probes = this.subdivisions[0] * this.subdivisions[1] * this.subdivisions[2];
	this._irradiance_cubemaps.length = num_probes;
	this._irradiance_shs.length = num_probes;
	this._irradiance_subdivisions.set( this.subdivisions );

	var position = vec3.create();
	var matrix = this._irradiance_matrix;
	mat4.identity( matrix );
	if( this._root.transform )
		this._root.transform.getGlobalMatrix( matrix );
	mat4.scale( matrix, matrix, iscale );

	var i = 0, generated = 0;
	for(var y = 0; y < subs[1]; ++y)
	for(var z = 0; z < subs[2]; ++z)
	for(var x = 0; x < subs[0]; ++x)
	{
		position[0] = x + 0.5;
		position[1] = y + 0.5;
		position[2] = z + 0.5;
		if( matrix )
			mat4.multiplyVec3( position, matrix, position );

		if( camera && !camera.testSphereInsideFrustum( position ) )
		{
			i+=1;
			continue;
		}

		var cubemap = this._irradiance_cubemaps[ i ];
		if(!cubemap || cubemap.type != texture_settings.type || cubemap.width != final_cubemap_size )
			this._irradiance_cubemaps[ i ] = cubemap = new GL.Texture( final_cubemap_size, final_cubemap_size, texture_settings );

		IrradianceCache.captureIrradiance( position, cubemap, render_settings, this.near, this.far, this.background_color, true, IrradianceCache._temp_cubemap );
		this._irradiance_shs[i] = IrradianceCache.computeSH( cubemap );

		i+=1;
		generated+=1;
	}

	var end_irradiance_time = getTime();
	console.log("Capturing light time: " + (end_irradiance_time - start).toFixed(1) + "ms. Num. probes updated: " + generated );

	this.encodeCacheInTexture();
	var end_packing_time = getTime();
	console.log("Packing in texture time: " + (end_packing_time - end_irradiance_time).toFixed(1) + "ms");

	console.log("Irradiance Total: " + (getTime() - start).toFixed(1) + "ms");

	//store in file
	if(!this.cache_filename)
		this.cache_filename = "IR_cache_" + this.uid.substr(1) + ".bin";
	var cache_res = this._cache_resource = LS.ResourcesManager.getResource( cache_res );
	if(!cache_res)
	{
		this._cache_resource = cache_res = new LS.Resource();
		LS.ResourcesManager.registerResource( this.cache_filename, cache_res );
	}
	cache_res.data = this.toData();
	LS.RM.resourceModified( cache_res );

	//remove flags
	render_settings.layers = old_layers;
}

//captures the illumination to a cubemap
IrradianceCache.captureIrradiance = function( position, output_cubemap, render_settings, near, far, bg_color, force_two_sided, temp_cubemap )
{
	temp_cubemap = temp_cubemap;

	LS.Renderer.clearSamplers();

	//disable IR cache first
	LS.Renderer.disableFrameShaderBlock("applyIrradiance");

	if( force_two_sided )
		render_settings.force_two_sided = true;

	//render all the scene inside the cubemap
	LS.Renderer.renderToCubemap( position, 0, temp_cubemap, render_settings, near, far, bg_color );

	if( force_two_sided )
		render_settings.force_two_sided = false;

	//downsample
	temp_cubemap.copyTo( output_cubemap );
}

IrradianceCache.computeSH = function( cubemap )
{
	//read 6 images from cubemap
	var faces = [];
	for(var i = 0; i < 6; ++i)
		faces.push( cubemap.getPixels(i) );

	var coeffs = computeSH( faces, cubemap.width, 4 );
	return coeffs;
}

IrradianceCache.prototype.encodeCacheInTexture = function()
{
	if(!this._irradiance_shs.length)
		return;

	var sh_temp_texture_type = gl.FLOAT; //HIGH_PRECISION_FORMAT
	var sh_texture_type = gl.HIGH_PRECISION_FORMAT;
	if( !GL.FBO.testSupport( sh_texture_type, gl.RGB ) )
		sh_texture_type = gl.FLOAT;

	//create texture
	if( !this._sh_texture || this._sh_texture.height != this._irradiance_shs.length || this._sh_texture.type != sh_texture_type )
	{
		this._sh_texture = new GL.Texture(9, this._irradiance_shs.length, { format: gl.RGB, type: sh_texture_type, magFilter: gl.NEAREST, minFilter: gl.NEAREST, wrap: gl.CLAMP_TO_EDGE });
		LS.ResourcesManager.registerResource( ":IR_SHs", this._sh_texture ); //debug
	}

	///prepare data
	var data = new Float32Array( this._irradiance_shs.length * 27 );
	for(var i = 0; i < this._irradiance_shs.length; ++i)
	{
		var shs = this._irradiance_shs[i];
		if(shs) //if you do not regenerate all there could be missing SHs
			data.set( shs, i*27 );
	}
	
	//upload to GPU
	if( sh_texture_type == sh_temp_texture_type )
		this._sh_texture.uploadData( data, { no_flip: true }, true );
	else 
	{
		//we cannot upload Float16 directly, so we use the trick of uploading at 32bits and copying to 16 bits
		if( !this._sh_temp_texture || this._sh_temp_texture.height != this._sh_temp_texture.length || this._sh_temp_texture.type != sh_temp_texture_type )
			this._sh_temp_texture = new GL.Texture(9, this._irradiance_shs.length, { format: gl.RGB, type: sh_temp_texture_type, magFilter: gl.NEAREST, minFilter: gl.NEAREST, wrap: gl.CLAMP_TO_EDGE });
		this._sh_temp_texture.uploadData( data, { no_flip: true }, true );
		this._sh_temp_texture.copyTo( this._sh_texture );
	}

	//uniforms
	var matrix = this._uniforms.u_irradiance_imatrix;
	matrix.set( this._irradiance_matrix );
	mat4.invert( matrix, matrix );
}

/*
IrradianceCache.prototype.getIrradiance = function( position, normal, out )
{	
	out = out || vec3.create();

	var subs = this._irradiance_subdivisionsl;
	var imatrix = this._uniforms.u_irradiance_imatrix;
	var shs = this._irradiance_shs;
	if(!shs)
		return null;

	var local_pos = vec3.create();
	vec3.transformMat4( local_pos, position, imatrix );
	Math.clamp( local_pos[0], 0, subs[0] - 1 );
	Math.clamp( local_pos[1], 0, subs[1] - 1 );
	Math.clamp( local_pos[2], 0, subs[2] - 1 );
	var floor_probes = subs[0] * subs[2];
	var total_probes = floor_probes * subs[1];
	var i = Math.floor(local_pos[0]) + Math.floor(local_pos[2]) * subs[0] + Math.floor(local_pos[1]) * floor_probes;
	var sh = shs[i];

	//TODO: read coeffs
	return out;
}
*/

IrradianceCache.prototype.getSizeInBytes = function()
{
	return this._irradiance_shs.length * 27 * 4;//( this.high_precision ? 4 : 1 );
}

//helper
IrradianceCache.prototype.showStats = function()
{
	var max_coeffs = new Float32Array(9);
	var min_coeffs = new Float32Array(9);
	var avg_coeffs = new Float32Array(9);

	for( var i = 0; i < this._irradiance_shs.length; ++i)
	{
	}
}

IrradianceCache.prototype.fromData = function(data)
{
	if(!data)
		return;

	var uint8view = new Uint8Array( data );

	var header_str = LS.typedArrayToString( uint8view.subarray(0,4) );
	if( header_str != "IR_C" )
	{
		console.error("Irradiance data do not match");
		return false;
	}

	var dv = new DataView(data);
	var subs = this._irradiance_subdivisions;
	subs[0] = dv.getUint8(4);
	subs[1] = dv.getUint8(5);
	subs[2] = dv.getUint8(6);
	var num_probes = subs[0] * subs[1] * subs[2];

	var float32view = new Float32Array( data, 16 );

	this._irradiance_matrix.set( float32view.subarray(0,16) );

	var shs = this._irradiance_shs;
	shs.length = num_probes;
	for( var i = 0; i < shs.length; ++i)
		shs[i] = float32view.subarray( 16 + i*9*3, 16 + (i+1)*9*3 );

	return true;
}

IrradianceCache.prototype.toData = function()
{
	var subs = this._irradiance_subdivisions;
	var num_probes = subs[0] * subs[1] * subs[2];
	var data = new ArrayBuffer( 16 + 16*4 + num_probes * 9 * 3 * 4); //16 bytes header + mat4x4 + probes(9,3 channels, float32)

	var uint8view = new Uint8Array( data );
	uint8view.set( LS.stringToTypedArray("IR_C"), 0 ); //from Irradiance Cache

	var dv = new DataView(data);
	dv.setUint8(4,subs[0]);
	dv.setUint8(5,subs[1]);
	dv.setUint8(6,subs[2]);

	var float32view = new Float32Array( data, 16 );
	float32view.set( this._irradiance_matrix );

	var shs = this._irradiance_shs;
	for( var i = 0; i < shs.length; ++i)
	{
		var sh = shs[i];
		if(sh)
			float32view.set( sh, 16 + i*9*3 );
	}

	return data;
}

IrradianceCache.prototype.renderEditor = function( is_selected )
{
	if(!this.enabled || !IrradianceCache.show_probes)
		return;

	var shader = GL.Shader.getCubemapShowShader();
	var sh_shader = IrradianceCache.sh_shader;
	if(!sh_shader)
		IrradianceCache.sh_shader = sh_shader = new GL.Shader( LS.Draw.vertex_shader_code, IrradianceCache.fs_shader_code );

	var mesh = LS.Renderer._sphere_mesh;
	var subs = this.subdivisions;
	var size = this.size;
	var iscale = vec3.fromValues( size[0]/subs[0], size[1]/subs[1], size[2]/subs[2] );

	var mesh = LS.Renderer._sphere_mesh;

	var default_cubemap = IrradianceCache.default_cubemap;
	if(!default_cubemap)
		default_cubemap = IrradianceCache.default_cubemap = new GL.Texture(1,1,{ texture_type: GL.TEXTURE_CUBE_MAP, format: GL.RGB, pixel_data:[255,255,255] });

	var position = vec3.create();
	var matrix = this._irradiance_matrix;
	mat4.identity( matrix );
	if( this._root.transform )
		this._root.transform.getGlobalMatrix( matrix );
	mat4.scale( matrix, matrix, iscale );
	var start = mat4.multiplyVec3(vec3.create(),matrix,[0,0,0]);
	var end = mat4.multiplyVec3(vec3.create(),matrix,subs);
	var camera = LS.Renderer._current_camera;

	var i = 0;
	for(var y = 0; y < subs[1]; ++y)
	for(var z = 0; z < subs[2]; ++z)
	for(var x = 0; x < subs[0]; ++x)
	{
		position[0] = x + 0.5;
		position[1] = y + 0.5;
		position[2] = z + 0.5;
		mat4.multiplyVec3( position, matrix, position );

		if( camera && !camera.testSphereInsideFrustum( position, IrradianceCache.probes_size ) )
		{
			i+=1;
			continue;
		}

		LS.Draw.push();
		LS.Draw.translate( position );
		LS.Draw.scale( IrradianceCache.probes_size );

		if(IrradianceCache.show_cubemaps )
		{
			var texture = this._irradiance_cubemaps[ i ] || default_cubemap;
			texture.bind(0);
			LS.Draw.renderMesh( mesh, GL.TRIANGLES, shader );
		}
		else
		{
			var coeffs = this._irradiance_shs[i] || IrradianceCache.default_coeffs;
			sh_shader.uniforms({ u_sh_coeffs: coeffs });
			LS.Draw.renderMesh( mesh, GL.TRIANGLES, sh_shader );
		}

		LS.Draw.pop();
		i++;
	}

	//gl.disable( gl.DEPTH_TEST );
	//LS.Draw.renderLines([start,end],[[0,1,1,1],[1,1,1,1]]);
	//gl.enable( gl.DEPTH_TEST );

}

LS.registerComponent( IrradianceCache );

IrradianceCache.include_code = "\n\
const float Pi = 3.141592654;\n\
const float CosineA0 = Pi;\n\
const float CosineA1 = (2.0 * Pi) / 3.0;\n\
const float CosineA2 = Pi * 0.25;\n\
\n\
struct SH9\n\
{\n\
    float c[9];\n\
};\n\
\n\
struct SH9Color\n\
{\n\
    vec3 c[9];\n\
};\n\
\n\
void SHCosineLobe(in vec3 dir, out SH9 sh)\n\
{\n\
	\n\
    // Band 0\n\
    sh.c[0] = 0.282095 * CosineA0;\n\
	\n\
    // Band 1\n\
    sh.c[1] = 0.488603 * dir.y * CosineA1;\n\
    sh.c[2] = 0.488603 * dir.z * CosineA1;\n\
    sh.c[3] = 0.488603 * dir.x * CosineA1;\n\
	\n\
    // Band 2\n\
	#ifndef SH_LOW\n\
	\n\
    sh.c[4] = 1.092548 * dir.x * dir.y * CosineA2;\n\
    sh.c[5] = 1.092548 * dir.y * dir.z * CosineA2;\n\
    sh.c[6] = 0.315392 * (3.0 * dir.z * dir.z - 1.0) * CosineA2;\n\
    sh.c[7] = 1.092548 * dir.x * dir.z * CosineA2;\n\
    sh.c[8] = 0.546274 * (dir.x * dir.x - dir.y * dir.y) * CosineA2;\n\
	#endif\n\
	\n\
}\n\
\n\
vec3 ComputeSHIrradiance(in vec3 normal, in SH9Color radiance)\n\
{\n\
    // Compute the cosine lobe in SH, oriented about the normal direction\n\
    SH9 shCosine;\n\
	SHCosineLobe(normal, shCosine);\n\
	\n\
    // Compute the SH dot product to get irradiance\n\
    vec3 irradiance = vec3(0.0);\n\
	#ifndef SH_LOW\n\
	const int num = 9;\n\
	#else\n\
	const int num = 4;\n\
	#endif\n\
    for(int i = 0; i < num; ++i)\n\
        irradiance += radiance.c[i] * shCosine.c[i];\n\
	\n\
    return irradiance;\n\
}\n\
\n\
vec3 ComputeSHDiffuse(in vec3 normal, in SH9Color radiance)\n\
{\n\
    // Diffuse BRDF is albedo / Pi\n\
    return ComputeSHIrradiance( normal, radiance ) * (1.0 / Pi);\n\
}\n\
";

IrradianceCache.fs_shader_code = "\n\
precision mediump float;\n\
" + IrradianceCache.include_code + "\n\
varying vec3 v_normal;\n\
uniform vec3 u_sh_coeffs[9];\n\
void main()\n\
{\n\
	vec3 normal = normalize( v_normal );\n\
	SH9Color coeffs;\n\
	coeffs.c[0] = u_sh_coeffs[0];\n\
	coeffs.c[1] = u_sh_coeffs[1];\n\
	coeffs.c[2] = u_sh_coeffs[2];\n\
	coeffs.c[3] = u_sh_coeffs[3];\n\
	coeffs.c[4] = u_sh_coeffs[4];\n\
	coeffs.c[5] = u_sh_coeffs[5];\n\
	coeffs.c[6] = u_sh_coeffs[6];\n\
	coeffs.c[7] = u_sh_coeffs[7];\n\
	coeffs.c[8] = u_sh_coeffs[8];\n\
	gl_FragColor = vec4( max( vec3(0.001), ComputeSHDiffuse( normal, coeffs ) ), 1.0 );\n\
}\n\
";

var cubemapFaceNormals = [
  [ [0, 0, -1], [0, -1, 0], [1, 0, 0] ],  // posx
  [ [0, 0, 1], [0, -1, 0], [-1, 0, 0] ],  // negx

  [ [1, 0, 0], [0, 0, 1], [0, 1, 0] ],    // posy
  [ [1, 0, 0], [0, 0, -1], [0, -1, 0] ],  // negy

  [ [1, 0, 0], [0, -1, 0], [0, 0, 1] ],   // posz
  [ [-1, 0, 0], [0, -1, 0], [0, 0, -1] ]  // negz
]

// give me a cubemap, its size and number of channels
// and i'll give you spherical harmonics
function computeSH( faces, cubemapSize, ch) {
  var size = cubemapSize || 128
  var channels = ch || 4
  var cubeMapVecs = []

  // generate cube map vectors
  faces.forEach( function(face, index) {
    var faceVecs = []
    for (var v = 0; v < size; v++) {
      for (var u = 0; u < size; u++) {
        var fU = (2.0 * u / (size - 1.0)) - 1.0
        var fV = (2.0 * v / (size - 1.0)) - 1.0

        var vecX = []
        vec3.scale(vecX, cubemapFaceNormals[index][0], fU)
        var vecY = []
        vec3.scale(vecY, cubemapFaceNormals[index][1], fV)
        var vecZ = cubemapFaceNormals[index][2]

        var res = []
        vec3.add(res, vecX, vecY)
        vec3.add(res, res, vecZ)
        vec3.normalize(res, res)

        faceVecs.push(res)
      }
    }
    cubeMapVecs.push(faceVecs)
  })

  // generate shperical harmonics
  var sh = [
    new Float32Array(3),
    new Float32Array(3),
    new Float32Array(3),
    new Float32Array(3),
    new Float32Array(3),
    new Float32Array(3),
    new Float32Array(3),
    new Float32Array(3),
    new Float32Array(3)
  ]
  var weightAccum = 0
  

  faces.forEach( function(face, index) {
    var pixels = face
    var gammaCorrect = true
	var low_precision = true
    if (Object.prototype.toString.call(pixels) === '[object Float32Array]')
	{
		gammaCorrect = false // this is probably HDR image, already in linear space
		low_precision = false;
	}
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        var texelVect = cubeMapVecs[index][y * size + x]

        var weight = texelSolidAngle(x, y, size, size)
        // forsyths weights
        var weight1 = weight * 4 / 17
        var weight2 = weight * 8 / 17
        var weight3 = weight * 15 / 17
        var weight4 = weight * 5 / 68
        var weight5 = weight * 15 / 68

        var dx = texelVect[0]
        var dy = texelVect[1]
        var dz = texelVect[2]

        for (var c = 0; c < 3; c++) {
          var value = pixels[y * size * channels + x * channels + c]
		  if(low_precision)
			  value /= 255;
          if (gammaCorrect)
			  value = Math.pow(value, 2.2)
		  //value = Math.clamp( value, 0, 2 );
	
		  sh[0][c] += value * weight1
          sh[1][c] += value * weight2 * dy
          sh[2][c] += value * weight2 * dz
          sh[3][c] += value * weight2 * dx

          sh[4][c] += value * weight3 * dx * dy
          sh[5][c] += value * weight3 * dy * dz
          sh[6][c] += value * weight4 * (3.0 * dz * dz - 1.0)

          sh[7][c] += value * weight3 * dx * dz
          sh[8][c] += value * weight5 * (dx * dx - dy * dy)

          weightAccum += weight
        }
      }
    }
  })

  var linear_sh = new Float32Array(sh.length*3);
  for (var i = 0; i < sh.length; i++) {
    linear_sh[i*3] = sh[i][0] *= 4 * Math.PI / weightAccum;
    linear_sh[i*3+1] = sh[i][1] *= 4 * Math.PI / weightAccum;
    linear_sh[i*3+2] = sh[i][2] *= 4 * Math.PI / weightAccum;
  }

  return linear_sh
}

function texelSolidAngle (aU, aV, width, height) {
  // transform from [0..res - 1] to [- (1 - 1 / res) .. (1 - 1 / res)]
  // ( 0.5 is for texel center addressing)
  var U = (2.0 * (aU + 0.5) / width) - 1.0
  var V = (2.0 * (aV + 0.5) / height) - 1.0

  // shift from a demi texel, mean 1.0 / size  with U and V in [-1..1]
  var invResolutionW = 1.0 / width
  var invResolutionH = 1.0 / height

  // U and V are the -1..1 texture coordinate on the current face.
  // get projected area for this texel
  var x0 = U - invResolutionW
  var y0 = V - invResolutionH
  var x1 = U + invResolutionW
  var y1 = V + invResolutionH
  var angle = areaElement(x0, y0) - areaElement(x0, y1) - areaElement(x1, y0) + areaElement(x1, y1)

  return angle
}

function areaElement (x, y) {
  return Math.atan2(x * y, Math.sqrt(x * x + y * y + 1.0))
}




// IRRADIANCE SHADER BLOCK *************************************
var irradiance_code = "\n\
	uniform sampler2D irradiance_texture;\n\
	uniform vec3 u_irradiance_subdivisions;\n\
	uniform vec3 u_irradiance_color;\n\
	uniform mat4 u_irradiance_imatrix;\n\
	//uniform float u_irradiance_debug;\n\
	uniform float u_irradiance_distance;\n\
	" + ( IrradianceCache.use_sh_low ? "#define SH_LOW" : "" ) + "\n\
	\n\
	" + IrradianceCache.include_code + "\n\
	vec3 computeSHRadianceAtLocalPos( in vec3 local_pos, in vec3 normal )\n\
	{\n\
		float floor_probes = u_irradiance_subdivisions.x * u_irradiance_subdivisions.z;\n\
		float total_probes = floor_probes * u_irradiance_subdivisions.y;\n\
		float i = floor(local_pos.x) + floor(local_pos.z) * u_irradiance_subdivisions.x + floor(local_pos.y) * floor_probes;\n\
		i = (i+0.5) / (total_probes);\n\
		SH9Color coeffs;\n\
		coeffs.c[0] = texture2D( irradiance_texture, vec2(0.5/9.0, i)).xyz;\n\
		coeffs.c[1] = texture2D( irradiance_texture, vec2(1.5/9.0, i)).xyz;\n\
		coeffs.c[2] = texture2D( irradiance_texture, vec2(2.5/9.0, i)).xyz;\n\
		coeffs.c[3] = texture2D( irradiance_texture, vec2(3.5/9.0, i)).xyz;\n\
		#ifndef SH_LOW\n\
		coeffs.c[4] = texture2D( irradiance_texture, vec2(4.5/9.0, i)).xyz;\n\
		coeffs.c[5] = texture2D( irradiance_texture, vec2(5.5/9.0, i)).xyz;\n\
		coeffs.c[6] = texture2D( irradiance_texture, vec2(6.5/9.0, i)).xyz;\n\
		coeffs.c[7] = texture2D( irradiance_texture, vec2(7.5/9.0, i)).xyz;\n\
		coeffs.c[8] = texture2D( irradiance_texture, vec2(8.5/9.0, i)).xyz;\n\
		#endif\n\
		return max( vec3(0.001), ComputeSHDiffuse( normal, coeffs ) );\n\
	}\n\
	float irr_expFunc(float f)\n\
	{\n\
		//f = f*f*f*(f*(f*6.0-15.0)+10.0);\n\
		//if( f < 0.0 || f > 1.0 ) return 0.0;\n\
		return f;\n\
	}\n\
	vec3 computeSHRadianceAtPositionSmooth( in vec3 pos, in vec3 normal )\n\
	{\n\
		vec3 local_pos = (u_irradiance_imatrix * vec4(pos + u_irradiance_distance * normal, 1.0)).xyz - vec3(0.5);\n\
		local_pos = clamp( local_pos, vec3(0.0), u_irradiance_subdivisions - vec3(1.0));\n\
		float fx = fract(local_pos.x);\n\
		float fy = 1.0 - fract(local_pos.y);\n\
		float fz = 1.0 - fract(local_pos.z);\n\
		fx = irr_expFunc(fx);\n\
		fy = irr_expFunc(fy);\n\
		fz = irr_expFunc(fz);\n\
		vec3 LTF = computeSHRadianceAtLocalPos( vec3( floor(local_pos.x), ceil(local_pos.y), ceil(local_pos.z)), normal );\n\
		vec3 LTB = computeSHRadianceAtLocalPos( vec3( floor(local_pos.x), ceil(local_pos.y), floor(local_pos.z)), normal );\n\
		vec3 RTF = computeSHRadianceAtLocalPos( vec3( ceil(local_pos.x), ceil(local_pos.y), ceil(local_pos.z)), normal );\n\
		vec3 RTB = computeSHRadianceAtLocalPos( vec3( ceil(local_pos.x), ceil(local_pos.y), floor(local_pos.z)), normal );\n\
		vec3 LBF = computeSHRadianceAtLocalPos( vec3( floor(local_pos.x), floor(local_pos.y), ceil(local_pos.z)) , normal);\n\
		vec3 LBB = computeSHRadianceAtLocalPos( vec3( floor(local_pos.x), floor(local_pos.y), floor(local_pos.z)), normal);\n\
		vec3 RBF = computeSHRadianceAtLocalPos( vec3( ceil(local_pos.x), floor(local_pos.y), ceil(local_pos.z)), normal );\n\
		vec3 RBB = computeSHRadianceAtLocalPos( vec3( ceil(local_pos.x), floor(local_pos.y), floor(local_pos.z)), normal);\n\
		vec3 LT = mix(LTF,LTB,fz);\n\
		vec3 LB = mix(LBF,LBB,fz);\n\
		vec3 L = mix(LT,LB,fy);\n\
		vec3 RT = mix(RTF,RTB,fz);\n\
		vec3 RB = mix(RBF,RBB,fz);\n\
		vec3 R = mix(RT,RB,fy);\n\
		return mix(L,R,fx);\n\
		\n\
	}\n\
	vec3 computeSHRadianceAtPosition( in vec3 pos, in vec3 normal )\n\
	{\n\
		vec3 local_pos = (u_irradiance_imatrix * vec4(pos + u_irradiance_distance * normal, 1.0)).xyz - vec3(0.5);\n\
		local_pos = clamp( local_pos, vec3(0.0), u_irradiance_subdivisions - vec3(1.0));\n\
		return computeSHRadianceAtLocalPos( local_pos, normal );\n\
		\n\
	}\n\
	\n\
	void applyIrradiance( in Input IN, in SurfaceOutput o, inout FinalLight FINALLIGHT )\n\
	{\n\
		FINALLIGHT.Ambient = o.Ambient * u_irradiance_color * computeSHRadianceAtPositionSmooth( IN.worldPos, o.Normal );\n\
	}\n\
";

var irradiance_disabled_code = "\n\
	void applyIrradiance( in Input IN, in SurfaceOutput o, inout FinalLight FINALLIGHT )\n\
	{\n\
	}\n\
";

//uniform grid
var irradiance_block = new LS.ShaderBlock("applyIrradiance");
ShaderMaterial.irradiance_block = irradiance_block;
irradiance_block.addCode( GL.FRAGMENT_SHADER, irradiance_code, irradiance_disabled_code );
irradiance_block.register( true );

var irradiance_single_code = "\n\
	uniform vec3 u_sh_coeffs[9];\n\
	" + IrradianceCache.include_code + "\n\
	void applyIrradiance( in Input IN, in SurfaceOutput o, inout FinalLight FINALLIGHT )\n\
	{\n\
		SH9Color coeffs;\n\
		coeffs.c[0] = u_sh_coeffs[0];\n\
		coeffs.c[1] = u_sh_coeffs[1];\n\
		coeffs.c[2] = u_sh_coeffs[2];\n\
		coeffs.c[3] = u_sh_coeffs[3];\n\
		coeffs.c[4] = u_sh_coeffs[4];\n\
		coeffs.c[5] = u_sh_coeffs[5];\n\
		coeffs.c[6] = u_sh_coeffs[6];\n\
		coeffs.c[7] = u_sh_coeffs[7];\n\
		coeffs.c[8] = u_sh_coeffs[8];\n\
		vec3 irr_color = ComputeSHDiffuse( o.Normal, coeffs );\n\
		FINALLIGHT.Ambient = o.Ambient * irr_color;\n\
	}\n\
";

//single
var irradiance_single_block = new LS.ShaderBlock("applyIrradianceSingle");
ShaderMaterial.irradiance_single_block = irradiance_single_block;
irradiance_single_block.addCode( GL.FRAGMENT_SHADER, irradiance_single_code, irradiance_disabled_code );
irradiance_single_block.register( true );

