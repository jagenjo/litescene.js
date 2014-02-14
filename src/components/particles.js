function ParticleEmissor(o)
{
	this.max_particles = 1024;
	this.warm_up_time = 0;

	this.emissor_type = ParticleEmissor.BOX_EMISSOR;
	this.emissor_rate = 5; //particles per second
	this.emissor_size = [10,10,10];
	this.emissor_mesh = null;

	this.particle_life = 5;
	this.particle_speed = 10;
	this.particle_size = 5;
	this.particle_rotation = 0;
	this.particle_size_curve = [[1,1]];
	this.particle_start_color = [1,1,1];
	this.particle_end_color = [1,1,1];

	this.particle_opacity_curve = [[0.5,1]];

	this.texture_grid_size = 1;

	//physics
	this.physics_gravity = [0,0,0];
	this.physics_friction = 0;

	//material
	this.opacity = 1;
	this.additive_blending = false;
	this.texture = null;
	this.animation_fps = 1;
	this.soft_particles = false;

	this.use_node_material = false; 
	this.animated_texture = false; //change frames
	this.loop_animation = false;
	this.independent_color = false;
	this.premultiplied_alpha = false;
	this.align_with_camera = true;
	this.align_always = false; //align with all cameras
	this.follow_emitter = false;
	this.sort_in_z = true; //slower
	this.stop_update = false; //do not move particles

	if(o)
		this.configure(o);

	//LEGACY!!! sizes where just a number before
	if(typeof(this.emissor_size) == "number")
		this.emissor_size = [this.emissor_size,this.emissor_size,this.emissor_size];

	this._emissor_pos = vec3.create();
	this._particles = [];
	this._remining_dt = 0;
	this._visible_particles = 0;
	this._min_particle_size = 0.001;
	this._last_id = 0;

	this.createMesh();

	
	/* demo particles
	for(var i = 0; i < this.max_particles; i++)
	{
		var p = this.createParticle();
		this._particles.push(p);
	}
	*/
}

ParticleEmissor.icon = "mini-icon-particles.png";

ParticleEmissor.BOX_EMISSOR = 1;
ParticleEmissor.SPHERE_EMISSOR = 2;
ParticleEmissor.MESH_EMISSOR = 3;

ParticleEmissor.prototype.onAddedToNode = function(node)
{
	LEvent.bind(node,"update",this.onUpdate,this);
	LEvent.bind(node,"start",this.onStart,this);
	LEvent.bind(node, "collectRenderInstances", this.onCollectInstances, this);
}

ParticleEmissor.prototype.onRemovedFromNode = function(node)
{
	LEvent.unbind(node,"update",this.onUpdate,this);
	LEvent.unbind(node,"start",this.onStart,this);
	LEvent.unbind(node, "collectRenderInstances", this.onCollectInstances, this);
}

ParticleEmissor.prototype.getResources = function(res)
{
	if(this.emissor_mesh) res[ this.emissor_mesh ] = Mesh;
	if(this.texture) res[ this.texture ] = Texture;
}

ParticleEmissor.prototype.createParticle = function(p)
{
	p = p || {};
	
	switch(this.emissor_type)
	{
		case ParticleEmissor.BOX_EMISSOR: p.pos = vec3.fromValues( this.emissor_size[0] * ( Math.random() - 0.5), this.emissor_size[1] * ( Math.random() - 0.5 ), this.emissor_size[2] * (Math.random() - 0.5) ); break;
		case ParticleEmissor.SPHERE_EMISSOR: 
			var gamma = 2 * Math.PI * Math.random();
			var theta = Math.acos(2 * Math.random() - 1);
			p.pos = vec3.fromValues(Math.sin(theta) * Math.cos(gamma), Math.sin(theta) * Math.sin(gamma), Math.cos(theta));
			vec3.multiply( p.pos, p.pos, this.emissor_size); 
			break;
			//p.pos = vec3.multiply( vec3.normalize( vec3.create( [(Math.random() - 0.5), ( Math.random() - 0.5 ), (Math.random() - 0.5)])), this.emissor_size); break;
		case ParticleEmissor.MESH_EMISSOR: 
			var mesh = this.emissor_mesh;
			if(mesh && mesh.constructor == String)
				mesh = ResourcesManager.getMesh(this.emissor_mesh);
			if(mesh && mesh.vertices)
			{
				var v = Math.floor(Math.random() * mesh.vertices.length / 3)*3;
				p.pos = vec3.fromValues(mesh.vertices[v], mesh.vertices[v+1], mesh.vertices[v+2]);
			}
			else
				p.pos = vec3.create();		
			break;
		default: p.pos = vec3.create();
	}

	//this._root.transform.transformPoint(p.pos, p.pos);
	var pos = this.follow_emitter ? [0,0,0] : this._emissor_pos;
	vec3.add(p.pos,p.pos,pos);

	p.vel = vec3.fromValues( Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5 );
	p.life = this.particle_life;
	p.id = this._last_id;
	p.angle = 0;
	p.rot = this.particle_rotation + 0.25 * this.particle_rotation * Math.random();

	this._last_id += 1;
	if(this.independent_color)
		p.c = vec3.clone( this.particle_start_color );

	vec3.scale(p.vel, p.vel, this.particle_speed);
	return p;
}

ParticleEmissor.prototype.onStart = function(e)
{
	if(this.warm_up_time <= 0) return;

	var delta = 1/30;
	for(var i = 0; i < this.warm_up_time; i+= delta)
		this.onUpdate(null,delta,true);
}

ParticleEmissor.prototype.onUpdate = function(e,dt, do_not_updatemesh )
{
	if(this._root.transform)
		this._root.transform.getGlobalPosition(this._emissor_pos);

	if(this.emissor_rate < 0) this.emissor_rate = 0;

	if(!this.stop_update)
	{
		//update particles
		var gravity = vec3.clone(this.physics_gravity);
		var friction = this.physics_friction;
		var particles = [];
		var vel = vec3.create();
		var rot = this.particle_rotation * dt;

		for(var i = 0; i < this._particles.length; ++i)
		{
			var p = this._particles[i];

			vec3.copy(vel, p.vel);
			vec3.add(vel, gravity, vel);
			vec3.scale(vel, vel, dt);

			if(friction)
			{
				vel[0] -= vel[0] * friction;
				vel[1] -= vel[1] * friction;
				vel[2] -= vel[2] * friction;
			}

			vec3.add( p.pos, vel, p.pos);

			p.angle += p.rot * dt;
			p.life -= dt;

			if(p.life > 0) //keep alive
				particles.push(p);
		}

		//emit new
		if(this.emissor_rate != 0)
		{
			var new_particles = (dt + this._remining_dt) * this.emissor_rate;
			this._remining_dt = (new_particles % 1) / this.emissor_rate;
			new_particles = new_particles<<0;

			if(new_particles > this.max_particles)
				new_particles = this.max_particles;

			for(var i = 0; i < new_particles; i++)
			{
				var p = this.createParticle();
				if(particles.length < this.max_particles)
					particles.push(p);
			}
		}

		//replace old container with new one
		this._particles = particles;
	}

	//compute mesh
	if(!this.align_always && !do_not_updatemesh)
		this.updateMesh(Renderer.main_camera);

	LEvent.trigger(Scene,"change");
}

ParticleEmissor.prototype.createMesh = function ()
{
	if( this._mesh_maxparticles == this.max_particles) return;

	this._vertices = new Float32Array(this.max_particles * 6 * 3); //6 vertex per particle x 3 floats per vertex
	this._coords = new Float32Array(this.max_particles * 6 * 2);
	this._colors = new Float32Array(this.max_particles * 6 * 4);

	for(var i = 0; i < this.max_particles; i++)
	{
		this._coords.set([1,1, 0,1, 1,0,  0,1, 0,0, 1,0] , i*6*2);
		this._colors.set([1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1, 1,1,1,1] , i*6*4);
	}

	this._computed_grid_size = 1;
	//this._mesh = Mesh.load({ vertices:this._vertices, coords: this._coords, colors: this._colors, stream_type: gl.STREAM_DRAW });
	this._mesh = new GL.Mesh();
	this._mesh.addBuffers({ vertices:this._vertices, coords: this._coords, colors: this._colors}, null, gl.STREAM_DRAW);
	this._mesh_maxparticles = this.max_particles;
}

ParticleEmissor.prototype.updateMesh = function (camera)
{
	if( this._mesh_maxparticles != this.max_particles) 
		this.createMesh();

	var center = camera.getEye(); 

	var MIN_SIZE = this._min_particle_size;

	/*
	if(this.follow_emitter)
	{
		var iM = this._root.transform.getMatrix();
		mat4.multiplyVec3(iM, center);
	}
	*/

	var front = camera.getLocalVector([0,0,1]);
	var right = camera.getLocalVector([1,0,0]);
	var top = camera.getLocalVector([0,1,0]);
	var temp = vec3.create();
	var size = this.particle_size;

	var topleft = vec3.fromValues(-1,0,-1);
	var topright = vec3.fromValues(1,0,-1);
	var bottomleft = vec3.fromValues(-1,0,1);
	var bottomright = vec3.fromValues(1,0,1);

	if(this.align_with_camera)
	{
		vec3.subtract(topleft, top,right);
		vec3.add(topright, top,right);
		vec3.scale(bottomleft,topright,-1);
		vec3.scale(bottomright,topleft,-1);
	}

	//scaled versions
	var s_topleft = vec3.create()
	var s_topright = vec3.create()
	var s_bottomleft = vec3.create()
	var s_bottomright = vec3.create()

	var particles = this._particles;
	if(this.sort_in_z)
	{
		particles = this._particles.concat(); //copy
		var plane = geo.createPlane(center, front); //compute camera plane
		var den = Math.sqrt(plane[0]*plane[0] + plane[1]*plane[1] + plane[2]*plane[2]); //delta
		for(var i = 0; i < particles.length; ++i)
			particles[i]._dist = Math.abs(vec3.dot(particles[i].pos,plane) + plane[3])/den;
			//particles[i]._dist = vec3.dist( center, particles[i].pos );
		particles.sort(function(a,b) { return a._dist < b._dist ? 1 : (a._dist > b._dist ? -1 : 0); });
		this._particles = particles;
	}

	//avoid errors
	if(this.particle_life == 0) this.particle_life = 0.0001;

	var color = new Float32Array([1,1,1,1]);
	var particle_start_color = new Float32Array(this.particle_start_color);
	var particle_end_color = new Float32Array(this.particle_end_color);

	//used for grid based textures
	var recompute_coords = false;
	if((this._computed_grid_size != this.texture_grid_size || this.texture_grid_size > 1) && !this.stop_update)
	{
		recompute_coords = true;
		this._computed_grid_size = this.texture_grid_size;
	}
	var texture_grid_size = this.texture_grid_size;
	var d_uvs = 1 / this.texture_grid_size;
	//var base_uvs = new Float32Array([d_uvs,d_uvs, 0,d_uvs, d_uvs,0,  0,d_uvs, 0,0, d_uvs,0]);
	//var temp_uvs = new Float32Array([d_uvs,d_uvs, 0,d_uvs, d_uvs,0,  0,d_uvs, 0,0, d_uvs,0]);
	var offset_u = 0, offset_v = 0;
	var grid_frames = this.texture_grid_size<<2;
	var animated_texture = this.animated_texture;
	var loop_animation = this.loop_animation;
	var time = Scene._global_time * this.animation_fps;

	//used for precompute curves to speed up (sampled at 60 frames per second)
	var recompute_colors = true;
	var opacity_curve = new Float32Array((this.particle_life * 60)<<0);
	var size_curve = new Float32Array((this.particle_life * 60)<<0);

	var dI = 1 / (this.particle_life * 60);
	for(var i = 0; i < opacity_curve.length; i += 1)
	{
		opacity_curve[i] = LS.getCurveValueAt(this.particle_opacity_curve,0,1,0, i * dI );
		size_curve[i] = LS.getCurveValueAt(this.particle_size_curve,0,1,0, i * dI );
	}

	//used for rotations
	var rot = quat.create();

	//generate quads
	var i = 0, f = 0;
	for(var iParticle = 0; iParticle < particles.length; ++iParticle)
	{
		var p = particles[iParticle];
		if(p.life <= 0)
			continue;

		f = 1.0 - p.life / this.particle_life;

		if(recompute_colors) //compute color and opacity
		{
			var a = opacity_curve[(f*opacity_curve.length)<<0]; //getCurveValueAt(this.particle_opacity_curve,0,1,0,f);

			if(this.independent_color && p.c)
				vec3.clone(color,p.c);
			else
				vec3.lerp(color, particle_start_color, particle_end_color, f);

			if(this.premultiplied_alpha)
			{
				vec3.scale(color,color,a);
				color[3] = 1.0;
			}
			else
				color[3] = a;

			if(a < 0.001) continue;
		}

		var s = this.particle_size * size_curve[(f*size_curve.length)<<0]; //getCurveValueAt(this.particle_size_curve,0,1,0,f);

		if(Math.abs(s) < MIN_SIZE) continue; //ignore almost transparent particles

		vec3.scale(s_bottomleft, bottomleft, s)
		vec3.scale(s_topright, topright, s);
		vec3.scale(s_topleft, topleft, s);
		vec3.scale(s_bottomright, bottomright, s);

		if(p.angle != 0)
		{
			quat.setAxisAngle( rot , front, p.angle * DEG2RAD);
			vec3.transformQuat(s_bottomleft, s_bottomleft, rot);
			vec3.transformQuat(s_topright, s_topright, rot);
			vec3.transformQuat(s_topleft, s_topleft, rot);
			vec3.transformQuat(s_bottomright, s_bottomright, rot);
		}

		vec3.add(temp, p.pos, s_topright);
		this._vertices.set(temp, i*6*3);

		vec3.add(temp, p.pos, s_topleft);
		this._vertices.set(temp, i*6*3 + 3);

		vec3.add(temp, p.pos, s_bottomright);
		this._vertices.set(temp, i*6*3 + 3*2);

		vec3.add(temp, p.pos, s_topleft);
		this._vertices.set(temp, i*6*3 + 3*3);

		vec3.add(temp, p.pos, s_bottomleft);
		this._vertices.set(temp, i*6*3 + 3*4);

		vec3.add(temp, p.pos, s_bottomright);
		this._vertices.set(temp, i*6*3 + 3*5);

		if(recompute_colors)
		{
			this._colors.set(color, i*6*4);
			this._colors.set(color, i*6*4 + 4);
			this._colors.set(color, i*6*4 + 4*2);
			this._colors.set(color, i*6*4 + 4*3);
			this._colors.set(color, i*6*4 + 4*4);
			this._colors.set(color, i*6*4 + 4*5);
		}

		if(recompute_coords)
		{
			var iG = (animated_texture ? ((loop_animation?time:f)*grid_frames)<<0 : p.id) % grid_frames;
			offset_u = iG * d_uvs;
			offset_v = 1 - (offset_u<<0) * d_uvs - d_uvs;
			offset_u = offset_u%1;
			this._coords.set([offset_u+d_uvs,offset_v+d_uvs, offset_u,offset_v+d_uvs, offset_u+d_uvs,offset_v,  offset_u,offset_v+d_uvs, offset_u,offset_v, offset_u+d_uvs,offset_v], i*6*2);
		}

		++i;
		if(i*6*3 >= this._vertices.length) break; //too many particles
	}
	this._visible_particles = i;

	//upload geometry
	this._mesh.vertexBuffers["vertices"].data = this._vertices;
	this._mesh.vertexBuffers["vertices"].compile();

	this._mesh.vertexBuffers["colors"].data = this._colors;
	this._mesh.vertexBuffers["colors"].compile();

	if(recompute_coords)
	{
		this._mesh.vertexBuffers["coords"].data = this._coords;
		this._mesh.vertexBuffers["coords"].compile();
	}

	//this._mesh.vertices = this._vertices;
	//this._mesh.compile();
}

ParticleEmissor._identity = mat4.create();

//ParticleEmissor.prototype.getRenderInstance = function(options,camera)
ParticleEmissor.prototype.onCollectInstances = function(e, instances, options)
{
	if(!this._root) return;

	var camera = Renderer.main_camera;

	if(this.align_always)
		this.updateMesh(camera);

	if(!this._material)
		this._material = new Material({ opacity: this.opacity - 0.01, shader:"lowglobalshader" });

	this._material.opacity = this.opacity - 0.01; //try to keep it under 1
	this._material.setTexture(this.texture);
	this._material.blending = this.additive_blending ? Material.ADDITIVE_BLENDING : Material.NORMAL;
	this._material.soft_particles = this.soft_particles;
	this._material.constant_diffuse = true;

	if(!this._mesh)
		return null;

	var RI = this._render_instance;
	if(!RI)
		this._render_instance = RI = new RenderInstance(this._root, this);

	if(this.follow_emitter)
		mat4.translate( RI.matrix, ParticleEmissor._identity, this._root.transform._position );
	else
		mat4.copy( RI.matrix, ParticleEmissor._identity );

	RI.material = (this._root.material && this.use_node_material) ? this._root.getMaterial() : this._material;
	mat4.multiplyVec3(RI.center, RI.matrix, vec3.create());

	RI.flags = RI_DEFAULT_FLAGS;
	RI.applyNodeFlags();

	RI.setMesh( this._mesh, gl.TRIANGLES );
	RI.setRange(0, this._visible_particles * 6); //6 vertex per particle

	instances.push(RI);
	//return RI;
}


LS.registerComponent(ParticleEmissor);