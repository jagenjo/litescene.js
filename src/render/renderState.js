/**
* RenderState sets how a RenderInstance should be rendered by the GPU
* It is stored in the material (although defined usually from ShaderCode) so the material can use it.
*
* @class RenderState
* @namespace LS
* @constructor
*/

function RenderState( o )
{
	this.init();

	if(o)
		this.configure(o);
}

Object.defineProperty( RenderState.prototype, "blendFunc", {
	set: function(v)
	{
		if(!v || v.length != 2)
			return;
		this.blendFunc0 = v[0];
		this.blendFunc1 = v[1];
	},
	get: function()
	{
		return [this.blendFunc0,this.blendFunc1];
	},
	enumerable: false
});

Object.defineProperty( RenderState.prototype, "colorMask", {
	set: function(v)
	{
		if(!v || v.length != 4)
			return;
		this.colorMask0 = v[0];
		this.colorMask1 = v[1];
		this.colorMask2 = v[2];
		this.colorMask3 = v[3];
	},
	get: function()
	{
		return [this.blendFunc0,this.blendFunc1];
	},
	enumerable: false
});

RenderState.default_state = {
	front_face: GL.CCW,
	cull_face: true,
	depth_test: true,
	depth_func: GL.LESS,
	depth_mask: true,
	blend: false,
	blendFunc0: GL.SRC_ALPHA,
	blendFunc1: GL.ONE_MINUS_SRC_ALPHA,
	colorMask0: true,
	colorMask1: true,
	colorMask2: true,
	colorMask3: true
};

RenderState.last_state = null;

RenderState.prototype.init = function()
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
	this.colorMask0 = true;
	this.colorMask1 = true;
	this.colorMask2 = true;
	this.colorMask3 = true;

	//stencil buffer
	this.stencil_test = false;
	this.stencil_func = 1;
	this.stencil_ref = 1;
	this.stencil_mask = 0xFF;
}

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

		//color
		gl.colorMask( state.colorMask0, state.colorMask1, state.colorMask2, state.colorMask3 );

		//stencil
		//TODO

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

	//color
	if(prev.colorMask0 !== state.colorMask0 || prev.colorMask1 !== state.colorMask1 || prev.colorMask2 !== state.colorMask2 || prev.colorMask3 !== state.colorMask3 )
		gl.colorMask( state.colorMask0, state.colorMask1, state.colorMask2, state.colorMask3 );

	//stencil
	//TODO

	//save state
	this.last_state = state;
}

RenderState.reset = function()
{
	this.enable( this.default_state );
}

RenderState.prototype.serialize = function()
{
	return LS.cloneObject(this);
}

RenderState.prototype.toJSON = RenderState.prototype.serialize;

RenderState.prototype.configure = function(o)
{
	LS.cloneObject(o,this);
}


LS.RenderState = RenderState;