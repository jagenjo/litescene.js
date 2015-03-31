/*	RenderFrameContainer
	This class is used when you want to render one camera not to the screen but to some texture and apply postprocessing 
	Check the PostFX components to see it in action.
	There is not much in it, but it helps clearing up future features


	During the rendering the Renderer can rely the render to one RenderFrameContainer

*/

function RenderFrameContainer()
{
	this.camera = null;
}

RenderFrameContainer.prototype.preRender = function( cameras, render_options )
{
	//overwrite to create some buffers here attached to the current FBO
}

RenderFrameContainer.prototype.postRender = function( cameras, render_options )
{
	//detach FBO and render to viewport
	//render to screen
	//this.renderToViewport( this.textures["color"], true );
}

//helper in case you want have a Color and Depth texture
RenderFrameContainer.prototype.startFBO = function(width, height, use_high_precision, camera)
{
	//Create textures
	var type = use_high_precision ? gl.HIGH_PRECISION_FORMAT : gl.UNSIGNED_BYTE;
	if(!this.color_texture || this.color_texture.width != width || this.color_texture.height != height || this.color_texture.type != type)
		this.color_texture = new GL.Texture( width, height, { format: gl.RGB, filter: gl.LINEAR, type: type });

	if((!this.depth_texture || this.depth_texture.width != width || this.depth_texture.height != height) )
		this.depth_texture = new GL.Texture( width, height, { filter: gl.NEAREST, format: gl.DEPTH_COMPONENT, type: gl.UNSIGNED_INT });

	var color_texture = this.color_texture;
	var depth_texture = this.depth_texture;

	//Setup FBO
	this._fbo = this._fbo || gl.createFramebuffer();
	gl.bindFramebuffer( gl.FRAMEBUFFER, this._fbo );

	gl.viewport(0, 0, color_texture.width, color_texture.height );
	LS.Renderer._full_viewport.set( gl.viewport_data );

	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color_texture.handler, 0);
	gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT,  gl.TEXTURE_2D, depth_texture.handler, 0);

	//set depth info
	if(camera)
	{
		if(!depth_texture.near_far_planes)
			depth_texture.near_far_planes = vec2.create();
		depth_texture.near_far_planes[0] = camera.near;
		depth_texture.near_far_planes[1] = camera.far;
	}
}

RenderFrameContainer.prototype.endFBO = function()
{
	//disable FBO
	gl.bindFramebuffer(gl.FRAMEBUFFER, null);

	//restore
	gl.viewport( 0, 0, gl.canvas.width, gl.canvas.height );
	LS.Renderer._full_viewport.set( gl.viewport_data );
}

//Last step of the chain, overwrite to create special effects
RenderFrameContainer.prototype.renderToViewport = function( texture, use_antialiasing )
{
	if(!use_antialiasing)
	{
		texture.toViewport();
		return;
	}

	var shader = GL.Shader.getFXAAShader();
	var viewport = gl.getViewport(); //gl.getParameter(gl.VIEWPORT);
	var mesh = Mesh.getScreenQuad();
	texture.bind(0);
	shader.uniforms( {u_texture:0, uViewportSize: viewport.subarray(2,4), inverseVP: [1 / tex.width, 1 / tex.height]} ).draw(mesh);
}


LS.RenderFrameContainer = RenderFrameContainer;
