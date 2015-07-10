//this module is in charge of rendering basic objects like lines, points, and primitives
//it works over litegl (no need of scene)
//carefull, it is very slow

var Draw = {
	ready: false,
	images: {},

	onRequestFrame: null,

	init: function()
	{
		if(this.ready) return;
		if(!gl) return;

		this.color = new Float32Array(4);
		this.color[3] = 1;
		this.mvp_matrix = mat4.create();
		this.temp_matrix = mat4.create();
		this.point_size = 2;

		this.stack = new Float32Array(16 * 32); //stack max size
		this.model_matrix = new Float32Array(this.stack.buffer,0,16);
		mat4.identity( this.model_matrix );

		//matrices
		this.camera = null;
		this.camera_position = vec3.create();
		this.view_matrix = mat4.create();
		this.projection_matrix = mat4.create();
		this.viewprojection_matrix = mat4.create();

		this.camera_stack = []; //not used yet

		//Meshes
		var vertices = [[-1,1,0],[1,1,0],[1,-1,0],[-1,-1,0]];
		var coords = [[0,1],[1,1],[1,0],[0,0]];
		this.quad_mesh = GL.Mesh.load({vertices:vertices, coords: coords});

		var vertex_shader = '\
			precision mediump float;\n\
			attribute vec3 a_vertex;\n\
			#ifdef USE_COLOR\n\
				attribute vec4 a_color;\n\
				varying vec4 v_color;\n\
			#endif\n\
			#ifdef USE_TEXTURE\n\
				attribute vec2 a_coord;\n\
				varying vec2 v_coord;\n\
			#endif\n\
			#ifdef USE_SIZE\n\
				attribute float a_extra;\n\
			#endif\n\
			uniform mat4 u_mvp;\n\
			uniform float u_point_size;\n\
			void main() {\n\
				gl_PointSize = u_point_size;\n\
				#ifdef USE_SIZE\n\
					gl_PointSize = a_extra;\n\
				#endif\n\
				#ifdef USE_TEXTURE\n\
					v_coord = a_coord;\n\
				#endif\n\
				#ifdef USE_COLOR\n\
					v_color = a_color;\n\
				#endif\n\
				gl_Position = u_mvp * vec4(a_vertex,1.0);\n\
			}\
			';

		var pixel_shader = '\
			precision mediump float;\n\
			uniform vec4 u_color;\n\
			#ifdef USE_COLOR\n\
				varying vec4 v_color;\n\
			#endif\n\
			#ifdef USE_TEXTURE\n\
				varying vec2 v_coord;\n\
				uniform sampler2D u_texture;\n\
			#endif\n\
			void main() {\n\
				vec4 color = u_color;\n\
				#ifdef USE_TEXTURE\n\
				  color *= texture2D(u_texture, v_coord);\n\
				  if(color.a < 0.1)\n\
					discard;\n\
			    #endif\n\
				#ifdef USE_POINTS\n\
				    float dist = length( gl_PointCoord.xy - vec2(0.5) );\n\
					if( dist > 0.45 )\n\
						discard;\n\
			    #endif\n\
				#ifdef USE_COLOR\n\
					color *= v_color;\n\
				#endif\n\
				gl_FragColor = color;\n\
			}\
		';

		//create shaders
		this.shader = new Shader(vertex_shader,pixel_shader);

		this.shader_color = new Shader(vertex_shader,pixel_shader,{"USE_COLOR":""});
		this.shader_texture = new Shader(vertex_shader,pixel_shader,{"USE_TEXTURE":""});
		this.shader_points = new Shader(vertex_shader,pixel_shader,{"USE_POINTS":""});
		this.shader_points_color = new Shader(vertex_shader,pixel_shader,{"USE_COLOR":"","USE_POINTS":""});
		this.shader_points_color_size = new Shader(vertex_shader,pixel_shader,{"USE_COLOR":"","USE_SIZE":"","USE_POINTS":""});


		this.shader_image = new Shader('\
			precision mediump float;\n\
			attribute vec3 a_vertex;\n\
			uniform mat4 u_mvp;\n\
			uniform float u_point_size;\n\
			void main() {\n\
				gl_PointSize = u_point_size;\n\
				gl_Position = u_mvp * vec4(a_vertex,1.0);\n\
			}\
			','\
			precision mediump float;\n\
			uniform vec4 u_color;\n\
			uniform sampler2D u_texture;\n\
			void main() {\n\
			  vec4 tex = texture2D(u_texture, vec2(gl_PointCoord.x,1.0 - gl_PointCoord.y) );\n\
			  if(tex.a < 0.1)\n\
				discard;\n\
			  gl_FragColor = u_color * tex;\n\
			}\
		');



		this.shader_points_color_texture_size = new Shader('\
			precision mediump float;\n\
			attribute vec3 a_vertex;\n\
			attribute vec4 a_color;\n\
			attribute float a_extra;\n\
			uniform mat4 u_mvp;\n\
			uniform float u_point_size;\n\
			varying vec4 v_color;\n\
			void main() {\n\
				v_color = a_color;\n\
				gl_PointSize = u_point_size * a_extra;\n\
				gl_Position = u_mvp * vec4(a_vertex,1.0);\n\
			}\
			','\
			precision mediump float;\n\
			uniform vec4 u_color;\n\
			varying vec4 v_color;\n\
			uniform sampler2D u_texture;\n\
			void main() {\n\
			  vec4 tex = texture2D(u_texture, vec2(gl_PointCoord.x,1.0 - gl_PointCoord.y) );\n\
			  if(tex.a < 0.1)\n\
				discard;\n\
			  vec4 color = u_color * v_color * tex;\n\
			  gl_FragColor = color;\n\
			}\
		');

		//create shaders
		this.shader_phong = new Shader('\
			precision mediump float;\n\
			attribute vec3 a_vertex;\n\
			attribute vec3 a_normal;\n\
			varying vec3 v_pos;\n\
			varying vec3 v_normal;\n\
			uniform mat4 u_model;\n\
			uniform mat4 u_mvp;\n\
			void main() {\n\
				v_pos = (u_model * vec4(a_vertex,1.0)).xyz;\n\
				v_normal = (u_model * vec4(a_vertex + a_normal,1.0)).xyz - v_pos;\n\
				gl_Position = u_mvp * vec4(a_vertex,1.0);\n\
			}\
			','\
			precision mediump float;\n\
			uniform vec3 u_ambient_color;\n\
			uniform vec3 u_light_color;\n\
			uniform vec3 u_light_dir;\n\
			uniform vec4 u_color;\n\
			varying vec3 v_pos;\n\
			varying vec3 v_normal;\n\
			void main() {\n\
				vec3 N = normalize(v_normal);\n\
				float NdotL = max(0.0, dot(N,u_light_dir));\n\
				gl_FragColor = u_color * vec4(u_ambient_color + u_light_color * NdotL, 1.0);\n\
			}\
		');

		//create shaders
		this.shader_depth = new Shader('\
			precision mediump float;\n\
			attribute vec3 a_vertex;\n\
			varying vec4 v_pos;\n\
			uniform mat4 u_model;\n\
			uniform mat4 u_mvp;\n\
			void main() {\n\
				v_pos = u_model * vec4(a_vertex,1.0);\n\
				gl_Position = u_mvp * vec4(a_vertex,1.0);\n\
			}\
			','\
			precision mediump float;\n\
			varying vec4 v_pos;\n\
			\n\
			vec4 PackDepth32(float depth)\n\
			{\n\
				const vec4 bitSh  = vec4(   256*256*256, 256*256,   256,         1);\n\
				const vec4 bitMsk = vec4(   0,      1.0/256.0,    1.0/256.0,    1.0/256.0);\n\
				vec4 comp;\n\
				comp	= depth * bitSh;\n\
				comp	= fract(comp);\n\
				comp	-= comp.xxyz * bitMsk;\n\
				return comp;\n\
			}\n\
			void main() {\n\
				float depth = (v_pos.z / v_pos.w) * 0.5 + 0.5;\n\
				gl_FragColor = PackDepth32(depth);\n\
			}\
		');

		this.ready = true;
	},

	reset: function()
	{
		if(!this.ready)
			this.init();

		this.model_matrix = new Float32Array(this.stack.buffer,0,16);
		mat4.identity( this.model_matrix );
	},

	setColor: function(color)
	{
		for(var i = 0; i < color.length; i++)
			this.color[i] = color[i];
	},

	setAlpha: function(alpha)
	{
		this.color[3] = alpha;
	},

	setPointSize: function(v)
	{
		this.point_size = v;
	},

	setCamera: function(camera)
	{
		this.camera = camera;
		vec3.copy( this.camera_position, camera.getEye() );	
		mat4.copy( this.view_matrix, camera._view_matrix );
		mat4.copy( this.projection_matrix, camera._projection_matrix );
		mat4.copy( this.viewprojection_matrix, camera._viewprojection_matrix );
	},

	setCameraPosition: function(center)
	{
		vec3.copy( this.camera_position, center);
	},

	setViewProjectionMatrix: function(view, projection, vp)
	{
		mat4.copy( this.view_matrix, view);
		mat4.copy( this.projection_matrix, projection);
		if(vp)
			mat4.copy( this.viewprojection_matrix, vp);
		else
			mat4.multiply( this.viewprojection_matrix, view, vp);
	},

	setMatrix: function(matrix)
	{
		mat4.copy(this.model_matrix, matrix);
	},

	multMatrix: function(matrix)
	{
		mat4.multiply(this.model_matrix, matrix, this.model_matrix);
	},

	renderLines: function(lines, colors, strip)
	{
		if(!lines || !lines.length) return;
		var vertices = null;

		vertices = lines.constructor == Float32Array ? lines : this.linearize(lines);
		if(colors)
			colors = colors.constructor == Float32Array ? colors : this.linearize(colors);
		if(colors && (colors.length/4) != (vertices.length/3))
			colors = null;

		var mesh = GL.Mesh.load({vertices: vertices, colors: colors});
		return this.renderMesh(mesh, strip ? gl.LINE_STRIP : gl.LINES, colors ? this.shader_color : this.shader );
	},

	renderPoints: function(points, colors, shader)
	{
		if(!points || !points.length) return;
		var vertices = null;

		if(points.constructor == Float32Array)
			vertices = points;
		else if(points[0].length) //array of arrays
			vertices = this.linearize(points);
		else
			vertices = new Float32Array(points);

		if(colors && colors.constructor != Float32Array)
		{
			if(colors.constructor === Array )
				colors = new Float32Array( colors );
			else
				colors = this.linearize(colors);
		}

		var mesh = GL.Mesh.load({vertices: vertices, colors: colors});
		if(!shader)
			shader = colors ? this.shader_color : this.shader;

		return this.renderMesh(mesh, gl.POINTS, shader );
	},

	renderRoundPoints: function(points, colors, shader)
	{
		if(!points || !points.length) return;
		var vertices = null;

		if(points.constructor == Float32Array)
			vertices = points;
		else if(points[0].length) //array of arrays
			vertices = this.linearize(points);
		else
			vertices = new Float32Array(points);

		if(colors)
			colors = colors.constructor == Float32Array ? colors : this.linearize(colors);

		var mesh = GL.Mesh.load({vertices: vertices, colors: colors});
		if(!shader)
			shader = colors ? this.shader_points_color : this.shader_points;
		return this.renderMesh(mesh, gl.POINTS, shader );
	},

	//paints points with color, size, and texture binded in 0
	renderPointsWithSize: function(points, colors, sizes, texture, shader)
	{
		if(!points || !points.length) return;
		var vertices = null;

		if(points.constructor == Float32Array)
			vertices = points;
		else if(points[0].length) //array of arrays
			vertices = this.linearize(points);
		else
			vertices = new Float32Array(points);

		if(!colors)
			throw("colors required in Draw.renderPointsWithSize");
		colors = colors.constructor == Float32Array ? colors : this.linearize(colors);
		if(!sizes)
			throw("sizes required in Draw.renderPointsWithSize");
		sizes = sizes.constructor == Float32Array ? sizes : this.linearize(sizes);

		var mesh = GL.Mesh.load({vertices: vertices, colors: colors, extra: sizes});
		shader = shader || (texture ? this.shader_points_color_texture_size : this.shader_points_color_size);
		
		return this.renderMesh(mesh, gl.POINTS, shader );
	},

	createRectangleMesh: function(width, height, in_z)
	{
		var vertices = new Float32Array(4 * 3);
		if(in_z)
			vertices.set([-width*0.5,0,height*0.5, width*0.5,0,height*0.5, width*0.5,0,-height*0.5, -width*0.5,0,-height*0.5]);
		else
			vertices.set([-width*0.5,height*0.5,0, width*0.5,height*0.5,0, width*0.5,-height*0.5,0, -width*0.5,-height*0.5,0]);

		return GL.Mesh.load({vertices: vertices});
	},

	renderRectangle: function(width, height, in_z)
	{
		var mesh = this.createRectangleMesh(width, height, in_z);
		return this.renderMesh(mesh, gl.LINE_LOOP);
	},

	createCircleMesh: function(radius, segments, in_z)
	{
		segments = segments || 32;
		var axis = [0,1,0];
		var num_segments = segments || 100;
		var R = quat.create();
		var temp = vec3.create();
		var vertices = new Float32Array(num_segments * 3);

		var offset =  2 * Math.PI / num_segments;

		for(var i = 0; i < num_segments; i++)
		{
			temp[0] = Math.sin(offset * i) * radius;
			if(in_z)
			{
				temp[1] = 0;
				temp[2] = Math.cos(offset * i) * radius;
			}
			else
			{
				temp[2] = 0;
				temp[1] = Math.cos(offset * i) * radius;
			}

			vertices.set(temp, i*3);
		}

		return GL.Mesh.load({vertices: vertices});
	},

	renderCircle: function(radius, segments, in_z, filled)
	{
		var mesh = this.createCircleMesh(radius, segments, in_z);
		return this.renderMesh(mesh, filled ? gl.TRIANGLE_FAN : gl.LINE_LOOP);
	},

	renderSolidCircle: function(radius, segments, in_z)
	{
		return this.renderCircle(radius, segments, in_z, true);
	},

	createSphereMesh: function(radius, segments)
	{
		var axis = [0,1,0];
		segments = segments || 100;
		var R = quat.create();
		var temp = vec3.create();
		var vertices = new Float32Array( segments * 2 * 3 * 3); 

		var delta = 1.0 / segments * Math.PI * 2;

		for(var i = 0; i < segments; i++)
		{
			temp.set([ Math.sin( i * delta) * radius, Math.cos( i * delta) * radius, 0]);
			vertices.set(temp, i*18);
			temp.set([Math.sin( (i+1) * delta) * radius, Math.cos( (i+1) * delta) * radius, 0]);
			vertices.set(temp, i*18 + 3);

			temp.set([ Math.sin( i * delta) * radius, 0, Math.cos( i * delta) * radius ]);
			vertices.set(temp, i*18 + 6);
			temp.set([Math.sin( (i+1) * delta) * radius, 0, Math.cos( (i+1) * delta) * radius ]);
			vertices.set(temp, i*18 + 9);

			temp.set([ 0, Math.sin( i * delta) * radius, Math.cos( i * delta) * radius ]);
			vertices.set(temp, i*18 + 12);
			temp.set([ 0, Math.sin( (i+1) * delta) * radius, Math.cos( (i+1) * delta) * radius ]);
			vertices.set(temp, i*18 + 15);
		}
		return GL.Mesh.load({vertices: vertices});
	},

	renderWireSphere: function(radius, segments)
	{
		var mesh = this.createSphereMesh(radius, segments);
		return this.renderMesh(mesh, gl.LINES);
	},

	createWireBoxMesh: function(sizex,sizey,sizez)
	{
		sizex = sizex*0.5;
		sizey = sizey*0.5;
		sizez = sizez*0.5;
		var vertices = new Float32Array([-sizex,sizey,sizez , -sizex,sizey,-sizez, sizex,sizey,-sizez, sizex,sizey,sizez,
						-sizex,-sizey,sizez, -sizex,-sizey,-sizez, sizex,-sizey,-sizez, sizex,-sizey,sizez]);
		var triangles = new Uint16Array([0,1, 0,4, 0,3, 1,2, 1,5, 2,3, 2,6, 3,7, 4,5, 4,7, 6,7, 5,6   ]);
		return GL.Mesh.load({vertices: vertices, lines:triangles });
	},

	renderWireBox: function(sizex,sizey,sizez)
	{
		var mesh = this.createWireBoxMesh(sizex,sizey,sizez);
		return this.renderMesh(mesh, gl.LINES);
	},

	createSolidBoxMesh: function(sizex,sizey,sizez)
	{
		sizex = sizex*0.5;
		sizey = sizey*0.5;
		sizez = sizez*0.5;
		var vertices = [[-sizex,sizey,-sizez],[-sizex,-sizey,+sizez],[-sizex,sizey,sizez],[-sizex,sizey,-sizez],[-sizex,-sizey,-sizez],[-sizex,-sizey,+sizez],[sizex,sizey,-sizez],[sizex,sizey,sizez],[sizex,-sizey,+sizez],[sizex,sizey,-sizez],[sizex,-sizey,+sizez],[sizex,-sizey,-sizez],[-sizex,sizey,sizez],[sizex,-sizey,sizez],[sizex,sizey,sizez],[-sizex,sizey,sizez],[-sizex,-sizey,sizez],[sizex,-sizey,sizez],[-sizex,sizey,-sizez],[sizex,sizey,-sizez],[sizex,-sizey,-sizez],[-sizex,sizey,-sizez],[sizex,-sizey,-sizez],[-sizex,-sizey,-sizez],[-sizex,sizey,-sizez],[sizex,sizey,sizez],[sizex,sizey,-sizez],[-sizex,sizey,-sizez],[-sizex,sizey,sizez],[sizex,sizey,sizez],[-sizex,-sizey,-sizez],[sizex,-sizey,-sizez],[sizex,-sizey,sizez],[-sizex,-sizey,-sizez],[sizex,-sizey,sizez],[-sizex,-sizey,sizez]];
		return GL.Mesh.load({vertices: vertices });
	},

	renderSolidBox: function(sizex,sizey,sizez)
	{
		var mesh = this.createSolidBoxMesh(sizex,sizey,sizez);
		return this.renderMesh(mesh, gl.TRIANGLES);
	},

	renderWireCube: function(size)
	{
		return this.renderWireBox(size,size,size);
	},

	renderSolidCube: function(size)
	{
		return this.renderSolidCube(size,size,size);
	},

	renderPlane: function(position, size, texture, shader)
	{
		this.push();
		this.translate(position);
		this.scale( size[0], size[1], 1 );
		if(texture)
			texture.bind(0);

		if(!shader && texture)
			shader = this.shader_texture;

		this.renderMesh(this.quad_mesh, gl.TRIANGLE_FAN, shader );

		if(texture)
			texture.unbind(0);
		
		this.pop();
	},	

	createGridMesh: function(dist,num)
	{
		dist = dist || 20;
		num = num || 10;
		var vertices = new Float32Array( (num*2+1) * 4 * 3);
		var pos = 0;
		for(var i = -num; i <= num; i++)
		{
			vertices.set( [i*dist,0,dist*num], pos);
			vertices.set( [i*dist,0,-dist*num],pos+3);
			vertices.set( [dist*num,0,i*dist], pos+6);
			vertices.set( [-dist*num,0,i*dist],pos+9);
			pos += 3*4;
		}
		return GL.Mesh.load({vertices: vertices});
	},

	renderGrid: function(dist,num)
	{
		var mesh = this.createGridMesh(dist,num);
		return this.renderMesh(mesh, gl.LINES);
	},

	createConeMesh: function(radius, height, segments, in_z)
	{
		var axis = [0,1,0];
		segments = segments || 100;
		var R = quat.create();
		var temp = vec3.create();
		var vertices = new Float32Array( (segments+2) * 3);
		vertices.set(in_z ? [0,0,height] : [0,height,0], 0);

		for(var i = 0; i <= segments; i++)
		{
			quat.setAxisAngle(R,axis, 2 * Math.PI * (i/segments) );
			vec3.transformQuat(temp, [0,0,radius], R );
			if(in_z)
				vec3.set(temp, temp[0],temp[2],temp[1] );
			vertices.set(temp, i*3+3);
		}

		return GL.Mesh.load({vertices: vertices});
	},

	renderCone: function(radius, height, segments, in_z)
	{
		var mesh = this.createConeMesh(radius, height, segments, in_z);
		return this.renderMesh(mesh, gl.TRIANGLE_FAN);
	},

	createCylinderMesh: function(radius, height, segments, in_z)
	{
		var axis = [0,1,0];
		segments = segments || 100;
		var R = quat.create();
		var temp = vec3.create();
		var vertices = new Float32Array( (segments+1) * 3 * 2);

		for(var i = 0; i <= segments; i++)
		{
			quat.setAxisAngle(R, axis, 2 * Math.PI * (i/segments) );
			vec3.transformQuat(temp, [0,0,radius], R );
			vertices.set(temp, i*3*2+3);
			temp[1] = height;
			vertices.set(temp, i*3*2);
		}

		return GL.Mesh.load({vertices: vertices});
	},

	renderCylinder: function(radius, height, segments, in_z)
	{
		var mesh = this.createCylinderMesh(radius, height, segments, in_z);
		return this.renderMesh(mesh, gl.TRIANGLE_STRIP);
	},

	renderImage: function(position, image, size, fixed_size )
	{
		size = size || 10;
		var texture = null;

		if(typeof(image) == "string")
		{
			texture = this.images[image];
			if(texture == null)
			{
				Draw.images[image] = 1; //loading
				var img = new Image();
				img.src = image;
				img.onload = function()
				{
					var texture = GL.Texture.fromImage(this);
					Draw.images[image] = texture;
					if(Draw.onRequestFrame)
						Draw.onRequestFrame();
					return;
				}	
				return;
			}
			else if(texture == 1)
				return; //loading
		}
		else if(image.constructor == Texture)
			texture = image;

		if(!texture) return;

		if(fixed_size)
		{
			this.setPointSize( size );
			texture.bind(0);
			this.renderPoints( position, null, this.shader_image );
		}
		else
		{
			this.push();
			//this.lookAt(position, this.camera_position,[0,1,0]);
			this.billboard(position);
			this.scale(size,size,size);
			texture.bind(0);
			this.renderMesh(this.quad_mesh, gl.TRIANGLE_FAN, this.shader_texture );
			this.pop();
		}
	},

	renderMesh: function(mesh, primitive, shader, indices )
	{
		if(!this.ready) throw ("Draw.js not initialized, call Draw.init()");
		if(!shader)
			shader = mesh.vertexBuffers["colors"] ? this.shader_color : this.shader;

		mat4.multiply(this.mvp_matrix, this.viewprojection_matrix, this.model_matrix );

		shader.uniforms({
				u_model: this.model_matrix,
				u_mvp: this.mvp_matrix,
				u_color: this.color,
				u_point_size: this.point_size,
				u_texture: 0
		}).draw(mesh, primitive === undefined ? gl.LINES : primitive, indices );
		this.last_mesh = mesh;
		return mesh;
	},

	renderText: function(text)
	{
		if(!Draw.font_atlas)
			this.createFontAtlas();
		var atlas = this.font_atlas;
		var l = text.length;
		var char_size = atlas.atlas.char_size;
		var i_char_size = 1 / atlas.atlas.char_size;
		var spacing = atlas.atlas.spacing;

		var num_valid_chars = 0;
		for(var i = 0; i < l; ++i)
			if(atlas.atlas[ text.charCodeAt(i) ] != null)
				num_valid_chars++;

		var vertices = new Float32Array( num_valid_chars * 6 * 3);
		var coords = new Float32Array( num_valid_chars * 6 * 2);

		var pos = 0;
		var x = 0; y = 0;
		for(var i = 0; i < l; ++i)
		{
			var c = atlas.atlas[ text.charCodeAt(i) ];
			if(!c)
			{
				if(text.charCodeAt(i) == 10)
				{
					x = 0;
					y -= char_size;
				}
				else
					x += char_size;
				continue;
			}

			vertices.set( [x, y, 0], pos*6*3);
			vertices.set( [x, y + char_size, 0], pos*6*3+3);
			vertices.set( [x + char_size, y + char_size, 0], pos*6*3+6);
			vertices.set( [x + char_size, y, 0], pos*6*3+9);
			vertices.set( [x, y, 0], pos*6*3+12);
			vertices.set( [x + char_size, y + char_size, 0], pos*6*3+15);

			coords.set( [c[0], c[1]], pos*6*2);
			coords.set( [c[0], c[3]], pos*6*2+2);
			coords.set( [c[2], c[3]], pos*6*2+4);
			coords.set( [c[2], c[1]], pos*6*2+6);
			coords.set( [c[0], c[1]], pos*6*2+8);
			coords.set( [c[2], c[3]], pos*6*2+10);

			x+= spacing;
			++pos;
		}
		var mesh = GL.Mesh.load({vertices: vertices, coords: coords});
		atlas.bind(0);
		return this.renderMesh(mesh, gl.TRIANGLES, this.shader_texture );
	},


	createFontAtlas: function()
	{
		var canvas = createCanvas(512,512);
		var fontsize = (canvas.width * 0.09)|0;
		var char_size = (canvas.width * 0.1)|0;

		//$("body").append(canvas);
		var ctx = canvas.getContext("2d");
		//ctx.fillRect(0,0,canvas.width,canvas.height);
		ctx.fillStyle = "white";
		ctx.font = fontsize + "px Courier New";
		ctx.textAlign = "center";
		var x = 0;
		var y = 0;
		var xoffset = 0.5, yoffset = fontsize * -0.3;
		var atlas = {char_size: char_size, spacing: char_size * 0.6};

		for(var i = 6; i < 100; i++)//valid characters
		{
			var character = String.fromCharCode(i+27);
			atlas[i+27] = [x/canvas.width, 1-(y+char_size)/canvas.height, (x+char_size)/canvas.width, 1-(y)/canvas.height];
			ctx.fillText(character,Math.floor(x+char_size*xoffset),Math.floor(y+char_size+yoffset),char_size);
			x += char_size;
			if((x + char_size) > canvas.width)
			{
				x = 0;
				y += char_size;
			}
		}

		this.font_atlas = GL.Texture.fromImage(canvas, {magFilter: gl.NEAREST, minFilter: gl.LINEAR} );
		this.font_atlas.atlas = atlas;
	},

	linearize: function(array)
	{
		var n = array[0].length;
		var result = new Float32Array(array.length * n);
		var l = array.length;
		for(var i = 0; i < l; ++i)
			result.set(array[i], i*n);
		return result;
	},

	push: function()
	{
		if(this.model_matrix.byteOffset >= (this.stack.byteLength - 16*4))
			throw("matrices stack overflow");

		var old = this.model_matrix;
		this.model_matrix = new Float32Array(this.stack.buffer,this.model_matrix.byteOffset + 16*4,16);
		mat4.copy(this.model_matrix, old);
	},

	pop: function()
	{
		if(this.model_matrix.byteOffset == 0)
			throw("too many pops");
		this.model_matrix = new Float32Array(this.stack.buffer,this.model_matrix.byteOffset - 16*4,16);
	},


	pushCamera: function()
	{
		this.camera_stack.push( mat4.create( this.viewprojection_matrix ) );
	},

	popCamera: function()
	{
		if(this.camera_stack.length == 0)
			throw("too many pops");
		this.viewprojection_matrix.set( this.camera_stack.pop() );
	},

	identity: function()
	{
		mat4.identity(this.model_matrix);
	},

	scale: function(x,y,z)
	{
		if(arguments.length == 3)
			mat4.scale(this.model_matrix,this.model_matrix,[x,y,z]);
		else //one argument: x-> vec3
			mat4.scale(this.model_matrix,this.model_matrix,x);
	},

	translate: function(x,y,z)
	{
		if(arguments.length == 3)
			mat4.translate(this.model_matrix,this.model_matrix,[x,y,z]);
		else  //one argument: x -> vec3
			mat4.translate(this.model_matrix,this.model_matrix,x);
	},

	rotate: function(angle, x,y,z)
	{
		if(arguments.length == 4)
			mat4.rotate(this.model_matrix, this.model_matrix, angle * DEG2RAD, [x,y,z]);
		else //two arguments: x -> vec3
			mat4.rotate(this.model_matrix, this.model_matrix, angle * DEG2RAD, x);
	},

	lookAt: function(position, target, up)
	{
		mat4.lookAt(this.model_matrix, position, target, up);
		mat4.invert(this.model_matrix, this.model_matrix);
	},

	billboard: function(position)
	{
		mat4.invert(this.model_matrix, this.view_matrix);
		mat4.setTranslation(this.model_matrix, position);
	},

	fromTranslationFrontTop: function(position, front, top)
	{
		mat4.fromTranslationFrontTop(this.model_matrix, position, front, top);
	},

	project: function( position, dest )
	{
		dest = dest || vec3.create();
		return mat4.multiplyVec3(dest, this.mvp_matrix, position);
	},

	getPhongShader: function( ambient_color, light_color, light_dir )
	{
		this.shader_phong.uniforms({ u_ambient_color: ambient_color, u_light_color: light_color, u_light_dir: light_dir });
		return this.shader_phong;
	},

	getDepthShader: function()
	{
		return this.shader_depth;
	}

};

if(typeof(LS) != "undefined")
	LS.Draw = Draw;