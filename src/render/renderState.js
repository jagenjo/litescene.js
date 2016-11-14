/**
* RenderState sets the flags for the GPU associated with a rendering action (blending, masking, depth test, etc)
* It is stored in the material (although defined usually from ShaderCode) so the material can use it.
*
* @class RenderState
* @namespace LS
* @constructor
*/

/* gpu flags

0: front_face: GL.CCW
1: cull_face: 1
2: cull_face_mode: GL.BACK

//depth buffer
4: depth_test: 1
5: depth_mask: 1 //write in depth buffer
6: depth_func: GL.LESS
7: depth_range0: 0
8: depth_range1: 1

//blend function
9: blend: 0;
10: blendFunc0: GL.SRC_ALPHA
11: blendFunc1: GL.ONE_MINUS_SRC_ALPHA

//color mask
12:	colorMask0: 1
13:	colorMask1: 1
14:	colorMask2: 1
15:	colorMask3: 1

//stencil buffer
16: stencil_test: 0
17:	stencil_func: 1
18:	stencil_ref: 1
19:	stencil_mask: 0xFF

*/

function RenderState( o )
{
	this._data = new Uint32Array(20);
	this.init();

	if(o)
		this.configure(o);
}

Object.defineProperty( RenderState.prototype, "front_face", {
	set: function(v) { this._data[0] = v; },
	get: function() { return this._data[0];	},
	enumerable: true
});

Object.defineProperty( RenderState.prototype, "cull_face", {
	set: function(v) { this._data[1] = v ? 1 : 0; },
	get: function() { return this._data[1] !== 0;	},
	enumerable: true
});

Object.defineProperty( RenderState.prototype, "cull_face_mode", {
	set: function(v) { this._data[2] = v; },
	get: function() { return this._data[2];	},
	enumerable: true
});

Object.defineProperty( RenderState.prototype, "depth_test", {
	set: function(v) { this._data[4] = v ? 1 : 0; },
	get: function() { return this._data[4] !== 0;	},
	enumerable: true
});

Object.defineProperty( RenderState.prototype, "depth_mask", {
	set: function(v) { this._data[5] = v ? 1 : 0; },
	get: function() { return this._data[5] !== 0;	},
	enumerable: true
});

Object.defineProperty( RenderState.prototype, "depth_func", {
	set: function(v) { this._data[6] = v; },
	get: function() { return this._data[6];	},
	enumerable: true
});

Object.defineProperty( RenderState.prototype, "depth_range", {
	set: function(v) { 
		if(!v || v.length != 2)
			return;
		this._data[7] = v[0];
		this._data[8] = v[1];
	},
	get: function() { return this._data.subarray(7,9);	},
	enumerable: true
});

Object.defineProperty( RenderState.prototype, "blend", {
	set: function(v) { this._data[9] = v ? 1 : 0; },
	get: function() { return this._data[9] !== 0;	},
	enumerable: true
});

Object.defineProperty( RenderState.prototype, "blendFunc0", {
	set: function(v) { this._data[10] = v; },
	get: function() { return this._data[10];	},
	enumerable: true
});

Object.defineProperty( RenderState.prototype, "blendFunc1", {
	set: function(v) { this._data[11] = v; },
	get: function() { return this._data[11];	},
	enumerable: true
});

Object.defineProperty( RenderState.prototype, "blendFunc", {
	set: function(v)
	{
		if(!v || v.length != 2)
			return;
		this._data[10] = v[0];
		this._data[11] = v[1];
	},
	get: function()
	{
		return this._data.subarray(10,12);
	},
	enumerable: false
});

Object.defineProperty( RenderState.prototype, "colorMask0", {
	set: function(v) { this._data[12] = v ? 1 : 0; },
	get: function() { return this._data[12] !== 0;	},
	enumerable: true
});

Object.defineProperty( RenderState.prototype, "colorMask1", {
	set: function(v) { this._data[13] = v ? 1 : 0; },
	get: function() { return this._data[13] !== 0;	},
	enumerable: true
});

Object.defineProperty( RenderState.prototype, "colorMask2", {
	set: function(v) { this._data[14] = v ? 1 : 0; },
	get: function() { return this._data[14] !== 0;	},
	enumerable: true
});

Object.defineProperty( RenderState.prototype, "colorMask3", {
	set: function(v) { this._data[15] = v ? 1 : 0; },
	get: function() { return this._data[15] !== 0;	},
	enumerable: true
});

Object.defineProperty( RenderState.prototype, "colorMask", {
	set: function(v)
	{
		if(!v || v.length != 4)
			return;
		this._data[12] = v[0];
		this._data[13] = v[1];
		this._data[14] = v[2];
		this._data[15] = v[3];
	},
	get: function()
	{
		return this._data.subarray(12,16);
	},
	enumerable: false
});

Object.defineProperty( RenderState.prototype, "stencil_test", {
	set: function(v) { this._data[16] = v ? 1 : 0; },
	get: function() { return this._data[16] !== 0;	},
	enumerable: true
});

Object.defineProperty( RenderState.prototype, "stencil_func", {
	set: function(v) { this._data[17] = v; },
	get: function() { return this._data[17]; },
	enumerable: true
});

Object.defineProperty( RenderState.prototype, "stencil_ref", {
	set: function(v) { this._data[18] = v; },
	get: function() { return this._data[18]; },
	enumerable: true
});

Object.defineProperty( RenderState.prototype, "stencil_mask", {
	set: function(v) { this._data[19] = v; },
	get: function() { return this._data[19]; },
	enumerable: true
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

RenderState.prototype.copyFrom = function( rs )
{
	this._data.set( rs._data );
}


LS.RenderState = RenderState;