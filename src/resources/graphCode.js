/**
* This is a class to contain the code from a graph, it doesnt execute the graph (this is done in GraphComponent or GraphMaterial)
* but it stores an instance of the graph that is never executed, this is used in the GraphMaterial
* It is here so different GraphComponent can share the same Graph structure and it can be stored in a JSON
* 
* @class GraphCode
* @constructor
*/

function GraphCode( data )
{
	this._data = { "object_class":"GraphCode" };
	this._modified = false;

	//graph
	this._graph = new LiteGraph.LGraph();
	this._graph._graphcode = this; //double link

	//type
	this.type = LS.GraphCode.LOGIC_GRAPH;

	//properties
	this.properties = [];

	//extra
	this.extra = {};

	//versioning
	this._version = 0;

	//this._shader_code is created in case is a shader_code

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

//used when storing/retrieving the resource
GraphCode.prototype.setData = function( data, skip_modified_flag )
{
	if(!data)
	{
		this._data = null;
		this.properties = [];
		this.type = LS.GraphCode.LOGIC_GRAPH;
		this.extra = {};
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
	
	this.type = this._data.type || LS.GraphCode.LOGIC_GRAPH;
	this.extra = this._data.extra || {};
	this.properties = this._data.properties || [];

	if(!skip_modified_flag)
	{
		this._version++;
		this._modified = true;
	}
}

GraphCode.prototype.getData = function() {
	var data = this.graph.serialize();
	data.object_class = "GraphCode";
	data.type = this.type;
	data.properties = this.properties;
	data.extra = this.extra;
	return data;
}

GraphCode.prototype.getDataToStore = function() {
	return JSON.stringify( this.getData() );
}

GraphCode.prototype.getCategory = function() {
	return "Graph";
}

GraphCode.prototype.getProperty = function(name)
{
	for(var i = 0; i < this.properties.length; ++i)
		if( this.properties[i].name == name )
			return this.properties[i];
	return null;
}

//sends changes in this graphcode to all nodes using this graph
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

//used in graph materials
//as_string for debug
GraphCode.prototype.getShaderCode = function( as_string, template )
{
	if( this._shader_code && this._code_version == this._graph._version )
	{
		if( as_string )
			return this._shader_code._code;
		return this._shader_code;
	}

	if(!this._shader_code)
		this._shader_code = new LS.ShaderCode();

	var output_node = this._graph.findNodesByClass("shader/output")[0];
	if(!output_node)
		return null;

	//get code
	var code = output_node.getShaderCode( template );
	if( as_string )
		return code;
	this._shader_code.code = code;
	this._code_version = this._graph._version;
	return this._shader_code;

	/*
	var context = {
		vs_out: "",
		vs_local: "",
		vs_global: "",
		fs_snippets: {}, //to request once snippets from LS.Shaders.snippets
		fs_functions: {}, //to add once functions code
		fs_out: "",
		fs_code: ""
	};

	//place uniforms
	for(var i = 0; i < this.properties.length; ++i)
	{
		var prop = this.properties[i];
		var type = LS.GLSLCode.types_conversor[ prop.type.toLowerCase() ] || prop.type;
		context.fs_out += "	uniform " + type + " u_" + prop.name + ";\n";
	}

	var nodes = this._graph._nodes_in_order;
	this._graph.runStep(1);
	if(nodes)
		for(var i = 0; i < nodes.length; ++i)
		{
			var node = nodes[i];
			if( node.onGetCode )
				node.onGetCode( "glsl", context );
		}

	if( as_string )
		return context.fs_code;

	//expand requested functions
	var fs_snippets_code = "";
	for(var i in context.fs_snippets)
		fs_snippets_code += "#pragma snippet \"" + i + "\"\n";
	if(fs_snippets_code)
		context.fs_out = fs_snippets_code + "\n" + context.fs_out;

	var fs_functions_code = "";
	for(var i in context.fs_functions)
		fs_functions_code += context.fs_functions[i] + "\n";
	if(fs_functions_code)
		context.fs_out = fs_functions_code + "\n" + context.fs_out;


	this._shader_code.code = LS.ShaderCode.replaceCode( template, context );
	this._code_version = this._graph._version;
	return this._shader_code;
	*/
}

LS.GraphCode = GraphCode;
LS.registerResourceClass( GraphCode );
