///@INFO: GRAPHS
if(typeof(LiteGraph) != "undefined")
{
	var SHADER_COLOR = "#2a363b";
	var SHADER_BGCOLOR = "#3f4a4e";
	var SHADER_TITLE_TEXT_COLOR = "#AAA";


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

	var getOutputLinkID = LiteGraph.getOutputLinkID = function getOutputLinkID( node, num, force )
	{
		var info = node.getOutputInfo( num );	
		if((!info || !info.links || !info.links.length) && !force )
			return null;
		return "LINK_" + node.id + "_" + num;
	}

	LiteGraph.registerShaderNode = function registerShaderNode( name, ctor )
	{
		ctor.filter = "shader";
		ctor.color = SHADER_COLOR;
		ctor.bgcolor = SHADER_BGCOLOR;
		ctor.title_text_color = SHADER_TITLE_TEXT_COLOR;
		LiteGraph.registerNodeType("shader/" + name, ctor );
	}

	var typeToGLSL = {
		number: "float",
		color: "vec3",
		color4: "vec4"
	};

	LiteGraph.generatePreviewShader = function(node)
	{
		//get ancestors
		var nodes = node.graph.getAncestors(node);
		var context = { uniforms: [] };
		var graph_code = "";
		var nodes = this._graph._nodes_in_order;
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

	}

	//base function
	/*
	function ShaderCodeFragment( code )
	{
		this.id = -1;
		this.code = "";
		this.inputs = [];
		this.outputs = [];
		this.properties = [];
	}

	ShaderCodeFragment.prototype.toString = function()
	{
		
	}

	//use
	function LGraphShaderFloat()
	{
		this.addOutput("v","number");
		this.properties = { value: 0, uniform: "" };
	}

	LGraphShaderFloat.prototype.onGenerateCode = function( context )
	{
		if(!this._fragment)
			this._fragment = new ShaderCodeFragment("float @OUT_0 = @PROP_0;\n");
		var output = getOutputLinkID( this, 0 );
		this._fragment.outputs[0] = output;
		this.setOutputData(0, this._fragment );
	}

	function LGraphShaderScale()
	{
		this.addInput("in","number");
		this.addInput("f","number");
		this.addOutput("out","number");
	}

	LGraphShaderScale.prototype.onGenerateCode = function( context )
	{
		if(!this._fragment)
			this._fragment = new ShaderCodeFragment("float @OUT_0 = @PROP_0;\n");
		var output = getOutputLinkID( this, 0 );
		this._fragment.outputs[0] = output;
		this.setOutputData(0, this._fragment );
	}
	*/

	function createShaderConstantNode( type, value )
	{
		var original_type = type;
		var ctor_code = "this.addOutput(\"v\",\""+type+"\");\n";
		ctor_code += "this.properties = { value: "+JSON.stringify(value)+", uniform:\"\"};\n";
		var ctor = new Function( ctor_code );

		type = typeToGLSL[type] || type;

		var exec_code = "if( lang != \"glsl\" ) return \"\";\n";
		exec_code += "var output = LiteGraph.getOutputLinkID( this, 0, true );\n";
		exec_code += "if(this.properties.uniform)\n 	{ context.uniforms.push({ name: this.properties.uniform, link_name: output, type: \""+type+"\", value: this.properties.value });\n return \"\";	}";
		exec_code += "return \"\\t "+type+" \"+output+\" = "+type+"(\"+String(this.properties.value)+\");\\n\";\n";
		ctor.prototype.onGetCode = new Function( "lang","context", exec_code );
				
		LiteGraph.registerShaderNode( original_type.toLowerCase(), ctor );
		ctor.title = original_type;
		ctor.desc = "Shader constant " + original_type;

		ctor.prototype.getTitle = function()
		{
			if(this.flags.collapsed)
				return String( this.properties.value );
			return this.title;
		}

		ctor.prototype.onDrawBackground = function(){ 
			if( this.properties.value.length < 5 )
				this.outputs[0].label = String( this.properties.value );
		}
		return ctor;
	}

	createShaderConstantNode("number", 1 );
	createShaderConstantNode("vec2", [0,0] );
	createShaderConstantNode("vec3", [0,0,0] );
	createShaderConstantNode("color", [1,1,1] );
	createShaderConstantNode("vec4", [0,0,0,0] );
	createShaderConstantNode("color4", [1,1,1,1] );
	createShaderConstantNode("mat3", [1,0,0,0,1,0,0,0,1] );
	createShaderConstantNode("mat4", [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1] );

	function createShaderOperationNode( name, inputs, output, op_code )
	{
		if(inputs.length >= 10)
			throw("cannot be used with more than 10 vars, regexp not supporting it");

		var ctor_code = "this.addOutput(\"v\",\""+output+"\");\n";
		for(var i = 0; i < inputs.length; ++i)
			ctor_code += "this.addInput(\"" + String.fromCharCode(65+i)	+ "\",\"" + inputs[i] + "\");\n";
		var ctor = new Function( ctor_code );

		var exec_code = "	if( lang != \"glsl\" ) return \"\";\n";
		exec_code += "	var code = \"\";\n";
		for(var i = 0; i < inputs.length; ++i)
		{
			var type = typeToGLSL[inputs[i]] || inputs[i];
			exec_code += "var input_" + i + " = LiteGraph.getInputLinkID( this, "+i+" );\n";
			exec_code += "if(input_" + i + " == null) input_" + i + " = \"" + type + "(1.0)\";\n";
			op_code = op_code.replace( new RegExp("@" + i,"gi"), "\" + input_" + i + " + \"");
		}

		exec_code += "	var output = LiteGraph.getOutputLinkID(this, 0, true);\n";
		exec_code += "	return \"\\t  "+(typeToGLSL[output] || output)+" \"+output+\" = "+op_code+";\\n\";\n";
		ctor.prototype.onGetCode = new Function( "lang", exec_code );
				
		ctor.title = name;
		ctor.filter = "shader";
		LiteGraph.registerShaderNode( name.toLowerCase(), ctor );

		return ctor;
	}

	createShaderOperationNode("Add Float", ["number","number"], "number", "@0 + @1" ).title = "A+B";
	createShaderOperationNode("Add Vec3", ["vec3","vec3"], "vec3", "@0 + @1" );
	createShaderOperationNode("Sub Vec3", ["vec3","vec3"], "vec3", "@0 - @1" );
	createShaderOperationNode("Sub Float", ["number","number"], "number", "@0 - @1" ).title = "A-B";
	createShaderOperationNode("Normalize Vec2", ["vec2"], "vec2", "normalize(@0)" );
	createShaderOperationNode("Normalize Vec3", ["vec3"], "vec3", "normalize(@0)" );
	createShaderOperationNode("Exp Float", ["number"], "number", "exp(@0)" );
	createShaderOperationNode("Pow Float", ["number","number"], "number", "pow(@0,@1)" );
	createShaderOperationNode("Pow Vec3", ["vec3","number"], "vec3", "pow(@0,@1)" );
	createShaderOperationNode("Float->Vec3", ["number"], "vec3", "vec3(@0)" );
	createShaderOperationNode("Dot", ["vec3","vec3"], "number", "dot(@0,@1)" );

	function LGraphShaderSurface()
	{
		this.addInput("Albedo","vec3");
		this.addInput("Emission","vec3");
		this.addInput("Normal","vec3");
		this.addInput("Specular","number");
		this.addInput("Gloss","number");
		this.addInput("Reflectivity","number");
		this.addInput("Alpha","number");
		this.size = [90,110];

		this.properties = {};
	}

	LGraphShaderSurface.title = "Surface";
	LGraphShaderSurface.desc = "Surface properties";

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
			code += "\t o.Albedo = "+input+";\n";
		input = getInputLinkID( this, 1 );
		if( input )
			code += "\t o.Emission = "+input+";\n";
		input = getInputLinkID( this, 2 );
		if( input )
			code += "\t o.Normal = "+input+";\n";
		input = getInputLinkID( this, 3 );
		if( input )
			code += "\t o.Specular = "+input+";\n";
		input = getInputLinkID( this, 4 );
		if( input )
			code += "\t o.Gloss = "+input+";\n";
		input = getInputLinkID( this, 5 );
		if( input )
			code += "\t o.Reflectivity = "+input+";\n";
		input = getInputLinkID( this, 6 );
		if( input )
			code += "\t o.Alpha = "+input+";\n";

		return code;
	}

	LiteGraph.registerShaderNode( "surface", LGraphShaderSurface );

	function LGraphShaderColor()
	{
		this.addOutput("c","vec3");
		this.properties = {
			value: [1,1,1],
			uniform: ""
		};
	}

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

	LiteGraph.registerShaderNode( "scale", LGraphShaderScale );


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

	/*
	function LGraphShaderFloat()
	{
		this.addOutput("out","number");
		this.properties = { value: 1, uniform: "" };
	}

	LGraphShaderFloat.title = "Const";
	LGraphShaderFloat.desc = "Multiply by number";
	LGraphShaderFloat.filter = "shader";

	LGraphShaderFloat.prototype.onGetCode = function( type, context )
	{
		if(type != "glsl")
			return "";

		var output = getOutputLinkID( this, 0 );
		if(!output)
			return "";

		if(this.properties.uniform)
		{
			context.uniforms.push({ name: this.properties.uniform, link_name: output, type: "float", value: this.properties.value });
			return "";
		}

		return "float "+output+" = "+ this.properties.value.toFixed(3) +";\n";
	}

	LiteGraph.registerNodeType("shader/float", LGraphShaderFloat );
	*/

	function LGraphShaderSampler2D()
	{
		this.addOutput("out","sampler2d");
		this.properties = { name:"texture", value: "" };
	}

	LGraphShaderSampler2D.title = "Texture";
	LGraphShaderSampler2D.desc = "To pass a texture";

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
	//LiteGraph.registerShaderNode( "scale", LGraphShaderScale );


	/*
	function LGraphShaderDot()
	{
		this.addInput("A","vec3");
		this.addInput("B","vec3");
		this.addOutput("out","number");
		this.properties = {};
	}

	LGraphShaderDot.title = "Dot";
	LGraphShaderDot.desc = "Dot product of two vec3";
	LGraphShaderDot.filter = "shader";

	LGraphShaderDot.prototype.onGetCode = function( type, context )
	{
		if(type != "glsl")
			return "";

		var input_A = getInputLinkID( this, 0 );
		var input_B = getInputLinkID( this, 1 );
		var output = getOutputLinkID( this, 0 );
		if(!output || !input_A || !input_B)
			return "";

		return "\t  float "+output+" = dot("+ input_A +","+ input_B+");\n";
	}

	LiteGraph.registerNodeType("shader/dot", LGraphShaderDot );
	*/



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
		this.size = [97,126];
	}

	LGraphShaderVertex.title = "Vertex";
	LGraphShaderVertex.desc = "Reads info from vertex shader";

	LGraphShaderVertex.prototype.onGetCode = function( type, context )
	{
		if(type != "glsl")
			return "";

		var code = "";
		var output = getOutputLinkID( this, 0 );
		if(output)
			code += "\t vec3 "+output+" = IN.worldPos;\n";
		output = getOutputLinkID( this, 1 );
		if(output)
			code += "\t vec3 "+output+" = IN.vertex;\n";
		output = getOutputLinkID( this, 2 );
		if(output)
			code += "\t vec3 "+output+" = IN.worldNormal;\n";
		output = getOutputLinkID( this, 3 );
		if(output)
			code += "\t vec3 "+output+" = IN.normal;\n";
		output = getOutputLinkID( this, 4 );
		if(output)
			code += "\t vec2 "+output+" = IN.uv;\n";
		output = getOutputLinkID( this, 5 );
		if(output)
			code += "\t vec4 "+output+" = IN.screenPos;\n";
		output = getOutputLinkID( this, 6 );
		if(output)
			code += "\t vec3 "+output+" = IN.viewDir;\n";
		output = getOutputLinkID( this, 7 );
		if(output)
			code += "\t vec3 "+output+" = IN.camPos;\n";
		return code;
	}

	LiteGraph.registerShaderNode( "vertex", LGraphShaderVertex );
}