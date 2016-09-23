//RenderState sets how a RenderInstance should be rendered by the GPU
//It is stored in the material (although defined usually from ShaderCode) so the material can use it.
function RenderState()
{
	//gpu flags
	this.front_face = GL.CCW;
	this.cull_face = true;
	//this.cull_face_mode = GL.BACK;

	//depth buffer
	this.depth_test = true;
	this.depth_mask = true; //write in depth buffer
	this.depth_func = GL.LESS;
	//depth range: never used

	//blend function
	this.blend = false;
	this.blendFunc0 = GL.SRC_ALPHA;
	this.blendFunc1 = GL.ONE_MINUS_SRC_ALPHA;
	//blend equation

	//color mask

	//stencil buffer
	//TO DO

	//pipeline flags are per node
	/*
	this.ignore_lights = false;
	this.ignore_ambient = false;

	this.seen_by_camera = true;
	this.seen_by_reflections = true;
	this.seen_by_picking = true;

	this.cast_shadows = true;
	this.receive_shadows = true;
	*/
}

RenderState.default_state = {
	front_face: GL.CCW,
	cull_face: true,
	depth_test: true,
	depth_func: GL.LESS,
	depth_mask: true,
	blend: false,
	blendFunc0: GL.SRC_ALPHA,
	blendFunc1: GL.ONE_MINUS_SRC_ALPHA
};

RenderState.last_state = null;

//helper, allows to set the blend mode from a string
RenderState.prototype.setBlendMode = function( mode )
{
	var functions = LS.BlendFunctions[ mode ];
	if(!mode || mode == LS.Blend.NORMAL )
	{
		this.blend = false;
		return;
	}

	this.blend = true;
	this.blendFunc0 = mode[0];
	this.blendFunc1 = mode[1];
}

RenderState.prototype.enable = function()
{
	RenderState.enable( this );
}

RenderState.enable = function( state, prev )
{
	if(!prev)
	{
		//faces
		gl.frontFace( state.front_face );
		if(state.cull_face)
			gl.enable( gl.CULL_FACE );
		else
			gl.disable( gl.CULL_FACE );
		//depth
		if(state.depth_test)
			gl.enable( gl.DEPTH_TEST );
		else
			gl.disable( gl.DEPTH_TEST );
		gl.depthMask( state.depth_mask );
		gl.depthFunc( state.depth_func );

		//blend
		if(state.blend)
			gl.enable( gl.BLEND );
		else
			gl.disable( gl.BLEND );
		gl.blendFunc( state.blendFunc0, state.blendFunc1 );

		this.last_state = state;
		return;
	}

	//faces
	if(prev.front_face !== state.front_face)
		gl.frontFace( state.front_face );
	if(prev.cull_face !== state.cull_face)
	{
		if(state.cull_face)
			gl.enable( gl.CULL_FACE );
		else
			gl.disable( gl.CULL_FACE );
	}

	//depth
	if(prev.depth_test !== state.depth_test)
	{
		if(state.depth_test)
			gl.enable( gl.DEPTH_TEST );
		else
			gl.disable( gl.DEPTH_TEST );
	}
	if(prev.depth_mask !== state.depth_mask)
		gl.depthMask( state.depth_mask );
	if(prev.depth_func !== state.depth_func)
		gl.depthFunc( state.depth_func );

	//blend
	if(prev.blend !== state.blend)
	{
		if(state.blend)
			gl.enable( gl.BLEND );
		else
			gl.disable( gl.BLEND );
	}
	if(prev.blendFunc0 !== state.blendFunc0 || prev.blendFunc1 !== state.blendFunc1)
		gl.blendFunc( state.blendFunc0, state.blendFunc1 );

	this.last_state = state;
}

RenderState.reset = function()
{
	this.enable( this.default_state );
}

LS.RenderState = RenderState;