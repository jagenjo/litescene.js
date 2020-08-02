///@INFO: GRAPHS
if(typeof(LiteGraph) != "undefined")
{
	var LGShaders = LiteGraph.Shaders;

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

	LGraphShaderPhong.prototype.onGetCode = function( context )
	{

		var output_name = LGShaders.getOutputLinkID( this, 0 );
		var output_light = LGShaders.getOutputLinkID( this, 1 );
		var output_surface = LGShaders.getOutputLinkID( this, 2 );
		if(!output_name && !output_light && !output_surface )
			return;

		var surface_name = LGShaders.getShaderNodeVarName(this,"SURFACE");
		var code = "SurfaceOutput "+surface_name+";\n";
		var input = LGShaders.getInputLinkID( this, 0 );
		code += "\t "+surface_name+".Albedo = " + ( input ? input : "vec3(1.0)" ) + ";\n";
		input = LGShaders.getInputLinkID( this, 1 );
		code += "\t "+surface_name+".Ambient = " + ( input ? input : "vec3(1.0)" ) + ";\n";
		input = LGShaders.getInputLinkID( this, 2 );
		code += "\t "+surface_name+".Emission = " + ( input ? input : "vec3(0.0)" ) + ";\n";
		input = LGShaders.getInputLinkID( this, 3 );
		code += "\t "+surface_name+".Normal = " + ( input ? input : "IN.worldNormal" ) + ";\n";
		input = LGShaders.getInputLinkID( this, 4 );
		code += "\t "+surface_name+".Specular = " + ( input ? input : "0.0" ) + ";\n";
		input = LGShaders.getInputLinkID( this, 5 );
		code += "\t "+surface_name+".Gloss = " + ( input ? input : "10.0" ) + ";\n";
		input = LGShaders.getInputLinkID( this, 6 );
		code += "\t "+surface_name+".Reflectivity = " + ( input ? input : "0.0" ) + ";\n";
		input = LGShaders.getInputLinkID( this, 7 );
		code += "\t "+surface_name+".Alpha = " + ( input ? input : "1.0" ) + ";\n";
		input = LGShaders.getInputLinkID( this, 8 );
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
		context.addCode( "code", code, this.shader_destination );


		context.addCode( "vs_out", "#pragma shaderblock \"light\"" );
		context.addCode( "vs_global", "applyLight(v_pos);" );
		context.addCode( "fs_out","#pragma shaderblock \"light\"\n\
			#pragma shaderblock \"applyReflection\"\n\
		");
		
		//enable support for multipass lights
		context.material.light_mode = ONE.Material.SEVERAL_LIGHTS;
		this.setOutputData(0, "vec4" );
		this.setOutputData(1, "Light" );
		this.setOutputData(2, "FinalLight" );
	}

	LGShaders.registerShaderNode( "light/phong", LGraphShaderPhong );



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

		var varname = LGShaders.getShaderNodeVarName(this,"LIGHT");

		var code = "	FinalLight " + varname + ";\n";
		var input = LGShaders.getInputLinkID( this, 0 );
		if(input)
			code += "	" + varname + " = " + input + ";\n";

		var inputs_code = "";
		var outputs_code = "";
		for(var i = 1; i < LGraphShaderPhongLightInfo.props.length; ++i)
		{
			var propname = LGraphShaderPhongLightInfo.props[i];
			var input = LGShaders.getInputLinkID( this, i );
			if(input)
				input_code += "	" + varname + "." + propname + " = " + input + ";\n";
			var output = LGShaders.getOutputLinkID( this, i );
			if(output)
			{
				var proptype = LGraphShaderPhongLightInfo.propstypes[i];
				output_code += "	" + proptype + " " + output + " = " + varname + "." + propname + ";\n";
			}
		}

		code += inputs_code + "\n";
		code += outputs_code + "\n";

		var output = LGShaders.getOutputLinkID( this, 0 );
		if(output)
			code += "	FinalLight " + output + " = " + varname + ";\n";
		context.addCode("fs_code",code);

		context.addCode("vs_out","#pragma shaderblock \"light\"\n");
		context.addCode("fs_out","\n#pragma shaderblock \"light\"\n");
	}

	LGShaders.registerShaderNode( "light/phongLightInfo", LGraphShaderPhongLightInfo );

	//fragment shader output
	function LGraphShaderPhongApplyLight()
	{
		this.addInput("","FinalLight");
		this.addInput("","FinalLight");
		this.addOutput("","vec4");
		this.properties = { scale: 1 };
		this.addWidget("number","scale",1,"scale");
	}

	function LGraphShaderVertex()
	{
		this.addOutput("worldPos","vec3");
		this.addOutput("vertex","vec3");
		this.addOutput("worldNormal","vec3");
		this.addOutput("normal","vec3");
		this.addOutput("uv","vec2");
		this.addOutput("uv1","vec2");
		this.addOutput("color","vec4");
		this.addOutput("screenPos","vec4");
		this.addOutput("viewDir","vec3");
	}

	LGraphShaderVertex.title = "Vertex";

	LGraphShaderVertex.prototype.onGetCode = function( context )
	{
		var code = "";
		var output = LGShaders.getOutputLinkID( this, 0 );
		if(output)
			code += "	vec3 " + output + " = IN.worldPos;\n";
		output = LGShaders.getOutputLinkID( this, 1 );
		if(output)
			code += "	vec3 " + output + " = IN.vertex;\n";
		output = LGShaders.getOutputLinkID( this, 2 );
		if(output)
			code += "	vec3 " + output + " = IN.worldNormal;\n";
		output = LGShaders.getOutputLinkID( this, 3 );
		if(output)
			code += "	vec3 " + output + " = IN.normal;\n";
		output = LGShaders.getOutputLinkID( this, 4 );
		if(output)
			code += "	vec2 " + output + " = IN.uv;\n";
		output = LGShaders.getOutputLinkID( this, 5 );
		if(output)
			code += "	vec2 " + output + " = IN.uv1;\n";
		output = LGShaders.getOutputLinkID( this, 6 );
		if(output)
			code += "	vec4 " + output + " = IN.color;\n";
		output = LGShaders.getOutputLinkID( this, 7 );
		if(output)
			code += "	vec4 " + output + " = IN.screenPos;\n";
		output = LGShaders.getOutputLinkID( this, 8 );
		if(output)
			code += "	vec3 " + output + " = IN.viewDir;\n";

		context.addCode( "code", code, this.shader_destination );

		this.setOutputData(0, "vec3" );
		this.setOutputData(1, "vec3" );
		this.setOutputData(2, "vec3" );
		this.setOutputData(3, "vec3" );
		this.setOutputData(4, "vec2" );
		this.setOutputData(5, "vec2" );
		this.setOutputData(6, "vec4" );
		this.setOutputData(7, "vec4" );
		this.setOutputData(8, "vec3" );
	}

	LiteGraph.Shaders.registerShaderNode( "input/vertex", LGraphShaderVertex );


	/*
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
		var link = LGShaders.getOutputLinkID(this,0);
		if(!link) //not connected
			return;
		context.fs_code += "	float " + link + " = u_time * " + LGShaders.valueToGLSL( this.properties.scale ) + ";\n";
	}

	LiteGraph.Shaders.registerShaderNode( "input/time", LGraphShaderTime );
	*/


}