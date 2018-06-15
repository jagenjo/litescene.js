///@INFO: UNCOMMON
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
	this.enabled = true;
	this.corner = vec3.create();
	this.size = vec3.fromValues(10,10,10);
	this.subdivisions = new Uint8Array([4,4,4]);
	this.layers = 0xFF; //layers that can contribute to the irradiance
	this.high_precision = false;

	this.near = 0.1;
	this.far = 1000;
	this.background_color = vec4.create();

	this.mode = IrradianceCache.VERTEX_MODE;

	this._irradiance_texture = null;
	this._irradiance_cubemaps = [];

	if(o)
		this.configure(o);
}

IrradianceCache.show_probes = false;
IrradianceCache.probes_size = 1;
IrradianceCache.capture_cubemap_size = 64;
IrradianceCache.final_cubemap_size = 8;

IrradianceCache.OBJECT_MODE = 1;
IrradianceCache.VERTEX_MODE = 2;
IrradianceCache.PIXEL_MODE = 3;

IrradianceCache["@mode"] = { type:"enum", values: { "object": IrradianceCache.OBJECT_MODE, "vertex": IrradianceCache.VERTEX_MODE, "pixel": IrradianceCache.PIXEL_MODE } };
IrradianceCache["@size"] = { type:"vec3", min: 0.1, step: 0.1, precision:3 };
IrradianceCache["@subdivisions"] = { type:"vec3", min: 1, max: 100, step: 1, precision:0 };
IrradianceCache["@layers"] = { widget:"layers" };
IrradianceCache["@background_color"] = { type:"color" };

IrradianceCache.prototype.recompute = function()
{
	var subs = this.subdivisions;
	var corner = this.corner;
	var size = this.size;
	var iscale = vec3.fromValues( size[0]/subs[0], size[1]/subs[1], size[2]/subs[2] );

	//cubemap
	var type = this.high_precision ? gl.HIGH_PRECISION_FORMAT : gl.UNSIGNED_BYTE;
	var render_settings = LS.Renderer.default_render_settings;
	var old_layers = render_settings.layers;
	render_settings.layers = this.layers;
	LS.GlobalScene.info.textures.irradiance = null;

	var final_cubemap_size = IrradianceCache.final_cubemap_size;
	var texture_size = IrradianceCache.capture_cubemap_size;
	var texture_settings = { type: type, texture_type: gl.TEXTURE_CUBE_MAP, format: gl.RGB };
	var texture = this._temp_cubemap;
	if( !texture || texture.width != texture_size || texture.height != texture_size || texture.type != texture_settings.type )
		this._temp_cubemap = texture = new GL.Texture( texture_size, texture_size, texture_settings );

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

	var global_matrix = this._root.transform ? this._root.transform.getGlobalMatrixRef() : null;
   	var position = vec3.create();

	var i = 0;
	for(var x = 0; x < subs[0]; ++x)
	for(var y = 0; y < subs[1]; ++y)
	for(var z = 0; z < subs[2]; ++z)
	{
		position[0] = x * iscale[0] + corner[0];
		position[1] = y * iscale[1] + corner[1];
		position[2] = z * iscale[2] + corner[2];

		if( global_matrix )
			mat4.multiplyVec3( position, global_matrix, position );

		var cubemap = this._irradiance_cubemaps[ i ];
		if(!cubemap || cubemap.type != texture_settings.type || cubemap.width != final_cubemap_size )
			this._irradiance_cubemaps[ i ] = cubemap = new GL.Texture( final_cubemap_size, final_cubemap_size, texture_settings );

		this.captureIrradiance( position, cubemap, render_settings );

		i+=1;
	}

	//remove flags
	render_settings.layers = old_layers;
}

IrradianceCache.prototype.captureIrradiance = function( position, output_cubemap, render_settings )
{
	LS.Renderer.clearSamplers();

	var texture = this._temp_cubemap;

	//render all the scene inside the cubemap
	LS.Renderer.renderToCubemap( position, 0, texture, render_settings, this.near, this.far, this.background_color );

	//downsample
	texture.copyTo( output_cubemap );
}

IrradianceCache.prototype.encodeCacheInTexture = function()
{
		
}

IrradianceCache.prototype.renderEditor = function()
{
	if(!this.enabled || !IrradianceCache.show_probes)
		return;

	var shader = GL.Shader.getCubemapShowShader();
	var mesh = LS.Renderer._sphere_mesh;
	var subs = this.subdivisions;
	var corner = this.corner;
	var size = this.size;
	var iscale = vec3.fromValues( size[0]/subs[0], size[1]/subs[1], size[2]/subs[2] );

	var shader = GL.Shader.getCubemapShowShader();
	var mesh = LS.Renderer._sphere_mesh;

	var default_cubemap = IrradianceCache.default_cubemap;
	if(!default_cubemap)
		default_cubemap = IrradianceCache.default_cubemap = new GL.Texture(1,1,{ texture_type: GL.TEXTURE_CUBE_MAP, format: GL.RGB, pixel_data:[255,255,255] });

	var position = vec3.create();
	var global_matrix = this._root.transform ? this._root.transform.getGlobalMatrixRef() : null;
	   
	var i = 0;
	for(var x = 0; x < subs[0]; ++x)
	for(var y = 0; y < subs[1]; ++y)
	for(var z = 0; z < subs[2]; ++z)
	{
		position[0] = x * iscale[0] + corner[0];
		position[1] = y * iscale[1] + corner[1];
		position[2] = z * iscale[2] + corner[2];

		if(global_matrix)
			mat4.multiplyVec3( position, global_matrix, position );

		LS.Draw.push();
		LS.Draw.translate( position );
		LS.Draw.scale( IrradianceCache.probes_size );

		var texture = this._irradiance_cubemaps[ i++ ] || default_cubemap;
		texture.bind(0);

		LS.Draw.renderMesh( mesh, GL.TRIANGLES, shader );
		LS.Draw.pop();
	}

}

LS.registerComponent( IrradianceCache );


/*
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
  faces.forEach((face, index) => {
    var faceVecs = []
    for (let v = 0; v < size; v++) {
      for (let u = 0; u < size; u++) {
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
  let sh = [
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
  let weightAccum = 0

  faces.forEach((face, index) => {
    var pixels = face
    var gammaCorrect = true
    if (Object.prototype.toString.call(pixels) === '[object Float32Array]') gammaCorrect = false // this is probably HDR image, already in linear space
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        const texelVect = cubeMapVecs[index][y * size + x]

        const weight = texelSolidAngle(x, y, size, size)
        // forsyths weights
        const weight1 = weight * 4 / 17
        const weight2 = weight * 8 / 17
        const weight3 = weight * 15 / 17
        const weight4 = weight * 5 / 68
        const weight5 = weight * 15 / 68

        let dx = texelVect[0]
        let dy = texelVect[1]
        let dz = texelVect[2]

        for (let c = 0; c < 3; c++) {
          let value = pixels[y * size * channels + x * channels + c] / 255
          if (gammaCorrect) value = Math.pow(value, 2.2)

          // indexed by coeffiecent + color
          sh[0][c] += value * weight1
          sh[1][c] += value * weight2 * dx
          sh[2][c] += value * weight2 * dy
          sh[3][c] += value * weight2 * dz

          sh[4][c] += value * weight3 * dx * dz
          sh[5][c] += value * weight3 * dz * dy
          sh[6][c] += value * weight3 * dy * dx

          sh[7][c] += value * weight4 * (3.0 * dz * dz - 1.0)
          sh[8][c] += value * weight5 * (dx * dx - dy * dy)

          weightAccum += weight
        }
      }
    }
  })

  for (let i = 0; i < sh.length; i++) {
    sh[i][0] *= 4 * Math.PI / weightAccum
    sh[i][1] *= 4 * Math.PI / weightAccum
    sh[i][2] *= 4 * Math.PI / weightAccum
  }

  return sh
}

function texelSolidAngle (aU, aV, width, height) {
  // transform from [0..res - 1] to [- (1 - 1 / res) .. (1 - 1 / res)]
  // ( 0.5 is for texel center addressing)
  const U = (2.0 * (aU + 0.5) / width) - 1.0
  const V = (2.0 * (aV + 0.5) / height) - 1.0

  // shift from a demi texel, mean 1.0 / size  with U and V in [-1..1]
  const invResolutionW = 1.0 / width
  const invResolutionH = 1.0 / height

  // U and V are the -1..1 texture coordinate on the current face.
  // get projected area for this texel
  const x0 = U - invResolutionW
  const y0 = V - invResolutionH
  const x1 = U + invResolutionW
  const y1 = V + invResolutionH
  const angle = areaElement(x0, y0) - areaElement(x0, y1) - areaElement(x1, y0) + areaElement(x1, y1)

  return angle
}

function areaElement (x, y) {
  return Math.atan2(x * y, Math.sqrt(x * x + y * y + 1.0))
}
*/