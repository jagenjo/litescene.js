///@INFO: UNCOMMON
//WIP to allow to bake info per vertex

function VertexInfo(o)
{
	this.enabled = true;

	this._stream_name = "a_extra4";
	this._stream_channels = 4;
	this.stream_data = null;
	this.stream_type = GL.STATIC_DRAW;

	this._target_render_instance = null;
	this._must_update = false;
	this._buffer = null;

	if(o)
		this.configure(o);
}

VertexInfo["@stream_channels"] = { widget: "number", min: 1, max: 4, step: 1 };
VertexInfo["@stream_type"] = { widget: "combo", values:{ "static": GL.STATIC_DRAW, "dynamic": GL.DYNAMIC_DRAW, "stream": GL.STREAM_DRAW } };

Object.defineProperty( VertexInfo.prototype, "stream_name", {
	set: function(v){ 
		this._stream_name = v;
		if( this._buffer )
			this._buffer.attribute = v;
	},
	get: function()
	{
		return this._stream_name;
	}
});

Object.defineProperty( VertexInfo.prototype, "stream_channels", {
	set: function(v){ 
		v = v|0; //remove fract
		if(v < 1 || v > 4 || v == this._stream_channels)
			return;
		this._stream_channels = v;
		this._must_update = true;
	},
	get: function()
	{
		return this._stream_channels;
	}
});

VertexInfo.prototype.buildStream = function( RI )
{
	var mesh = RI.mesh;
	if(!mesh)
		throw("mesh cannot be null");

	if( !this._enabled )
	{
		if(this._target_render_instance)
		{
			this._target_render_instance.vertex_buffers.delete[ this.__stream_name ];
			this._target_render_instance = null;
		}
		return;
	}


	var vertices = mesh.getVertexBuffer("vertices");
	if(!vertices)
		return;

	var num_vertices = vertices.data.length / 3;

	if(!this.stream_data || this.stream_data.length != (num_vertices * this.stream_channels) )
		this.stream_data = new Float32Array( num_vertices * this._stream_channels );

	if(!this._buffer)
	{
		this._buffer = new GL.Buffer( GL.ARRAY_BUFFER, this.stream_data, this._stream_channels );
		this._must_update = false;
	}

	if(this._must_update)
		this._buffer.upload( this.stream_type );

	this._target_render_instance = RI;
	RI.vertex_buffers[ this._stream_name ] = this._buffer;
}

VertexInfo.prototype.onCollectInstances = function( RIs )
{
	if(!RIs.length)
		return;
	var RI = RIs[0];
	var mesh = RI.mesh;
	if(!mesh)
		return;
	this.buildStream( RI );
}

VertexInfo.prototype.configure = function(o)
{
}

VertexInfo.prototype.serialize = function(o)
{
}


LS.registerComponent( VertexInfo );