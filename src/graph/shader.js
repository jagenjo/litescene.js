///@INFO: GRAPHS
if(typeof(LiteGraph) != "undefined")
{
	var getInputLinkID = LiteGraph.getInputLinkID = function getInputLinkID( node, num )
	{
		var info = node.getInputInfo( num );	
		if(!info)
			return null;
		if(info.link == -1)
			return null;
		var link = node.graph.links[ info.link ];
		if(!link)
			return null;
		return "LINK_" + link.origin_id + "_" + link.origin_slot;
	}

	var getOutputLinkID = LiteGraph.getOutputLinkID = function getOutputLinkID( node, num )
	{
		var info = node.getOutputInfo( num );	
		if(!info || !info.links || !info.links.length)
			return null;
		return "LINK_" + node.id + "_" + num;
	}

	function LGraphShaderSurface()
	{
		this.addInput("Albedo","vec3");
		this.addInput("Emission","vec3");
		this.addInput("Normal","vec3");
		this.addInput("Specular","number");
		this.addInput("Gloss","number");
		this.addInput("Reflectivity","number");
		this.addInput("Alpha","number");

		this.properties = {};
	}

	LGraphShaderSurface.title = "Surface";
	LGraphShaderSurface.desc = "Surface properties";
	LGraphShaderSurface.category = "shader";

	LGraphShaderSurface.prototype.onExecute = function()
	{
	}

	LGraphShaderSurface.prototype.onGetCode = function( lang )
	{
		if( lang != "glsl" )
			return "";

		var code = "\n";
		var input = getInputLinkID( this, 0 );
		if( input )
			code += "o.Albedo = "+input+";\n";
		input = getInputLinkID( this, 1 );
		if( input )
			code += "o.Emission = "+input+";\n";
		input = getInputLinkID( this, 2 );
		if( input )
			code += "o.Normal = "+input+";\n";
		input = getInputLinkID( this, 3 );
		if( input )
			code += "o.Specular = "+input+";\n";
		input = getInputLinkID( this, 4 );
		if( input )
			code += "o.Gloss = "+input+";\n";
		input = getInputLinkID( this, 5 );
		if( input )
			code += "o.Reflectivity = "+input+";\n";
		input = getInputLinkID( this, 6 );
		if( input )
			code += "o.Alpha = "+input+";\n";

		return code;
	}

	LiteGraph.registerNodeType("shader/surface", LGraphShaderSurface );

	function LGraphShaderColor()
	{
		this.addOutput("c","vec3");
		this.properties = {
			value: [1,1,1],
			uniform: ""
		};
	}

	LGraphShaderColor.title = "Color";
	LGraphShaderColor.desc = "Color RGB";
	LGraphShaderColor.filter = "shader";

	LGraphShaderColor.prototype.onDrawBackground = function(ctx)
	{
		var rgb = this.properties.value;
		ctx.fillStyle = RGBToHex( rgb[0],rgb[1],rgb[2] );
		ctx.fillRect(0,0,this.size[0],this.size[1]);
	}

	LGraphShaderColor.prototype.onGetCode = function( type, context )
	{
		if(type != "glsl")
			return "";

		var output = getOutputLinkID( this, 0 );

		if(this.properties.uniform)
		{
			context.uniforms.push({ name: this.properties.name, link_name: output, type: "vec3", value: this.properties.value });
			return "";
		}

		return "vec3 "+output+" = vec3("+this.properties.value.toString()+");\n";
	}

	LiteGraph.registerNodeType("shader/color", LGraphShaderColor );

	//mult vec3
	function LGraphShaderScale()
	{
		this.addInput("in","vec3");
		this.addInput("f","number");
		this.addOutput("out","vec3");
	}

	LGraphShaderScale.title = "Scale";
	LGraphShaderScale.desc = "Multiply by number";
	LGraphShaderScale.filter = "shader";

	LGraphShaderScale.prototype.onGetCode = function(type)
	{
		if(type != "glsl")
			return "";
		var input_0 = getInputLinkID( this, 0 );
		var input_1 = getInputLinkID( this, 1 );
		var output = getOutputLinkID( this, 0 );
		if(input_0 && input_1 && output)
			return "vec3 "+output+" = "+ input_0 +" * "+ input_1 +";\n";
		return "";
	}

	LiteGraph.registerNodeType("shader/scale", LGraphShaderScale );


	/*
	function LGraphShaderAbs()
	{
		this.addInput("in");
		this.addOutput("out");
	}

	LGraphShaderAbs.title = "Scale";
	LGraphShaderAbs.desc = "Multiply by number";
	LGraphShaderAbs.filter = "shader";

	LGraphShaderAbs.prototype.onGetCode = function(type)
	{
		if(type != "glsl")
			return "";
		var input = getInputLinkID( this, 0 );
		var output = getOutputLinkID( this, 0 );
		if(input && output)
			return "vec3 "+output+" = "+ input_0 +" * "+ input_1 +";\n";
		return "";
	}

	LiteGraph.registerNodeType("shader/scale", LGraphShaderAbs );
	*/


	function LGraphShaderConst()
	{
		this.addOutput("out","number");
		this.properties = { value: 1, uniform: "" };
	}

	LGraphShaderConst.title = "Const";
	LGraphShaderConst.desc = "Multiply by number";
	LGraphShaderConst.filter = "shader";

	LGraphShaderConst.prototype.onGetCode = function( type, context )
	{
		if(type != "glsl")
			return "";

		var output = getOutputLinkID( this, 0 );
		if(!output)
			return "";

		if(this.properties.uniform)
		{
			context.uniforms.push({ name: this.properties.name, link_name: output, type: "float", value: this.properties.value });
			return "";
		}

		return "float "+output+" = "+ this.properties.value.toFixed(3) +";\n";
	}

	LiteGraph.registerNodeType("shader/const", LGraphShaderConst );


	function LGraphShaderSampler2D()
	{
		this.addOutput("out","sampler2d");
		this.properties = { name:"texture", value: "" };
	}

	LGraphShaderSampler2D.title = "Texture";
	LGraphShaderSampler2D.desc = "To pass a texture";
	LGraphShaderSampler2D.filter = "shader";

	LGraphShaderSampler2D.prototype.onGetCode = function( type, context )
	{
		if(type != "glsl")
			return "";

		var output = getOutputLinkID( this, 0 );
		if(!output)
			return "";
		context.uniforms.push({ name: this.properties.name, link_name: output, type: "sampler2D", value: this.properties.value });
	}

	//LiteGraph.registerNodeType("shader/sampler2D", LGraphShaderSampler2D );

	/*
		vec4 color;\n\
		vec3 vertex;\n\
		vec3 normal;\n\
		vec2 uv;\n\
		vec2 uv1;\n\
		\n\
		vec3 camPos;\n\
		vec3 viewDir;\n\
		vec3 worldPos;\n\
		vec3 worldNormal;\n\
		vec4 screenPos;\n\
	*/

	function LGraphShaderVertex()
	{
		this.addOutput("position","vec3");
		this.addOutput("local_position","vec3");
		this.addOutput("normal","vec3");
		this.addOutput("local_normal","vec3");
		this.addOutput("uv","vec2");
		this.addOutput("screen","vec4");
		this.addOutput("viewDir","vec3");
		this.addOutput("camPos","vec3");
	}

	LGraphShaderVertex.title = "Vertex";
	LGraphShaderVertex.desc = "Reads info from vertex shader";
	LGraphShaderVertex.filter = "shader";

	LGraphShaderVertex.prototype.onGetCode = function( type, context )
	{
		if(type != "glsl")
			return "";

		var code = "";
		var output = getOutputLinkID( this, 0 );
		if(output)
			code += "vec3 "+output+" = IN.worldPos;\n";
		output = getOutputLinkID( this, 1 );
		if(output)
			code += "vec3 "+output+" = IN.vertex;\n";
		output = getOutputLinkID( this, 2 );
		if(output)
			code += "vec3 "+output+" = IN.worldNormal;\n";
		output = getOutputLinkID( this, 3 );
		if(output)
			code += "vec3 "+output+" = IN.normal;\n";
		output = getOutputLinkID( this, 4 );
		if(output)
			code += "vec2 "+output+" = IN.uv;\n";
		output = getOutputLinkID( this, 5 );
		if(output)
			code += "vec4 "+output+" = IN.screenPos;\n";
		output = getOutputLinkID( this, 6 );
		if(output)
			code += "vec3 "+output+" = IN.viewDir;\n";
		output = getOutputLinkID( this, 7 );
		if(output)
			code += "vec3 "+output+" = IN.camPos;\n";
		return code;
	}

	LiteGraph.registerNodeType("shader/vertex", LGraphShaderVertex );
}