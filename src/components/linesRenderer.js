/**
* Helps rendering several lines
* @class LinesRenderer
* @namespace LS.Components
* @constructor
* @param {Object} object to configure from
*/
function LinesRenderer(o)
{
	this.enabled = true;
	this.max_lines = 1024;
	this._lines = [];

	//material
	this.global_opacity = 1;
	this.color = vec3.fromValues(1,1,1);
	this.additive_blending = false;

	this.line_width = 1;

	this.use_node_material = false; 
	this.premultiplied_alpha = false;
	this.in_world_coordinates = false;

	if(o)
		this.configure(o);

	this._last_id = 0;

	if(global.gl)
		this.createMesh();

	/*
	for(var i = 0; i < 2;i++)
	{
		var pos = vec3.random(vec3.create());
		vec3.scale(pos, pos, 100);
		this.addLine( [0,0,0], pos );
	}
	*/

}
LinesRenderer.icon = "mini-icon-lines.png";
LinesRenderer["@color"] = { widget: "color" };

Object.defineProperty( LinesRenderer.prototype, "lines", {
	set: function(v) { this.lines = v; },
	get: function() { return this.lines; },
	enumerable: true
});

Object.defineProperty( LinesRenderer.prototype, "num_lines", {
	set: function(v) {},
	get: function() { return this._lines.length; },
	enumerable: true
});

LinesRenderer.prototype.clear = function()
{
	this._lines.length = 0;
}

LinesRenderer.prototype.reset = LinesRenderer.prototype.clear;

//Adds a point connect to the last one
LinesRenderer.prototype.addPoint = function( point, color )
{
	//last
	var start = null;
	var start_color = null;
	if(this._lines.length)
	{
		var last = this._lines[ this._lines.length - 1 ];
		start = new Float32Array( last.subarray(3,6) );
		start_color = new Float32Array( last.subarray(10,14) );
	}
	else
	{
		start = point;
		start_color = color;
	}
	this.addLine( start, point, start_color, color );
}

LinesRenderer.prototype.addLine = function( start, end, start_color, end_color )
{
	var data = new Float32Array(3+3+4+4);
	data.set(start,0);
	data.set(end,3);

	if(start_color)
		data.set(start_color,6);
	else
		data.set([1,1,1,1],6);

	if(end_color)
		data.set(end_color,10);
	else if(start_color)
		data.set(start_color,10);
	else
		data.set([1,1,1,1],10);

	this._lines.push( data );
	this._must_update = true;

	return this._lines.length - 1;
}

LinesRenderer.prototype.setLine = function(id, start, end, start_color, end_color )
{
	var data = this._lines[id];

	if(start)
		data.set(start,0);
	if(end)
		data.set(end,3);

	if(start_color)
		data.set(start_color,6);
	if(end_color)
		data.set(end_color,10);

	this._must_update = true;
}

LinesRenderer.prototype.removeLine = function(id)
{
	this._lines.splice(id,1);
	this._must_update = true;
}


LinesRenderer.prototype.onAddedToScene = function( scene )
{
	LEvent.bind( scene, "afterRenderScene", this.onAfterRender, this);
}

LinesRenderer.prototype.onRemovedFromScene = function( scene )
{
	LEvent.unbind( scene, "afterRenderScene", this.onAfterRender, this);
}

LinesRenderer.prototype.createMesh = function ()
{
	if( this._mesh_max_lines == this.max_lines) return;

	this._vertices = new Float32Array(this.max_lines * 3 * 2); 
	this._colors = new Float32Array(this.max_lines * 4 * 2);

	this._mesh = new GL.Mesh();
	this._mesh.addBuffers({ vertices:this._vertices, colors: this._colors }, null, gl.STREAM_DRAW);
	this._mesh_max_lines = this.max_lines;
}

LinesRenderer.prototype.updateMesh = function ()
{
	if( this._mesh_max_lines != this.max_lines)
		this.createMesh();

	//update mesh
	var i = 0, f = 0;
	var vertices = this._vertices;
	var colors = this._colors;

	var lines = this._lines;
	var l = this._lines.length;
	var vl = vertices.length;

	for(var i = 0; i < l; ++i)
	{
		if( i*6 >= vl) break; //too many lines
		var p = lines[i];

		vertices.set(p.subarray(0,6), i * 6);
		colors.set(p.subarray(6,14), i * 8);
	}

	//upload geometry
	this._mesh.vertexBuffers["vertices"].data = vertices;
	this._mesh.vertexBuffers["vertices"].upload();

	this._mesh.vertexBuffers["colors"].data = colors;
	this._mesh.vertexBuffers["colors"].upload();
}

LinesRenderer.prototype.onAfterRender = function(e)
{
	if( !this._root )
		return;

	if( this._lines.length == 0 || !this.enabled )
		return;

	if( this._must_update )
		this.updateMesh();

	LS.Draw.setLineWidth( this.line_width );
	LS.Draw.renderMesh( this._mesh, GL.LINES );
}


LS.registerComponent( LinesRenderer );