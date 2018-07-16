function GraphMaterial(o)
{
	ShaderMaterial.call(this,null); //do not pass the data object, it is called later

	this.blend_mode = LS.Blend.NORMAL;

	this._filename = "";

	this._shader = "";
	this._shader_version = -1;
	this._shader_flags = 0; //?

	this._uniforms = {};
	this._samplers = [];
	this._properties = [];
	this._properties_by_name = {};

	this._passes = {};
	this._light_mode = Material.ONE_LIGHT;
	this._primitive = -1;
	this._allows_instancing = false;

	this._version = -1;
	this._shader_version = -1;

	this._loading = false;

	if(o)
		this.configure(o);
}

GraphMaterial.icon = "mini-icon-graph.png";

GraphMaterial["@filename"] = { type:"resource", data_type: "graph" };

GraphMaterial.prototype.renderInstance = ShaderMaterial.prototype.renderInstance;
GraphMaterial.prototype.renderShadowInstance = ShaderMaterial.prototype.renderShadowInstance;
GraphMaterial.prototype.renderPickingInstance = ShaderMaterial.prototype.renderPickingInstance;

Object.defineProperty( GraphMaterial.prototype, "filename", {
	enumerable: false,
	get: function() {
		return this._filename;
	},
	set: function(v) {
		if(this._filename == v)
			return;
		if(v) //to avoid double slashes
			v = LS.ResourcesManager.cleanFullpath( v );
		this._filename = v;
		this._loading = false;
		this.processGraph();
	}
});

Object.defineProperty( GraphMaterial.prototype, "graphcode", {
	enumerable: false,
	get: function() {
		return this._graphcode;
	},
	set: function(v) {
		//if(this._graphcode == v) return; //disabled because sometimes we want to force reload
		this._loading = false;
		this._graphcode = v;
		if( this._graphcode )
			this._filename = this._graphcode.fullpath || this._graphcode.filename;
		else 
			this._filename = null;
		//this._graph_properties = this.serializeProperties();
		this.processGraph();
	}
});

Object.defineProperty( GraphMaterial.prototype, "graph", {
	enumerable: false,
	get: function() {
		return this._graphcode ? this._graphcode.graph : null;
	},
	set: function(v) {
		throw("graph cannot be set to a material, you must assign a graphcode instead");
	}
});

GraphMaterial.shader_codes = {};

//returns the LS.ShaderCode required to render
//here we cannot filter by light pass because this is done before applying shaderblocks
//in the StandardMaterial we cache versions of the ShaderCode according to the settings
GraphMaterial.prototype.getShaderCode = function( instance, render_settings, pass )
{
	if(!this._graphcode)
		return null;
	return this._graphcode.getShaderCode();
}


/**
* Collects all the resources needed by this material (textures)
* @method getResources
* @param {Object} resources object where all the resources are stored
* @return {Texture}
*/
GraphMaterial.prototype.getResources = function (res)
{
	if(!this._graphcode)
		return res;

	res[ this.filename ] = true;
	if(this._graphcode)
		this._graphcode.graph.sendEventToAllNodes("getResources",res);
	
	return res;
}

GraphMaterial.prototype.serialize = function() { 
	//var o = LS.Material.prototype.serialize.apply(this);
	return {
		uid: this.uid,
		material_class: LS.getObjectClassName(this),
		filename: this.filename,
		properties: null //TO DO
	}
	return o;
}


GraphMaterial.prototype.configure = function(o) { 
	LS.cloneObject(o, this);
	this.processGraph();
}

GraphMaterial.prototype.processGraph = function( skip_events, on_complete )
{
	if(!this._filename)
	{
		this._graphcode = null;
		return;
	}

	var that = this;
	this._graphcode = LS.ResourcesManager.getResource( this._filename );
	if(!this._graphcode && !this._loading) //must be loaded
	{
		this._loading = true;
		LS.ResourcesManager.load( this._filename, null, function( res, url ){
			this._loading = false;
			if( url != that.filename )
				return;
			if( res && res.type == GraphCode.SHADER_GRAPH )
				that._graphcode = res;
			else
				console.error("Shader Graph not found or now a Shader Graph");
			if(on_complete)
				on_complete(that);
		});
		return;
	}
}


/**
* gets all the properties and its types
* @method getProperties
* @return {Object} object with name:type
*/
GraphMaterial.prototype.getProperties = function()
{
	var o = {
		color:"vec3",
		opacity:"number",
		shader_name: "string",
		blend_mode: "number",
		code: "string"
	};

	//from this material
	for(var i in this.properties)
	{
		var prop = this.properties[i];
		o[prop.name] = prop.type;
	}	

	return o;
}

/**
* Event used to inform if one resource has changed its name
* @method onResourceRenamed
* @param {Object} resources object where all the resources are stored
* @return {Texture}
*/
GraphMaterial.prototype.onResourceRenamed = function (old_name, new_name, resource)
{
	//global
	Material.prototype.onResourceRenamed.call( this, old_name, new_name, resource );

	//specific
	for(var i in this.properties)
	{
		var prop = this.properties[i];
		if( prop.value == old_name)
			prop.value = new_name;
	}
}


/**
* gets all the properties and its types
* @method getProperty
* @return {Object} object with name:type
*/
GraphMaterial.prototype.getProperty = function(name)
{
	if(this[name])
		return this[name];

	if( name.substr(0,4) == "tex_")
		return this.textures[ name.substr(4) ];

	for(var i in this.properties)
	{
		var prop = this.properties[i];
		if(prop.name == name)
			return prop.value;
	}	

	return null;
}

/**
* assign a value to a property in a safe way
* @method setProperty
* @param {Object} object to configure from
*/
GraphMaterial.prototype.setProperty = function(name, value)
{
	//redirect to base material
	if( Material.prototype.setProperty.call(this,name,value) )
		return true;

	for(var i in this.properties)
	{
		var prop = this.properties[i];
		if(prop.name != name)
			continue;
		prop.value = value;
		return true;
	}

	return false;
}


GraphMaterial.prototype.getTextureChannels = function()
{
	var channels = [];

	for(var i in this.properties)
	{
		var prop = this.properties[i];
		if(prop.type != "texture" && prop.type != "cubemap")
			continue;
		channels.push(prop.name);
	}

	return channels;
}

/**
* Assigns a texture to a channel
* @method setTexture
* @param {Texture} texture
* @param {String} channel default is COLOR
*/
GraphMaterial.prototype.setTexture = function(texture, channel, uvs) {

	for(var i in this.properties)
	{
		var prop = this.properties[i];
		if(prop.type != "texture" && prop.type != "cubemap")
			continue;
		if(channel && prop.name != channel) //assign to the channel or if there is no channel just to the first one
			continue;

		prop.value = texture;
		if(this.textures)
			this.textures[channel] = texture;
		if(!channel)
			break;
	}

	if(!texture) return;
	if(texture.constructor == String && texture[0] != ":")
		ResourcesManager.load(texture);
}

LS.registerMaterialClass( GraphMaterial );
LS.GraphMaterial = GraphMaterial;

