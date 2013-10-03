//packer version
//This class allows to construct or read a binary file easily
//you can pack different chunks of data with a 14 bytes string code associated
//Javi Agenjo @tamats   February 2012
//BinaryPack file structure: 
//	every chunk
//		dataype  2bytes 
//		varname  14bytes
//		chunksize  4bytes unsigned int (chunk size in bytes)
//		chunk    undefined uint8[chunksize] array
//  ...

// dependencies: none

function BinaryPack()
{
	this.nextChunkPos = 0;
	this.dataArray = null;
	this.chunks = {};
}

BinaryPack.HEADER_STRING = "JBIN";
BinaryPack.CHUNK_CODE_SIZE = 16;
BinaryPack.CODES = {
	"Int8Array": {code: "I1", bytes: 1},
	"Uint8Array": {code: "i1", bytes: 1},
	"Int16Array": {code: "I2", bytes: 2},
	"Uint16Array": {code: "i2", bytes: 2},
	"Int32Array": {code: "I4", bytes: 4},
	"Uint32Array": {code: "i4", bytes: 4},
	"Float32Array": {code: "F4", bytes: 4},
	"Float64Array": {code: "F8", bytes: 8},
	"Object": {code: "OB", bytes: 1},
	"string": {code: "ST", bytes: 1},
	"number": {code: "NU", bytes: 1},
	"BinaryPack": {code: "BP", bytes: 1}
};


//consts
BinaryPack.prototype = {
	//set the size
	reserve: function(max_size)
	{
		max_size = max_size || 1024*1024; //1MB
		this.dataArray = new Uint8Array(max_size);
		this.nextChunkPos = 0;
	},

	//loads a uint8array as the data source and retrieves the object
	load: function(arraybuffer)
	{
		this.dataArray = new Uint8Array(arraybuffer); //clone
		this.nextChunkPos = 0;
		this.chunks = {};
		var object = {};

		//get header
		var header = this.dataArray.subarray(0,4);
		var good_header = true;
		for(var i = 0; i < header.length; i++)
			if(header[i] != 0 && header[i] != BinaryPack.HEADER_STRING.charCodeAt(i))
			{
				trace("Warning: deprecated bin format, please upgrade mesh");
				//return false; //this file is not a binarypack
				good_header = false;
				break;
			}

		if(good_header) //move 
			this.nextChunkPos = 4;
		
		//yep, this is ugly but I dont know a better way
		var code_to_type = {};
		for(var i in BinaryPack.CODES)
			code_to_type[ BinaryPack.CODES[i].code ] = i;

		//for every chunk
		while(true)
		{
			var chunk = this.getChunk();
			if(chunk == null) break;

			this.chunks[ chunk.code ] = chunk;

			//process chunk
			var data_code = chunk.code.substring(0,2);
			var data_name = chunk.code.substring(2,BinaryPack.CHUNK_CODE_SIZE-2);
			var data = chunk.data;
			var class_name = code_to_type[data_code];

			if(class_name == "string")
				data = BinaryPack.typedArrayToString( data );
			else if(class_name == "number")
				data = parseFloat( BinaryPack.typedArrayToString( data ) );
			else if(class_name == "Object")
				data = JSON.parse( BinaryPack.typedArrayToString( data ) );
			else if(class_name == "BinaryPack")
			{
				data = new Uint8Array(data);  //clone to avoid problems with bytes alignment
				var bp = new BinaryPack();
				data = bp.load(data);
			}
			else
			{
				data = new Uint8Array(data); //clone to avoid problems with bytes alignment
				data = new window[class_name](data.buffer);
			}
			object[data_name] = data;
		}

		return object;
	},

	//gets an object and created the binary pack
	save: function(object)
	{
		var chunks = [];

		var header_size = BinaryPack.HEADER_STRING.length;
		var total_size = header_size;

		//gather chunks
		for(var i in object)
		{
			var data = object[i];
			var classname = BinaryPack.getClassName(data);

			var data_info = BinaryPack.CODES[ classname ];
			if(data_info == null)
				continue; //type not supported

			var code = data_info.code + i.substring(0,BinaryPack.CHUNK_CODE_SIZE-2); //max 14 chars per varname

			//class specific actions
			if (classname == "number")
				data = data.toString();
			else if(classname == "Object")
				data = JSON.stringify(data); //serialize the object
			else if(classname == "BinaryPack")
				data = data.getData();

			chunks.push({code:code, data: data});
			var chunk_size = data.length * data_info.bytes + BinaryPack.CHUNK_CODE_SIZE + 4;
			//chunk_size += chunk_size % 4; //use multiple of 4 sizes to avoid problems with typed arrays
			total_size += chunk_size;
		}

		//construct the binary pack
		this.reserve(total_size);
		
		//copy header
		var header_data = BinaryPack.stringToTypedArray( BinaryPack.HEADER_STRING );
		this._addArrayData(header_data);

		//copy chunks
		for(var j in chunks)
		{
			var chunk = chunks[j];
			this.addChunk( chunk.code, chunk.data );
		}
		this.finalize();

		return this.getData();
	},

	getData: function()
	{
		return this.dataArray;
	},

	//inserts a data chunk inside the binary file
	addChunk: function( code, buffer )
	{
		if(this.dataArray == null)
			throw("BinaryPack needs to reserve space before adding data");

		if(typeof(buffer) == "string") //this doesnt works usually: TODO
			buffer = BinaryPack.stringToTypedArray(buffer);

		//code
		var code_array = BinaryPack.stringToTypedArray(code, BinaryPack.CHUNK_CODE_SIZE);
		this.dataArray.set(code_array, this.nextChunkPos);
		this.nextChunkPos += code_array.length;

		//chunk size
		var length_array = new Uint32Array([buffer.byteLength]);
		var temp = new Uint8Array(length_array.buffer);
		this.dataArray.set(temp, this.nextChunkPos);
		this.nextChunkPos += temp.length;

		//trace("Chunk Saved: Name: "+ code +" Length: " + buffer.byteLength); 

		//data
		this._addArrayData(buffer.buffer);
	},

	_addArrayData: function(data)
	{
		var view = new Uint8Array(data);
		this.dataArray.set(view, this.nextChunkPos);
		this.nextChunkPos += view.length; 
	},

	//retrieve the next data chunk from the file
	getChunk: function()
	{
		if(this.dataArray == null)
			throw("BinaryPack is empty, no data assigned");

		if (this.nextChunkPos == this.dataArray.length)
			return null;

		//var view = new DataView(this.buffer); //not implemented yet in Firefox, arg

		var code = BinaryPack.typedArrayToString( this.dataArray.subarray(this.nextChunkPos, this.nextChunkPos + BinaryPack.CHUNK_CODE_SIZE) );
		if(code == "") return null;

		var length = this.getUint32(this.nextChunkPos + BinaryPack.CHUNK_CODE_SIZE);
		if(length == 0) return null;

		var data = this.dataArray.subarray(this.nextChunkPos + BinaryPack.CHUNK_CODE_SIZE+4, this.nextChunkPos + BinaryPack.CHUNK_CODE_SIZE+4 + length);
		this.nextChunkPos = this.nextChunkPos + BinaryPack.CHUNK_CODE_SIZE+4 + length;

		if(code == "" || length == 0) return null;
		//trace("Chunk Found: Name: "+ code +" Length: " + length);
		return { code: code, length: length, data: data };
	},

	//closes the file and packs the data
	finalize: function()
	{
		if(this.nextChunkPos == 0 || this.nextChunkPos == this.dataArray.length) 
			return;

		//adjust the buffer size (crop the final part)
		var new_data = new Uint8Array(this.nextChunkPos);
		new_data.set( this.dataArray.subarray(0, new_data.length),0);
		this.dataArray = new_data;
	},

	//reads a uint32 (used for the chunk size)
	getUint32: function(pos)
	{
		//var v = this.subarray(pos,pos+4);
		var f = new Uint32Array(1);
		var view = new Uint8Array(f.buffer);
		view.set( this.dataArray.subarray(pos,pos+4), 0 );
		
		return f[0];
	}
};


//static funcs ****
//takes a string and stores it as a typed array
BinaryPack.stringToTypedArray = function(str, fixed_length)
{
	var r = new Uint8Array( fixed_length ? fixed_length : str.length);
	for(var i = 0; i < str.length; i++)
		r[i] = str.charCodeAt(i);
	return r;
}

//takes a typed array with ASCII codes and returns the string
BinaryPack.typedArrayToString = function(typed_array, same_size)
{
	var r = "";
	for(var i = 0; i < typed_array.length; i++)
		if (typed_array[i] == 0 && !same_size)
			break;
		else
			r += String.fromCharCode( typed_array[i] );
	return r;
}

//Extra functions ************************
//useful, it takes a multidimensional javascript array full of numbers and 
//stores it in the propper array
BinaryPack.getClassName = function(obj)
{
	if (typeof obj != "object")
	{
		if(obj === null) 
			return false;
		return typeof obj;
	}
	return /(\w+)\(/.exec(obj.constructor.toString())[1];
}

BinaryPack.linearizeArray = function(array, classtype)
{
	classtype = classtype || Float32Array;
	var components = array[0].length;
	var size = array.length * components;
	var buffer = null;
	buffer = new classtype(size);

	for (var i=0; i < array.length;++i)
		for(var j=0; j < components; ++j)
			buffer[i*components + j] = array[i][j];

	return buffer;
}

//takes a typed array and returns the base64 string
BinaryPack.encode64Array = function (input)
{
  var output = "";
  var chr1, chr2, chr3 = "";
  var enc1, enc2, enc3, enc4 = "";
  var i = 0;

  if(input.constructor == ArrayBuffer)
	  input = new Uint8Array(input);
  if(input.length == undefined) throw("binaryPacker: this input is not an array");
  var length = input.length;

  do {
	 chr1 = input[i++];
	 chr2 = input[i++];
	 chr3 = input[i++];

	 enc1 = chr1 >> 2;
	 enc2 = ((chr1 & 3) << 4) | (chr2 >> 4);
	 enc3 = ((chr2 & 15) << 2) | (chr3 >> 6);
	 enc4 = chr3 & 63;

	 if (isNaN(chr2)) {
		enc3 = enc4 = 64;
	 } else if (isNaN(chr3)) {
		enc4 = 64;
	 }

	 output = output +
		keyStr[enc1] +
		keyStr[enc2] +
		keyStr[enc3] +
		keyStr[enc4];
	 chr1 = chr2 = chr3 = "";
	 enc1 = enc2 = enc3 = enc4 = "";
  } while (i < length);

  return output;
}

//takes a string encoded in base64 and returns the typed array
BinaryPack.decode64ToArray = function(input)
{
	 var output = new Uint8Array( input.length );

	 var chr1, chr2, chr3 = "";
	 var enc1, enc2, enc3, enc4 = "";
	 var i = 0;
 
	 // remove all characters that are not A-Z, a-z, 0-9, +, /, or =
	 var base64test = /[^A-Za-z0-9\+\/\=]/g;
	 if (base64test.exec(input)) {
		throw("There were invalid base64 characters in the input text.\n" +
			  "Valid base64 characters are A-Z, a-z, 0-9, '+', '/',and '='\n" +
			  "Expect errors in decoding.");
	 }
	 input = input.replace(/[^A-Za-z0-9\+\/\=]/g, "");
	 var pos = 0;
 
	 do {
		enc1 = keyStr.indexOf(input.charAt(i++));
		enc2 = keyStr.indexOf(input.charAt(i++));
		enc3 = keyStr.indexOf(input.charAt(i++));
		enc4 = keyStr.indexOf(input.charAt(i++));
 
		chr1 = (enc1 << 2) | (enc2 >> 4);
		chr2 = ((enc2 & 15) << 4) | (enc3 >> 2);
		chr3 = ((enc3 & 3) << 6) | enc4;
 
		output[pos++] = chr1;
 
		if (enc3 != 64) {
		   output[pos++] = chr2;
		}
		if (enc4 != 64) {
		   output[pos++] = chr3;
		}
 
		chr1 = chr2 = chr3 = "";
		enc1 = enc2 = enc3 = enc4 = "";
 
	 } while (i < input.length);

	 return new Uint8Array( output.subarray(0, pos) ); //clone
}


//********************/

function ByteStruct()
{
	this.fields = [];
}

/*
ByteStruct.prototype = {
	types: {
		'byte': Int8Array,
		'char': Int8Array,
		'unsigned byte': Uint8Array,
		'unsigned char': Uint8Array,
		'short': Int16Array,
		'unsigned short': Uint16Array,
		'int': Int32Array,
		'uint': Uint32Array,
		'float': Float32Array,
		'double': Float64Array,
		'pointer': Int32Array,
	},

	addField: function(name,type)
	{
		var field = {
			name: name,
			type: type,
		};

		this.fields.push(field);
	},

	parse: function( data )
	{

	},
};
*/


//this module is in charge of rendering basic objects like lines, points, and primitives
//it works over litegl (no need of scene)

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
		this.camera_position = vec3.create();
		this.temp_matrix = mat4.create();
		this.point_size = 2;

		this.stack = new Float32Array(16 * 32); //stack max size
		this.model_matrix = new Float32Array(this.stack.buffer,0,16*4);
		mat4.identity( this.model_matrix );

		this.viewprojection_matrix = mat4.create();
		this.camera_stack = [];

		//create shaders
		this.shader = new Shader('\
			precision mediump float;\n\
			attribute vec3 a_vertex;\n\
			uniform mat4 u_mvp;\n\
			uniform float u_point_size;\n\
			void main() {\
				gl_PointSize = u_point_size;\n\
				gl_Position = u_mvp * vec4(a_vertex,1.0);\
			}\
			','\
			precision mediump float;\n\
			uniform vec4 u_color;\n\
			void main() {\
			  gl_FragColor = u_color;\n\
			}\
		');

		this.shader_color = new Shader('\
			precision mediump float;\n\
			attribute vec3 a_vertex;\n\
			attribute vec4 a_color;\n\
			uniform mat4 u_mvp;\n\
			uniform float u_point_size;\n\
			varying vec4 v_color;\n\
			void main() {\
				v_color = a_color;\n\
				gl_PointSize = u_point_size;\n\
				gl_Position = u_mvp * vec4(a_vertex,1.0);\
			}\
			','\
			precision mediump float;\n\
			uniform vec4 u_color;\n\
			varying vec4 v_color;\n\
			void main() {\
			  gl_FragColor = u_color * v_color;\n\
			}\
		');

		this.shader_texture = new Shader('\
			precision mediump float;\n\
			attribute vec3 a_vertex;\n\
			attribute vec2 a_coord;\n\
			varying vec2 v_coord;\n\
			uniform mat4 u_mvp;\n\
			uniform float u_point_size;\n\
			void main() {\n\
				gl_PointSize = u_point_size;\n\
				v_coord = a_coord;\n\
				gl_Position = u_mvp * vec4(a_vertex,1.0);\n\
			}\
			','\
			precision mediump float;\n\
			varying vec2 v_coord;\n\
			uniform vec4 u_color;\n\
			uniform sampler2D u_texture;\n\
			void main() {\n\
			  vec4 tex = texture2D(u_texture, v_coord);\n\
			  if(tex.a < 0.1)\n\
				discard;\n\
			  gl_FragColor = u_color * tex;\n\
			}\
		');

		var vertices = [[-1,1,0],[1,1,0],[1,-1,0],[-1,-1,0]];
		var coords = [[0,1],[1,1],[1,0],[0,0]];
		this.quad_mesh = GL.Mesh.load({vertices:vertices, coords: coords});

		//this.createTextAtlas();

		this.ready = true;
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

	setLineWidth: function(v)
	{
		gl.lineWidth(v);
	},


	setPointSize: function(v)
	{
		this.point_size = v;
	},

	setCameraPosition: function(center)
	{
		vec3.copy( this.camera_position, center);
	},

	setViewProjectionMatrix: function(vp)
	{
		mat4.copy( this.viewprojection_matrix, vp);
	},

	setMatrix: function(matrix)
	{
		mat4.copy(this.model_matrix, matrix);
	},

	multMatrix: function(matrix)
	{
		mat4.multiply(this.model_matrix, matrix, this.model_matrix);
	},

	renderLines: function(lines, colors)
	{
		if(!lines || !lines.length) return;
		var vertices = null;

		vertices = lines.constructor == Float32Array ? lines : this.linearize(lines);
		if(colors)
			colors = colors.constructor == Float32Array ? colors : this.linearize(colors);
		if(colors && (colors.length/4) != (vertices.length/3))
			colors = null;

		var mesh = GL.Mesh.load({vertices: vertices, colors: colors});
		return this.renderMesh(mesh, gl.LINES, colors ? this.shader_color : this.shader );
	},

	renderPoints: function(points, colors)
	{
		if(!points || !points.length) return;
		var vertices = null;

		if(points.constructor == Float32Array)
			vertices = points;
		else
			vertices = this.linearize(points);

		if(colors)
			colors = colors.constructor == Float32Array ? colors : this.linearize(colors);

		var mesh = GL.Mesh.load({vertices: vertices, colors: colors});
		return this.renderMesh(mesh, gl.POINTS, colors ? this.shader_color : this.shader );
	},

	renderRectangle: function(width, height, in_z)
	{
		var vertices = new Float32Array(4 * 3);
		if(in_z)
			vertices.set([-width*0.5,0,height*0.5, width*0.5,0,height*0.5, width*0.5,0,-height*0.5, -width*0.5,0,-height*0.5]);
		else
			vertices.set([-width*0.5,height*0.5,0, width*0.5,height*0.5,0, width*0.5,-height*0.5,0, -width*0.5,-height*0.5,0]);

		var mesh = GL.Mesh.load({vertices: vertices});
		return this.renderMesh(mesh, gl.LINE_LOOP);
	},

	renderCircle: function(radius, segments, in_z)
	{
		var axis = [0,1,0];
		var num_segments = segments || 100;
		var R = quat.create();
		var temp = vec3.create();
		var vertices = new Float32Array(num_segments * 3);

		for(var i = 0; i < num_segments; i++)
		{
			quat.setAxisAngle(R, axis, 2 * Math.PI * (i/num_segments));
			vec3.transformQuat(temp, [0,0,radius], R );
			if(!in_z)
				vec3.set(temp, temp[0],temp[2],temp[1]);
			vertices.set(temp, i*3);
		}

		var mesh = GL.Mesh.load({vertices: vertices});
		return this.renderMesh(mesh, gl.LINE_LOOP);
	},

	renderWireSphere: function(radius, segments)
	{
		var axis = [0,1,0];
		segments = segments || 100;
		var R = quat.create();
		var temp = vec3.create();
		var vertices = new Float32Array((segments) * 3 * 3); //3 arcs

		for(var i = 0; i < segments; i++)
		{
			quat.setAxisAngle(R,axis, 2 * Math.PI * (i/segments));
			vec3.transformQuat(temp, [0,0,radius], R);
			vertices.set(temp, i*3);
			vertices.set([temp[0],temp[2],temp[1]], i*3+segments*3);
			vertices.set([temp[1],temp[0],temp[2]], i*3+segments*3*2);
		}

		var mesh = GL.Mesh.load({vertices: vertices});
		return this.renderMesh(mesh, gl.LINES);
	},

	renderWireBox: function(sizex,sizey,sizez)
	{
		sizex = sizex*0.5;
		sizey = sizey*0.5;
		sizez = sizez*0.5;
		var vertices = new Float32Array([-sizex,sizey,sizez , -sizex,sizey,-sizez, sizex,sizey,-sizez, sizex,sizey,sizez,
						-sizex,-sizey,sizez, -sizex,-sizey,-sizez, sizex,-sizey,-sizez, sizex,-sizey,sizez]);
		var triangles = new Uint16Array([0,1, 0,4, 0,3, 1,2, 1,5, 2,3, 2,6, 3,7, 4,5, 4,7, 6,7, 5,6   ]);
		var mesh = GL.Mesh.load({vertices: vertices, lines:triangles });
		return this.renderMesh(mesh, gl.LINES);
	},

	renderSolidBox: function(sizex,sizey,sizez)
	{
		sizex = sizex*0.5;
		sizey = sizey*0.5;
		sizez = sizez*0.5;
		var vertices = [[-sizex,sizey,-sizez],[-sizex,-sizey,+sizez],[-sizex,sizey,sizez],[-sizex,sizey,-sizez],[-sizex,-sizey,-sizez],[-sizex,-sizey,+sizez],[sizex,sizey,-sizez],[sizex,sizey,sizez],[sizex,-sizey,+sizez],[sizex,sizey,-sizez],[sizex,-sizey,+sizez],[sizex,-sizey,-sizez],[-sizex,sizey,sizez],[sizex,-sizey,sizez],[sizex,sizey,sizez],[-sizex,sizey,sizez],[-sizex,-sizey,sizez],[sizex,-sizey,sizez],[-sizex,sizey,-sizez],[sizex,sizey,-sizez],[sizex,-sizey,-sizez],[-sizex,sizey,-sizez],[sizex,-sizey,-sizez],[-sizex,-sizey,-sizez],[-sizex,sizey,-sizez],[sizex,sizey,sizez],[sizex,sizey,-sizez],[-sizex,sizey,-sizez],[-sizex,sizey,sizez],[sizex,sizey,sizez],[-sizex,-sizey,-sizez],[sizex,-sizey,-sizez],[sizex,-sizey,sizez],[-sizex,-sizey,-sizez],[sizex,-sizey,sizez],[-sizex,-sizey,sizez]];
		var mesh = GL.Mesh.load({vertices: vertices });
		return this.renderMesh(mesh, gl.TRIANGLES);
	},

	renderGrid: function(dist,num)
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
		var mesh = GL.Mesh.load({vertices: vertices});
		return this.renderMesh(mesh, gl.LINES);
	},

	renderCone: function(radius, height, segments, in_z)
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

		var mesh = GL.Mesh.load({vertices: vertices});
		return this.renderMesh(mesh, gl.TRIANGLE_FAN);
	},

	renderCylinder: function(radius, height, segments, in_z)
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

		var mesh = GL.Mesh.load({vertices: vertices});
		return this.renderMesh(mesh, gl.TRIANGLE_STRIP);
	},

	renderImage: function(position, image, size)
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

		this.push();
		this.lookAt(position, this.camera_position,[0,1,0]);
		this.scale(size,size,size);
		texture.bind(0);
		this.renderMesh(this.quad_mesh, gl.TRIANGLE_FAN, this.shader_texture );
		this.pop();
	},

	renderMesh: function(mesh, primitive, shader)
	{
		if(!this.ready) throw ("Draw.js not initialized, call Draw.init()");
		shader = shader || this.shader;
		mat4.multiply(this.mvp_matrix, this.viewprojection_matrix, this.model_matrix );

		shader.uniforms({
				u_mvp: this.mvp_matrix,
				u_color: this.color,
				u_point_size: this.point_size,
				u_texture: 0
		}).draw(mesh, primitive == undefined ? gl.LINES : primitive);
		this.last_mesh = mesh;
		return mesh;
	},

	renderText: function(text)
	{
		if(!Draw.text_atlas)
			this.createTextAtlas();
		var atlas = this.text_atlas;
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


	createTextAtlas: function()
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

		this.text_atlas = GL.Texture.fromImage(canvas, {magFilter: gl.NEAREST, minFilter: gl.LINEAR} );
		this.text_atlas.atlas = atlas;
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
		this.model_matrix = new Float32Array(this.stack.buffer,this.model_matrix.byteOffset + 16*4,16*4);
		mat4.copy(this.model_matrix, old);
	},

	pop: function()
	{
		if(this.model_matrix.byteOffset == 0)
			throw("too many pops");
		this.model_matrix = new Float32Array(this.stack.buffer,this.model_matrix.byteOffset - 16*4,16*4);
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
		else
			mat4.scale(this.model_matrix,this.model_matrix,x);
	},

	translate: function(x,y,z)
	{
		if(arguments.length == 3)
			mat4.translate(this.model_matrix,this.model_matrix,[x,y,z]);
		else
			mat4.translate(this.model_matrix,this.model_matrix,x);
	},

	rotate: function(angle, x,y,z)
	{
		if(arguments.length == 4)
			mat4.rotate(this.model_matrix, this.model_matrix, angle * DEG2RAD, [x,y,z]);
		else
			mat4.rotate(this.model_matrix, this.model_matrix, angle * DEG2RAD, x);
	},

	lookAt: function(position, target, up)
	{
		mat4.lookAt(this.model_matrix, position, target, up);
		mat4.invert(this.model_matrix, this.model_matrix);
	},

	project: function( position, dest )
	{
		dest = dest || vec3.create();
		return mat4.multiplyVec3(dest, this.mvp_matrix, position);
	}
};
/* **************************************************************
  Octree generator for fast ray triangle collision with meshes
  Dependencies: glmatrix.js (for vector and matrix operations)
****************************************************************/

function HitTest(t, hit, normal) {
  this.t = arguments.length ? t : Number.MAX_VALUE;
  this.hit = hit;
  this.normal = normal;
}

HitTest.prototype = {
  mergeWith: function(other) {
    if (other.t > 0 && other.t < this.t) {
      this.t = other.t;
      this.hit = other.hit;
      this.normal = other.normal;
    }
  }
};


function Octree(mesh)
{
	this.root = null;
	this.total_depth = 0;
	this.total_nodes = 0;
	if(mesh)
	{
		this.buildFromMesh(mesh);
		this.total_nodes = this.trim();
	}
}

Octree.prototype = {
	MAX_OCTREE_TRIANGLES: 500,
	MAX_OCTREE_DEPTH: 8,
	OCTREE_MARGIN: 10,

	buildFromMesh: function(mesh)
	{
		this.total_depth = 0;
		this.total_nodes = 0;

		var vertices = mesh.vertices;
		var triangles = mesh.triangles;

		var root = this.computeAABB(vertices);
		this.root = root;
		this.total_nodes = 1;

		root.min = [root.min[0] - this.OCTREE_MARGIN, root.min[1] - this.OCTREE_MARGIN, root.min[2] - this.OCTREE_MARGIN];
		root.max = [root.max[0] + this.OCTREE_MARGIN*0.9, root.max[1] + this.OCTREE_MARGIN*0.9, root.max[2] + this.OCTREE_MARGIN*0.9];
		root.faces = [];
		root.inside = 0;

		//indexed
		if(triangles)
		{
			for(var i = 0; i < triangles.length; i+=3)
			{
				var face = new Float32Array([vertices[triangles[i]*3], vertices[triangles[i]*3+1],vertices[triangles[i]*3+2],
							vertices[triangles[i+1]*3], vertices[triangles[i+1]*3+1],vertices[triangles[i+1]*3+2],
							vertices[triangles[i+2]*3], vertices[triangles[i+2]*3+1],vertices[triangles[i+2]*3+2]]);
				this.addToNode(face,root,0);
				//if(i%3000 == 0) trace("Tris: " + i);
			}
		}
		else
		{
			for(var i = 0; i < vertices.length; i+=9)
			{
				var face = new Float32Array( vertices.subarray(i,i+9) );
				this.addToNode(face,root,0);
				//if(i%3000 == 0) trace("Tris: " + i);
			}
		}

		return root;
	},

	addToNode: function(face,node, depth)
	{
		node.inside += 1;

		//has children
		if(node.c)
		{
			var aabb = this.computeAABB(face);
			var added = false;
			for(var i in node.c)
			{
				var child = node.c[i];
				if (this.isInsideAABB(aabb,child))
				{
					this.addToNode(face,child, depth+1);
					added = true;
					break;
				}
			}
			if(!added)
			{
				if(node.faces == null) node.faces = [];
				node.faces.push(face);
			}
		}
		else //add till full, then split
		{
			if(node.faces == null) node.faces = [];
			node.faces.push(face);

			//split
			if(node.faces.length > this.MAX_OCTREE_TRIANGLES && depth < this.MAX_OCTREE_DEPTH)
			{
				this.splitNode(node);
				if(this.total_depth < depth + 1)
					this.total_depth = depth + 1;

				var faces = node.faces.concat();
				node.faces = null;

				//redistribute all nodes
				for(var i in faces)
				{
					var face = faces[i];
					var aabb = this.computeAABB(face);
					var added = false;
					for(var j in node.c)
					{
						var child = node.c[j];
						if (this.isInsideAABB(aabb,child))
						{
							this.addToNode(face,child, depth+1);
							added = true;
							break;
						}
					}
					if (!added)
					{
						if(node.faces == null) node.faces = [];
						node.faces.push(face);
					}
				}
			}
		}
	},

	octree_pos_ref: [[0,0,0],[0,0,1],[0,1,0],[0,1,1],[1,0,0],[1,0,1],[1,1,0],[1,1,1]],

	splitNode: function(node)
	{
		node.c = [];
		var half = [(node.max[0] - node.min[0]) * 0.5, (node.max[1] - node.min[1]) * 0.5, (node.max[2] - node.min[2]) * 0.5];

		for(var i in this.octree_pos_ref)
		{
			var ref = this.octree_pos_ref[i];

			var newnode = {};
			this.total_nodes += 1;

			newnode.min = [ node.min[0] + half[0] * ref[0],  node.min[1] + half[1] * ref[1],  node.min[2] + half[2] * ref[2]];
			newnode.max = [newnode.min[0] + half[0], newnode.min[1] + half[1], newnode.min[2] + half[2]];
			newnode.faces = null;
			newnode.inside = 0;
			node.c.push(newnode);
		}
	},

	isInsideAABB: function(a,b)
	{
		if(a.min[0] < b.min[0] || a.min[1] < b.min[1] || a.min[2] < b.min[2] ||
			a.max[0] > b.max[0] || a.max[1] > b.max[1] || a.max[2] > b.max[2])
			return false;
		return true;
	},

	computeAABB: function(vertices)
	{
		var min = [ vertices[0], vertices[1], vertices[2] ];
		var max = [ vertices[0], vertices[1], vertices[2] ];

		for(var i = 0; i < vertices.length; i+=3)
		{
			for(var j = 0; j < 3; j++)
			{
				if(min[j] > vertices[i+j]) 
					min[j] = vertices[i+j];
				if(max[j] < vertices[i+j]) 
					max[j] = vertices[i+j];
			}
		}

		var r = {min: min, max: max};
		return r;
	},

	trim: function(node)
	{
		node = node || this.root;
		if(!node.c)
			return 1;

		var num = 1;
		var valid = [];
		for(var i in node.c)
		{
			if(node.c[i].inside)
			{
				valid.push(node.c[i]);
				num += this.trim(node.c[i]);
			}
		}
		node.c = valid;
		return num;
	},

	hitTestBox: function(origin, ray, box_min, box_max) {
		var tMin = vec3.subtract( vec3.create(), box_min, origin );
		var tMax = vec3.subtract( vec3.create(), box_max, origin );
		
		if(	vec3.maxValue(tMin) < 0 && vec3.minValue(tMax) > 0)
			return new HitTest(0,origin,ray);

		vec3.multiply(tMin, tMin, [1/ray[0],1/ray[1],1/ray[2]]);
		vec3.multiply(tMax, tMax, [1/ray[0],1/ray[1],1/ray[2]]);
		var t1 = vec3.min(vec3.create(), tMin, tMax);
		var t2 = vec3.max(vec3.create(), tMin, tMax);
		var tNear = vec3.maxValue(t1);
		var tFar = vec3.minValue(t2);

		if (tNear > 0 && tNear < tFar) {
			var epsilon = 1.0e-6, hit = vec3.add( vec3.create(), vec3.scale(vec3.create(), ray, tNear ), origin);
			vec3.add(box_min, box_min,[epsilon,epsilon,epsilon]);
			vec3.subtract(box_min, box_min,[epsilon,epsilon,epsilon]);
			return new HitTest(tNear, hit, vec3.create([
			  (hit[0] > box_max[0]) - (hit[0] < box_min[0]),
			  (hit[1] > box_max[1]) - (hit[1] < box_min[1]),
			  (hit[2] > box_max[2]) - (hit[2] < box_min[2]) ]));
		}

		return null;
	},

	tested_boxes: 0,
	tested_triangles: 0,
	testRay: function(start, direction, dist_min, dist_max)
	{
		start = vec3.clone(start);
		direction = vec3.clone(direction);
		//direction = direction.unit();
		Octree.prototype.tested_boxes = 0;
		Octree.prototype.tested_triangles = 0;

		if(!this.root)
		{
			throw("Error: octree not build");
		}

		window.hitTestBox = this.hitTestBox;
		window.hitTestTriangle = this.hitTestTriangle;
		window.testRayInNode = Octree.prototype.testRayInNode;

		var test = hitTestBox( start, direction, vec3.clone(this.root.min), vec3.clone(this.root.max) );
		if(!test) //no collision with mesh bounding box
			return null;

		var test = testRayInNode(this.root,start,direction);
		if(test != null)
		{
			var pos = vec3.scale( vec3.create(), direction, test.t );
			vec3.add( pos, pos, start );
			return pos;
		}

		delete window["hitTestBox"];
		delete window["hitTestTriangle"];
		delete window["testRayInNode"];

		return null;
	},

	testRayInNode: function(node, start, direction)
	{
		var test = null;
		var prev_test = null;
		Octree.prototype.tested_boxes += 1;

		//test faces
		if(node.faces)
			for(var i in node.faces)
			{
				var face = node.faces[i];
				
				Octree.prototype.tested_triangles += 1;
				test = hitTestTriangle(start,direction, vec3.fromValues(face[0],face[1],face[2]) , vec3.fromValues(face[3],face[4],face[5]), vec3.fromValues(face[6],face[7],face[8]) );
				if (test==null)
					continue;
				if(prev_test)
					prev_test.mergeWith(test);
				else
					prev_test = test;
			}

		//test children nodes faces
		var child;
		if(node.c)
			for(var i in node.c)
			{
				child = node.c[i];
				//test with node box
				test = hitTestBox( start, direction, vec3.clone(child.min), vec3.clone(child.max) );
				if( test == null )
					continue;

				//nodebox behind current collision, then ignore node
				if(prev_test && test.t > prev_test.t)
					continue;

				//test collision with node
				test = testRayInNode(child, start, direction);
				if(test == null)
					continue;

				if(prev_test)
					prev_test.mergeWith(test);
				else
					prev_test = test;
			}

		return prev_test;
	},

	hitTestTriangle: function(origin, ray, a, b, c) {
		var ab = vec3.subtract( vec3.create(), b,a );
		var ac = vec3.subtract( vec3.create(), c,a );
		var normal = vec3.cross( vec3.create(), ab, ac );
		vec3.normalize( normal, normal );
		if( vec3.dot(normal,ray) > 0) return; //ignore backface

		var t = vec3.dot(normal, vec3.subtract( vec3.create(), a, origin )) / vec3.dot(normal,ray);

	  if (t > 0) {
		var hit = vec3.scale(vec3.create(), ray, t);
		vec3.add(hit, hit, origin);
		var toHit = vec3.subtract( vec3.create(), hit,a );
		var dot00 = vec3.dot(ac,ac);
		var dot01 = vec3.dot(ac,ab);
		var dot02 = vec3.dot(ac,toHit);
		var dot11 = vec3.dot(ab,ab);
		var dot12 = vec3.dot(ab,toHit);
		var divide = dot00 * dot11 - dot01 * dot01;
		var u = (dot11 * dot02 - dot01 * dot12) / divide;
		var v = (dot00 * dot12 - dot01 * dot02) / divide;
		if (u >= 0 && v >= 0 && u + v <= 1) return new HitTest(t, hit, normal);
	  }

	  return null;
	}
};

/* Basic shader manager 
	- Allows to load all shaders from XML
	- Allows to use a global shader
	Dependencies: 
		- graphicsViewport.js
*/

var Shaders = {
	shaders: {},
	globals: {},
	default_shader: null,

	init: function(url, ignore_cache)
	{
		//set a default shader 
		this.shaders = {};
		this.globals = {};
		this.default_shader = null;

		this.global_extra_code = String.fromCharCode(10) + "#define WEBGL" + String.fromCharCode(10);

		this.createDefaultShaders();
		this.default_shader = this.get("flat");

		url = url ||"data/shaders.xml";
		this.last_shaders_url = url;
		this.loadFromXML(url, false, ignore_cache);
	},

	reloadShaders: function(on_complete)
	{
		this.loadFromXML( this.last_shaders_url, true,true, on_complete);
	},

	get: function(id, macros)
	{
		if(!id) return null;

		//if there is no macros, just get the old one
		if(!macros)
		{
			var shader = this.shaders[id];
			if (shader != null)
				return shader;
		}

		var global = this.globals[id];

		if (global == null)
			return this.default_shader;

		var key = id;
		var extracode = "";

		if(global.num_macros != 0)
		{
			//generate unique key
			if(macros)
			{
				key += ":";
				for (var macro in macros)
				{
					if (global.macros[ macro ])
					{
						key += macro + "=" + macros[macro] + ":";
						extracode += String.fromCharCode(10) + "#define " + macro + " " + macros[macro] + String.fromCharCode(10);
					}
				}
			}
		}

		//already compiled
		if (this.shaders[key] != null)
			return this.shaders[key];

		//compile and store it
		var vs_code = extracode + global.vs_code;
		var ps_code = extracode + global.ps_code;

		var shader = this.compileShader(vs_code, ps_code, key);
		if(shader)
			shader.global = global;
		return this.registerShader(shader, key, id);
	},

	getGlobalShaderInfo: function(id)
	{
		return this.globals[id];
	},

	compileShader: function(vs_code, ps_code, name)
	{
		if(!gl) return null;
		var shader = null;
		try
		{
			shader = new GL.Shader(this.global_extra_code + vs_code, this.global_extra_code + ps_code);
			shader.name = name;
			trace("Shader compiled: " + name);
		}
		catch (err)
		{
			trace("Error compiling shader: " + name);
			trace(err);
			trace("VS CODE\n************");
			var lines = (this.global_extra_code + vs_code).split("\n");
			for(var i in lines)
				trace(i + ": " + lines[i]);

			trace("PS CODE\n************");
			lines = (this.global_extra_code + ps_code).split("\n");
			for(var i in lines)
				trace(i + ": " + lines[i]);

			return null;
		}
		return shader;
	},

	// given a compiled shader it caches it for later reuse
	registerShader: function(shader, key, id)
	{
		if(shader == null)
		{
			this.shaders[key] = this.default_shader;
			return this.default_shader;
		}

		shader.id = id;
		shader.key = key;
		this.shaders[key] = shader;
		return shader;
	},

	loadFromXML: function (url, reset_old, ignore_cache, on_complete)
	{
		var nocache = ignore_cache ? "?nocache=" + new Date().getTime() + Math.floor(Math.random() * 1000) : "";
		LS.request({
		  url: url + nocache,
		  dataType: 'xml',
		  success: function(response){
				trace("Shaders XML loaded");
				if(reset_old)
				{
					Shaders.globals = {};
					Shaders.shaders = {};
				}
				Shaders.processShadersXML(response);
				if(on_complete)
					on_complete();
		  },
		  error: function(err){
			  trace("Error parsing Shaders XML: " + err);
			  throw("Error parsing Shaders XML: " + err);
		  }
		});	
	},

	processShadersXML: function(xml)
	{
		var shaders = xml.querySelectorAll('shader');
		
		for(var i in shaders)
		{
			var shader_element = shaders[i];
			if(!shader_element || !shader_element.attributes) continue;

			var id = shader_element.attributes["id"];
			if(!id) continue;
			id = id.value;

			var vs_code = "";
			var ps_code = "";
			var macros = shader_element.attributes["macros"];
			if(macros)
				macros = macros.value.split(",");

			var _macros = {};
			for(var i in macros)
				_macros[macros[i]] = true;

			vs_code = shader_element.querySelector("code[type='vertex_shader']").textContent;
			ps_code = shader_element.querySelector("code[type='pixel_shader']").textContent;

			if(!vs_code || !ps_code)
			{
				trace("no code in shader: " + id);
				continue;
			}

			var multipass = shader_element.attributes["multipass"];
			if(multipass)
				multipass = (multipass.value == "1" || multipass.value == "true");
			else
				multipass = false;

			Shaders.addGlobalShader(vs_code,ps_code,id,_macros, multipass);
		}
	},
	
	//adds source code of a shader that could be compiled if needed
	//id: name
	//macros: supported macros by the shader
	addGlobalShader: function(vs_code, ps_code, id, macros, multipass )
	{
		var macros_found = {};
		/*
		//TODO: missing #ifndef and #define
		//regexMap( /USE_\w+/g, vs_code + ps_code, function(v) {
		regexMap( /#ifdef\s\w+/g, vs_code + ps_code, function(v) {
			//trace(v);
			macros_found[v[0].split(' ')[1]] = true;
		});
		*/
		/*
		var m = /USE_\w+/g.exec(vs_code + ps_code);
		if(m)
			trace(m);
		*/

		var num_macros = 0;
		for(var i in macros)
			num_macros += 1;

		var global = { 
			vs_code: vs_code, 
			ps_code: ps_code,
			macros: macros,
			num_macros: num_macros,
			macros_found: macros_found,
			multipass: multipass
		};
		this.globals[id] = global;
		return global;
	},

	common_vscode: "\n\
		precision mediump float;\n\
		attribute vec3 a_vertex;\n\
		attribute vec3 a_normal;\n\
		attribute vec2 a_coord;\n\
		uniform mat4 u_mvp;\n\
	",
	common_pscode: "\n\
		precision mediump float;\n\
	",

	//some default shaders for starters
	createDefaultShaders: function()
	{
		//flat
		this.addGlobalShader(this.common_vscode + '\
			void main() {\
				gl_Position = u_mvp * vec4(a_vertex,1.0);\
			}\
			', this.common_pscode + '\
			uniform vec4 u_material_color;\
			void main() {\
			  gl_FragColor = vec4(u_material_color);\
			}\
		',"flat");

		//flat texture
		this.addGlobalShader(this.common_vscode + '\
			varying vec2 v_uvs;\
			void main() {\n\
				v_uvs = a_coord;\n\
				gl_Position = u_mvp * vec4(a_vertex,1.0);\
			}\
			', this.common_pscode + '\
			uniform vec4 u_material_color;\
			varying vec2 v_uvs;\
			uniform sampler2D texture;\
			void main() {\
				gl_FragColor = u_material_color * texture2D(texture,v_uvs);\
			}\
		',"texture_flat");

		//object space normals
		/*
		this.addGlobalShader(this.common_vscode + '\
			uniform mat4 u_normal_model;\n\
			varying vec3 v_normal;\n\
			\
			void main() {\
				v_normal = u_normal_model * vec3(a_normal,1.0);\n\
				gl_Position = u_mvp * vec4(a_vertex,1.0);\n\
			}\
			', this.common_pscode + '\
			varying vec3 v_normal;\
			void main() {\
				vec3 N = normalize(v_normal);\
				gl_FragColor = vec4(N.x, N.y, N.z, 1.0);\
			}\
		',"normal");
		*/

		this.addGlobalShader(this.common_vscode + '\
			varying vec2 coord;\
			void main() {\
			coord = a_coord;\
			gl_Position = vec4(coord * 2.0 - 1.0, 0.0, 1.0);\
		}\
		', this.common_pscode + '\
			uniform sampler2D texture;\
			uniform vec4 color;\
			varying vec2 coord;\
			void main() {\
			gl_FragColor = texture2D(texture, coord) * color;\
			}\
		',"screen");
		//this.shaders["screen"].uniforms({color: [1,1,1,1]});

		this.addGlobalShader(this.common_vscode + '\
			varying vec4 v_pos;\
			void main() {\
				gl_Position = u_mvp * vec4(a_vertex,1.0);\
				v_pos = gl_Position;\
			}\
			', this.common_pscode + '\
			precision highp float;\
			varying vec4 v_pos;\
			vec3 PackDepth24(float depth)\
			{\
				float depthInteger = floor(depth);\
				float depthFraction = fract(depth);\
				float depthUpper = floor(depthInteger / 256.0);\
				float depthLower = depthInteger - (depthUpper * 256.0);\
				return vec3(depthUpper / 256.0, depthLower / 256.0, depthFraction);\
			}\
			\
			uniform vec4 u_material_color;\
			void main() {\
				vec4 color = vec4(0.0);\
				color.x = u_material_color.x; \
				float depth = v_pos.z / v_pos.w;\
			    color.yzw = PackDepth24(depth*256.0);\
			  gl_FragColor = color;\
			}\
		',"picking_depth");


	}
};


//Global Scope
function trace(msg) { if (typeof(console) != "undefined") { console.log(msg); } };
function toArray(v) { return Array.apply( [], v ); }

/**
* LS is the global scope for the global functions and containers of LiteScene
*
* @class  LS
* @namespace  LS
*/

var LS = {
	_last_uid: 0,
	generateUId: function () { return this._last_uid++; },

	/**
	* Contains all the registered components
	* 
	* @property Components
	* @type {Object}
	* @default {}
	*/
	Components: {},

	/**
	* Register a component so it is listed when searching for new components to attach
	*
	* @method registerComponent
	* @param {ComponentClass} comp component class to register
	*/
	registerComponent: function(comp) { 
		for(var i in arguments)
		{
			//register
			this.Components[ getClassName(arguments[i]) ] = arguments[i]; 
			//default methods
			if(!comp.prototype.serialize) comp.prototype.serialize = LS._serialize;
			if(!comp.prototype.configure) comp.prototype.configure = LS._configure;
			//event
			LEvent.trigger(LS,"component_registered",arguments[i]); 
		}
	},

	_configure: function(o) { LS.cloneObject(o, this); },
	_serialize: function() { return LS.cloneObject(this); },

	/**
	* A front-end for XMLHttpRequest so it is simpler and more cross-platform
	*
	* @method request
	* @param {Object} request object with the fields for the request: 
    *			dataType: result type {text,xml,json,binary,arraybuffer,image}, data: object with form fields, callbacks supported: {success, error, progress}
	* @return {XMLHttpRequest} the XMLHttpRequest of the petition
	*/
	request: function(request)
	{
		var dataType = request.dataType || "text";
		if(dataType == "json") //parse it locally
			dataType = "text";
		else if(dataType == "xml") //parse it locally
			dataType = "text";
		else if (dataType == "binary")
		{
			//request.mimeType = "text/plain; charset=x-user-defined";
			dataType = "arraybuffer";
			request.mimeType = "application/octet-stream";
		}	
		else if(dataType == "image") //special case: images are loaded using regular images request
		{
			var img = new Image();
			img.onload = function() {
				if(request.success)
					request.success.call(this);
			};
			img.onerror = request.error;
			img.src = request.url;
			return img;
		}

		//regular case, use AJAX call
        var xhr = new XMLHttpRequest();
        xhr.open(request.data ? 'POST' : 'GET', request.url, true);
        if(dataType)
            xhr.responseType = dataType;
        if (request.mimeType)
            xhr.overrideMimeType( request.mimeType );
        xhr.onload = function(load)
		{
			var response = this.response;
			if(request.dataType == "json") //chrome doesnt support json format
			{
				try
				{
					response = JSON.parse(response);
				}
				catch (err)
				{
					if(request.error)
						request.error(err);
				}
			}
			else if(request.dataType == "xml")
			{
				try
				{
					var xmlparser = new DOMParser();
					response = xmlparser.parseFromString(response,"text/xml");
				}
				catch (err)
				{
					if(request.error)
						request.error(err);
				}
			}
			if(request.success)
				request.success.call(this, response);
		};
        xhr.onerror = request.error;
        xhr.send(request.data);
		return xhr;

		//return $.ajax(request);
	}
};

/**
* copy the properties of one class into another class
* @method extendClass
* @param {Class} origin
* @param {Class} target
*/

function extendClass( origin, target ) {
	for(var i in origin) //copy class properties
		target[i] = origin[i];
	if(origin.prototype) //copy prototype properties
		for(var i in origin.prototype)
			target.prototype[i] = origin.prototype[i];
}
LS.extendClass = extendClass;

/**
* Clones an object (no matter where the object came from)
* - It skip attributes starting with "_" or "jQuery" or functions
* - to the rest it applies JSON.parse( JSON.stringify ( obj ) )
* - use it carefully
* @method cloneObject
* @param {Object} object the object to clone
* @param {Object} target=null optional, the destination object
* @return {Object} returns the cloned object
*/
function cloneObject(object, target)
{
	var o = target || {};
	for(var i in object)
	{
		if(i[0] == "_" || i.substr(0,6) == "jQuery") //skip vars with _ (they are private)
			continue;

		var v = object[i];
		if(v == null)
			o[i] = null;			
		else if ( isFunction(v) )
			continue;
		else if (typeof(v) == "number" || typeof(v) == "string")
			o[i] = v;
		else if( v.constructor == Float32Array ) //typed arrays are ugly when serialized
			o[i] = Array.apply( [], v ); //clone
		else if ( isArray(v) )
		{
			if( o[i] && o[i].constructor == Float32Array ) //reuse old container
				o[i].set(v);
			else
				o[i] = v.slice(0); //clone array
		}
		else //slow but safe
			o[i] = JSON.parse( JSON.stringify(v) );
	}
	return o;
}
LS.cloneObject = cloneObject;

/**
* Returns an object class name (uses the constructor toString)
* @method getObjectClassName
* @param {Object} the object to see the class name
* @return {String} returns the string with the name
*/
function getObjectClassName(obj) {
    if (obj && obj.constructor && obj.constructor.toString) {
        var arr = obj.constructor.toString().match(
            /function\s*(\w+)/);

        if (arr && arr.length == 2) {
            return arr[1];
        }
    }
    return undefined;
}
LS.getObjectClassName = getObjectClassName;

function getClassName(obj) {
    if (obj && obj.toString) {
        var arr = obj.toString().match(
            /function\s*(\w+)/);

        if (arr && arr.length == 2) {
            return arr[1];
        }
    }
    return undefined;
}
LS.getClassName = getClassName;


/**
* Static class that contains all the resources loaded, parsed and ready to use.
* It also contains the parsers and methods in charge of processing them
*
* @class ResourcesManager
* @constructor
*/

// **** RESOURCES MANANGER *********************************************
// Resources should follow the text structure
// + id: if stored in remote server
// + resource_type: string ("Mesh","Texture",...) or if omitted the classname will be used
// + filename: string
// + fullpath: the full path to reach the file on the server (folder + filename)
// + preview: img
// + toBinary: generates a binary version to store on the server
// + serialize: generates an stringifible object to store on the server

var ResourcesManager = {

	path: "", //url to retrieve resources relative to the index.html
	ignore_cache: false, //change to true to ignore server cache
	free_data: false, //free all data once it has been uploaded to the VRAM

	resources: {}, //filename associated to a resource (texture,meshes,audio,script...)

	meshes: {}, //loadead meshes
	textures: {}, //loadead textures

	resources_being_loaded: {}, //resources waiting to be loaded
	num_resources_being_loaded: 0,
	MAX_TEXTURE_SIZE: 4096,

	formats: {"js":"text", "json":"json", "xml":"xml", "jpg":"image", "png":"image", "bmp":"image" },
	resource_parsers: {}, //in charge or converting a file in a resource

	/**
	* Returns a string to append to any url that should use the browser cache (when updating server info)
	*
	* @method getNoCache
	* @param {Boolean} force force to return a nocache string ignoring the default configuration
	* @return {String} a string to attach to a url so the file wont be cached
	*/

	getNoCache: function(force) { return (!this.ignore_cache && !force) ? "" : "?nocache=" + new Date().getTime() + Math.floor(Math.random() * 1000); },

	/**
	* Resets all the resources cached, so it frees the memory
	*
	* @method reset
	*/
	reset: function()
	{
		this.resources = {};
		this.meshes = {};
		this.textures = {};
	},

	/**
	* Returns the filename extension from an url
	*
	* @method getExtension
	* @param {String} url
	* @return {String} filename extension
	*/

	getExtension: function(url)
	{
		var point = url.lastIndexOf(".");
		if(point == -1) return "";
		var question = url.lastIndexOf("?");
		question = (question == -1 ? url.length : (question - 1) ) - point;
		return url.substr(point+1,question).toLowerCase();
	},

	/**
	* Loads a generic resource, the type will be inferet from the extension
	*
	* @method load
	* @param {String} url where the resource is located (if its a relative url it depends on the path attribute)
	* @param {Object}[options={}] options to apply to the loaded image
	* @param {Function} [on_complete=null] callback when the resource is loaded and cached
	*/

	load: function(url, options, on_complete)
	{
		options = options || {};
		if(this.resources[url] != null)
		{
			if(on_complete)
				on_complete(this.resources[url]);
			return true;
		}

		//already being loaded
		if(this.resources_being_loaded[url] != null)
		{
			this.resources_being_loaded[url].push( {options: options, callback: on_complete} );
			return;
		}

		//load a new one
		this.resources_being_loaded[url] = [{options: options, callback: on_complete}];
		if(this.num_resources_being_loaded == 0)
			LEvent.trigger(ResourcesManager,"start_loading_resources",url);
			//$(ResourcesManager).trigger("start_loading_resources", url);
		this.num_resources_being_loaded++;

		var pos = url.lastIndexOf(".")+1;
		var extension = url.substr(pos,url.length).toLowerCase();

		var full_url = "";
		if(url.substr(0,7) == "http://")
			full_url = url;
		else
		{
			if(options.local_repository)
				full_url = options.local_repository + "/" + url;
			else
				full_url = this.path + url;
		}

		if(options.force_local_url)
			full_url = url;

		var nocache = this.getNoCache();

		//ajax call
		var settings = {
			url: full_url + nocache,
			success: function(response){
				var res = ResourcesManager.processResource(url,response,options);
				ResourcesManager._resource_loaded_success(url,res); //triggers the on_complete
			},
			error: function(err) { 	ResourcesManager._resource_loaded_error(url,err); }
		};

		var extension = this.getExtension(url);
		var file_format = this.formats[ extension ];
		if(!file_format) file_format = "text";
		settings.dataType = file_format;
		LS.request(settings); //ajax call
		return false;
	},

	/**
	* Process resource (most cases to upload it to the GPU)
	*
	* @method processResource
	* @param {String} url where the resource is located (if its a relative url it depends on the path attribute)
	* @param {*} data the data of the resource (could be string, arraybuffer, image... )
	* @param {Object}[options={}] options to apply to the loaded resource
	*/

	processResource: function(url, data, options)
	{
		var resource = null;
		if(data.object_type && window[ data.object_type ] )
			resource = new window[ data.object_type ](data);

		if(resource)
		{
			if(!resource.fullpath)
				resource.fullpath = url;

			if(resource.getResources) //associate resources
			{
				ResourcesManager.loadResources( resource.getResources({}) );
			}

			this.registerResource(url,resource);
			return resource;
		}

		trace("Unknown resource loaded");
	},
	
	/**
	* Loads a Mesh from url (in case it is already cached it skips the loading)
	*
	* @method loadMesh
	* @param {String} url where the mesh is located (if its a relative url it depends on the path attribute
	* @param {Object}[options={}] options to apply to the loaded image
	* @param {Function} [on_complete=null] callback when the mesh is loaded and cached
	*/

	loadMesh: function(url, options, on_complete)
	{
		options = options || {};

		if(this.meshes[url] != null)
		{
			if(on_complete)
				on_complete(this.meshes[url]);
			return true;
		}

		//already being loaded
		if(this.resources_being_loaded[url] != null)
		{
			this.resources_being_loaded[url].push( {options: options, callback: on_complete} );
			return;
		}

		//load a new one
		this.resources_being_loaded[url] = [{options: options, callback: on_complete}];
		if(this.num_resources_being_loaded == 0)
			LEvent.trigger(ResourcesManager,"start_loading_resources",url);
			//$(ResourcesManager).trigger("start_loading_resources", url);
		this.num_resources_being_loaded++;

		var pos = url.lastIndexOf(".")+1;
		var extension = url.substr(pos,url.length).toLowerCase();

		var full_url = "";
		if(url.substr(0,7) == "http://")
			full_url = url;
		else
		{
			if(options.local_repository)
				full_url = options.local_repository + "/" + url;
			else
				full_url = this.path + url;
		}

		if(options.force_local_url)
			full_url = url;

		var nocache = this.getNoCache();

		//ajax call
		var settings = {
			url: full_url + nocache,
			success: function(response){
				var mesh = ResourcesManager.processMesh(url,response,options);
				ResourcesManager._resource_loaded_success(url,mesh);
			},
			error: function(err) { 	ResourcesManager._resource_loaded_error(url,err); }
		};

		var res_info = Parser.getResourceInfo(url);

		settings.dataType = "text";
		if(res_info.format == Parser.JSON_FORMAT)
			settings.dataType = 'json';
		else if(res_info.format == Parser.XML_FORMAT)
			settings.dataType = 'xml';
		else if(res_info.format == Parser.BINARY_FORMAT)
			settings.dataType = 'binary';
		/*
		else if(res_info.format == Parser.BINARY_FORMAT) //force binary type
		{
			settings.dataType = null;
			//settings.mimeType = "text/plain; charset=x-user-defined";
			settings.mimeType = "application/octet-stream";
		}
		*/

		LS.request(settings);
		return false;
	},

	/**
	* Takes mesh raw data and creates a propper Mesh instance (uploads to GPU), caches it and launch the associated events
	*
	* @method processMesh
	* @param {String} filename the filename to process this raw data
	* @param {Object} data raw data of the mesh
	* @return {Object} the mesh instance
	*/

	processMesh: function(filename, data, options)
	{
		options = options || {};
		if(!gl) return null;

		//obtain info about the resource (extension, type of res, etc)
		var res_info = Parser.getResourceInfo(filename);

		var mesh_data = null;

		if(options.ignore_parser)
			mesh_data = data;
		else
			mesh_data = Parser.parse(filename, data, options);

		if(mesh_data == null)
		{
			throw ("Error parsing mesh: " + filename);
		}

		filename = options.name || filename; //used to rename AFTER parsing (otherwise parser can get the format wrong)

		var mesh = GL.Mesh.load(mesh_data);
		mesh.object_type = "Mesh"; //useful
		mesh.info = mesh_data.info; //save extra info like bounding
		mesh.metadata = {};
		mesh.filename = filename;
		mesh.generateMetadata(); //useful
		if(!mesh.bounding)
			mesh.computeBounding();

		if(this.free_data) //free buffers to reduce memory usage
			mesh.freeData();

		//save mesh in manager
		this.registerResource(filename,mesh);
		return mesh;
	},

	/**
	* Loads an Image from the internet and calls processImage (it the image is already loaded it skips the loading)
	*
	* @method loadImage
	* @param {String} url where the mesh is located (if its a relative url it depends on the path attribute
	* @param {Function} [on_complete=null] callback when the image is loaded, uploaded to GPU and cached
	* @param {Object}[options={}] options to apply to the loaded image
	*/

	loadImage: function(url, options, on_complete)
	{
		options = options || {};
		if(this.textures[url] != null) //reuse old version
		{
			if(on_complete)
				on_complete(this.textures[url]);
			return true;
		}

		//already being loaded
		if(this.resources_being_loaded[url] != null)
		{
			this.resources_being_loaded[url].push( {options: null, callback: on_complete} );
			return;
		}

		this.resources_being_loaded[url] = [{options: null, callback: on_complete}];
		if(this.num_resources_being_loaded == 0)
			LEvent.trigger(ResourcesManager,"start_loading_resources", url);
			//$(ResourcesManager).trigger("start_loading_resources", url);
		this.num_resources_being_loaded++;

		var full_url = "";
		if(url.substr(0,7) == "http://" || url.substr(0,8) == "https://" || options.force_local_url)
			full_url = url;
		else
		{
			if(options.local_repository)
				full_url = options.local_repository + "/" + url;
			else
				full_url = this.path + url;
		}

		var nocache = this.getNoCache();

		trace("Processing image: " + url);
		var res_info = Parser.getResourceInfo(url);
		if(res_info.type == Parser.IMAGE_DATA)
		{
			var img = new Image();
			img.type = 'IMG';
			img.onload = function()
			{
				this.onload = null;
				this.filename = url;
				if(options.flipY) this.flipY = options.flipY;
				var texture = ResourcesManager.processImage(url,this, options);
				ResourcesManager._resource_loaded_success(url,texture);
			}

			//img.onprogress = function(e) { trace("Image: " + url + "    " + e); }
			img.onerror = function(err) { ResourcesManager._resource_loaded_error(url,err); }

			img.src = full_url + nocache;
		}
		else if (res_info.type == Parser.NONATIVE_IMAGE_DATA)
		{
			var full_url = this.path + url;
			var nocache = this.getNoCache();

			LS.request({
				url: full_url + nocache,
				dataType: "binary",
				success: function(response){
					var img = Parser.parse(url, response);
					var texture = null;
					if (img) {
						texture = ResourcesManager.processImage(url,img, options);
						ResourcesManager._resource_loaded_success(url,texture);
					}
					delete ResourcesManager.resources_being_loaded[url];
				},
				error: function(err) { ResourcesManager._resource_loaded_error(url,err); }
			});
		}
		else
			ResourcesManager._resource_loaded_error(url,"Wront file format");

		return false;
	},

	/**
	* Takes image raw data and creates a propper Texture instance, caches it and launch the associated events
	*
	* @method processImage
	* @param {String} filename the filename to process this raw data
	* @param {Object} data raw data of the image (could be an Image tag or a Canvas tag)
	* @param {Object}[options={}] options to process the data
	* @return {Object} the Texture instance
	*/

	processImage: function(filename, img, options)
	{
		options = options || {};
		if(!gl) return null;

		if (img.width > this.MAX_TEXTURE_SIZE)
		{
			trace("too big, max is " + this.MAX_TEXTURE_SIZE);
			return null;
		}
		/*
		else if (img.width != img.height)
		{
			if(img.width != (img.height / 6) && (img.height % 6) != 0)
			{
				trace("Warning: Image must be square (same width and height)");
				//return null;
			}
		}
		else if ( ((Math.log(img.width) / Math.log(2)) % 1) != 0 || ((Math.log(img.height) / Math.log(2)) % 1) != 0)
		{
			trace("Image dimensions must be power of two (64,128,256,512)");
			return null;
		}
		*/

		if(img.constructor == Texture)
		{
			var texture = img;
			texture.filename = filename;
			this.registerResource(filename, texture);
			trace("DDS created");
		}
		else if(img.width == (img.height / 6)) //cubemap
		{
			var texture = Texture.cubemapFromImage(img, { wrapS: gl.MIRROR, wrapT: gl.MIRROR, magFilter: gl.LINEAR, minFilter: gl.LINEAR_MIPMAP_LINEAR });
			texture.img = img;
			texture.filename = filename;
			this.registerResource(filename, texture);
			trace("Cubemap created");
		}
		else //regular texture
		{
			var default_mag_filter = gl.LINEAR;
			//var default_min_filter = img.width == img.height ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR;
			var default_min_filter = gl.LINEAR_MIPMAP_LINEAR;
			if( !isPowerOfTwo(img.width) || !isPowerOfTwo(img.height) )
				default_min_filter = gl.LINEAR;
			var texture = null;

			//from TGAs...
			if(img.pixels)
				texture = GL.Texture.fromMemory(img.width, img.height, img.pixels, { format: (img.bpp == 24 ? gl.RGB : gl.RGBA), flipY: img.flipY, wrapS: gl.REPEAT, wrapT: gl.REPEAT, magFilter: default_mag_filter, minFilter: default_min_filter });
			else //RGBA because particles have alpha (PNGs)
				texture = GL.Texture.fromImage(img, { format: gl.RGBA, wrapS: gl.REPEAT, wrapT: gl.REPEAT, magFilter: default_mag_filter, minFilter: default_min_filter, flipY: img.flipY });
			texture.img = img;
			texture.filename = filename;
			this.registerResource(filename, texture);
		}

		texture.filename = filename;
		texture.generateMetadata(); //useful

		LEvent.trigger(Scene,"change");
		return texture;
	},

	/**
	* Loads all the resources in the Object (it uses an object to store not only the filename but also the type)
	*
	* @method loadResources
	* @param {Object} resources contains all the resources, associated with its type
	* @param {Object}[options={}] options to apply to the loaded resources
	*/

	loadResources: function(res, options)
	{
		for(var i in res)
		{
			if( typeof(i) != "string" || i[0] == ":" )
				continue;
		
			if(res[i] == Mesh)
				this.loadMesh( i, options );
			else if(res[i] == Texture)
				this.loadImage( i, options );
			else
				this.load(i, options );
		}
	},

	computeImageMetadata: function(texture)
	{
		var metadata = { width: texture.width, height: texture.height };
		return metadata;
	},

	/**
	* Stores the resource in the manager containers
	*
	* @method registerResource
	* @param {String} filename 
	* @param {Object} resource 
	*/

	registerResource: function(filename,res)
	{
		if(!res.object_type)
			res.object_type = getObjectClassName(res);
		var type = res.object_type;
		if(type == "Mesh")
			this.meshes[filename] = res;
		else if(type == "Texture")
			this.textures[filename] = res;
		else if(type == "Material")
			Scene.materials[filename] = res;
		else
			trace("Unknown res type: " + type);

		this.resources[filename] = res;
		LEvent.trigger(this,"resource_loaded", res);
	},

	/**
	* returns a mesh resource if it is loaded
	*
	* @method getMesh
	* @param {String} filename 
	* @return {Mesh}
	*/

	getMesh: function(name) {
		if(name != null) return this.meshes[name];
		return null;
	},

	/**
	* returns a texture resource if it is loaded
	*
	* @method getTexture
	* @param {String} filename 
	* @return {Texture} 
	*/

	getTexture: function(name) {
		if(name != null) return this.textures[name];
		return null;
	},

	//*************************************

	_resource_loaded_success: function(url,res)
	{
		//trace("RES: " + url + " ---> " + ResourcesManager.num_resources_being_loaded);
		for(var i in ResourcesManager.resources_being_loaded[url])
		{
			if(ResourcesManager.resources_being_loaded[url][i].callback != null)
				ResourcesManager.resources_being_loaded[url][i].callback(res);
		}
		if(ResourcesManager.resources_being_loaded[url])
		{
			delete ResourcesManager.resources_being_loaded[url];
			ResourcesManager.num_resources_being_loaded--;
			if( ResourcesManager.num_resources_being_loaded == 0)
				LEvent.trigger( ResourcesManager, "end_loading_resources");
		}
	},

	_resource_loaded_error: function(url, error)
	{
		trace("Error loading " + url);
		delete ResourcesManager.resources_being_loaded[url];
		LEvent.trigger( ResourcesManager, "resource_not_found", url);
		ResourcesManager.num_resources_being_loaded--;
		if( ResourcesManager.num_resources_being_loaded == 0 )
			LEvent.trigger( ResourcesManager, "end_loading_resources");
			//$(ResourcesManager).trigger("end_loading_resources");
	},

	//NOT TESTED: to load script asyncronously, not finished. similar to require.js
	require: function(files, on_complete)
	{
		if(typeof(files) == "string")
			files = [files];

		//store for the callback
		var last = files[ files.length - 1];
		if(on_complete)
		{
			if(!ResourcesManager._waiting_callbacks[ last ])
				ResourcesManager._waiting_callbacks[ last ] = [on_complete];
			else
				ResourcesManager._waiting_callbacks[ last ].push(on_complete);
		}
		require_file(files);

		function require_file(files)
		{
			//avoid require twice a file
			var url = files.shift(1); 
			while( ResourcesManager._required_files[url] && url )
				url = files.shift(1);

			ResourcesManager._required_files[url] = true;

			LS.request({
				url: url,
				success: function(response)
				{
					eval(response);
					if( ResourcesManager._waiting_callbacks[ url ] )
						for(var i in ResourcesManager._waiting_callbacks[ url ])
							ResourcesManager._waiting_callbacks[ url ][i]();
					require_file(files);
				}
			});
		}
	},
	_required_files: {},
	_waiting_callbacks: {}
};

LS.ResourcesManager = ResourcesManager;

//used to generate resources that doesnt come from files (procedural textures, meshes, etc)
//right now is not finished at all
var Generators = {
	generators: {},
	addGenerator: function(name,generator) { this.generators[name] = generator; },
	executeGenerator: function(data) {
		var generator = this.generators[data.action];
		if(!generator || typeof(generator) != "function") return null;
		try
		{
			var generated = generator(data);
			generated.generator = generator;
			return generated;
		}
		catch (err)
		{
			trace("Error in generator: " + err);
		}
		return null;
	}
};

LS.Generators = Generators;

/* MATH FUNCTIONS ************************************/

/**
* Samples a curve and returns the resulting value 
*
* @class LS
* @method getCurveValueAt
* @param {Array} values 
* @param {number} minx min x value
* @param {number} maxx max x value
* @param {number} defaulty default y value
* @param {number} x the position in the curve to sample
* @return {number}
*/
LS.getCurveValueAt = function(values,minx,maxx,defaulty, x)
{
	if(x < minx || x > maxx)
		return defaulty;

	var last = [ minx, defaulty ];
	var f = 0;
	for(var i = 0; i < values.length; i += 1)
	{
		var v = values[i];
		if(x == v[0]) return v[1];
		if(x < v[0])
		{
			f = (x - last[0]) / (v[0] - last[0]);
			return last[1] * (1-f) + v[1] * f;
		}
		last = v;
	}

	v = [ maxx, defaulty ];
	f = (x - last[0]) / (v[0] - last[0]);
	return last[1] * (1-f) + v[1] * f;
}

/**
* Resamples a full curve in values (useful to upload to GPU array)
*
* @method resampleCurve
* @param {Array} values 
* @param {number} minx min x value
* @param {number} maxx max x value
* @param {number} defaulty default y value
* @param {number} numsamples
* @return {Array}
*/

LS.resampleCurve = function(values,minx,maxx,defaulty, samples)
{
	var result = [];
	result.length = samples;
	var delta = (maxx - minx) / samples;
	for(var i = 0; i < samples; i++)
		result[i] = LS.getCurveValueAt(values,minx,maxx,defaulty, minx + delta * i);
	return result;
}

//Material class **************************
/* Warning: a material is not a component, because it can be shared by multiple nodes */

/**
* Material class contains all the info about how a mesh should be rendered, more in a highlevel format.
* Most of the info is Colors, factors and Textures but it can also specify a shader or some flags.
* Materials could be shared among different objects.
* @namespace LS
* @class Material
* @constructor
* @param {String} object to configure from
*/

function Material(o)
{
	this._uid = LS.generateUId();

	//this.shader = null; //default shader
	this.color = new Float32Array([1.0,1.0,1.0]);
	this.alpha = 1.0;
	this.ambient = new Float32Array([1.0,1.0,1.0]);
	this.diffuse = new Float32Array([1.0,1.0,1.0]);
	this.emissive = new Float32Array([0.0,0.0,0.0]);
	this.backlight_factor = 0;
	this.specular_factor = 0.1;
	this.specular_gloss = 10.0;
	this.specular_ontop = false;
	this.reflection_factor = 0.0;
	this.reflection_fresnel = 1.0;
	this.reflection_additive = false;
	this.reflection_specular = false;
	this.velvet = new Float32Array([0.5,0.5,0.5]);
	this.velvet_exp = 0.0;
	this.velvet_additive = false;
	this.detail = [0.0,10,10];
	this.uvs_matrix = new Float32Array([1,0,0, 0,1,0, 0,0,1]);
	this.extra_factor = 0.0; //used for debug and dev
	this.extra_color = new Float32Array([0.0,0.0,0.0]); //used for debug and dev
	this.blending = Material.NORMAL;
	this.normalmap_factor = 1.0;
	this.displacementmap_factor = 0.1;
	this.bumpmap_factor = 1.0;

	this.textures = {};

	if(o) 
		this.configure(o);
}

//Material flags
Material.NORMAL = "normal";
Material.ADDITIVE_BLENDING = "additive";

//material info attributes, use this to avoid errors when settings the attributes of a material

/**
* Surface color
* @property color
* @type {vec3}
* @default [1,1,1]
*/
Material.COLOR = "color";
/**
* Alpha. It must be < 1 to enable alpha sorting. If it is <= 0 wont be visible.
* @property alpha
* @type {number}
* @default 1
*/
Material.ALPHA = "alpha";

/**
* Blending mode, it could be Material.NORMAL or Material.ADDITIVE_BLENDING
* @property blending
* @type {String}
* @default Material.NORMAL
*/
Material.BLENDING = "blending";

/**
* Ambient color: amount of ambient light reflected by the object
* @property ambient
* @type {vec3}
* @default [1,1,1]
*/
Material.AMBIENT = "ambient";
/**
* Diffuse color: amount of diffuse light reflected by the object
* @property diffuse
* @type {vec3}
* @default [1,1,1]
*/
Material.DIFFUSE = "diffuse";
/**
* Backlight factor: amount of light that can be seen through the surface.
* @property backlight_factor
* @type {number}
* @default 0
*/
Material.BACKLIGHT_FACTOR = "backlight_factor";

/**
* Emissive color: amount of emissive light emited from the surface
* @property emissive
* @type {vec3}
* @default [0,0,0]
*/
Material.EMISSIVE = "emissive";
/**
* Specular factor: amount of specular light reflected
* @property specular_factor
* @type {number}
* @default 0.1
*/
Material.SPECULAR_FACTOR = "specular_factor";
/**
* Specular glossiness: the glossines (exponent) of specular light
* @property specular_gloss
* @type {number}
* @default 10
*/
Material.SPECULAR_GLOSS = "specular_gloss";
/**
* Specular on top: if the specular spots should be on top or multiplyed by the surface color
* @property specular_ontop
* @type {boolean}
* @default false
*/
Material.SPECULAR_ON_TOP = "specular_ontop";
/**
* How reflectance is the surface 
* @property reflection_factor
* @type {number}
* @default 0
*/
Material.REFLECTION_FACTOR = "reflection_factor";
/**
* Fresnel coeficient (exp) of reflectance
* @property reflection_fresnel
* @type {number}
* @default 0
*/
Material.REFLECTION_FRESNEL = "reflection_fresnel";
/**
* It controls if the reflection is interpolated or blended with the surface color
* @property reflection_additive
* @type {boolean}
* @default false
*/
Material.REFLECTION_ADDITIVE = "reflection_additive";
/**
* It controls if the reflection factor is affected by the specular factor
* @property reflection_specular
* @type {boolean}
* @default false
*/
Material.REFLECTION_SPECULAR = "reflection_specular";
/**
* velvet color
* @property velvet
* @type {vec3}
* @default [0,0,0]
*/
Material.VELVET = "velvet";
Material.VELVET_EXP = "velvet_exp";
Material.VELVET_ADDITIVE = "velvet_additive";

Material.NORMALMAP_FACTOR = "normalmap_factor";
Material.DISPLACEMENTMAP_FACTOR = "displacementmap_factor";

Material.OPACITY_TEXTURE = "opacity";	//used for baked GI
Material.AMBIENT_TEXTURE = "ambient";	//used for baked GI
Material.COLOR_TEXTURE = "color";	//material color
Material.SPECULAR_TEXTURE = "specular"; //defines specular factor and glossiness per pixel
Material.EMISSIVE_TEXTURE = "emissive"; //emissive pixels
Material.DETAIL_TEXTURE = "detail";		//secondary material color with texture matrix
Material.REFLECTIVITY_TEXTURE = "reflectivity"; //defines which areas are reflective
Material.ENVIRONMENT_TEXTURE = "environment"; //the environtment texture (2d or cubemap)
Material.NORMAL_TEXTURE = "normal";		//the normalmap
Material.BUMP_TEXTURE = "bump";		//displacement 
Material.DISPLACEMENT_TEXTURE = "displacement";		//displacement 
Material.IRRADIANCE_TEXTURE = "irradiance";	//the irradiance texture (2d polar or cubemap)
Material.EXTRA_TEXTURE = "extra";	//used for own shader
//Material.TEXTURE_CHANNELS = [ "color","opacity", "ambient", "specular", "emissive", "detail", "normal", "reflectivity","environment", "irradiance" ];
Material.TEXTURE_CHANNELS = [ Material.COLOR_TEXTURE, Material.OPACITY_TEXTURE, Material.AMBIENT_TEXTURE, Material.SPECULAR_TEXTURE, Material.EMISSIVE_TEXTURE, Material.DETAIL_TEXTURE, Material.NORMAL_TEXTURE, Material.DISPLACEMENT_TEXTURE, Material.BUMP_TEXTURE, Material.REFLECTIVITY_TEXTURE, Material.ENVIRONMENT_TEXTURE, Material.IRRADIANCE_TEXTURE, Material.EXTRA_TEXTURE ];

Material.COORDS_UV0 = "0";
Material.COORDS_UV1 = "1";
Material.COORDS_UV_TRANSFORMED = "transformed";
Material.COORDS_SCREEN = "screen";
Material.COORDS_POLAR = "polar";
Material.COORDS_POLAR_REFLECTED = "polar_reflected";
Material.COORDS_WORLDXZ = "worldxz";
Material.COORDS_WORLDXY = "worldxy";
Material.COORDS_WORLDYZ = "worldyz";

Material.TEXTURE_COORDINATES = [ Material.COORDS_UV0, Material.COORDS_UV1, Material.COORDS_UV_TRANSFORMED, Material.COORDS_SCREEN, Material.COORDS_POLAR, Material.COORDS_POLAR_REFLECTED, Material.COORDS_WORLDXY, Material.COORDS_WORLDXZ, Material.COORDS_WORLDYZ ];
Material.DEFAULT_UVS = { "normal":Material.COORDS_UV0, "displacement":Material.COORDS_UV0, "environment": Material.COORDS_POLAR_REFLECTED, "irradiance" : Material.COORDS_POLAR };


Material.prototype.getShader = function(shader_name, macros, options)
{
	return Shaders.get(shader_name, macros );
}

// RENDERING METHODS
Material.prototype.getSurfaceShaderMacros = function(macros, step, shader_name, instance, node, scene, options)
{
	var that = this;

	//iterate through textures in the scene (environment and irradiance)
	for(var i in scene.textures)
	{
		var texture = Material.prototype.getTexture.call(scene, i); //hack
		if(!texture) continue;

		if(i == "environment")
			if(this.reflection_factor <= 0) continue;
		var texture_uvs = this.textures[i + "_uvs"] || Material.DEFAULT_UVS[i] || "0";
		macros[ "USE_" + i.toUpperCase() + (texture.texture_type == gl.TEXTURE_2D ? "_TEXTURE" : "_CUBEMAP") ] = "uvs_" + texture_uvs;
	}

	//iterate through textures in the material
	for(var i in this.textures) 
	{
		var texture = this.getTexture(i);
		if(!texture) continue;
		var texture_uvs = this.textures[i + "_uvs"] || Material.DEFAULT_UVS[i] || "0";
		//special cases
		if(i == "environment")
		{
			if(this.reflection_factor <= 0) 
				continue;
		}
		else if(i == "normal")
		{
			if(this.normalmap_factor != 0.0 && (!this.normalmap_tangent || (this.normalmap_tangent && gl.derivatives_supported)) )
			{
				macros.USE_NORMAL_TEXTURE = "uvs_" + texture_uvs;
				if(this.normalmap_factor != 0.0)
					macros.USE_NORMALMAP_FACTOR = "";
				if(this.normalmap_tangent && gl.derivatives_supported)
					macros.USE_TANGENT_NORMALMAP = "";
			}
			continue;
		}
		else if(i == "displacement")
		{
			if(this.displacementmap_factor != 0.0 && gl.derivatives_supported )
			{
				macros.USE_DISPLACEMENT_TEXTURE = "uvs_" + texture_uvs;
				if(this.displacementmap_factor != 1.0)
					macros.USE_DISPLACEMENTMAP_FACTOR = "";
			}
			continue;
		}
		else if(i == "bump")
		{
			if(this.bump_factor != 0.0 && gl.derivatives_supported )
			{
				macros.USE_BUMP_TEXTURE = "uvs_" + texture_uvs;
				if(this.bumpmap_factor != 1.0)
					macros.USE_BUMPMAP_FACTOR = "";
			}
			continue;
		}
		macros[ "USE_" + i.toUpperCase() + (texture.texture_type == gl.TEXTURE_2D ? "_TEXTURE" : "_CUBEMAP") ] = "uvs_" + texture_uvs;
	}

	if(node.flags.alpha_test == true)
		macros.USE_ALPHA_TEST = "0.5";
	if(this.velvet && this.velvet_exp) //first light only
		macros.USE_VELVET = "";
	if(this.emissive_material)
		macros.USE_EMISSIVE_MATERIAL = "";
	if(this.specular_ontop)
		macros.USE_SPECULAR_ONTOP = "";
	if(this.specular_on_alpha)
		macros.USE_SPECULAR_ON_ALPHA = "";
	if(this.reflection_specular)
		macros.USE_SPECULAR_IN_REFLECTION = "";
	if(this.backlight_factor > 0.001)
		macros.USE_BACKLIGHT = "";

	//mesh information
	var mesh = instance.mesh;
	if(!("a_normal" in mesh.vertexBuffers))
		macros.NO_NORMALS = "";
	if(!("a_coord" in mesh.vertexBuffers))
		macros.NO_COORDS = "";
	if(("a_color" in mesh.vertexBuffers))
		macros.USE_COLOR_STREAM = "";
	if(("a_tangent" in mesh.vertexBuffers))
		macros.USE_TANGENT_STREAM = "";

	//extra macros
	if(this.extra_macros)
		for(var im in this.extra_macros)
			macros[im] = this.extra_macros[im];
}

Material.prototype.getLightShaderMacros = function(macros, step, light, instance, shader_name, node, scene, options)
{
	var use_shadows = scene.settings.enable_shadows && light.cast_shadows && light._shadowMap && light._lightMatrix != null && !options.shadows_disabled;

	//light macros
	if(light.use_diffuse && !this.constant_diffuse)
		macros.USE_DIFFUSE_LIGHT = "";
	if(light.use_specular && this.specular_factor > 0)
		macros.USE_SPECULAR_LIGHT = "";
	if(light.type == Light.DIRECTIONAL)
		macros.USE_DIRECTIONAL_LIGHT = "";
	else if(light.type == Light.SPOT)
		macros.USE_SPOT_LIGHT = "";
	if(light.spot_cone)
		macros.USE_SPOT_CONE = "";
	if(light.linear_attenuation)
		macros.USE_LINEAR_ATTENUATION = "";
	if(light.range_attenuation)
		macros.USE_RANGE_ATTENUATION = "";

	var light_projective_texture = light.projective_texture;
	if(light_projective_texture && light_projective_texture.constructor == String)
		light_projective_texture = ResourcesManager.textures[light_projective_texture];

	if(light_projective_texture)
		macros.USE_PROJECTIVE_LIGHT = "";

	if(vec3.squaredLength( light.color ) < 0.001 || node.flags.ignore_lights)
		macros.USE_AMBIENT_ONLY = "";

	if(light.offset > 0.001)
		macros.USE_LIGHT_OFFSET = "";

	if(use_shadows && node.flags.receive_shadows != false)
	{
		macros.USE_SHADOW_MAP = "";
		if(light.hard_shadows)
			macros.USE_HARD_SHADOWS = "";
		macros.SHADOWMAP_OFFSET = "";
	}
}

Material.prototype.getSceneShaderMacros = function(macros, step, instance, node, scene, options )
{
	//camera info
	if(options.camera.type == Camera.ORTHOGRAPHIC)
		macros.USE_ORTHOGRAPHIC_CAMERA = "";

	if(options.clipping_plane)
		macros.USE_CLIPPING_PLANE = "";

	if(options.brightness_factor && options.brightness_factor != 1)
		macros.USE_BRIGHTNESS_FACTOR = "";

	if(options.colorclip_factor)
		macros.USE_COLORCLIP_FACTOR = "";
}

Material.prototype.fillSurfaceUniforms = function(shader, uniforms, instance, node, scene, options )
{
	var shader_vars = shader.uniformLocations;

	uniforms.u_material_color = new Float32Array([this.color[0], this.color[1], this.color[2], this.alpha]);
	uniforms.u_ambient_color = node.flags.ignore_lights ? [1,1,1] : [scene.ambient_color[0] * this.ambient[0], scene.ambient_color[1] * this.ambient[1], scene.ambient_color[2] * this.ambient[2]];
	uniforms.u_diffuse_color = this.diffuse;
	uniforms.u_emissive_color = this.emissive || [0,0,0];
	uniforms.u_specular = [ this.specular_factor, this.specular_gloss ];
	uniforms.u_reflection_info = [ (this.reflection_additive ? -this.reflection_factor : this.reflection_factor), this.reflection_fresnel ];
	uniforms.u_backlight_factor = this.backlight_factor;
	uniforms.u_normalmap_factor = this.normalmap_factor;
	uniforms.u_displacementmap_factor = this.displacementmap_factor;
	uniforms.u_bumpmap_factor = this.bumpmap_factor;
	uniforms.u_velvet_info = [ this.velvet[0], this.velvet[1], this.velvet[2], (this.velvet_additive ? this.velvet_exp : -this.velvet_exp) ];
	uniforms.u_detail_info = this.detail;

	uniforms.u_texture_matrix = this.uvs_matrix;

	var last_slot = 0;

	//iterate through textures in the scene (environment and irradiance)
	for(var i in scene.textures)
	{
		var texture = Material.prototype.getTexture.call(scene, i); //hack
		if(!texture) continue;
		uniforms[ i + (texture.texture_type == gl.TEXTURE_2D ? "_texture" : "_cubemap") ] = texture.bind( last_slot );
		last_slot += 1;

		if(i == "environment")
		{
			if(this.reflection_factor <= 0) continue;
		}

		var texture_uvs = this.textures[i + "_uvs"] || Material.DEFAULT_UVS[i] || "0";
		if(texture_uvs == Material.COORDS_POLAR_REFLECTED || texture_uvs == Material.COORDS_POLAR)
		{
			texture.setParameter( gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE ); //to avoid going up
			texture.setParameter( gl.TEXTURE_MIN_FILTER, gl.LINEAR ); //avoid ugly error in atan2 edges
		}
	}

	//iterate through textures in the material
	for(var i in this.textures) 
	{
		var texture = this.getTexture(i);
		if(!texture) continue;

		uniforms[ i + (texture.texture_type == gl.TEXTURE_2D ? "_texture" : "_cubemap") ] = texture.bind( last_slot );
		var texture_uvs = this.textures[i + "_uvs"] || Material.DEFAULT_UVS[i] || "0";
		last_slot += 1;

		//special cases
		if(i == "environment")
			if(this.reflection_factor <= 0) continue;
		else if(i == "normal")
			continue;
		else if(i == "displacement")
			continue;
		else if(i == "bump")
			continue;
		else if(i == "irradiance")
		{
			texture.setParameter( gl.TEXTURE_MIN_FILTER, gl.LINEAR );
			texture.setParameter( gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE );
			texture.setParameter( gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE );
			//texture.min_filter = gl.GL_LINEAR;
		}

		if(texture.texture_type == gl.TEXTURE_2D && (texture_uvs == Material.COORDS_POLAR_REFLECTED || texture_uvs == Material.COORDS_POLAR))
		{
			texture.setParameter( gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE ); //to avoid going up
			texture.setParameter( gl.TEXTURE_MIN_FILTER, gl.LINEAR ); //avoid ugly error in atan2 edges
		}
	}
}

Material.prototype.fillLightUniforms = function(shader, uniforms, light, instance, node, scene, options)
{
	var use_shadows = scene.settings.enable_shadows && light.cast_shadows && light._shadowMap && light._lightMatrix != null && !options.shadows_disabled;

	var light_projective_texture = light.projective_texture;
	if(light_projective_texture && light_projective_texture.constructor == String)
		light_projective_texture = ResourcesManager.textures[light_projective_texture];
	if(light_projective_texture)
		uniforms.light_texture = light_projective_texture.bind(11); //fixed slot
	var shadowmap_size = use_shadows ? (light._shadowMap.width) : 1024;
	if(light.type == Light.DIRECTIONAL || light.type == Light.SPOT)
		uniforms.u_light_front = light.getFront();
	if(light.type == Light.SPOT)
		uniforms.u_light_angle = [ light.angle * DEG2RAD, light.angle_end * DEG2RAD, Math.cos( light.angle * DEG2RAD * 0.5 ), Math.cos( light.angle_end * DEG2RAD * 0.5 ) ];

	uniforms.u_light_pos = light.getPosition();
	uniforms.u_light_color = vec3.scale( vec3.create(), light.color, light.intensity );
	uniforms.u_light_att = [light.att_start,light.att_end];
	uniforms.u_light_offset = light.offset;

	if(light._lightMatrix)
		uniforms.u_lightMatrix = mat4.multiply( mat4.create(), light._lightMatrix, instance.matrix );

	//use shadows?
	if(use_shadows)
	{
		uniforms.u_shadow_params = [ 1.0 / light._shadowMap.width, light.shadow_bias ];
		uniforms.shadowMap = light._shadowMap.bind(10);
	}
}


/**
* This function returns all the uniforms and the macros related to the material needed to compute the shader
*
* @method getMaterialShaderData
* @param {Object} instance 
* @param {SceneNode} node 
* @param {SceneTree} scene 
* @param {Object} options 
* @return {Object} 
*/
//DEPRECATED ************** REPLACED BY getLightShaderMacros, getSurfaceShaderMacros
Material.prototype.getMaterialShaderData = function(instance, node, scene, options)
{
	//compute the uniforms
	var uniforms = this._uniforms || {};
	if(!this._uniforms) this._uniforms = uniforms;

	var macros = {};
	var that = this;

	//uniforms
	uniforms.u_material_color = new Float32Array([this.color[0], this.color[1], this.color[2], this.alpha]);
	uniforms.u_ambient_color = node.flags.ignore_lights ? [1,1,1] : [scene.ambient_color[0] * this.ambient[0], scene.ambient_color[1] * this.ambient[1], scene.ambient_color[2] * this.ambient[2]];
	uniforms.u_diffuse_color = this.diffuse;
	uniforms.u_emissive_color = this.emissive || [0,0,0];
	uniforms.u_specular = [ this.specular_factor, this.specular_gloss ];
	uniforms.u_reflection_info = [ (this.reflection_additive ? -this.reflection_factor : this.reflection_factor), this.reflection_fresnel ];
	uniforms.u_backlight_factor = this.backlight_factor;
	uniforms.u_normalmap_factor = this.normalmap_factor;
	uniforms.u_displacementmap_factor = this.displacementmap_factor;
	uniforms.u_bumpmap_factor = this.bumpmap_factor;
	uniforms.u_velvet_info = [ this.velvet[0], this.velvet[1], this.velvet[2], (this.velvet_additive ? this.velvet_exp : -this.velvet_exp) ];
	uniforms.u_detail_info = this.detail;

	uniforms.u_texture_matrix = this.uvs_matrix;

	//bind textures
	var last_slot = 0;


	//iterate through textures in the scene (environment and irradiance)
	for(var i in scene.textures)
	{
		var texture = Material.prototype.getTexture.call(scene, i); //hack
		if(!texture) continue;
		uniforms[ i + (texture.texture_type == gl.TEXTURE_2D ? "_texture" : "_cubemap") ] = texture.bind( last_slot );
		last_slot += 1;

		if(i == "environment")
		{
			if(this.reflection_factor <= 0) continue;
		}

		var texture_uvs = this.textures[i + "_uvs"] || Material.DEFAULT_UVS[i] || "0";
		if(texture_uvs == Material.COORDS_POLAR_REFLECTED || texture_uvs == Material.COORDS_POLAR)
		{
			texture.setParameter( gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE ); //to avoid going up
			texture.setParameter( gl.TEXTURE_MIN_FILTER, gl.LINEAR ); //avoid ugly error in atan2 edges
		}
		macros[ "USE_" + i.toUpperCase() + (texture.texture_type == gl.TEXTURE_2D ? "_TEXTURE" : "_CUBEMAP") ] = "uvs_" + texture_uvs;
	}

	//iterate through textures in the material
	for(var i in this.textures) 
	{
		var texture = this.getTexture(i);
		if(!texture) continue;

		uniforms[ i + (texture.texture_type == gl.TEXTURE_2D ? "_texture" : "_cubemap") ] = texture.bind( last_slot );
		var texture_uvs = this.textures[i + "_uvs"] || Material.DEFAULT_UVS[i] || "0";
		last_slot += 1;

		//special cases
		if(i == "environment")
		{
			if(this.reflection_factor <= 0) continue;
		}
		else if(i == "normal")
		{
			if(this.normalmap_factor != 0.0 && (!this.normalmap_tangent || (this.normalmap_tangent && gl.derivatives_supported)) )
			{
				macros.USE_NORMAL_TEXTURE = "uvs_" + texture_uvs;
				if(this.normalmap_factor != 0.0)
					macros.USE_NORMALMAP_FACTOR = "";
				if(this.normalmap_tangent && gl.derivatives_supported)
					macros.USE_TANGENT_NORMALMAP = "";
			}
			continue;
		}
		else if(i == "displacement")
		{
			if(this.displacementmap_factor != 0.0 && gl.derivatives_supported )
			{
				macros.USE_DISPLACEMENT_TEXTURE = "uvs_" + texture_uvs;
				if(this.displacementmap_factor != 1.0)
					macros.USE_DISPLACEMENTMAP_FACTOR = "";
			}
			continue;
		}
		else if(i == "bump")
		{
			if(this.bump_factor != 0.0 && gl.derivatives_supported )
			{
				macros.USE_BUMP_TEXTURE = "uvs_" + texture_uvs;
				if(this.bumpmap_factor != 1.0)
					macros.USE_BUMPMAP_FACTOR = "";
			}
			continue;
		}
		else if(i == "irradiance")
		{
			texture.setParameter( gl.TEXTURE_MIN_FILTER, gl.LINEAR );
			texture.setParameter( gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE );
			texture.setParameter( gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE );
			//texture.min_filter = gl.GL_LINEAR;
		}

		if(texture.texture_type == gl.TEXTURE_2D && (texture_uvs == Material.COORDS_POLAR_REFLECTED || texture_uvs == Material.COORDS_POLAR))
		{
			texture.setParameter( gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE ); //to avoid going up
			texture.setParameter( gl.TEXTURE_MIN_FILTER, gl.LINEAR ); //avoid ugly error in atan2 edges
		}

		macros[ "USE_" + i.toUpperCase() + (texture.texture_type == gl.TEXTURE_2D ? "_TEXTURE" : "_CUBEMAP") ] = "uvs_" + texture_uvs;
	}

	if(this.velvet && this.velvet_exp) //first light only
		macros.USE_VELVET = "";
	if(this.emissive_material)
		macros.USE_EMISSIVE_MATERIAL = "";
	if(this.specular_ontop)
		macros.USE_SPECULAR_ONTOP = "";
	if(this.specular_on_alpha)
		macros.USE_SPECULAR_ON_ALPHA = "";
	if(this.reflection_specular)
		macros.USE_SPECULAR_IN_REFLECTION = "";
	if(this.backlight_factor > 0.001)
		macros.USE_BACKLIGHT = "";

	//extra macros
	if(this.extra_macros)
		for(var im in this.extra_macros)
			macros[im] = this.extra_macros[im];

	uniforms["MACROS"] = macros;

	return uniforms;
}

//****************************************/
/**
* This function returns all the uniforms and the macros related to the light needed to compute the shader
*
* @method getLightShaderData
* @param {Light} light 
* @param {Object} instance
* @param {SceneNode} node
* @param {SceneTree} scene 
* @param {Object} options 
* @return {Object} 
*/
Material.prototype.getLightShaderData = function(light, instance, node, scene, options)
{
	var uniforms = {};

	var light_projective_texture = light.projective_texture;
	if(light_projective_texture && light_projective_texture.constructor == String)
		light_projective_texture = ResourcesManager.textures[light_projective_texture];
	if(light_projective_texture)
		uniforms.light_texture = light_projective_texture.bind(11);
	var use_shadows = scene.settings.enable_shadows && light.cast_shadows && light._shadowMap && light._lightMatrix != null && !options.shadows_disabled;
	var shadowmap_size = use_shadows ? (light._shadowMap.width) : 1024;
	if(light.type == Light.DIRECTIONAL || light.type == Light.SPOT)
		uniforms.u_light_front = light.getFront();
	if(light.type == Light.SPOT)
		uniforms.u_light_angle = [ light.angle * DEG2RAD, light.angle_end * DEG2RAD, Math.cos( light.angle * DEG2RAD * 0.5 ), Math.cos( light.angle_end * DEG2RAD * 0.5 ) ];

	uniforms.u_light_pos = light.getPosition();
	uniforms.u_light_color = vec3.scale( vec3.create(), light.color, light.intensity );
	uniforms.u_light_att = [light.att_start,light.att_end];
	uniforms.u_light_offset = light.offset;

	if(light._lightMatrix)
		uniforms.u_lightMatrix = mat4.multiply( mat4.create(), light._lightMatrix, instance.matrix );

	//use shadows?
	if(use_shadows)
	{
		uniforms.u_shadow_params = [ 1.0 / light._shadowMap.width, light.shadow_bias ];
		uniforms.shadowMap = light._shadowMap.bind(10);
	}

	//macros
	var macros = {};

	//light macros
	if(light.use_diffuse && !this.constant_diffuse)
		macros.USE_DIFFUSE_LIGHT = "";
	if(light.use_specular && this.specular_factor > 0)
		macros.USE_SPECULAR_LIGHT = "";
	if(light.type == Light.DIRECTIONAL)
		macros.USE_DIRECTIONAL_LIGHT = "";
	else if(light.type == Light.SPOT)
		macros.USE_SPOT_LIGHT = "";
	if(light.spot_cone)
		macros.USE_SPOT_CONE = "";
	if(light.linear_attenuation)
		macros.USE_LINEAR_ATTENUATION = "";
	if(light.range_attenuation)
		macros.USE_RANGE_ATTENUATION = "";
	if(light_projective_texture)
		macros.USE_PROJECTIVE_LIGHT = "";

	if(vec3.squaredLength( light.color ) < 0.001 || node.flags.ignore_lights)
		macros.USE_AMBIENT_ONLY = "";

	if(light.offset > 0.001)
		macros.USE_LIGHT_OFFSET = "";

	if(use_shadows && node.flags.receive_shadows != false)
	{
		macros.USE_SHADOW_MAP = "";
		if(light.hard_shadows)
			macros.USE_HARD_SHADOWS = "";
		macros.SHADOWMAP_OFFSET = "";
	}

	uniforms["MACROS"] = macros;
	return uniforms;
}



/**
* Configure the material getting the info from the object
* @method configure
* @param {Object} object to configure from
*/
Material.prototype.configure = function(o)
{
	//cloneObject(o, this);
	for(var i in o)
	{
		var v = o[i];
		var r = null;
		switch(i)
		{
			//numbers
			case "alpha": 
			case "backlight_factor":
			case "specular_factor":
			case "specular_gloss":
			case "reflection_factor":
			case "reflection_fresnel":
			case "velvet_exp":
			case "velvet_additive":
			case "blending":
			case "normalmap_factor":
			case "displacementmap_factor":
			case "extra_factor":
			//bools
			case "specular_ontop":
			case "reflection_specular":
				r = v; 
				break;
			//vectors
			case "color": 
			case "ambient":	
			case "diffuse": 
			case "emissive": 
			case "velvet":
			case "detail":
			case "extra_color":
				r = new Float32Array(v); 
				break;
			case "textures":
				this.textures = o.textures;
				continue;
			default:
				continue;
		}
		this[i] = r;
	}

	if(o.uvs_matrix && o.uvs_matrix.length == 9)
		this.uvs_matrix = new Float32Array(o.uvs_matrix);
}

/**
* Serialize this material 
* @method serialize
* @return {Object} object with the serialization info
*/
Material.prototype.serialize = function()
{
	 var o = cloneObject(this);
	 return o;
}

/**
* Loads and assigns a texture to a channel
* @method loadAndSetTexture
* @param {Texture || url} texture_or_filename
* @param {String} channel
*/
Material.prototype.loadAndSetTexture = function(texture_or_filename, channel, options)
{
	options = options || {};
	channel = channel || Material.COLOR_TEXTURE;
	var that = this;
	//if(!this.material) this.material = new Material();

	if( typeof(texture_or_filename) === "string" ) //it could be the url or the internal texture name 
	{
		if(texture_or_filename[0] != ":")//load if it is not an internal texture
			ResourcesManager.loadImage(texture_or_filename,options, function(texture) {
				that.setTexture(texture, channel);
				if(options.on_complete)
					options.on_complete();
			});
		else
			this.setTexture(texture_or_filename, channel);
	}
	else //otherwise just assign whatever
	{
		this.setTexture(texture_or_filename, channel);
		if(options.on_complete)
			options.on_complete();
	}
}

/**
* Assigns a texture to a channel
* @method setTexture
* @param {Texture} texture
* @param {String} channel default is COLOR
*/
Material.prototype.setTexture = function(texture, channel, uvs) {
	channel = channel || Material.COLOR_TEXTURE;
	if(texture)
	{
		this.textures[channel] = texture;
		if(uvs)	this.textures[channel + "_uvs"] = uvs;
	}
	else
	{
		delete this.textures[channel];
		delete this.textures[channel + "_uvs"];
	}

	if(!texture) return;
	if(texture.constructor == String)
		ResourcesManager.loadImage(texture);
}

/**
* Returns a texture from a channel
* @method setTexture
* @param {String} channel default is COLOR
* @return {Texture}
*/
Material.prototype.getTexture = function(channel) {
	var v = this.textures[channel];
	if(!v) return null;
	if(v.constructor == String)
		return ResourcesManager.textures[v];
	else if(v.constructor == Texture)
		return v;
	return null;
}

/**
* Collects all the resources needed by this material (textures)
* @method getResources
* @param {Object} resources object where all the resources are stored
* @return {Texture}
*/
Material.prototype.getResources = function (res)
{
	for(var i in this.textures)
		if(typeof(this.textures[i]) == "string" && i.substr(-4) != "_uvs") //ends in this string
			res[ this.textures[i] ] = Texture;
	return res;
}

/**
* Loads all the textures inside this material, by sending the through the ResourcesManager
* @method loadTextures
*/

Material.prototype.loadTextures = function ()
{
	var res = this.getResources({});
	for(var i in res)
		ResourcesManager.loadImage( res[i] );
}

//not implemented yet
Material.prototype.getRenderer = function()
{
	return this.renderer || Renderer._default_renderer;
}

/**
* Register this material in a materials pool to be shared with other nodes
* @method registerMaterial
* @param {String} name name given to this material, it must be unique
*/
Material.prototype.registerMaterial = function(name)
{
	this.name = name;
	Scene.materials[name] = this;
	this.material = name;
}

/*
*  Components are elements that attach to Nodes to add functionality
*  Some important components are Transform,Light or Camera
*
*	*  ctor: must accept an optional parameter with the serialized data
*	*  onAddedToNode: triggered when added to node
*	*  onRemovedFromNode: triggered when removed from node
*	*  onAddedToScene: triggered when the node is added to the scene
*	*  onRemovedFromScene: triggered when the node is removed from the scene
*	*  serialize: returns a serialized version packed in an object
*	*  configure: recieves an object to unserialize and configure this instance
*	*  getResources: adds to the object the resources to load
*	*  _root contains the node where the component is added
*
*	*  use the LEvent system to hook events to the node or the scene
*	*  never share the same component instance between two nodes
*
*/

/**
* ComponentContainer class allows to add component based properties to any other class
* @class ComponentContainer
* @constructor
*/
function ComponentContainer()
{
	//this function never will be called (because only the methods are attached to other classes)
	//unless you instantiate this class directly, something that would be weird
}


/**
* Adds a component to this node.
* @method configureComponents
* @param {Object} info object containing all the info from a previous serialization
*/

ComponentContainer.prototype.configureComponents = function(info)
{
	if(info.components)
	{
		for(var i in info.components)
		{
			var comp_info = info.components[i];
			var comp_class = comp_info[0];
			if(comp_class == "Transform" && i == 0) //special case
			{
				this.transform.configure(comp_info[1]);
				continue;
			}
			if(!window[comp_class]){
				trace("Unknown component found: " + comp_class);
				continue;
			}
			var comp = new window[comp_class]( comp_info[1] );
			this.addComponent(comp);
		}
	}
}

/**
* Adds a component to this node.
* @method serializeComponents
* @param {Object} o container where the components will be stored
*/

ComponentContainer.prototype.serializeComponents = function(o)
{
	if(!this._components) return;

	o.components = [];
	for(var i in this._components)
	{
		var comp = this._components[i];
		if( !comp.serialize ) continue;
		o.components.push([getObjectClassName(comp), comp.serialize()]);
	}
}

/**
* Adds a component to this node.
* @method addComponent
* @param {Object} component
* @return {Object} component added
*/
ComponentContainer.prototype.addComponent = function(component)
{
	//link component with container
	component._root = this;
	if(component.onAddedToNode)
		component.onAddedToNode(this);

	//link node with component
	if(!this._components) this._components = [];
	if(this._components.indexOf(component) != -1) throw("inserting the same component twice");
	this._components.push(component);
	return component;
}

/**
* Removes a component from this node.
* @method removeComponent
* @param {Object} component
*/
ComponentContainer.prototype.removeComponent = function(component)
{
	//unlink component with container
	component._root = null;
	if(component.onRemovedFromNode)
		component.onRemovedFromNode(this);

	//remove from components list
	var pos = this._components.indexOf(component);
	if(pos != -1) this._components.splice(pos,1);
}

/**
* Removes all components from this node.
* @method removeAllComponents
* @param {Object} component
*/
ComponentContainer.prototype.removeAllComponents = function()
{
	while(this._components.length)
		this.removeComponent( this._components[0] );
}


/**
* Returns the first component of this container that is of the same class
* @method getComponent
* @param {Object} component_class the class to search a component from (not the name of the class)
*/
ComponentContainer.prototype.getComponent = function(component_class) //class, not string with the name of the class
{
	if(!this._components) return;
	for(var i in this._components)
		if( this._components[i].constructor == component_class )
		return this._components[i];
	return null;
}

/**
* executes the method with a given name in all the components
* @method processActionInComponents
* @param {String} action_name the name of the function to execute in all components (in string format)
* @param {Object} params object with the params to be accessed by that function
*/
ComponentContainer.prototype.processActionInComponents = function(action_name,params)
{
	if(!this._components) return;
	for(var i in this._components)
		if( this._components[i].action_name && typeof(this._components[i].action_name) == "function")
			this._components[i].action_name(params);
}
/** Transform that contains the position (vec3), rotation (quat) and scale (vec3) 
* @class Transform
* @constructor
* @param {String} object to configure from
*/

function Transform(o)
{
	this._position = vec3.create();
	this._rotation = quat.create();
	this._scale = vec3.fromValues(1,1,1);
	this._local_matrix = mat4.create();
	this._global_matrix = mat4.create();

	this._dirty = false; //matrix must be redone?

	if(o)
		this.configure(o);
}

Transform.prototype.onAddedToNode = function(node)
{
	if(!node.transform)
		node.transform = this;
}

/**
* Copy the transform from another Transform
* @method copyFrom
* @param {Transform} src
*/
Transform.prototype.copyFrom = function(src)
{
	this.configure( src.serialize() );
}

/**
* Configure from a serialized object
* @method configure
* @param {Object} object with the serialized info
*/
Transform.prototype.configure = function(o)
{
	if(o.position) vec3.copy( this._position, o.position );
	if(o.scale) vec3.copy( this._scale, o.scale );

	if(o.rotation && o.rotation.length == 4)
		quat.copy( this._rotation, o.rotation );
	if(o.rotation && o.rotation.length == 3)
	{
		quat.identity( this._rotation );
		var R = quat.setAngleAxis( quat.create(), [1,0,0], o.rotation[0] * DEG2RAD);
		quat.multiply(this._rotation, this._rotation, R ); 
		quat.setAngleAxis( R, [0,1,0], o.rotation[1] * DEG2RAD );
		quat.multiply(this._rotation, this._rotation, R ); 
		quat.setAngleAxis( R, [0,0,1], o.rotation[2] * DEG2RAD );
		quat.multiply(this._rotation, this._rotation, R ); 
	}

	this._dirty = true;
	this._on_change();
}

/**
* Serialize the object 
* @method serialize
* @return {Object} object with the serialized info
*/
Transform.prototype.serialize = function()
{
	return {
		position: [ this._position[0],this._position[1],this._position[2] ],
		rotation: [ this._rotation[0],this._rotation[1],this._rotation[2],this._rotation[3] ],
		scale: [ this._scale[0],this._scale[1],this._scale[2] ]
	};
}

/**
* Reset this transform
* @method identity
*/
Transform.prototype.identity = function()
{
	vec3.copy(this._position, [0,0,0]);
	quat.copy(this._rotation, [0,0,0,1]);
	vec3.copy(this._scale, [1,1,1]);
	mat4.identity(this._local_matrix);
	mat4.identity(this._global_matrix);
	this._dirty = false;
}

Transform.prototype.reset = Transform.prototype.identity;

/**
* Returns the local position (its a copy)
* @method getPosition
* @return {[[x,y,z]]} the position
*/
Transform.prototype.getPosition = function(p)
{
	if(p) return vec3.copy(p, this._position);
	return vec3.clone( this._position );
}

/**
* Returns the global position (its a copy)
* @method getPosition
* @return {[[x,y,z]]} the position
*/
Transform.prototype.getPositionGlobal = function(p)
{
	if(this._parent)
	{
		var tmp = vec3.create();
		return mat4.multiplyVec3( tmp || p, this.getGlobalMatrix(), tmp );
	}
	if(p) return vec3.copy(p,this._position);
	return vec3.clone( this._position);
}

/**
* Returns the rotation in quaternion array (a copy)
* @method getRotation
* @return {[[x,y,z,w]]} the rotation
*/
Transform.prototype.getRotation = function()
{
	return quat.clone(this._rotation);
}

/**
* Returns the global rotation in quaternion array (a copy)
* @method getRotation
* @return {[[x,y,z,w]]} the rotation
*/
Transform.prototype.getRotationGlobal = function()
{
	if( this._parent )
	{
		var aux = this._parent;
		var R = quat.clone(this._rotation);
		while(aux)
		{
			quat.multiply(R, aux._rotation, R);
			aux = aux._parent;
		}
		return R;
	}
	return quat.clone(this._rotation);
}


/**
* Returns the scale (its a copy)
* @method getScale
* @return {[[x,y,z]]} the scale
*/
Transform.prototype.getScale = function()
{
	return vec3.clone(this._scale);
}

/**
* Returns the scale in global (its a copy)
* @method getScaleGlobal
* @return {[[x,y,z]]} the scale
*/
Transform.prototype.getScaleGlobal = function()
{
	if( this._parent )
	{
		var aux = this;
		var S = vec3.clone(this._scale);
		while(aux._parent)
		{
			vec3.multiply(S, S, aux._scale);
			aux = aux._parent;
		}
		return S;
	}
	return vec3.clone(this._scale);
}

/**
* update the Matrix to match the position,scale and rotation
* @method updateMatrix
*/
Transform.prototype.updateMatrix = function()
{
	mat4.fromRotationTranslation( this._local_matrix , this._rotation, this._position );
	mat4.scale(this._local_matrix, this._local_matrix, this._scale);
	this._dirty = false;
}

/**
* update the Global Matrix to match the position,scale and rotation in world space
* @method updateGlobalMatrix
*/
Transform.prototype.updateGlobalMatrix = function()
{
	if(this._dirty)
		this.updateMatrix();
	if (this._parent)
		mat4.multiply(this._global_matrix, this._parent.updateGlobalMatrix(), this._local_matrix );
	else
		mat4.copy( this._local_matrix , this._global_matrix);
	return this._global_matrix;
}


/**
* Returns a copy of the local matrix of this transform (it updates the matrix automatically)
* @method getLocalMatrix
* @return {Matrix} the matrix in array format
*/
Transform.prototype.getLocalMatrix = function ()
{
	if(this._dirty)
		this.updateMatrix();
	return mat4.clone(this._local_matrix);
}

/**
* Returns the original world matrix of this transform (it updates the matrix automatically)
* @method getLocalMatrixRef
* @return {Matrix} the matrix in array format
*/
Transform.prototype.getLocalMatrixRef = function ()
{
	if(this._dirty)
		this.updateMatrix();
	return this._local_matrix;
}

/**
* Returns a copy of the global matrix of this transform (it updates the matrix automatically)
* @method getGlobalMatrix
* @return {Matrix} the matrix in array format
*/
Transform.prototype.getGlobalMatrix = function ()
{
	if(this._dirty)
		this.updateMatrix();
	if (this._parent)
		return mat4.multiply( this._global_matrix, this._parent.getGlobalMatrix(), this._local_matrix );
	return mat4.clone(this._local_matrix);
}

/**
* Returns a copy of the global matrix of this transform (it updates the matrix automatically)
* @method getGlobalMatrix
* @return {Matrix} the matrix in array format
*/
Transform.prototype.getGlobalMatrixRef = function ()
{
	return this._global_matrix;
}

/**
* Returns the world matrix of this transform without the scale
* @method getMatrixWithoutScale
* @return {Matrix} the matrix in array format
*/
Transform.prototype.getMatrixWithoutScale = function ()
{
	var pos = this.getPositionGlobal();
	return mat4.fromRotationTranslation(mat4.create(), this.getRotationGlobal(), pos) 
}

/**
* Returns the world matrix of this transform without the scale
* @method getMatrixWithoutRotation
* @return {Matrix} the matrix in array format
*/
Transform.prototype.getMatrixWithoutRotation = function ()
{
	var pos = this.getPositionGlobal();
	return mat4.clone([1,0,0,0, 0,1,0,0, 0,0,1,0, pos[0], pos[1], pos[2], 1]);
}

/**
* Configure the transform from a local Matrix (do not tested carefully)
* @method fromMatrix
* @param {Matrix} src, the matrix in array format
*/
Transform.prototype.fromMatrix = function(m)
{
	//pos
	var M = mat4.clone(m);
	mat4.multiplyVec3(this._position, M, [0,0,0]);

	//scale
	var tmp = vec3.create();
	this._scale[0] = vec3.length( mat4.rotateVec3(tmp,M,[1,0,0]) );
	this._scale[1] = vec3.length( mat4.rotateVec3(tmp,M,[0,1,0]) );
	this._scale[2] = vec3.length( mat4.rotateVec3(tmp,M,[0,0,1]) );

	mat4.scale( mat4.create(), M, [1/this._scale[0],1/this._scale[1],1/this._scale[2]] );

	//rot
	var M3 = mat3.fromMat4( mat3.create(), M);
	mat3.transpose(M3, M3);
	quat.fromMat3(this._rotation, M3);
	quat.normalize(this._rotation, this._rotation);

	mat4.copy(this._local_matrix, m);
	this._dirty = false;
	this._on_change();
}

/**
* Configure the transform rotation from a vec3 Euler angles (heading,attitude,bank)
* @method setRotationFromEuler
* @param {Matrix} src, the matrix in array format
*/
Transform.prototype.setRotationFromEuler = function(v)
{
	quat.fromEuler( this._rotation, v );
	this._dirty = true;
	this._on_change();
}

/**
* sets the position
* @method setPosition
* @param {Number} x 
* @param {Number} y
* @param {Number} z 
*/
Transform.prototype.setPosition = function(x,y,z)
{
	if(arguments.length == 3)
		vec3.set(this._position, x,y,z);
	else
		vec3.copy(this._position, x);
	this._dirty = true;
	this._on_change();
}

/**
* sets the rotation
* @method setRotation
* @param {quat} rotation in quaterion format
*/
Transform.prototype.setRotation = function(q)
{
	quat.copy(this._rotation, q);
	this._dirty = true;
	this._on_change();
}

/**
* sets the scale
* @method setScale
* @param {Number} x 
* @param {Number} y
* @param {Number} z 
*/
Transform.prototype.setScale = function(x,y,z)
{
	if(arguments.length == 3)
		vec3.set(this._scale, x,y,z);
	else
		vec3.set(this._scale, x,x,x);
	this._dirty = true;
	this._on_change();
}

/**
* translates object (addts to the position)
* @method translate
* @param {Number} x 
* @param {Number} y
* @param {Number} z 
*/
Transform.prototype.translate = function(x,y,z)
{
	if(arguments.length == 3)
		vec3.add( this._position, this._position, [x,y,z] );
	else
		vec3.add( this._position, this._position, x );
	this._dirty = true;
	this._on_change();
}

/**
* translates object in local coordinates (using the rotation and the scale)
* @method translateLocal
* @param {Number} x 
* @param {Number} y
* @param {Number} z 
*/
Transform.prototype.translateLocal = function(x,y,z)
{
	if(arguments.length == 3)
		vec3.add( this._position, this._position, this.transformVector([x,y,z]) );
	else
		vec3.add( this._position, this._position, this.transformVector(x) );
	this._dirty = true;
	this._on_change();
}

/**
* rotate object in world space
* @method rotate
* @param {Number} angle_in_deg 
* @param {vec3} axis
*/
Transform.prototype.rotate = function(angle_in_deg, axis)
{
	var R = quat.setAxisAngle(quat.create(), axis, angle_in_deg * 0.0174532925);
	quat.multiply(this._rotation, R, this._rotation);
	this._dirty = true;
	this._on_change();
}

/**
* rotate object in object space
* @method rotateLocal
* @param {Number} angle_in_deg 
* @param {vec3} axis
*/
Transform.prototype.rotateLocal = function(angle_in_deg, axis)
{
	var R = quat.setAxisAngle(quat.create(), axis, angle_in_deg * 0.0174532925 );
	quat.multiply(this._rotation, this._rotation, R);
	this._dirty = true;
	this._on_change();
}

/**
* scale the object
* @method scale
* @param {Number} x 
* @param {Number} y
* @param {Number} z 
*/
Transform.prototype.scale = function(x,y,z)
{
	if(arguments.length == 3)
		vec3.multiply(this._scale, this._scale, [x,y,z]);
	else
		vec3.multiply(this._scale, this._scale,x);
	this._dirty = true;
	this._on_change();
}

/**
* This method is static (call it from Transform.interpolate)
* interpolate the transform between two transforms and stores the result in another Transform
* @method interpolate
* @param {Transform} a 
* @param {Transform} b
* @param {Number} factor from 0 to 1 
* @param {Transform} the destination
*/
Transform.interpolate = function(a,b,factor, result)
{
	vec3.lerp(result._scale, a._scale, b._scale, factor); //scale
	vec3.lerp(result._position, a._position, b._position, factor); //position
	quat.slerp(result._rotation, a._rotation, b._rotation, factor); //rotation
	this._dirty = true;
	this._on_change();
}

/**
* Orients the transform to look from one position to another (overwrites scale)
* @method lookAt
* @param {[[x,y,z]]} position
* @param {[[x,y,z]]} target
* @param {[[x,y,z]]} up
*/
Transform.prototype.lookAt = function(pos,target,up)
{
	var temp = mat4.create();
	if(this._parent)
	{
		var M = this._parent.getGlobalMatrix();
		pos = mat4.multiplyVec3(vec3.create(), M, pos);
		target = mat4.multiplyVec3(vec3.create(), M,target);
		up = mat4.multiplyVec3(vec3.create(), M,up);
	}
	mat4.lookAt(temp, pos, target, up);
	mat4.invert(temp, temp);
	this.fromMatrix(temp);
}

//Events
Transform.prototype._on_change = function()
{
	this._dirty = true;
	LEvent.trigger(this, "changed", this);
	if(this._root)
		LEvent.trigger(this._root, "transformChanged", this);
}

//Transform
/**
* returns the [0,0,1] vector in world space
* @method getFront
* @return {[[x,y,z]]}
*/
Transform.prototype.getFront = function(dest) {
	return vec3.transformQuat(dest || vec3.create(), vec3.fromValues(0,0,1), this.getRotationGlobal() );
}

/**
* returns the [0,1,0] vector in world space
* @method getTop
* @return {[[x,y,z]]}
*/
Transform.prototype.getTop = function(dest) {
	return vec3.transformQuat(dest || vec3.create(), vec3.fromValues(0,1,0), this.getRotationGlobal() );
}

/**
* returns the [1,0,0] vector in world space
* @method getRight
* @return {[[x,y,z]]}
*/
Transform.prototype.getRight = function(dest) {
	//return mat4.rotateVec3( this._matrix, vec3.create([1,0,0]) );
	return vec3.transformQuat(dest || vec3.create(), vec3.fromValues(1,0,0), this.getRotationGlobal() );
}

/**
* Applies the local transformation to a point (multiply it by the matrix)
* If no destination is specified the transform is applied to vec
* @method transformPoint
* @param {[[x,y,z]]} point
* @param {[[x,y,z]]} destination (optional)
*/
Transform.prototype.transformPoint = function(vec, dest) {
	dest = dest || vec3.create();
	if(this._dirty) this.updateMatrix();
	return mat4.multiplyVec3( dest, this._local_matrix, vec );
}

/**
* Applies the global transformation to a point (multiply it by the matrix)
* If no destination is specified the transform is applied to vec
* @method transformPointGlobal
* @param {[[x,y,z]]} point
* @param {[[x,y,z]]} destination (optional)
*/
Transform.prototype.transformPointGlobal = function(vec, dest) {
	dest = dest || vec3.create();
	if(this._dirty) this.updateMatrix();
	return mat4.multiplyVec3( dest, this.getGlobalMatrix(), vec );
}


/**
* Applies the transformation to a vector (rotate but not translate)
* If no destination is specified the transform is applied to vec
* @method transformVector
* @param {[[x,y,z]]} vector
* @param {[[x,y,z]]} destination (optional)
*/
Transform.prototype.transformVector = function(vec, dest) {
	return vec3.transformQuat(dest || vec3.create(), vec, this._rotation );
}

/**
* Applies the transformation to a vector (rotate but not translate)
* If no destination is specified the transform is applied to vec
* @method transformVectorGlobal
* @param {[[x,y,z]]} vector
* @param {[[x,y,z]]} destination (optional)
*/
Transform.prototype.transformVectorGlobal = function(vec, dest) {
	return vec3.transformQuat(dest || vec3.create(), vec, this.getRotationGlobal() );
}

LS.registerComponent(Transform);
LS.Transform = Transform;
// ******* CAMERA **************************

/**
* Camera that contains the info about a camera
* @class Camera
* @namespace LS.Components
* @constructor
* @param {String} object to configure from
*/

function Camera(o)
{
	this._type = Camera.PERSPECTIVE;
	this._eye = vec3.fromValues(0,100, 100); //change to position
	this._center = vec3.fromValues(0,0,0);	//change to target
	this._up = vec3.fromValues(0,1,0);
	this._near = 1;
	this._far = 1000;
	this._aspect = 1.0;
	this._fov = 45; //persp
	this._frustrum_size = 50; //ortho

	this._view_matrix = mat4.create();
	this._projection_matrix = mat4.create();
	this._viewprojection_matrix = mat4.create();
	this._model_matrix = mat4.create(); //inverse of viewmatrix (used for local vectors)

	if(o) this.configure(o);
	//this.updateMatrices(); //done by configure
}

Camera.PERSPECTIVE = 1;
Camera.ORTHOGRAPHIC = 2;

/**
* Camera type, could be Camera.PERSPECTIVE or Camera.ORTHOGRAPHIC
* @property type {vec3}
* @default Camera.PERSPECTIVE;
*/
Object.defineProperty( Camera.prototype, "type", {
	get: function() {
		return this._type;
	},
	set: function(v) {
		if(	this._type != v)
			this._dirty_matrices = true;
		this._type = v;
	}
});

/**
* The position of the camera (in local space form the node)
* @property eye {vec3}
* @default [0,100,100]
*/
Object.defineProperty( Camera.prototype, "eye", {
	get: function() {
		return this._eye;
	},
	set: function(v) {
		this._eye.set(v);
		this._dirty_matrices = true;
	}
});

/**
* The center where the camera points (in node space)
* @property center {vec3}
* @default [0,0,0]
*/
Object.defineProperty( Camera.prototype, "center", {
	get: function() {
		return this._center;
	},
	set: function(v) {
		this._center.set(v);
		this._dirty_matrices = true;
	}
});

/**
* The near plane
* @property near {number}
* @default 1
*/
Object.defineProperty( Camera.prototype, "near", {
	get: function() {
		return this._near;
	},
	set: function(v) {
		if(	this._near != v)
			this._dirty_matrices = true;
		this._near = v;
	}
});

/**
* The far plane
* @property far {number}
* @default 1000
*/
Object.defineProperty( Camera.prototype, "far", {
	get: function() {
		return this._far;
	},
	set: function(v) {
		if(	this._far != v)
			this._dirty_matrices = true;
		this._far = v;
	}
});

/**
* The camera aspect ratio
* @property aspect {number}
* @default 1
*/
Object.defineProperty( Camera.prototype, "aspect", {
	get: function() {
		return this._aspect;
	},
	set: function(v) {
		if(	this._aspect != v)
			this._dirty_matrices = true;
		this._aspect = v;
	}
});
/**
* The field of view in degrees
* @property fov {number}
* @default 45
*/
Object.defineProperty( Camera.prototype, "fov", {
	get: function() {
		return this._fov;
	},
	set: function(v) {
		if(	this._fov != v)
			this._dirty_matrices = true;
		this._fov  = v;
	}
});

/**
* The frustrum size when working in ORTHOGRAPHIC
* @property frustrum_size {number}
* @default 50
*/

Object.defineProperty( Camera.prototype, "frustrum_size", {
	get: function() {
		return this._frustrum_size;
	},
	set: function(v) {
		if(	this._frustrum_size != v)
			this._dirty_matrices = true;
		this._frustrum_size  = v;
	}
});


Camera.prototype.onAddedToNode = function(node)
{
	if(!node.camera)
		node.camera = this;
	//this.updateNodeTransform();
}

Camera.prototype.onRemovedFromNode = function(node)
{
	if(node.camera == this)
		delete node.camera;
}

Camera.prototype.setActive = function()
{
	Scene.current_camera = this;
}

/**
* 
* @method updateMatrices
* @param {vec3} eye
* @param {vec3} center
* @param {vec3} up
*/
Camera.prototype.lookAt = function(eye,center,up)
{
	vec3.copy(this._eye, eye);
	vec3.copy(this._center, center);
	vec3.copy(this._up,up);
	this._dirty_matrices = true;
}

/**
* Update matrices according to the eye,center,up,fov,aspect,...
* @method updateMatrices
*/
Camera.prototype.updateMatrices = function()
{
	if(this.type == Camera.ORTHOGRAPHIC)
		mat4.ortho(this._projection_matrix, -this._frustrum_size*this._aspect*0.5, this._frustrum_size*this._aspect*0.5, -this._frustrum_size*0.5, this._frustrum_size*0.5, this._near, this._far);
	else
		mat4.perspective(this._projection_matrix, this._fov * DEG2RAD, this._aspect, this._near, this._far);
	mat4.lookAt(this._view_matrix, this._eye, this._center, this._up);
	//if(this._root && this._root.transform)

	mat4.multiply(this._viewprojection_matrix, this._projection_matrix, this._view_matrix );
	mat4.invert(this._model_matrix, this._view_matrix );
	this._dirty_matrices = false;
}

Camera.prototype.getModelMatrix = function(m)
{
	m = m || mat4.create();
	if(this._dirty_matrices)
		this.updateMatrices();
	return mat4.copy( m, this._model_matrix );
}

Camera.prototype.getViewMatrix = function(m)
{
	m = m || mat4.create();
	if(this._dirty_matrices)
		this.updateMatrices();
	return mat4.copy( m, this._view_matrix );
}

Camera.prototype.getProjectionMatrix = function(m)
{
	m = m || mat4.create();
	if(this._dirty_matrices)
		this.updateMatrices();
	return mat4.copy( m, this._projection_matrix );
}

Camera.prototype.getViewProjectionMatrix = function(m)
{
	m = m || mat4.create();
	if(this._dirty_matrices)
		this.updateMatrices();
	return mat4.copy( m, this._viewprojection_matrix );
}

Camera.prototype.updateVectors = function(model)
{
	var front = vec3.subtract(vec3.create(), this._center, this._eye);
	var dist = vec3.length(front);
	this._eye = mat4.multiplyVec3(vec3.create(), model, vec3.create() );
	this._center = mat4.multiplyVec3(vec3.create(), model, vec3.fromValues(0,0,-dist));
	this._up = mat4.rotateVec3(vec3.create(), model, vec3.fromValues(0,1,0));
	this.updateMatrices();
}

Camera.prototype.getLocalPoint = function(v, dest)
{
	dest = dest || vec3.create();
	if(this._dirty_matrices)
		this.updateMatrices();
	var temp = this._model_matrix; //mat4.create();
	//mat4.invert( temp, this._view_matrix );
	if(this._root.transform)
		mat4.multiply( temp, temp, this._root.transform.getGlobalMatrixRef() );
	return mat4.multiplyVec3(dest, temp, v );
}

Camera.prototype.getLocalVector = function(v, dest)
{
	dest = dest || vec3.create();
	if(this._dirty_matrices)
		this.updateMatrices();
	var temp = this._model_matrix; //mat4.create();
	//mat4.invert( temp, this._view_matrix );
	if(this._root.transform)
		mat4.multiply(temp, temp, this._root.transform.getGlobalMatrixRef() );
	return mat4.rotateVec3(dest, temp, v );
}

Camera.prototype.getEye = function()
{
	return vec3.clone( this._eye );
}

Camera.prototype.getCenter = function()
{
	return vec3.clone( this._center );
}

Camera.prototype.setEye = function(v)
{
	return vec3.copy( this._eye, v );
}

Camera.prototype.setCenter = function(v)
{
	return vec3.copy( this._center, v );
}

//in global coordinates (when inside a node)
Camera.prototype.getGlobalFront = function(dest)
{
	dest = dest || vec3.create();
	vec3.subtract( dest, this._center, this._eye);
	vec3.normalize(dest, dest);
	if(this._root.transform)
		this._root.transform.transformVector(dest, dest);
	return dest;
}

Camera.prototype.getGlobalTop = function(dest)
{
	dest = dest || vec3.create();
	vec3.subtract( dest, this._center, this._eye);
	vec3.normalize(dest, dest);
	var right = vec3.cross( vec3.create(), dest, this._up );
	vec3.cross( dest, dest, right );
	vec3.scale( dest, dest, -1.0 );

	if(this._root.transform)
		this._root.transform.transformVector(dest, dest);
	return dest;
}

Camera.prototype.move = function(v)
{
	vec3.add(this._center, this._center, v);
	vec3.add(this._eye, this._eye, v);
	this._dirty_matrices = true;
}


Camera.prototype.rotate = function(angle_in_deg, axis)
{
	var R = quat.setAxisAngle( quat.create(), axis, angle_in_deg * 0.0174532925 );
	var front = vec3.subtract( vec3.create(), this._center, this._eye );
	vec3.transformQuat(front, front, R );
	vec3.add(this._center, this._eye, front);
	this._dirty_matrices = true;
}

Camera.prototype.orbit = function(angle_in_deg, axis, center)
{
	center = center || this._center;
	var R = quat.setAxisAngle( quat.create(), axis, angle_in_deg * 0.0174532925 );
	var front = vec3.subtract( vec3.create(), this._eye, center );
	vec3.transformQuat(front, front, R );
	vec3.add(this._eye, center, front);
	this._dirty_matrices = true;
}

Camera.prototype.orbitDistanceFactor = function(f, center)
{
	center = center || this._center;
	var front = vec3.subtract( vec3.create(), this._eye, center );
	vec3.scale(front, front, f);
	vec3.add(this._eye, center, front);
	this._dirty_matrices = true;
}


/**
* Applies the camera transformation (from eye,center,up) to the node.
* @method updateNodeTransform
*/

/* DEPRECATED
Camera.prototype.updateNodeTransform = function()
{
	if(!this._root) return;
	this._root.transform.fromMatrix( this.getModel() );
}
*/

/**
* Converts from 3D to 2D
* @method project
* @param {vec3} vec 3D position we want to proyect to 2D
* @param {Array[4]} viewport viewport coordinates (if omited full viewport is used)
* @param {vec3} result where to store the result, if omited it is created
* @return {vec3} the coordinates in 2D
*/

Camera.prototype.project = function( vec, viewport, result )
{
	viewport = viewport ||  gl.getParameter(gl.VIEWPORT);
	if( this._dirty_matrices )
		this.updateMatrices();
	var result = mat4.multiplyVec3(result || vec3.create(), this._viewprojection_matrix, vec );
	result[0] /= result[2];
	result[1] /= result[2];
	vec3.set(result, (result[0]+1) * (viewport[2]*0.5) + viewport[0], (result[1]+1) * (viewport[3]*0.5) + viewport[1], result[2] );
	return result;
}

/**
* Converts from 2D to 3D
* @method unproject
* @param {vec3} vec 2D position we want to proyect to 3D
* @param {Array[4]} viewport viewport coordinates (if omited full viewport is used)
* @param {vec3} result where to store the result, if omited it is created
* @return {vec3} the coordinates in 2D
*/

Camera.prototype.unproject = function( vec, viewport, result )
{
	viewport = viewport ||  gl.getParameter(gl.VIEWPORT);
	if( this._dirty_matrices )
		this.updateMatrices();
	return gl.unproject(result || vec3.create(), vec, this._view_matrix, this._projection_matrix, viewport );
}

Camera.prototype.getRayInPixel = function(x,y, viewport)
{
	viewport = viewport ||  gl.getParameter(gl.VIEWPORT);
	if( this._dirty_matrices )
		this.updateMatrices();
	var eye = this.getEye();
	var pos = vec3.unproject(vec3.create(), [x,y,1], this._view_matrix, this._projection_matrix, viewport );
	var dir = vec3.subtract( vec3.create(), pos, eye );
	vec3.normalize(dir, dir);
	return { start: eye, direction: dir };
}

Camera.prototype.configure = function(o)
{
	//jQuery.extend(true, this, o);
	LS.cloneObject(o,this);
	this.updateMatrices();
}

Camera.prototype.serialize = function()
{
	//clone
	return cloneObject(this);
}

LS.registerComponent(Camera);
LS.Camera = Camera;
//***** LIGHT ***************************

/**
* Light that contains the info about the camera
* @class Light
* @constructor
* @param {String} object to configure from
*/

function Light(o)
{
	this._uid = LS.generateUId();
	/**
	* Position of the light
	* @property position
	* @type {[[x,y,z]]}
	* @default [0,0,0]
	*/
	this.position = vec3.create();
	/**
	* Position where the light is pointing at (target)
	* @property target
	* @type {[[x,y,z]]}
	* @default [0,0,1]
	*/
	this.target = vec3.fromValues(0,0,1);
	/**
	* Up vector
	* @property up
	* @type {[[x,y,z]]}
	* @default [0,1,0]
	*/
	this.up = vec3.fromValues(0,1,0);

	/**
	* Enabled
	* @property enabled
	* @type {Boolean}
	* @default true
	*/
	this.enabled = true;

	/**
	* Near distance
	* @property near
	* @type {Number}
	* @default 1
	*/
	this.near = 1;
	/**
	* Far distance
	* @property far
	* @type {Number}
	* @default 1000
	*/

	this.far = 1000;
	/**
	* Angle for the spot light inner apperture
	* @property angle
	* @type {Number}
	* @default 45
	*/
	this.angle = 45; //spot cone
	/**
	* Angle for the spot light outer apperture
	* @property angle_end
	* @type {Number}
	* @default 60
	*/
	this.angle_end = 60; //spot cone end

	this.use_diffuse = true;
	this.use_specular = true;
	this.linear_attenuation = false;
	this.range_attenuation = false;
	this.target_in_world_coords = false;
	this.att_start = 0;
	this.att_end = 1000;
	this.offset = 0;
	this.spot_cone = true;

	/**
	* The color of the light
	* @property color
	* @type {[[r,g,b]]}
	* @default [1,1,1]
	*/
	this.color = [1,1,1];
	/**
	* The intensity of the light
	* @property intensity
	* @type {Number}
	* @default 1
	*/
	this.intensity = 1;

	/**
	* If the light cast shadows
	* @property cast_shadows
	* @type {Boolean}
	* @default false
	*/
	this.cast_shadows = false;
	this.shadow_bias = 0.005;
	this.type = Light.OMNI;

	this.frustrum_size = 50; //ortho

	if(o) this.configure(o);
	
	o.shadowmap_resolution = parseInt(o.shadowmap_resolution); //LEGACY: REMOVE
}

Light.OMNI = 1;
Light.SPOT = 2;
Light.DIRECTIONAL = 3;

Light.DEFAULT_SHADOWMAP_RESOLUTION = 1024;
Light.DEFAULT_DIRECTIONAL_FRUSTUM_SIZE = 50;

Light.prototype.onAddedToNode = function(node)
{
	if(!node.light) node.light = this;

	//this.updateNodeTransform();
	//LEvent.bind(node, "transformChanged", this.onTransformChanged, this );
	LEvent.bind(node, "beforeRender", this.onBeforeRender, this );
}

Light.prototype.onRemovedFromNode = function(node)
{
	if(node.light == this) delete node.light;
}

Light.prototype.onBeforeRender = function()
{
	//projective texture needs the light matrix to compute projection
	if(this.projective_texture && this.enabled)
		this.computeLightMatrices();
}

Light._temp_matrix = mat4.create();
Light._temp2_matrix = mat4.create();
Light._temp3_matrix = mat4.create();
Light._temp_position = vec3.create();
Light._temp_target = vec3.create();
Light._temp_up = vec3.create();
Light._temp_front = vec3.create();

Light.prototype.computeLightMatrices = function(view_matrix, projection_matrix, viewprojection_matrix)
{
	/*
	var position = vec3.set(this.position, Light._temp_position );
	var target = vec3.set(this.target, Light._temp_target);
	var up = vec3.set(this.up, Light._temp_up);
	*/

	var position = this.getPosition(Light._temp_position);
	var target = this.getTarget(Light._temp_target);
	var up = this.getUp(Light._temp_up);
	var front = this.getFront(Light._temp_front);

	if( Math.abs( vec3.dot(front,up) ) > 0.999 ) vec3.set(up,0,0,1); //avoid problems when the light comes straight from [0,1,0]

	if(!projection_matrix) projection_matrix = Light._temp_matrix;
	if(!view_matrix) view_matrix = Light._temp2_matrix;
	if(!viewprojection_matrix) viewprojection_matrix = Light._temp3_matrix;

	var frustum_size = this.frustrum_size || Light.DEFAULT_DIRECTIONAL_FRUSTUM_SIZE;
	if(this.type == Light.DIRECTIONAL)
		mat4.ortho(projection_matrix, frustum_size*-0.5, frustum_size*0.5, frustum_size*-0.5, frustum_size*0.5, this.near, this.far);
	else
		mat4.perspective(projection_matrix, (this.angle_end || 45) * DEG2RAD, 1, this.near, this.far);

	mat4.lookAt(view_matrix, position, target, up );

	//adjust subpixel shadow movements to avoid flickering
	if(this.type == Light.DIRECTIONAL && this.cast_shadows && this.enabled)
	{
		var shadowmap_resolution = this.shadowmap_resolution || Light.DEFAULT_SHADOWMAP_RESOLUTION;
		var texelSize = frustum_size / shadowmap_resolution;
		view_matrix[12] = Math.floor( view_matrix[12] / texelSize) * texelSize;
		view_matrix[13] = Math.floor( view_matrix[13] / texelSize) * texelSize;
	}
	mat4.multiply(viewprojection_matrix, projection_matrix, view_matrix);

	//save it
	if( !this._lightMatrix ) this._lightMatrix = mat4.create();
	mat4.copy( this._lightMatrix, viewprojection_matrix );
}

Light.prototype.serialize = function()
{
	this.position = vec3.toArray(this.position);
	this.target = vec3.toArray(this.target);
	this.color = vec3.toArray(this.color);
	return cloneObject(this);
}

Light.prototype.configure = function(o)
{
	//jQuery.extend(true, this, o);
	LS.cloneObject(o,this);
}

Light.prototype.getPosition = function(p)
{
	if(this._root && this._root.transform) return this._root.transform.transformPointGlobal(this.position, p || vec3.create() );
	return vec3.clone(this.position);
}

Light.prototype.getTarget = function(p)
{
	if(this._root && this._root.transform && !this.target_in_world_coords) 
		return this._root.transform.transformPointGlobal(this.target, p || vec3.create() );
	return vec3.clone(this.target);
}

Light.prototype.getUp = function(p)
{
	if(this._root && this._root.transform) return this._root.transform.transformVector(this.up, p || vec3.create() );
	return vec3.clone(this.up);
}

Light.prototype.getFront = function(p) {
	var front = p || vec3.create();
	vec3.subtract(front, this.getPosition(), this.getTarget() ); //front is reversed?
	vec3.normalize(front, front);
	return front;
}

Light.prototype.getResources = function (res)
{
	if(this.projective_texture)
		res[ this.projective_texture ] = Texture;
	return res;
}

LS.registerComponent(Light);
LS.Light = Light;

function MeshRenderer(o)
{
	this.mesh = null;
	this.lod_mesh = null;
	this.submesh_id = -1;
	this.material = null;
	this.primitive = null;
	this.two_sided = false;

	if(o)
		this.configure(o);

	if(!MeshRenderer._identity) //used to avoir garbage
		MeshRenderer._identity = mat4.create();
}

MeshRenderer["@mesh"] = { widget: "mesh" };
MeshRenderer["@lod_mesh"] = { widget: "mesh" };
MeshRenderer["@primitive"] = {widget:"combo", values: {"Default":null, "Points": 0, "Lines":1, "Triangles":4 }};


MeshRenderer.prototype.onAddedToNode = function(node)
{
	if(!node.meshrenderer)
		node.meshrenderer = this;
}

MeshRenderer.prototype.onRemovedFromNode = function(node)
{
	if(node.meshrenderer)
		delete node["meshrenderer"];
}

/**
* Configure from a serialized object
* @method configure
* @param {Object} object with the serialized info
*/
MeshRenderer.prototype.configure = function(o)
{
	this.mesh = o.mesh;
	this.lod_mesh = o.lod_mesh;
	this.submesh_id = o.submesh_id;
	this.primitive = o.primitive; //gl.TRIANGLES
	this.two_sided = !!o.two_sided; //true or false
	if(o.material)
		this.material = typeof(o.material) == "string" ? o.material : new Material(o.material);
}

/**
* Serialize the object 
* @method serialize
* @return {Object} object with the serialized info
*/
MeshRenderer.prototype.serialize = function()
{
	var o = { 
		mesh: this.mesh,
		lod_mesh: this.lod_mesh
	};

	if(this.material)
		o.material = typeof(this.material) == "string" ? this.material : this.material.serialize();

	if(this.primitive != null)
		o.primitive = this.primitive;
	if(this.submesh_id)
		o.submesh_id = this.submesh_id;
	if(this.two_sided)
		o.two_sided = this.two_sided
	return o;
}

MeshRenderer.prototype.getMesh = function() {
	if(typeof(this.mesh) === "string")
		return ResourcesManager.meshes[this.mesh];
	return this.mesh;
}

MeshRenderer.prototype.getLODMesh = function() {
	if(typeof(this.lod_mesh) === "string")
		return ResourcesManager.meshes[this.lod_mesh];
	return this.low_mesh;
}

MeshRenderer.prototype.getResources = function(res)
{
	if(typeof(this.mesh) == "string")
		res[this.mesh] = Mesh;
	if(typeof(this.lod_mesh) == "string")
		res[this.lod_mesh] = Mesh;
	return res;
}

MeshRenderer.prototype.getRenderInstance = function(options)
{
	var mesh = this.getMesh();
	if(!mesh) return null;

	var node = this._root;

	if(options.step == "reflection" && !node.flags.seen_by_reflections)
		return null;
	if(options.step == "main" && node.flags.seen_by_camera == false)
		return null;
	if(options.step == "shadow" && !node.flags.cast_shadows)
		return null;

	var matrix = this._root ? this._root.transform.getGlobalMatrix() : MeshRenderer._identity;
	var center = mat4.multiplyVec3(vec3.create(), matrix, vec3.create());

	var RI = this._render_instance || new RenderInstance();

	RI.mesh = mesh;
	//RI.submesh_id = this.submesh_id;
	RI.primitive = this.primitive == null ? gl.TRIANGLES : this.primitive;
	RI.material = this.material || this._root.getMaterial();
	RI.two_sided = this.two_sided;
	RI.matrix.set(matrix);
	RI.center.set(center);
	//RI.scene = Scene;

	return RI;
}

LS.registerComponent(MeshRenderer);
LS.MeshRenderer = MeshRenderer;
/**
* Rotator rotate a mesh over time
* @class Rotator
* @constructor
* @param {String} object to configure from
*/

function Rotator(o)
{
	this.speed = 10;
	this.axis = [0,1,0];
	this.local_space = true;
	this.swing = false;
	this.swing_amplitude = 45;
}

Rotator.prototype.onAddedToNode = function(node)
{
	LEvent.bind(node,"update",this.onUpdate,this);
}


Rotator.prototype.onRemoveFromNode = function(node)
{
	LEvent.unbind(node,"update",this.onUpdate,this);
}

Rotator.prototype.onUpdate = function(e,dt)
{
	if(!this._root) return;

	if(!this._default)
		this._default = this._root.transform.getRotation();

	vec3.normalize(this.axis,this.axis);

	if(this.swing)
	{
		var R = quat.setAxisAngle(quat.create(), this.axis, Math.sin( this.speed * Scene._global_time * 2 * Math.PI) * this.swing_amplitude * DEG2RAD );
		quat.multiply( this._root.transform._rotation, R, this._default);
		this._root.transform._dirty = true;
	}
	else
	{
		if(this.local_space)
			this._root.transform.rotateLocal(this.speed * dt,this.axis);
		else
			this._root.transform.rotate(this.speed * dt,this.axis);
	}
	LEvent.trigger(Scene,"change");
}

LS.registerComponent(Rotator);
/**
* Camera controller
* @class FPSController
* @constructor
* @param {String} object to configure from
*/

function CameraController(o)
{
	this.speed = 10;
	this.rot_speed = 1;
	this.cam_type = "orbit"; //"fps"
	this._moving = vec3.fromValues(0,0,0);
	this.orbit_center = null;
}

CameraController.prototype.onAddedToNode = function(node)
{
	LEvent.bind(node,"mousemove",this.onMouse,this);
	LEvent.bind(node,"keydown",this.onKey,this);
	LEvent.bind(node,"keyup",this.onKey,this);
	LEvent.bind(node,"update",this.onUpdate,this);
}

CameraController.prototype.onUpdate = function(e)
{
	if(!this._root) return;

	if(this._root.transform)
	{
	}
	else if(this._root.camera)
	{
		var cam = this._root.camera;
		if(this.cam_type == "fps")
		{
			if(this._moving[0] != 0 || this._moving[1] != 0 || this._moving[2] != 0)
			{
				var delta = cam.getLocalVector( this._moving );
				vec3.scale(delta, delta, this.speed * (this._move_fast?10:1));
				cam.move(delta);
				cam.updateMatrices();
			}
		}
	}
}

CameraController.prototype.onMouse = function(e)
{
	if(!this._root) return;
	
	if(e.dragging)
	{
		if(this._root.transform)
		{
		}
		else if(this._root.camera)
		{
			if(this.cam_type == "fps")
			{
				var cam = this._root.camera;
				cam.rotate(-e.deltaX * this.rot_speed,[0,1,0]);
				cam.updateMatrices();
				var right = cam.getLocalVector([1,0,0]);
				cam.rotate(-e.deltaY * this.rot_speed,right);
				cam.updateMatrices();
			}
			else if(this.cam_type == "orbit")
			{
				var cam = this._root.camera;

				if(e.ctrlKey)
				{
					var delta = cam.getLocalVector( [ this.speed * -e.deltaX * 0.1, this.speed * e.deltaY * 0.1, 0]);
					cam.move(delta);
					cam.updateMatrices();
				}
				else
				{
					cam.orbit(-e.deltaX * this.rot_speed,[0,1,0], this.orbit_center);
					if(e.shiftKey)
					{
						cam.updateMatrices();
						var right = cam.getLocalVector([1,0,0]);
						cam.orbit(-e.deltaY,right, this.orbit_center);
					}
					else
					{
						cam.orbitDistanceFactor(1 + e.deltaY * 0.01, this.orbit_center);
						cam.updateMatrices();
					}
				}
			}
		}
	}
	//LEvent.trigger(Scene,"change");
}

CameraController.prototype.onKey = function(e)
{
	if(!this._root) return;
	//trace(e);
	if(e.keyCode == 87)
	{
		if(e.type == "keydown")
			this._moving[2] = -1;
		else
			this._moving[2] = 0;
	}
	else if(e.keyCode == 83)
	{
		if(e.type == "keydown")
			this._moving[2] = 1;
		else
			this._moving[2] = 0;
	}
	else if(e.keyCode == 65)
	{
		if(e.type == "keydown")
			this._moving[0] = -1;
		else
			this._moving[0] = 0;
	}
	else if(e.keyCode == 68)
	{
		if(e.type == "keydown")
			this._moving[0] = 1;
		else
			this._moving[0] = 0;
	}
	else if(e.keyCode == 16) //shift in windows chrome
	{
		if(e.type == "keydown")
			this._move_fast = true;
		else
			this._move_fast = false;
	}

	//if(e.shiftKey) vec3.scale(this._moving,10);


	//LEvent.trigger(Scene,"change");
}

LS.registerComponent(CameraController);
/**
* FaceTo rotate a mesh to look at the camera or another object
* @class FaceTo
* @constructor
* @param {String} object to configure from
*/

function FaceTo(o)
{
	/*
	this.width = 10;
	this.height = 10;
	this.roll = 0;
	*/
	this.scale = 1;
	this.target = null;
	this.cylindrical = false;
	this.reverse = false;
}

FaceTo["@target"] = {type:'node'};

FaceTo.prototype.onAddedToNode = function(node)
{
	LEvent.bind(node,"computeVisibility",this.updateOrientation,this);
}

FaceTo.prototype.updateOrientation = function(e,info)
{
	if(!this._root) return;

	/*
	var dir = vec3.subtract( info.camera.getEye(), this._root.transform.getPosition(), vec3.create() );
	quat.lookAt( this._root.transform._rotation, dir, [0,1,0] );
	this._root.transform._dirty = true;
	*/

	var eye = null;
	
	if(this.target)
	{
		var node = Scene.getNode( this.target );
		if(!node)
			return;
		eye = node.transform.getPosition();
	}
	else
		eye = info.camera.getEye();
	var pos = this._root.transform.getPosition();
	var up = info.camera.getLocalVector([0,1,0]);
	if( this.cylindrical )
	{
		eye[1] = pos[1];
		up.set([0,1,0]);
	}
	if(!this.reverse)
		vec3.subtract(eye,pos,eye);
	this._root.transform.lookAt( pos, eye, up );
	this._root.transform.setScale( this.scale );
}

LS.registerComponent(FaceTo);
function FogFX(o)
{
	this.enabled = true;
	this.start = 100;
	this.end = 1000;
	this.density = 0.001;
	this.type = FogFX.LINEAR;
	this.color = vec3.fromValues(0.5,0.5,0.5);

	if(o)
		this.configure(o);
}

FogFX.LINEAR = 1;
FogFX.EXP = 2;
FogFX.EXP2 = 3;

FogFX["@color"] = { type: "color" };
FogFX["@density"] = { type: "number", min: 0, max:1, step:0.0001, precision: 4 };
FogFX["@type"] = { type:"enum", values: {"linear": FogFX.LINEAR, "exponential": FogFX.EXP, "exponential 2": FogFX.EXP2 }};


FogFX.prototype.onAddedToNode = function(node)
{
	LEvent.bind(Scene,"fillLightUniforms",this.fillUniforms,this);
	LEvent.bind(Scene,"fillMacros",this.fillMacros,this);
}

FogFX.prototype.onRemovedFromNode = function(node)
{
	LEvent.unbind(Scene,"fillLightUniforms",this.fillUniforms,this);
	LEvent.unbind(Scene,"fillMacros",this.fillMacros,this);
}

FogFX.prototype.fillUniforms = function(e, pass)
{
	if(!this.enabled) return;

	pass.uniforms.u_fog_info = [this.start, this.end, this.density ];

	if(pass.light == pass.lights[0])
		pass.uniforms.u_fog_color = this.color;
	else
		pass.uniforms.u_fog_color = [0,0,0];
}

FogFX.prototype.fillMacros = function(e, pass)
{
	if(!this.enabled) return;

	var macros = pass.macros;
	macros.USE_FOG = ""
	switch(this.type)
	{
		case FogFX.EXP:	macros.USE_FOG_EXP = ""; break;
		case FogFX.EXP2: macros.USE_FOG_EXP2 = ""; break;
	}
}

LS.registerComponent(FogFX);
/**
* FollowNode 
* @class FollowNode
* @constructor
* @param {String} object to configure from
*/

function FollowNode(o)
{
	this.node_name = "";
	this.fixed_y = false;
	this.follow_camera = false;
	if(o)
		this.configure(o);
}

FollowNode.prototype.onAddedToNode = function(node)
{
	LEvent.bind(node,"computeVisibility",this.updatePosition,this);
}

FollowNode.prototype.updatePosition = function(e,info)
{
	if(!this._root) return;

	var pos = null;

	if(this.follow_camera)
		pos =  info.camera.getEye();
	else
	{
		var target_node = Scene.getNode( this.node_name );
		if(!target_node) return;
		pos = target_node.transform.getPosition();
	}

	if(this.fixed_y)
		pos[1] = this._root.transform._position[1];
	this._root.transform.setPosition( pos );
}

LS.registerComponent(FollowNode);
/**
* GeometricPrimitive renders a primitive
* @class GeometricPrimitive
* @constructor
* @param {String} object to configure from
*/

function GeometricPrimitive(o)
{
	//this.size = 10;
	this.two_sided = false;
	this.geometry = GeometricPrimitive.CUBE;
	this.align_z = false;
	if(!GeometricPrimitive.MESHES)
		GeometricPrimitive.MESHES = {};

	if(o)
		this.configure(o);
}

GeometricPrimitive.CUBE = 1;
GeometricPrimitive.PLANE = 2;
GeometricPrimitive.CYLINDER = 3;
GeometricPrimitive.SPHERE = 4;

GeometricPrimitive.MESHES = null;
GeometricPrimitive["@geometry"] = { type:"enum", values: {"Cube":GeometricPrimitive.CUBE, "Plane": GeometricPrimitive.PLANE, "Cylinder":GeometricPrimitive.CYLINDER,  "Sphere":GeometricPrimitive.SPHERE }};

/**
* Configure the component getting the info from the object
* @method configure
* @param {Object} object to configure from
*/

GeometricPrimitive.prototype.configure = function(o)
{
	cloneObject(o, this);
}

/**
* Serialize this component)
* @method serialize
* @return {Object} object with the serialization info
*/

GeometricPrimitive.prototype.serialize = function()
{
	 var o = cloneObject(this);
	 return o;
}

GeometricPrimitive.prototype.getRenderInstance = function()
{
	//if(this.size == 0) return;
	var mesh = null;

	if(this.geometry == GeometricPrimitive.CUBE)
	{
		if(!GeometricPrimitive.MESHES[GeometricPrimitive.CUBE])
			GeometricPrimitive.MESHES[GeometricPrimitive.CUBE] = GL.Mesh.cube({normals:true,coords:true});
		mesh = GeometricPrimitive.MESHES[GeometricPrimitive.CUBE];
	}
	else if(this.geometry == GeometricPrimitive.PLANE)
	{
		if(!GeometricPrimitive.MESHES[GeometricPrimitive.PLANE])
			GeometricPrimitive.MESHES[GeometricPrimitive.PLANE] = GL.Mesh.plane({xz:true,normals:true,coords:true});
		mesh = GeometricPrimitive.MESHES[GeometricPrimitive.PLANE];
	}
	else if(this.geometry == GeometricPrimitive.CYLINDER)
	{
		if(!GeometricPrimitive.MESHES[GeometricPrimitive.CYLINDER])
			GeometricPrimitive.MESHES[GeometricPrimitive.CYLINDER] = GL.Mesh.cylinder({normals:true,coords:true});
		mesh = GeometricPrimitive.MESHES[GeometricPrimitive.CYLINDER];
	}
	else if(this.geometry == GeometricPrimitive.SPHERE)
	{
		if(!GeometricPrimitive.MESHES[GeometricPrimitive.SPHERE])
			GeometricPrimitive.MESHES[GeometricPrimitive.SPHERE] = GL.Mesh.sphere({"long":32,"lat":32,normals:true,coords:true});
		mesh = GeometricPrimitive.MESHES[GeometricPrimitive.SPHERE];
	}
	else 
		return null;

	var matrix = mat4.clone( this._root.transform.getGlobalMatrix() );
	if(this.align_z)
	{
		mat4.rotateX( matrix, matrix, Math.PI * -0.5 );
		//mat4.rotateZ( matrix, Math.PI );
	}
	//mat4.scale(matrix, [this.size,this.size,this.size]);
	var center = mat4.multiplyVec3(vec3.create(), matrix, vec3.create());

	if(this._root) this._root.mesh = mesh;


	var RI = this._render_instance || new RenderInstance();

	RI.mesh = mesh;
	RI.material = this.material || this._root.getMaterial();
	RI.two_sided = this.two_sided;
	RI.matrix.set(matrix);
	RI.center.set(center);
	return RI;
}

LS.registerComponent(GeometricPrimitive);

/* Requires LiteGraph.js ******************************/

/**
* This component allow to integrate a behaviour graph on any object
* @class GraphComponent
* @param {Object} o object with the serialized info
*/
function GraphComponent(o)
{
	this._graph = new LGraph();
	this.force_redraw = true;
	if(o)
		this.configure(o);
	else //default
	{
		var graphnode = LiteGraph.createNode("scene/node");
		this._graph.add(graphnode);
	}
}

/**
* Returns the first component of this container that is of the same class
* @method configure
* @param {Object} o object with the configuration info from a previous serialization
*/
GraphComponent.prototype.configure = function(o)
{
	if(o.graph_data)
		this._graph.unserialize( o.graph_data );
}

GraphComponent.prototype.serialize = function()
{
	return { force_redraw: this.force_redraw , graph_data: this._graph.serialize() };
}

GraphComponent.prototype.onAddedToNode = function(node)
{
	this._graph._scenenode = node;
	this._onStart_bind = this.onStart.bind(this);
	this._onUpdate_bind = this.onUpdate.bind(this);
	LEvent.bind(Scene,"start", this._onStart_bind );
	LEvent.bind(Scene,"update", this._onUpdate_bind );
}

GraphComponent.prototype.onRemovedFromNode = function(node)
{
	LEvent.unbind(Scene,"start", this._onStart_bind );
	LEvent.unbind(Scene,"update", this._onUpdate_bind );
}

GraphComponent.prototype.onStart = function()
{
}

GraphComponent.prototype.onUpdate = function(e,dt)
{
	if(!this._root._on_scene) return;
	if(this._graph)
		this._graph.runStep(1);
	if(this.force_redraw)
		LEvent.trigger(Scene,"change");
}


LS.registerComponent(GraphComponent);
window.GraphComponent = GraphComponent;

if(window.LiteGraph != undefined)
{
	/* Scene LNodes ***********************/

	/* LGraphNode representing an object in the Scene */

	function LGraphTransform()
	{
		this.properties = {node_id:""};
		if(LGraphSceneNode._current_node_id)
			this.properties.node_id = LGraphSceneNode._current_node_id;
		this.addInput("Transform","Transform");
		this.addOutput("Position","vec3");
	}

	LGraphTransform.title = "Transform";
	LGraphTransform.desc = "Transform info of a node";

	LGraphTransform.prototype.onExecute = function()
	{
		var node = this._node;
		if(	this.properties.node_id )
			node = Scene.getNode( this.properties.node_id );

		if(!node)
			node = this.graph._scenenode;

		//read inputs
		for(var i in this.inputs)
		{
			var input = this.inputs[i];
			var v = this.getInputData(i);
			if(v == undefined)
				continue;
			switch( input.name )
			{
				case "Position": node.transform.setPosition(v); break;
				case "Rotation": node.transform.setRotation(v); break;
				case "Scale": node.transform.setScale(v); break;
			}
		}

		//write outputs
		for(var i in this.outputs)
		{
			var output = this.outputs[i];
			if(!output.links || !output.links.length)
				continue;

			switch( output.name )
			{
				case "Position": this.setOutputData(i, node.transform.getPosition()); break;
				case "Rotation": this.setOutputData(i, node.transform.getRotation()); break;
				case "Scale": this.setOutputData(i, node.transform.getScale(scale)); break;
			}
		}

		//this.setOutputData(0, parseFloat( this.properties["value"] ) );
	}

	LGraphTransform.prototype.onGetInputs = function()
	{
		return [["Position","vec3"],["Rotation","quat"],["Scale","number"],["Enabled","boolean"]];
	}

	LGraphTransform.prototype.onGetOutputs = function()
	{
		return [["Position","vec3"],["Rotation","quat"],["Scale","number"],["Enabled","boolean"]];
	}

	LiteGraph.registerNodeType("scene/transform", LGraphTransform );
	window.LGraphTransform = LGraphTransform;

	//***********************************************************************

	function LGraphSceneNode()
	{
		this.properties = {node_id:""};

		if(LGraphSceneNode._current_node_id)
			this.properties.node_id = LGraphSceneNode._current_node_id;
	}

	LGraphSceneNode.title = "SceneNode";
	LGraphSceneNode.desc = "Node on the scene";

	LGraphSceneNode.prototype.getNode = function()
	{
		var node = this._node;
		if(	this.properties.node_id )
			node = Scene.getNode( this.properties.node_id );

		if(!node)
			node = this.graph._scenenode;
		return node;
	}

	LGraphSceneNode.prototype.onExecute = function()
	{
		var node = this.getNode();
	
		//read inputs
		for(var i in this.inputs)
		{
			var input = this.inputs[i];
			var v = this.getInputData(i);
			if(v == undefined)
				continue;
			switch( input.name )
			{
				case "Transform": node.transform.copyFrom(v); break;
				case "Material": node.material = v;	break;
				case "Visible": node.flags.visible = v; break;
			}
		}

		//write outputs
		for(var i in this.outputs)
		{
			var output = this.outputs[i];
			if(!output.links || !output.links.length)
				continue;
			switch( output.name )
			{
				case "Transform": this.setOutputData(i, node.getTransform() ); break;
				case "Material": this.setOutputData(i, node.getMaterial() ); break;
				case "Light": this.setOutputData(i, node.getLight() ); break;
				case "Camera": this.setOutputData(i, node.getCamera() ); break;
				case "Mesh": this.setOutputData(i, node.getMesh()); break;
				case "Visible": this.setOutputData(i, node.flags.visible ); break;
			}
		}
	}

	LGraphSceneNode.prototype.onGetInputs = function()
	{
		return [["Transform","Transform"],["Material","Material"],["Mesh","Mesh"],["Enabled","boolean"]];
	}

	LGraphSceneNode.prototype.onGetOutputs = function()
	{
		var r = [["Transform","Transform"],["Material","Material"],["Mesh","Mesh"],["Enabled","boolean"]];
		var node = this.getNode();
		if(node.light)
			r.push(["Light","Light"]);
		if(node.camera)
			r.push(["Camera","Camera"]);
		return r;
	}

	LiteGraph.registerNodeType("scene/node", LGraphSceneNode );
	window.LGraphSceneNode = LGraphSceneNode;

	//********************************************************

	function LGraphMaterial()
	{
		this.properties = {mat_name:""};
		this.addInput("Material","Material");
		this.size = [100,20];
	}

	LGraphMaterial.title = "Material";
	LGraphMaterial.desc = "Material of a node";

	LGraphMaterial.prototype.onExecute = function()
	{
		var node = this._node;
		if(	this.properties.node_id )
			node = Scene.getNode( this.properties.node_id );

		if(!node)
			node = this.graph._scenenode;

		var mat = null;
		if(node) //use material of the node
			mat = node.getMaterial();
		//if it has an input material
		var slot = this.findInputSlot("Material");
		if( slot != -1)
			mat = this.getInputData(slot);
		if(!mat)
			mat = new Material();

		//read inputs
		for(var i in this.inputs)
		{
			var input = this.inputs[i];
			var v = this.getInputData(i);
			if(v == undefined)
				continue;

			switch( input.name )
			{
				case "Alpha": mat.alpha = v; break;
				case "Specular f.": mat.specular_factor = v; break;
				case "Diffuse": vec3.copy(mat.diffuse,v); break;
				case "Ambient": vec3.copy(mat.ambient,v); break;
				case "Emissive": vec3.copy(mat.emissive,v); break;
				case "UVs trans.": mat.uvs_matrix.set(v); break;
				default:
					if(input.name.substr(0,4) == "Tex.")
					{
						var channel = input.name.substr(4);
						mat.setTexture(v, channel);
					}
					break;
			}

		}

		//write outputs
		for(var i in this.outputs)
		{
			var output = this.outputs[i];
			if(!output.links || !output.links.length)
				continue;

			var v;
			switch( output.name )
			{
				case "Material": v = mat; break;
				case "Alpha": v = mat.alpha; break;
				case "Specular f.": v = mat.specular_factor; break;
				case "Diffuse": v = mat.diffuse; break;
				case "Ambient": v = mat.ambient; break;
				case "Emissive": v = mat.emissive; break;
				case "UVs trans.": v = mat.uvs_matrix; break;
				default: continue;
			}
			this.setOutputData(i, v );
		}

		//this.setOutputData(0, parseFloat( this.properties["value"] ) );
	}

	LGraphMaterial.prototype.onGetInputs = function()
	{
		var results = [["Material","Material"],["Alpha","number"],["Specular f.","number"],["Diffuse","color"],["Ambient","color"],["Emissive","color"],["UVs trans.","texmatrix"]];
		for(var i in Material.TEXTURE_CHANNELS)
			results.push(["Tex." + Material.TEXTURE_CHANNELS[i],"Texture"]);
		return results;
	}

	LGraphMaterial.prototype.onGetOutputs = function()
	{
		var results = [["Material","Material"],["Alpha","number"],["Specular f.","number"],["Diffuse","color"],["Ambient","color"],["Emissive","color"],["UVs trans.","texmatrix"]];
		for(var i in Material.TEXTURE_CHANNELS)
			results.push(["Tex." + Material.TEXTURE_CHANNELS[i],"Texture"]);
		return results;
	}

	LiteGraph.registerNodeType("scene/material", LGraphMaterial );
	window.LGraphMaterial = LGraphMaterial;

	//********************************************************

	function LGraphLight()
	{
		this.properties = {mat_name:""};
		this.addInput("Light","Light");
		this.addOutput("Intensity","number");
		this.addOutput("Color","color");
	}

	LGraphLight.title = "Light";
	LGraphLight.desc = "Light from a scene";

	LGraphLight.prototype.onExecute = function()
	{
		var node = this._node;
		if(	this.properties.node_id )
			node = Scene.getNode( this.properties.node_id );

		if(!node)
			node = this.graph._scenenode;

		var light = null;
		if(node) //use light of the node
			light = node.getLight();
		//if it has an input light
		var slot = this.findInputSlot("Light");
		if( slot != -1 )
			light = this.getInputData(slot);
		if(!light)
			return;

		//read inputs
		for(var i in this.inputs)
		{
			var input = this.inputs[i];
			var v = this.getInputData(i);
			if(v == undefined)
				continue;

			switch( input.name )
			{
				case "Intensity": light.intensity = v; break;
				case "Color": vec3.copy(light.color,v); break;
				case "Eye": vec3.copy(light.eye,v); break;
				case "Center": vec3.copy(light.center,v); break;
			}
		}

		//write outputs
		for(var i in this.outputs)
		{
			var output = this.outputs[i];
			if(!output.links || !output.links.length)
				continue;

			switch( output.name )
			{
				case "Light": this.setOutputData(i, light ); break;
				case "Intensity": this.setOutputData(i, light.intensity ); break;
				case "Color": this.setOutputData(i, light.color ); break;
				case "Eye": this.setOutputData(i, light.eye ); break;
				case "Center": this.setOutputData(i, light.center ); break;
			}
		}
	}

	LGraphLight.prototype.onGetInputs = function()
	{
		return [["Light","Light"],["Intensity","number"],["Color","color"],["Eye","vec3"],["Center","vec3"]];
	}

	LGraphLight.prototype.onGetOutputs = function()
	{
		return [["Light","Light"],["Intensity","number"],["Color","color"],["Eye","vec3"],["Center","vec3"]];
	}

	LiteGraph.registerNodeType("scene/light", LGraphLight );
	window.LGraphLight = LGraphLight;

	//********************************************************

	function LGraphScene()
	{
		this.addOutput("Time","number");
	}

	LGraphScene.title = "Scene";
	LGraphScene.desc = "Scene";

	LGraphScene.prototype.onExecute = function()
	{
		//read inputs
		for(var i in this.inputs)
		{
			var input = this.inputs[i];
			var v = this.getInputData(i);
			if(v == undefined)
				continue;

			switch( input.name )
			{
				case "Ambient color": vec3.copy(Scene.ambient_color,v); break;
				case "Bg Color": vec3.copy(Scene.background_color,v); break;
			}
		}

		//write outputs
		for(var i in this.outputs)
		{
			var output = this.outputs[i];
			if(!output.links || !output.links.length)
				continue;
			switch( output.name )
			{
				case "Light": this.setOutputData(i, Scene.light ); break;
				case "Camera": this.setOutputData(i, Scene.camera ); break;
				case "Ambient color": this.setOutputData(i, Scene.ambient_color ); break;
				case "Bg Color": this.setOutputData(i, Scene.background_color ); break;
				case "Time": this.setOutputData(i, Scene._time ); break;
				case "Elapsed": this.setOutputData(i, Scene._last_dt != null ? Scene._last_dt : 0); break;
				case "Frame": this.setOutputData(i, Scene._frame != null ? Scene._frame : 0 ); break;
			}
		}
	}

	LGraphScene.prototype.onGetOutputs = function()
	{
		return [["Light","Light"],["Camera","Camera"],["Ambient color","color"],["Bg Color","color"],["Elapsed","number"],["Frame","number"]];
	}

	LiteGraph.registerNodeType("scene/scene", LGraphScene );
	window.LGraphScene = LGraphScene;

	//************************************

	function LGraphGlobal()
	{
		this.addOutput("Value","number");
		this.properties = {name:"myvar", value: 0, min:0, max:1 };
	}

	LGraphGlobal.title = "Global";
	LGraphGlobal.desc = "Global var for the graph";

	LGraphGlobal.prototype.onExecute = function()
	{
		if(!this.properties.name)
			return;

		this.setOutputData(0, this.properties.value);
	}

	LiteGraph.registerNodeType("scene/global", LGraphGlobal );
	window.LGraphGlobal = LGraphGlobal;

	//************************************


	function LGraphTexture()
	{
		this.addOutput("Texture","Texture");
		this.properties = {name:""};
	}

	LGraphTexture.title = "Texture";
	LGraphTexture.desc = "Texture";

	LGraphTexture.prototype.onExecute = function()
	{
		if(!this.properties.name)
			return;

		var tex = ResourcesManager.textures[ this.properties.name ];
		if(!tex)
			ResourcesManager.loadImage( this.properties.name );
		this.setOutputData(0, tex);
	}

	LiteGraph.registerNodeType("texture/texture", LGraphTexture );
	window.LGraphTexture = LGraphTexture;

	//**************************************

	function LGraphTextureOperation()
	{
		this.addInput("Texture","Texture");
		this.addInput("TextureB","Texture");
		this.addInput("value","number");
		this.addOutput("Texture","Texture");
		this.help = "<p>pixelcode must be vec3</p>\
			<p>uvcode must be vec2, is optional</p>\
			<p><strong>uv:</strong> tex. coords, <strong>color:</strong> texture, <strong>colorB:</strong> textureB, <strong>time:</strong> scene time,<strong>value:</strong> input value</p>";
		this.properties = {value:1, uvcode:"", pixelcode:"color*2.0"};
		if(!LGraphTextureOperation._mesh) //first time
		{
			var vertices = new Float32Array(18);
			var coords = [-1,-1, 1,1, -1,1,  -1,-1, 1,-1, 1,1 ];
			LGraphTextureOperation._mesh = new GL.Mesh.load({
				vertices: vertices,
				coords: coords});
			Shaders.addGlobalShader( LGraphTextureOperation.vertex_shader, 
									LGraphTextureOperation.pixel_shader,
									"LGraphTextureOperation",{"UV_CODE":true,"PIXEL_CODE":true});
		}
	}

	LGraphTextureOperation.title = "Tex. Op";
	LGraphTextureOperation.desc = "Texture shader operation";

	LGraphTextureOperation.prototype.onExecute = function()
	{
		var tex = this.getInputData(0);
		var texB = this.getInputData(1);

		if(!this.properties.uvcode && !this.properties.pixelcode)
			return;

		var width = 512;
		var height = 512;
		if(tex)
		{
			width = tex.width;
			height = tex.height;
		}
		else if (texB)
		{
			width = texB.width;
			height = texB.height;
		}

		if(!this._tex || this._tex.width != width || this._tex.height != height )
			this._tex = new GL.Texture( width, height, { format: gl.RGBA, filter: gl.LINEAR });

		var uvcode = "";
		if(this.properties.uvcode)
		{
			uvcode = "uv = " + this.properties.uvcode;
			if(this.properties.uvcode.indexOf(";") != -1) //there are line breaks, means multiline code
				uvcode = this.properties.uvcode;
		}
		
		var pixelcode = "";
		if(this.properties.pixelcode)
		{
			pixelcode = "result = " + this.properties.pixelcode;
			if(this.properties.pixelcode.indexOf(";") != -1) //there are line breaks, means multiline code
				pixelcode = this.properties.pixelcode;
		}

		var shader = Shaders.get("LGraphTextureOperation", { UV_CODE: uvcode, PIXEL_CODE: pixelcode });
		if(shader)
		{
			var value = this.getInputData(2);
			if(value != null)
				this.properties.value = value;
			else
				value = parseFloat( this.properties.value );

			this._tex.drawTo(function() {
				gl.disable( gl.DEPTH_TEST );
				gl.disable( gl.CULL_FACE );
				gl.disable( gl.BLEND );
				if(tex)	tex.bind(0);
				if(texB) texB.bind(1);
				shader.uniforms({texture:0, textureB:1, value: value, texSize:[width,height], time: Scene._global_time - Scene._start_time}).draw( LGraphTextureOperation._mesh );
			});

			this.setOutputData(0, this._tex);
		}
	}

	LGraphTextureOperation.vertex_shader = "precision highp float;\n\
			attribute vec3 a_vertex;\n\
			attribute vec2 a_coord;\n\
			varying vec2 coord;\n\
			void main() {\n\
				coord = a_coord; gl_Position = vec4(coord * 2.0 - 1.0, 0.0, 1.0);\n\
			}\n\
			";

	LGraphTextureOperation.pixel_shader = "precision highp float;\n\
			\n\
			uniform sampler2D texture;\n\
			uniform sampler2D textureB;\n\
			varying vec2 coord;\n\
			uniform vec2 texSize;\n\
			uniform float time;\n\
			uniform float value;\n\
			\n\
			void main() {\n\
				vec2 uv = coord;\n\
				UV_CODE;\n\
				vec3 color = texture2D(texture, uv).rgb;\n\
				vec3 colorB = texture2D(textureB, uv).rgb;\n\
				vec3 result = vec3(0.0);\n\
				PIXEL_CODE;\n\
				gl_FragColor = vec4(result, 1.0);\n\
			}\n\
			";

	LiteGraph.registerNodeType("texture/textureop", LGraphTextureOperation );
	window.LGraphTextureOperation = LGraphTextureOperation;

	//**************************
	function LGraphTexturePreview()
	{
		this.addInput("Texture","Texture");
		this.size = [LGraphTexturePreview.img_size, LGraphTexturePreview.img_size];
	}

	LGraphTexturePreview.title = "Texture preview";
	LGraphTexturePreview.desc = "Show a texture in the graph canvas";
	LGraphTexturePreview.img_size = 256;

	LGraphTexturePreview.prototype.onDrawBackground = function(ctx)
	{
		var tex = this.getInputData(0);
		if(!tex) return;
		var size = LGraphTexturePreview.img_size;

		//Generate low-level version in the GPU to speed up
		if(tex.width > size || tex.height > size)
		{
			var temp_tex = this._temp_tex;
			if(!this._temp_tex)
			{
				temp_tex = new GL.Texture(size,size, { minFilter: gl.NEAREST });
				this._temp_tex = temp_tex;
			}

			//copy
			tex.copyTo(temp_tex);
			tex = temp_tex;
		}

		//create intermediate canvas with lowquality version
		var tex_canvas = this._canvas;
		if(!tex_canvas)
		{
			tex_canvas = createCanvas(size,size);
			this._canvas = tex_canvas;
		}
		temp_tex.toCanvas(tex_canvas);

		//render to graph canvas
		ctx.drawImage(tex_canvas,0,0,this.size[0],this.size[1]);
	}

	LiteGraph.registerNodeType("texture/texpreview", LGraphTexturePreview );
	window.LGraphTexturePreview = LGraphTexturePreview;
}
/**
* KnobComponent allows to rotate a mesh like a knob
* @class KnobComponent
* @constructor
* @param {String} object to configure from
*/

function KnobComponent(o)
{
	this.value = o.value || 0;
	this.delta = o.delta || 0.01; //pixels to value delta

	this.steps = o.steps || 0; //0 = continuous
	this.min_value = o.min_value || 0;
	this.max_value = o.max_value || 1;
	this.min_angle = o.min_angle || -120;
	this.max_angle = o.max_angle || 120;
	this.axis = o.axis || [0,0,1];

	if(o)
		this.configure(o);
}

/**
* Configure the component getting the info from the object
* @method configure
* @param {Object} object to configure from
*/

KnobComponent.prototype.configure = function(o)
{
	cloneObject(o, this);
}

/**
* Serialize this component)
* @method serialize
* @return {Object} object with the serialization info
*/

KnobComponent.prototype.serialize = function()
{
	 var o = cloneObject(this);
	 return o;
}

KnobComponent.prototype.onAddedToNode = function(node)
{
	node.interactive = true;
	LEvent.bind(node,"mousemove",this.onmousemove,this);
	this.updateKnob();
}

KnobComponent.prototype.updateKnob = function() {
	if(!this._root) return;
	var f = this.value / (this.max_value - this.min_value)
	quat.setAxisAngle(this._root.transform._rotation,this.axis, (this.min_angle + (this.max_angle - this.min_angle) * f )* DEG2RAD);
	this._root.transform._dirty = true;
}

KnobComponent.prototype.onmousemove = function(e, mouse_event) { 
	this.value -= mouse_event.deltaY * this.delta;

	if(this.value > this.max_value) this.value = this.max_value;
	else if(this.value < this.min_value) this.value = this.min_value;

	this.updateKnob();

	LEvent.trigger( this, "change", this.value);
	if(this._root)
		LEvent.trigger( this._root, "knobChange", this.value);
};

LS.registerComponent(KnobComponent);
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

	this.particle_alpha_curve = [[0.5,1]];

	this.texture_grid_size = 1;

	//physics
	this.physics_gravity = [0,0,0];
	this.physics_friction = 0;

	//material
	this.alpha = 1;
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

ParticleEmissor.BOX_EMISSOR = 1;
ParticleEmissor.SPHERE_EMISSOR = 2;
ParticleEmissor.MESH_EMISSOR = 3;

ParticleEmissor.prototype.onAddedToNode = function(node)
{
	LEvent.bind(node,"update",this.onUpdate,this);
	LEvent.bind(node,"start",this.onStart,this);
}

ParticleEmissor.prototype.onRemovedFromNode = function(node)
{
	LEvent.unbind(node,"update",this.onUpdate,this);
	LEvent.unbind(node,"start",this.onStart,this);
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
	this._root.transform.getPositionGlobal(this._emissor_pos);

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
		this.updateMesh(Scene.current_camera);

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
	this._mesh = Mesh.load({ vertices:this._vertices, coords: this._coords, colors: this._colors, stream_type: gl.STREAM_DRAW });
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
	var alpha_curve = new Float32Array((this.particle_life * 60)<<0);
	var size_curve = new Float32Array((this.particle_life * 60)<<0);

	var dI = 1 / (this.particle_life * 60);
	for(var i = 0; i < alpha_curve.length; i += 1)
	{
		alpha_curve[i] = LS.getCurveValueAt(this.particle_alpha_curve,0,1,0, i * dI );
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

		if(recompute_colors) //compute color and alpha
		{
			var a = alpha_curve[(f*alpha_curve.length)<<0]; //getCurveValueAt(this.particle_alpha_curve,0,1,0,f);

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
			vec3.transformQuat(s_bottomleft, rot, s_bottomleft);
			quat.multiplyVec3(s_topright, rot, s_topright);
			quat.multiplyVec3(s_topleft, rot, s_topleft);
			quat.multiplyVec3(s_bottomright, rot, s_bottomright);
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
	this._mesh.vertexBuffers.a_vertex.data = this._vertices;
	this._mesh.vertexBuffers.a_color.data = this._colors;
	this._mesh.vertexBuffers.a_vertex.compile();
	this._mesh.vertexBuffers.a_color.compile();

	if(recompute_coords)
	{
		this._mesh.vertexBuffers.a_coord.data = this._coords;
		this._mesh.vertexBuffers.a_coord.compile();
	}

	//this._mesh.vertices = this._vertices;
	//this._mesh.compile();
}

ParticleEmissor._identity = mat4.create();

ParticleEmissor.prototype.getRenderInstance = function(options,camera)
{
	if(this.align_always)
		this.updateMesh(camera);

	if(!this._material)
		this._material = new Material({ alpha: this.alpha - 0.01, shader:"lowglobalshader" });

	this._material.alpha = this.alpha - 0.01; //try to keep it under 1
	this._material.setTexture(this.texture);
	this._material.blending = this.additive_blending ? Material.ADDITIVE_BLENDING : Material.NORMAL;
	this._material.soft_particles = this.soft_particles;
	this._material.constant_diffuse = true;

	if(!this._mesh)
		return null;

	this._matrix = this._matrix || mat4.create();

	var RI = this._render_instance || new RenderInstance();
	RI.mesh = this._mesh;
	RI.material = (this._root.material && this.use_node_material) ? this._root.getMaterial() : this._material;
	RI.matrix.set( this.follow_emitter ? 
					mat4.translate( this._matrix, ParticleEmissor._identity, this._root.transform._position ) : 
					ParticleEmissor._identity),
	RI.length = this._visible_particles * 6;
	return RI;
}


LS.registerComponent(ParticleEmissor);
/**
* Realtime Reflective surface
* @class RealtimeReflector
* @constructor
* @param {String} object to configure from
*/


function RealtimeReflector(o)
{
	this.texture_size = 512;
	this.brightness_factor = 1.0;
	this.colorclip_factor = 0.0;
	this.clip_offset = 0.5; //to avoid ugly edges near clipping plane
	this.rt_name = "";
	this.use_cubemap = false;
	this.use_mesh_info = false;
	this.refresh_rate = 1; //in frames
	this._rt = null;

	if(o)
		this.configure(o);
}

RealtimeReflector.prototype.onAddedToNode = function(node)
{
	if(!this._bind_onRenderRT)
		this._bind_onRenderRT = this.onRenderRT.bind(this);

	LEvent.bind(node,"afterRenderShadows",this._bind_onRenderRT,this);
}


RealtimeReflector.prototype.onRemoveFromNode = function(node)
{
	LEvent.unbind(node,"afterRenderShadows",this._bind_onRenderRT,this);
}


RealtimeReflector.prototype.onRenderRT = function(e,camera)
{
	if(!this._root) return;

	this.refresh_rate = this.refresh_rate << 0;

	if( (Scene._frame == 0 || (Scene._frame % this.refresh_rate) != 0) && this._rt)
		return;

	//texture
	if( !isPowerOfTwo(this.texture_size) )
		this.texture_size = 256;

	var texture_type = this.use_cubemap ? gl.TEXTURE_CUBE_MAP : gl.TEXTURE_2D;
	if(!this._rt || this._rt.width != this.texture_size || this._rt.texture_type != texture_type )
		this._rt = new Texture(this.texture_size,this.texture_size, { texture_type: texture_type });

	var plane_center = this._root.transform.getPositionGlobal();
	var plane_normal = this._root.transform.getTop();

	//use the first vertex and normal from a mesh
	if(this.use_mesh_info)
	{
		var mesh = this._root.getMesh();
		if(mesh)
		{
			plane_center = this._root.transform.transformPointGlobal( [mesh.vertices[0],mesh.vertices[1],mesh.vertices[2]] );
			plane_normal = this._root.transform.transformVectorGlobal( [mesh.normals[0],mesh.normals[1],mesh.normals[2]] );
		}
	}

	//camera
	var cam = new Camera( camera.serialize() );
	var visible = this._root.flags.visible;
	this._root.flags.visible = false;

	if( !this.use_cubemap )
	{
		cam.aspect = camera.aspect;
		cam.eye = geo.reflectPointInPlane( camera.eye, plane_center, plane_normal );
		cam.center = geo.reflectPointInPlane( camera.center, plane_center, plane_normal );
		cam.up = geo.reflectPointInPlane( camera.up, [0,0,0], plane_normal );

		//little offset
		vec3.add(plane_center, plane_center,vec3.scale(vec3.create(), plane_normal, -this.clip_offset));
		var clipping_plane = [plane_normal[0], plane_normal[1], plane_normal[2], vec3.dot(plane_center, plane_normal)  ];

		Renderer.renderSceneMeshesToRT(cam,this._rt, {clipping_plane: clipping_plane, is_rt: true, is_reflection: true, brightness_factor: this.brightness_factor, colorclip_factor: this.colorclip_factor});
	}
	else
	{
		cam.eye = plane_center;
		Renderer.renderSceneMeshesToRT(cam,this._rt, {is_rt: true, is_reflection: true, brightness_factor: this.brightness_factor, colorclip_factor: this.colorclip_factor});
	}

	this._root.flags.visible = visible;

	if(this.rt_name)
		ResourcesManager.registerResource(this.rt_name, this._rt);

	if(!this._root.material) return;
	
	this._root.material.setTexture(this.rt_name ? this.rt_name : this._rt, Material.ENVIRONMENT_TEXTURE, Material.COORDS_SCREEN);
}

LS.registerComponent(RealtimeReflector);
function ScriptComponent(o)
{
	this.enabled = true;
	this.code = "function update(dt)\n{\n\tScene.refresh();\n}";
	this._component = null;

	//this.component_name = "";
	//this.register_component = false;
	this.configure(o);
	if(this.code)
		this.processCode();
}

ScriptComponent["@code"] = {type:'script'};

ScriptComponent.valid_callbacks = ["start","update"];

ScriptComponent.prototype.processCode = function()
{
	var name = this.component_name || "__last_component";
	var code = this.code;
	code = "function "+name+"(component, node) {\n" + code + "\n";

	var extra_code = "";
	for(var i in ScriptComponent.valid_callbacks)
		extra_code += "	if(typeof("+ScriptComponent.valid_callbacks[i]+") != 'undefined') this."+ ScriptComponent.valid_callbacks[i] + " = "+ScriptComponent.valid_callbacks[i]+";\n";

	extra_code += "\n}\nwindow."+name+" = "+name+";\n";

	//disabled feature
	var register = false && this.component_name && this.register_component;

	/* this creates a new component on the fly but seems dangerous
	if(register)
	{
		extra_code += name + ".prototype.onStart = function() { if(this.start) this.start(); }\n";
		extra_code += name + ".prototype.onUpdate = function(e,dt) { if(this.update) this.update(dt); }\n";
		extra_code += name + ".prototype.onAddedToNode = function(node) { \
			LEvent.bind(Scene,'start', this.onStart.bind(this) );\n\
			LEvent.bind(Scene,'update', this.onUpdate.bind(this) );\n\
		};\n";
		extra_code += name + ".prototype.onRemovedFromNode = function(node) { \
			LEvent.unbind(Scene,'start', (function() { if(this.start) this.start(); }).bind(this) );\n\
			LEvent.unbind(Scene,'update', (function(e,dt) { if(this.update) this.update(dt); }).bind(this) );\n\
		};\n";
	}
	*/

	code += extra_code;

	try
	{
		this._last_executed_code = code;
		//trace(code);
		eval(code);
		this._component_class = window[name];
		this._component = new this._component_class( this, this._root );
		//if(register) LS.registerComponent(this._component_class);
	}
	catch (err)
	{
		this._component_class = null;
		this._component = null;
		trace("Error in script\n" + err);
		trace(this._last_executed_code );
	}
}


ScriptComponent.prototype.onAddedToNode = function(node)
{
	this._onStart_bind = this.onStart.bind(this);
	this._onUpdate_bind = this.onUpdate.bind(this);
	LEvent.bind(Scene,"start", this._onStart_bind );
	LEvent.bind(Scene,"update", this._onUpdate_bind );
}

ScriptComponent.prototype.onRemovedFromNode = function(node)
{
	LEvent.unbind(Scene,"start", this._onStart_bind );
	LEvent.unbind(Scene,"update", this._onUpdate_bind );
}

ScriptComponent.prototype.onStart = function()
{
	this.processCode();

	if(this.enabled && this._component && this._component.start)
		this._component.start();
}

ScriptComponent.prototype.onUpdate = function(e,dt)
{
	if(this.enabled && this._component && this._component.update)
		this._component.update(dt);
}


LS.registerComponent(ScriptComponent);
function TerrainRenderer(o)
{
	this.height = 2;
	this.size = 10;

	this.subdivisions = 10;
	this.heightmap = null;
	this.auto_update = true;
	this._mesh = null;
	this.action = "Update"; //button
	if(o)
		this.configure(o);
}

/**
* Configure the component getting the info from the object
* @method configure
* @param {Object} object to configure from
*/

TerrainRenderer.prototype.configure = function(o)
{
	cloneObject(o, this);
}

/**
* Serialize this component)
* @method serialize
* @return {Object} object with the serialization info
*/

TerrainRenderer.prototype.serialize = function()
{
	 var o = cloneObject(this);
	 return o;
}

TerrainRenderer.prototype.getResources = function(res)
{
	if(this.heightmap)
		res[ this.heightmap ] = Texture;
}

TerrainRenderer["@subdivisions"] = { widget: "number", min:1,max:255,step:1 };
TerrainRenderer["@heightmap"] = { widget: "texture" };
TerrainRenderer["@action"] = { widget: "button", callback: function() { this.options.component.updateMesh(); }};

TerrainRenderer.prototype.updateMesh = function()
{
	trace("updating terrain mesh...");
	//check that we have all the data
	if(!this.heightmap) return;
	var heightmap = typeof(this.heightmap) == "string" ? ResourcesManager.textures[this.heightmap] : this.heightmap;
	if(!heightmap) return;
	var img = heightmap.img;
	if(!img) return;

	if(this.subdivisions > img.width)
		this.subdivisions = img.width;
	if(this.subdivisions > img.height)
		this.subdivisions = img.height;

	if(this.subdivisions > 255)	this.subdivisions = 255; //MAX because of indexed nature

	//optimize it
	var size = this.size;
	var subdivisions = (this.subdivisions)<<0;
	var height = this.height;

	//get the pixels
	var canvas = createCanvas(subdivisions,subdivisions);
	var ctx = canvas.getContext("2d");
	ctx.drawImage(img,0,0,img.width,img.height,0,0,canvas.width, canvas.height);
	//$("body").append(canvas);

	var pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
	var data = pixels.data;

	//create the mesh
	var triangles = [];
	var vertices = [];
	var normals = [];
	var coords = [];

	var detailY = detailX = subdivisions-1;
	var h,lh,th,rh,bh = 0;

	var yScale = height;
	var xzScale = size / (subdivisions-1);

	for (var y = 0; y <= detailY; y++) 
	{
		var t = y / detailY;
		for (var x = 0; x <= detailX; x++) 
		{
			var s = x / detailX;

			h = data[y * subdivisions * 4 + x * 4] / 255; //red channel
			vertices.push(size*(2 * s - 1), h * height, size*(2 * t - 1));
			coords.push(s,1-t);

			if(x == 0 || y == 0 || x == detailX-1 || y == detailY-1)
				normals.push(0, 1, 0);
			else
			{
				var sX = (data[y * subdivisions * 4 + (x+1) * 4] / 255) - (data[y * subdivisions * 4 + (x-1) * 4] / 255);
				var sY = (data[(y+1) * subdivisions * 4 + x * 4] / 255) - (data[(y-1) * subdivisions * 4 + x * 4] / 255);
				var N = [-sX*yScale,2*xzScale,-sY*yScale];
				vec3.normalize(N,N);
				normals.push(N[0],N[1],N[2]);
			}

			//add triangle
			if (x < detailX && y < detailY)
			{
				var i = x + y * (detailX + 1);
				triangles.push(i+1, i, i + detailX + 1);
				triangles.push(i + 1, i + detailX + 1, i + detailX + 2);
			}
		}
	}

	var mesh = Mesh.load({triangles:triangles,vertices:vertices,normals:normals,coords:coords});
	this._mesh = mesh;
	this._info = [ this.heightmap, this.size, this.height, this.subdivisions, this.smooth ];
}

TerrainRenderer.PLANE = null;

TerrainRenderer.prototype.getRenderInstance = function()
{
	if(!this._mesh && this.heightmap)
		this.updateMesh();

	if(this.auto_update && this._info)
	{
		if( this._info[0] != this.heightmap || this._info[1] != this.size || this._info[2] != this.height || this._info[3] != this.subdivisions || this._info[4] != this.smooth )
			this.updateMesh();
	}

	if(!this._mesh)
	{
		if(!TerrainRenderer.PLANE)
			TerrainRenderer.PLANE = GL.Mesh.plane({xz:true,normals:true,coords:true});	
		return { mesh: TerrainRenderer.PLANE }
	};

	return { 
		mesh: this._mesh
	};
}

LS.registerComponent(TerrainRenderer);

/**
* RenderInstance contains info of one object to be rendered on the scene.
*
* @class RenderInstance
* @namespace LS
* @constructor
*/

//flags
RenderInstance.TWO_SIDED = 1;

function RenderInstance()
{
	this._key = "";
	this._uid = LS.generateUId();
	this.mesh = null;
	this.primitive = gl.TRIANGLES;
	this.material = null;
	this.flags = 0;
	this.matrix = mat4.create();
	this.center = vec3.create();
}

RenderInstance.prototype.generateKey = function(step, options)
{
	this._key = step + "|" + this.node._uid + "|" + this.material._uid + "|";
	return this._key;
}

	//this func is executed using the instance as SCOPE: TODO, change it
RenderInstance.prototype.render = function(shader)
{
	if(this.submesh_id != null && this.submesh_id != -1 && this.mesh.info.groups && this.mesh.info.groups.length > this.submesh_id)
		shader.drawRange(this.mesh, this.primitive, this.mesh.info.groups[this.submesh_id].start, this.mesh.info.groups[this.submesh_id].length);
	else if(this.start || this.length)
		shader.drawRange(this.mesh, this.primitive, this.start || 0, this.length);
	else
		shader.draw(this.mesh, this.primitive);
}


//************************************
/**
* The Renderer is in charge of generating one frame of the scene. Contains all the passes and intermediate functions to create the frame.
*
* @class Renderer
* @namespace LS
* @constructor
*/

var Renderer = {

	apply_postfx: true,
	generate_shadowmaps: true,
	sort_nodes_in_z: true,
	z_pass: false, //enable when the shaders are too complex (normalmaps, etc) to reduce work of the GPU (still some features missing)

	//TODO: postfx integrated in render pipeline, not in use right now
	postfx_settings: { width: 1024, height: 512 },
	postfx: [], //
	_postfx_texture_a: null,
	_postfx_texture_b: null,

	_renderkeys: {},

	//temp variables for rendering pipeline passes
	_current_scene: null,
	_default_material: new Material(), //used for objects without material
	_visible_lights: [],

	_visible_meshes: [],
	_opaque_meshes: [],
	_alpha_meshes: [],

	/**
	* Renders the current scene to the screen
	*
	* @method render
	* @param {SceneTree} scene
	* @param {Camera} camera
	* @param {Object} options
	*/
	render: function(scene, camera, options)
	{
		options = options || {};

		scene = scene || Scene;
		this._current_scene = scene;

		//events
		LEvent.trigger(Scene, "beforeRender", scene.current_camera);
		scene.sendEventToNodes("beforeRender", scene.current_camera);

		if(scene.light && scene.light.onBeforeRender) 
			scene.light.onBeforeRender(); //ugly hack because the scene could have a light and it is not a node

		//get lights
		this.updateVisibleLights(scene, options.nodes);

		//generate shadowmap
		if(scene.settings.enable_shadows && !options.skip_shadowmaps && this.generate_shadowmaps && !options.shadows_disabled && !options.lights_disabled)
			this.renderShadowMaps();

		LEvent.trigger(Scene, "afterRenderShadows", scene.current_camera);
		scene.sendEventToNodes("afterRenderShadows", scene.current_camera);

		//generate RTs
		if(scene.settings.enable_rts && !options.skip_rts)
			if(scene.rt_cameras.length > 0)
				this.renderRTCameras();

		//scene
		scene.active_viewport = scene.viewport || [0,0,gl.canvas.width, gl.canvas.height];
		scene.current_camera.aspect = scene.active_viewport[2]/scene.active_viewport[3];

		if(this.apply_postfx && this.postfx.length) //render to RT and apply FX //NOT IN USE
			this.renderPostFX(inner_draw);
		else if(options.texture && options.depth_texture) //render to RT COLOR & DEPTH
			Texture.drawToColorAndDepth(options.texture, options.depth_texture, inner_draw);
		else if(options.texture) //render to RT
			options.texture.drawTo(inner_draw)
		else //render directly to screen (better antialiasing)
		{
			gl.viewport( scene.active_viewport[0], scene.active_viewport[1], scene.active_viewport[2], scene.active_viewport[3] );
			inner_draw();
			gl.viewport(0,0,gl.canvas.width,gl.canvas.height);
		}

		//events
		LEvent.trigger(Scene, "afterRender", scene.current_camera);
		Scene.sendEventToNodes("afterRender",scene.current_camera);
		if(scene.light && scene.light.onAfterRender) //fix this plz
			scene.light.onAfterRender();
		Scene._frame += 1;
		Scene._must_redraw = false;

		//render scene (callback format for render targets)
		function inner_draw()
		{
			//gl.scissor( this.active_viewport[0], this.active_viewport[1], this.active_viewport[2], this.active_viewport[3] );
			//gl.enable(gl.SCISSOR_TEST);
			gl.clearColor(scene.background_color[0],scene.background_color[1],scene.background_color[2], scene.background_color.length > 3 ? scene.background_color[3] : 1.0);
			if(options.ignore_clear != true)
				gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

			Renderer.enableCamera(scene.current_camera);
			//render scene
			//RenderPipeline.renderSceneMeshes(options);
			Renderer.renderSceneMeshes("main",options);

			LEvent.trigger(Scene, "afterRenderScene", scene.current_camera);
			//gl.disable(gl.SCISSOR_TEST);
		}

	},

	//reusable locals
	_view_matrix: mat4.create(),
	_projection_matrix: mat4.create(),
	_viewprojection_matrix: mat4.create(),
	_mvp_matrix: mat4.create(),

	_temp_matrix: mat4.create(),
	_world_model: mat4.create(),
	_object_model: mat4.create(),
	_normal_model: mat4.create(),

	/**
	* Set camera as the main scene camera
	*
	* @method enableCamera
	* @param {Camera} camera
	*/
	enableCamera: function(camera)
	{
		camera.setActive();
		camera.updateMatrices();
		mat4.copy( this._view_matrix, camera._view_matrix );
		mat4.copy( this._projection_matrix, camera._projection_matrix );
		mat4.copy( this._viewprojection_matrix, camera._viewprojection_matrix );
		this.active_camera = camera;
	},

	/**
	* This function renderes all the meshes to the current rendering context (screen, Texture...)
	*
	* @method renderSceneMeshes
	* @param {Object} options
	*/
	renderSceneMeshesOld: function(options)
	{
		var scene = this.current_scene || Scene;
		options = options || {};

		var picking_next_color_id = 0;
		var brightness_factor = options.brightness_factor != null ? options.brightness_factor : 1;
		var colorclip_factor = options.colorclip_factor != null ? options.colorclip_factor : 0;

		options.camera = this.active_camera;

		LEvent.trigger(Scene, "beforeRenderPass", options);
		Scene.sendEventToNodes("beforeRenderPass", options);

		gl.enable( gl.DEPTH_TEST );
		gl.depthFunc( gl.LESS );
		gl.disable( gl.BLEND );
		gl.lineWidth(1);

		//EVENT SCENE before_render

		var overwrite_shader = null;
		if(options.force_shader)
			overwrite_shader = Shaders.get(options.force_shader);

		var temp_vector = vec3.create();

		//generic uniforms
		var uniforms = {
			u_camera_eye: this.active_camera.eye,
			u_camera_planes: [this.active_camera.near, this.active_camera.far],
			u_viewprojection: this._viewprojection_matrix,
			u_brightness_factor: brightness_factor,
			u_colorclip_factor: colorclip_factor,
			u_time: Scene.current_time || new Date().getTime() * 0.001
		};

		var renderpass_info = { camera: this.active_camera, instance: null, node:null, uniforms: uniforms, macros:null, light: null, lights: this._visible_lights };

		LEvent.trigger(Scene,"fillGlobalUniforms", renderpass_info );

		var clipping_plane = options.clipping_plane;

		//SORTING meshes
		this.updateVisibleMeshesOld(scene,options);

		//Z Draw
		options.pass = "z";
		if(this.z_pass)
		{
			gl.enable( gl.DEPTH_TEST );
			gl.depthFunc( gl.LESS );
			gl.disable( gl.BLEND );

			var shader = Shaders.get("flat");
			gl.colorMask(false,false,false,false);
			for(var i in this._opaque_meshes)
			{
				var instance = this._opaque_meshes[i];
				if(instance.two_sided)
					gl.disable( gl.CULL_FACE );
				else
					gl.enable( gl.CULL_FACE );

				mat4.multiply( this._mvp_matrix, this._viewprojection_matrix, instance.matrix );
				shader.uniforms({u_material_color:[1,0,0,1],u_mvp: this._mvp_matrix});
				instance.renderFunc(shader);
			}
			gl.colorMask(true,true,true,true);
		}

		//global textures
		var depth_texture = ResourcesManager.textures[":scene_depth"];

		//for each node
		options.pass = "main";
		for(var i in this._visible_meshes)
		{
			var instance = this._visible_meshes[i];
			var node = instance.node;
			var mesh = instance.mesh;

			renderpass_info.instance = instance;
			renderpass_info.node = node;

			LEvent.trigger(node, "beforeRenderMeshes",options);

			var mat = instance.material;
			if(typeof(mat) === "string")
				mat = scene.materials[mat];
			if(!mat) mat = this._default_material;

			var low_quality = options.low_quality || node.flags.low_quality;

			if(instance.two_sided)
				gl.disable( gl.CULL_FACE );
			else
				gl.enable( gl.CULL_FACE );

			//depth
			gl.depthFunc( gl.LEQUAL );
			if(node.flags.depth_test)
				gl.enable( gl.DEPTH_TEST );
			else
				gl.disable( gl.DEPTH_TEST );

			if(node.flags.depth_write)
				gl.depthMask(true);
			else
				gl.depthMask(false);

			//main rendering (no picking or shadowmap)
			if(!options.is_shadowmap && !options.is_picking)
			{
				if(mat.blending == Material.ADDITIVE_BLENDING)
				{
					gl.enable( gl.BLEND );
					gl.blendFunc( gl.SRC_ALPHA, gl.ONE );
				}
				else if(mat.alpha < 0.999 )
				{
					gl.enable( gl.BLEND );
					gl.blendFunc( gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA );
				}
				else
					gl.disable( gl.BLEND );
			} //shadowmaps or picking buffer
			else
				gl.disable( gl.BLEND );

			//when to reverse the normals?
			if(node.flags.flip_normals)
				gl.frontFace(gl.CW);
			else
				gl.frontFace(gl.CCW);

			//compute world matrix
			var model = instance.matrix;
			mat4.copy(this._object_model, model ); 
			//mat3.fromMat4(this._normal_model, model );
			mat4.copy(this._normal_model, model );
			mat4.setTranslation(this._normal_model,vec3.create());
			mat4.multiply(this._mvp_matrix, this._viewprojection_matrix, this._object_model );

			var shader = null;
		
			if(options.is_shadowmap) //rendering to the shadowmap, just need the Z
			{
				if(node.flags.cast_shadows != false)
				{
					if(node.flags.alpha_shadows == true && (mat.getTexture("color") || mat.getTexture("opacity")))
					{
						var macros = { USE_ALPHA_TEST: "0.5" };

						var color = mat.getTexture("color");
						if(color)
						{
							var color_uvs = mat.textures["color_uvs"] || Material.DEFAULT_UVS["color"] || "0";
							macros.USE_COLOR_TEXTURE = "uvs_" + color_uvs;
							color.bind(0);
						}

						var opacity = mat.getTexture("opacity");
						if(opacity)	{
							var opacity_uvs = mat.textures["opacity_uvs"] || Material.DEFAULT_UVS["opacity"] || "0";
							macros.USE_OPACITY_TEXTURE = "uvs_" + opacity_uvs;
							opacity.bind(1);
						}
						shader = Shaders.get("depth",macros);
						shader.uniforms({u_mvp: this._mvp_matrix, u_material_color: [0,0,0, mat.alpha], texture: 0, opacity_texture: 1, u_texture_matrix: [mat.uvs_matrix[0],0,mat.uvs_matrix[2], 0,mat.uvs_matrix[1],mat.uvs_matrix[3], 0,0,1] });
					}
					else
					{
						shader = Shaders.get("depth");
						shader.uniforms({u_mvp: this._mvp_matrix});
					}
					instance.render(shader);
				}
			}
			else if(options.is_picking) //rendering to the picking buffer? need specific color per object
			{
				picking_next_color_id += 10;
				var pick_color = new Uint32Array(1); //store four bytes number
				pick_color[0] = picking_next_color_id; //with the picking color for this object
				var byte_pick_color = new Uint8Array( pick_color.buffer ); //read is as bytes
				//byte_pick_color[3] = 255; //Set the alpha to 1
				node._picking_color = picking_next_color_id;

				shader = Shaders.get("flat");
				shader.uniforms({u_mvp: this._mvp_matrix, u_material_color: new Float32Array([byte_pick_color[0] / 255,byte_pick_color[1] / 255,byte_pick_color[2] / 255, 1]) });
				instance.render(shader);
			}
			else //regular rendering
			{
				//generic uniforms
				uniforms.u_mvp = this._mvp_matrix;
				uniforms.u_model = this._object_model;
				uniforms.u_normal_model = this._normal_model;

				var material_uniforms = mat.getMaterialShaderData(instance, node, scene, options);
				for(var im in material_uniforms)
					uniforms[im] = material_uniforms[im];

				if(clipping_plane)
					uniforms.u_clipping_plane = clipping_plane;


				LEvent.trigger(Scene,"fillMeshUniforms", renderpass_info );

				//if the shader is hardcoded
				var render_shader = null;
				if(overwrite_shader) render_shader = overwrite_shader;
				else if(node.shader) render_shader = node.shader; //node shader has priority over mat shader
				else if(mat.shader) render_shader = mat.shader;
				else render_shader = "globalshader";

				//multipass lighting
				var texture = null;
				var first_light = true;
				var num_lights = this._visible_lights.length;
				for(var light_iterator = 0; light_iterator < num_lights; ++light_iterator)
				{
					var light = this._visible_lights[light_iterator];
					renderpass_info.light = light;

					if(light_iterator > 0)
					{
						gl.enable(gl.BLEND);
						gl.blendFunc(gl.SRC_ALPHA,gl.ONE);
						///uniforms.u_ambient_color = [0,0,0];
						///uniforms.u_emissive_color = [0,0,0];

						gl.depthFunc( gl.LEQUAL );
						//gl.depthMask(true);
						if(node.flags.depth_test)
							gl.enable(gl.DEPTH_TEST);
						else
							gl.disable( gl.DEPTH_TEST );
					}

					LEvent.trigger(Scene,"fillLightUniforms", renderpass_info );

					//ADD MACROS info			
					for(var im in material_uniforms)
						uniforms[im] = material_uniforms[im];
					var light_uniforms = mat.getLightShaderData(light, instance, node, scene, options);
					for(var im in light_uniforms)
						uniforms[im] = light_uniforms[im];

					//shader is an string: COMPILE
					if(render_shader.constructor == String) 
					{
						var macros = {};
						renderpass_info.macros = macros;

						//material & light macros
						if(material_uniforms.MACROS)
							for(var im in material_uniforms.MACROS)
								macros[im] = material_uniforms.MACROS[im];
						if(light_uniforms.MACROS)
							for(var im in light_uniforms.MACROS)
								macros[im] = light_uniforms.MACROS[im];

						//camera info
						if(this.active_camera.type == Camera.ORTHOGRAPHIC)
							macros.USE_ORTHOGRAPHIC_CAMERA = "";

						if(light_iterator == 0) macros.FIRST_PASS = "";
						if(light_iterator == (num_lights-1)) macros.LAST_PASS = "";

						if(node.flags.alpha_test == true)
							macros.USE_ALPHA_TEST = "0.5";

						if(clipping_plane)
							macros.USE_CLIPPING_PLANE = "";

						if(brightness_factor != 1)
							macros.USE_BRIGHTNESS_FACTOR = "";

						if(colorclip_factor > 0.0)
							macros.USE_COLORCLIP_FACTOR = "";

						//mesh information
						if(!("a_normal" in mesh.vertexBuffers))
							macros.NO_NORMALS = "";
						if(!("a_coord" in mesh.vertexBuffers))
							macros.NO_COORDS = "";
						if(("a_color" in mesh.vertexBuffers))
							macros.USE_COLOR_STREAM = "";
						if(("a_tangent" in mesh.vertexBuffers))
							macros.USE_TANGENT_STREAM = "";


						//if(mat.soft_particles && depth_texture) macros.USE_SOFT_PARTICLES = "";

						//macros.USE_POINTS = "";

						LEvent.trigger(Scene,"fillMacros", renderpass_info );

						shader = mat.getShader(render_shader, macros );
						//shader = Shaders.get(render_shader, macros );
					}
					else //const shader
					{
						shader = render_shader;
						renderpass_info.macros = null;
					}

					//render
					shader.uniforms(uniforms);

					if(mat.uniforms) //extra uniforms
						shader.uniforms(mat.uniforms);

					if(mat.depth_func)
						gl.depthFunc( gl[mat.depth_func] );

					//submesh rendering
					instance.render(shader);

					if(options.lights_disabled)
						break;

					if(shader.global && !shader.global.multipass)
						break; //avoid multipass in simple shaders
				}//multipass render

			} //global render


			LEvent.trigger(node, "afterRenderMeshes",options);
		}

		LEvent.trigger(Scene, "afterRenderPass",options);
		Scene.sendEventToNodes("afterRenderPass",options);

		//restore state
		gl.depthFunc(gl.LEQUAL);
		gl.depthMask(true);
		gl.disable(gl.BLEND);
		gl.frontFace(gl.CCW);

		//EVENT SCENE after_render
	},

	//Work in progress: not finished
	renderSceneMeshes: function(step, options)
	{
		var scene = this.current_scene || Scene;
		options = options || {};
		options.camera = this.active_camera;
		options.step = step;

		LEvent.trigger(Scene, "beforeRenderPass", options);
		Scene.sendEventToNodes("beforeRenderPass", options);

		gl.enable( gl.DEPTH_TEST );
		gl.depthFunc( gl.LESS );
		gl.disable( gl.BLEND );
		gl.lineWidth(1);

		//SORTING meshes
		this.updateVisibleMeshesNew(scene,options);
		var lights = this._visible_lights;

		//for each node
		for(var i in this._visible_meshes)
		{
			//render instances
			var instance = this._visible_meshes[i];
			//TODO: compute lights affecting this RI
			if(options.is_shadowmap)
				this.renderShadowPassInstance(step, instance, options );
			else
				this.renderMultiPassInstance(step, instance, lights, options );
		}

		LEvent.trigger(Scene, "afterRenderPass",options);
		Scene.sendEventToNodes("afterRenderPass",options);

		//restore state
		gl.depthFunc(gl.LEQUAL);
		gl.depthMask(true);
		gl.disable(gl.BLEND);
		gl.frontFace(gl.CCW);

		//EVENT SCENE after_render
	},

	renderMultiPassInstance: function(step, instance, lights, options)
	{
		//for every light
		//1. Generate the renderkey:  step|nodeuid|matuid|lightuid
		//2. Get shader, if it doesnt exist:
		//		a. Compute the shader
		//		b. Store shader with renderkey
		//3. Fill the shader with uniforms
		//4. Render instance
		var scene = Scene;
		var node = instance.node;
		var mat = instance.material;

		//compute matrices
		var model = instance.matrix;
		mat4.copy(this._object_model, model ); 
		mat4.multiply(this._mvp_matrix, this._viewprojection_matrix, this._object_model );
		mat4.copy(this._normal_model, model );
		mat4.setTranslation(this._normal_model,vec3.create()); //remove translation from normal matrix

		//global uniforms
		var uniforms = {
			u_camera_eye: this.active_camera.eye,
			u_camera_planes: [this.active_camera.near, this.active_camera.far],
			//u_viewprojection: this._viewprojection_matrix,
			u_time: Scene.current_time || new Date().getTime() * 0.001
		};

		//node matrix info
		uniforms.u_mvp = this._mvp_matrix;
		uniforms.u_model = this._object_model;
		uniforms.u_normal_model = this._normal_model;

		//FLAGS
		this.enableInstanceFlags(instance, node, options);

		//alpha blending flags
		if(mat.blending == Material.ADDITIVE_BLENDING)
		{
			gl.enable( gl.BLEND );
			gl.blendFunc( gl.SRC_ALPHA, gl.ONE );
		}
		else if(mat.alpha < 0.999 )
		{
			gl.enable( gl.BLEND );
			gl.blendFunc( gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA );
		}
		else
			gl.disable( gl.BLEND );


		//multi pass instance rendering
		var num_lights = lights.length;
		for(var iLight = 0; iLight < num_lights; iLight++)
		{
			var light = lights[iLight];

			//generate renderkey
			var renderkey = instance.generateKey(step, options);

			//compute the  shader
			var shader = null; //this._renderkeys[renderkey];
			if(!shader)
			{
				var shader_name = instance.material.shader || "globalshader";

				var macros = {};
				instance.material.getSurfaceShaderMacros(macros, step, shader_name, instance, node, scene, options);
				instance.material.getLightShaderMacros(macros, step, light, instance, shader_name, node, scene, options);
				instance.material.getSceneShaderMacros(macros, step, instance, node, scene, options);
				if(iLight == 0) macros.FIRST_PASS = "";
				if(iLight == (num_lights-1)) macros.LAST_PASS = "";
				shader = Shaders.get(shader_name, macros);
			}

			//fill shader data
			instance.material.fillSurfaceUniforms(shader, uniforms, instance, node, scene, options );
			instance.material.fillLightUniforms(shader, uniforms, light, instance, node, scene, options );

			//secondary pass flags to make it additive
			if(iLight > 0)
			{
				gl.enable(gl.BLEND);
				gl.blendFunc(gl.SRC_ALPHA,gl.ONE);
				gl.depthFunc( gl.LEQUAL );
				//gl.depthMask(true);
				if(node.flags.depth_test)
					gl.enable(gl.DEPTH_TEST);
				else
					gl.disable( gl.DEPTH_TEST );
			}

			if(mat.depth_func)
				gl.depthFunc( gl[mat.depth_func] );

			//render
			shader.uniforms( uniforms );
			instance.render( shader );

			if(shader.global && !shader.global.multipass)
				break; //avoid multipass in simple shaders
		}
	},

	renderShadowPassInstance: function(step, instance, options)
	{
		var scene = Scene;
		var node = instance.node;
		var mat = instance.material;

		var model = instance.matrix;
		mat4.copy(this._object_model, model ); 
		//mat3.fromMat4(this._normal_model, model );
		mat4.copy(this._normal_model, model );
		mat4.setTranslation(this._normal_model,vec3.create());
		mat4.multiply(this._mvp_matrix, this._viewprojection_matrix, this._object_model );

		//global uniforms
		var uniforms = {};

		//node matrix info
		uniforms.u_mvp = this._mvp_matrix;
		uniforms.u_model = this._object_model;
		uniforms.u_normal_model = this._normal_model;

		//FLAGS
		this.enableInstanceFlags(instance, node, options);

		if(node.flags.alpha_shadows == true && (mat.getTexture("color") || mat.getTexture("opacity")))
		{
			var macros = { USE_ALPHA_TEST: "0.5" };

			var color = mat.getTexture("color");
			if(color)
			{
				var color_uvs = mat.textures["color_uvs"] || Material.DEFAULT_UVS["color"] || "0";
				macros.USE_COLOR_TEXTURE = "uvs_" + color_uvs;
				color.bind(0);
			}

			var opacity = mat.getTexture("opacity");
			if(opacity)	{
				var opacity_uvs = mat.textures["opacity_uvs"] || Material.DEFAULT_UVS["opacity"] || "0";
				macros.USE_OPACITY_TEXTURE = "uvs_" + opacity_uvs;
				opacity.bind(1);
			}
			shader = Shaders.get("depth",macros);
			shader.uniforms({u_mvp: this._mvp_matrix, u_material_color: [0,0,0, mat.alpha], texture: 0, opacity_texture: 1, u_texture_matrix: [mat.uvs_matrix[0],0,mat.uvs_matrix[2], 0,mat.uvs_matrix[1],mat.uvs_matrix[3], 0,0,1] });
		}
		else
		{
			shader = Shaders.get("depth");
			shader.uniforms({u_mvp: this._mvp_matrix});
		}
		instance.render(shader);
	},

	enableInstanceFlags: function(instance, node, options)
	{
		if(instance.two_sided)
			gl.disable( gl.CULL_FACE );
		else
			gl.enable( gl.CULL_FACE );

		//  depth
		gl.depthFunc( gl.LEQUAL );
		if(node.flags.depth_test)
			gl.enable( gl.DEPTH_TEST );
		else
			gl.disable( gl.DEPTH_TEST );
		if(node.flags.depth_write)
			gl.depthMask(true);
		else
			gl.depthMask(false);

		//when to reverse the normals?
		if(node.flags.flip_normals)
			gl.frontFace(gl.CW);
		else
			gl.frontFace(gl.CCW);
	},

	//Work in progress, not finished
	updateVisibleMeshesOld: function(scene, options)
	{
		var nodes = scene.nodes;
		if (options.nodes)
			nodes = options.nodes;
		var camera = this.active_camera;
		var camera_eye = camera.getEye();

		var opaque_meshes = [];
		var alpha_meshes = [];
		for(var i in nodes)
		{
			var node = nodes[i];

			//check if the node is visible
			LEvent.trigger(node, "computeVisibility", {camera: this.active_camera, options: options});

			//update matrix
			//TODO...

			//search components with rendering instances
			if(!node._components) continue;
			for(var j in node._components)
			{
				var component = node._components[j];
				if( !component.getRenderInstance ) continue;
				var instance = component.getRenderInstance(options, this.active_camera);
				if(!instance) continue;

				//skip hidden objects
				if(node.flags.seen_by_camera == false && !options.is_shadowmap && !options.is_picking && !options.is_reflection)
					continue;
				if(node.flags.seen_by_picking == false && options.is_picking)
					continue;

				//default values when something is missing
				if(!instance.matrix) instance.matrix = node.transform.getGlobalMatrix();
				if(!instance.center) instance.center = mat4.multiplyVec3(vec3.create(), instance.matrix, vec3.create());
				if(instance.primitive == null) instance.primitive = gl.TRIANGLES;
				instance.two_sided = instance.two_sided || node.flags.two_sided;
				if(!instance.renderFunc) instance.renderFunc = Renderer.renderMeshInstance;
				instance.material = instance.material || node.material || this._default_material; //order
				if( instance.material.constructor === String) instance.material = scene.materials[instance.material];
				if(!instance.material) continue;

				//add extra info
				instance.node = node;
				instance.component = component;

				//change conditionaly
				if(options.force_wireframe) instance.primitive = gl.LINES;
				if(instance.primitive == gl.LINES && !instance.mesh.lines)
					instance.mesh.computeWireframe();

				//and finally, the alpha thing to determine if it is visible or not
				var mat = instance.material;
				if(mat.alpha >= 1.0 && mat.blending != Material.ADDITIVE_BLENDING)
					opaque_meshes.push(instance);
				else //if(!options.is_shadowmap)
					alpha_meshes.push(instance);

				instance._dist = vec3.dist( instance.center, camera_eye );
			}
		}

		//sort nodes in Z
		if(this.sort_nodes_in_z)
		{
			opaque_meshes.sort(function(a,b) { return a._dist < b._dist ? -1 : (a._dist > b._dist ? +1 : 0); });
			alpha_meshes.sort(function(a,b) { return a._dist < b._dist ? 1 : (a._dist > b._dist ? -1 : 0); });
			//opaque_meshes = opaque_meshes.sort( function(a,b){return vec3.dist( a.center, camera.eye ) - vec3.dist( b.center, camera.eye ); });
			//alpha_meshes = alpha_meshes.sort( function(b,a){return vec3.dist( a.center, camera.eye ) - vec3.dist( b.center, camera.eye ); }); //reverse sort
		}

		this._alpha_meshes = alpha_meshes;
		this._opaque_meshes = opaque_meshes;
		this._visible_meshes = opaque_meshes.concat(alpha_meshes);
	},

	//Generates the rendering instances that are visible
	updateVisibleMeshesNew: function(scene, options)
	{
		var nodes = scene.nodes;
		if (options.nodes)
			nodes = options.nodes;
		var camera = this.active_camera;
		var camera_eye = camera.getEye();

		var opaque_meshes = [];
		var alpha_meshes = [];
		for(var i in nodes)
		{
			var node = nodes[i];
			LEvent.trigger(node, "computeVisibility", {camera: this.active_camera, options: options});

			//update matrix
			//TODO...

			//hidden nodes
			if(!node.flags.visible || (options.is_rt && node.flags.seen_by_reflections == false)) //mat.alpha <= 0.0
				continue;
			if(node.flags.seen_by_camera == false && !options.is_shadowmap && !options.is_picking && !options.is_reflection)
				continue;
			if(node.flags.seen_by_picking == false && options.is_picking)
				continue;

			//render component renderinstances
			if(!node._components) continue;
			for(var j in node._components)
			{
				//extract renderable object from this component
				var component = node._components[j];
				if( !component.getRenderInstance ) continue;
				var instance = component.getRenderInstance(options, this.active_camera);
				if(!instance) continue;

				if(!instance.material)
					instance.material = this._default_material;

				//default
				if(!instance.center) mat4.multiplyVec3( instance.center, instance.matrix, vec3.create() );

				//add extra info
				instance.node = node;
				instance.component = component;

				//change conditionaly
				if(options.force_wireframe) instance.primitive = gl.LINES;
				if(instance.primitive == gl.LINES && !instance.mesh.lines)
					instance.mesh.computeWireframe();

				//and finally, the alpha thing to determine if it is visible or not
				var mat = instance.material;
				if(mat.alpha >= 1.0 && mat.blending != Material.ADDITIVE_BLENDING)
					opaque_meshes.push(instance);
				else //if(!options.is_shadowmap)
					alpha_meshes.push(instance);

				instance._dist = vec3.dist( instance.center, camera_eye );
			}
		}

		//sort nodes in Z
		if(this.sort_nodes_in_z)
		{
			opaque_meshes.sort(function(a,b) { return a._dist < b._dist ? -1 : (a._dist > b._dist ? +1 : 0); });
			alpha_meshes.sort(function(a,b) { return a._dist < b._dist ? 1 : (a._dist > b._dist ? -1 : 0); });
			//opaque_meshes = opaque_meshes.sort( function(a,b){return vec3.dist( a.center, camera.eye ) - vec3.dist( b.center, camera.eye ); });
			//alpha_meshes = alpha_meshes.sort( function(b,a){return vec3.dist( a.center, camera.eye ) - vec3.dist( b.center, camera.eye ); }); //reverse sort
		}

		this._alpha_meshes = alpha_meshes;
		this._opaque_meshes = opaque_meshes;
		this._visible_meshes = opaque_meshes.concat(alpha_meshes);
	},

	null_light: null,
	updateVisibleLights: function(scene, nodes)
	{
		this._visible_lights = [];
		if(scene.light && scene.light.enabled != false)
			this._visible_lights.push(scene.light);

		nodes = nodes || scene.nodes;

		for(var i = 0; i < nodes.length; ++i)
		{
			var node = nodes[i];
			if(!node.flags.visible) continue;
			for(var j in node._components)
				if (node._components[j].constructor === Light && node._components[j].enabled)
					this._visible_lights.push(node._components[j]);

			/*
			if(!node.light || node.light.enabled == false)
				continue;
			//TODO: test in frustrum
			this._visible_lights.push(node.light);
			*/
		}

		//if there is no lights it wont render anything, so create a dummy one
		if(this._visible_lights.length == 0)
		{
			if(!this.null_light)
			{
				this.null_light = new Light();
				this.null_light.color = [0,0,0];
			}
			this._visible_lights.push(this.null_light);
		}
	},

	//Renders the scene to an RT
	renderSceneMeshesToRT: function(cam,rt, options)
	{
		if(rt.texture_type == gl.TEXTURE_2D)
		{
			this.enableCamera(cam);
			rt.drawTo( inner_draw_2d );
		}
		else if( rt.texture_type == gl.TEXTURE_CUBE_MAP)
			this.renderCubemap(cam.getEye(), rt.width, rt, options, cam.near, cam.far);

		function inner_draw_2d()
		{
			gl.clearColor(Scene.background_color[0],Scene.background_color[1],Scene.background_color[2], Scene.background_color.length > 3 ? Scene.background_color[3] : 1.0);
			if(options.ignore_clear != true)
				gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
			//render scene
			Renderer.renderSceneMeshes(options);
		}
	},

	//Renders all the shadowmaps in the SCENE
	renderShadowMaps: function(scene)
	{
		scene = scene || Scene;

		for(var i in this._visible_lights)
		{
			var light = this._visible_lights[i];
			if(!light.cast_shadows)
				continue;

			var shadowmap_resolution = light.shadowmap_resolution;
			if(!shadowmap_resolution)
				shadowmap_resolution = Light.DEFAULT_SHADOWMAP_RESOLUTION;

			if(light._shadowMap == null || light._shadowMap.width != shadowmap_resolution )
			{
				light._shadowMap = new GL.Texture( shadowmap_resolution, shadowmap_resolution, { format: gl.RGBA, magFilter: gl.NEAREST, minFilter: gl.NEAREST });
				ResourcesManager.textures[":shadowmap_" + light._uid ] = light._shadowMap;
			}

			light.computeLightMatrices(this._view_matrix, this._projection_matrix, this._viewprojection_matrix);
			this.active_camera = scene.current_camera; //to avoid nulls

			// Render the object viewed from the light using a shader that returns the
			// fragment depth.
			light._shadowMap.unbind(); //¿?
			light._shadowMap.drawTo(function() {
				gl.clearColor(0, 0, 0, 1);
				//gl.clearColor(1, 1, 1, 1);
				gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

				//save the VP of the shadowmap camera
				if( !light._lightMatrix ) light._lightMatrix = mat4.create();
				mat4.copy( Renderer._viewprojection_matrix, light._lightMatrix );

				Renderer.renderSceneMeshes("shadow", { is_shadowmap:true });
			});
		}
	},

	//Render Cameras that need to store the result in RTs
	renderRTCameras: function()
	{
		var scene = this.current_scene || Scene;

		for(var i in scene.rt_cameras)
		{
			var camera = scene.rt_cameras[i];
			if(camera.texture == null)
			{
				camera.texture = new GL.Texture( camera.resolution || 1024, camera.resolution || 1024, { format: gl.RGB, magFilter: gl.LINEAR });
				ResourcesManager.textures[camera.id] = camera.texture;
			}

			this.enableCamera(camera);

			camera.texture.drawTo(function() {
				gl.clearColor(scene.background_color[0],scene.background_color[1],scene.background_color[2], 0.0);
				gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

				var options = {is_rt: true, clipping_plane: camera.clipping_plane};
				Renderer.renderSceneMeshes("rts",options);
			});
		}
	},

	//not in use yet
	renderPostFX: function(render_callback)
	{
		//prepare postfx
		if(!this._postfx_texture_a || this._postfx_texture_a.width != this.postfx_settings.width || this._postfx_texture_a.height != this.postfx_settings.height)
		{
			this._postfx_texture_a = new GL.Texture(postfx_settings.width,postfx_settings.height, {magFilter: gl.LINEAR, minFilter: gl.NEAREST});
			this._postfx_texture_b = new GL.Texture(postfx_settings.width,postfx_settings.height, {magFilter: gl.LINEAR, minFilter: gl.NEAREST});
		}

		//store the scene in texture A
		this._postfx_texture_a.drawTo(render_callback);
		for(var i in this.postfx)
		{
			var fx = this.postfx[i];
			var shader = null;
			if(typeof(fx) == "string")
			{
				shader = Shaders.get(fx);
				//apply FX to tex A and store the result in tex B
				this._postfx_texture_b.drawTo(function() {
					Renderer._postfx_texture_a.bind();
					shader.uniforms({color: [1,1,1,1], texSize:[Renderer._postfx_texture_a.width,Renderer._postfx_texture_a.height], time: new Date().getTime() * 0.001 }).draw(Renderer.viewport3d.screen_plane);
				});
			}
			else if(fx && fx.callback)
			{
				fx.callback(this._postfx_texture_a,this._postfx_texture_b);
			}
			//swap
			var tmp = this._postfx_texture_b;
			this._postfx_texture_b = this._postfx_texture_a;
			this._postfx_texture_a = tmp;
		}

		if(options.texture)
		{
			options.texture.drawTo(function() {
				Renderer._postfx_texture_a.bind();
				Shaders.get("screen").uniforms({color: [1,1,1,1]}).draw(Renderer.viewport3d.screen_plane);
			});
		}
		else
		{
			gl.viewport( scene.active_viewport[0], scene.active_viewport[1], scene.active_viewport[2], scene.active_viewport[3] );
			Renderer._postfx_texture_a.bind();
			Shaders.get("screen").uniforms({color: [1,1,1,1]}).draw(Renderer.viewport3d.screen_plane);
		}
	},


	//renders the current scene to a cubemap centered in the given position
	renderCubemap: function(position, size, texture, options, near, far)
	{
		size = size || 256;
		near = near || 1;
		far = far || 1000;

		var cams = [
			{dir: [1,0,0], up:[0,1,0]}, //positive X
			{dir: [-1,0,0], up:[0,1,0]}, //negative X
			{dir: [0,-1,0], up:[0,0,-1]}, //positive Y
			{dir: [0,1,0], up:[0,0,1]}, //negative Y
			{dir: [0,0,-1], up:[0,1,0]}, //positive Z
			{dir: [0,0,1], up:[0,1,0]} //negative Z
		]; 

		var eye = position;
		if( !texture || texture.constructor != Texture) texture = null;

		texture = texture || new Texture(size,size,{texture_type: gl.TEXTURE_CUBE_MAP, minFilter: gl.NEAREST});
		texture.drawTo(function(side) {
			gl.clearColor(Scene.background_color[0],Scene.background_color[1],Scene.background_color[2], Scene.background_color.length > 3 ? Scene.background_color[3] : 1.0);
			gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
			var cam = new Camera({ eye: eye, center: [ eye[0] + cams[side].dir[0], eye[1] + cams[side].dir[1], eye[2] + cams[side].dir[2]], up: cams[side].up, fov: 90, aspect: 1.0, near: near, far: far });
			Renderer.enableCamera(cam);
			Renderer.renderSceneMeshes("main",options);
		});

		return texture;
	},


	//picking
	pickingMap: null,
	_picking_color: null,
	picking_depth: 0,

	renderPickingBuffer: function(x,y)
	{
		var scene = this.current_scene || Scene;

		//trace("Starting Picking at : (" + x + "," + y + ")  T:" + new Date().getTime() );
		if(this.pickingMap == null || this.pickingMap.width != gl.canvas.width || this.pickingMap.height != gl.canvas.height )
			this.pickingMap = new GL.Texture( gl.canvas.width, gl.canvas.height, { format: gl.RGBA, magFilter: gl.NEAREST });

		y = gl.canvas.height - y; //reverse Y
		small_area = true;

		this.pickingMap.drawTo(function() {
			//trace(" START Rendering ");

			var viewport = scene.viewport || [0,0,gl.canvas.width, gl.canvas.height];
			scene.current_camera.aspect = viewport[2] / viewport[3];
			gl.viewport( viewport[0], viewport[1], viewport[2], viewport[3] );

			if(small_area)
			{
				gl.scissor(x-1,y-1,2,2);
				gl.enable(gl.SCISSOR_TEST);
			}

			gl.clearColor(0,0,0,0);
			gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

			Renderer.enableCamera(scene.current_camera);

			//gl.viewport(x-20,y-20,40,40);
			Renderer.renderSceneMeshes("picking",{is_picking:true});
			//gl.scissor(0,0,gl.canvas.width,gl.canvas.height);

			Renderer._picking_color = new Uint8Array(4);
			gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,Renderer._picking_color);

			if(small_area)
				gl.disable(gl.SCISSOR_TEST);
			//trace(" END Rendering: " + array2string(Scene.picking_color) );
		});

		if(!this._picking_color) this._picking_color = new Uint8Array(4); //debug
		return this._picking_color;
	},

	projectToCanvas: function(x,y,z)
	{

	},

	getNodeAtCanvasPosition: function(scene, x,y)
	{
		scene = scene || Scene;
		this.renderPickingBuffer(x,y);

		this._picking_color[3] = 0; //remove alpha
		var v1 = new Uint32Array(this._picking_color.buffer)[0];

		//find node
		var closer_node = null;
		for(var i in scene.nodes)
		{
			var node = scene.nodes[i];
			if(!node._picking_color)
				continue;

			if(v1 == node._picking_color)
			{
				closer_node = node;
				closer_dist = 0;
				break;
			}
		}

		var viewport = scene.viewport ? scene.viewport : [0,0,gl.canvas.width, gl.canvas.height ];
		//trace("Picking node: " + (closer_node ? closer_node.id : "null") + " Color: " + this._picking_color[0] + "," + this._picking_color[1] + "," + this._picking_color[2] + "," + this._picking_color[3]);
		return closer_node;
	}
};

//Add to global Scope
LS.Renderer = Renderer;
/* Basic formats parser 
	Dependencies: jQuery (for xml parsing)
*/

var Parser = {

	flipAxis: 0,
	merge_smoothgroups: false,

	image_extensions: ["png","jpg"], //for images
	nonative_image_extensions: ["tga","dds"], //for images that need parsing
	mesh_extensions: ["obj", "bin","dae","ase","gr2","json","jsmesh"], //for meshes
	generic_extensions: ["xml","js","json"], //unknown data container
	xml_extensions: ["xml","dae"], //for sure is XML
	json_extensions: ["js","json"], //for sure is JSON
	binary_extensions: ["bin","tga","dds"], //for sure is binary and needs to be read as a byte array
	parsers: {},

	registerParser: function(parser)
	{
		this.parsers[parser.extension] = parser;
	},

	parse: function(filename,data,options)
	{
		options = options || {};
		var info = this.getResourceInfo(filename);
		if(options.extension)
			info.extension = options.extension; //force a format
		var parser = this.parsers[info.extension];
		if(!parser)
		{
			trace("Perser Error: No parser found for " + info.extension + " format");
			return null;
		}

		var result = null;
		try
		{
			result = parser.parse(data,options);
		}
		catch (err)
		{
			trace("Error parsing content: " + err );
			return null;
		}
		result.name = filename;
		return result;
	},

	//gets raw image information {width,height,pixels:ArrayBuffer} and create a dataurl to use in images
	convertToDataURL: function(img_data)
	{
		var canvas = document.createElement("canvas");
		canvas.width = img_data.width;
		canvas.height = img_data.height;
		//document.body.appendChild(canvas);
		var ctx = canvas.getContext("2d");
		var pixelsData = ctx.createImageData(img_data.width, img_data.height);
		var num_pixels = canvas.width * canvas.height;

		//flip and copy the pixels
		if(img_data.bytesPerPixel == 3)
		{
			for(var i = 0; i < canvas.width; ++i)
				for(var j = 0; j < canvas.height; ++j)
				{
					var pos = j*canvas.width*4 + i*4;
					var pos2 = (canvas.height - j - 1)*canvas.width*3 + i*3;
					pixelsData.data[pos+2] = img_data.pixels[pos2];
					pixelsData.data[pos+1] = img_data.pixels[pos2+1];
					pixelsData.data[pos+0] = img_data.pixels[pos2+2];
					pixelsData.data[pos+3] = 255;
				}
		}
		else {
			for(var i = 0; i < canvas.width; ++i)
				for(var j = 0; j < canvas.height; ++j)
				{
					var pos = j*canvas.width*4 + i*4;
					var pos2 = (canvas.height - j - 1)*canvas.width*4 + i*4;
					pixelsData.data[pos+0] = img_data.pixels[pos2+2];
					pixelsData.data[pos+1] = img_data.pixels[pos2+1];
					pixelsData.data[pos+2] = img_data.pixels[pos2+0];
					pixelsData.data[pos+3] = img_data.pixels[pos2+3];
				}
		}

		ctx.putImageData(pixelsData,0,0);
		img_data.dataurl = canvas.toDataURL("image/png");
		return img_data.dataurl;
	},

	/* extract important Mesh info from vertices (center, radius, bouding box) */
	computeMeshBounding: function(vertices)
	{
		//if(vertices.length > (65536 * 3)) trace("Warning: the number of vertices excedes 65536");

		//compute AABB and useful info
		var min = [vertices[0],vertices[1],vertices[2]];
		var max = [vertices[0],vertices[1],vertices[2]];
		for(var i = 0; i < vertices.length; i += 3)
		{
			var v = [vertices[i],vertices[i+1],vertices[i+2]];
			if (v[0] < min[0]) min[0] = v[0];
			else if (v[0] > max[0]) max[0] = v[0];
			if (v[1] < min[1]) min[1] = v[1];
			else if (v[1] > max[1]) max[1] = v[1];
			if (v[2] < min[2]) min[2] = v[2];
			else if (v[2] > max[2]) max[2] = v[2];
		}

		var bounding = {};
		bounding.aabb_min = min;
		bounding.aabb_max = max;
		bounding.aabb_center = [(min[0] + max[0]) * 0.5,(min[1] + max[1]) * 0.5, (min[2] + max[2]) * 0.5];
		bounding.aabb_half = [ min[0] - bounding.aabb_center[0], min[1] - bounding.aabb_center[1], min[2] - bounding.aabb_center[2]];
		bounding.radius = Math.sqrt(bounding.aabb_half[0] * bounding.aabb_half[0] + bounding.aabb_half[1] * bounding.aabb_half[1] + bounding.aabb_half[2] * bounding.aabb_half[2]);
		return bounding;
	},

	//takes an string an returns a Uint8Array typed array containing that string
	stringToTypedArray: function(str, fixed_length)
	{
		var r = new Uint8Array( fixed_length ? fixed_length : str.length);
		for(var i = 0; i < str.length; i++)
			r[i] = str.charCodeAt(i);
		return r;
	},

	//takes a typed array with ASCII codes and returns the string
	typedArrayToString: function(typed_array, same_size)
	{
		var r = "";
		for(var i = 0; i < typed_array.length; i++)
			if (typed_array[i] == 0 && !same_size)
				break;
			else
				r += String.fromCharCode( typed_array[i] );
		return r;
	},

	//Returns info about a resource according to its filename
	JSON_FORMAT: "json",
	XML_FORMAT: "xml",
	BINARY_FORMAT: "binary",
	TEXT_FORMAT: "text",
	MESH_DATA: "MESH",
	IMAGE_DATA: "IMAGE",
	NONATIVE_IMAGE_DATA: "NONATIVE_IMAGE",
	GENERIC_DATA: "GENERIC",
	
	getResourceInfo: function(filename)
	{
		var extension = filename.substr( filename.lastIndexOf(".") + 1).toLowerCase();
		
		var r = {
			filename: filename,
			extension: extension
		};

		//format
		r.format = Parser.TEXT_FORMAT;
		if (this.xml_extensions.indexOf(extension) != -1)
			r.format = Parser.XML_FORMAT;
		else if (this.json_extensions.indexOf(extension) != -1)
			r.format = Parser.JSON_FORMAT;
		else if (this.binary_extensions.indexOf(extension) != -1)
			r.format = Parser.BINARY_FORMAT;

		//data info
		if (this.image_extensions.indexOf(extension) != -1)
			r.type = Parser.IMAGE_DATA;
		else if (this.mesh_extensions.indexOf(extension) != -1)
			r.type = Parser.MESH_DATA;
		else if  (this.nonative_image_extensions.indexOf(extension) != -1)
			r.type = Parser.NONATIVE_IMAGE_DATA; 
		else if  (this.generic_extensions.indexOf(extension) != -1)
			r.type = Parser.GENERIC_DATA; //unkinown data, could be anything
		return r;
	}
};

Mesh.prototype.toBinary = function()
{
	if(!window.BinaryPack)
		throw("BinaryPack not imported, no binary formats supported");

	if(!this.info)
	{
		trace("Error: Mesh info not found");
		return;
	}

	//clean data
	var o = {
		info: this.info
	};
	this.info.num_vertices = this.vertices.length;

	for(var i in this.vertexBuffers)
	{
		var stream = this.vertexBuffers[i];
		o[ stream.name ] = stream.data;
	}

	for(var i in this.indexBuffers)
	{
		var stream = this.indexBuffers[i];
		o[i] = stream.data;
	}

	/*
	this.info.num_vertices = mesh.vertices.length;
	var o = {
		vertices: this.vertices,
		info: this.info
	};
	if(this.normals) o.normals = this.normals;
	if(this.coords) o.coords = this.coords;
	if(this.colors) o.colors = this.colors;
	if(this.triangles) o.triangles = this.triangles;
	*/

	//create pack file
	var pack = new BinaryPack();
	pack.save(o);
	return pack.getData();
}
















//***** ASE Parser *****************
var parserASE = {
	extension: 'ase',
	data_type: 'mesh',
	format: 'text',
	
	parse: function(text, options)
	{
		options = options || {};

		//final arrays (packed, lineal [ax,ay,az, bx,by,bz ...])
		var positionsArray = [ ];
		var texcoordsArray = [ ];
		var normalsArray   = [ ];
		var indicesArray   = [ ];

		//unique arrays (not packed, lineal)
		var positions = [ ];
		var texcoords = [ ];
		var normals   = [ ];
		var indices = [ ];
		var facemap   = { };
		var index     = 0;

		var line = null;
		var f   = null;
		var pos = 0;
		var tex = 0;
		var nor = 0;
		var x   = 0.0;
		var y   = 0.0;
		var z   = 0.0;
		var tokens = null;

		var indices_offset = 0;
		var mesh_index = 0;
		var current_mat_id = -1;
		var current_mesh_name = "";

		//used for mesh groups (submeshes)
		var group = null;
		var groups = [];

		var flip_axis = Parser.flipAxis;
		if(options.flipAxis != null) flip_axis = options.flipAxis;
		var flip_normals = (flip_axis || options.flipNormals);

		var lines = text.split("\n");
		for (var lineIndex = 0;  lineIndex < lines.length; ++lineIndex) {
			line = lines[lineIndex].replace(/[ \t]+/g, " ").replace(/\s\s*$/, ""); //trim
			if(line[0] == " ")
				line = line.substr(1,line.length);

			if(line == "") continue;
			tokens = line.split(" ");

			if(tokens[0] == "*MESH")
			{
				mesh_index += 1;
				positions = [];
				texcoords = [];

				if(mesh_index > 1) break; //parse only the first mesh
			}
			else if (tokens[0] == "*NODE_NAME") {
				current_mesh_name =  tokens[1].substr(1, tokens[1].length - 2);
			}
			else if(tokens[0] == "*MESH_VERTEX")
			{
				if(flip_axis) //maya and max notation style
					positions.push( [-1*parseFloat(tokens[2]), parseFloat(tokens[4]), parseFloat(tokens[3])] );
				else
					positions.push( [parseFloat(tokens[2]), parseFloat(tokens[3]), parseFloat(tokens[4])] );
			}
			else if(tokens[0] == "*MESH_FACE")
			{
				//material info
				var mat_id = parseInt( tokens[17] );
				if(current_mat_id != mat_id)
				{
					current_mat_id = mat_id;
					if(group != null)
					{
						group.length = positionsArray.length / 3 - group.start;
						if(group.length > 0)
							groups.push(group);
					}

					group = {
						name: "mat_" + mat_id,
						start: positionsArray.length / 3,
						length: -1,
						material: ""
					};
				}

				//add vertices
				var vertex = positions[ parseInt(tokens[3]) ];
				positionsArray.push( vertex[0], vertex[1], vertex[2] );
				vertex = positions[ parseInt(tokens[5]) ];
				positionsArray.push( vertex[0], vertex[1], vertex[2] );
				vertex = positions[ parseInt(tokens[7]) ];
				positionsArray.push( vertex[0], vertex[1], vertex[2] );
			}
			else if(tokens[0] == "*MESH_TVERT")
			{
				texcoords.push( [parseFloat(tokens[2]), parseFloat(tokens[3])] );
			}
			else if(tokens[0] == "*MESH_TFACE")
			{
				var coord = texcoords[ parseInt(tokens[2]) ];
				texcoordsArray.push( coord[0], coord[1] );
				coord = texcoords[ parseInt(tokens[3]) ];
				texcoordsArray.push( coord[0], coord[1] );
				coord = texcoords[ parseInt(tokens[4]) ];
				texcoordsArray.push( coord[0], coord[1] );
			}
			else if(tokens[0] == "*MESH_VERTEXNORMAL")
			{
				if(flip_normals)  //maya and max notation style
					normalsArray.push(-1*parseFloat(tokens[2]),parseFloat(tokens[4]),parseFloat(tokens[3]));
				else
					normalsArray.push(parseFloat(tokens[2]),parseFloat(tokens[3]),parseFloat(tokens[4]));
			}
		}

		var total_primitives = positionsArray.length / 3 - group.start;
		if(group && total_primitives > 1)
		{
			group.length = total_primitives;
			groups.push(group);
		}

		var mesh = {};

		mesh.vertices = new Float32Array(positionsArray);
		if (normalsArray.length > 0)
			mesh.normals = new Float32Array(normalsArray);
		if (texcoordsArray.length > 0)
			mesh.coords = new Float32Array(texcoordsArray);

		//extra info
		var bounding = Parser.computeMeshBounding(mesh.vertices);
		if(groups.length > 1)
			info.groups = groups;
		mesh.info = info;

		return mesh;
	}
};
Parser.registerParser( parserASE );

var parserBIN = {
	extension: 'bin',
	data_type: 'mesh',
	format: 'binary',

	parse: function(data, options)
	{
		//trace("Binary Mesh loading");
		if(!window.BinaryPack)
			throw("BinaryPack not imported, no binary formats supported");

		if (typeof(data) == "string")
		{
			data = BinaryPack.stringToTypedArray(data);
		}
		else 
			data = new Uint8Array(data); //copy for safety

		var pack = new BinaryPack();
		var o = pack.load(data);

		return o;
	}
};
Parser.registerParser(parserBIN);
var parserDAE = {
	extension: 'dae',
	data_type: 'mesh',
	format: 'text',
	
	parse: function(data, options)
	{
		options = options || {};

		trace("Parsing collada");

		var xmlparser = new DOMParser();
		var root = xmlparser.parseFromString(data,"text/xml");
		var geometry_nodes = root.querySelectorAll("library_geometries geometry");
		if(!geometry_nodes || geometry_nodes.length == 0) return null;

		//trace(mesh_node);
		var data_info = {
			type: "",
			order: []
		};

		var use_indices = false;

		//trace(mesh_nodes);

		//for geometry_nodes
		for(var i in geometry_nodes)
		{
			var sources = {};

			var geometry_node = geometry_nodes[i];
			var geometry_id = geometry_node.getAttribute("id");
			if(!geometry_node.querySelector) continue; //in case is text

			var mesh_node = geometry_node.querySelector("mesh");
			
			//for data source
			var sources_xml = mesh_node.querySelectorAll("source");
			for (var j in sources_xml)
			{
				var source = sources_xml[j];
				if(!source.querySelector) continue;
				var float_array = source.querySelector("float_array");
				if(!float_array) continue;
				var text = float_array.textContent;
				text = text.replace(/\n/gi, " ");
				text = text.trim();
				var numbers = text.split(" ");
				var floats = new Float32Array(parseInt(float_array.getAttribute("count")));
				for(var k = 0; k < numbers.length; k++)
					floats[k] = parseFloat( numbers[k] );

				sources[ source.getAttribute("id") ] = floats;
			}

			var vertices_xml = mesh_node.querySelector("vertices input");
			vertices_source = sources[ vertices_xml.getAttribute("source").substr(1) ];
			sources[ mesh_node.querySelector("vertices").getAttribute("id") ] = vertices_source;

			var polygons_xml = mesh_node.querySelector("polygons");
			var inputs_xml = polygons_xml.querySelectorAll("input");
			var vertex_offset = -1;
			var normal_offset = -1;
			var uv_offset = -1;

			var vertices = null;
			var normals = null;
			var coords = null;


			for(var j in inputs_xml)
			{
				var input = inputs_xml[j];
				if(!input.getAttribute) continue;
				var semantic = input.getAttribute("semantic").toUpperCase();
				var stream_source = sources[ input.getAttribute("source").substr(1) ];
				if (semantic == "VERTEX")
				{
					vertices = stream_source;
					vertex_offset = parseInt( input.getAttribute("offset") );
				}
				else if (semantic == "NORMAL")
				{
					normals = stream_source;
					normal_offset = parseInt( input.getAttribute("offset") );
				}
				else if (semantic == "TEXCOORD")
				{
					coords = stream_source;
					uv_offset = parseInt( input.getAttribute("offset") );
				}
			}

			var p_xml = polygons_xml.querySelectorAll("p");

			var verticesArray = [];
			var normalsArray = [];
			var coordsArray = [];
			var indicesArray = [];

			var last_index = 0;
			var facemap = {};

			//for every polygon
			for(var j in p_xml)
			{
				var p = p_xml[j];
				if(!p || !p.textContent) break;
				var data = p.textContent.split(" ");
				var first_index = -1;
				var current_index = -1;
				var prev_index = -1;

				if(use_indices && last_index >= 256*256)
					break;

				//for every triplet of indices in the polygon
				for(var k = 0; k < data.length; k += 3)
				{
					if(use_indices && last_index >= 256*256)
					{
						trace("Too many vertices for indexing");
						break;
					}
					
					//if (!use_indices && k >= 9) break; //only first triangle when not indexing

					var ids = data[k + vertex_offset] + "/"; //indices of vertex, normal and uvs
					if(normal_offset != -1)	ids += data[k + normal_offset] + "/";
					if(uv_offset != -1)	ids += data[k + uv_offset]; 

					if(!use_indices && k > 6) //put the vertices again
					{
						verticesArray.push( verticesArray[first_index*3], verticesArray[first_index*3+1], verticesArray[first_index*3+2] );
						normalsArray.push( normalsArray[first_index*3], normalsArray[first_index*3+1], normalsArray[first_index*3+2] );
						coordsArray.push( coordsArray[first_index*2], coordsArray[first_index*2+1] );
						
						verticesArray.push( verticesArray[(prev_index+1)*3], verticesArray[(prev_index+1)*3+1], verticesArray[(prev_index+1)*3+2] );
						normalsArray.push( normalsArray[(prev_index+1)*3], normalsArray[(prev_index+1)*3+1], normalsArray[(prev_index+1)*3+2] );
						coordsArray.push( coordsArray[(prev_index+1)*2], coordsArray[(prev_index+1)*2+1] );
						last_index += 2;
						current_index = last_index-1;
					}

					prev_index = current_index;
					if(!use_indices || !facemap.hasOwnProperty(ids))
					{
						var index = parseInt(data[k + vertex_offset]) * 3;
						verticesArray.push( vertices[index], vertices[index+1], vertices[index+2] );
						if(normal_offset != -1)
						{
							index = parseInt(data[k + normal_offset]) * 3;
							normalsArray.push( normals[index], normals[index+1], normals[index+2] );
						}
						if(uv_offset != -1)
						{
							index = parseInt(data[k + uv_offset]) * 2;
							coordsArray.push( coords[index], coords[index+1] );
						}
						
						current_index = last_index;
						last_index += 1;
						if(use_indices)
							facemap[ids] = current_index;
					}
					else if(use_indices)//already used vertex
					{
						current_index = facemap[ids];
					}

					if(k == 0)	first_index = current_index;
					if(use_indices)
					{
						if(k > 6) //triangulate polygons
						{
							indicesArray.push( first_index );
							indicesArray.push( prev_index );
						}
						indicesArray.push( current_index );
					}
				}//per vertex
			}//per polygon

			var mesh = {
				vertices: new Float32Array(verticesArray)
			};
			
			if (normalsArray.length)
				mesh.normals = new Float32Array(normalsArray);
			if (coordsArray.length)
				mesh.coords = new Float32Array(coordsArray);
			if(indicesArray.length)
				mesh.triangles = new Uint16Array(indicesArray);

			//extra info
			var bounding = Parser.computeMeshBounding(mesh.vertices);
			mesh.bounding = bounding;
			if( isNaN(bounding.radius))
				return null;

			return mesh;
		}
	}
};
Parser.registerParser(parserDAE);

var parserDDS = { 
	extension: 'dds',
	data_type: 'image',
	format: 'binary',

	parse: function(data, options)
	{
		var ext = gl.getExtension("WEBKIT_WEBGL_compressed_texture_s3tc");
		var texture = new GL.Texture(0,0, options);
		if(!window.DDS)
			throw("dds.js script must be included, not found");
		DDS.loadDDSTextureFromMemoryEx(gl,ext, data, texture.handler, true);
		texture.texture_type = texture.handler.texture_type;
		texture.width = texture.handler.width;
		texture.height = texture.handler.height;
		//texture.bind();
		return texture;
	}
};
Parser.registerParser( parserDDS );
//legacy format
var parserJSMesh = { 
	extension: 'jsmesh',
	data_type: 'mesh',
	format: 'text',

	parse: function(data,options)
	{
		var mesh = null;

		if(typeof(data) == "object")
			mesh = data;
		else if(typeof(data) == "string")
			mesh = JSON.parse(data);

		if(mesh.vertices.constructor == Array) //for deprecated formats
		{
			mesh.vertices = typeof( mesh.vertices[0] ) == "number" ? mesh.vertices : linearizeArray(mesh.vertices);
			if(mesh.normals) mesh.normals = typeof( mesh.normals[0] ) == "number" ? mesh.normals : linearizeArray(mesh.normals);
			if(mesh.coords) mesh.coords = typeof( mesh.coords[0] ) == "number" ? mesh.coords : linearizeArray(mesh.coords);
			if(mesh.triangles) mesh.triangles = typeof( mesh.triangles[0] ) == "number" ? mesh.triangles : linearizeArray(mesh.triangles);

			mesh.vertices = new Float32Array(mesh.vertices);
			if(mesh.normals) mesh.normals = new Float32Array(mesh.normals);
			if(mesh.coords) mesh.coords = new Float32Array(mesh.coords);
			if(mesh.triangles) mesh.triangles = new Uint16Array(mesh.triangles);
		}

		if(!mesh.bounding)
			mesh.bounding = Parser.computeMeshBounding(mesh.vertices);
		return mesh;
	}
};
Parser.registerParser(parserJSMesh);

//***** OBJ parser adapted from SpiderGL implementation *****************
var parserOBJ = {
	extension: 'obj',
	data_type: 'mesh',
	format: 'text',

	parse: function(text, options)
	{
		options = options || {};

		//final arrays (packed, lineal [ax,ay,az, bx,by,bz ...])
		var positionsArray = [ ];
		var texcoordsArray = [ ];
		var normalsArray   = [ ];
		var indicesArray   = [ ];

		//unique arrays (not packed, lineal)
		var positions = [ ];
		var texcoords = [ ];
		var normals   = [ ];
		var facemap   = { };
		var index     = 0;

		var line = null;
		var f   = null;
		var pos = 0;
		var tex = 0;
		var nor = 0;
		var x   = 0.0;
		var y   = 0.0;
		var z   = 0.0;
		var tokens = null;

		var hasPos = false;
		var hasTex = false;
		var hasNor = false;

		var parsingFaces = false;
		var indices_offset = 0;
		var negative_offset = -1; //used for weird objs with negative indices
		var max_index = 0;

		var skip_indices = options.noindex ? options.noindex : (text.length > 10000000 ? true : false);
		//trace("SKIP INDICES: " + skip_indices);
		var flip_axis = (Parser.flipAxis || options.flipAxis);
		var flip_normals = (flip_axis || options.flipNormals);

		//used for mesh groups (submeshes)
		var group = null;
		var groups = [];
		var materials_found = {};

		var lines = text.split("\n");
		var length = lines.length;
		for (var lineIndex = 0;  lineIndex < length; ++lineIndex) {
			line = lines[lineIndex].replace(/[ \t]+/g, " ").replace(/\s\s*$/, ""); //trim

			if (line[0] == "#") continue;
			if(line == "") continue;

			tokens = line.split(" ");

			if(parsingFaces && tokens[0] == "v") //another mesh?
			{
				indices_offset = index;
				parsingFaces = false;
				//trace("multiple meshes: " + indices_offset);
			}

			if (tokens[0] == "v") {
				if(flip_axis) //maya and max notation style
					positions.push(-1*parseFloat(tokens[1]),parseFloat(tokens[3]),parseFloat(tokens[2]));
				else
					positions.push(parseFloat(tokens[1]),parseFloat(tokens[2]),parseFloat(tokens[3]));
			}
			else if (tokens[0] == "vt") {
				texcoords.push(parseFloat(tokens[1]),parseFloat(tokens[2]));
			}
			else if (tokens[0] == "vn") {

				if(flip_normals)  //maya and max notation style
					normals.push(-parseFloat(tokens[2]),-parseFloat(tokens[3]),parseFloat(tokens[1]));
				else
					normals.push(parseFloat(tokens[1]),parseFloat(tokens[2]),parseFloat(tokens[3]));
			}
			else if (tokens[0] == "f") {
				parsingFaces = true;

				if (tokens.length < 4) continue; //faces with less that 3 vertices? nevermind

				//for every corner of this polygon
				var polygon_indices = [];
				for (var i=1; i < tokens.length; ++i) 
				{
					if (!(tokens[i] in facemap) || skip_indices) 
					{
						f = tokens[i].split("/");

						if (f.length == 1) { //unpacked
							pos = parseInt(f[0]) - 1;
							tex = pos;
							nor = pos;
						}
						else if (f.length == 2) { //no normals
							pos = parseInt(f[0]) - 1;
							tex = parseInt(f[1]) - 1;
							nor = -1;
						}
						else if (f.length == 3) { //all three indexed
							pos = parseInt(f[0]) - 1;
							tex = parseInt(f[1]) - 1;
							nor = parseInt(f[2]) - 1;
						}
						else {
							trace("Problem parsing: unknown number of values per face");
							return false;
						}

						/*
						//pos = Math.abs(pos); tex = Math.abs(tex); nor = Math.abs(nor);
						if(pos < 0) pos = positions.length/3 + pos - negative_offset;
						if(tex < 0) tex = texcoords.length/2 + tex - negative_offset;
						if(nor < 0) nor = normals.length/3 + nor - negative_offset;
						*/

						x = 0.0;
						y = 0.0;
						z = 0.0;
						if ((pos * 3 + 2) < positions.length) {
							hasPos = true;
							x = positions[pos*3+0];
							y = positions[pos*3+1];
							z = positions[pos*3+2];
						}

						positionsArray.push(x,y,z);
						//positionsArray.push([x,y,z]);

						x = 0.0;
						y = 0.0;
						if ((tex * 2 + 1) < texcoords.length) {
							hasTex = true;
							x = texcoords[tex*2+0];
							y = texcoords[tex*2+1];
						}
						texcoordsArray.push(x,y);
						//texcoordsArray.push([x,y]);

						x = 0.0;
						y = 0.0;
						z = 1.0;
						if(nor != -1)
						{
							if ((nor * 3 + 2) < normals.length) {
								hasNor = true;
								x = normals[nor*3+0];
								y = normals[nor*3+1];
								z = normals[nor*3+2];
							}
							
							normalsArray.push(x,y,z);
							//normalsArray.push([x,y,z]);
						}

						//Save the string "10/10/10" and tells which index represents it in the arrays
						if(!skip_indices)
							facemap[tokens[i]] = index++;
					}//end of 'if this token is new (store and index for later reuse)'

					//store key for this triplet
					if(!skip_indices)
					{
						var final_index = facemap[tokens[i]];
						polygon_indices.push(final_index);
						if(max_index < final_index)
							max_index = final_index;
					}
				} //end of for every token on a 'f' line

				//polygons (not just triangles)
				if(!skip_indices)
				{
					for(var iP = 2; iP < polygon_indices.length; iP++)
					{
						indicesArray.push( polygon_indices[0], polygon_indices[iP-1], polygon_indices[iP] );
						//indicesArray.push( [polygon_indices[0], polygon_indices[iP-1], polygon_indices[iP]] );
					}
				}
			}
			else if (tokens[0] == "g" || tokens[0] == "usemtl") {
				negative_offset = positions.length / 3 - 1;

				if(tokens.length > 1)
				{
					if(group != null)
					{
						group.length = indicesArray.length - group.start;
						if(group.length > 0)
							groups.push(group);
					}

					group = {
						name: tokens[1],
						start: indicesArray.length,
						length: -1,
						material: ""
					};
				}
			}
			else if (tokens[0] == "usemtl") {
				if(group)
					group.material = tokens[1];
			}
			else if (tokens[0] == "o" || tokens[0] == "s") {
				//ignore
			}
			else
			{
				trace("unknown code: " + line);
			}
		}

		if(group && (indicesArray.length - group.start) > 1)
		{
			group.length = indicesArray.length - group.start;
			groups.push(group);
		}

		//deindex streams
		if((max_index > 256*256 || skip_indices ) && indicesArray.length > 0)
		{
			console.log("Deindexing mesh...")
			var finalVertices = new Float32Array(indicesArray.length * 3);
			var finalNormals = normalsArray && normalsArray.length ? new Float32Array(indicesArray.length * 3) : null;
			var finalTexCoords = texcoordsArray && texcoordsArray.length ? new Float32Array(indicesArray.length * 2) : null;
			for(var i = 0; i < indicesArray.length; i += 1)
			{
				finalVertices.set( positionsArray.slice( indicesArray[i]*3,indicesArray[i]*3 + 3), i*3 );
				if(finalNormals)
					finalNormals.set( normalsArray.slice( indicesArray[i]*3,indicesArray[i]*3 + 3 ), i*3 );
				if(finalTexCoords)
					finalTexCoords.set( texcoordsArray.slice(indicesArray[i]*2,indicesArray[i]*2 + 2 ), i*2 );
			}
			positionsArray = finalVertices;
			if(finalNormals)
				normalsArray = finalNormals;
			if(finalTexCoords)
				texcoordsArray = finalTexCoords;
			indicesArray = null;
		}

		//Create final mesh object
		var mesh = {};

		//create typed arrays
		if (hasPos)
			mesh.vertices = new Float32Array(positionsArray);
		if (hasNor && normalsArray.length > 0)
			mesh.normals = new Float32Array(normalsArray);
		if (hasTex && texcoordsArray.length > 0)
			mesh.coords = new Float32Array(texcoordsArray);
		if (indicesArray && indicesArray.length > 0)
			mesh.triangles = new Uint16Array(indicesArray);

		//extra info
		mesh.bounding = Parser.computeMeshBounding(mesh.vertices);
		var info = {};
		if(groups.length > 1)
			info.groups = groups;
		mesh.info = info;
		if( mesh.bounding.radius == 0 || isNaN(mesh.bounding.radius))
			console.log("no radius found in mesh");

		return mesh;
	}
};
Parser.registerParser(parserOBJ);

var parserTGA = { 
	extension: 'tga',
	data_type: 'image',
	format: 'binary',

	parse: function(data, options)
	{
		if (typeof(data) == "string")
			data = Parser.stringToTypedArray(data);
		else 
			data = new Uint8Array(data);

		var TGAheader = new Uint8Array( [0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0] );
		var TGAcompare = data.subarray(0,12);
		for(var i = 0; i < TGAcompare.length; i++)
			if(TGAheader[i] != TGAcompare[i])
				return null; //not a TGA

		var header = data.subarray(12,18);

		var img = {};
		img.width = header[1] * 256 + header[0];
		img.height = header[3] * 256 + header[2];
		img.bpp = header[4];
		img.bytesPerPixel = img.bpp / 8;
		img.imageSize = img.width * img.height * img.bytesPerPixel;
		img.pixels = data.subarray(18,18+img.imageSize);

		//TGA comes in BGR format ... this is slooooow
		for(var i = 0; i < img.imageSize; i+= img.bytesPerPixel)
		{
			var temp = img.pixels[i];
			img.pixels[i] = img.pixels[i+2];
			img.pixels[i+2] = temp;
		}

		//some extra bytes to avoid alignment problems
		//img.pixels = new Uint8Array( img.imageSize + 14);
		//img.pixels.set( data.subarray(18,18+img.imageSize), 0);

		img.flipY = true;
		img.format = img.bpp == 32 ? "BGRA" : "BGR";
		//trace("TGA info: " + img.width + "x" + img.height );
		return img;
	}
};
Parser.registerParser( parserTGA );
/* Dependencies
	+ Shaders.js: shaders compilation
	+ glMatrix: for maths
	+ litegl.js: for meshes and textures
	+ core.js: for main core functionality
	+ jQuery: for AJAX calls

*/




//To store all the registered components, useful for editors

/**
* The SceneTree contains all the info about the Scene and nodes
*
* @class SceneTree
* @constructor
*/

function SceneTree()
{
	this.init();
}

//globals
SceneTree.DEFAULT_BACKGROUND_COLOR = new Float32Array([0,0,0,1]);
SceneTree.DEFAULT_AMBIENT_COLOR = vec3.fromValues(0.2, 0.2, 0.2);

//methods

/**
* This initializes the content of the scene.
* Call it to clear the scene content
*
* @method init
* @return {Boolean} Returns true on success
*/
SceneTree.prototype.init = function()
{
	this.id = "";
	this.materials = {}; //material cache
	this.local_repository = null;

	this.nodes = [];
	this.nodes_by_id = {};
	this.rt_cameras = [];

	this._components = []; //remove all components

	//this.camera = new Camera();
	if(this.camera) this.camera = null;
	this.addComponent( new Camera() );
	this.current_camera = this.camera;

	//this.light = new Light({ position: [100,100,100], target:[0,0,0]});
	if(this.light) this.light = null;
	this.addComponent( new Light({ position: vec3.fromValues(100,100,100), target: vec3.fromValues(0,0,0) }) );

	this.ambient_color = new Float32Array( SceneTree.DEFAULT_AMBIENT_COLOR );
	this.background_color = new Float32Array( SceneTree.DEFAULT_BACKGROUND_COLOR );
	this.textures = {};

	this.active_viewport = null;
	this.viewport = null;

	this.settings = {
		//auto_picking: true,	
		enable_shadows: true,
		enable_rts: true
	};

	this._frame = 0;
	this._time = 0;
	this._global_time = 0; //in seconds
	this._start_time = 0; //in seconds
	this._last_dt = 1/60; //in seconds
	this._must_redraw = true;

	if(this.selected_node) delete this.selected_node;

	this.extra = {};
}

/**
* Clears the scene using the init function
* and trigger a "clear" LEvent
*
* @method clear
*/
SceneTree.prototype.clear = function()
{
	//remove all nodes to ensure no lose callbacks are left
	while(this.nodes.length)
		Scene.removeNode(this.nodes[0]);

	this.init();
	LEvent.trigger(this,"clear");
	LEvent.trigger(this,"change");
}

/**
* Configure the Scene using an object (the object can be obtained from the function serialize)
* Inserts the nodes, configure them, and change the parameters
*
* @method configure
* @param {Object} scene_info the object containing all the info about the nodes and config of the scene
*/
SceneTree.prototype.configure = function(scene_info)
{
	this._components = [];
	this.camera = this.light = null; //legacy

	if(scene_info.object_type != "Scene")
		trace("Warning: object set to scene doesnt look like a propper one.");
	if(scene_info.local_repository)
		this.local_repository = scene_info.local_repository;
	//parse basics
	if(scene_info.background_color)
		this.background_color.set(scene_info.background_color);
	if(scene_info.ambient_color)
		this.ambient_color.set(scene_info.ambient_color);

	if(scene_info.textures)
		this.textures = scene_info.textures;

	//extra info that the user wanted to save (comments, etc)
	if(scene_info.extra)
		this.extra = scene_info.extra;

	//parse nodes and preserve ierarchy
	if(scene_info.nodes)
	{
		var with_parent = [];
		for(var i in scene_info.nodes)
		{
			var info = scene_info.nodes[i];
			var node = new SceneNode(info.id);
			node.configure(info);
			this.addNode(node);
			if(node._parent)
				with_parent.push(node);
		}
		//restore ierarchy
		for(var i in with_parent)
		{
			var node = with_parent[i];
			var parent = Scene.getNode( node._parent );
			if(parent)
				parent.addChild(node);
			LEvent.trigger(this,"nodeChangeParent", [parent, node]);
		}
	}

	//parse materials
	if(scene_info.materials)
		for(var i in scene_info.materials)
			this.materials[ i ] = new Material( scene_info.materials[i] );

	if(scene_info.components)
		this.configureComponents(scene_info);

	// LEGACY...
	if(scene_info.camera)
	{
		if(this.camera)
			this.camera.configure( scene_info.camera );
		else
			this.addComponent( new Camera( scene_info.camera ) );
	}

	if(scene_info.light)
	{
		if(this.light)
			this.light.configure( scene_info.light );
		else
			this.addComponent( new Light(scene_info.light) );
	}


	LEvent.trigger(this,"configure",scene_info);
	LEvent.trigger(this,"change");

	this.current_camera = this.camera;
}

/**
* Creates and object containing all the info about the scene and nodes.
* The oposite of configure.
* It calls the serialize method in every node
*
* @method serialize
* @return {Object} return a JS Object with all the scene info
*/

SceneTree.prototype.serialize = function()
{
	var o = {};

	o.object_type = "Scene";
	o.ambient_color = toArray( this.ambient_color );
	o.background_color = toArray( this.background_color ); //to non-typed
	o.textures = cloneObject(this.textures);
	o.local_repository = this.local_repository;

	/*
	o.light = this.light.serialize();
	o.camera = this.camera.serialize();
	*/

	o.nodes = [];
	o.extra = this.extra || {};
	for(var i in this.nodes)
		o.nodes.push(this.nodes[i].serialize());

	if(this.materials)
	{
		o.materials = {};
		for(var i in this.materials)
			o.materials[ i ] = this.materials[i].serialize();
	}

	this.serializeComponents(o);

	LEvent.trigger(this,"serializing",o);

	return o;
}

/**
* loads a Scene from an Ajax call and pass it to the configure method.
*
* @method loadScene
* @param {String} url where the JSON object containing the scene is stored
* @param {Function}[on_complete=null] the callback to call when the loading is complete
* @param {Function}[on_error=null] the callback to call if there is a  loading error
*/

SceneTree.prototype.loadScene = function(url, on_complete, on_error)
{
	var that = this;
	var nocache = ResourcesManager.getNoCache(true);
	LS.request({
		url: url + nocache,
		dataType: 'json',
		success: inner_success,
		error: inner_error
	});

	function inner_success(response)
	{
		that.configure(response);
		that.loadResources();
		if(on_complete)
			on_complete();
	}

	function inner_error(err)
	{
		trace("Error loading scene: " + url + " -> " + err);
		if(on_error)
			on_error(url);
	}
}

SceneTree.prototype.appendScene = function(scene)
{
	if( getObjectClassName(scene) == "SceneTree")
		scene = scene.serialize();
	scene = { nodes: scene.nodes }
	this.configure(scene);
}

/**
* inserts a Node in the scene
*
* @method addNode
* @param {Object} node the node object
* @param {Number}[index=null] index to specify if you want to insert it after another node
*/

SceneTree.prototype.addNode = function(node, index)
{
	//node.scene = this;
	if(index == undefined)
		this.nodes.push(node);
	else
		this.nodes.splice(index,0,node);

	//generate unique id
	if(node.id && node.id != -1)
	{
		if(this.nodes_by_id[node.id] != null)
			node.id = node.id + "_" + (Math.random() * 1000).toFixed(0);
		this.nodes_by_id[node.id] = node;
	}

	node._on_scene = true;


	//LEvent.trigger(node,"onAddedToScene", this);
	node.processActionInComponents("onAddedToScene",this); //send to components
	LEvent.trigger(this,"nodeAdded", node);
	LEvent.trigger(this,"change");
	//$(this).trigger("nodeAdded", node);
}


/**
* removes the node from the scene
*
* @method removeNode
* @param {Object} node the node
* @return {Boolean} returns true if it was found and deleted
*/

SceneTree.prototype.removeNode = function(node)
{
	var pos = this.nodes.indexOf(node);
	if(pos != -1)
	{
		delete node.scene;
		this.nodes.splice(pos,1);
		if(node.id)
			delete this.nodes_by_id[ node.id ];
		node._on_scene = false;
		node.processActionInComponents("onRemovedFromScene",this); //send to components
		LEvent.trigger(this,"nodeRemoved", node);
		LEvent.trigger(this,"change");
		return true;
	}
	return false;
}

/**
* retrieves a Node
*
* @method getNode
* @param {String} id node id
* @return {Object} the node or null if it didnt find it
*/
SceneTree.prototype.getNode = function(id)
{
	return this.nodes_by_id[id];
}

/**
* retrieves a Node by its index
*
* @method getNodeByIndex
* @param {Number} node index
* @return {Object} returns the node at the 'index' position in the nodes array
*/
SceneTree.prototype.getNodeByIndex = function(index)
{
	return this.nodes[index];
}

/**
* retrieves a Node index
*
* @method getNodeIndex
* @param {Node} node
* @return {Number} returns the node index in the nodes array
*/
SceneTree.prototype.getNodeIndex = function(node)
{
	return this.nodes.indexOf(node);
}

/**
* retrieves a Node
*
* @method getNodesByClass
* @param {String} className class name
* @return {Object} returns all the nodes that match this class name
*/

SceneTree.prototype.getNodesByClass = function(classname)
{
	var r = [];
	for (var i in this.nodes)
		if(this.nodes[i].className && this.nodes[i].className.split(" ").indexOf(classname) != -1)
			r.push(this.nodes[i]);
	return r;
}


/**
* loads all the resources of all the nodes in this scene
* it sends a signal to every node to get all the resources info
* and load them in bulk using the ResourceManager
*
* @method loadResources
*/

SceneTree.prototype.loadResources = function()
{
	var res = {};

	//scene resources
	for(var i in this.textures)
		if(this.textures[i])
			res[ this.textures[i] ] = Texture;

	if(this.light) this.light.getResources(res);

	//resources from nodes
	for(var i in this.nodes)
		this.nodes[i].getResources(res);

	//used for scenes with special repository folders
	var options = {};
	if(this.local_repository)
		options.local_repository = this.local_repository;

	ResourcesManager.loadResources(res);
	/* moved to Core
	for(var i in res)
	{
		if( typeof(i) != "string" || i[0] == ":" )
			continue;
	
		if(res[i] == Mesh)
			ResourcesManager.loadMesh( i, options );
		else if(res[i] == Texture)
			ResourcesManager.loadImage( i, options );
		else
			trace("Unknown resource type");
	}
	*/
}

/**
* updates the scene and nodes
*
* @method update
* @param {Number} dt delta time
*/
SceneTree.prototype.start = function(dt)
{
	LEvent.trigger(this,"start",this);
	this.sendEventToNodes("start");
}


SceneTree.prototype.update = function(dt)
{
	LEvent.trigger(this,"beforeUpdate", this);

	this._global_time = new Date().getTime() * 0.001;
	this._time = this._start_time - this._global_time;
	this._last_dt = dt;

	LEvent.trigger(this,"update", dt);
	this.sendEventToNodes("update",dt, true);

	LEvent.trigger(this,"afterUpdate", this);
}

/**
* dispatch event to all nodes in the scene
*
* @method sendEventToNodes
* @param {String} event_type event type name
* @param {Object} data data to send associated to the event
*/

SceneTree.prototype.sendEventToNodes = function(event_type, data)
{
	for(var i in this.nodes)
	{
		LEvent.trigger( this.nodes[i], event_type, data);
	}
}


SceneTree.prototype.generateUniqueNodeName = function(prefix)
{
	prefix = prefix || "node";
	var i = 1;
	var node_name = prefix + "_" + i;
	while( this.getNode(node_name) != null )
		node_name = prefix + "_" + (i++);
	return node_name;
}


SceneTree.prototype.refresh = function()
{
	this._must_redraw = true;
}

SceneTree.prototype.getTime = function()
{
	return this._global_time;
}



//****************************************************************************

/**
* The SceneNode class represents and object in the scene
* Is the base class for all objects in the scene as meshes, lights, cameras, and so
*
* @class SceneNode
* @param{String} id the id (otherwise a random one is computed)
* @constructor
*/

function SceneNode(id)
{
	//Generic
	this.id = id || ("node_" + (Math.random() * 10000).toFixed(0)); //generate random number
	this._uid = LS.generateUId();

	//this.className = "";
	//this.mesh = "";

	//flags
	this.flags = {
		visible: true,
		selectable: true,
		two_sided: false,
		flip_normals: false,
		//seen_by_camera: true,
		//seen_by_reflections: true,
		cast_shadows: true,
		receive_shadows: true,
		ignore_lights: false, //not_affected_by_lights
		alpha_test: false,
		alpha_shadows: false,
		depth_test: true,
		depth_write: true
	};

	//Basic components
	this._components = []; //used for logic actions
	this.addComponent( new Transform() );

	//material
	//this.material = new Material();
	this.extra = {}; //for extra info
}

//get methods from other classes
LS.extendClass(ComponentContainer, SceneTree); //container methods
LS.extendClass(ComponentContainer, SceneNode); //container methods

/**
* changes the node id (its better to do not change the id, it can lead to unexpected results)
* remember that two nodes can't have the same id
* @method setId
* @param {String} new_id the new id
* @return {Object} returns true if the name changed
*/

SceneNode.prototype.setId = function(new_id)
{
	if(Scene.getNode(new_id) != null)
	{
		trace("ID already in use");
		return false;
	}

	if(this.id == new_id) return;

	if(this.id)
		delete Scene.nodes_by_id[this.id];

	this.id = new_id;
	if(this.id)
		Scene.nodes_by_id[this.id] = this;

	LEvent.trigger(this,"id_changed", new_id);
	//$(this).trigger("id_changed");
	return true;
}

SceneNode.prototype.getResources = function(res)
{
	//resources in components
	for(var i in this._components)
		if( this._components[i].getResources )
			this._components[i].getResources( res );
	//res in material
	if(this.material)
		this.getMaterial().getResources( res );
	return res;
}

SceneNode.prototype.getTransform = function() {
	return this.transform;
}

//Mesh component
SceneNode.prototype.getMesh = function() {
	var mesh = this.mesh;
	if(!mesh && this.meshrenderer)
		mesh = this.meshrenderer.mesh;
	if(!mesh) return null;
	if(mesh.constructor === String)
		return ResourcesManager.meshes[mesh];
	return mesh;
}

//Light component
SceneNode.prototype.getLight = function() {
	return this.light;
}

//Camera component
SceneNode.prototype.getCamera = function() {
	return this.camera;
}

SceneNode.prototype.getLODMesh = function() {
	var mesh = this.lod_mesh;
	if(!mesh && this.meshrenderer)
		mesh = this.meshrenderer.lod_mesh;
	if(!mesh) return null;
	if(mesh.constructor === String)
		return ResourcesManager.meshes[mesh];
	return mesh;
}

SceneNode.prototype.setMesh = function(mesh_name, submesh_id)
{
	if(this.meshrenderer)
	{
		if(typeof(mesh_name) == "string")
			this.meshrenderer.configure({ mesh: mesh_name, submesh_id: submesh_id });
		else
			this.meshrenderer.mesh = mesh_name;
	}
	else
		this.addComponent(new MeshRenderer({ mesh: mesh_name, submesh_id: submesh_id }));
}

SceneNode.prototype.loadAndSetMesh = function(mesh_filename, options)
{
	options = options || {};

	if(ResourcesManager.meshes[mesh_filename] || !mesh_filename )
	{
		this.setMesh( mesh_filename );
		if(options.on_complete) options.on_complete( ResourcesManager.meshes[mesh_filename] ,this);
		return;
	}

	var that = this;
	var loaded = ResourcesManager.loadMesh(mesh_filename, options, function(mesh){
		that.setMesh(mesh.filename);
		that.loading -= 1;
		if(that.loading == 0)
		{
			LEvent.trigger(that,"resource_loaded",that);
			delete that.loading;
		}
		if(options.on_complete) options.on_complete(mesh,that);
	});

	if(!loaded)
	{
		if(!this.loading)
		{
			this.loading = 1;

			LEvent.trigger(this,"resource_loading");
		}
		else
			this.loading += 1;
	}
}

SceneNode.prototype.getMaterial = function()
{
	if (!this.material) return null;
	return this.material.constructor === String ? Scene.materials[this.material] : this.material;
}

// related to materials
/*
SceneNode.prototype.setTexture = function(texture_or_filename, channel)
{
	if(!this.material) this.material = new Material();
	this.material.setTexture(texture_or_filename,channel);
}

SceneNode.prototype.getTexture = function(channel) {
	channel = channel || "diffuse";
	if(!this.material) return null;
	var tex_name = this.material.textures[channel];
	if(tex_name)
		return ResourcesManager.textures[ tex_name ];
	return null;
}
*/

/**
* remember clones this node and returns the new copy (you need to add it to the scene to see it)
* @method clone
* @return {Object} returns a cloned version of this node
*/

SceneNode.prototype.clone = function()
{
	//TODO: improve this code
	var new_name = Scene.generateUniqueNodeName( this.id );

	var newnode = new SceneNode( new_child_name );
	newnode.configure( this.serialize() );

	for(var i in this._children)
	{
		var new_child_name = Scene.generateUniqueNodeName( this._children[i].id );
		var childnode = new SceneNode( new_child_name );
		childnode.configure( this._children[i].serialize() );
		newnode.addChild(childnode);
	}

	return newnode;
}

/**
* Configure this node from an object containing the info
* @method configure
* @param {Object} info the object with all the info (comes from the serialize method)
*/
SceneNode.prototype.configure = function(info)
{
	//if (info.id) this.id = info.id;	//id ignored, already set on constructor and avoid for cloning
	if (info.className)	this.className = info.className;

	if(info.mesh)
		this.addComponent( new MeshRenderer({ mesh: info.mesh, submesh_id: info.submesh_id }) );

	//first the no components
	if(info.material)
		this.material = typeof(info.material) == "string" ? info.material : new Material(info.material);
	//if(info.mesh) this.loadAndSetMesh(info.mesh);
	//if(info.submesh_id != null) this.submesh_id = info.submesh_id; //0 is valid

	if(info.flags) //merge
		for(var i in info.flags)
			this.flags[i] = info.flags[i];
	
	//DEPRECATED: hardcoded components
	if(info.transform) this.transform.configure( info.transform ); //all nodes have a transform
	if(info.light) this.addComponent( new Light(info.light) );
	if(info.camera)	this.addComponent( new Camera(info.camera) );

	//DEPRECATED: model in matrix format
	if(info.model) this.transform.fromMatrix( info.model ); 

	//ierarchy, TO DO
	if(info.children)
		this.children = info.children;

	//extra user info
	if(info.extra)
		this.extra = info.extra;

	if(info.comments)
		this.comments = info.comments;

	//ierarchy
	if(info.parent)
		this._parent = info.parent;

	//restore components
	if(info.components)
		this.configureComponents(info);

	LEvent.trigger(this,"configure",info);
}

/**
* Serializes this node by creating an object with all the info
* it contains info about the components too
* @method serialize
* @return {Object} returns the object with the info
*/
SceneNode.prototype.serialize = function()
{
	var o = {};

	if(this.id) o.id = this.id;
	if(this.className) o.className = this.className;

	//modules
	if(this.mesh && typeof(this.mesh) == "string") o.mesh = this.mesh; //do not save procedural meshes
	if(this.submesh_id != null) o.submesh_id = this.submesh_id;
	if(this.material) o.material = typeof(this.material) == "string" ? this.material : this.material.serialize();

	//DEPRECATED: they will be saved from the components
	/*
	if(this.transform) o.transform = this.transform.serialize();
	if(this.light) o.light = this.light.serialize();
	if(this.camera) o.camera = this.camera.serialize();
	*/

	if(this.flags) o.flags = cloneObject(this.flags);

	//extra user info
	if(this.extra) o.extra = this.extra;
	if(this.comments) o.comments = this.comments;

	//save children ierarchy
	if(this._parent)
		o.parent = this._parent.id;
	/*
	if(this._children && this._children.length)
	{
		o.children = [];
		for(var i in this._children)
			o.children.push( this._children[i].id );
	}
	*/

	//save components
	this.serializeComponents(o);

	//extra serializing info
	LEvent.trigger(this,"serialize",o);

	return o;
}

//scene graph tree ************************

/**
* Adds to this node a child node (use it carefully)
* @method addChild
* @param {Object} node the node to add as child
*/
SceneNode.prototype.addChild = function(node, recompute_transform )
{
	node._parent = this;
	if( !this._children )
		this._children = [node];
	else
		this._children.push(node);

	if(recompute_transform)
	{
		var M = node.transform.getGlobalMatrix(); //get son transform
		var M_parent = this.transform.getGlobalMatrix(); //parent transform
		mat4.invert(M_parent,M_parent);
		node.transform.fromMatrix( mat4.multiply(M_parent,M_parent,M) );
	}

	//link transform
	node.transform._parent = this.transform;

	LEvent.trigger(this,"nodeAdded", node);
}

/**
* Removes a node child from this node
* @method removeChild
* @param {Object} node the node to remove
*/
SceneNode.prototype.removeChild = function(node, recompute_transform)
{
	if(!this._children || node._parent != this) return;
	if( node._parent != this) return; //not his son
	var pos = this._children.indexOf(node);
	if(pos == -1) return; //not his son ¿?
	this._children.splice(pos,1);

	//unlink transform
	if(recompute_transform)
	{
		var m = node.transform.getGlobalMatrix();
		node.transform._parent = null;
		node.transform.fromMatrix(m);
	}
	node.transform._parent = null;
	LEvent.trigger(this,"nodeRemoved", node);
}

/**
* Removes a node child from this node
* @method removeChild
* @param {Object} node the node to remove
*/
SceneNode.prototype.getAllChildNodes = function(container)
{
	container = container || [];

	if(!this._children)
		return container;
	for(var i in this._children)
	{
		container.push(this._children[i]);
		this._children[i].getAllChildNodes(container);
	}
	return container;
}

/*
SceneNode.prototype.renderEditor = function(selected)
{
	Draw.setColor([1,0,1]);
	Draw.setLineWidth(2);
	Draw.renderCircle(10);
}
*/





//***************************************************************************

//create one default scene
var Scene = new SceneTree();

LS.SceneTree = SceneTree;
LS.SceneNode = SceneNode;

LS.ResourcesManager = ResourcesManager;
LS.Generators = Generators;


LS.newMeshNode = function(id,mesh_name)
{
	var node = new SceneNode(id);
	node.addComponent( new MeshRenderer() );
	node.setMesh(mesh_name);
	return node;
}

LS.newLightNode = function(id)
{
	var node = new SceneNode(id);
	node.addComponent( new Light() );
	return node;
}

LS.newCameraNode = function(id)
{
	var node = new SceneNode(id);
	node.addComponent( new Camera() );
	return node;
}

//*******************************/


/**
* Context class allows to handle the app context easily without having to glue manually all events
* @namespace LS
* @class Context
* @constructor
* @param {Object} options settings for the webgl context creation
*/
function Context(options)
{
	options = options || {};
	this.gl = GL.create(options);
	this.canvas = this.gl.canvas;
	this.render_options = {};

	this.force_redraw = false;
	this.interactive = true;

	this.gl.ondraw = Context.prototype._ondraw.bind(this);
	this.gl.onupdate = Context.prototype._onupdate.bind(this);
	this.gl.onmousedown = Context.prototype._onmouse.bind(this);
	this.gl.onmousemove = Context.prototype._onmouse.bind(this);
	this.gl.onmouseup = Context.prototype._onmouse.bind(this);
	this.gl.onkey = Context.prototype._onkey.bind(this);

	gl.captureMouse();
	gl.captureKeys(true);
}

Context.prototype._ondraw = function()
{
	if(this.onPreDraw)
		this.onPreDraw();

	if(Scene._must_redraw || this.force_redraw )
	{
		LEvent.trigger(Scene, "pre_scene_render");
		Renderer.render(Scene, Scene.current_camera, this.render_options );
		LEvent.trigger(Scene, "post_scene_render");
	}

	if(this.onDraw)
		this.onDraw();
}

Context.prototype._onupdate = function(dt)
{
	if(this.onPreUpdate)
		this.onPreUpdate(dt);

	Scene.update(dt);

	if(this.onUpdate)
		this.onUpdate(dt);
}

//input
Context.prototype._onmouse = function(e)
{
	if(e.type == "mousedown" && this.interactive )
	{
		var node = Renderer.getNodeAtCanvasPosition(Scene, e.mousex,e.mousey);
		this._clicked_node = node;
	}

	if(this._clicked_node && this._clicked_node.interactive)
	{
		e.scene_node = this._clicked_node;
		LEvent.trigger(Scene,e.type,e);
		LEvent.trigger(this._clicked_node,e.type,e);
	}

	if(e.type == "mouseup")
		this._clicked_node = null;

	if(this.onMouse)
	{
		e.scene_node = this._clicked_node;
		var r = this.onMouse(e);
		if(r) return;
	}
}

Context.prototype._onkey = function(e)
{
	if(this.onKey)
	{
		var r = this.onKey(e);
		if(r) return;
	}

	LEvent.trigger(Scene,e.type,e);
}

LS.Context = Context;

