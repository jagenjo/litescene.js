function MorphDeformer(o)
{
	this.enabled = true;
	this.morph_targets = [];

	if(MorphDeformer.max_supported_vertex_attribs === undefined)
		MorphDeformer.max_supported_vertex_attribs = gl.getParameter( gl.MAX_VERTEX_ATTRIBS );
	if(MorphDeformer.max_supported_morph_targets === undefined)
		MorphDeformer.max_supported_morph_targets = (gl.getParameter( gl.MAX_VERTEX_ATTRIBS ) - 6) / 2;

	if(o)
		this.configure(o);
}

MorphDeformer.icon = "mini-icon-teapot.png";

MorphDeformer.prototype.onAddedToNode = function(node)
{
	LEvent.bind(node, "collectRenderInstances", this.onCollectInstances, this);
}

MorphDeformer.prototype.onRemovedFromNode = function(node)
{
	LEvent.unbind(node, "collectRenderInstances", this.onCollectInstances, this);
}

MorphDeformer.prototype.getResources = function(res)
{
	if(this.morph_targets.length)
		for(var i = 0; i < this.morph_targets.length; ++i)
			if( this.morph_targets[i].mesh )
				res[ this.morph_targets[i].mesh ] = GL.Mesh;
}

MorphDeformer.prototype.onResourceRenamed = function (old_name, new_name, resource)
{
	if(this.morph_targets.length)
		for(var i = 0; i < this.morph_targets.length; ++i)
			if( this.morph_targets[i].mesh == old_name )
				this.morph_targets[i].mesh = new_name;
}

MorphDeformer.prototype.onCollectInstances = function( e, render_instances )
{
	if(!render_instances.length || MorphDeformer.max_supported_vertex_attribs < 16)
		return;

	var last_RI = render_instances[ render_instances.length - 1];
	
	if(!this.enabled)
	{
		//disable
		this.disableMorphing( last_RI );
		return;
	}

	//grab the RI created previously and modified
	this.applyMorphTargets( last_RI );
}


MorphDeformer.prototype.applyMorphTargets = function( RI )
{
	var base_mesh = RI.mesh;

	if( this.morph_targets.length && RI.mesh )
	{
		var base_vertices_buffer = base_mesh.vertexBuffers["vertices"];
		var streams_code = "";
		var morphs_buffers = {};
		var morphs_weights = [];

		var num_morphs = 0;
		var max_morphs = 4;

		//sort by weight
		var morph_targets = this.morph_targets.concat();
		morph_targets.sort( function(a,b) { return Math.abs(b.weight) - Math.abs(a.weight);  } );

		//collect
		for(var i = 0; i < morph_targets.length; ++i)
		{
			var morph = morph_targets[i];
			if(!morph.mesh || morph.weight == 0.0)
				continue;
			var morph_mesh = LS.ResourcesManager.resources[ morph.mesh ];
			if(!morph_mesh || morph_mesh.constructor !== GL.Mesh)
				continue;

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

			morphs_buffers["a_vertex_morph" + num_morphs ] = vertices_cloned;
			morphs_buffers["a_normal_morph" + num_morphs ] = normals_cloned;

			morphs_weights.push( morph.weight );
			num_morphs += 1;

			if(num_morphs >= max_morphs)
				break;
		}

		if(num_morphs)
		{
			RI.vertex_buffers = {};
			for(var i in base_mesh.vertexBuffers)
				RI.vertex_buffers[i] = base_mesh.vertexBuffers[i];
			for(var i in morphs_buffers)
				RI.vertex_buffers[i] = morphs_buffers[i];

			RI.query.macros["USE_MORPHING"] = "";
			var weights = new Float32Array( 4 );
			weights.set( morphs_weights );
			RI.uniforms["u_morph_weights"] = weights;
		}
		else
			this.disableMorphing( RI );
	}
	else
	{
		this.disableMorphing(RI);
	}
}

MorphDeformer.prototype.disableMorphing = function( RI )
{
	if( RI.query && RI.query.macros["USE_MORPHING"] !== undefined )
	{
		delete RI.query.macros["USE_MORPHING"];
		delete RI.uniforms["u_morph_weights"];
	}
}

MorphDeformer.prototype.setMorphMesh = function(index, value)
{
	if(index >= this.morph_targets.length)
		return;
	this.morph_targets[index].mesh = value;
}

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
		target: this.morph_targets,
		name: varname,
		value: this.morph_targets[num][ varname ] !== undefined ? this.morph_targets[num][ varname ] : null,
		type: varname == "mesh" ? "mesh" : "number"
	};
}

MorphDeformer.prototype.setPropertyValueFromPath = function( path, value )
{
	if( path.length < 1 )
		return;

	if( path[0] != "morphs" )
		return;

	var num = parseInt( path[1] );
	if(num >= this.morph_targets.length)
		return;

	var varname = path[2];
	this.morph_targets[num][ varname ] = value;
}

LS.registerComponent( MorphDeformer );
LS.MorphDeformer = MorphDeformer;