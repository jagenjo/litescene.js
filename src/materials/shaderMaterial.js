
/**
* ShaderMaterial allows to use your own shader from scratch, but you loose some of the benefits of using the dynamic shader system of LS
* @namespace LS
* @class ShaderMaterial
* @constructor
* @param {Object} object [optional] to configure from
*/
function ShaderMaterial( o )
{
	Material.call( this, null );

	this._shader = null;
	this.flags = 0;

	this._uniforms = {};
	this._samplers = [];
	this._properties = [];
	this._properties_by_name = {};

	if(o) 
		this.configure(o);
}

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
		this._shader = v;
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
			this._properties_by_name[ this._properties[i].name ] = this._properties[i];
	}
});

ShaderMaterial.prototype.createUniform = function( name, uniform, type, value, options )
{
	if(!name || !uniform)
		throw("parameter missing in createUniform");

	type = type || "Number";
	value = value || 0;

	if( type.constructor !== String )
		throw("type must be string");

	if(value && value.length)
		value = new Float32Array( value );//cast them always

	var prop = { name: name, uniform: uniform, value: value, type: type, is_texture: 0 };

	if(type.toLowerCase() == "texture" || type == "sampler2D" || type == "samplerCube")
		prop.is_texture = (type == "samplerCube") ? 2 : 1;

	if(options)
		for(var i in options)
			prop[i] = options[i];

	this._properties.push( prop );
	this._properties_by_name[ name ] = prop;
}


ShaderMaterial.prototype.setProperty = function(name, value)
{
	//redirect to base material
	if( Material.prototype.setProperty.call(this,name,value) )
		return true;

	if(name == "shader")
		this.shader = value;
	else if(name == "properties")
		this.properties = value;
	else if( this._properties_by_name[ name ] )
	{
		var p = this._properties_by_name[ name ];
		if( !p.value || !p.value.length)
			p.value = value;
		else
			p.value.set( value );
	}
	else
		return false;
	return true;
}

ShaderMaterial.prototype.processShaderCode = function()
{
	if(!this._shader)
	{
		this._properties = [];
		this._properties_by_name = {};
		return false;
	}

	//get shader code
	var shader_code = LS.ResourcesManager.getResource( this.shader );
	if(!shader_code || shader_code.constructor !== LS.ShaderCode )
		return false;

	var old_properties = this._properties_by_name;
	this._properties = [];
	this._properties_by_name = {};

	//clear old functions
	for(var i in this)
	{
		if(!this.hasOwnProperty(i))
			continue;
		if( this[i] && this[i].constructor === Function )
			delete this[i];
	}

	//apply init 
	if( shader_code._init_function )
	{
		shader_code._init_function.call( this );
	}

	for(var i in shader_code._global_uniforms)
	{
		var global = shader_code._global_uniforms[i];
		if( global.disabled ) //in case this var is not found in the shader
			continue;
		this.createUniform( global.name, global.uniform, global.type, global.value, global.options );
	}

	//restore old values
	this.assignOldProperties( old_properties );
}

ShaderMaterial.prototype.assignOldProperties = function( old_properties )
{
	//get shader code
	var shader = null;
	var shader_code = this.getShaderCode();
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


		//validate
		if( shader )
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

ShaderMaterial.prototype.renderInstance = function( instance, render_settings, lights )
{
	if(!this.shader)
		return false;

	//compute flags
	var block_flags = instance.computeShaderBlockFlags();

	//get shader code
	var shader_code = LS.ResourcesManager.getResource( this.shader );
	if(!shader_code || shader_code.constructor !== LS.ShaderCode )
		return false;

	//extract shader compiled
	var shader = shader_code.getShader( null, block_flags );
	if(!shader)
		return false;

	var renderer = LS.Renderer;
	var camera = LS.Renderer._current_camera;
	var scene = LS.Renderer._current_scene;

	//compute matrices
	var model = instance.matrix;
	if(instance.flags & RI_IGNORE_VIEWPROJECTION)
		renderer._viewprojection_matrix.set( model ); //warning?

	//node matrix info
	var instance_final_query = instance._final_query;
	var instance_final_samplers = instance._final_samplers;
	var render_uniforms = LS.Renderer._render_uniforms;

	//maybe this two should be somewhere else
	render_uniforms.u_model = model; 
	render_uniforms.u_normal_model = instance.normal_matrix; 

	//global stuff
	renderer.enableInstanceFlags( instance, render_settings );

	//set blend flags
	if(this.blend_mode !== Blend.NORMAL)
	{
		gl.enable( gl.BLEND );
		if(instance.blend_func)
			gl.blendFunc( instance.blend_func[0], instance.blend_func[1] );
	}
	else
		gl.disable( gl.BLEND );

	this.fillUniforms();

	if(this.prepare_render)
		this.prepare_render( instance );

	//assign
	LS.Renderer.bindSamplers(  this._samplers );
	shader.uniformsArray( [ scene._uniforms, camera._uniforms, render_uniforms, this._uniforms, instance.uniforms ] );

	//render
	instance.render( shader );
	renderer._rendercalls += 1;

	return true;
}

ShaderMaterial.prototype.fillUniforms = function()
{
	//gather uniforms & samplers
	var samplers = this._samplers;
	samplers.length = 0;

	this._uniforms.u_material_color = this._color;

	for(var i = 0; i < this._properties.length; ++i)
	{
		var p = this._properties[i];

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

ShaderMaterial.prototype.renderShadowInstance = function( instance, render_settings )
{
	return this.renderInstance( instance, render_settings );
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
			res[ p.value ] = GL.Texture;
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
ShaderMaterial.prototype.getShaderCode = function()
{
	var shader_code = LS.ResourcesManager.getResource( this.shader );
	if(!shader_code || shader_code.constructor !== LS.ShaderCode )
		return null;
	return shader_code;
}

/**
* Takes an input texture and applies the ShaderMaterial, the result is shown on the viewport or stored in the output_texture
* @method applyToTexture
* @param {Texture} input_texture
* @param {Texture} output_texture [optional] where to store the result, if omitted it will be shown in the viewport
*/
ShaderMaterial.prototype.applyToTexture = function( input_texture, output_texture )
{
	if( !this.shader || !input_texture )
		return false;

	//get shader code
	var shader_code = this.getShaderCode();
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


LS.registerMaterialClass( ShaderMaterial );
LS.ShaderMaterial = ShaderMaterial;