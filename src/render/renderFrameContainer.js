/*	
	RenderFrameContainer
	This class is used when you want to render the scene not to the screen but to some texture for postprocessing
	Check the CameraFX components to see it in action.
*/

function RenderFrameContainer()
{
	this.width = RenderFrameContainer.default_width;
	this.height = RenderFrameContainer.default_height;

	this.use_high_precision = false;
	this.use_depth_texture = true;
	this.use_extra_texture = false;

	this.camera = null;
}

RenderFrameContainer.default_width = 1024;
RenderFrameContainer.default_height = 512;

RenderFrameContainer.prototype.useDefaultSize = function()
{
	this.width = RenderFrameContainer.default_width;
	this.height = RenderFrameContainer.default_height;
}

RenderFrameContainer.prototype.useCanvasSize = function()
{
	this.width = gl.canvas.width;
	this.height = gl.canvas.height;
}

RenderFrameContainer.prototype.preRender = function( cameras, render_options )
{
	this.startFBO();
	//overwrite to create some buffers here attached to the current FBO

	//set depth info inside the texture
	if(this.depth_texture && cameras[0])
	{
		var camera = cameras[0];
		if(!this.depth_texture.near_far_planes)
			this.depth_texture.near_far_planes = vec2.create();
		this.depth_texture.near_far_planes[0] = camera.near;
		this.depth_texture.near_far_planes[1] = camera.far;
	}

}

RenderFrameContainer.prototype.postRender = function( cameras, render_options )
{
	this.endFBO();
	//detach FBO and render to viewport
	//render to screen
	//this.renderToViewport( this.textures["color"], true );
}

//helper in case you want have a Color and Depth texture
RenderFrameContainer.prototype.startFBO = function()
{
	//Create textures
	var format = gl.RGBA;
	var type = this.use_high_precision ? gl.HIGH_PRECISION_FORMAT : gl.UNSIGNED_BYTE;
	var width = this.width;
	var height = this.height;

	//for the color
	if(!this.color_texture || this.color_texture.width != width || this.color_texture.height != height || this.color_texture.type != type)
		this.color_texture = new GL.Texture( width, height, { filter: gl.LINEAR, format: format, type: type });

	//extra color texture (multibuffer rendering)
	if( this.use_extra_texture && (!this.extra_texture || this.extra_texture.width != width || this.extra_texture.height != height || this.extra_texture.type != type) )
		this.extra_texture = new GL.Texture( width, height, { filter: gl.LINEAR, format: format, type: type });
	else if( !this.use_extra_texture )
		this.extra_texture = null;

	//for the depth
	if( this.use_depth_texture && (!this.depth_texture || this.depth_texture.width != width || this.depth_texture.height != height) )
		this.depth_texture = new GL.Texture( width, height, { filter: gl.NEAREST, format: gl.DEPTH_COMPONENT, type: gl.UNSIGNED_INT });
	else if( !this.use_depth_texture )
		this.depth_texture = null;


	//create render buffer for depth if there is no depth texture
	var renderbuffer = null;
	if(!this.depth_texture)
	{
		var renderbuffer = this._renderbuffer = this._renderbuffer || gl.createRenderbuffer();
		renderbuffer.width = width;
		renderbuffer.height = height;
		gl.bindRenderbuffer( gl.RENDERBUFFER, renderbuffer );
	}

	var color_texture = this.color_texture;
	var depth_texture = this.depth_texture;
	var extra_texture = this.extra_texture;

	//Setup FBO
	this._fbo = this._fbo || gl.createFramebuffer();
	gl.bindFramebuffer( gl.FRAMEBUFFER, this._fbo );

	//Adjust viewport and aspect
	gl.viewport(0, 0, color_texture.width, color_texture.height );
	LS.Renderer._full_viewport.set( gl.viewport_data );
	LS.Renderer.global_aspect = (gl.canvas.width / gl.canvas.height) / (color_texture.width / color_texture.height);

	var ext = gl.extensions["WEBGL_draw_buffers"];

	//bind COLOR BUFFER
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color_texture.handler, 0);

	//bind EXTRA COLOR TEXTURE?
	if(ext && extra_texture)
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + 1, gl.TEXTURE_2D, extra_texture.handler, 0);

	//bind DEPTH texture or depth renderbuffer
	if(depth_texture)
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT,  gl.TEXTURE_2D, depth_texture.handler, 0);
	else
	{
		gl.renderbufferStorage( gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height );
		gl.framebufferRenderbuffer( gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, renderbuffer );
	}

	//Check completeness
	var complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
	if(complete !== gl.FRAMEBUFFER_COMPLETE)
		throw("FBO not complete: " + complete);

	if(ext && extra_texture)
		ext.drawBuffersWEBGL( [ gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT0 + 1] );
}

RenderFrameContainer.prototype.endFBO = function()
{
	//disable FBO
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	LS.Renderer.global_aspect = 1.0;

	//restore previous FBO and viewport
	gl.viewport( 0, 0, gl.canvas.width, gl.canvas.height );
	LS.Renderer._full_viewport.set( gl.viewport_data );
}

//Render this texture to viewport (allows to apply FXAA)
RenderFrameContainer.prototype.renderToViewport = function( texture, use_antialiasing )
{
	if(!use_antialiasing)
	{
		texture.toViewport();
		return;
	}

	var shader = GL.Shader.getFXAAShader();
	var viewport = gl.getViewport();
	var mesh = Mesh.getScreenQuad();
	texture.bind(0);
	shader.uniforms( {u_texture:0, uViewportSize: viewport.subarray(2,4), inverseVP: [1 / tex.width, 1 / tex.height]} ).draw(mesh);
}


LS.RenderFrameContainer = RenderFrameContainer;
