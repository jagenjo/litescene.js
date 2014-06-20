/* pointCloud.js */

function PointCloud(o)
{
	this.enabled = true;
	this.max_points = 1024;
	this.mesh = null; //use a mesh
	this._points = [];

	this.size = 1;
	this.texture_grid_size = 1;

	//material
	this.texture = null;
	this.global_opacity = 1;
	this.color = vec3.fromValues(1,1,1);
	this.additive_blending = false;

	this.use_node_material = false; 
	this.premultiplied_alpha = false;
	this.in_world_coordinates = false;
	this.sort_in_z = false; //slower

	if(o)
		this.configure(o);

	this._last_id = 0;

	//debug
	/*
	for(var i = 0; i < 100; i++)
	{
		var pos = vec3.create();
		vec3.random( pos );
		vec3.scale( pos, pos, 50 * Math.random() );
		this.addPoint( pos, [Math.random(),1,1,1], 1 + Math.random() * 2);
	}
	*/

	this.createMesh();
}
PointCloud.icon = "mini-icon-particles.png";
PointCloud["@texture"] = { widget: "texture" };
PointCloud["@color"] = { widget: "color" };

PointCloud.prototype.addPoint = function( position, color, size, frame_id )
{
	var data = new Float32Array(3+4+2+1); //+1 extra por distance
	data.set(position,0);
	if(color)
		data.set(color,3);
	else
		data.set([1,1,1,1],3);
	if(size !== undefined)
		data[7] = size;
	else
		data[7] = 1;
	if(frame_id != undefined )
		data[8] = frame_id;
	else
		data[8] = 0;

	this._points.push( data );
	this._dirty = true;

	return this._points.length - 1;
}

PointCloud.prototype.clear = function()
{
	this._points.length = 0;
}

PointCloud.prototype.setPoint = function(id, position, color, size, frame_id )
{
	var data = this._points[id];
	if(!data) return;

	if(position)
		data.set(position,0);
	if(color)
		data.set(color,3);
	if(size !== undefined )
		data[7] = size;
	if(frame_id !== undefined )
		data[8] = frame_id;

	this._dirty = true;
}

PointCloud.prototype.setPointsFromMesh = function( mesh, color, size )
{
	//TODO
}


PointCloud.prototype.removePoint = function(id)
{
	this._points.splice(id,1);
	this._dirty = true;
}


PointCloud.prototype.onAddedToNode = function(node)
{
	LEvent.bind(node, "collectRenderInstances", this.onCollectInstances, this);
}

PointCloud.prototype.onRemovedFromNode = function(node)
{
	LEvent.unbind(node, "collectRenderInstances", this.onCollectInstances, this);
}

PointCloud.prototype.getResources = function(res)
{
	if(this.mesh) res[ this.emissor_mesh ] = Mesh;
	if(this.texture) res[ this.texture ] = Texture;
}

PointCloud.prototype.onResourceRenamed = function (old_name, new_name, resource)
{
	if(this.mesh == old_name)
		this.mesh = new_name;
	if(this.texture == old_name)
		this.texture = new_name;
}

PointCloud.prototype.createMesh = function ()
{
	if( this._mesh_max_points == this.max_points) return;

	this._vertices = new Float32Array(this.max_points * 3); 
	this._colors = new Float32Array(this.max_points * 4);
	this._extra2 = new Float32Array(this.max_points * 2); //size and texture frame

	var white = [1,1,1,1];
	var default_size = 1;
	for(var i = 0; i < this.max_points; i++)
	{
		this._colors.set(white , i*4);
		this._extra2[i*2] = default_size;
		//this._extra2[i*2+1] = 0;
	}

	this._mesh = new GL.Mesh();
	this._mesh.addBuffers({ vertices:this._vertices, colors: this._colors, extra2: this._extra2 }, null, gl.STREAM_DRAW);
	this._mesh_max_points = this.max_points;
}

PointCloud.prototype.updateMesh = function (camera)
{
	if( this._mesh_max_points != this.max_points) 
		this.createMesh();

	var center = camera.getEye(); 
	var front = camera.getFront();

	var points = this._points;
	if(this.sort_in_z)
	{
		points = this._points.concat(); //copy array
		var plane = geo.createPlane(center, front); //compute camera plane
		var den = Math.sqrt(plane[0]*plane[0] + plane[1]*plane[1] + plane[2]*plane[2]); //delta
		for(var i = 0; i < points.length; ++i)
			points[i][9] = Math.abs(vec3.dot(points[i].subarray(0,3),plane) + plane[3])/den;

		points.sort(function(a,b) { return a[9] < b[9] ? 1 : (a[9] > b[9] ? -1 : 0); });
	}

	//update mesh
	var i = 0, f = 0;
	var vertices = this._vertices;
	var colors = this._colors;
	var extra2 = this._extra2;
	var premultiply = this.premultiplied_alpha;

	for(var iPoint = 0; iPoint < points.length; ++iPoint)
	{
		if( iPoint*3 >= vertices.length) break; //too many points
		var p = points[iPoint];

		vertices.set(p.subarray(0,3), iPoint * 3);
		var c = p.subarray(3,7);
		if(premultiply)
			vec3.scale(c,c,c[3]);
		colors.set(c, iPoint * 4);
		extra2.set(p.subarray(7,9), iPoint * 2);
	}

	//upload geometry
	this._mesh.vertexBuffers["vertices"].data = vertices;
	this._mesh.vertexBuffers["vertices"].compile();

	this._mesh.vertexBuffers["colors"].data = colors;
	this._mesh.vertexBuffers["colors"].compile();

	this._mesh.vertexBuffers["extra2"].data = extra2;
	this._mesh.vertexBuffers["extra2"].compile();
}

PointCloud._identity = mat4.create();

PointCloud.prototype.onCollectInstances = function(e, instances, options)
{
	if(!this._root) return;

	if(this._points.length == 0 || !this.enabled)
		return;

	var camera = Renderer._current_camera;

	if(this._last_premultiply !== this.premultiplied_alpha )
		this._dirty = true;

	if(this._dirty)
		this.updateMesh(camera);

	if(!this._material)
	{
		this._material = new Material({ shader_name:"lowglobal" });
		this._material.extra_macros = { USE_POINT_CLOUD: "" };
	}

	var material = this._material;

	material.color.set(this.color);

	if(this.premultiplied_alpha)
		material.opacity = 1.0 - 0.01;
	else
		material.opacity = this.global_opacity - 0.01;
	this._last_premultiply = this.premultiplied_alpha;

	material.setTexture( this.texture );
	material.blend_mode = this.additive_blending ? Blend.ADD : Blend.ALPHA;
	material.constant_diffuse = true;
	material.extra_uniforms = { u_pointSize: this.size };

	if(!this._mesh)
		return null;

	var RI = this._render_instance;
	if(!RI)
		this._render_instance = RI = new RenderInstance(this._root, this);

	if(this.in_world_coordinates)
		RI.matrix.set( this._root.transform._global_matrix );
	else
		mat4.copy( RI.matrix, PointCloud._identity );

	/*
	if(this.follow_emitter)
		mat4.translate( RI.matrix, PointCloud._identity, this._root.transform._position );
	else
		mat4.copy( RI.matrix, PointCloud._identity );
	*/

	var material = (this._root.material && this.use_node_material) ? this._root.getMaterial() : this._material;
	mat4.multiplyVec3(RI.center, RI.matrix, vec3.create());

	RI.flags = RI_DEFAULT_FLAGS | RI_IGNORE_FRUSTUM;
	RI.applyNodeFlags();

	RI.setMaterial( material );
	RI.setMesh( this._mesh, gl.POINTS );
	var primitives = this._points.length;
	if(primitives > this._vertices.length / 3)
		primitives = this._vertices.length / 3;

	RI.setRange(0, primitives );
	instances.push(RI);
}


LS.registerComponent(PointCloud);