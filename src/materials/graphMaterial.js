//allows to create shaders using the graph editor
function GraphMaterial(o)
{
	ShaderMaterial.call(this,null); //do not pass the data object, it is called later

	this.blend_mode = LS.Blend.NORMAL;

	this._filename = "";

	this._shader = "";
	this._shader_version = -1;
	this._shader_flags = 0; //?

	this._graphcode = null; //resource that contains the graph json

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

GraphMaterial.valid_properties = ["float","vec2","vec3","vec4","color","texture"];

GraphMaterial.description = "This material allows to design the shader using the build-in visual graph designer, this helps prototyping materials very fast.";

Object.defineProperty( GraphMaterial.prototype, "filename", {
	enumerable: false,
	get: function() {
		return this._filename;
	},
	set: function(v) {
		if( this._filename == v )
		{
			if( (v && this._graphcode) || (!v && !this._graphcode) )
			return;
		}

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
	if(!this._graphcode || !this._graphcode.getShaderCode)
		return null;
	return this._graphcode.getShaderCode(null, GraphMaterial.code_template );
}

/**
* Collects all the resources needed by this material (textures)
* @method getResources
* @param {Object} resources object where all the resources are stored
* @return {Texture}
*/
GraphMaterial.prototype.getResources = function (res)
{
	for(var i = 0; i < this._properties.length; ++i)
	{
		var p = this._properties[i];
		if(p.type == "texture" && p.value )
			res[ p.value ] = GL.Texture;
	}

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
		properties: LS.cloneObject( this._properties )
	}
	return o;
}


GraphMaterial.prototype.configure = function(o) { 
	LS.cloneObject(o, this);
	if(o.properties)
	{
		this._properties = LS.cloneObject( o.properties );
		for(var i = 0; i < this._properties.length; ++i)
		{
			var p = this._properties[i];
			this._properties_by_name[ p.name ] = p;
		}
	}
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
				console.error("Shader Graph not found or not a Shader Graph");
			if(on_complete)
				on_complete(that);
		});
		return;
	}
}

GraphMaterial.prototype.updatePropertiesFromGraph = function()
{
	var new_properties = [];
	var new_properties_by_name = {};

	var graphcode = this._graphcode;
	if(!graphcode)
	{
		this._properties = new_properties;
		this._properties_by_name = new_properties_by_name;
		return;
	}

	//search for uniforms
	for(var i = 0; i < graphcode.properties.length; ++i)
	{
		var prop = graphcode.properties[i];

		var old_p = this._properties_by_name[ prop.name ];
		var value = old_p && old_p.type == prop.type ? old_p.value : LS.cloneObject( prop.value );

		var p = { name: prop.name, type: prop.type, widget: prop.widget || null, value: value };
		new_properties.push( p );
		new_properties_by_name[ prop.name ] = p;
	}

	this._properties = new_properties;
	this._properties_by_name = new_properties_by_name;
}

GraphMaterial.prototype.fillUniforms = function()
{
	var samp_index = 0;
	for(var i in this._properties )
	{
		var p = this._properties[i];

		if(p.type == "texture")
		{
			var index = samp_index++;
			this._samplers[ index ] = p.value || ":white";
			this._uniforms[ "u_" + p.name ] = index;
		}
		else
			this._uniforms[ "u_" + p.name ] = p.value;

	}
}

/**
* gets all the properties and its types
* @method getProperties
* @return {Object} object with name:type
*/
GraphMaterial.prototype.getProperties = function()
{
	var graph = this.graph;
	if(!graph)
		return null;

	var o = {};
	for(var i = 0; i < this._properties.length; ++i)
	{
		var p = this._properties[i];
		o[ p.name ] = p.type;
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
	for(var i in this._properties)
	{
		var prop = this._properties[i];
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

	for(var i in this._properties)
	{
		var prop = this._properties[i];
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

	for(var i in this._properties)
	{
		var prop = this._properties[i];
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

	for(var i in this._properties)
	{
		var prop = this._properties[i];
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

	for(var i in this._properties)
	{
		var prop = this._properties[i];
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

GraphMaterial.default_graph = {"last_node_id":2,"last_link_id":1,"nodes":[{"id":2,"type":"shader/phong","pos":[328,242],"size":[140,186],"flags":{},"order":0,"mode":0,"inputs":[{"name":"albedo","type":"vec3","link":null},{"name":"ambient","type":"vec3","link":null},{"name":"emission","type":"vec3","link":null},{"name":"normal","type":"vec3","link":null},{"name":"specular","type":"float","link":null},{"name":"gloss","type":"float","link":null},{"name":"reflectivity","type":"float","link":null},{"name":"alpha","type":"float","link":null},{"name":"extra","type":"vec4","link":null}],"outputs":[{"name":"out","type":"vec4","links":[1]}],"properties":{}},{"id":1,"type":"shader/fs_output","pos":[651,241],"size":[140,66],"flags":{},"order":1,"mode":0,"inputs":[{"name":"","type":"T,float,vec2,vec3,vec4","link":1}],"properties":{}}],"links":[[1,2,0,1,0,"T,float,vec2,vec3,vec4"]],"groups":[],"config":{},"version":0.4}

GraphMaterial.code_template = "\n\
\n\
\\default.vs\n\
\n\
precision mediump float;\n\
attribute vec3 a_vertex;\n\
attribute vec3 a_normal;\n\
attribute vec2 a_coord;\n\
#pragma shaderblock \"vertex_color\"\n\
#pragma shaderblock \"coord1\"\n\
#ifdef BLOCK_COORD1\n\
	attribute vec2 a_coord1;\n\
	varying vec2 v_uvs1;\n\
#endif\n\
#ifdef BLOCK_VERTEX_COLOR\n\
	attribute vec4 a_color;\n\
	varying vec4 v_vertex_color;\n\
#endif\n\
#pragma shaderblock \"instancing\"\n\
\n\
//varyings\n\
varying vec3 v_pos;\n\
varying vec3 v_normal;\n\
varying vec2 v_uvs;\n\
varying vec3 v_local_pos;\n\
varying vec3 v_local_normal;\n\
\n\
//matrices\n\
#ifdef BLOCK_INSTANCING\n\
	attribute mat4 u_model;\n\
	varying mat4 v_model;\n\
	//varying float v_instance_id;\n\
#else\n\
	uniform mat4 u_model;\n\
#endif\n\
uniform mat4 u_normal_model;\n\
uniform mat4 u_view;\n\
uniform mat4 u_viewprojection;\n\
\n\
//globals\n\
uniform float u_time;\n\
uniform vec4 u_viewport;\n\
uniform float u_point_size;\n\
\n\
#pragma shaderblock \"morphing\"\n\
#pragma shaderblock \"skinning\"\n\
\n\
//camera\n\
uniform vec3 u_camera_eye;\n\
{{vs_out}}\n\
void main() {\n\
	\n\
	vec4 vertex4 = vec4(a_vertex,1.0);\n\
	v_local_pos = a_vertex;\n\
	v_local_normal = a_normal;\n\
	v_normal = a_normal;\n\
	v_uvs = a_coord;\n\
	#ifdef BLOCK_COORD1\n\
		v_uvs1 = a_coord1;\n\
	#endif\n\
	#ifdef BLOCK_VERTEX_COLOR\n\
		v_vertex_color = a_color;\n\
	#endif\n\
  \n\
  //deforms\n\
  {{vs_local}}\n\
  applyMorphing( vertex4, v_normal );\n\
  applySkinning( vertex4, v_normal );\n\
	\n\
	//vertex\n\
	v_pos = (u_model * vertex4).xyz;\n\
  \n\
  \n\
	//normal\n\
	#ifdef BLOCK_INSTANCING\n\
		v_normal = (u_model * vec4(v_normal,0.0)).xyz;\n\
		//v_instance_id = gl_InstanceID;\n\
	#else\n\
		v_normal = (u_normal_model * vec4(v_normal,0.0)).xyz;\n\
	#endif\n\
	{{vs_global}}\n\
	gl_Position = u_viewprojection * vec4(v_pos,1.0);\n\
}\n\
\n\
\\color.fs\n\
\n\
#ifdef DRAW_BUFFERS\n\
	#extension GL_EXT_draw_buffers : require \n\
#endif\n\
precision mediump float;\n\
\n\
//varyings\n\
varying vec3 v_pos;\n\
varying vec3 v_normal;\n\
varying vec3 v_local_pos;\n\
varying vec3 v_local_normal;\n\
varying vec2 v_uvs;\n\
#pragma shaderblock \"vertex_color\"\n\
#pragma shaderblock \"coord1\"\n\
#ifdef BLOCK_COORD1\n\
	varying vec2 v_uvs1;\n\
#endif\n\
#ifdef BLOCK_VERTEX_COLOR\n\
	varying vec4 v_vertex_color;\n\
#endif\n\
#pragma shaderblock \"instancing\"\n\
\n\
//globals\n\
uniform vec3 u_camera_eye;\n\
uniform vec4 u_clipping_plane;\n\
uniform float u_time;\n\
uniform vec4 u_background_color;\n\
uniform vec4 u_material_color;\n\
#ifdef BLOCK_INSTANCING\n\
	mat4 u_model;\n\
	varying mat4 v_model;\n\
	//varying v_instance_id;\n\
#else\n\
	uniform mat4 u_model;\n\
	//float v_instance_id;\n\
#endif\n\
uniform mat4 u_normal_model;\n\
uniform mat4 u_view;\n\
uniform mat4 u_viewprojection;\n\
#pragma snippet \"input\"\n\
\n\
#pragma snippet \"testClippingPlane\"\n\
\n\
{{fs_out}}\n\
\n\
void main() {\n\
	Input IN = getInput();\n\
	if(testClippingPlane(u_clipping_plane,IN.worldPos) < 0.0)\n\
		discard;\n\
	\n\
	#ifdef BLOCK_INSTANCING\n\
		u_model = v_model;\n\
	#else\n\
		//v_instance_id = 0.0;\n\
	#endif\n\
	IN.vertex = v_local_pos;\n\
	IN.normal = v_local_normal;\n\
	#ifdef BLOCK_VERTEX_COLOR\n\
		IN.color = v_vertex_color;\n\
	#endif\n\
	#ifdef BLOCK_COORD1\n\
		IN.uv1 = v_uvs1;\n\
	#endif\n\
	vec4 _final_color = vec4(1.0);\n\
	vec4 _final_color1 = vec4(0.0);\n\
{{fs_code}}\n\
	\n\
	#ifdef DRAW_BUFFERS\n\
	  gl_FragData[0] = _final_color;\n\
	  #ifdef BLOCK_FIRSTPASS\n\
		  #ifdef BLOCK_NORMALBUFFER\n\
			  gl_FragData[1] = vec4( o.Normal * 0.5 + vec3(0.5), 1.0 );\n\
		  #else\n\
			  gl_FragData[1] = _final_color1;\n\
		  #endif\n\
	  #else\n\
		  gl_FragData[1] = vec4(0.0);\n\
	 #endif\n\
	#else\n\
	  gl_FragColor = _final_color;\n\
	#endif\n\
}\n\
\n\
\\shadow.fs\n\
\n\
precision mediump float;\n\
\n\
//varyings\n\
varying vec3 v_pos;\n\
varying vec3 v_normal;\n\
varying vec2 v_uvs;\n\
varying vec3 v_local_pos;\n\
varying vec3 v_local_normal;\n\
\n\
//globals\n\
uniform vec3 u_camera_eye;\n\
uniform vec4 u_clipping_plane;\n\
uniform vec4 u_material_color;\n\
\n\
uniform mat3 u_texture_matrix;\n\
\n\
#pragma snippet \"input\"\n\
#pragma snippet \"surface\"\n\
#pragma snippet \"perturbNormal\"\n\
#define SHADOWMAP\n\
\n\
{{fs_out}}\n\
\n\
void main() {\n\
	Input IN = getInput();\n\
	IN.vertex = v_local_pos;\n\
	IN.normal = v_local_normal;\n\
	gl_FragColor = vec4(u_material_color,1.0);\n\
}\n\
";