/*	
	RenderFrameContext
	This class is used when you want to render the scene not to the screen but to some texture for postprocessing
	It helps to create the textures and bind them easily
	Check the GlobalFX and CameraFX components to see it in action.
*/

function RenderFrameContext( o )
{
	this.width = 0; //0 means the same size as the viewport, negative numbers mean reducing the texture in half N times
	this.height = 0; //0 means the same size as the viewport
	this.precision = RenderFrameContext.DEFAULT_PRECISION;
	this.filter_texture = true; //magFilter
	this.use_depth_texture = true;
	this.num_extra_textures = 0; //number of extra textures in case we want to render to several buffers

	this.adjust_aspect = false;

	this._color_texture = null;
	this._depth_texture = null;
	this._textures = []; //all color textures

	if(o)
		this.configure(o);
}

RenderFrameContext.DEFAULT_PRECISION = 0; //selected by the renderer
RenderFrameContext.LOW_PRECISION = 1; //byte
RenderFrameContext.MEDIUM_PRECISION = 2; //half_float or float
RenderFrameContext.HIGH_PRECISION = 3; //float

RenderFrameContext.DEFAULT_PRECISION_WEBGL_TYPE = GL.UNSIGNED_BYTE;

RenderFrameContext["@width"] = { type: "number", step: 1, precision: 0 };
RenderFrameContext["@height"] = { type: "number", step: 1, precision: 0 };
RenderFrameContext["@precision"] = { widget: "combo", values: { 
	"default": RenderFrameContext.DEFAULT_PRECISION, 
	"low": RenderFrameContext.LOW_PRECISION,
	"medium": RenderFrameContext.MEDIUM_PRECISION,
	"high": RenderFrameContext.HIGH_PRECISION
	}
};
RenderFrameContext["@num_extra_textures"] = { type: "number", step: 1, min: 0, max: 4, precision: 0 };

RenderFrameContext.prototype.configure = function(o)
{
	this.width = o.width || 0;
	this.height = o.height || 0;
	this.precision = o.precision || 0;
	this.filter_texture = !!o.filter_texture;
	this.adjust_aspect = !!o.adjust_aspect;
	this.use_depth_texture = !!o.use_depth_texture;
	this.num_extra_textures = o.num_extra_textures || 0;
}

RenderFrameContext.prototype.serialize = function()
{
	return {
		width: this.width,
		height:  this.height,
		filter_texture: this.filter_texture,
		precision:  this.precision,
		adjust_aspect: this.adjust_aspect,
		use_depth_texture:  this.use_depth_texture,
		num_extra_textures:  this.num_extra_textures
	};
}

RenderFrameContext.prototype.prepare = function( viewport_width, viewport_height )
{
	//compute the right size for the textures
	var width = this.width;
	var height = this.height;
	if(width == 0)
		width = viewport_width;
	else if(width < 0)
		width = viewport_width >> Math.abs( this.width ); //subsampling
	if(height == 0)
		height = viewport_height;
	else if(height < 0)
		height = viewport_height >> Math.abs( this.height ); //subsampling

	var format = gl.RGBA;
	var filter = this.filter_texture ? gl.LINEAR : gl.NEAREST ;
	var type = 0;
	switch( this.precision )
	{
		case RenderFrameContext.LOW_PRECISION:
			type = gl.UNSIGNED_BYTE; break;
		case RenderFrameContext.MEDIUM_PRECISION:
			type = gl.HIGH_PRECISION_FORMAT; break; //gl.HIGH_PRECISION_FORMAT is HALF_FLOAT_OES, if not supported then is FLOAT, otherwise is UNSIGNED_BYTE
		case RenderFrameContext.HIGH_PRECISION:
			type = gl.FLOAT; break;
		case RenderFrameContext.DEFAULT_PRECISION:
		default:
			type = RenderFrameContext.DEFAULT_PRECISION_WEBGL_TYPE; break;
	}

	var textures = this._textures;

	//for the color: check that the texture size matches
	if(!this._color_texture || this._color_texture.width != width || this._color_texture.height != height || this._color_texture.type != type)
		this._color_texture = new GL.Texture( width, height, { minFilter: gl.LINEAR, magFilter: filter, format: format, type: type });
	else
		this._color_texture.setParameter( gl.TEXTURE_MAG_FILTER, filter );

	textures[0] = this._color_texture;

	//extra color texture (multibuffer rendering)
	var total_extra = Math.min( this.num_extra_textures, 4 );
	for(var i = 0; i < total_extra; ++i) //MAX is 4
	{
		var extra_texture = textures[1 + i];
		if( (!extra_texture || extra_texture.width != width || extra_texture.height != height || extra_texture.type != type) )
			extra_texture = new GL.Texture( width, height, { minFilter: gl.LINEAR, magFilter: filter, format: format, type: type });
		else
			extra_texture.setParameter( gl.TEXTURE_MAG_FILTER, filter );
		textures[1 + i] = extra_texture;
	}

	//for the depth
	if( this.use_depth_texture && (!this._depth_texture || this._depth_texture.width != width || this._depth_texture.height != height) && gl.extensions["WEBGL_depth_texture"] )
		this._depth_texture = new GL.Texture( width, height, { filter: gl.NEAREST, format: gl.DEPTH_COMPONENT, type: gl.UNSIGNED_INT });
	else if( !this.use_depth_texture )
		this._depth_texture = null;

	//we will store some extra info in the depth texture for the near and far plane distances
	if(this._depth_texture && !this._depth_texture.near_far_planes)
		this._depth_texture.near_far_planes = vec2.create();

	//create FBO
	if( !this._fbo )
		this._fbo = new GL.FBO();

	//cut extra
	textures.length = 1 + total_extra;

	//assign textures
	this._fbo.setTextures( textures, this._depth_texture, true );
}

//Called before rendering the scene
RenderFrameContext.prototype.enable = function( render_settings, viewport )
{
	var camera = LS.Renderer._current_camera;
	viewport = viewport || gl.viewport_data;

	//create FBO and textures (pass width and height of current viewport)
	this.prepare( viewport[2], viewport[3] );

	//enable FBO
	this.enableFBO();

	//set depth info inside the texture
	if(this._depth_texture && camera)
	{
		this._depth_texture.near_far_planes[0] = camera.near;
		this._depth_texture.near_far_planes[1] = camera.far;
	}
}

RenderFrameContext.prototype.disable = function()
{
	this.disableFBO();
}

RenderFrameContext.prototype.getColorTexture = function(num)
{
	return this._textures[ num || 0 ];
}

RenderFrameContext.prototype.getDepthTexture = function()
{
	return this._depth_texture;
}

//helper in case you want have a Color and Depth texture
RenderFrameContext.prototype.enableFBO = function()
{
	if(!this._fbo)
		throw("No FBO created in RenderFrameContext");

	this._fbo.bind(); //changes viewport to full FBO size (saves old)

	LS.Renderer._full_viewport.set( gl.viewport_data );
	this._old_aspect = LS.Renderer.global_aspect;
	if(this.adjust_aspect)
		LS.Renderer.global_aspect = (gl.canvas.width / gl.canvas.height) / (this._color_texture.width / this._color_texture.height);
}

RenderFrameContext.prototype.disableFBO = function()
{
	this._fbo.unbind(); //restores viewport to old saved one
	LS.Renderer._full_viewport.set( this._fbo._old_viewport );
	LS.Renderer.global_aspect = this._old_aspect;
}

//Render the context of the fbo to the viewport (allows to apply FXAA)
RenderFrameContext.prototype.show = function( use_antialiasing )
{
	var texture = this._color_texture;
	if(!use_antialiasing)
	{
		texture.toViewport();
		return;
	}

	var shader = GL.Shader.getFXAAShader();
	var viewport = gl.getViewport();
	var mesh = GL.Mesh.getScreenQuad();
	texture.bind(0);
	shader.uniforms( {u_texture:0, uViewportSize: viewport.subarray(2,4), u_iViewportSize: [1 / texture.width, 1 / texture.height]} ).draw( mesh );
}


LS.RenderFrameContext = RenderFrameContext;
