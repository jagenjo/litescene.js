
/**
* ShaderMaterial allows to use your own shader from scratch
* @namespace LS
* @class ShaderMaterial
* @constructor
* @param {Object} object [optional] to configure from
*/
function ShaderMaterial( o )
{
	Material.call( this, null );

	this._shader = ""; //resource filename to a GL.ShaderCode
	this._shader_version = -1; //if the shader gets modified, the material should be modified too
	this._shader_flags = 0; //not used
	this._shader_code = null; //here the final code is stored (for debug)

	this._uniforms = {};	//uniforms to send to the shader
	this._samplers = [];	//textures to send to the shader
	this._properties = [];	//public properties to manipulate this material 
	this._properties_by_name = {};

	this._passes = {};		//the same ShaderCode is  used for different render passes (like color, shadowmap, picking), so here we cache the final GL.Shader for every type of pass
	this._light_mode = 0;	//info if this material should be rendered using lights: Material.NO_LIGHTS, Material.SEVERAL_LIGHTS 
	this._primitive = -1;	//which primitive to use when rendering this material
	this._allows_instancing = false;	//not supported yet

	this._version = -1;	

	this._last_valid_properties = null; //used to recover from a shader error

	if(o) 
		this.configure(o);
}

ShaderMaterial.description = "This material allows full control of the shader being used to render it.\nIt forces to code not only the surface properties but also the light equation.\nIt may be a little bit complex but it comes with examples.";

//assign a shader from a filename to a shadercode and reprocesses the code
Object.defineProperty( ShaderMaterial.prototype, "shader", {
	enumerable: true,
	get: function() {
		return this._shader;
	},
	set: function(v) {
		if(v)
			v = LS.ResourcesManager.cleanFullpath(v);
		if(this._shader == v)
			return;
		this._shader_code = null;
		this._shader = v;
		this.processShaderCode();
	}
});

//allows to assign a shader code that doesnt come from a resource (used from StandardMaterial)
Object.defineProperty( ShaderMaterial.prototype, "shader_code", {
	enumerable: false,
	get: function() {
		return this._shader_code;
	},
	set: function(v) {
		this._shader = null;
		this._shader_code = v;
		this.processShaderCode();
	}
});

Object.defineProperty( ShaderMaterial.prototype, "properties", {
	enumerable: true,
	get: function() {
		return this._properties;
	},
	set: function(v) {
		if(!v)
			return;
		this._properties = v;
		this._properties_by_name = {};
		for(var i in this._properties)
		{
			var p = this._properties[i];
			this._properties_by_name[ p.name ] = p;
		}
	}
});

Object.defineProperty( ShaderMaterial.prototype, "enableLights", {
	enumerable: true,
	get: function() {
		return this._light_mode != 0;
	},
	set: function(v) {
		this._light_mode = v ? 1 : 0;
	}
});

Object.defineProperty( ShaderMaterial.prototype, "version", {
	enumerable: false,
	get: function() {
		return this._version;
	},
	set: function(v) {
		console.error("version cannot be set manually");
	}
});

ShaderMaterial.prototype.addPass = function( name, vertex_shader, fragment_shader, macros )
{
	this._passes[ name ] = {
		vertex: vertex_shader,
		fragment: fragment_shader,
		macros: macros
	};
}

//called when preparing materials before rendering the scene
ShaderMaterial.prototype.prepare = function( scene )
{
	this.fillUniforms();

	if( this.onPrepare )
		this.onPrepare( scene );
}

//called when filling uniforms from this.prepare
ShaderMaterial.prototype.fillUniforms = function()
{
	//gather uniforms & samplers
	var samplers = this._samplers;
	samplers.length = 0;

	this._uniforms.u_material_color = this._color;

	for(var i = 0; i < this._properties.length; ++i)
	{
		var p = this._properties[i];
		if(p.internal) //internal is a property that is not for the shader (is for internal computations)
			continue;

		if(p.is_texture)
		{
			this._uniforms[ p.uniform ] = samplers.length;
			if(p.value)
				samplers.push( p.value );
			else
				samplers.push( " " ); //force missing texture
		}
		else
			this._uniforms[ p.uniform ] = p.value;
	}
}

//assigns a value to a property
ShaderMaterial.prototype.setProperty = function(name, value)
{
	//redirect to base material
	if( Material.prototype.setProperty.call(this,name,value) )
		return true;

	if(name == "shader")
		this.shader = value;
	else if(name == "properties")
	{
		this.properties.length = 0;
		this._properties_by_name = {};
		for(var i = 0; i < value.length; ++i)
		{
			var prop = value[i];
			if(prop.is_texture && prop.value && prop.value.constructor === String)
				prop.value = { texture: prop.value };
			this.properties[i] = prop;
			this._properties_by_name[ prop.name ] = prop;
			//if(prop.is_texture)
			//	this._samplers.push( prop.value );
		}
	}
	else if( this._properties_by_name[ name ] )
	{
		var prop = this._properties_by_name[ name ];
		if( !prop.value || prop.value.constructor === String || !prop.value.length )
			prop.value = value;
		else
			prop.value.set( value );
	}
	else
		return false;
	return true;
}

//check the ShaderCode associated and applies it to this material (keeping the state of the properties)
ShaderMaterial.prototype.processShaderCode = function()
{
	if(!this._shader_code && !this._shader)
	{
		this._properties.length = 0;
		this._properties_by_name = {};
		this._passes = {};
		this._samplers.length = 0;
		return false;
	}

	//get shader code
	var shader_code = this._shader_code;
	
	if( !shader_code && this._shader )
		shader_code = LS.ResourcesManager.getResource( this.shader );

	if( !shader_code || shader_code.constructor !== LS.ShaderCode )
		return false;

	var old_properties = this._properties_by_name;
	if( shader_code._has_error ) //save them
		this._last_valid_properties = old_properties; 
	else if( this._last_valid_properties )
	{
		old_properties = this._last_valid_properties;
		this._last_valid_properties = null;
	}

	this._properties.length = 0;
	this._properties_by_name = {};
	this._passes = {};
	this._samplers.length = 0;
	this._light_mode = 0;
	this._primitive = -1;

	//reset material properties
	this._queue = LS.RenderQueue.GEOMETRY;
	this._render_state.init();

	//clear old functions
	for(var i in this)
	{
		if(!this.hasOwnProperty(i))
			continue;
		if( this[i] && this[i].constructor === Function )
			delete this[i];
	}

	//apply init 
	if( shader_code._functions.init )
	{
		if(!LS.catch_exceptions)
			shader_code._functions.init.call( this );
		else
		{
			try
			{
				shader_code._functions.init.call( this );
			}
			catch (err)
			{
				LS.dispatchCodeError(err);
			}
		}
	}

	for(var i in shader_code._global_uniforms)
	{
		var global = shader_code._global_uniforms[i];
		if( global.disabled ) //in case this var is not found in the shader
			continue;
		this.createUniform( global.name, global.uniform, global.type, global.value, global.options );
	}

	//set version before asssignOldProperties
	this._shader_version = shader_code._version;
	this._version++;

	//restore old values
	this.assignOldProperties( old_properties );

}

//used after changing the code of the ShaderCode and wanting to reload the material keeping the old properties
ShaderMaterial.prototype.assignOldProperties = function( old_properties )
{
	//get shader code
	var shader = null;
	var shader_code = this.getShaderCode(); //no parameters because we just want the render_state and init stuff
	if( shader_code )
		shader = shader_code.getShader();

	for(var i = 0; i < this._properties.length; ++i)
	{
		var new_prop = this._properties[i];

		if(!old_properties[ new_prop.name ])
			continue;
		var old = old_properties[ new_prop.name ];
		if(old.value === undefined)
			continue;

		//validate (avoids error if we change the type of a uniform and try to reassign a value)
		if( !old.internal && shader && !new_prop.is_texture ) //textures are not validated (because they are samplers, not values)
		{
			var uniform_info = shader.uniformInfo[ new_prop.uniform ];
			if(!uniform_info)
				continue;
			if(new_prop.value !== undefined)
			{
				if( !GL.Shader.validateValue( new_prop.value, uniform_info ) )
				{
					new_prop.value = undefined;
					continue;
				}
			}
		}

		//this is to keep current values when coding the shader from the editor
		if( new_prop.value && new_prop.value.set ) //special case for typed arrays avoiding generating GC
		{
			//this is to be careful when an array changes sizes
			if( old.value && old.value.length && new_prop.value.length && old.value.length <= new_prop.value.length)
				new_prop.value.set( old.value );
			else
				new_prop.value = old.value;
		}
		else
			new_prop.value = old.value;
	}
}

ShaderMaterial.nolights_vec4 = new Float32Array([0,0,0,1]);
ShaderMaterial.missing_color = new Float32Array([1,0,1,1]);

//called from LS.Renderer when rendering an instance
ShaderMaterial.prototype.renderInstance = function( instance, render_settings, pass )
{
	//get shader code
	var shader_code = this.getShaderCode( instance, render_settings, pass );
	if(!shader_code || shader_code.constructor !== LS.ShaderCode )
	{
		//return true; //skip rendering
		shader_code = LS.ShaderCode.getDefaultCode( instance, render_settings, pass  ); //use default shader
		if( pass.id == COLOR_PASS.id) //to assign some random color
			this._uniforms.u_material_color = ShaderMaterial.missing_color;
	}

	//this is in case the shader has been modified in the editor (reapplies the shadercode to the material)
	if( shader_code._version !== this._shader_version && this.processShaderCode )
		this.processShaderCode();

	//some globals
	var renderer = LS.Renderer;
	var camera = LS.Renderer._current_camera;
	var scene = LS.Renderer._current_scene;
	var model = instance.matrix;
	var renderer_uniforms = LS.Renderer._uniforms;

	//maybe this two should be somewhere else
	renderer_uniforms.u_model = model; 
	renderer_uniforms.u_normal_model = instance.normal_matrix; 

	//compute flags: checks the ShaderBlocks attached to this instance and resolves the flags
	var block_flags = instance.computeShaderBlockFlags();
	var global_flags = LS.Renderer._global_shader_blocks_flags;

	//find environment texture
	if( pass == COLOR_PASS ) //allow reflections only in color pass
	{
		global_flags |= LS.ShaderMaterial.reflection_block.flag_mask;

		var environment_sampler = this.textures["environment"];
		var environment_texture = environment_sampler && environment_sampler.texture ? environment_sampler.texture : null;

		if( !environment_texture ) //use global
		{
			if( LS.Renderer._global_textures.environment )
				environment_texture = LS.Renderer._global_textures.environment;
			if( instance._nearest_reflection_probe )
			{
				if( instance._nearest_reflection_probe._texture )
					environment_texture = instance._nearest_reflection_probe._tex_id;
			}
		}

		if( environment_texture )
		{
			var tex = LS.ResourcesManager.textures[ environment_texture ];
			if( tex && tex.texture_type == GL.TEXTURE_2D )
			{
				if( tex._is_planar )
					global_flags |= environment_planar_block.flag_mask;
				else
					global_flags |= environment_2d_block.flag_mask;
			}
			else
				global_flags |= environment_cubemap_block.flag_mask;
		}

		this._samplers[ LS.Renderer.ENVIRONMENT_TEXTURE_SLOT ] = environment_texture;
	}
	else
	{
		this._samplers[ LS.Renderer.ENVIRONMENT_TEXTURE_SLOT ] = null;
	}

	//global stuff
	this._render_state.enable( render_settings );
	LS.Renderer.bindSamplers( this._samplers ); //material samplers
	LS.Renderer.bindSamplers( instance.samplers ); //RI samplers (like morph targets encoded in textures)

	//blocks for extra streams and instancing
	if( instance.vertex_buffers["colors"] )
		block_flags |= LS.Shaders.vertex_color_block.flag_mask;
	if( instance.vertex_buffers["coords1"] )
		block_flags |= LS.Shaders.coord1_block.flag_mask;
	if( instance.instanced_models && instance.instanced_models.length && gl.extensions.ANGLE_instanced_arrays ) //use instancing if supported
		block_flags |= LS.Shaders.instancing_block.flag_mask;

	//for those cases
	if(this.onRenderInstance)
		this.onRenderInstance( instance, pass );

	if( pass == SHADOW_PASS )
	{
		//global flags (like environment maps, irradiance, etc)
		block_flags |= LS.Shaders.firstpass_block.flag_mask;
		block_flags |= LS.Shaders.lastpass_block.flag_mask;
		//extract shader compiled
		var shader = shader_code.getShader( pass.name, block_flags ); //pass.name
		if(!shader)
			return false;

		//assign
		shader.uniformsArray( [ scene._uniforms, camera._uniforms, renderer_uniforms, this._uniforms, instance.uniforms ] ); //removed, why this was in?? light ? light._uniforms : null, 

		//render
		gl.disable( gl.BLEND );
		instance.render( shader, this._primitive != -1 ? this._primitive : undefined );
		renderer._rendercalls += 1;
	
		return true;
	}

	//add flags related to lights
	var lights = null;

	//ignore lights renders the object with flat illumination
	var ignore_lights = pass != COLOR_PASS || render_settings.lights_disabled || this._light_mode === Material.NO_LIGHTS;

	if( !ignore_lights )
		lights = LS.Renderer.getNearLights( instance );

	if(LS.Renderer._use_normalbuffer)
		block_flags |= LS.Shaders.normalbuffer_block.flag_mask;

	//if no lights are set or the render mode is flat
	if( !lights || lights.length == 0 || ignore_lights )
	{
		//global flags (like environment maps, irradiance, etc)
		if( !ignore_lights )
			block_flags |= global_flags;
		block_flags |= LS.Shaders.firstpass_block.flag_mask;
		block_flags |= LS.Shaders.lastpass_block.flag_mask;

		//extract shader compiled
		var shader = shader_code.getShader( null, block_flags ); //pass.name
		if(!shader)
		{
			//var shader = shader_code.getShader( "surface", block_flags );
			return false;
		}

		//assign
		shader.uniformsArray( [ scene._uniforms, camera._uniforms, renderer_uniforms, this._uniforms, instance.uniforms ] ); //removed, why this was in?? light ? light._uniforms : null, 

		shader.setUniform( "u_light_info", ShaderMaterial.nolights_vec4 );
		if( ignore_lights )
			shader.setUniform( "u_ambient_light", LS.ONES );

		//render
		instance.render( shader, this._primitive != -1 ? this._primitive : undefined );
		renderer._rendercalls += 1;
	
		return true;
	}

	var base_block_flags = block_flags;

	var uniforms_array = [ scene._uniforms, camera._uniforms, renderer_uniforms, null, this._uniforms, instance.uniforms ];

	//render multipass with several lights
	var prev_shader = null;
	for(var i = 0, l = lights.length; i < l; ++i)
	{
		var light = lights[i];
		block_flags = light.applyShaderBlockFlags( base_block_flags, pass, render_settings );

		//global
		block_flags |= global_flags;

		//shaders require to know in which pass they are (ambient is applied in the first, reflections in the last)
		if(i == 0)
			block_flags |= LS.Shaders.firstpass_block.flag_mask;
		if(i == l - 1)
			block_flags |= LS.Shaders.lastpass_block.flag_mask;

		//extract shader compiled
		var shader = shader_code.getShader( null, block_flags );
		if(!shader)
		{
			console.warn("material without pass: " + pass.name );
			continue;
		}

		//light texture like shadowmap and cookie
		LS.Renderer.bindSamplers( light._samplers );

		//light parameters (like index of pass or num passes)
		light._uniforms.u_light_info[2] = i; //num pass
		light._uniforms.u_light_info[3] = lights.length; //total passes
		uniforms_array[3] = light._uniforms;

		//assign
		if(prev_shader != shader)
			shader.uniformsArray( uniforms_array );
		else
			shader.uniforms( light._uniforms );
		prev_shader = shader;

		if(i == 1)
		{
			gl.depthMask( false );
			gl.depthFunc( gl.EQUAL );
			gl.enable( gl.BLEND );
			gl.blendFunc( gl.SRC_ALPHA, gl.ONE );
		}

		//render
		instance.render( shader, this._primitive != -1 ? this._primitive : undefined );
		renderer._rendercalls += 1;
	}

	//optimize this
	gl.disable( gl.BLEND );
	gl.depthMask( true );
	gl.depthFunc( gl.LESS );

	return true;
}

ShaderMaterial.prototype.renderPickingInstance = function( instance, render_settings, pass )
{
	//get shader code
	var shader_code = this.getShaderCode( instance, render_settings, pass );
	if(!shader_code || shader_code.constructor !== LS.ShaderCode )
		shader_code = LS.ShaderCode.getDefaultCode( instance, render_settings, pass  ); //use default shader


	//some globals
	var renderer = LS.Renderer;
	var camera = LS.Renderer._current_camera;
	var scene = LS.Renderer._current_scene;
	var model = instance.matrix;
	var node = instance.node;
	var renderer_uniforms = LS.Renderer._uniforms;

	//maybe this two should be somewhere else
	renderer_uniforms.u_model = model; 
	renderer_uniforms.u_normal_model = instance.normal_matrix; 

	//compute flags
	var block_flags = instance.computeShaderBlockFlags();

	//global stuff
	this._render_state.enable( render_settings );
	LS.Renderer.bindSamplers( this._samplers );
	LS.Renderer.bindSamplers( instance.samplers );

	//extract shader compiled
	var shader = shader_code.getShader( pass.name, block_flags );
	if(!shader)
	{
		shader_code = LS.ShaderMaterial.getDefaultPickingShaderCode();
		shader = shader_code.getShader( pass.name, block_flags );
		if(!shader)
			return false; //??!
	}

	//assign uniforms
	shader.uniformsArray( [ camera._uniforms, renderer_uniforms, this._uniforms, instance.uniforms ] );

	//set color
	var pick_color = LS.Picking.getNextPickingColor( instance.picking_node || node );
	shader.setUniform("u_material_color", pick_color );

	//render
	instance.render( shader, this._primitive != -1 ? this._primitive : undefined );
	renderer._rendercalls += 1;

	//optimize this
	gl.disable( gl.BLEND );
	gl.depthMask( true );
	gl.depthFunc( gl.LESS );

	return true;
}

//used by the editor to know which possible texture channels are available
ShaderMaterial.prototype.getTextureChannels = function()
{
	var channels = [];

	for(var i in this._properties)
	{
		var p = this._properties[i];
		if(p.is_texture)
			channels.push( p.name );
	}

	return channels;
}

/**
* Collects all the resources needed by this material (textures)
* @method getResources
* @param {Object} resources object where all the resources are stored
* @return {Texture}
*/
ShaderMaterial.prototype.getResources = function ( res )
{
	if(this.shader)
		res[ this.shader ] = LS.ShaderCode;

	for(var i in this._properties)
	{
		var p = this._properties[i];
		if(p.value && p.is_texture)
		{
			if(!p.value)
				continue;
			var name = null;
			if(p.value.texture)
				name = 	p.value.texture;
			else
				name = res[ p.value ];
			if(name && name.constructor === String)
				res[name] = GL.Texture;
		}
	}
	return res;
}


ShaderMaterial.prototype.getPropertyInfoFromPath = function( path )
{
	if( path.length < 1)
		return;

	var info = Material.prototype.getPropertyInfoFromPath.call(this,path);
	if(info)
		return info;

	var varname = path[0];

	for(var i = 0, l = this.properties.length; i < l; ++i )
	{
		var prop = this.properties[i];
		if(prop.name != varname)
			continue;

		return {
			node: this._root,
			target: this,
			name: prop.name,
			value: prop.value,
			type: prop.type
		};
	}

	return;
}

//get shader code
ShaderMaterial.prototype.getShaderCode = function( instance, render_settings, pass )
{
	var shader_code = this._shader_code || LS.ResourcesManager.getResource( this._shader );
	if(!shader_code || shader_code.constructor !== LS.ShaderCode )
		return null;

	//this is in case the shader has been modified in the editor (reapplies the shadercode to the material)
	if( shader_code._version !== this._shader_version && this.processShaderCode )
	{
		shader_code._version = this._shader_version;
		this.processShaderCode();
	}

	return shader_code;
}

/**
* Takes an input texture and applies the ShaderMaterial, the result is shown on the viewport or stored in the output_texture
* The ShaderCode must contain a "fx" method.
* Similar to the method BlitTexture in Unity
* @method applyToTexture
* @param {Texture} input_texture
* @param {Texture} output_texture [optional] where to store the result, if omitted it will be shown in the viewport
*/
ShaderMaterial.prototype.applyToTexture = function( input_texture, output_texture )
{
	if( !this.shader || !input_texture )
		return false;

	//get shader code
	var shader_code = this.getShaderCode(); //special use
	if(!shader_code)
		return false;

	//extract shader compiled
	var shader = shader_code.getShader("fx");
	if(!shader)
		return false;

	//global vars
	this.fillUniforms();
	this._uniforms.u_time = LS.GlobalScene._time;
	this._uniforms.u_viewport = gl.viewport_data;

	//bind samplers
	LS.Renderer.bindSamplers( this._samplers );

	gl.disable( gl.DEPTH_TEST );
	gl.disable( gl.CULL_FACE );

	//render
	if(!output_texture)
		input_texture.toViewport( shader, this._uniforms );
	else
		output_texture.drawTo( function(){
			input_texture.toViewport( shader, this._uniforms );
		});
}

/**
* Makes one shader variable (uniform) public so it can be assigned from the engine (or edited from the editor)
* @method createUniform
* @param {String} name the property name as it should be shown
* @param {String} uniform the uniform name in the shader
* @param {String} type the var type in case we want to edit it (use LS.TYPES)
* @param {*} value
* @param {Object} options an object containing all the possible options (used mostly for widgets)
*/
ShaderMaterial.prototype.createUniform = function( name, uniform, type, value, options )
{
	if(!name || !uniform)
		throw("parameter missing in createUniform");

	//
	type = type || "Number";
	if( type.constructor !== String )
		throw("type must be string");

	//cast to typed-array
	value = value || 0;
	if(value && value.length)
		value = new Float32Array( value );//cast them always
	else
	{
		//create a value, otherwise is null
		switch (type)
		{
			case "vec2": value = vec2.create(); break;
			case "color":
			case "vec3": value = vec3.create(); break;
			case "color4":
			case "vec4": value = vec4.create(); break;
			case "mat3": value = mat3.create(); break;
			case "mat4": value = mat4.create(); break;
			default:
		}
	}

	//define info
	var prop = { name: name, uniform: uniform, value: value, type: type, is_texture: 0 };

	//mark as texture (because this need to go to the textures container so they are binded)
	if(type.toLowerCase() == "texture" || type == "sampler2D" || type == "samplerCube" || type == "sampler")
		prop.is_texture = (type == "samplerCube") ? 2 : 1;

	if(prop.is_texture)
	{
		prop.sampler = {};
		prop.type = "sampler";
		prop.sampler_slot = this._samplers.length;
		this._samplers.push( prop.sampler );
	}

	if(options)
		for(var i in options)
			prop[i] = options[i];

	this._properties.push( prop );
	this._properties_by_name[ name ] = prop;
}

/**
* Similar to createUniform but for textures, it helps specifying sampler options
* @method createSampler
* @param {String} name the property name as it should be shown
* @param {String} uniform the uniform name in the shader
* @param {Object} options an object containing all the possible options (used mostly for widgets)
* @param {String} value default value (texture name)
*/
ShaderMaterial.prototype.createSampler = function( name, uniform, sampler_options, value  )
{
	if(!name || !uniform)
		throw("parameter missing in createSampler");

	var type = "sampler";
	if( sampler_options && sampler_options.type )
		type = sampler_options.type;

	var sampler = null;

	//do not overwrite
	if( this._properties_by_name[ name ] )
	{
		var current_prop = this._properties_by_name[ name ];
		if( current_prop.type == type && current_prop.value )
			sampler = current_prop.value;
	}

	if(!sampler)
		sampler = {
			texture: value
		};

	var prop = { name: name, uniform: uniform, value: sampler, type: type, is_texture: 1, sampler_slot: -1 };

	if(sampler_options)
	{
		if(sampler_options.filter)
		{
			sampler.magFilter = sampler_options.filter;
			sampler.minFilter = sampler_options.filter;
			delete sampler_options.filter;
		}

		if(sampler_options.wrap)
		{
			sampler.wrapS = sampler_options.wrap;
			sampler.wrapT = sampler_options.wrap;
			delete sampler_options.wrap;
		}

		for(var i in sampler_options)
			sampler[i] = sampler_options[i];
	}
	prop.sampler_slot = this._samplers.length;
	this._properties.push( prop );
	this._properties_by_name[ name ] = prop;
	this._samplers.push( prop.value );
}

/**
* Creates a property for this material, this property wont be passed to the shader but can be used from source code.
* You must used this function if you want the data to be stored when serializing or changing the ShaderCode
* @method createProperty
* @param {String} name the property name as it should be shown
* @param {*} value the default value
* @param {String} type the data type (use LS.TYPES)
* @param {Object} options an object containing all the possible options (used mostly for widgets)
*/
ShaderMaterial.prototype.createProperty = function( name, value, type, options )
{
	var prop = this._properties_by_name[ name ];
	if(prop && prop.type == type) //already exist with the same type
		return;

	prop = { name: name, type: type, internal: true, value: value };
	if(options)
		for(var i in options)
			prop[i] = options[i];

	this._properties.push( prop );
	this._properties_by_name[ name ] = prop;

	Object.defineProperty( this, name, {
		get: function() { 
			var prop = this._properties_by_name[ name ]; //fetch it because could have been overwritten
			if(prop)
				return prop.value;
		},
		set: function(v) { 
			var prop = this._properties_by_name[ name ]; //fetch it because could have been overwritten
			if(!prop)
				return;
			if(prop.value && prop.value.set) //for typed arrays
				prop.value.set( v );
			else
				prop.value = v;
		},
		enumerable: false, //must not be serialized
		configurable: true //allows to overwrite this property
	});
}

/**
* returns the value of a property taking into account dynamic properties defined in the material
* @method getProperty
* @param {String} name the property name as it should be shown
* @param {*} value of the property
*/
ShaderMaterial.prototype.getProperty = function(name)
{
	var r = Material.prototype.getProperty.call( this, name );
	if(r != null)
		return;
	var p = this._properties_by_name[ name ];
	if (p)
		return p.value;
	return null;
}

/**
* Event used to inform if one resource has changed its name
* @method onResourceRenamed
* @param {Object} resources object where all the resources are stored
* @return {Boolean} true if something was modified
*/
ShaderMaterial.prototype.onResourceRenamed = function (old_name, new_name, resource)
{
	var v = Material.prototype.onResourceRenamed.call(this, old_name, new_name, resource );
	if( this.shader == old_name)
	{
		this.shader = new_name;
		v = true;
	}

	//change texture also in shader values... (this should be automatic but it is not)
	for(var i = 0; i < this._properties.length; ++i)
	{
		var p = this._properties[i];
		if(p.internal) //internal is a property that is not for the shader (is for internal computations)
			continue;

		if( !p.is_texture || !p.value )
			continue;
		if( p.value.texture != old_name )
			continue;
		p.value.texture = new_name;
		v = true;
	}

	return v;
}


ShaderMaterial.getDefaultPickingShaderCode = function()
{
	if( ShaderMaterial.default_picking_shader_code )
		return ShaderMaterial.default_picking_shader_code;
	var sc = new LS.ShaderCode();
	sc.code = LS.ShaderCode.flat_code;
	ShaderMaterial.default_picking_shader_code = sc;
	return sc;
}

//creates a material with flat color, used for debug stuff, shadowmaps, picking, etc
ShaderMaterial.createFlatMaterial = function()
{
	var material = new LS.ShaderMaterial();
	material.shader_code = LS.ShaderCode.getDefaultCode();
	return material;
}

LS.registerMaterialClass( ShaderMaterial );
LS.ShaderMaterial = ShaderMaterial;
