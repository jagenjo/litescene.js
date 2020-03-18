///@INFO: UNCOMMON

/**
* It complements a MeshRenderer to add Morph Targets (Blend Shapes) to deform meshes.
* Morph Targets of a mesh must have the same topology and number of vertex, otherwise it won't work.
* @class MorphDeformer
* @namespace LS.Components
* @constructor
* @param {Object} object to configure from
*/
function MorphDeformer(o)
{
	this.enabled = true;

	/**
	* The mode used to apply the morph targets, could be using the CPU, the GPU using uniforms( limited by the browser/driver) or using Textures (more expensive). Leave it as automatic so the system knows the best case.
	* @property mode {Number} MorphDeformer.AUTOMATIC, MorphDeformer.CPU, MorphDeformer.STREAMS, MorphDeformer.TEXTURES
	* @default MorphDeformer.AUTOMATIC;
	*/
	this.mode = MorphDeformer.AUTOMATIC;

	/**
	* if true the meshes will be treated as a increment over the base mesh, not as an absolute mesh
	* @property delta_meshes {Boolean} 
	* @default MorphDeformer.AUTOMATIC;
	*/
	this.delta_meshes = false;

	/**
	* An array with every morph targets info in the form of { mesh: mesh_name, weight: number }
	* @property morph_targets {Array}
	* @default [];
	*/
	this.morph_targets = [];

	if(global.gl)
	{
		if(MorphDeformer.max_supported_vertex_attribs === undefined)
			MorphDeformer.max_supported_vertex_attribs = gl.getParameter( gl.MAX_VERTEX_ATTRIBS );
		if(MorphDeformer.max_supported_morph_targets_using_streams === undefined)
			MorphDeformer.max_supported_morph_targets_using_streams = (gl.getParameter( gl.MAX_VERTEX_ATTRIBS ) - 6) / 2; //6 reserved for vertex, normal, uvs, uvs2, weights, bones. 
	}

	
	this._stream_weights = new Float32Array( 4 );
	this._uniforms = { u_morph_weights: this._stream_weights, u_morph_info: 0 };

	if(o)
		this.configure(o);
}

MorphDeformer.AUTOMATIC = 0;
MorphDeformer.CPU = 1;
MorphDeformer.STREAMS = 2;
MorphDeformer.TEXTURES = 3;

MorphDeformer.icon = "mini-icon-teapot.png";
MorphDeformer.force_GPU  = true; //used to avoid to recompile the shader when all morphs are 0
MorphDeformer["@mode"] = { type:"enum", values: {"automatic": MorphDeformer.AUTOMATIC, "CPU": MorphDeformer.CPU, "streams": MorphDeformer.STREAMS, "textures": MorphDeformer.TEXTURES }};

MorphDeformer.prototype.onAddedToNode = function(node)
{
	LEvent.bind( node, "collectRenderInstances", this.onCollectInstances, this );
}

//object with name:weight
Object.defineProperty( MorphDeformer.prototype, "name_weights", {
	set: function(v) {
		if(!v)
			return;
		for(var i = 0; i < this.morph_targets.length; ++i)
		{
			var m = this.morph_targets[i];
			if(v[m.mesh] !== undefined)
				m.weight = Number(v[m.mesh]);
		}
	},
	get: function()
	{
		var result = {};
		for(var i = 0; i < this.morph_targets.length; ++i)
		{
			var m = this.morph_targets[i];
			result[ m.mesh ] = m.weight;
		}
		return result;
	},
	enumeration: false
});


Object.defineProperty( MorphDeformer.prototype, "weights", {
	set: function(v) {
		if(!v || !v.length)
			return;
		for(var i = 0; i < v.length; ++i)
			if( this.morph_targets[i] )
				this.morph_targets[i].weight = v[i] || 0;
	},
	get: function()
	{
		var result = new Array( this.morph_targets.length );
		for(var i = 0; i < this.morph_targets.length; ++i)
			result[i] = this.morph_targets[i].weight;
		return result;
	},
	enumeration: false
});

MorphDeformer.prototype.onRemovedFromNode = function(node)
{
	LEvent.unbind( node, "collectRenderInstances", this.onCollectInstances, this );

	//disable
	if( this._last_RI )
		this.disableMorphingGPU( this._last_RI );
	this._last_RI = null;
}

MorphDeformer.prototype.getResources = function(res)
{
	for(var i = 0; i < this.morph_targets.length; ++i)
		if( this.morph_targets[i].mesh )
			res[ this.morph_targets[i].mesh ] = GL.Mesh;
}

MorphDeformer.prototype.onResourceRenamed = function (old_name, new_name, resource)
{
	for(var i = 0; i < this.morph_targets.length; ++i)
		if( this.morph_targets[i].mesh == old_name )
			this.morph_targets[i].mesh = new_name;
}


/**
* Sets the weight for all the 
* @method clearWeights
* @param {Object} object with the serialized info
*/
MorphDeformer.prototype.clearWeights = function()
{
	for(var i = 0; i < this.morph_targets.length; ++i)
		this.morph_targets[i].weight = 0;
}

/**
* Adds a new morph target
* @method addMorph
* @param {String} mesh_name
* @param {Number} weight
*/
MorphDeformer.prototype.addMorph = function( mesh_name, weight)
{
	weight = weight || 0;
	var index = this.getMorphIndex( mesh_name );
	if(index == -1)
		this.morph_targets.push({mesh: mesh_name, weight: weight});
	else
		this.morph_targets[index] = {mesh: mesh_name, weight: weight};
}

MorphDeformer.prototype.onCollectInstances = function( e, render_instances )
{
	if(!render_instances.length || MorphDeformer.max_supported_vertex_attribs < 16)
		return;

	var morph_RI = this.enabled ? render_instances[ render_instances.length - 1] : null;
	
	if( morph_RI != this._last_RI && this._last_RI )
		this.disableMorphingGPU( this._last_RI );
	this._last_RI = morph_RI;

	if( !morph_RI || !morph_RI.mesh)
		return;

	this._last_base_mesh = morph_RI.mesh;
	this._valid_morphs = this.computeValidMorphs( this._valid_morphs, morph_RI.mesh );

	//grab the RI created previously and modified
	//this.applyMorphTargets( last_RI );

	if(this.mode === MorphDeformer.AUTOMATIC )
	{
		if( this._morph_texture_supported === undefined )
			this._morph_texture_supported = (gl.extensions["OES_texture_float"] !== undefined && gl.getParameter( gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS ) > 1);

		if( this._valid_morphs.length == 0 && !MorphDeformer.force_GPU )
			return;

		if( this._valid_morphs.length <= MorphDeformer.max_supported_morph_targets_using_streams ) //use GPU
			this.applyMorphTargetsByGPU( morph_RI, this._valid_morphs );
		else if( this._morph_texture_supported ) //use GPU with textures
			this.applyMorphUsingTextures( morph_RI, this._valid_morphs );
		else
			this.applyMorphBySoftware( morph_RI, this._valid_morphs );
	}
	else
	{
		switch( this.mode )
		{
			case MorphDeformer.STREAMS: this.applyMorphTargetsByGPU( morph_RI, this._valid_morphs ); break;
			case MorphDeformer.TEXTURES: this.applyMorphUsingTextures( morph_RI, this._valid_morphs ); break;
			default: this.applyMorphBySoftware( morph_RI, this._valid_morphs ); break;
		}
	}
}

//returns a list of the morph targets that have some weight and with a mesh that is loaded
MorphDeformer.prototype.computeValidMorphs = function( valid_morphs, base_mesh )
{
	valid_morphs = valid_morphs || [];
	valid_morphs.length = 0;

	if(!base_mesh)
		return valid_morphs;

	//sort by weight
	var morph_targets = this.morph_targets.concat();
	morph_targets.sort( function(a,b) { return Math.abs(b.weight) - Math.abs(a.weight);  } );

	//collect
	for(var i = 0; i < morph_targets.length; ++i)
	{
		var morph = morph_targets[i];
		if(!morph.mesh || Math.abs(morph.weight) < 0.001)
			continue;
		var morph_mesh = LS.ResourcesManager.resources[ morph.mesh ];
		if(!morph_mesh || morph_mesh.constructor !== GL.Mesh)
			continue;
		if(!morph_mesh.info)
			morph_mesh.info = {};
		morph_mesh.info.morph_target_from = base_mesh.filename;
		valid_morphs.push( { name: morph.mesh, weight: morph.weight, mesh: morph_mesh } );
	}

	return valid_morphs;
}

//add to the RI the info to apply the morphs using streams in the GPU
MorphDeformer.prototype.applyMorphTargetsByGPU = function( RI, valid_morphs )
{
	var base_mesh = RI.mesh;

	var base_vertices_buffer = base_mesh.vertexBuffers["vertices"];
	var streams_code = "";
	var morphs_buffers = {};
	var morphs_weights = [];

	//collect (max 4 if using streams)
	for(var i = 0; i < valid_morphs.length && i < 4; ++i)
	{
		var morph = valid_morphs[i];
		var morph_mesh = morph.mesh;

		var vertices_buffer = morph_mesh.vertexBuffers["vertices"];
		if(!vertices_buffer || vertices_buffer.data.length != base_vertices_buffer.data.length)
			continue;

		var normals_buffer = morph_mesh.vertexBuffers["normals"];
		if(!normals_buffer)
			continue;

		var vertices_cloned = vertices_buffer.clone(true);
		var normals_cloned = normals_buffer.clone(true);
		vertices_cloned.attribute = null;
		normals_cloned.attribute = null;

		morphs_buffers["a_vertex_morph" + i ] = vertices_cloned;
		morphs_buffers["a_normal_morph" + i ] = normals_cloned;

		morphs_weights.push( morph.weight );
	}

	//add buffers
	RI.vertex_buffers = {};
	for(var i in base_mesh.vertexBuffers)
		RI.vertex_buffers[i] = base_mesh.vertexBuffers[i];
	for(var i in morphs_buffers)
		RI.vertex_buffers[i] = morphs_buffers[i];

	if(RI.samplers[ LS.Renderer.MORPHS_TEXTURE_SLOT ])
	{
		delete RI.uniforms["u_morph_vertices_texture"];
		delete RI.uniforms["u_morph_normals_texture"];
		RI.samplers[ LS.Renderer.MORPHS_TEXTURE_SLOT ] = null;
		RI.samplers[ LS.Renderer.MORPHS_TEXTURE2_SLOT ] = null;
	}

	var weights = this._stream_weights;
	if( !weights.fill ) //is an Array?
	{
		for(var i = 0; i < weights.length; ++i)
			weights[i] = 0;
	}
	else
		weights.fill(0); //fill first because morphs_weights could have zero length
	weights.set( morphs_weights );
	RI.uniforms["u_morph_weights"] = weights;
	RI.uniforms["u_morph_info"] = this.delta_meshes ? 1 : 0;

	//SHADER BLOCK
	RI.addShaderBlock( MorphDeformer.shader_block ); //global
	RI.addShaderBlock( LS.MorphDeformer.morphing_streams_block, this._uniforms );
	RI.removeShaderBlock( LS.MorphDeformer.morphing_texture_block );
}

MorphDeformer.prototype.applyMorphUsingTextures = function( RI, valid_morphs )
{
	var base_mesh = RI.mesh;
	var base_vertices_buffer = base_mesh.vertexBuffers["vertices"];
	var base_normals_buffer = base_mesh.vertexBuffers["normals"];

	//create textures for the base mesh
	if(!base_vertices_buffer._texture)
		base_vertices_buffer._texture = this.createGeometryTexture( base_vertices_buffer );
	if(!base_normals_buffer._texture)
		base_normals_buffer._texture = this.createGeometryTexture( base_normals_buffer );

	//LS.RM.textures[":debug_base_vertex"] = base_vertices_buffer._texture;
	//LS.RM.textures[":debug_base_normal"] = base_normals_buffer._texture;


	var morphs_textures = [];

	//create the texture container where all will be merged
	if(!this._morphtarget_vertices_texture || this._morphtarget_vertices_texture.height != base_vertices_buffer._texture.height )
	{
		this._morphtarget_vertices_texture = new GL.Texture( base_vertices_buffer._texture.width, base_vertices_buffer._texture.height, { format: gl.RGB, type: gl.FLOAT, filter: gl.NEAREST, wrap: gl.CLAMP_TO_EDGE, no_flip: true });
		this._morphtarget_normals_texture = new GL.Texture( base_normals_buffer._texture.width, base_normals_buffer._texture.height, { format: gl.RGB, type: gl.FLOAT, filter: gl.NEAREST, wrap: gl.CLAMP_TO_EDGE, no_flip: true });

		//used in the shader
		this._texture_size = vec4.fromValues( this._morphtarget_vertices_texture.width, this._morphtarget_vertices_texture.height, 
			1 / this._morphtarget_vertices_texture.width, 1 / this._morphtarget_vertices_texture.height );

		//LS.RM.textures[":debug_morph_vertex"] = this._morphtarget_vertices_texture;
		//LS.RM.textures[":debug_morph_normal"] = this._morphtarget_normals_texture;
	}

	//prepare morph targets
	for(var i = 0; i < valid_morphs.length; ++i)
	{
		var morph = valid_morphs[i];
		var morph_mesh = morph.mesh;

		var vertices_buffer = morph_mesh.vertexBuffers["vertices"];
		if(!vertices_buffer || vertices_buffer.data.length != base_vertices_buffer.data.length)
			continue;

		var normals_buffer = morph_mesh.vertexBuffers["normals"];
		if(!normals_buffer)
			continue;

		if(!vertices_buffer._texture)
			vertices_buffer._texture = this.createGeometryTexture( vertices_buffer );
		if(!normals_buffer._texture)
			normals_buffer._texture = this.createGeometryTexture( normals_buffer );

		//LS.RM.textures[":debug_morph_vertex_" + i] = vertices_buffer._texture;
		//LS.RM.textures[":debug_morph_normal_" + i] = normals_buffer._texture;
		morphs_textures.push( { weight: morph.weight, vertices: vertices_buffer._texture, normals: normals_buffer._texture } );
	}

	//accumulate all morphs targets in two textures that contains the final vertex and final normal

	var shader = this.getMorphTextureShader();
	shader.uniforms({ u_base_texture: 0, u_morph_texture: 1 });

	gl.disable( gl.DEPTH_TEST );
	gl.enable( gl.BLEND );
	gl.blendFunc( gl.ONE, gl.ONE );

	base_vertices_buffer._texture.bind(0);
	var quad_mesh = GL.Mesh.getScreenQuad();

	this._morphtarget_vertices_texture.drawTo( function(){
		gl.clearColor( 0,0,0,0 );
		gl.clear( gl.COLOR_BUFFER_BIT );
		for(var i = 0; i < morphs_textures.length; ++i )
		{
			var stream_texture = morphs_textures[i].vertices;
			stream_texture.bind(1);
			shader.uniforms({ u_weight: morphs_textures[i].weight });
			shader.draw( quad_mesh, gl.TRIANGLES );
		}
	});

	base_normals_buffer._texture.bind(0);

	this._morphtarget_normals_texture.drawTo( function(){
		gl.clearColor( 0,0,0,0 );
		gl.clear( gl.COLOR_BUFFER_BIT );
		for(var i = 0; i < morphs_textures.length; ++i )
		{
			var stream_texture = morphs_textures[i].normals;
			stream_texture.bind(1);
			shader.uniforms({ u_weight: morphs_textures[i].weight });
			shader.draw( quad_mesh, gl.TRIANGLES );
		}
	});

	gl.disable( gl.BLEND );

	//create sequence numbers buffer of the same size
	var num_verts = base_vertices_buffer.data.length / 3;
	if(!this._ids_buffer || this._ids_buffer.data.length != num_verts )
	{
		var ids_data = new Float32Array( num_verts );
		for(var i = 0; i < num_verts; ++i)
			ids_data[i] = i;
		this._ids_buffer = new GL.Buffer( gl.ARRAY_BUFFER, ids_data, 1, gl.STATIC_DRAW );
		this._ids_buffer.attribute = "a_morphing_ids";
	}

	//modify the RI to have the displacement texture
	RI.uniforms["u_morph_vertices_texture"] = LS.Renderer.MORPHS_TEXTURE_SLOT;
	RI.samplers[ LS.Renderer.MORPHS_TEXTURE_SLOT ] = this._morphtarget_vertices_texture;

	RI.uniforms["u_morph_normals_texture"] = LS.Renderer.MORPHS_TEXTURE2_SLOT;
	RI.samplers[ LS.Renderer.MORPHS_TEXTURE2_SLOT ] = this._morphtarget_normals_texture;

	RI.uniforms["u_morph_texture_size"] = this._texture_size;

	//add the ids (the texture with 0,1,2, 3,4,5, ...)
	RI.vertex_buffers["a_morphing_ids"] = this._ids_buffer;

	//SHADER BLOCK
	RI.addShaderBlock( MorphDeformer.shader_block );
	RI.addShaderBlock( LS.MorphDeformer.morphing_texture_block, { 
				u_morph_vertices_texture: LS.Renderer.MORPHS_TEXTURE_SLOT, 
				u_morph_normals_texture: LS.Renderer.MORPHS_TEXTURE2_SLOT, 
				u_morph_texture_size: this._texture_size 
			});
	RI.removeShaderBlock( LS.MorphDeformer.morphing_streams_block );
}


MorphDeformer.prototype.disableMorphingGPU = function( RI )
{
	if( !RI )
		return;
	
	if( RI.samplers[ LS.Renderer.MORPHS_TEXTURE_SLOT ] )
	{
		RI.samplers[ LS.Renderer.MORPHS_TEXTURE_SLOT ] = null;
		RI.samplers[ LS.Renderer.MORPHS_TEXTURE2_SLOT ] = null;
		delete RI.uniforms["u_morph_vertices_texture"];
		delete RI.uniforms["u_morph_normals_texture"];
	}

	RI.removeShaderBlock( LS.MorphDeformer.shader_block );
	RI.removeShaderBlock( LS.MorphDeformer.morphing_streams_block );
	RI.removeShaderBlock( LS.MorphDeformer.morphing_texture_block );
}

MorphDeformer.prototype.applyMorphBySoftware = function( RI, valid_morphs )
{
	var base_mesh = RI.mesh;
	var base_vertices_buffer = base_mesh.vertexBuffers["vertices"];

	this.disableMorphingGPU( RI ); //disable GPU version

	var key = ""; //used to avoid computing the mesh every frame

	//collect
	for(var i = 0; i < valid_morphs.length; ++i)
	{
		var morph = valid_morphs[i];
		key += morph.name + "|" + morph.weight.toFixed(2) + "|";
	}

	//to avoid recomputing if nothing has changed
	if(key == this._last_key)
	{
		//change the RI
		if(this._final_vertices_buffer)
			RI.vertex_buffers["vertices"] = this._final_vertices_buffer;
		if(this._final_normals_buffer)
			RI.vertex_buffers["normals"] = this._final_normals_buffer;
		return; 
	}
	this._last_key = key;

	var base_vertices_buffer = base_mesh.vertexBuffers["vertices"];
	var base_vertices = base_vertices_buffer.data;
	var base_normals_buffer = base_mesh.vertexBuffers["normals"];
	var base_normals = base_normals_buffer.data;

	//create final buffers
	if(!this._final_vertices || this._final_vertices.length != base_vertices.length )
	{
		this._final_vertices = new Float32Array( base_vertices.length );
		this._final_vertices_buffer = new GL.Buffer( gl.ARRAY_BUFFER, this._final_vertices, 3, gl.STREAM_DRAW );
		this._final_vertices_buffer.attribute = "a_vertex";
	}

	if(!this._final_normals || this._final_normals.length != base_normals.length )
	{
		this._final_normals = new Float32Array( base_normals.length );
		this._final_normals_buffer = new GL.Buffer( gl.ARRAY_BUFFER, this._final_normals, 3, gl.STREAM_DRAW );
		this._final_normals_buffer.attribute = "a_normal";
	}

	var vertices = this._final_vertices;
	var normals = this._final_normals;

	vertices.set( base_vertices );
	normals.set( base_normals );

	var morphs_vertices = [];
	var morphs_normals = [];
	var morphs_weights = [];
	var num_morphs = valid_morphs.length;

	for(var i = 0; i < valid_morphs.length; ++i)
	{
		var morph = valid_morphs[i];
		morphs_vertices.push( morph.mesh.vertexBuffers["vertices"].data );
		morphs_normals.push( morph.mesh.vertexBuffers["normals"].data );
		morphs_weights.push( morph.weight );
	}

	//fill them 
	if(this.delta_meshes)
	{
		for(var i = 0, l = vertices.length; i < l; i += 3)
		{
			var v = vertices.subarray(i,i+3);
			var n = normals.subarray(i,i+3);

			for(var j = 0; j < num_morphs; ++j)
			{
				var m_v = morphs_vertices[j];
				var m_n = morphs_normals[j];
				var w = morphs_weights[j];
				v[0] += m_v[i]* w;
				v[1] += m_v[i+1] * w;
				v[2] += m_v[i+2] * w;
				n[0] += m_n[i] * w;
				n[1] += m_n[i+1] * w;
				n[2] += m_n[i+2] * w;
			}
		}
	}
	else
	{
		for(var i = 0, l = vertices.length; i < l; i += 3)
		{
			var v = vertices.subarray(i,i+3);
			var n = normals.subarray(i,i+3);

			for(var j = 0; j < num_morphs; ++j)
			{
				var m_v = morphs_vertices[j];
				var m_n = morphs_normals[j];
				var w = morphs_weights[j];
				v[0] += (m_v[i] - base_vertices[i]) * w;
				v[1] += (m_v[i+1] - base_vertices[i+1]) * w;
				v[2] += (m_v[i+2] - base_vertices[i+2]) * w;
				n[0] += (m_n[i] - base_normals[i]) * w;
				n[1] += (m_n[i+1] - base_normals[i+1]) * w;
				n[2] += (m_n[i+2] - base_normals[i+2]) * w;
			}
		}
	}

	this._final_vertices_buffer.upload(  gl.STREAM_DRAW );
	this._final_normals_buffer.upload(  gl.STREAM_DRAW );

	//change the RI
	RI.vertex_buffers["vertices"] = this._final_vertices_buffer;
	RI.vertex_buffers["normals"] = this._final_normals_buffer;

}




MorphDeformer._blend_shader_fragment_code = "\n\
	precision highp float;\n\
	uniform sampler2D u_base_texture;\n\
	uniform sampler2D u_morph_texture;\n\
	uniform float u_weight;\n\
	varying vec2 v_coord;\n\
	void main() {\n\
		gl_FragColor = u_weight * ( texture2D(u_morph_texture, v_coord) - texture2D(u_base_texture, v_coord) );\n\
		gl_FragColor.w = 1.0;\n\
	}\n\
";

MorphDeformer._delta_blend_shader_fragment_code = "\n\
	precision highp float;\n\
	uniform sampler2D u_morph_texture;\n\
	uniform float u_weight;\n\
	varying vec2 v_coord;\n\
	void main() {\n\
		gl_FragColor = u_weight * texture2D(u_morph_texture, v_coord);\n\
		gl_FragColor.w = 1.0;\n\
	}\n\
";

MorphDeformer.prototype.getMorphTextureShader = function()
{
	if(this.delta_meshes)
	{
		if(!this._delta_blend_shader)
			this._delta_blend_shader = new GL.Shader( Shader.SCREEN_VERTEX_SHADER, MorphDeformer._delta_blend_shader_fragment_code );
		return this._delta_blend_shader;
	}

	if(!this._blend_shader)
		this._blend_shader = new GL.Shader( Shader.SCREEN_VERTEX_SHADER, MorphDeformer._blend_shader_fragment_code );
	return this._blend_shader;
}

//transfers the geometry to a texture
MorphDeformer.prototype.createGeometryTexture = function( data_buffer, texture )
{
	var stream_data = data_buffer.data;
	var buffer = stream_data.buffer;

	var max_texture_size = gl.getParameter( gl.MAX_TEXTURE_SIZE );

	var num_floats = stream_data.length; 
	var num_vertex = num_floats / 3;
	var width = Math.min( max_texture_size, num_vertex );
	var height = Math.ceil( num_vertex / width );

	var buffer_padded = new Float32Array( width * height * 3 );
	buffer_padded.set( stream_data );
	if(!texture || texture.width != width || texture.height != height )
		texture = new GL.Texture( width, height, { format: gl.RGB, type: gl.FLOAT, filter: gl.NEAREST, wrap: gl.CLAMP_TO_EDGE, pixel_data: buffer_padded, no_flip: true });
	else
		texture.uploadData( buffer_padded );
	return texture;
}

//in case the textures has been modyfied
MorphDeformer.prototype.recomputeGeometryTextures = function()
{
	var RI = this._last_RI;
	if(!RI)
		return;

	var base_mesh = RI.mesh;
	var base_vertices_buffer = base_mesh.vertexBuffers["vertices"];
	var base_normals_buffer = base_mesh.vertexBuffers["normals"];

	//create textures for the base mesh
	base_vertices_buffer._texture = this.createGeometryTexture( base_vertices_buffer, base_vertices_buffer._texture );
	base_normals_buffer._texture = this.createGeometryTexture( base_normals_buffer, base_normals_buffer._texture );

	var valid_morphs = this._valid_morphs;
	if(!valid_morphs)
		return;

	for(var i = 0; i < valid_morphs.length; ++i)
	{
		var morph = valid_morphs[i];
		var morph_mesh = morph.mesh;

		var vertices_buffer = morph_mesh.vertexBuffers["vertices"];
		if( vertices_buffer && vertices_buffer._texture )
			this.createGeometryTexture( vertices_buffer, vertices_buffer._texture );

		var normals_buffer = morph_mesh.vertexBuffers["normals"];
		if( normals_buffer && normals_buffer._texture )
			this.createGeometryTexture( normals_buffer, normals_buffer._texture );
	}
}

/**
* returns the index of the morph target that uses this mesh
* @method getMorphIndex
* @param {String} mesh_name the name (filename) of the mesh in the morph target
* @return {number} the index
*/
MorphDeformer.prototype.getMorphIndex = function(mesh_name)
{
	for(var i = 0; i < this.morph_targets.length; ++i)
		if (this.morph_targets[i].mesh == mesh_name )
			return i;
	return -1;
}

/**
* sets the mesh for a morph target
* @method setMorphMesh
* @param {number} index the index of the morph target
* @param {String} mesh the mesh resource
*/
MorphDeformer.prototype.setMorphMesh = function(index, value)
{
	if(index >= this.morph_targets.length)
		return;
	this.morph_targets[index].mesh = value;
}

/**
* sets the weight for a morph target
* @method setMorphWeight
* @param {number} index the index of the morph target
* @param {number} weight the weight
*/
MorphDeformer.prototype.setMorphWeight = function(index, value)
{
	if(index >= this.morph_targets.length)
		return;
	this.morph_targets[index].weight = value;
}

MorphDeformer.prototype.getPropertyInfoFromPath = function( path )
{
	if(path[0] != "morphs")
		return;

	if(path.length == 1)
		return {
			node: this._root,
			target: this.morph_targets,
			type: "object"
		};

	var num = parseInt( path[1] );
	if(num >= this.morph_targets.length)
		return;

	var varname = path[2];
	if(varname != "mesh" && varname != "weight")
		return;

	return {
		node: this._root,
		target: this.morph_targets[num],
		name: varname,
		value: this.morph_targets[num][ varname ] !== undefined ? this.morph_targets[num][ varname ] : null,
		type: varname == "mesh" ? "mesh" : "number"
	};
}

MorphDeformer.prototype.setPropertyValueFromPath = function( path, value, offset )
{
	offset = offset || 0;

	if( path.length < (offset+1) )
		return;

	if( path[offset] != "morphs" )
		return;

	var num = parseInt( path[offset+1] );
	if(num >= this.morph_targets.length)
		return;

	var varname = path[offset+2];
	this.morph_targets[num][ varname ] = value;
}

//used for graphs
MorphDeformer.prototype.setProperty = function(name, value)
{
	if( name == "enabled" )
		this.enabled = value;
	else if( name.substr(0,5) == "morph" )
	{
		name = name.substr(5);
		var t = name.split("_");
		var num = parseInt( t[0] );
		if( num < this.morph_targets.length )
		{
			if( t[1] == "weight" )
				this.morph_targets[ num ].weight = value;
			else if( t[1] == "mesh" )
				this.morph_targets[ num ].mesh = value;
		}
	}
	else if( name == "weights" )
		this.weights = value;
	else if( name == "name_weights" )
		this.name_weights = value;
}

MorphDeformer.prototype.getProperty = function(name)
{
	if(name.substr(0,5) == "morph" && name.length > 5)
	{
		var t = name.substr(5).split("_");
		var index = Number(t[0]);
		var morph = this.morph_targets[ index ];
		if(morph)
		{
			if(t[1] == "mesh")
				return morph.mesh;
			else if(t[1] == "weight")
				return morph.weight;
			else
				return morph;
		}
	}
}

MorphDeformer.prototype.getPropertiesInfo = function()
{
	var properties = {
		enabled: "boolean",
		weights: "array",
		name_weights: "object"
	};

	for(var i = 0; i < this.morph_targets.length; i++)
	{
		properties[ "morph" + i + "_weight" ] = "number";
		//properties[ "morph" + i + "_mesh" ] = "Mesh";
	}

	return properties;
}

/**
* Returns the base mesh on which the morph targets will be applied
* @method getBaseMesh
*/
MorphDeformer.prototype.getBaseMesh = function()
{
	if(!this._root)
		return null;
	if( this._last_base_mesh )
		return this._last_base_mesh;
	var mesh_renderer = this._root.getComponent( LS.Components.MeshRenderer );
	if( mesh_renderer )
		return LS.ResourcesManager.resources[ mesh_renderer.mesh ];
	return null;
}

/**
* Removes innecesary morph targets and removes data from mesh that is already in the base mesh (uvs and indices)
* @method optimizeMorphTargets
*/
MorphDeformer.prototype.optimizeMorphTargets = function()
{
	//base mesh
	var base_mesh = this.getBaseMesh();

	var morph_targets = this.morph_targets.concat();

	for(var i = 0; i < morph_targets.length; ++i)
	{
		var morph = morph_targets[i];
		var mesh = LS.ResourcesManager.meshes[ morph.mesh ];
		if(!mesh)
			continue;
		
		//remove data not used 
		mesh.removeVertexBuffer("coords", true);
		mesh.removeIndexBuffer("triangles", true);
		mesh.removeIndexBuffer("wireframe", true);

		//compute difference
		if( base_mesh )
		{
			var diff = MorphDeformer.computeMeshDifference( base_mesh, mesh );
			if( diff < 0.1 ) //too similar
			{
				var mesh_fullpath = mesh.fullpath || mesh.filename;
				console.log("morph target is too similar to base mesh, removing it: " + mesh_fullpath );
				var index = this.morph_targets.indexOf( morph );
				this.morph_targets.splice( index,1 );
				LS.ResourcesManager.unregisterResource( mesh_fullpath );
				var container_fullpath = mesh.from_pack || mesh.from_prefab;
				if( container_fullpath )
				{
					var container = LS.ResourcesManager.resources[ container_fullpath ];
					if(container)
						container.removeResource( mesh_fullpath );
				}
				continue;
			}
		}

		LS.ResourcesManager.resourceModified( mesh );
	}

	console.log("Morph targets optimized");
}

//computes the difference between to meshes, used to detect useless morph targets
MorphDeformer.computeMeshDifference = function( mesh_a, mesh_b )
{
	if(!mesh_a || !mesh_b || !mesh_a.vertexBuffers["vertices"] || !mesh_b.vertexBuffers["vertices"])
		return 0;

	var vertices_a = mesh_a.vertexBuffers["vertices"].data;
	var vertices_b = mesh_b.vertexBuffers["vertices"].data;

	if( !vertices_a || !vertices_b || vertices_a.length != vertices_b.length )
		return 0;

	var diff = 0;
	for( var i = 0; i < vertices_a.length; i+=3 )
		diff += vec3.distance( vertices_a.subarray(i,i+3), vertices_b.subarray(i,i+3) );
	return diff;
}

MorphDeformer.prototype.onInspectNode = function( inspector, graphnode )
{
	var that = this;
	inspector.addButton(null,"Add weights' inputs",{ callback: function(){
		for(var i = 0; i < that.morph_targets.length; ++i)
		{
			var morph = that.morph_targets[i];
			if(graphnode.findInputSlot("morph_" + i + "_weight") == -1)
				graphnode.addInput("morph_" + i + "_weight","number");
		}
		graphnode.setDirtyCanvas(true);
	}});
}

LS.registerComponent( MorphDeformer );
LS.MorphDeformer = MorphDeformer;

//SHADER BLOCKS ******************************************

MorphDeformer.morph_streams_enabled_shader_code = "\n\
	\n\
	//max vertex attribs are 16 usually, so 10 are available after using 6 for V,N,UV,UV2,BW,BI\n\
	attribute vec3 a_vertex_morph0;\n\
	attribute vec3 a_normal_morph0;\n\
	attribute vec3 a_vertex_morph1;\n\
	attribute vec3 a_normal_morph1;\n\
	attribute vec3 a_vertex_morph2;\n\
	attribute vec3 a_normal_morph2;\n\
	attribute vec3 a_vertex_morph3;\n\
	attribute vec3 a_normal_morph3;\n\
	\n\
	uniform vec4 u_morph_weights;\n\
	uniform float u_morph_info;\n\
	\n\
	void applyMorphing( inout vec4 position, inout vec3 normal )\n\
	{\n\
		vec3 original_vertex = vec3(0.0);\n\
		vec3 original_normal = vec3(0.0);\n\
		if( u_morph_info == 0.0 )\n\
		{\n\
			original_vertex = position.xyz;\n\
			original_normal = normal.xyz;\n\
		}\n\
		\n\
		if(u_morph_weights[0] != 0.0)\n\
		{\n\
			position.xyz += (a_vertex_morph0 - original_vertex) * u_morph_weights[0]; normal.xyz += (a_normal_morph0 - original_normal) * u_morph_weights[0];\n\
		}\n\
		if(u_morph_weights[1] != 0.0)\n\
		{\n\
			position.xyz += (a_vertex_morph1 - original_vertex) * u_morph_weights[1]; normal.xyz += (a_normal_morph1 - original_normal) * u_morph_weights[1];\n\
		}\n\
		if(u_morph_weights[2] != 0.0)\n\
		{\n\
			position.xyz += (a_vertex_morph2 - original_vertex) * u_morph_weights[2]; normal.xyz += (a_normal_morph2 - original_normal) * u_morph_weights[2];\n\
		}\n\
		if(u_morph_weights[3] != 0.0)\n\
		{\n\
			position.xyz += (a_vertex_morph3 - original_vertex) * u_morph_weights[3]; normal.xyz += (a_normal_morph3 - original_normal) * u_morph_weights[3];\n\
		}\n\
	}\n\
";

MorphDeformer.morph_texture_enabled_shader_code = "\n\
	\n\
	attribute float a_morphing_ids;\n\
	\n\
	uniform sampler2D u_morph_vertices_texture;\n\
	uniform sampler2D u_morph_normals_texture;\n\
	uniform vec4 u_morph_texture_size;\n\
	\n\
	uniform vec4 u_morph_weights;\n\
	\n\
	void applyMorphing( inout vec4 position, inout vec3 normal )\n\
	{\n\
		vec2 coord;\n\
		coord.x = ( mod( a_morphing_ids, u_morph_texture_size.x ) + 0.5 ) / u_morph_texture_size.x;\n\
		coord.y = 1.0 - ( floor( a_morphing_ids / u_morph_texture_size.x ) + 0.5 ) / u_morph_texture_size.y;\n\
		position.xyz += texture2D( u_morph_vertices_texture, coord ).xyz;\n\
		normal.xyz += texture2D( u_morph_normals_texture, coord ).xyz;\n\
	}\n\
";

MorphDeformer.morph_enabled_shader_code = "\n\
	\n\
	#pragma shaderblock morphing_mode\n\
";


MorphDeformer.morph_disabled_shader_code = "\nvoid applyMorphing( inout vec4 position, inout vec3 normal ) {}\n";

// ShaderBlocks used to inject to shader in runtime
var morphing_block = new LS.ShaderBlock("morphing");
morphing_block.addCode( GL.VERTEX_SHADER, MorphDeformer.morph_enabled_shader_code, MorphDeformer.morph_disabled_shader_code );
morphing_block.register();
MorphDeformer.shader_block = morphing_block;

var morphing_streams_block = new LS.ShaderBlock("morphing_streams");
morphing_streams_block.defineContextMacros( { "morphing_mode": "morphing_streams"} );
morphing_streams_block.addCode( GL.VERTEX_SHADER, MorphDeformer.morph_streams_enabled_shader_code, MorphDeformer.morph_disabled_shader_code );
morphing_streams_block.register();
MorphDeformer.morphing_streams_block = morphing_streams_block;

var morphing_texture_block = new LS.ShaderBlock("morphing_texture");
morphing_texture_block.defineContextMacros( { "morphing_mode": "morphing_texture"} );
morphing_texture_block.addCode( GL.VERTEX_SHADER, MorphDeformer.morph_texture_enabled_shader_code, MorphDeformer.morph_disabled_shader_code );
morphing_texture_block.register();
MorphDeformer.morphing_texture_block = morphing_texture_block;