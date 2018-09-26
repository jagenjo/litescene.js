/**
* This is a class to contain the code from a graph, it doesnt execute the graph (this is done in GraphComponent)
* It is here so different GraphComponent can share the same Graph structure and it can be stored in a JSON
* 
* @class GraphCode
* @constructor
*/

function GraphCode( data )
{
	this._data = { "object_class":"GraphCode" };
	this._modified = false;

	//graph?
	this._graph = new LiteGraph.LGraph();
	this._graph._graphcode = this; //double link
	this.extra = {
		type: GraphCode.LOGIC_GRAPH
	}
	this._version = 0;

	if(data)
		this.setData( data, true );
}

GraphCode.LOGIC_GRAPH = 1;
GraphCode.SHADER_GRAPH = 2;

GraphCode.EXTENSION = "GRAPH.json";
GraphCode.hasPreview = false; //should this resource use a preview image?

Object.defineProperty( GraphCode.prototype, "graph", {
	enumerable: false,
	get: function() {
		return this._graph;
	},
	set: function(v) {
		console.error("graph cannot be set manually");
	}
});

Object.defineProperty( GraphCode.prototype, "data", {
	enumerable: false,
	get: function() {
		return this.getData();
	},
	set: function(v) {
		this.setData( v );
	}
});

Object.defineProperty( GraphCode.prototype, "version", {
	enumerable: false,
	get: function() {
		return this._version;
	},
	set: function(v) {
		console.error("version cannot be set manually");
	}
});

Object.defineProperty( GraphCode.prototype, "type", {
	enumerable: false,
	get: function() {
		return this.extra.type;
	},
	set: function(v) {
		this.extra.type = v;
	}
});

//used when storing/retrieving the resource
GraphCode.prototype.setData = function( data, skip_modified_flag )
{
	if(!data)
	{
		this._data = null;
		return;
	}

	if(LS.catch_exceptions)
		try
		{
			if(data.constructor === String)
				this._data = JSON.parse( data );
			else
				this._data = JSON.parse( JSON.stringify( data ) ); //clone...
		}
		catch (err)
		{
			console.error("error in graph data");
			return;
		}
	else
	{
		if(data.constructor === String)
			this._data = JSON.parse( data );
		else
			this._data = JSON.parse( JSON.stringify( data ) ); //clone...
	}

	this._graph.configure( this._data );
	if( this._data.extra )
		this.extra = this._data.extra;

	if(!skip_modified_flag)
	{
		this._version++;
		this._modified = true;
	}
}

GraphCode.prototype.getData = function()
{
	var data = this.graph.serialize();
	data.object_class = "GraphCode";
	data.extra = this.extra;
	return data;
}

GraphCode.prototype.getDataToStore = function(){
	return JSON.stringify( this.getData() );
}

GraphCode.prototype.getCategory = function()
{
	return "Graph";
}

//sends changes in this graphcode to all nodes  using this graph
GraphCode.prototype.propagate = function()
{
	var filename = this.fullpath || this.filename;

	if( this.type == GraphCode.LOGIC_GRAPH )
	{
		var components = LS.GlobalScene.findNodeComponents( LS.Components.GraphComponent );
		for(var i = 0; i < components.length; ++i)
		{
			var comp = components[i];
			if(comp.filename != this.filename )
				continue;
			comp.graphcode = this;
		}
	}
}

//used in materials
GraphCode.prototype.getShaderCode = function( as_string )
{
	if( this._shader_code && this._code_version == this._graph._version && !as_string )
		return this._shader_code;

	if(!this._shader_code)
		this._shader_code = new LS.ShaderCode();

	var final_code = LS.SurfaceMaterial.code_template;

	var context = { uniforms: [] };
	var graph_code = "";

	var nodes = this._graph._nodes_in_order;
	if(nodes)
		for(var i = 0; i < nodes.length; ++i)
		{
			var node = nodes[i];
			if( node.onGetCode )
				graph_code += node.onGetCode( "glsl", context );
		}

	var uniforms_code = "";
	for(var i = 0; i < context.uniforms.length; ++i)
	{
		var uniform = context.uniforms[i];
		uniforms_code += "uniform " + uniform.type + " " + uniform.link_name + ";\n";
	}

	var surface_code = "void surf( in Input IN, inout SurfaceOutput o ) {\n\
	o.Albedo = vec3(1.0) * IN.color.xyz;\n\
	o.Normal = IN.worldNormal;\n\
	o.Emission = vec3(0.0);\n\
	o.Specular = 1.0;\n\
	o.Gloss = 40.0;\n\
	o.Reflectivity = 0.0;\n\
	o.Alpha = IN.color.a;\n";

	var context = {
		fs_out: uniforms_code + "\n\n" + surface_code + "\n" + graph_code + "\n}\n"
	};

	if( as_string )
		return context.fs_out;

	this._shader_code.code = LS.ShaderCode.replaceCode( final_code, context );
	this._code_version = this._graph._version;
	return this._shader_code;
}

LS.GraphCode = GraphCode;
LS.registerResourceClass( GraphCode );
