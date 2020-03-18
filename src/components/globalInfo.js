///@INFO: BASE
function GlobalInfo(o)
{
	this.createProperty( "ambient_color", GlobalInfo.DEFAULT_AMBIENT_COLOR, "color" );
	this.createProperty( "irradiance_color", [1,1,1], "color" );
	this._render_settings = null;
	this._textures = {};
	this.irradiance = null; //in SH form of float32(3*9)
	this._irradiance_final = null; 
	this._uniforms = {};

	if(o)
		this.configure(o);
}

Object.defineProperty( GlobalInfo.prototype, 'textures', {
	set: function( v )
	{
		if(typeof(v) != "object")
			return;
		for(var i in v)
			if( v[i] === null || v[i].constructor === String || v[i] === GL.Texture )
				this._textures[i] = v[i];
	},
	get: function(){
		return this._textures;
	},
	enumerable: true
});

Object.defineProperty( GlobalInfo.prototype, 'render_settings', {
	set: function( v )
	{
		if( !v )
		{
			this._render_settings = null;
			return;
		}
		if(typeof(v) != "object")
			return;
		if(!this._render_settings)
			this._render_settings = new LS.RenderSettings();
		if(v.constructor === Array && v[3] == "RenderSettings") //encoded object ["@ENC","object",data,"RenderSettings"]
			this._render_settings.configure( v[2] );
		else
			this._render_settings.configure(v);
	},
	get: function(){
		return this._render_settings;
	},
	enumerable: true
});

//called when updating the coefficients from the editor
GlobalInfo.prototype.computeIrradiance = function( position, near, far, background_color )
{
	if(!LS.Components.IrradianceCache)
		throw("cannot compute, no LS.Components.IrradianceCache component found");

	position = position || vec3.create();
	var texture_size = LS.Components.IrradianceCache.capture_cubemap_size; //default is 64
	var texture_settings = { type: gl.FLOAT, texture_type: gl.TEXTURE_CUBE_MAP, format: gl.RGB };
	var cubemap = new GL.Texture( LS.Components.IrradianceCache.final_cubemap_size, LS.Components.IrradianceCache.final_cubemap_size, texture_settings );
	var temp_cubemap = new GL.Texture( texture_size, texture_size, texture_settings );
	//renders scene to cubemap
	LS.Components.IrradianceCache.captureIrradiance( position, cubemap, render_settings, near || 0.1, far || 1000, background_color || [0,0,0,1], true, temp_cubemap );
	this.irradiance = LS.Components.IrradianceCache.computeSH( cubemap );
	console.log( "IR factor", this.irradiance );
}

GlobalInfo.prototype.clearIrradiance = function()
{
	this.irradiance = null;
}

GlobalInfo.icon = "mini-icon-bg.png";
GlobalInfo.DEFAULT_AMBIENT_COLOR = vec3.fromValues(0.2, 0.2, 0.2);

GlobalInfo.prototype.onAddedToScene = function(scene)
{
	scene.info = this;
	LEvent.bind( scene, "fillSceneUniforms", this.fillSceneUniforms, this);
}

GlobalInfo.prototype.onRemovedFromScene = function(scene)
{
	//scene.info = null;
	LEvent.unbind( scene, "fillSceneUniforms", this.fillSceneUniforms, this);
}

GlobalInfo.prototype.fillSceneUniforms = function()
{
	if(this.irradiance && 1)
	{
		if(!this._irradiance_final)
			this._irradiance_final = new Float32Array( this.irradiance.length );
		for(var i = 0; i < this._irradiance_final.length; ++i)
			this._irradiance_final[i] = this.irradiance[i] * this._irradiance_color[i%3];

		this._uniforms.u_sh_coeffs = this._irradiance_final;
		LS.Renderer.enableFrameShaderBlock( "applyIrradiance", this._uniforms );
	}
}


GlobalInfo.prototype.getResources = function(res)
{
	for(var i in this._textures)
	{
		if(typeof(this._textures[i]) == "string")
			res[ this._textures[i] ] = GL.Texture;
	}
	return res;
}

GlobalInfo.prototype.getPropertiesInfo = function()
{
	return {
		"ambient_color":"color",
		"textures/environment": "texture",
		"render_settings":"RenderSettings"
	};
}

GlobalInfo.prototype.setProperty = function( name, value )
{
	if(name.substr(0,9) == "textures/" && (!value || value.constructor === String || value.constructor === GL.Texture) )
	{
		this._textures[ name.substr(9) ] = value;
		return true;
	}
}

//used for animation tracks
GlobalInfo.prototype.getPropertyInfoFromPath = function( path )
{
	if(path[0] != "textures")
		return;

	if(path.length == 1)
		return {
			node: this._root,
			target: this._textures,
			type: "object"
		};

	var varname = path[1];

	return {
		node: this._root,
		target: this._textures,
		name: varname,
		value: this._textures[ varname ] || null,
		type: "texture"
	};
}

GlobalInfo.prototype.setPropertyValueFromPath = function( path, value, offset )
{
	offset = offset || 0;
	if( path.length < (offset+1) )
		return;

	if( path[offset] != "textures" )
		return;

	var varname = path[offset+1];
	this._textures[ varname ] = value;
}


GlobalInfo.prototype.onResourceRenamed = function (old_name, new_name, resource)
{
	for(var i in this._textures)
	{
		if(this._textures[i] == old_name)
			this._textures[i] = new_name;
	}
}

LS.registerComponent( GlobalInfo );
LS.GlobalInfo = GlobalInfo;