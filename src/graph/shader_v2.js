///@INFO: GRAPHS
if(typeof(LiteGraph) != "undefined")
{
	var SHADER_COLOR = "#333";
	var SHADER_BGCOLOR = "#333";
	var SHADER_TITLE_TEXT_COLOR = "#AAA";

	var getShaderNodeVarName = LiteGraph.getShaderNodeVarName = function getShaderNodeVarName( node, name )
	{
		return "VAR_" + (name || "TEMP") + "_" + node.id;
	}

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
		var output_node = node.getInputNode(num);
		if(!output_node)
			return "";

		if( output_node.getOutputLinkCode )
			return output_node.getOutputLinkCode( link.origin_slot ); //used in special cases like sampler2D
		return "LINK_" + link.origin_id + "_" + link.origin_slot;
	}

	var getOutputLinkID = LiteGraph.getOutputLinkID = function getOutputLinkID( node, num, force )
	{
		var info = node.getOutputInfo( num );	
		if((!info || !info.links || !info.links.length) && !force )
			return null;
		return "LINK_" + node.id + "_" + num;
	}

	var valueToGLSL = LiteGraph.valueToGLSL = function valueToGLSL( v, type )
	{
		var n = 5; //num decimals
		if(!type)
		{
			if(v.constructor === Number)
				type = "float";
			else if(v.length)
			{
				switch(v.length)
				{
					case 2: type = "vec2"; break;
					case 3: type = "vec3"; break;
					case 4: type = "vec4"; break;
					case 9: type = "mat3"; break;
					case 16: type = "mat4"; break;
					default:
						throw("unknown type for glsl value size");
				}
			}
			else
				throw("unknown type for glsl value: " + v.constructor);
		}
		switch(type)
		{
			case 'float': return v.toFixed(n); break;
			case 'vec2': return "vec2(" + v[0].toFixed(n) + "," + v[1].toFixed(n) + ")"; break;
			case 'color3':
			case 'vec3': return "vec3(" + v[0].toFixed(n) + "," + v[1].toFixed(n) + "," + v[2].toFixed(n) + ")"; break;
			case 'color4':
			case 'vec4': return "vec4(" + v[0].toFixed(n) + "," + v[1].toFixed(n) + "," + v[2].toFixed(n) + "," + v[3].toFixed(n) + ")"; break;
			case 'mat3': return "mat3(1.0,0.0,0.0,0.0,1.0,0.0,0.0,0.0,1.0)"; break; //not fully supported yet
			case 'mat4': return "mat4(1.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0,0.0,1.0,0.0,0.0,0.0,0.0,1.0)"; break;//not fully supported yet
			default:
				throw("unknown glsl type in valueToGLSL:", type);
		}

		return "";
	}

	LiteGraph.registerShaderNode = function registerShaderNode( name, ctor )
	{
		ctor.filter = "shader";
		ctor.color = SHADER_COLOR;
		ctor.bgcolor = SHADER_BGCOLOR;
		ctor.title_text_color = SHADER_TITLE_TEXT_COLOR;
		LiteGraph.registerNodeType("shader/" + name, ctor );
	}

	var GLSL_types = ["float","vec2","vec3","vec4","mat3","mat4","texture2D","textureCube"];
	var GLSL_types_const = ["float","vec2","vec3","vec4"];

	var typeToGLSL = {
		number: "float",
		color: "vec3",
		color4: "vec4"
	};


	//fragment shader output
	function LGraphShaderFSOutput()
	{
		this.addInput("","T,float,vec2,vec3,vec4");
		this.addInput("","T,float,vec2,vec3,vec4");
		this.addWidget("button","Config", null, this.onConfig.bind(this) );
	}

	LGraphShaderFSOutput.title = "FragOutput";
	LGraphShaderFSOutput.title_color = "#345";
	LGraphShaderFSOutput.output = "fragment";

	LGraphShaderFSOutput.prototype.onConfig = function()
	{
		
	}

	LGraphShaderFSOutput.prototype.onGetCode = function( lang, context )
	{
		if( lang != "glsl" )
			return;
		var link = getInputLinkID(this,0);
		if(!link) //not connected
			return;

		var type = this.getInputDataType(0);
		if(type == "vec4")
			context.fs_code += "	_final_color = " + link + ";\n";
		else if(type == "vec3")
			context.fs_code += "	_final_color = vec4( " + link + ",1.0);\n";
		else if(type == "vec2")
			context.fs_code += "	_final_color = vec4( " + link + ",0.0,1.0);\n";
		else if(type == "float")
			context.fs_code += "	_final_color = vec4( " + link + " );\n";
		else
			console.warn( "FSOutput type not valid", type );

		var link = getInputLinkID(this,1);
		if(link)
		{
			var type = this.getInputDataType(1);
			if(type == "vec4")
				context.fs_code += "	_final_color1 = " + link + ";\n";
			else if(type == "vec3")
				context.fs_code += "	_final_color1 = vec4( " + link + ",1.0);\n";
			else if(type == "vec2")
				context.fs_code += "	_final_color1 = vec4( " + link + ",0.0,1.0);\n";
			else if(type == "float")
				context.fs_code += "	_final_color1 = vec4( " + link + " );\n";
			else
				console.warn( "FSOutput type not valid", type );
		}
	}

	LiteGraph.registerShaderNode( "fs_output", LGraphShaderFSOutput );

	function LGraphShaderConstant()
	{
		this.addOutput("","float");

		this.properties = {
			type: "float",
			value: 0
		};

		this.addWidget("combo","type","float",null, { values: GLSL_types_const, property: "type" } );
		this.updateWidgets();
	}

	LGraphShaderConstant.title = "const";

	LGraphShaderConstant.prototype.getTitle = function()
	{
		if(this.flags.collapsed)
			return valueToGLSL( this.properties.value, this.properties.type );
		return "Const";
	}

	LGraphShaderConstant.prototype.onPropertyChanged = function(name,value)
	{
		var that = this;
		if(name == "type")
		{
			this.disconnectOutput(0);
			this.outputs[0].type = value;
			this.widgets.length = 1; //remove extra widgets
			this.updateWidgets();
		}
	}

	LGraphShaderConstant.prototype.updateWidgets = function( old_value )
	{
		var that = this;
		var old_value = this.properties.value;
		switch(this.properties.type)
		{
			case 'float': 
				this.properties.value = 0;
				this.addWidget("number","v",0,{ property: "value" });
				break;
			case 'vec2': 
				this.properties.value = old_value && old_value.length == 2 ? [old_value[0],old_value[1]] : [0,0,0];
				this.addWidget("number","x",0,function(v){ that.properties.value[0] = v; }); 
				this.addWidget("number","y",0,function(v){ that.properties.value[1] = v; }); 
				break;
			case 'vec3': 
				this.properties.value = old_value && old_value.length == 3 ? [old_value[0],old_value[1],old_value[2]] : [0,0,0];
				this.addWidget("number","x",0,function(v){ that.properties.value[0] = v; }); 
				this.addWidget("number","y",0,function(v){ that.properties.value[1] = v; }); 
				this.addWidget("number","z",0,function(v){ that.properties.value[2] = v; }); 
				break;
			case 'vec4': 
				this.properties.value = old_value && old_value.length == 4 ? [old_value[0],old_value[1],old_value[2],old_value[3]] : [0,0,0,0];
				this.addWidget("number","x",0,function(v){ that.properties.value[0] = v; }); 
				this.addWidget("number","y",0,function(v){ that.properties.value[1] = v; }); 
				this.addWidget("number","z",0,function(v){ that.properties.value[2] = v; }); 
				this.addWidget("number","w",0,function(v){ that.properties.value[3] = v; }); 
				break;
			default:
				console.error("unknown type for constant");
		}
	}

	LGraphShaderConstant.prototype.onGetCode = function( lang, context )
	{
		if( lang != "glsl" )
			return;
		var value = valueToGLSL( this.properties.value, this.properties.type );
		var link_name = getOutputLinkID(this,0);
		if(!link_name) //not connected
			return;

		var code = "	" + this.properties.type + " " + link_name + " = " + value + ";";
		context.fs_code += code;
	}

	LiteGraph.registerShaderNode( "constant", LGraphShaderConstant );


	function LGraphShaderUniform()
	{
		this.addOutput("","float");

		this.properties = {
			name: "",
			type: ""
		};
	}

	LGraphShaderUniform.title = "Uniform";
	LGraphShaderUniform.title_color = "#524";

	LGraphShaderUniform.widgets_info = {
		type: { widget: "combo", values: ["","float","vec2","vec3","vec4","mat3","mat4"]}
	};

	LGraphShaderUniform.prototype.getTitle = function()
	{
		return this.properties.name || "???";
	}

	LGraphShaderUniform.prototype.getOutputLinkCode = function(num)
	{
		var prop_info = this.getProperty();
		if(!prop_info)
		{
			if( this.properties.type != "" )
				return "LINK_" + this.id + "_" + num;
			return null;
		}

		if(prop_info.type == "texture") //special case, sampler cannot be assigned to vars
			return "u_" + prop_info.name;

		var output = this.outputs[num];
		if(!output)
			return null;
		var info = this.getOutputInfo( num );	
		if(!info)
			return null;
		if(info.link == -1)
			return null;
		return "LINK_" + this.id + "_" + num;
	}

	LGraphShaderUniform.prototype.getProperty = function()
	{
		var graphcode = this.graph._graphcode;
		var prop_info = graphcode.getProperty( this.properties.name ) || null;
		this._prop_info = prop_info;
		if(prop_info)
		{
			var type = LS.GLSLCode.types_conversor[ prop_info.type.toLowerCase() ] || prop_info.type;
			this.outputs[0].type = type;
		}
		return prop_info;
	}

	LGraphShaderUniform.prototype.onGetCode = function( lang, context )
	{
		if( lang != "glsl" )
			return;

		var link_name = getOutputLinkID(this,0);

		var prop_info = this.getProperty();
		if(!prop_info)
		{
			if( this.properties.type != "" )
				context.fs_code += this.properties.type + " " + link_name + " = u_" + prop_info.name + ";\n";
			return;
		}

		if(link_name)
		{
			var code = "";
			var type = LS.GLSLCode.types_conversor[ prop_info.type.toLowerCase() ] || prop_info.type;
			if(type != "sampler2D")
				code = "	" + type + " " + link_name + " = u_" + prop_info.name + ";\n";
			context.fs_code += code;
		}
	}


	LGraphShaderUniform.prototype.onDrawBackground = function(ctx, graphcanvas)
	{
		if(ctx !== gl || this.size[1] < 10 || this.flags.collapsed )
			return;
		var prop_info = this.getProperty();
		var material = graphcanvas._material;
		if(!material || !prop_info)
			return;
		var prop = material._properties_by_name[ prop_info.name ];
		if(prop && prop.type == "texture" && prop.value)
		{
			var texture = LS.ResourcesManager.textures[ prop.value ];
			if(texture)
				ctx.drawImage( texture, 0,0, this.size[0], this.size[1] );
		}
	}

	LiteGraph.registerShaderNode( "uniform", LGraphShaderUniform );

	function LGraphShaderVertex()
	{
		this.addOutput("worldPos","vec3");
		this.addOutput("vertex","vec3");
		this.addOutput("normal","vec3");
		this.addOutput("local_normal","vec3");
		this.addOutput("uv","vec2");
		this.addOutput("uv1","vec2");
		this.addOutput("color","vec4");
		this.addOutput("screenPos","vec4");
		this.addOutput("viewDir","vec3");
		this.addOutput("camPos","vec3");
		this.addOutput("camDist","float");
	}

	LGraphShaderVertex.title = "Vertex";
	LGraphShaderVertex.desc = "Reads info from vertex shader";
	LGraphShaderVertex.title_color = "#542";

	LGraphShaderVertex.props = ["worldPos","vertex","worldNormal","normal","uv","uv1","color","screen","viewDir","camPos","camDist"];
	LGraphShaderVertex.props_types = ["vec3","vec3","vec3","vec3","vec2","vec2","vec4","vec4","vec3","vec3","float"];

	LGraphShaderVertex.prototype.onGetCode = function( type, context )
	{
		if(type != "glsl")
			return;

		var code = "";

		for(var i = 0; i < LGraphShaderVertex.props.length; ++i)
		{
			var output = getOutputLinkID( this, i );
			if(!output)
				continue;
			var propname = LGraphShaderVertex.props[i];
			var proptype = LGraphShaderVertex.props_types[i];
			code += "\t "+proptype+" "+output+" = IN."+propname+";\n";
		}
		context.fs_code += code;
	}

	LiteGraph.registerShaderNode( "vertex", LGraphShaderVertex );

	/* not supported by WebGL1.0
	function LGraphShaderElementId()
	{
		this.addOutput("instance","float");
		//gl_VertexID only available in WebGL2
	}

	LGraphShaderElementId.title = "Id";
	LGraphShaderElementId.desc = "returns the id of a instance";
	LGraphShaderElementId.title_color = "#542";

	LGraphShaderElementId.prototype.onGetCode = function( type, context )
	{
		if(type != "glsl")
			return;
		var output = getOutputLinkID( this, 0 );
		if(!output)
			return;
		var code = "\n\
	#ifdef BLOCK_INSTANCING\n\
		float "+output+" = v_instance_id;\n\
	#else\n\
		float "+output+" = 0.0;\n\
	#endif\n\
	";
		context.fs_code += code;
	}

	LiteGraph.registerShaderNode( "id", LGraphShaderElementId );
	*/


	var GLSL_functions_desc = {
		"radians": "T radians(T degrees)",
		"degrees": "T degrees(T radians)",
		"sin": "T sin(T angle)",
		"cos": "T cos(T angle)",
		"tan": "T tan(T angle)",
		"asin": "T asin(T x)",
		"acos": "T acos(T x)",
		"atan": "T atan(T x)",
		"atan2": "T atan(T x,T y)",
		"pow": "T pow(T x,T y)",
		"exp": "T exp(T x)",
		"log": "T log(T x)",
		"exp2": "T exp2(T x)",
		"log2": "T log2(T x)",
		"sqrt": "T sqrt(T x)",
		"inversesqrt": "T inversesqrt(T x)",
		"abs": "T abs(T x)",
		"sign": "T sign(T x)",
		"floor": "T floor(T x)",
		"ceil": "T ceil(T x)",
		"fract": "T fract(T x)",
		"mod": "T mod(T x,T y)", //"T mod(T x,float y)"
		"min": "T min(T x,T y)",
		"max": "T max(T x,T y)",
		"clamp": "T clamp(T x,T minVal,T maxVal)",
		"mix": "T mix(T x,T y,T a)", //"T mix(T x,T y,float a)"
		"step": "T step(T edge, T x)", //"T step(float edge, T x)"
		"smoothstep": "T smoothstep(T edge, T x)", //"T smoothstep(float edge, T x)"
		"length":"float length(T x)",
		"distance":"float distance(T p0, T p1)",
		"normalize":"T normalize(T x)",
		"dot": "float dot(T x,T y)",
		"cross": "vec3 cross(vec3 x,vec3 y)"
		//faceforward, reflect, refract
	};

	var GLSL_functions = {}
	for(var i in GLSL_functions_desc)
	{
		var op = GLSL_functions_desc[i];
		var index = op.indexOf(" ");
		var return_type = op.substr(0,index);
		var index2 = op.indexOf("(",index);
		var func = op.substr(index,index2-index);
		var params = op.substr(index2 + 1, op.length - index2 - 2).split(",");
		GLSL_functions[i] = { return_type: return_type, func: func, params: params };
	}

	function LGraphShaderFunction()
	{
		this.addInput("A","");
		this.addInput("B","");
		this.addInput("C","");
		this.addOutput("","");

		this.properties = {
			func: "dot"
		};

		var that = this;
		this.addWidget("combo","Op.","dot",function(v){
			if(that.properties.func == v)
				return;
			that.properties.func = v;
			that.recomputeOutput();
		},{ values: Object.keys( GLSL_functions ) });
	}

	LGraphShaderFunction.title = "Function";

	LGraphShaderFunction.prototype.recomputeOutput = function()
	{
		var op = GLSL_functions[ this.properties.func ];
		if(!op)
			return;
		var return_type = op.return_type;
		if( return_type == "T" )
		{
			//type is variable and depends on the input type
			var input_node = this.getInputNode(0);
			if(input_node && input_node.requestOutputType)
				return_type = input_node.requestOutputType(0);
			else
			{
				var input_type = this.getInputDataType(0);
				if( input_type )
					return_type = input_type;
			}
		}

		if(return_type == "T")
			console.warn("type cannot be deducted from graph");

		if(this.outputs[0].type != return_type)
			this.disconnectOutput(0);
		this.outputs[0].type = return_type;
	}

	LGraphShaderFunction.prototype.getTitle = function()
	{
		return this.properties.func;
	}

	LGraphShaderFunction.prototype.onGetCode = function( lang, context )
	{
		if( lang != "glsl" )
			return;

		var op = GLSL_functions[ this.properties.func ];

		var inputA = getInputLinkID( this, 0 );
		var inputB = getInputLinkID( this, 1 );
		var inputC = getInputLinkID( this, 2 );
		var output = getOutputLinkID( this, 0 );

		if(!inputA || !output)
			return;

		var return_type = op.return_type;
		if( return_type == "T" )
			return_type = this.getInputDataType(0);

		if(op.params.length == 2 && !inputB)
			inputB = "0.0";
			
		if(op.params.length == 3 && !inputC)
			inputC = "1.0";

		var code = "";
		if( op.params.length == 1 )
			code = return_type + " " + output + " = " +  op.func + "(" + inputA + ");\n";
		else if( op.params.length == 2 )
			code = return_type + " " + output + " = " +  op.func + "(" + inputA + "," + inputB + ");\n";
		else if( op.params.length == 3 )
			code = return_type + " " + output + " = " +  op.func + "(" + inputA + "," + inputB + "," + inputC + ");\n";
		context.fs_code += code;
	}

	LGraphShaderFunction.prototype.onPropertyChanged = function(name,value,prev_value)
	{
		if(name == "func")
		{
			 this.graph._version++;
		}
	}

	LiteGraph.registerShaderNode( "function", LGraphShaderFunction );


	var GLSL_operators = ["+","-","*","/","%"];

	function LGraphShaderOperator()
	{
		this.addInput("A","T,float,vec2,vec3,vec4");
		this.addInput("B","T,float,vec2,vec3,vec4");
		this.addOutput("","T");

		this.properties = {
			op: "+",
			A: 1.0,
			B: 1.0
		};

		var that = this;
		this.addWidget("combo","Op.","+",function(v){
			if(that.properties.op == v)
				return;
			that.properties.op = v;
			//that.recomputeOutput();
		},{ values: GLSL_operators });
	}

	LGraphShaderOperator.title = "Operation";

	LGraphShaderOperator.prototype.getTitle = function()
	{
		return "A " + this.properties.op + " B";
	}

	LGraphShaderOperator.prototype.onGetCode = function( lang, context )
	{
		if( lang != "glsl" )
			return;

		var inputA = getInputLinkID( this, 0 );
		var inputB = getInputLinkID( this, 1 );
		var output = getOutputLinkID( this, 0 );

		if(!output)
			return;
		if(!inputA)
			inputA = valueToGLSL(this.properties.A);
		if(!inputB)
			inputB = valueToGLSL(this.properties.B);

		var return_type = this.getInputDataType(0) || this.getInputDataType(1) || "float";
		var code = return_type + " " + output + " = " + inputA + " " + this.properties.op + " " + inputB + ";\n";
		context.fs_code += code;
	}

	LGraphShaderOperator.prototype.onConnectionsChange = function()
	{
		var type = this.getInputDataType(0);
		this.outputs[0].type = type || "T";
	}

	LGraphShaderOperator.prototype.onPropertyChanged = function(name,value,prev_value)
	{
		if(name == "op")
		{
			 this.graph._version++;
		}
	}

	LiteGraph.registerShaderNode( "operation", LGraphShaderOperator );

	//illumination output
	function LGraphShaderPhong()
	{
		this.addInput("albedo","vec3");
		this.addInput("ambient","vec3");
		this.addInput("emission","vec3");
		this.addInput("normal","vec3");
		this.addInput("specular","float");
		this.addInput("gloss","float");
		this.addInput("reflectivity","float");
		this.addInput("alpha","float");
		this.addInput("extra","vec4");
		this.addOutput("out","vec4");
		this.addOutput("light","FinalLight");
		this.addOutput("surface","SurfaceOutput");
	}

	LGraphShaderPhong.title = "Phong";

	LGraphShaderPhong.prototype.onGetCode = function( lang, context )
	{
		if( lang != "glsl" )
			return;

		var output_name = getOutputLinkID( this, 0 );
		var output_light = getOutputLinkID( this, 1 );
		var output_surface = getOutputLinkID( this, 2 );
		if(!output_name && !output_light && !output_surface )
			return;

		var surface_name = getShaderNodeVarName(this,"SURFACE");
		var code = "SurfaceOutput "+surface_name+";\n";
		var input = getInputLinkID( this, 0 );
		code += "\t "+surface_name+".Albedo = " + ( input ? input : "vec3(1.0)" ) + ";\n";
		input = getInputLinkID( this, 1 );
		code += "\t "+surface_name+".Ambient = " + ( input ? input : "vec3(1.0)" ) + ";\n";
		input = getInputLinkID( this, 2 );
		code += "\t "+surface_name+".Emission = " + ( input ? input : "vec3(0.0)" ) + ";\n";
		input = getInputLinkID( this, 3 );
		code += "\t "+surface_name+".Normal = " + ( input ? input : "IN.worldNormal" ) + ";\n";
		input = getInputLinkID( this, 4 );
		code += "\t "+surface_name+".Specular = " + ( input ? input : "0.0" ) + ";\n";
		input = getInputLinkID( this, 5 );
		code += "\t "+surface_name+".Gloss = " + ( input ? input : "10.0" ) + ";\n";
		input = getInputLinkID( this, 6 );
		code += "\t "+surface_name+".Reflectivity = " + ( input ? input : "0.0" ) + ";\n";
		input = getInputLinkID( this, 7 );
		code += "\t "+surface_name+".Alpha = " + ( input ? input : "1.0" ) + ";\n";
		input = getInputLinkID( this, 8 );
		code += "\t "+surface_name+".Extra = " + ( input ? input : "vec4(0.0)" ) + ";\n";

		code += "\n\
		Light LIGHT = getLight();\n\
		FinalLight final_light = computeLight( "+surface_name+", IN, LIGHT );\n\
		";

		if(output_name)
		{
			code += "\n\
			vec4 _surf_color = vec4(0.0);\n\
			_surf_color.xyz = applyLight( "+surface_name+", final_light );\n\
			_surf_color.a = "+surface_name+".Alpha;\n\
			if( "+surface_name+".Reflectivity > 0.0 )\n\
				_surf_color = applyReflection( IN, "+surface_name+", _surf_color );\n\
			vec4 "+ output_name +" = _surf_color;\n\
			";
		}

		if(output_light)
			code += "	FinalLight " + output_light + " = final_light;\n";

		if(output_surface)
			code += "	SurfaceOutput " + output_surface + " = "+surface_name+";\n";

		context.vs_out += "\n\
			#pragma shaderblock \"light\"\n\
		";
		context.vs_global += "  applyLight(v_pos);\n";
		
		context.fs_out += "\n\
			#pragma shaderblock \"light\"\n\
			#pragma shaderblock \"applyReflection\"\n\
		";
		context.fs_code += code;
	}

	LiteGraph.registerShaderNode( "phong", LGraphShaderPhong );

	//illumination output
	function LGraphShaderPhongLightInfo()
	{
		this.addInput("light","FinalLight");
		this.addInput("color","vec3");
		this.addInput("ambient","vec3");
		this.addInput("diffuse","float");
		this.addInput("specular","float");
		this.addInput("emission","vec3");
		this.addInput("reflectivity","float");
		this.addInput("attenuation","float");
		this.addInput("shadow","float");
		this.addInput("vector","vec3");

		this.addOutput("light","FinalLight");
		this.addOutput("color","vec3");
		this.addOutput("ambient","vec3");
		this.addOutput("diffuse","float");
		this.addOutput("specular","float");
		this.addOutput("emission","vec3");
		this.addOutput("reflectivity","float");
		this.addOutput("attenuation","float");
		this.addOutput("shadow","float");
		this.addOutput("vector","vec3");
	}

	LGraphShaderPhongLightInfo.title = "PhongFinalLight";

	LGraphShaderPhongLightInfo.props = ["light","color","ambient","diffuse","specular","emission","reflectivity","attenuation","shadow","vector"];
	LGraphShaderPhongLightInfo.propstypes = ["FinalLight","vec3","vec3","float","float","vec3","float","float","float","vec3"];

	LGraphShaderPhongLightInfo.prototype.onGetCode = function( lang, context )
	{
		if( lang != "glsl" )
			return;

		var varname = getShaderNodeVarName(this,"LIGHT");

		var code = "	FinalLight " + varname + ";\n";
		var input = getInputLinkID( this, 0 );
		if(input)
			code += "	" + varname + " = " + input + ";\n";

		var inputs_code = "";
		var outputs_code = "";
		for(var i = 1; i < LGraphShaderPhongLightInfo.props.length; ++i)
		{
			var propname = LGraphShaderPhongLightInfo.props[i];
			var input = getInputLinkID( this, i );
			if(input)
				input_code += "	" + varname + "." + propname + " = " + input + ";\n";
			var output = getOutputLinkID( this, i );
			if(output)
			{
				var proptype = LGraphShaderPhongLightInfo.propstypes[i];
				output_code += "	" + proptype + " " + output + " = " + varname + "." + propname + ";\n";
			}
		}

		code += inputs_code + "\n";
		code += outputs_code + "\n";

		var output = getOutputLinkID( this, 0 );
		if(output)
			code += "	FinalLight " + output + " = " + varname + ";\n";

		context.vs_out += "\n#pragma shaderblock \"light\"\n";
		context.fs_out += "\n#pragma shaderblock \"light\"\n";
		context.fs_code += code;
	}

	LiteGraph.registerShaderNode( "phongLightInfo", LGraphShaderPhongLightInfo );

	//fragment shader output
	function LGraphShaderPhongApplyLight()
	{
		this.addInput("","FinalLight");
		this.addInput("","FinalLight");
		this.addOutput("","vec4");
		this.properties = { scale: 1 };
		this.addWidget("number","scale",1,"scale");
	}


	//fragment shader output
	function LGraphShaderTime()
	{
		this.addOutput("","float");
		this.properties = { scale: 1 };
		this.addWidget("number","scale",1,"scale");
	}

	LGraphShaderTime.title = "Time";

	LGraphShaderTime.prototype.onGetCode = function( lang, context )
	{
		if( lang != "glsl" )
			return;
		var link = getOutputLinkID(this,0);
		if(!link) //not connected
			return;
		context.fs_code += "	float " + link + " = u_time * " + valueToGLSL( this.properties.scale ) + ";\n";
	}

	LiteGraph.registerShaderNode( "time", LGraphShaderTime );

	function LGraphShaderTexture2DSample()
	{
		this.addInput("tex","sampler2D");
		this.addInput("uv","vec2");
		this.addOutput("rgba","vec4");
		this.addOutput("rgb","vec3");
		this.addOutput("a","float");
		this.properties = { uv_scale: [1,1], uv_offset: [0,0] };
		this.size = [160,64];
	}

	LGraphShaderTexture2DSample.title = "Texture2DSample";

	LGraphShaderTexture2DSample.prototype.onGetCode = function( lang, context )
	{
		if( lang != "glsl" )
			return;

		var in_tex_link = getInputLinkID(this,0);
		var in_uv_link = getInputLinkID(this,1);
		var outlink = getOutputLinkID(this,0);
		var outlink2 = getOutputLinkID(this,1);
		var outlink3 = getOutputLinkID(this,2);
		if(!outlink && !outlink2 && !outlink3) //not connected
			return;

		if(!in_tex_link)
		{
			if(outlink)
				context.fs_code += "	vec4 " + outlink + " = vec4(0.0);\n"
			if(outlink2)
				context.fs_code += "	vec3 " + outlink2 + " = vec3(0.0);\n";
			if(outlink3)
				context.fs_code += "	float " + outlink3 + " = 0.0;\n";
			return;
		}
		
		//uvs
		var uvs_var = getShaderNodeVarName(this, "uvs" );
		context.fs_code += "	vec2 " + uvs_var + " = " + ( in_uv_link ? in_uv_link : "v_uvs") + ";\n";

		if(this.properties.uv_scale[0] != 1 || this.properties.uv_scale[1] != 1 )
			context.fs_code += "	" + uvs_var + " *= " + valueToGLSL(this.properties.uv_scale) + ";\n";
		if(this.properties.uv_offset[0] != 0 || this.properties.uv_offset[1] != 0 )
			context.fs_code += "	" + uvs_var + " += " + valueToGLSL(this.properties.uv_offset) + ";\n";

		var temp_var = getShaderNodeVarName(this, "texcolor" );
		context.fs_code += "	vec4 " + temp_var + " = texture2D(" + in_tex_link + ", "+uvs_var+");\n";
		if(outlink)
			context.fs_code += "	vec4 " + outlink + " = " + temp_var + ";\n";
		if(outlink2)
			context.fs_code += "	vec3 " + outlink2 + " = " + temp_var + ".xyz;\n";
		if(outlink3)
			context.fs_code += "	float " + outlink3 + " = " + temp_var + ".w;\n";
	}

	LiteGraph.registerShaderNode( "texture2D", LGraphShaderTexture2DSample );

	function LGraphShaderTextureCubeSample()
	{
		this.addInput("tex","samplerCube");
		this.addInput("vec3","vec3");
		this.addOutput("rgba","vec4");
		this.addOutput("rgb","vec3");
		this.addOutput("a","float");
		this.size = [160,64];
	}

	LGraphShaderTextureCubeSample.title = "TextureCubeSample";

	LGraphShaderTextureCubeSample.prototype.onGetCode = function( lang, context )
	{
		if( lang != "glsl" )
			return;

		var in_tex_link = getInputLinkID(this,0);
		var in_uv_link = getInputLinkID(this,1);
		var outlink = getOutputLinkID(this,0);
		var outlink2 = getOutputLinkID(this,1);
		var outlink3 = getOutputLinkID(this,2);
		if(!outlink && !outlink2 && !outlink3) //not connected
			return;

		if(!in_tex_link)
		{
			if(outlink)
				context.fs_code += "	vec4 " + outlink + " = vec4(0.0);\n"
			if(outlink2)
				context.fs_code += "	vec3 " + outlink2 + " = vec3(0.0);\n";
			if(outlink3)
				context.fs_code += "	float " + outlink3 + " = 0.0;\n";
			return;
		}

		var temp_var = getShaderNodeVarName(this);
		context.fs_code += "	vec4 " + temp_var + " = textureCube(" + in_tex_link + ", "+( in_uv_link ? in_uv_link : "v_normal")+");\n";
		if(outlink)
			context.fs_code += "	vec4 " + outlink + " = " + temp_var + ";\n";
		if(outlink2)
			context.fs_code += "	vec3 " + outlink2 + " = " + temp_var + ".xyz;\n";
		if(outlink3)
			context.fs_code += "	float " + outlink3 + " = " + temp_var + ".w;\n";
	}

	LiteGraph.registerShaderNode( "textureCube", LGraphShaderTextureCubeSample );


	//conversion ****************

	function LGraphShaderVec2()
	{
		this.addInput("xy","vec2");
		this.addInput("x","float");
		this.addInput("y","float");
		this.addOutput("xy","vec2");
		this.addOutput("x","float");
		this.addOutput("y","float");

		this.properties = { x: 0, y: 0 };
	}

	LGraphShaderVec2.title = "vec2";

	LGraphShaderVec2.prototype.onPropertyChanged = function()
	{
		 this.graph._version++;
	}

	LGraphShaderVec2.prototype.onGetCode = function( lang, context )
	{
		if( lang != "glsl" )
			return;

		var props = this.properties;

		var varname = getShaderNodeVarName(this);
		var code = "	vec2 " + varname + " = " + valueToGLSL([props.x,props.y]) + ";\n";

		var inlink_xy = getInputLinkID(this,0);
		if(inlink_xy)
			code += "	" + varname + " = " + inlink_xy + ";\n";

		var inlink_x = getInputLinkID(this,1);
		if(inlink_x)
			code += "	" + varname + ".x = " + inlink_x + ";\n";

		var inlink_y = getInputLinkID(this,2);
		if(inlink_y)
			code += "	" + varname + ".y = " + inlink_y + ";\n";

		var outlink = getOutputLinkID(this,0);
		if( outlink )
			code += "	vec2 " + outlink + " = " + varname + ";\n";
		var outlink_x = getOutputLinkID(this,1);
		if( outlink_x )
			code += "	float " + outlink_x + " = " + varname + ".x;\n";

		var outlink_y = getOutputLinkID(this,2);
		if( outlink_y )
			code += "	float " + outlink_y + " = " + varname + ".y;\n";

		context.fs_code += code;
	}

	LiteGraph.registerShaderNode( "vec2", LGraphShaderVec2 );


	function LGraphShaderVec3()
	{
		this.addInput("xyz","vec3");
		this.addInput("x","float");
		this.addInput("y","float");
		this.addInput("z","float");
		this.addInput("xy","vec2");
		this.addInput("xz","vec2");
		this.addInput("yz","vec2");
		this.addOutput("xyz","vec3");
		this.addOutput("x","float");
		this.addOutput("y","float");
		this.addOutput("z","float");
		this.addOutput("xy","vec2");
		this.addOutput("xz","vec2");
		this.addOutput("yz","vec2");

		this.properties = { x:0, y: 0, z: 0 };
	}

	LGraphShaderVec3.title = "vec3";

	LGraphShaderVec3.prototype.onPropertyChanged = function()
	{
		 this.graph._version++;
	}

	LGraphShaderVec3.prototype.onGetCode = function( lang, context )
	{
		if( lang != "glsl" )
			return;

		var props = this.properties;
		var varname = getShaderNodeVarName(this);
		var code = "	vec3 " + varname + " = " + valueToGLSL([props.x,props.y,props.z]) + ";\n";

		var inlink_xyz = getInputLinkID(this,0);
		if(inlink_xyz)
			code += "	" + varname + " = " + inlink_xyz + ";\n";

		var inlink_x = getInputLinkID(this,1);
		if(inlink_x)
			code += "	" + varname + ".x = " + inlink_x + ";\n";

		var inlink_y = getInputLinkID(this,2);
		if(inlink_y)
			code += "	" + varname + ".y = " + inlink_y + ";\n";

		var inlink_z = getInputLinkID(this,3);
		if(inlink_z)
			code += "	" + varname + ".z = " + inlink_z + ";\n";

		var inlink_xy = getInputLinkID(this,4);
		if(inlink_xy)
			code += "	" + varname + ".xy = " + inlink_xy + ";\n";

		var inlink_xz = getInputLinkID(this,5);
		if(inlink_xz)
			code += "	" + varname + ".xz = " + inlink_xz + ";\n";

		var inlink_yz = getInputLinkID(this,6);
		if(inlink_yz)
			code += "	" + varname + ".yz = " + inlink_yz + ";\n";

		var outlink = getOutputLinkID(this,0);
		if( outlink )
			code += "	vec3 " + outlink + " = " + varname + ";\n";
		var outlink_x = getOutputLinkID(this,1);
		if( outlink_x )
			code += "	float " + outlink_x + " = " + varname + ".x;\n";

		var outlink_y = getOutputLinkID(this,2);
		if( outlink_y )
			code += "	float " + outlink_y + " = " + varname + ".y;\n";

		var outlink_z = getOutputLinkID(this,3);
		if( outlink_z )
			code += "	float " + outlink_z + " = " + varname + ".z;\n";

		var outlink_xy = getOutputLinkID(this,4);
		if( outlink_xy )
			code += "	vec2 " + outlink_xy + " = " + varname + ".xy;\n";

		var outlink_xz = getOutputLinkID(this,5);
		if( outlink_xz )
			code += "	vec2 " + outlink_xz + " = " + varname + ".xz;\n";

		var outlink_yz = getOutputLinkID(this,6);
		if( outlink_yz )
			code += "	vec2 " + outlink_yz + " = " + varname + ".yz;\n";

		context.fs_code += code;
	}

	LiteGraph.registerShaderNode( "vec3", LGraphShaderVec3 );


	function LGraphShaderVec4()
	{
		this.addInput("xyzw","vec4");
		this.addInput("xyz","vec3");
		this.addInput("x","float");
		this.addInput("y","float");
		this.addInput("z","float");
		this.addInput("w","float");
		this.addInput("xy","vec2");
		this.addInput("yz","vec2");
		this.addInput("zw","vec2");
		this.addOutput("xyzw","vec4");
		this.addOutput("xyz","vec3");
		this.addOutput("x","float");
		this.addOutput("y","float");
		this.addOutput("z","float");
		this.addOutput("xy","vec2");
		this.addOutput("yz","vec2");
		this.addOutput("zw","vec2");

		this.properties = { x:0, y: 0, z: 0, w: 0 };
	}

	LGraphShaderVec4.title = "vec4";

	LGraphShaderVec4.prototype.onPropertyChanged = function()
	{
		 this.graph._version++;
	}

	LGraphShaderVec4.prototype.onGetCode = function( lang, context )
	{
		if( lang != "glsl" )
			return;

		var props = this.properties;
		var varname = getShaderNodeVarName(this);
		var code = "	vec4 " + varname + " = " + valueToGLSL([props.x,props.y,props.z,props.w]) + ";\n";

		var inlink_xyzw = getInputLinkID(this,0);
		if(inlink_xyzw)
			code += "	" + varname + " = " + inlink_xyzw + ";\n";

		var inlink_xyz = getInputLinkID(this,1);
		if(inlink_xyz)
			code += "	" + varname + ".xyz = " + inlink_xyz + ";\n";

		var inlink_x = getInputLinkID(this,2);
		if(inlink_x)
			code += "	" + varname + ".x = " + inlink_x + ";\n";

		var inlink_y = getInputLinkID(this,3);
		if(inlink_y)
			code += "	" + varname + ".y = " + inlink_y + ";\n";

		var inlink_z = getInputLinkID(this,4);
		if(inlink_z)
			code += "	" + varname + ".z = " + inlink_z + ";\n";

		var inlink_w = getInputLinkID(this,5);
		if(inlink_w)
			code += "	" + varname + ".w = " + inlink_w + ";\n";

		var inlink_xy = getInputLinkID(this,6);
		if(inlink_xy)
			code += "	" + varname + ".xy = " + inlink_xy + ";\n";

		var inlink_yz = getInputLinkID(this,7);
		if(inlink_yz)
			code += "	" + varname + ".yz = " + inlink_yz + ";\n";

		var inlink_zw = getInputLinkID(this,8);
		if(inlink_zw)
			code += "	" + varname + ".zw = " + inlink_zw + ";\n";

		var outlink = getOutputLinkID(this,0);
		if( outlink )
			code += "	vec4 " + outlink + " = " + varname + ";\n";
		var outlink_xyz = getOutputLinkID(this,1);
		if( outlink_xyz )
			code += "	vec3 " + outlink_xyz + " = " + varname + ".xyz;\n";

		var outlink_x = getOutputLinkID(this,2);
		if( outlink_x )
			code += "	float " + outlink_x + " = " + varname + ".x;\n";

		var outlink_y = getOutputLinkID(this,3);
		if( outlink_y )
			code += "	float " + outlink_y + " = " + varname + ".y;\n";

		var outlink_z = getOutputLinkID(this,4);
		if( outlink_z )
			code += "	float " + outlink_z + " = " + varname + ".z;\n";

		var outlink_w = getOutputLinkID(this,5);
		if( outlink_w )
			code += "	float " + outlink_w + " = " + varname + ".w;\n";

		var outlink_xy = getOutputLinkID(this,6);
		if( outlink_xy )
			code += "	vec2 " + outlink_xy + " = " + varname + ".xy;\n";

		var outlink_yz = getOutputLinkID(this,7);
		if( outlink_yz )
			code += "	vec2 " + outlink_yz + " = " + varname + ".yz;\n";

		var outlink_zw = getOutputLinkID(this,8);
		if( outlink_zw )
			code += "	vec2 " + outlink_zw + " = " + varname + ".zw;\n";

		context.fs_code += code;
	}

	LiteGraph.registerShaderNode( "vec4", LGraphShaderVec4 );


	//Custom math operators ********************************

	//quantize values
	function LGraphShaderQuantize()
	{
		this.addInput("","T,float,vec2,vec3,vec4");
		this.addOutput("","T");
		this.properties = {
			levels: 4
		};

		this.addWidget("number","Levels",this.properties.levels, { property: "levels", step: 1, min: 0 });
	}

	LGraphShaderQuantize.title = "Quantize";

	LGraphShaderQuantize.prototype.onPropertyChanged = function()
	{
		 this.graph._version++;
	}

	LGraphShaderQuantize.prototype.onGetCode = function( lang, context )
	{
		if( lang != "glsl" )
			return;
		var inlink = getInputLinkID(this,0);
		var outlink = getOutputLinkID(this,0);
		if(!inlink || !outlink) //not connected
			return;
		var return_type = this.getInputDataType(0);
		var levels_str = valueToGLSL( this.properties.levels );
		this.outputs[0].type = return_type;
		context.fs_code += "	" + return_type + " " + outlink + " = floor(" + inlink + " * "+levels_str+") / "+levels_str+";\n";
	}

	LiteGraph.registerShaderNode( "quantize", LGraphShaderQuantize );

	function LGraphShaderRemap()
	{
		this.addInput("","T,float,vec2,vec3,vec4");
		this.addOutput("","T");
		this.properties = {
			min_value: 0,
			max_value: 1,
			min_value2: 0,
			max_value2: 1
		};
		this.addWidget("number","min",0,"min_value");
		this.addWidget("number","max",1,"max_value");
		this.addWidget("number","min2",0,"min_value2");
		this.addWidget("number","max2",1,"max_value2");
	}

	LGraphShaderRemap.title = "Remap";

	LGraphShaderRemap.prototype.onPropertyChanged = function()
	{
		 this.graph._version++;
	}

	LGraphShaderRemap.prototype.onConnectionsChange = function()
	{
		var return_type = this.getInputDataType(0);
		this.outputs[0].type = return_type || "T";
	}

	LGraphShaderRemap.prototype.onGetCode = function( lang, context )
	{
		if( lang != "glsl" )
			return;
		var inlink = getInputLinkID(this,0);
		var outlink = getOutputLinkID(this,0);
		if(!outlink) //not connected
			return;

		var return_type = this.getInputDataType(0);
		this.outputs[0].type = return_type;
		if(return_type == "T")
		{
			console.warn("node type is T and cannot be resolved");
			return;
		}

		if(!inlink)
		{
			context.fs_code += "	" + return_type + " " + outlink + " = " + return_type + "(0.0);\n";
			return;
		}

		var minv = valueToGLSL( this.properties.min_value );
		var maxv = valueToGLSL( this.properties.max_value );
		var minv2 = valueToGLSL( this.properties.min_value2 );
		var maxv2 = valueToGLSL( this.properties.max_value2 );

		context.fs_code += "	" + return_type + " " + outlink + " = ( (" + inlink + " - "+minv+") / ("+ maxv+" - "+minv+") ) * ("+ maxv2+" - "+minv2+") + " + minv2 + ";\n";
	}

	LiteGraph.registerShaderNode( "remap", LGraphShaderRemap );


	//worldtoLocal

	//texCoordTransform

	//noise
	function LGraphShaderNoise()
	{
		this.addInput("in","vec3"); //optional
		this.addOutput("out","float");
		this.properties = { scale: 1.0 };
	}

	LGraphShaderNoise.title = "Noise";

	LGraphShaderNoise.prototype.onPropertyChanged = function()
	{
		 this.graph._version++;
	}

	LGraphShaderNoise.prototype.onGetCode = function( lang, context )
	{
		if( lang != "glsl" )
			return;
		var outlink = getOutputLinkID(this,0);
		if(!outlink) //not connected
			return;

		var inlink = getInputLinkID(this,0);
		if(!inlink)
		{
			context.fs_code += "	float " + outlink + " = 0.0;\n";
			return;
		}

		context.fs_snippets["snoise"] = true;
		context.fs_code += "	float " + outlink + " = snoise("+inlink+" * "+this.properties.scale.toFixed(3)+");\n";
	}

	LiteGraph.registerShaderNode( "noise", LGraphShaderNoise );

	//custom code
	function LGraphShaderCustom()
	{
		this.addInput("in_float","float");
		this.addInput("in_vec2","vec2");
		this.addInput("in_vec3","vec3");
		this.addInput("in_vec4","vec4");
		this.addOutput("out_float","float");
		this.addOutput("out_vec2","vec2");
		this.addOutput("out_vec3","vec3");
		this.addOutput("out_vec4","vec4");
		this.properties = {
			code: "out_vec3 = in_vec3 * 2.0;"
		};
	}

	LGraphShaderCustom.title = "Custom";

    LGraphShaderCustom["@code"] = { widget: "code" };

	LGraphShaderCustom.prototype.onPropertyChanged = function()
	{
		 this.graph._version++;
	}

	LGraphShaderCustom.prototype.onGetCode = function( lang, context )
	{
		if( lang != "glsl" )
			return;

		var outlink1 = getOutputLinkID(this,0);
		var outlink2 = getOutputLinkID(this,1);
		var outlink3 = getOutputLinkID(this,2);
		var outlink4 = getOutputLinkID(this,3);
		if(!outlink1 && !outlink2 && !outlink3 && !outlink4 )
			return;

		var inlink1 = getInputLinkID(this,0) || "0.0";
		var inlink2 = getInputLinkID(this,1) || "vec2(0.0)";
		var inlink3 = getInputLinkID(this,2) || "vec3(0.0)";
		var inlink4 = getInputLinkID(this,3) || "vec4(0.0)";

		var func_name = getShaderNodeVarName(this, "customFunc" );

		var code = "void " + func_name + "(in float in_float, in vec2 in_vec2, in vec3 in_vec3, in vec4 in_vec4, out float out_float, out vec2 out_vec2, out vec3 out_vec3, out vec4 out_vec4) {\n";
		code += this.properties.code + ";\n}";
		context.fs_out += code;

		outlink1 = outlink1 || getShaderNodeVarName(this, "out1" );
		outlink2 = outlink2 || getShaderNodeVarName(this, "out2" );
		outlink3 = outlink3 || getShaderNodeVarName(this, "out3" );
		outlink4 = outlink4 || getShaderNodeVarName(this, "out4" );

		code = "";
		code += "	float " + outlink1 + " = 0.0;\n";
		code += "	vec2 " + outlink2 + " = vec2(0.0);\n";
		code += "	vec3 " + outlink3 + " = vec3(0.0);\n";
		code += "	vec4 " + outlink4 + " = vec4(0.0);\n";
		code += "	" + func_name + "("+inlink1+","+inlink2+","+inlink3+","+inlink4+","+outlink1+","+outlink2+","+outlink3+","+outlink4+");\n";

		context.fs_code += code;
	}

	LiteGraph.registerShaderNode( "custom", LGraphShaderCustom );

	//flat normal
	function LGraphShaderFlatNormal()
	{
		this.addInput("in","vec3"); //optional
		this.addOutput("out","vec3");
		this.properties = {
			world_space: true,
		};
		this.addWidget("toggle","world space",true,"world_space");
	}

	LGraphShaderFlatNormal.title = "FlatNormal";

	LGraphShaderFlatNormal.prototype.onPropertyChanged = function()
	{
		 this.graph._version++;
	}

	LGraphShaderFlatNormal.prototype.onGetCode = function( lang, context )
	{
		if( lang != "glsl" )
			return;
		var outlink = getOutputLinkID(this,0);
		if(!outlink) //not connected
			return;

		var inlink =  getInputLinkID(this,0);
		if(!inlink)
			inlink = this.properties.world_space ? "v_pos" : "v_local_pos";

		context.fs_functions["getFlatNormal"] = "vec3 getFlatNormal(vec3 pos)\n{\n  vec3 A = dFdx( pos );\n  vec3 B = dFdy( pos );\n  return normalize( cross(A,B) );\n}\n";
		context.fs_code += "	vec3 " + outlink + " = getFlatNormal("+inlink+");";
	}

	LiteGraph.registerShaderNode( "flatNormal", LGraphShaderFlatNormal );

	//toWorldNormal
	function LGraphShaderNormalTransform()
	{
		this.addInput("in","vec3");
		this.addInput("factor","float");
		this.addOutput("out","vec3");
		this.properties = {
			adjust_range: true,
			tangent_space: true,
			invert_xy: true
		};
		this.addWidget("toggle","tangent",true,"tangent_space");
	}

	LGraphShaderNormalTransform.title = "NormalTransform";

	LGraphShaderNormalTransform.prototype.onPropertyChanged = function()
	{
		 this.graph._version++;
	}

	LGraphShaderNormalTransform.prototype.onGetCode = function( lang, context )
	{
		if( lang != "glsl" )
			return;
		var inlink = getInputLinkID(this,0);
		var factor_link = getInputLinkID(this,1);
		var outlink = getOutputLinkID(this,0);
		if(!outlink) //not connected
			return;

		context.fs_snippets["perturbNormal"] = true;

		var ws_normal_var = getShaderNodeVarName(this, "ws_normal" );
		var tex_normal_var = getShaderNodeVarName(this, "tex_normal" );

		if(!inlink)
		{
			context.fs_code += "	vec3 " + outlink + " = v_normal;\n";
			return;
		}

		var code = "";
		code += "	vec3 " + ws_normal_var + " = IN.worldNormal;\n";
		code += "	vec3 " + tex_normal_var + " = "+inlink+";\n";
		if( this.properties.invert_xy )
			code += "	" + tex_normal_var + ".xy = vec2(1.0) - " + tex_normal_var + ".xy;\n";
		if( this.properties.adjust_range && !this.properties.tangent_space )
				code += "	" + tex_normal_var + " = "+tex_normal_var+" * 2.0 - vec3(1.0);\n";
		//code += "	" + tex_normal_var + " = normalize("+tex_normal_var+");\n";
		if(this.properties.tangent_space)
			code += "	vec3 " + outlink + " = perturbNormal( "+ws_normal_var+", IN.viewDir, v_uvs, "+tex_normal_var+" );\n";
		else
			code += "	vec3 " + outlink + " = (u_normal_model * vec4("+tex_normal_var+",0.0)).xyz;\n";
		if( factor_link )
			code += "	" + outlink + " = mix( "+ws_normal_var+", " + outlink + ", " + factor_link +");\n";
		code += "	" + outlink + " = normalize( "+outlink+" );\n";
		context.fs_code += code;
	}

	LiteGraph.registerShaderNode( "normalTransform", LGraphShaderNormalTransform );

	// VERTEX ***************************************************

	/*

	//set point size
	function LGraphShaderPointSize()
	{
		this.addInput("in","float");
		this.properties = {};
	}

	LGraphShaderPointSize.title = "PointSize";
	LGraphShaderPointSize.title_color = "#724";
	LGraphShaderPointSize.output = "vertex";

	LGraphShaderPointSize.prototype.onGetCode = function( lang, context )
	{
		if( lang != "glsl" )
			return;
		var inlink = getInputLinkID(this,0);
		if(!inlink) //not connected
			return;
		context.vs_global += "	 gl_PointSize = " + inlink + ";";
	}

	LiteGraph.registerShaderNode( "pointSize", LGraphShaderPointSize );

	*/

}

/*



*/