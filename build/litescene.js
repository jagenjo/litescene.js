//packer version
//LiteScene by javi.agenjo@gmail.com 2013 @tamats
// github.com/jagenjo/litescene
// dependencies: litegl.js glMatrix.js (and litegraph.js)
//Here goes the licence and some info
//************************************************
//and the commonJS header...

/* WBin: Javi Agenjo javi.agenjo@gmail.com  Febrary 2014

WBin allows to pack binary information easily
Works similar to WAD file format from ID Software. You have binary lumps with a given name (and a special type code).
First we store a file header, then info about every lump, then a big binary chunk where all the lumps data is located.
The lump headers contain info to the position of the data in the lump binary chunk (positions are relative to the binary chung starting position)

Header: (64 bytes total)
	* FOURCC: 4 bytes with WBIN
	* Version: 4 bytes for Float32, represents WBin version used to store
	* Flags: 2 bytes to store flags (first byte reserved, second is free to use)
	* Num. lumps: 2 bytes number with the total amount of lumps in this wbin
	* ClassName: 32 bytes to store a classname, used to know info about the object stored
	* extra space for future improvements

Lump header: (64 bytes total)
	* start: 4 bytes, where the lump start in the binary area
	* length: 4 bytes, size of the lump
	* code: 2 bytes to represent data type using code table (Uint8Array, Float32Array, ...)
	* name: 54 bytes name for the lump

Lump binary: all the binary data...

*/

/**
* WBin allows to create binary files easily (similar to WAD format). You can pack lots of resources in one file or extract them.
* @class WBin
*/

function WBin()
{
}

WBin.HEADER_SIZE = 64; //num bytes per header, some are free to future improvements
WBin.FOUR_CC = "WBIN";
WBin.VERSION = 0.2; //use numbers, never strings, fixed size in binary
WBin.CLASSNAME_SIZE = 32; //32 bytes: stores a type for the object stored inside this binary

WBin.LUMPNAME_SIZE = 54; //max size of a lump name, it is big because sometimes some names have urls
WBin.LUMPHEADER_SIZE = 4+4+2+WBin.LUMPNAME_SIZE; //32 bytes: 4 start, 4 length, 2 code, 54 name

WBin.CODES = {
	"ArrayBuffer":"AB", "Int8Array":"I1", "Uint8Array":"i1", "Int16Array":"I2", "Uint16Array":"i2", "Int32Array":"I4", "Uint32Array":"i4",
	"Float32Array":"F4", "Float64Array": "F8", "Object":"OB","String":"ST","Number":"NU", "null":"00"
};

WBin.REVERSE_CODES = {};
for(var i in WBin.CODES)
	WBin.REVERSE_CODES[ WBin.CODES[i] ] = i;

WBin.FULL_BINARY = 1; //means this binary should be passed as binary, not as object of chunks

/**
* Allows to check if one Uint8Array contains a WBin file
* @method WBin.isWBin
* @param {UInt8Array} data
* @return {boolean}
*/
WBin.isWBin = function(data)
{
	var fourcc = data.subarray(0,4);
	for(var i = 0; i < fourcc.length; i++)
		if(fourcc[i] != 0 && fourcc[i] != WBin.FOUR_CC.charCodeAt(i))
			return false;
	return true;
}

/**
* Builds a WBin data stream from an object (every property of the object will be considered a lump with data)
* It supports Numbers, Strings and TypedArrays or ArrayBuffer
* @method WBin.create
* @param {Object} origin object containing all the lumps, the key will be used as lump name
* @param {String} origin_class_name [Optional] allows to add a classname to the WBin, this is used to detect which class to instance when extracting it
* @return {Uint8Array} all the bytes
*/
WBin.create = function( origin, origin_class_name )
{
	if(!origin)
		throw("WBin null origin passed");

	var flags = new Uint8Array([0,0]);
	var version = new Uint8Array( new Float32Array( [WBin.VERSION] ).buffer );
	origin_class_name = origin_class_name || "";

	//use class binary creator
	if(origin.toBinary)
	{
		var content = origin.toBinary();
		if(!content)
			return null;

		if(content.constructor == ArrayBuffer)
		{
			flags[0] |= WBin.FULL_BINARY;

			var classname = WBin.getObjectClassName( origin );
			//alloc memory
			var data = new Uint8Array(WBin.HEADER_SIZE + content.length);
			//set fourcc
			data.set(WBin.stringToUint8Array( WBin.FOUR_CC ));
			//set version
			data.set(version, 4);
			//Set flags
			data.set(flags, 8);
			//set classname
			data.set(WBin.stringToUint8Array(classname,WBin.CLASSNAME_SIZE), 14);
			//set data
			data.set(content, WBin.HEADER_SIZE);
			return data;
		}
		else
			origin = content;
	}

	//create 
	var total_size = WBin.HEADER_SIZE;
	var lumps = [];
	var lump_offset = 0;

	//gather lumps
	for(var i in origin)
	{
		var data = origin[i];
		if(data == null) continue;

		var classname = WBin.getObjectClassName(data);

		var code = WBin.CODES[ classname ];
		if(!code) 
			code = "OB"; //generic

		//class specific actions
		if (code == "NU")
			data = data.toString(); //numbers are stored as strings
		else if(code == "OB")
			data = JSON.stringify(data); //serialize the data

		var data_length = 0;

		//convert all to typed arrays
		if(typeof(data) == "string")
			data = WBin.stringToUint8Array(data);

		//typed array
		if(data.buffer && data.buffer.constructor == ArrayBuffer)
		{
			//clone the data, to avoid problems with shared arrays
			data = new Uint8Array( new Uint8Array( data.buffer, data.buffer.byteOffset, data.buffer.byteLength ) ); 
			data_length = data.byteLength;
		}
		else if(data.constructor == ArrayBuffer) //plain buffer
			data_length = data.byteLength;
		else
			throw("WBin: cannot be anything different to ArrayBuffer");

		var lumpname = i.substring(0,WBin.LUMPNAME_SIZE);
		if(lumpname.length < i.length)
			console.error("Lump name is too long (max is "+WBin.LUMPNAME_SIZE+"), it has been cut down, this could lead to an error in the future");
		lumps.push({code: code, name: lumpname, data: data, start: lump_offset, size: data_length});
		lump_offset += data_length;
		total_size += WBin.LUMPHEADER_SIZE + data_length;
	}

	//construct the final file
	var data = new Uint8Array(total_size);
	//set fourcc
	data.set(WBin.stringToUint8Array( WBin.FOUR_CC ));
	//set version
	data.set(version, 4);
	//set flags
	data.set(flags, 8);	
	//set num lumps
	data.set( new Uint8Array( new Uint16Array([lumps.length]).buffer ), 10);	
	//set origin_class_name
	if(origin_class_name)
		data.set( WBin.stringToUint8Array( origin_class_name, WBin.CLASSNAME_SIZE ), 12);

	var lump_data_start = WBin.HEADER_SIZE + lumps.length * WBin.LUMPHEADER_SIZE;

	//copy lumps to final file
	var nextPos = WBin.HEADER_SIZE;
	for(var j in lumps)
	{
		var lump = lumps[j];
		var buffer = lump.data;

		//create lump header
		var lump_header = new Uint8Array( WBin.LUMPHEADER_SIZE );
		lump_header.set( new Uint8Array( (new Uint32Array([lump.start])).buffer ), 0);
		lump_header.set( new Uint8Array( (new Uint32Array([lump.size])).buffer ), 4);
		lump_header.set( WBin.stringToUint8Array( lump.code, 2), 8);
		lump_header.set( WBin.stringToUint8Array( lump.name, WBin.LUMPNAME_SIZE), 10);

		//copy lump header
		data.set(lump_header,nextPos); 
		nextPos += WBin.LUMPHEADER_SIZE;

		//copy lump data
		var view = new Uint8Array( lump.data );
		data.set(view, lump_data_start + lump.start);
	}

	return data;
}


/**
* Extract the info from a Uint8Array containing WBin info and returns the object with all the lumps.
* If the data contains info about the class to instantiate, the WBin instantiates the class and passes the data to it
* @method WBin.load
* @param {UInt8Array} data_array 
* @param {bool} skip_classname avoid getting the instance of the class specified in classname, and get only the lumps
* @return {*} Could be an Object with all the lumps or an instance to the class specified in the WBin data
*/
WBin.load = function( data_array, skip_classname )
{
	//clone to avoid possible memory aligment problems
	data_array = new Uint8Array(data_array);

	var header = WBin.getHeaderInfo(data_array);
	if(!header)
	{
		console.error("Wrong WBin");
		return null;
	}

	if(header.version > (new Float32Array([WBin.VERSION])[0]) ) //all this because sometimes there are precission problems
		console.log("ALERT: WBin version is higher that code version");

	//lump unpacking
	var object = {};
	for(var i in header.lumps)
	{
		var lump = header.lumps[i];
		var lump_data = header.lump_data.subarray( lump.start, lump.start + lump.size );

		if(lump.size != lump_data.length )
			throw("WBin: incorrect wbin lump size");

		var lump_final = null;

		var data_class_name = WBin.REVERSE_CODES[ lump.code ];
		if(!data_class_name)
			throw("WBin: Incorrect data code");

		switch(data_class_name)
		{
			case "null": break;
			case "String": lump_final = WBin.Uint8ArrayToString( lump_data ); break;
			case "Number": lump_final = parseFloat( WBin.Uint8ArrayToString( lump_data ) ); break;
			case "Object": lump_final = JSON.parse( WBin.Uint8ArrayToString( lump_data ) ); break;
			case "ArrayBuffer": lump_final = new Uint8Array(lump_data).buffer; break; //clone
			default:
				lump_data = new Uint8Array(lump_data); //clone to avoid problems with bytes alignment
				var ctor = window[data_class_name];
				if(!ctor) throw("ctor not found in WBin: " + data_class_name );

				if( (lump_data.length / ctor.BYTES_PER_ELEMENT)%1 != 0)
					throw("WBin: size do not match type");
				lump_final = new ctor(lump_data.buffer);
		}
		object[ lump.name ] = lump_final;
	}

	//check if className exists, if it does use internal class parser
	if(!skip_classname && header.classname)
	{
		var ctor = window[ header.classname ];
		if(ctor && ctor.fromBinary)
			return ctor.fromBinary(object);
		else if(ctor && ctor.prototype.fromBinary)
		{
			var inst = new ctor();
			inst.fromBinary(object);
			return inst;
		}
		else
		{
			object["@classname"] = header.classname;
		}
	}	

	return object;
}


/**
* Extract the header info from an ArrayBuffer (it contains version, and lumps info)
* @method WBin.getHeaderInfo
* @param {UInt8Array} data_array 
* @return {Object} Header
*/
WBin.getHeaderInfo = function(data_array)
{
	//check FOURCC
	var fourcc = data_array.subarray(0,4);
	var good_header = true;
	for(var i = 0; i < fourcc.length; i++)
		if(fourcc[i] != 0 && fourcc[i] != WBin.FOUR_CC.charCodeAt(i))
			return null; //wrong fourcc

	var version = WBin.readFloat32( data_array, 4);
	var flags = new Uint8Array( data_array.subarray(8,10) );
	var numlumps = WBin.readUint16(data_array, 10);
	var classname = WBin.Uint8ArrayToString( data_array.subarray(12,12 + WBin.CLASSNAME_SIZE) );

	var lumps = [];
	for(var i = 0; i < numlumps; ++i)
	{
		var start = WBin.HEADER_SIZE + i * WBin.LUMPHEADER_SIZE;
		var lumpheader = data_array.subarray( start, start + WBin.LUMPHEADER_SIZE );
		var lump = {};
		lump.start = WBin.readUint32(lumpheader,0);
		lump.size  = WBin.readUint32(lumpheader,4);
		lump.code  = WBin.Uint8ArrayToString(lumpheader.subarray(8,10));
		lump.name  = WBin.Uint8ArrayToString(lumpheader.subarray(10));
		lumps.push(lump);
	}

	var lump_data = data_array.subarray( WBin.HEADER_SIZE + numlumps * WBin.LUMPHEADER_SIZE );

	return {
		version: version,
		flags: flags,
		classname: classname,
		numlumps: numlumps,
		lumps: lumps,
		lump_data: lump_data
	};
}

WBin.getObjectClassName = function(obj) {
    if (obj && obj.constructor && obj.constructor.toString) {
        var arr = obj.constructor.toString().match(
            /function\s*(\w+)/);
        if (arr && arr.length == 2) {
            return arr[1];
        }
    }
    return undefined;
}

WBin.stringToUint8Array = function(str, fixed_length)
{
	var r = new Uint8Array( fixed_length ? fixed_length : str.length);
	for(var i = 0; i < str.length; i++)
		r[i] = str.charCodeAt(i);
	return r;
}

WBin.Uint8ArrayToString = function(typed_array, same_size)
{
	var r = "";
	for(var i = 0; i < typed_array.length; i++)
		if (typed_array[i] == 0 && !same_size)
			break;
		else
			r += String.fromCharCode( typed_array[i] );
	return r;
}

//I could use DataView but I prefeer my own version
WBin.readUint16 = function(buffer, pos)
{
	var f = new Uint16Array(1);
	var view = new Uint8Array(f.buffer);
	view.set( buffer.subarray(pos,pos+2) );
	return f[0];
}

WBin.readUint32 = function(buffer, pos)
{
	var f = new Uint32Array(1);
	var view = new Uint8Array(f.buffer);
	view.set( buffer.subarray(pos,pos+4) );
	return f[0];
}

WBin.readFloat32 = function(buffer, pos)
{
	var f = new Float32Array(1);
	var view = new Uint8Array(f.buffer);
	view.set( buffer.subarray(pos,pos+4) );
	return f[0];
}

/* CANNOT BE DONE, XMLHTTPREQUEST DO NOT ALLOW TO READ PROGRESSIVE BINARY DATA (yet)
//ACCORDING TO THIS SOURCE: http://chimera.labs.oreilly.com/books/1230000000545/ch15.html#XHR_STREAMING

WBin.progressiveLoad = function(url, on_header, on_lump, on_complete, on_error)
{
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);

    //get binary format
	xhr.responseType = "arraybuffer";
  	xhr.overrideMimeType( "application/octet-stream" );

    //get data as it arrives
	xhr.onprogress = function(evt)
    {
		console.log(this.response); //this is null till the last packet
		if (!evt.lengthComputable) return;
		var percentComplete = Math.round(evt.loaded * 100 / evt.total);
		//on_progress( percentComplete );
    }

    xhr.onload = function(load)
	{
		var response = this.response;
		if(on_complete)
			on_complete.call(this, response);
	};
    xhr.onerror = function(err) {
    	console.error(err);
		if(on_error)
			on_error(err);
	}
	//start downloading
    xhr.send();
}
*/

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
		this.model_matrix = new Float32Array(this.stack.buffer,0,16*4);
		mat4.identity( this.model_matrix );

		//matrices
		this.camera = null;
		this.camera_position = vec3.create();
		this.view_matrix = mat4.create();
		this.projection_matrix = mat4.create();
		this.viewprojection_matrix = mat4.create();

		this.camera_stack = []; //not used yet

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

		/*
		for(var i = 0; i < segments; i++)
		{
			quat.setAxisAngle(R,axis, 2 * Math.PI * (i/segments));
			vec3.transformQuat(temp, [0,0,radius], R);
			vertices.set(temp, i*3);
			vertices.set([temp[0],temp[2],temp[1]], i*3+segments*3);
			vertices.set([temp[1],temp[0],temp[2]], i*3+segments*3*2);
		}
		*/

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
		else if(image.constructor == Texture)
			texture = image;

		if(!texture) return;

		this.push();
		//this.lookAt(position, this.camera_position,[0,1,0]);
		this.billboard(position);
		this.scale(size,size,size);
		texture.bind(0);
		this.renderMesh(this.quad_mesh, gl.TRIANGLE_FAN, this.shader_texture );
		this.pop();
	},

	renderMesh: function(mesh, primitive, shader)
	{
		if(!this.ready) throw ("Draw.js not initialized, call Draw.init()");
		if(!shader)
			shader = mesh.vertexBuffers["colors"] ? this.shader_color : this.shader;

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
	}
};
// ******* LScript  **************************

/**
* LScript allows to compile code during execution time having a clean context
* @class LScript
* @constructor
*/

function LScript()
{
	this.code = "function update(dt) {\n\n}";
	this.valid_callbacks = ["start","update"];
	this.extracode = "";
	this.catch_exceptions = true;
}

LScript.prototype.compile = function( arg_vars )
{
	var argv_names = [];
	var argv_values = [];
	if(arg_vars)
	{
		for(var i in arg_vars)
		{
			argv_names.push(i);
			argv_values.push( arg_vars[i]);
		}
	}
	argv_names = argv_names.join(",");

	var code = this.code;

	var classname = "_LScript"
	var argv = "component, node";
	code = "var _myclass = function "+classname+"("+argv_names+") {\n" + this.extracode + "\n" + code + "\n";

	var extra_code = "";
	for(var i in this.valid_callbacks)
		extra_code += "	if(typeof("+this.valid_callbacks[i]+") != 'undefined') this."+ this.valid_callbacks[i] + " = "+this.valid_callbacks[i]+";\n";

	extra_code += "\n}\n; _myclass;";

	code += extra_code;
	this._last_executed_code = code;

	try
	{
		this._class = eval(code);
		this._context = LScript.applyToConstructor( this._class, argv_values );
	}
	catch (err)
	{
		this._class = null;
		this._context = null;
		console.error("Error in script\n" + err);
		console.error(this._last_executed_code );
		if(this.onerror)
			this.onerror(err);
		return false;
	}
	return true;
}

LScript.prototype.hasMethod = function(name)
{
	if(!this._context || !this._context[name] || typeof(this._context[name]) != "function") 
		return false;
	return true;
}


LScript.prototype.callMethod = function(name, argv)
{
	if(!this._context || !this._context[name]) return;

	if(!this.catch_exceptions)
		return this._context[name].apply(this._context, argv);

	try
	{
		return this._context[name].apply(this._context, argv);
	}
	catch(err)
	{
		console.error("Error in function\n" + err);
		if(this.onerror)
			this.onerror(err);
	}
}

//from kybernetikos in stackoverflow
LScript.applyToConstructor = function(constructor, argArray) {
    var args = [null].concat(argArray);
    var factoryFunction = constructor.bind.apply(constructor, args);
    return new factoryFunction();
}



//Global Scope
var trace = window.console ? console.log.bind(console) : function() {};

function toArray(v) { return Array.apply( [], v ); }
Object.defineProperty(Object.prototype, "merge", { 
    value: function(v) {
        for(var i in v)
			this[i] = v[i];
		return this;
    },
    configurable: true,
    writable: false,
	enumerable: false  // uncomment to be explicit, though not necessary
});

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

	/**
	* Contains all the registered material classes
	* 
	* @property MaterialClasses
	* @type {Object}
	* @default {}
	*/
	MaterialClasses: {},

	/**
	* Register a component so it is listed when searching for new components to attach
	*
	* @method registerMaterialClass
	* @param {ComponentClass} comp component class to register
	*/
	registerMaterialClass: function(material_class) { 
		//register
		this.MaterialClasses[ getClassName(material_class) ] = material_class;

		//extend
		LS.extendClass( Material, material_class );

		//event
		LEvent.trigger(LS,"materialclass_registered",material_class);
		material_class.resource_type = "Material";
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
		if(typeof(request) === "string")
			throw("LS.request expects object, not string. Use LS.get or LS.getJSON");
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
			if(this.status != 200)
			{
				var err = "Error " + this.status;
				if(request.error)
					request.error(err);
				return;
			}

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
			LEvent.trigger(xhr,"done",response);
		};
        xhr.onerror = function(err) {
			if(request.error)
				request.error(err);
			LEvent.trigger(this,"fail", err);
		}
        xhr.send(request.data);

		return xhr;

		//return $.ajax(request);
	},

	get: function(url, data)
	{
		return LS.request({url:url, data:data});
	},

	getJSON: function(url, data)
	{
		return LS.request({url:url, data:data, dataType:"json"});
	}
};



/**
* copy the properties (methods and attributes) of origin class into target class
* @method extendClass
* @param {Class} origin
* @param {Class} target
*/

function extendClass( origin, target ) {
	for(var i in origin) //copy class properties
	{
		if(target.hasOwnProperty(i))
			continue;
		target[i] = origin[i];
	}

	if(origin.prototype) //copy prototype properties
		for(var i in origin.prototype) //only enumerables
		{
			if(!origin.prototype.hasOwnProperty(i)) 
				continue;

			if(target.prototype.hasOwnProperty(i)) //avoid overwritting existing ones
				continue;

			//copy getters 
			if(origin.prototype.__lookupGetter__(i))
				target.prototype.__defineGetter__(i, origin.prototype.__lookupGetter__(i));
			else 
				target.prototype[i] = origin.prototype[i];

			//and setters
			if(origin.prototype.__lookupSetter__(i))
				target.prototype.__defineSetter__(i, origin.prototype.__lookupSetter__(i));
		}
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
				o[i] = JSON.parse( JSON.stringify(v) ); //v.slice(0); //not safe using slice because it doesnt clone content, only container
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


/**
* Returns an string with the class name
* @method getClassName
* @param {Object} class object
* @return {String} returns the string with the name
*/
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
* Returns the attributes of one object and the type
* @method getObjectAttributes
* @param {Object} object
* @return {Object} returns object with attribute name and its type
*/

function getObjectAttributes(object)
{
	if(object.getAttributes)
		return object.getAttributes();
	var class_object = object.constructor;
	if(class_object.attributes)
		return class_object.attributes;

	var o = {};
	for(var i in object)
	{
		//ignore some
		if(i[0] == "_" || i.substr(0,6) == "jQuery") //skip vars with _ (they are private)
			continue;

		if(class_object != Object)
		{
			var hint = class_object["@"+i];
			if(hint && hint.type)
			{
				o[i] = hint.type;
				continue;
			}
		}

		var v = object[i];
		if(v == null)
			o[i] = null;
		else if ( isFunction(v) )
			continue;
		else if (  v.constructor === Number )
			o[i] = "number";
		else if ( v.constructor === String )
			o[i] = "string";
		else if ( v.buffer && v.buffer.constructor === ArrayBuffer ) //typed array
		{
			if(v.length == 2)
				o[i] = "vec2";
			else if(v.length == 3)
				o[i] = "vec3";
			else if(v.length == 4)
				o[i] = "vec4";
			else if(v.length == 9)
				o[i] = "mat3";
			else if(v.length == 16)
				o[i] = "mat4";
			else
				o[i] = "*";
		}
		else
			o[i] = "*";
	}
	return o;
}
LS.getObjectAttributes = getObjectAttributes;

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




/**
* Static class that contains all the resources loaded, parsed and ready to use.
* It also contains the parsers and methods in charge of processing them
*
* @class ResourcesManager
* @constructor
*/

// **** RESOURCES MANANGER *********************************************
// Resources should follow the text structure:
// + id: number, if stored in remote server
// + resource_type: string ("Mesh","Texture",...) or if omitted the classname will be used
// + filename: string (this string will be used to get the filetype)
// + fullpath: the full path to reach the file on the server (folder + filename)
// + preview: img url
// + toBinary: generates a binary version to store on the server
// + serialize: generates an stringifible object to store on the server

// + _original_data: ArrayBuffer with the bytes form the original file
// + _original_file: File with the original file where this res came from

var ResourcesManager = {

	path: "", //url to retrieve resources relative to the index.html
	proxy: "", //url to retrieve resources outside of this host
	ignore_cache: false, //change to true to ignore server cache
	free_data: false, //free all data once it has been uploaded to the VRAM
	keep_files: false, //keep the original files inside the resource (used mostly in the webglstudio editor)

	//some containers
	resources: {}, //filename associated to a resource (texture,meshes,audio,script...)
	meshes: {}, //loadead meshes
	textures: {}, //loadead textures
	materials: {}, //shared materials

	resources_being_loaded: {}, //resources waiting to be loaded
	resources_being_processes: {}, //used to avoid loading stuff that is being processes
	num_resources_being_loaded: 0,
	MAX_TEXTURE_SIZE: 4096,

	formats: {"js":"text", "json":"json", "xml":"xml"},
	formats_resource: {},	//tells which resource expect from this file format
	resource_pre_callbacks: {}, //used to extract resource info from a file ->  "obj":callback
	resource_post_callbacks: {}, //used to post process a resource type -> "Mesh":callback

	/**
	* Returns a string to append to any url that should use the browser cache (when updating server info)
	*
	* @method getNoCache
	* @param {Boolean} force force to return a nocache string ignoring the default configuration
	* @return {String} a string to attach to a url so the file wont be cached
	*/

	getNoCache: function(force) { return (!this.ignore_cache && !force) ? "" : "nocache=" + getTime() + Math.floor(Math.random() * 1000); },

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

	registerFileFormat: function(extension, data_type)
	{
		this.formats[extension.toLowerCase()] = data_type;
	},	

	registerResourcePreProcessor: function(fileformats, callback, data_type, resource_type)
	{
		var ext = fileformats.split(",");
		for(var i in ext)
		{
			var extension = ext[i].toLowerCase();
			this.resource_pre_callbacks[ extension ] = callback;
			if(data_type)
				this.formats[ extension ] = data_type;
			if(resource_type)
				this.formats_resource[ extension ] = resource_type;
		}
	},

	registerResourcePostProcessor: function(resource_type, callback)
	{
		this.resource_post_callbacks[ resource_type ] = callback;
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
		var question = url.indexOf("?");
		if(question != -1)
			url = url.substr(0,question);

		var point = url.lastIndexOf(".");
		if(point == -1) return "";
		return url.substr(point+1).toLowerCase();
	},

	/**
	* Returns the filename from a full path
	*
	* @method getFilename
	* @param {String} fullpath
	* @return {String} filename extension
	*/

	getFilename: function(fullpath)
	{
		var pos = fullpath.lastIndexOf("/");
		//if(pos == -1) return fullpath;
		var question = fullpath.lastIndexOf("?");
		question = (question == -1 ? fullpath.length : (question - 1) ) - pos;
		return fullpath.substr(pos+1,question);
	},	

	/**
	* Returns the filename without the extension
	*
	* @method getBasename
	* @param {String} fullpath
	* @return {String} filename extension
	*/

	getBasename: function(fullpath)
	{
		var name = this.getFilename(fullpath);
		var pos = name.indexOf(".");
		if(pos == -1) return name;
		return name.substr(0,pos);
	},		

	/**
	* Loads all the resources in the Object (it uses an object to store not only the filename but also the type)
	*
	* @method loadResources
	* @param {Object} resources contains all the resources, associated with its type
	* @param {Object}[options={}] options to apply to the loaded resources
	*/

	loadResources: function(res, options )
	{
		for(var i in res)
		{
			if( typeof(i) != "string" || i[0] == ":" )
				continue;
			this.load(i, options );
		}
	},	

	/**
	* Set the base path where all the resources will be fetched (unless they have absolute URL)
	* By default it will use the website home address
	*
	* @method setPath
	* @param {String} url
	*/
	setPath: function( url )
	{
		this.path = url;
	},

	/**
	* Set a proxy url where all non-local resources will be requested, allows to fetch assets to other servers.
	* request will be in this form: proxy_url + "/" + url_with_protocol: ->   http://myproxy.com/google.com/images/...
	*
	* @method setProxy
	* @param {String} proxy_url
	*/
	setProxy: function( proxy_url )
	{
		if( proxy_url.indexOf("@") != -1 )
			this.proxy = "http://" + proxy_url.replace("@", window.location.host );
		else
			this.proxy = proxy_url;
	},

	/**
	* transform a url to a full url taking into account proxy and local_repository
	*
	* @method getFullURL
	* @param {String} url
	* @param {Object} options
	* @return {String} full url
	*/
	getFullURL: function( url, options )
	{
		var full_url = "";
		if(url.substr(0,7) == "http://")
		{
			full_url = url;
			if(this.proxy) //proxy external files
				full_url = this.proxy + url.substr(7);
		}
		else
		{
			if(options && options.local_repository)
				full_url = options.local_repository + "/" + url;
			else
				full_url = this.path + url;
		}

		//you can ignore the resources server for some assets if you want
		if(options && options.force_local_url)
			full_url = url;

		return full_url;
	},

	/**
	* Loads a generic resource, the type will be infered from the extension, if it is json or wbin it will be processed
	*
	* @method load
	* @param {String} url where the resource is located (if its a relative url it depends on the path attribute)
	* @param {Object}[options={}] options to apply to the loaded image
	* @param {Function} [on_complete=null] callback when the resource is loaded and cached
	*/

	load: function(url, options, on_complete)
	{
		options = options || {};

		//if we already have it, then nothing to do
		if(this.resources[url] != null)
		{
			if(on_complete)
				on_complete(this.resources[url]);
			return true;
		}

		//extract the filename extension
		var extension = this.getExtension(url);
		if(!extension) //unknown file type
			return false;

		//if it is already being loaded, then add the callback and wait
		if(this.resources_being_loaded[url] != null)
		{
			this.resources_being_loaded[url].push( {options: options, callback: on_complete} );
			return;
		}

		if(this.resources_being_processes[url])
			return; //nothing to load, just waiting for the callback to process it

		//otherwise we have to load it
		//set the callback
		this.resources_being_loaded[url] = [{options: options, callback: on_complete}];
		//send an event if we are starting to load (used for loading icons)
		if(this.num_resources_being_loaded == 0)
			LEvent.trigger(ResourcesManager,"start_loading_resources",url);
		this.num_resources_being_loaded++;

		var full_url = this.getFullURL(url);

		//avoid the cache (if you want)
		var nocache = this.getNoCache();
		if(nocache)
			full_url += (full_url.indexOf("?") == -1 ? "?" : "&") + nocache;

		//create the ajax request
		var settings = {
			url: full_url,
			success: function(response){
				ResourcesManager.processResource(url, response, options, ResourcesManager._resourceLoadedSuccess );
			},
			error: function(err) { 	ResourcesManager._resourceLoadedError(url,err); }
		};

		//in case we need to force a response format 
		var file_format = this.formats[ extension ];
		if(file_format) //if not it will be set by http server
			settings.dataType = file_format;

		//send the REQUEST
		LS.request(settings); //ajax call
		return false;
	},

	/**
	* Process resource: transform some data in an Object ready to use and stores it (in most cases uploads it to the GPU)
	*
	* @method processResource
	* @param {String} url where the resource is located (if its a relative url it depends on the path attribute)
	* @param {*} data the data of the resource (could be string, arraybuffer, image... )
	* @param {Object}[options={}] options to apply to the loaded resource
	*/

	processResource: function(url, data, options, on_complete)
	{
		options = options || {};
		if(!data) throw("No data found when processing resource: " + url);
		var resource = null;
		var extension = this.getExtension(url);

		//this.resources_being_loaded[url] = [];
		this.resources_being_processes[url] = true;

		//no extension, then or it is a JSON, or an object with object_type or a WBin
		if(!extension)
		{
			if(typeof(data) == "string")
				data = JSON.parse(data);

			if(data.constructor == ArrayBuffer)
			{
				resource = WBin.load(data);
				inner_onResource(url, resource);
				return;
			}
			else
			{
				var type = data.object_type;
				if(type && window[type])
				{
					var ctor = window[type];
					var resource = null;
					if(ctor.prototype.configure)
					{
						resource = new window[type]();
						resource.configure( data );
					}
					else
						resource = new window[type]( data );
					inner_onResource(url, resource);
					return;
				}
				else
					return false;
			}
		}

		var callback = this.resource_pre_callbacks[extension.toLowerCase()];
		if(!callback)
		{
			console.log("Resource format unknown: " + extension)
			return false;
		}

		//parse
		var resource = callback(url, data, options, inner_onResource);
		if(resource)
			inner_onResource(url, resource);

		//callback when the resource is ready
		function inner_onResource(filename, resource)
		{
			resource.filename = filename;
			if(options.filename) //used to overwrite
				resource.filename = options.filename;

			if(!resource.fullpath)
				resource.fullpath = url;

			if(LS.ResourcesManager.resources_being_processes[filename])
				delete LS.ResourcesManager.resources_being_processes[filename];

			//keep original file inside the resource
			if(LS.ResourcesManager.keep_files && (data.constructor == ArrayBuffer || data.constructor == String) )
				resource._original_data = data;

			//load associated resources
			if(resource.getResources)
				ResourcesManager.loadResources( resource.getResources({}) );

			//register in the containers
			LS.ResourcesManager.registerResource(url, resource);

			//callback 
			if(on_complete)
				on_complete(url, resource, options);
		}
	},

	/**
	* Stores the resource inside the manager containers. This way it will be retrieveble by anybody who needs it.
	*
	* @method registerResource
	* @param {String} filename 
	* @param {Object} resource 
	*/

	registerResource: function(filename,resource)
	{
		//get which kind of resource
		if(!resource.object_type)
			resource.object_type = LS.getObjectClassName(resource);
		var type = resource.object_type;
		if(resource.constructor.resource_type)
			type = resource.constructor.resource_type;

		//some resources could be postprocessed after being loaded
		var post_callback = this.resource_post_callbacks[ type ];
		if(post_callback)
			post_callback(filename, resource);

		//global container
		this.resources[filename] = resource;

		//send message to inform new resource is available
		LEvent.trigger(this,"resource_registered", resource);
		Scene.refresh(); //render scene
	},	

	/**
	* Returns an object with a representation of the resource internal data
	* The order to obtain that object is:
	* 1. test for _original_file (File or Blob)
	* 2. test for _original_data (ArrayBuffer)
	* 3. toBinary() (ArrayBuffer)
	* 4. toBlob() (Blob)
	* 5. toBase64() (String)
	* 6. serialize() (Object in JSON format)
	* 7. data property 
	* 8. JSON.stringify(...)
	*
	* @method computeResourceInternalData
	* @param {Object} resource 
	* @return {Object} it has two fields: data and encoding
	*/
	computeResourceInternalData: function(resource)
	{
		if(!resource) throw("Resource is null");

		var data = null;
		var encoding = "text";
		var extension = "";

		//get the data
		if (resource._original_file) //file
		{
			data = resource._original_file;
			encoding = "file";
		}
		else if(resource._original_data) //file in ArrayBuffer format
			data = resource._original_data;
		else if(resource.toBinary) //a function to compute the ArrayBuffer format
		{
			data = resource.toBinary();
			encoding = "binary";
			extension = "wbin";
		}
		else if(resource.toBlob) //a blob (Canvas should have this)
		{
			data = resource.toBlob();
			encoding = "file";
		}
		else if(resource.toBase64) //a base64 string
		{
			data = resource.toBase64();
			encoding = "base64";
		}
		else if(resource.serialize) //a json object
			data = JSON.stringify( resource.serialize() );
		else if(resource.data) //regular string data
			data = resource.data;
		else
			data = JSON.stringify( resource );

		if(data.buffer && data.buffer.constructor == ArrayBuffer)
			data = data.buffer; //store the data in the arraybuffer

		return {data:data, encoding: encoding, extension: extension};
	},	

	renameResource: function(old, newname)	
	{
		var res = this.resources[ old ];
		if(!res) return;

		res.filename = newname;
		res.fullpath = newname;
		this.resources[newname] = res;
		delete this.resources[ old ];

		//ugly: too hardcoded
		if( this.meshes[old] ) {
			delete this.meshes[ old ];
			this.meshes[ newname ] = res;
		}
		if( this.textures[old] ) {
			delete this.textures[ old ];
			this.textures[ newname ] = res;
		}
	},

	/**
	* Tells if it is loading resources
	*
	* @method isLoading
	* @return {Boolean}
	*/
	isLoading: function()
	{
		return this.num_resources_being_loaded > 0;
	},	

	processScene: function(filename, data, options)
	{
		var scene_data = Parser.parse(filename, data, options);

		//register meshes
		if(scene_data.meshes)
		{
			for (var i in scene_data.meshes)
			{
				var mesh_data = scene_data.meshes[i];
				var mesh = GL.Mesh.load(mesh_data);
				/*
				var morphs = [];
				if(mesh.morph_targets)
					for(var j in mesh.morph_targets)
					{

					}
				*/

				ResourcesManager.registerResource(i,mesh);
			}
		}

		var scene = new LS.SceneTree();
		scene.configure(scene_data);

		//load resources
		scene.loadResources();

		return scene;
	},

	computeImageMetadata: function(texture)
	{
		var metadata = { width: texture.width, height: texture.height };
		return metadata;
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

	//Called after a resource has been loaded successfully and processed
	_resourceLoadedSuccess: function(url,res)
	{
		if( LS.ResourcesManager.debug )
			console.log("RES: " + url + " ---> " + ResourcesManager.num_resources_being_loaded);

		for(var i in ResourcesManager.resources_being_loaded[url])
		{
			if(ResourcesManager.resources_being_loaded[url][i].callback != null)
				ResourcesManager.resources_being_loaded[url][i].callback(res);
		}
		//two pases, one for launching, one for removing
		if(ResourcesManager.resources_being_loaded[url])
		{
			delete ResourcesManager.resources_being_loaded[url];
			ResourcesManager.num_resources_being_loaded--;
			if( ResourcesManager.num_resources_being_loaded == 0)
			{
				LEvent.trigger( ResourcesManager, "end_loading_resources");
			}
		}
	},

	_resourceLoadedError: function(url, error)
	{
		console.log("Error loading " + url);
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
LS.RM = ResourcesManager;

LS.getTexture = function(name_or_texture) {
	return LS.ResourcesManager.getTexture(name_or_texture);
}	


//Post process resources *******************

LS.ResourcesManager.registerResourcePostProcessor("Mesh", function(filename, mesh ) {

	mesh.object_type = "Mesh"; //useful
	if(mesh.metadata)
	{
		mesh.metadata = {};
		mesh.generateMetadata(); //useful
	}
	if(!mesh.bounding || mesh.bounding.length != BBox.data_length)
	{
		mesh.bounding = null; //remove bad one (just in case)
		mesh.updateBounding();
	}
	if(!mesh.getBuffer("normals"))
		mesh.computeNormals();

	if(LS.ResourcesManager.free_data) //free buffers to reduce memory usage
		mesh.freeData();

	LS.ResourcesManager.meshes[filename] = mesh;
});

LS.ResourcesManager.registerResourcePostProcessor("Texture", function(filename, texture ) {
	//store
	LS.ResourcesManager.textures[filename] = texture;
});

LS.ResourcesManager.registerResourcePostProcessor("Material", function(filename, material ) {
	//store
	LS.ResourcesManager.materials[filename] = material;
});



//Resources readers *********
//global formats: take a file and extract info
LS.ResourcesManager.registerResourcePreProcessor("wbin", function(filename, data, options) {
	var data = new WBin.load(data);
	return data;
},"binary");

LS.ResourcesManager.registerResourcePreProcessor("json", function(filename, data, options) {
	var resource = data;
	if(typeof(data) == "object" && data.object_type && window[ data.object_type ])
	{
		var ctor = window[ data.object_type ];
		if(ctor.prototype.configure)
		{
			resource = new ctor();
			resource.configure(data);
		}
		else
			resource = new ctor(data);
	}
	return resource;
});

//Textures ********
//Takes one image (or canvas) as input and creates a Texture
LS.ResourcesManager.processImage = function(filename, img, options)
{
	if(img.width == (img.height / 6)) //cubemap
	{
		var texture = Texture.cubemapFromImage(img, { wrapS: gl.MIRROR, wrapT: gl.MIRROR, magFilter: gl.LINEAR, minFilter: gl.LINEAR_MIPMAP_LINEAR });
		texture.img = img;
		console.log("Cubemap created");
	}
	else //regular texture
	{
		var default_mag_filter = gl.LINEAR;
		var default_wrap = gl.REPEAT;
		//var default_min_filter = img.width == img.height ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR;
		var default_min_filter = gl.LINEAR_MIPMAP_LINEAR;
		if( !isPowerOfTwo(img.width) || !isPowerOfTwo(img.height) )
		{
			default_min_filter = gl.LINEAR;
			default_wrap = gl.CLAMP_TO_EDGE; 
		}
		var texture = null;

		//from TGAs...
		if(img.pixels) //not a real image, just an object with width,height and a buffer with all the pixels
			texture = GL.Texture.fromMemory(img.width, img.height, img.pixels, { format: (img.bpp == 24 ? gl.RGB : gl.RGBA), wrapS: gl.REPEAT, wrapT: gl.REPEAT, magFilter: default_mag_filter, minFilter: default_min_filter });
		else //default format is RGBA (because particles have alpha)
			texture = GL.Texture.fromImage(img, { format: gl.RGBA, wrapS: default_wrap, wrapT: default_wrap, magFilter: default_mag_filter, minFilter: default_min_filter });
		texture.img = img;
	}

	texture.filename = filename;
	texture.generateMetadata(); //useful
	return texture;
}

//basic formats
LS.ResourcesManager.registerResourcePreProcessor("jpg,jpeg,png,webp,gif", function(filename, data, options, callback) {

	var extension = LS.ResourcesManager.getExtension(filename);
	var mimetype = 'image/png';
	if(extension == "jpg" || extension == "jpeg")
		mimetype = "image/jpg";
	if(extension == "webp")
		mimetype = "image/webp";
	if(extension == "gif")
		mimetype = "image/gif";

	var blob = new Blob([data],{type: mimetype});
	var objectURL = URL.createObjectURL(blob);
	var image = new Image();
	image.src = objectURL;
	image.real_filename = filename; //hard to get the original name from the image
	image.onload = function()
	{
		var filename = this.real_filename;
		var texture = LS.ResourcesManager.processImage(filename, this, options);
		if(texture)
		{
			LS.ResourcesManager.registerResource(filename, texture);
			if(LS.ResourcesManager.keep_files)
				texture._original_data = data;
		}
		URL.revokeObjectURL(objectURL); //free memory
		if(!texture)
			return;

		if(callback)
			callback(filename,texture,options);
	}

},"binary","Texture");

//special formats parser inside the system
LS.ResourcesManager.registerResourcePreProcessor("dds,tga", function(filename, data, options) {

	//clone because DDS changes the original data
	var cloned_data = new Uint8Array(data).buffer;
	var texture_data = Parser.parse(filename, cloned_data, options);	

	if(texture_data.constructor == Texture)
	{
		var texture = texture_data;
		texture.filename = filename;
		return texture;
	}

	var texture = LS.ResourcesManager.processImage(filename, texture_data);
	return texture;
}, "binary","Texture");


//Meshes ********
LS.ResourcesManager.processASCIIMesh = function(filename, data, options) {

	var mesh_data = Parser.parse(filename, data, options);

	if(mesh_data == null)
	{
		console.error("Error parsing mesh: " + filename);
		return null;
	}

	var mesh = GL.Mesh.load(mesh_data);
	return mesh;
}

LS.ResourcesManager.registerResourcePreProcessor("obj,ase", LS.ResourcesManager.processASCIIMesh, "text","Mesh");

LS.ResourcesManager.processASCIIScene = function(filename, data, options) {

	var scene_data = Parser.parse(filename, data, options);

	if(scene_data == null)
	{
		console.error("Error parsing mesh: " + filename);
		return null;
	}

	//resources
	for(var i in scene_data.resources)
	{
		var resource = scene_data.resources[i];
		LS.ResourcesManager.processResource(i,resource);
	}

	var node = new LS.SceneNode();
	node.configure(scene_data.root);

	Scene.root.addChild(node);
	return node;
}

LS.ResourcesManager.registerResourcePreProcessor("dae", LS.ResourcesManager.processASCIIScene, "text","Scene");






Mesh.fromBinary = function( data_array )
{
	var o = null;
	if(data_array.constructor == ArrayBuffer )
		o = WBin.load( data_array );
	else
		o = data_array;

	var vertex_buffers = {};
	for(var i in o.vertex_buffers)
		vertex_buffers[ o.vertex_buffers[i] ] = o[ o.vertex_buffers[i] ];

	var index_buffers = {};
	for(var i in o.index_buffers)
		index_buffers[ o.index_buffers[i] ] = o[ o.index_buffers[i] ];

	var mesh = new GL.Mesh(vertex_buffers, index_buffers);
	mesh.info = o.info;
	mesh.bounding = o.bounding;
	if(o.bones)
	{
		mesh.bones = o.bones;
		//restore Float32array
		for(var i = 0; i < mesh.bones.length; ++i)
			mesh.bones[i][1] = mat4.clone(mesh.bones[i][1]);
		if(o.bind_matrix)
			mesh.bind_matrix = mat4.clone( o.bind_matrix );		
	}
	
	return mesh;
}

Mesh.prototype.toBinary = function()
{
	if(!this.info)
		this.info = {};


	//clean data
	var o = {
		object_type: "Mesh",
		info: this.info,
		groups: this.groups
	};

	if(this.bones)
	{
		var bones = [];
		//convert to array
		for(var i = 0; i < this.bones.length; ++i)
			bones.push([ this.bones[i][0], mat4.toArray( this.bones[i][1] ) ]);
		o.bones = bones;
		if(this.bind_matrix)
			o.bind_matrix = this.bind_matrix;
	}

	//bounding box
	if(!this.bounding)	
		this.updateBounding();
	o.bounding = this.bounding;

	var vertex_buffers = [];
	var index_buffers = [];

	for(var i in this.vertexBuffers)
	{
		var stream = this.vertexBuffers[i];
		o[ stream.name ] = stream.data;
		vertex_buffers.push( stream.name );

		if(stream.name == "vertices")
			o.info.num_vertices = stream.data.length / 3;
	}

	for(var i in this.indexBuffers)
	{
		var stream = this.indexBuffers[i];
		o[i] = stream.data;
		index_buffers.push( i );
	}

	o.vertex_buffers = vertex_buffers;
	o.index_buffers = index_buffers;

	//create pack file
	var bin = WBin.create(o, "Mesh");

	return bin;
}


/* Basic shader manager 
	- Allows to load all shaders from XML
	- Allows to use a global shader
*/

var ShadersManager = {
	default_xml_url: "data/shaders.xml",

	snippets: {},//to save source snippets
	compiled_shaders: {}, //shaders already compiled and ready to use
	global_shaders: {}, //shader codes to be compiled using some macros

	default_shader: null, //a default shader to rely when a shader is not found
	dump_compile_errors: true, //dump errors in console
	on_compile_error: null, //callback 

	init: function(url, ignore_cache)
	{
		//set a default shader 
		this.default_shader = null;

		//storage
		this.compiled_shaders = {};
		this.global_shaders = {};

		//base intro code for shaders
		this.global_extra_code = String.fromCharCode(10) + "#define WEBGL" + String.fromCharCode(10);

		//compile some shaders
		this.createDefaultShaders();

		//if a shader is not found, the default shader is returned, in this case a flat shader
		this.default_shader = this.get("flat");

		url = url || this.default_xml_url;
		this.last_shaders_url = url;
		this.loadFromXML(url, false, ignore_cache);
	},

	reloadShaders: function(on_complete)
	{
		this.loadFromXML( this.last_shaders_url, true,true, on_complete);
	},

	get: function(id, macros )
	{
		if(!id) return null;

		//if there is no macros, just get the old one
		if(!macros)
		{
			var shader = this.compiled_shaders[id];
			if (shader)
				return shader;
		}

		var global = this.global_shaders[id];

		if (global == null)
			return this.default_shader;

		var key = id + ":";
		var extracode = "";

		if(global.num_macros != 0)
		{
			//generate unique key
			for (var macro in macros)
			{
				if (global.macros[ macro ])
				{
					key += macro + "=" + macros[macro] + ":";
					extracode += String.fromCharCode(10) + "#define " + macro + " " + macros[macro] + String.fromCharCode(10); //why not "\n"??????
				}
			}//for macros
		}

		//hash key
		var hashkey = key.hashCode();

		//already compiled
		if (this.compiled_shaders[hashkey] != null)
			return this.compiled_shaders[hashkey];

		//compile and store it
		var vs_code = extracode + global.vs_code;
		var ps_code = extracode + global.ps_code;

		//expand code
		if(global.imports)
		{
			var already_imported = {}; //avoid to import two times the same code
			var replace_import = function(v)
			{
				var token = v.split("\"");
				var id = token[1];
				var snippet = ShadersManager.snippets[id];
				if(already_imported[id])
					return "//already imported: " + id + "\n";
				already_imported[id] = true;
				if(snippet)
					return snippet.code;
				return "//snippet not found: " + id + "\n";
			}

			vs_code = vs_code.replace(/#import\s+\"(\w+)\"\s*\n/g, replace_import );
			already_imported = {}; //clear
			ps_code	= ps_code.replace(/#import\s+\"(\w+)\"\s*\n/g, replace_import);
		}

		var shader = this.compileShader(vs_code, ps_code, key);
		if(shader)
			shader.global = global;
		return this.registerCompiledShader(shader, hashkey, id);
	},

	getGlobalShaderInfo: function(id)
	{
		return this.global_shaders[id];
	},

	compileShader: function(vs_code, ps_code, name)
	{
		if(!gl) return null;
		var shader = null;
		try
		{
			shader = new GL.Shader(this.global_extra_code + vs_code, this.global_extra_code + ps_code);
			shader.name = name;
			//console.log("Shader compiled: " + name);
		}
		catch (err)
		{
			if(this.dump_compile_errors)
			{
				console.error("Error compiling shader: " + name);
				console.log(err);
				console.groupCollapsed("Vertex Shader Code");
				//console.log("VS CODE\n************");
				var lines = (this.global_extra_code + vs_code).split("\n");
				for(var i in lines)
					console.log(i + ": " + lines[i]);
				console.groupEnd();

				console.groupCollapsed("Fragment Shader Code");
				//console.log("PS CODE\n************");
				lines = (this.global_extra_code + ps_code).split("\n");
				for(var i in lines)
					console.log(i + ": " + lines[i]);
				console.groupEnd();
				this.dump_compile_errors = false; //disable so the console dont get overflowed
			}

			if(this.on_compile_error)
				this.on_compile_error(err);

			return null;
		}
		return shader;
	},

	// given a compiled shader it caches it for later reuse
	registerCompiledShader: function(shader, key, id)
	{
		if(shader == null)
		{
			this.compiled_shaders[key] = this.default_shader;
			return this.default_shader;
		}

		shader.id = id;
		shader.key = key;
		this.compiled_shaders[key] = shader;
		return shader;
	},

	//loads some shaders from an XML
	loadFromXML: function (url, reset_old, ignore_cache, on_complete)
	{
		var nocache = ignore_cache ? "?nocache=" + getTime() + Math.floor(Math.random() * 1000) : "";
		LS.request({
		  url: url + nocache,
		  dataType: 'xml',
		  success: function(response){
				console.log("Shaders XML loaded: " + url);
				if(reset_old)
				{
					ShadersManager.global_shaders = {};
					ShadersManager.compiled_shaders = {};
				}
				ShadersManager.processShadersXML(response);
				if(on_complete)
					on_complete();
		  },
		  error: function(err){
			  console.log("Error parsing Shaders XML: " + err);
			  throw("Error parsing Shaders XML: " + err);
		  }
		});	
	},

	// process the XML to include the shaders
	processShadersXML: function(xml)
	{
		//get shaders
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

			//read all the supported macros
			var macros_str = "";
			var macros_attr = shader_element.attributes["macros"];
			if(macros_attr)
				macros_str += macros_attr.value;

			var macros_xml = shader_element.querySelector("macros");
			if(macros_xml)
				macros_str += macros_xml.textContent;

			var macros_array = macros_str.split(",");
			var macros = {};
			for(var i in macros_array)
				macros[ macros_array[i].trim() ] = true;

			//read the shaders code
			vs_code = shader_element.querySelector("code[type='vertex_shader']").textContent;
			ps_code = shader_element.querySelector("code[type='pixel_shader']").textContent;

			if(!vs_code || !ps_code)
			{
				console.log("no code in shader: " + id);
				continue;
			}

			var options = {};

			var multipass = shader_element.getAttribute("multipass");
			if(multipass)
				options.multipass = (multipass == "1" || multipass == "true");
			var imports = shader_element.getAttribute("imports");
			if(imports)
				options.imports = (imports == "1" || imports == "true");

			ShadersManager.registerGlobalShader(vs_code, ps_code, id, macros, options );
		}

		var snippets = xml.querySelectorAll('snippet');
		for(var i = 0; i < snippets.length; ++i)
		{
			var snippet = snippets[i];
			var id = snippet.getAttribute("id");
			var code = snippet.textContent;
			this.snippets[id] = {id:id, code:code};
		}

	},
	
	//adds source code of a shader that could be compiled if needed
	//id: name
	//macros: supported macros by the shader
	registerGlobalShader: function(vs_code, ps_code, id, macros, options )
	{
		var macros_found = {};
		/*
		//TODO: missing #ifndef and #define
		//regexMap( /USE_\w+/g, vs_code + ps_code, function(v) {
		regexMap( /#ifdef\s\w+/g, vs_code + ps_code, function(v) {
			//console.log(v);
			macros_found[v[0].split(' ')[1]] = true;
		});
		*/
		/*
		var m = /USE_\w+/g.exec(vs_code + ps_code);
		if(m)
			console.log(m);
		*/

		var num_macros = 0;
		for(var i in macros)
			num_macros += 1;

		var global = { 
			vs_code: vs_code, 
			ps_code: ps_code,
			macros: macros,
			num_macros: num_macros,
			macros_found: macros_found
		};

		if(options)
			for(var i in options)
				global[i] = options[i];

		this.global_shaders[id] = global;
		LEvent.trigger(ShadersManager,"newShader");
		return global;
	},

	//this is global code for default shaders
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

	//some shaders for starters
	createDefaultShaders: function()
	{
		//flat
		this.registerGlobalShader(this.common_vscode + '\
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
		this.registerGlobalShader(this.common_vscode + '\
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

		this.registerGlobalShader(this.common_vscode + '\
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
	}
};

//used for hashing keys
String.prototype.hashCode = function(){
    var hash = 0, i, c;
    if (this.length == 0) return hash;
    for (i = 0, l = this.length; i < l; ++i) {
        c  = this.charCodeAt(i);
        hash  = ((hash<<5)-hash)+c;
        hash |= 0; // Convert to 32bit integer
    }
    return hash;
};
//blending mode
var Blend = {
	NORMAL: "normal",
	ALPHA: "alpha",
	ADD: "add",
	MULTIPLY: "multiply",
	SCREEN: "screen",
	CUSTOM: "custom"
}

if(typeof(GL) == "undefined")
	throw("LiteSCENE requires to have litegl.js included before litescene.js");

BlendFunctions = {
	"normal": 	[GL.ONE, GL.ZERO],
	"alpha": 	[GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA],	
	"add": 		[GL.SRC_ALPHA, GL.DST_ALPHA],
	"multiply": [GL.DST_COLOR, GL.ONE_MINUS_SRC_ALPHA],
	"screen": 	[GL.SRC_ALPHA, GL.ONE],
	"custom": 	[GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA]
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
	this._dirty = true;

	//this.shader_name = null; //default shader
	this.color = new Float32Array([1.0,1.0,1.0]);
	this.opacity = 1.0;
	this.shader_name = "global";
	this.blend_mode = Blend.NORMAL;

	this.specular_factor = 0.1;
	this.specular_gloss = 10.0;

	//this.reflection_factor = 0.0;	

	//textures
	this.uvs_matrix = new Float32Array([1,0,0, 0,1,0, 0,0,1]);
	this.textures = {};

	if(o) 
		this.configure(o);
}

Material.icon = "mini-icon-material.png";


//material info attributes, use this to avoid errors when settings the attributes of a material

/**
* Surface color
* @property color
* @type {vec3}
* @default [1,1,1]
*/
Material.COLOR = "color";
/**
* Opacity. It must be < 1 to enable alpha sorting. If it is <= 0 wont be visible.
* @property opacity
* @type {number}
* @default 1
*/
Material.OPACITY = "opacity";

/**
* Blend mode, it could be any of Blend options (NORMAL,ALPHA, ADD, SCREEN)
* @property blend_mode
* @type {String}
* @default Blend.NORMAL
*/
Material.BLEND_MODE = "blend_mode";

Material.SPECULAR_FACTOR = "specular_factor";
/**
* Specular glossiness: the glossines (exponent) of specular light
* @property specular_gloss
* @type {number}
* @default 10
*/
Material.SPECULAR_GLOSS = "specular_gloss";


Material.OPACITY_TEXTURE = "opacity";	//used for baked GI
Material.COLOR_TEXTURE = "color";	//material color
Material.AMBIENT_TEXTURE = "ambient";
Material.SPECULAR_TEXTURE = "specular"; //defines specular factor and glossiness per pixel
Material.EMISSIVE_TEXTURE = "emissive";
Material.ENVIRONMENT_TEXTURE = "environment";

Material.COORDS_UV0 = "0";
Material.COORDS_UV1 = "1";
Material.COORDS_UV_TRANSFORMED = "transformed";
Material.COORDS_SCREEN = "screen";					//project to screen space
Material.COORDS_FLIPPED_SCREEN = "flipped_screen";	//used for realtime reflections
Material.COORDS_POLAR = "polar";					//use view vector as polar coordinates
Material.COORDS_POLAR_REFLECTED = "polar_reflected";//use reflected view vector as polar coordinates
Material.COORDS_POLAR_VERTEX = "polar_vertex";		//use normalized vertex as polar coordinates
Material.COORDS_WORLDXZ = "worldxz";
Material.COORDS_WORLDXY = "worldxy";
Material.COORDS_WORLDYZ = "worldyz";

Material.TEXTURE_COORDINATES = [ Material.COORDS_UV0, Material.COORDS_UV1, Material.COORDS_UV_TRANSFORMED, Material.COORDS_SCREEN, Material.COORDS_FLIPPED_SCREEN, Material.COORDS_POLAR, Material.COORDS_POLAR_REFLECTED, Material.COORDS_POLAR_VERTEX, Material.COORDS_WORLDXY, Material.COORDS_WORLDXZ, Material.COORDS_WORLDYZ ];
Material.DEFAULT_UVS = { "normal":Material.COORDS_UV0, "displacement":Material.COORDS_UV0, "environment": Material.COORDS_POLAR_REFLECTED, "irradiance" : Material.COORDS_POLAR };

Material.available_shaders = ["default","lowglobal","phong_texture","flat","normal","phong","flat_texture","cell_outline"];
Material.texture_channels = [ Material.COLOR_TEXTURE, Material.OPACITY_TEXTURE, Material.AMBIENT_TEXTURE, Material.SPECULAR_TEXTURE, Material.EMISSIVE_TEXTURE, Material.ENVIRONMENT_TEXTURE ];


Material.prototype.applyToRenderInstance = function(ri)
{
	if(this.blend_mode != Blend.NORMAL)
		ri.flags |= RI_BLEND;

	if(this.blend_mode == Blend.CUSTOM && this.blend_func)
		ri.blend_func = this.blend_func;
	else
		ri.blend_func = BlendFunctions[ this.blend_mode ];
}

// RENDERING METHODS
Material.prototype.fillSurfaceShaderMacros = function(scene)
{
	var macros = {};

	//iterate through textures in the material
	for(var i in this.textures) 
	{
		var texture = this.getTexture(i);
		if(!texture) continue;
		var texture_uvs = this.textures[i + "_uvs"] || Material.DEFAULT_UVS[i] || "0";
		//special cases

		macros[ "USE_" + i.toUpperCase() + (texture.texture_type == gl.TEXTURE_2D ? "_TEXTURE" : "_CUBEMAP") ] = "uvs_" + texture_uvs;
	}

	//if(this.reflection_factor > 0.0) 
	//	macros.USE_REFLECTION = "";	

	//extra macros
	if(this.extra_macros)
		for(var im in this.extra_macros)
			macros[im] = this.extra_macros[im];

	this._macros = macros;
}

//Fill with info about the light
// This is hard to precompute and reuse because here macros depend on the node (receive_shadows?), on the scene (shadows enabled?), on the material (contant diffuse?) 
// and on the light itself
/*
Material.prototype.getLightShaderMacros = function(light, node, scene, render_options)
{
	var macros = {};

	var use_shadows = light.cast_shadows && light._shadowmap && light._light_matrix != null && !render_options.shadows_disabled;

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
	{
		macros.USE_PROJECTIVE_LIGHT = "";
		if(light_projective_texture.texture_type == gl.TEXTURE_CUBE_MAP)
			macros.USE_PROJECTIVE_LIGHT_CUBEMAP = "";
	}

	var light_average_texture = light.average_texture;
	if(light_average_texture && light_average_texture.constructor == String)
		light_average_texture = ResourcesManager.textures[light_average_texture];
	if(light_average_texture)
		macros.USE_TEXTURE_AVERAGE_LIGHT = "";

	//if(vec3.squaredLength( light.color ) < 0.001 || node.flags.ignore_lights)
	//	macros.USE_IGNORE_LIGHT = "";

	if(light.offset > 0.001)
		macros.USE_LIGHT_OFFSET = "";

	if(use_shadows && node.flags.receive_shadows != false)
	{
		macros.USE_SHADOW_MAP = "";
		if(light._shadowmap && light._shadowmap.texture_type == gl.TEXTURE_CUBE_MAP)
			macros.USE_SHADOW_CUBEMAP = "";
		if(light.hard_shadows || macros.USE_SHADOW_CUBEMAP != null)
			macros.USE_HARD_SHADOWS = "";

		macros.SHADOWMAP_OFFSET = "";
	}

	return macros;
}
*/

Material.prototype.fillSurfaceUniforms = function( scene, options )
{
	var uniforms = {};
	var samplers = {};

	uniforms.u_material_color = new Float32Array([this.color[0], this.color[1], this.color[2], this.opacity]);
	uniforms.u_ambient_color = scene.ambient_color;
	uniforms.u_diffuse_color = new Float32Array([1,1,1]);

	uniforms.u_specular = [ this.specular_factor, this.specular_gloss ];
	uniforms.u_texture_matrix = this.uvs_matrix;

	uniforms.u_reflection = this.reflection_factor;


	//iterate through textures in the material
	for(var i in this.textures) 
	{
		var texture = this.getTexture(i);
		if(!texture) continue;

		samplers[ i + (texture.texture_type == gl.TEXTURE_2D ? "_texture" : "_cubemap") ] = texture;
		//this._bind_textures.push([i + (texture.texture_type == gl.TEXTURE_2D ? "_texture" : "_cubemap") ,texture]);
		//uniforms[ i + (texture.texture_type == gl.TEXTURE_2D ? "_texture" : "_cubemap") ] = texture.bind( last_slot );
		var texture_uvs = this.textures[i + "_uvs"] || Material.DEFAULT_UVS[i] || "0";
		//last_slot += 1;

		if(texture.texture_type == gl.TEXTURE_2D && (texture_uvs == Material.COORDS_POLAR_REFLECTED || texture_uvs == Material.COORDS_POLAR))
		{
			texture.bind(0);
			texture.setParameter( gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE ); //to avoid going up
			texture.setParameter( gl.TEXTURE_MIN_FILTER, gl.LINEAR ); //avoid ugly error in atan2 edges
		}
	}

	//add extra uniforms
	for(var i in this.extra_uniforms)
		uniforms[i] = this.extra_uniforms[i];

	this._uniforms = uniforms;
	this._samplers = samplers; //samplers without fixed slot
}

/**
* Configure the material getting the info from the object
* @method configure
* @param {Object} object to configure from
*/
Material.prototype.configure = function(o)
{
	for(var i in o)
		this.setProperty( i, o[i] );

	/*	//cloneObject(o, this);
	for(var i in o)
	{
		var v = o[i];
		var r = null;
		switch(i)
		{
			//numbers
			case "opacity": 
			case "specular_factor":
			case "specular_gloss":
			case "reflection": 
			case "blend_mode":
			//strings
			case "shader_name":
			//bools
				r = v; 
				break;
			//vectors
			case "color": 
				r = new Float32Array(v); 
				break;
			case "textures":
				this.textures = o.textures;
				continue;
			case "transparency": //special cases
				this.opacity = 1 - v;
			default:
				continue;
		}
		this[i] = r;
	}

	if(o.uvs_matrix && o.uvs_matrix.length == 9)
		this.uvs_matrix = new Float32Array(o.uvs_matrix);
	*/
}

/**
* Serialize this material 
* @method serialize
* @return {Object} object with the serialization info
*/
Material.prototype.serialize = function()
{
	 var o = cloneObject(this);
	 o.material_class = getObjectClassName(this);
	 return o;
}


/**
* Clone this material (keeping the class)
* @method clone
* @return {Material} Material instance
*/
Material.prototype.clone = function()
{
	return new this.constructor( JSON.parse( JSON.stringify( this.serialize() )) );
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
			ResourcesManager.load(texture_or_filename,options, function(texture) {
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
* gets all the properties and its types
* @method getProperties
* @return {Object} object with name:type
*/
Material.prototype.getProperties = function()
{
	var o = {
		color:"vec3",
		opacity:"number",
		shader_name: "string",
		blend_mode: "number",
		specular_factor:"number",
		specular_gloss:"number",
		uvs_matrix:"mat3"
	};

	var textures = this.getTextureChannels();
	for(var i in textures)
		o["tex_" + textures[i]] = "Texture";
	return o;
}

/**
* gets all the properties and its types
* @method getProperty
* @return {Object} object with name:type
*/
Material.prototype.getProperty = function(name)
{
	if(name.substr(0,4) == "tex_")
		return this.textures[ name.substr(4) ];
	return this[name];
}


/**
* gets all the properties and its types
* @method getProperty
* @return {Object} object with name:type
*/
Material.prototype.setProperty = function(name, value)
{
	if(name.substr(0,4) == "tex_")
	{
		this.textures[ name.substr(4) ] = value;
		return true;
	}

	switch(name)
	{
		//numbers
		case "opacity": 
		case "specular_factor":
		case "specular_gloss":
		case "reflection": 
		case "blend_mode":
		//strings
		case "shader_name":
		//bools
			this[name] = value; 
			break;
		//vectors
		case "uvs_matrix":
		case "color": 
			if(this[name].length == value.length)
				this[name].set( value );
			break;
		case "textures":
			this.textures = cloneObject(value);
			break;
		case "transparency": //special cases
			this.opacity = 1 - value;
			break;
		default:
			return false;
	}
	return true;
}

/**
* gets all the texture channels supported by this material
* @method getTextureChannels
* @return {Array} array with the name of every channel supported by this material
*/
Material.prototype.getTextureChannels = function()
{
	if(this.constructor.texture_channels)
		return this.constructor.texture_channels;
	return [];
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
	if(texture.constructor == String && texture[0] != ":")
		ResourcesManager.load(texture);
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
* Event used to inform if one resource has changed its name
* @method onResourceRenamed
* @param {Object} resources object where all the resources are stored
* @return {Texture}
*/
Material.prototype.onResourceRenamed = function (old_name, new_name, resource)
{
	for(var i in this.textures)
		if(this.textures[i] == old_name)
			this.textures[i] = new_name;
}

/**
* Loads all the textures inside this material, by sending the through the ResourcesManager
* @method loadTextures
*/

Material.prototype.loadTextures = function ()
{
	var res = this.getResources({});
	for(var i in res)
		LS.ResourcesManager.load( i );
}

/**
* Register this material in a materials pool to be shared with other nodes
* @method registerMaterial
* @param {String} name name given to this material, it must be unique
*/
Material.prototype.registerMaterial = function(name)
{
	this.name = name;
	LS.ResourcesManager.registerResource(name, this);
	this.material = name;
}

LS.registerMaterialClass(Material);
LS.Material = Material;



//StandardMaterial class **************************
/* Warning: a material is not a component, because it can be shared by multiple nodes */

/**
* StandardMaterial class improves the material class
* @namespace LS
* @class StandardMaterial
* @constructor
* @param {String} object to configure from
*/

function StandardMaterial(o)
{
	this._uid = LS.generateUId();
	this._dirty = true;

	//this.shader_name = null; //default shader
	this.color = new Float32Array([1.0,1.0,1.0]);
	this.opacity = 1.0;
	this.shader_name = "global";

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
	this.detail = new Float32Array([0.0, 10, 10]);
	this.uvs_matrix = new Float32Array([1,0,0, 0,1,0, 0,0,1]);
	this.extra_factor = 0.0; //used for debug and dev
	this.extra_color = new Float32Array([0.0,0.0,0.0]); //used for debug and dev

	this.blend_mode = Blend.NORMAL;
	this.normalmap_factor = 1.0;
	this.displacementmap_factor = 0.1;
	this.bumpmap_factor = 1.0;
	this.use_scene_ambient = true;

	this.textures = {};
	this.extra_uniforms = {};

	if(o) 
		this.configure(o);
}

StandardMaterial.DETAIL_TEXTURE = "detail";
StandardMaterial.NORMAL_TEXTURE = "normal";
StandardMaterial.DISPLACEMENT_TEXTURE = "displacement";
StandardMaterial.BUMP_TEXTURE = "bump";
StandardMaterial.REFLECTIVITY_TEXTURE = "reflectivity";
StandardMaterial.IRRADIANCE_TEXTURE = "irradiance";
StandardMaterial.EXTRA_TEXTURE = "extra";

StandardMaterial.texture_channels = [ Material.COLOR_TEXTURE, Material.OPACITY_TEXTURE, Material.AMBIENT_TEXTURE, Material.SPECULAR_TEXTURE, Material.EMISSIVE_TEXTURE, StandardMaterial.DETAIL_TEXTURE, StandardMaterial.NORMAL_TEXTURE, StandardMaterial.DISPLACEMENT_TEXTURE, StandardMaterial.BUMP_TEXTURE, StandardMaterial.REFLECTIVITY_TEXTURE, Material.ENVIRONMENT_TEXTURE, StandardMaterial.IRRADIANCE_TEXTURE, StandardMaterial.EXTRA_TEXTURE ];
StandardMaterial.available_shaders = ["default","lowglobal","phong_texture","flat","normal","phong","flat_texture","cell_outline"];

// RENDERING METHODS
StandardMaterial.prototype.fillSurfaceShaderMacros = function(scene)
{
	var macros = {};

	//iterate through textures in the material
	for(var i in this.textures) 
	{
		var texture = this.getTexture(i);
		if(!texture) continue;
		var texture_uvs = this.textures[i + "_uvs"] || Material.DEFAULT_UVS[i] || "0";
		//special cases

		/*
		if(i == "environment")
		{
			if(this.reflection_factor <= 0) 
				continue;
		}
		else */

		if(i == "normal")
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
					macros.USE_BUMP_FACTOR = "";
			}
			continue;
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

	if(this.reflection_factor > 0.0) 
		macros.USE_REFLECTION = "";


	//extra macros
	if(this.extra_macros)
		for(var im in this.extra_macros)
			macros[im] = this.extra_macros[im];

	this._macros = macros;
}

StandardMaterial.prototype.fillSurfaceUniforms = function( scene, options )
{
	var uniforms = {};
	var samplers = {};

	uniforms.u_material_color = new Float32Array([this.color[0], this.color[1], this.color[2], this.opacity]);
	//uniforms.u_ambient_color = node.flags.ignore_lights ? [1,1,1] : [scene.ambient_color[0] * this.ambient[0], scene.ambient_color[1] * this.ambient[1], scene.ambient_color[2] * this.ambient[2]];
	if(this.use_scene_ambient)
		uniforms.u_ambient_color = vec3.fromValues(scene.ambient_color[0] * this.ambient[0], scene.ambient_color[1] * this.ambient[1], scene.ambient_color[2] * this.ambient[2]);
	else
		uniforms.u_ambient_color = this.ambient;
	uniforms.u_diffuse_color = this.diffuse;
	uniforms.u_emissive_color = this.emissive || vec3.create();
	uniforms.u_specular = [ this.specular_factor, this.specular_gloss ];
	uniforms.u_reflection_info = [ (this.reflection_additive ? -this.reflection_factor : this.reflection_factor), this.reflection_fresnel ];
	uniforms.u_backlight_factor = this.backlight_factor;
	uniforms.u_normalmap_factor = this.normalmap_factor;
	uniforms.u_displacementmap_factor = this.displacementmap_factor;
	uniforms.u_bumpmap_factor = this.bumpmap_factor;
	uniforms.u_velvet_info = new Float32Array([ this.velvet[0], this.velvet[1], this.velvet[2], (this.velvet_additive ? this.velvet_exp : -this.velvet_exp) ]);
	uniforms.u_detail_info = this.detail;

	uniforms.u_texture_matrix = this.uvs_matrix;

	//iterate through textures in the material
	for(var i in this.textures) 
	{
		var texture = this.getTexture(i);
		if(!texture) continue;

		samplers[i + (texture.texture_type == gl.TEXTURE_2D ? "_texture" : "_cubemap")] = texture;
		//this._bind_textures.push([i + (texture.texture_type == gl.TEXTURE_2D ? "_texture" : "_cubemap") ,texture]);
		//uniforms[ i + (texture.texture_type == gl.TEXTURE_2D ? "_texture" : "_cubemap") ] = texture.bind( last_slot );
		var texture_uvs = this.textures[i + "_uvs"] || Material.DEFAULT_UVS[i] || "0";
		//last_slot += 1;

		//special cases
		/*
		if(i == "environment")
			if(this.reflection_factor <= 0) continue;
		else */

		if(i == "normal")
			continue;
		else if(i == "displacement")
			continue;
		else if(i == "bump")
		{
			texture.bind(0);
			texture.setParameter( gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR );
			continue;
		}
		else if(i == "irradiance" && texture.type == gl.TEXTURE_2D)
		{
			texture.bind(0);
			texture.setParameter( gl.TEXTURE_MIN_FILTER, gl.LINEAR );
			texture.setParameter( gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE );
			texture.setParameter( gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE );
			//texture.min_filter = gl.GL_LINEAR;
		}

		if(texture.texture_type == gl.TEXTURE_2D && (texture_uvs == Material.COORDS_POLAR_REFLECTED || texture_uvs == Material.COORDS_POLAR))
		{
			texture.bind(0);
			texture.setParameter( gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE ); //to avoid going up
			texture.setParameter( gl.TEXTURE_MIN_FILTER, gl.LINEAR ); //avoid ugly error in atan2 edges
		}
	}

	//add extra uniforms
	for(var i in this.extra_uniforms)
		uniforms[i] = this.extra_uniforms[i];

	this._uniforms = uniforms;
	this._samplers = samplers;
}

/**
* assign a value to a property in a safe way
* @method setProperty
* @param {Object} object to configure from
*/
StandardMaterial.prototype.setProperty = function(name, value)
{
	//redirect to base material
	if( Material.prototype.setProperty.call(this,name,value) )
		return true;

	//regular
	switch(name)
	{
		//numbers
		case "backlight_factor":
		case "reflection_factor":
		case "reflection_fresnel":
		case "velvet_exp":
		case "velvet_additive":
		case "normalmap_tangent":
		case "normalmap_factor":
		case "displacementmap_factor":
		case "extra_factor":
		//strings
		//bools
		case "specular_ontop":
		case "normalmap_tangent":
		case "reflection_specular":
		case "use_scene_ambient":
			this[name] = value; 
			break;
		//vectors
		case "ambient":	
		case "diffuse": 
		case "emissive": 
		case "velvet":
		case "detail":
		case "extra_color":
			if(this[name].length == value.length)
				this[name].set(value);
			break;
		case "extra_uniforms":
			this.extra_uniforms = LS.cloneObject(value);
			break;
		default:
			return false;
	}
	return true;
}

/**
* gets all the properties and its types
* @method getProperties
* @return {Object} object with name:type
*/
StandardMaterial.prototype.getProperties = function()
{
	//get from the regular material
	var o = Material.prototype.getProperties.call(this);

	//add some more
	o.merge({
		backlight_factor:"number",
		reflection_factor:"number",
		reflection_fresnel:"number",
		velvet_exp:"number",

		normalmap_factor:"number",
		displacementmap_factor:"number",
		extra_factor:"number",

		ambient:"vec3",
		diffuse:"vec3",
		emissive:"vec3",
		velvet:"vec3",
		extra_color:"vec3",
		detail:"vec3",

		specular_ontop:"boolean",
		normalmap_tangent:"boolean",
		reflection_specular:"boolean",
		use_scene_ambient:"boolean",
		velvet_additive:"boolean"
	});

	return o;
}

LS.registerMaterialClass(StandardMaterial);
LS.StandardMaterial = StandardMaterial;
function CustomMaterial(o)
{
	this._uid = LS.generateUId();
	this._dirty = true;

	this.shader_name = "base";
	this.blend_mode = Blend.NORMAL;

	//this.shader_name = null; //default shader
	this.color = new Float32Array([1.0,1.0,1.0]);
	this.opacity = 1.0;
	this.vs_code = "";
	this.code = "vec4 surf() {\n\treturn u_material_color * vec4(1.0,0.0,0.0,1.0);\n}\n";

	this._uniforms = {};
	this._macros = {};

	this.textures = {};
	this.uvs_matrix = new Float32Array([1,0,0, 0,1,0, 0,0,1]);

	if(o) 
		this.configure(o);
	this.computeCode();
}

CustomMaterial.ps_shader_definitions = "\n\
";

CustomMaterial.icon = "mini-icon-material.png";

CustomMaterial.prototype.onCodeChange = function()
{
	this.computeCode();
}

CustomMaterial.prototype.computeCode = function()
{


	this._ps_uniforms_code = "";
	var lines = this.code.split("\n");
	for(var i in lines)
		lines[i] = lines[i].split("//")[0]; //remove comments
	this._ps_functions_code = lines.join("");
	this._ps_code = "vec4 result = surf(); color = result.xyz; alpha = result.a;";
}

// RENDERING METHODS
CustomMaterial.prototype.onModifyMacros = function(macros)
{
	if(macros.USE_PIXEL_SHADER_UNIFORMS)
		macros.USE_PIXEL_SHADER_UNIFORMS += this._ps_uniforms_code;
	else
		macros.USE_PIXEL_SHADER_UNIFORMS = this._ps_uniforms_code;

	if(macros.USE_PIXEL_SHADER_FUNCTIONS)
		macros.USE_PIXEL_SHADER_FUNCTIONS += this._ps_functions_code;
	else
		macros.USE_PIXEL_SHADER_FUNCTIONS = this._ps_functions_code;

	if(macros.USE_PIXEL_SHADER_CODE)
		macros.USE_PIXEL_SHADER_CODE += this._ps_code;
	else
		macros.USE_PIXEL_SHADER_CODE = this._ps_code;	
}

CustomMaterial.prototype.fillSurfaceShaderMacros = function(scene)
{
	var macros = {};
	this._macros = macros;
}


CustomMaterial.prototype.fillSurfaceUniforms = function( scene, options )
{
	var samplers = {};
	for(var i in this.textures) 
	{
		var texture = this.getTexture(i);
		if(!texture) continue;
		samplers[ i + (texture.texture_type == gl.TEXTURE_2D ? "_texture" : "_cubemap") ] = texture;
	}

	this._uniforms.u_material_color = new Float32Array([this.color[0], this.color[1], this.color[2], this.opacity]);
	this._samplers = samplers;
}

CustomMaterial.prototype.configure = function(o) { LS.cloneObject(o, this); },
CustomMaterial.prototype.serialize = function() { return LS.cloneObject(this); },


LS.extendClass( Material, CustomMaterial );
LS.registerMaterialClass(CustomMaterial);
LS.CustomMaterial = CustomMaterial;
function SurfaceMaterial(o)
{
	this._uid = LS.generateUId();
	this._dirty = true;

	this.shader_name = "surface";

	//this.shader_name = null; //default shader
	this.color = new Float32Array([1.0,1.0,1.0]);
	this.opacity = 1.0;
	this.blend_mode = Blend.NORMAL;

	this.vs_code = "";
	this.code = "void surf(in Input IN, inout SurfaceOutput o) {\n\
	o.Albedo = vec3(1.0) * IN.color.xyz;\n\
	o.Normal = IN.worldNormal;\n\
	o.Emission = vec3(0.0);\n\
	o.Specular = 1.0;\n\
	o.Gloss = 40.0;\n\
	o.Reflectivity = 0.0;\n\
	o.Alpha = IN.color.a;\n}\n";

	this._uniforms = {};
	this._macros = {};

	this.properties = []; //array of configurable properties
	this.textures = {};
	if(o) 
		this.configure(o);

	this.flags = 0;

	this.computeCode();
}

SurfaceMaterial.icon = "mini-icon-material.png";

SurfaceMaterial.prototype.onCodeChange = function()
{
	this.computeCode();
}

SurfaceMaterial.prototype.computeCode = function()
{
	var uniforms_code = "";
	for(var i in this.properties)
	{
		var code = "uniform ";
		var prop = this.properties[i];
		switch(prop.type)
		{
			case 'number': code += "float "; break;
			case 'vec2': code += "vec2 "; break;
			case 'vec3': code += "vec3 "; break;
			case 'vec4':
			case 'color':
			 	code += "vec4 "; break;
			case 'texture': code += "sampler2D "; break;
			case 'cubemap': code += "samplerCube "; break;
			default: continue;
		}
		code += prop.name + ";";
		uniforms_code += code;
	}

	var lines = this.code.split("\n");
	for(var i in lines)
		lines[i] = lines[i].split("//")[0]; //remove comments

	this.surf_code = uniforms_code + lines.join("");
}

// RENDERING METHODS
SurfaceMaterial.prototype.onModifyMacros = function(macros)
{
	if(this._ps_uniforms_code)
	{
		if(macros.USE_PIXEL_SHADER_UNIFORMS)
			macros.USE_PIXEL_SHADER_UNIFORMS += this._ps_uniforms_code;
		else
			macros.USE_PIXEL_SHADER_UNIFORMS = this._ps_uniforms_code;
	}

	if(this._ps_functions_code)
	{
		if(macros.USE_PIXEL_SHADER_FUNCTIONS)
			macros.USE_PIXEL_SHADER_FUNCTIONS += this._ps_functions_code;
		else
			macros.USE_PIXEL_SHADER_FUNCTIONS = this._ps_functions_code;
	}

	if(this._ps_code)
	{
		if(macros.USE_PIXEL_SHADER_CODE)
			macros.USE_PIXEL_SHADER_CODE += this._ps_code;
		else
			macros.USE_PIXEL_SHADER_CODE = this._ps_code;	
	}

	macros.USE_SURF = this.surf_code;
}

SurfaceMaterial.prototype.fillSurfaceShaderMacros = function(scene)
{
	var macros = {};
	this._macros = macros;
}


SurfaceMaterial.prototype.fillSurfaceUniforms = function( scene, options )
{
	var samplers = [];

	for(var i in this.properties)
	{
		var prop = this.properties[i];
		if(prop.type == "texture" || prop.type == "cubemap")
		{
			var texture = LS.getTexture( prop.value );
			if(!texture) continue;
			samplers[prop.name] = texture;
		}
		else
			this._uniforms[ prop.name ] = prop.value;
	}

	this._uniforms.u_material_color = new Float32Array([this.color[0], this.color[1], this.color[2], this.opacity]);
	this._samplers = samplers;
}

SurfaceMaterial.prototype.configure = function(o) { 
	LS.cloneObject(o, this);
	this.computeCode();
}

/**
* gets all the properties and its types
* @method getProperties
* @return {Object} object with name:type
*/
SurfaceMaterial.prototype.getProperties = function()
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
SurfaceMaterial.prototype.onResourceRenamed = function (old_name, new_name, resource)
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
SurfaceMaterial.prototype.getProperty = function(name)
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
SurfaceMaterial.prototype.setProperty = function(name, value)
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


SurfaceMaterial.prototype.getTextureChannels = function()
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
SurfaceMaterial.prototype.setTexture = function(texture, channel, uvs) {

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



LS.extendClass( Material, SurfaceMaterial );
LS.registerMaterialClass(SurfaceMaterial);
LS.SurfaceMaterial = SurfaceMaterial;
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
	if(!component._uid)
			component._uid = LS.generateUId();
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

	//remove all events
	LEvent.unbindAll(this,component);

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
* Returns if the class has an instance of this component
* @method hasComponent
* @param {bool}
*/
ComponentContainer.prototype.hasComponent = function(component_class) //class, not string with the name of the class
{
	if(!this._components) return;
	for(var i in this._components)
		if( this._components[i].constructor == component_class )
		return true;
	return false;
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
* Returns the position in the components array of this component
* @method getIndexOfComponent
* @param {Number} position in the array, -1 if not found
*/
ComponentContainer.prototype.getIndexOfComponent = function(component)
{
	if(!this._components) return -1;
	return this._components.indexOf(component);
}

/**
* Returns the component at index position
* @method getComponentByIndex
* @param {Object} component
*/
ComponentContainer.prototype.getComponentByIndex = function(index)
{
	if(!this._components) return null;
	return this._components[index];
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
	for(var i = 0; i < this._components.length; ++i )
		if( this._components[i][action_name] && typeof(this._components[i][action_name] ) == "function")
			this._components[i][action_name](params);
}


//TODO: a class to remove the tree methods from SceneTree and SceneNode
/**
* CompositePattern implements the Composite Pattern, which allows to one class to contain instances of its own class
* creating a tree-like structure.
* @class CompositePattern
* @constructor
*/
function CompositePattern()
{
	//WARNING! do not add anything here, it will never be called
}

CompositePattern.prototype.compositeCtor = function()
{
}

/**
* Adds one child to this instance
* @method addChild
* @param {*} child
* @param {number} index [optional]  in which position you want to insert it, if not specified it goes to the last position
* @param {*} options [optional] data to be passed when adding it, used for special cases when moving nodes around
**/

CompositePattern.prototype.addChild = function(node, index, options)
{
	//be careful with weird recursions...
	var aux = this;
	while( aux._parentNode )
	{
		if(aux == node)
			throw("addChild: Cannot insert a node as his own child");
		aux = aux._parentNode;
	}

	//has a parent
	if(node._parentNode)
		node._parentNode.removeChild(node, options);

	/*
	var moved = false;
	if(node._parentNode)
	{
		moved = true;
		node._onChangeParent(this, options);
		//remove from parent children
		var pos = node._parentNode._children.indexOf(node);
		if(pos != -1)
			node._parentNode._children.splice(pos,1);
	}
	*/

	//attach to this
	node._parentNode = this;
	if( !this._children )
		this._children = [node];
	else if(index == undefined)
		this._children.push(node);
	else
		this._children.splice(index,0,node);


	//Same tree
	node._in_tree = this._in_tree;

	if(this._onChildAdded)
		this._onChildAdded(node, options);

	LEvent.trigger(this,"childAdded", node);
	if(this._in_tree)
	{
		LEvent.trigger(this._in_tree, "treeItemAdded", node);
		inner_recursive(node);
	}
	

	//recursive action
	function inner_recursive(item)
	{
		if(!item._children) return;
		for(var i in item._children)
		{
			var child = item._children[i];
			if(!child._in_tree && item._in_tree)
			{
				LEvent.trigger( item._in_tree, "treeItemAdded", child );
				child._in_tree = item._in_tree;
			}
			inner_recursive( child );
		}
	}
}

/**
* Removes the node from its parent (and from the scene tree)
*
* @method removeChild
* @param {Node} node this child to remove
* @param {Object} options 
* @return {Boolean} returns true if it was found and removed
*/
CompositePattern.prototype.removeChild = function(node, options)
{
	if(!this._children || node._parentNode != this) return false;
	if( node._parentNode != this) return false; //not his son
	var pos = this._children.indexOf(node);
	if(pos == -1) return false; //not his son ¿?
	this._children.splice(pos,1);

	if(this._onChildRemoved)
		this._onChildRemoved(node, options);

	LEvent.trigger(this,"childRemoved", node);

	if(node._in_tree)
	{
		LEvent.trigger(node._in_tree, "treeItemRemoved", node);

		//propagate to childs
		inner_recursive(node);
	}
	node._in_tree = null;

	//recursive action
	function inner_recursive(item)
	{
		if(!item._children) return;
		for(var i in item._children)
		{
			var child = item._children[i];
			if(child._in_tree)
			{
				LEvent.trigger( child._in_tree, "treeItemRemoved", child );
				child._in_tree = null;
			}
			inner_recursive( child );
		}
	}

	return true;
}

/**
* Serialize the data from all the children
*
* @method serializeChildren
* @return {Array} array containing all serialized data from every children
*/
CompositePattern.prototype.serializeChildren = function()
{
	var r = [];
	if(this._children)
		for(var i in this._children)
			r.push( this._children[i].serialize() ); //serialize calls serializeChildren
	return r;
}

/**
* Configure every children with the data
*
* @method configureChildren
* @return {Array} o array containing all serialized data 
*/
CompositePattern.prototype.configureChildren = function(o)
{
	if(!o.children) return;

	for(var i in o.children)
	{
		//create instance
		var node = new this.constructor(o.children[i].id); //id is hardcoded...
		this.addChild(node);
		node.configure(o.children[i]);
	}
}

/**
* Returns parent node
*
* @method getParent
* @return {SceneNode} parent node
*/
CompositePattern.prototype.getParent = function()
{
	return this._parentNode;
}

CompositePattern.prototype.getChildren = function()
{
	return this._children || [];
}

/*
CompositePattern.prototype.childNodes = function()
{
	return this._children || [];
}
*/

//DOM style
Object.defineProperty( CompositePattern.prototype, "childNodes", {
	enumerable: true,
	get: function() {
		return this._children || [];
	},
	set: function(v) {
		//TODO
	}
});

Object.defineProperty( CompositePattern.prototype, "parentNode", {
	enumerable: true,
	get: function() {
		return this._parentNode;
	},
	set: function(v) {
		//TODO
	}
});

/**
* get all nodes below this in the hierarchy (children and children of children)
*
* @method getDescendants
* @return {Array} array containing all descendants
*/
CompositePattern.prototype.getDescendants = function()
{
	if(!this._children || this._children.length == 0)
		return [];
	var r = this._children.concat();
	for(var i = 0;  i < this._children.length; ++i)
		r = r.concat( this._children[i].getDescendants() );
	return r;
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

Transform.temp_matrix = mat4.create();
Transform.icon = "mini-icon-gizmo.png";

Transform.attributes = {
		position:"vec3",
		scale:"vec3",
		rotation:"quat"
	};

Transform.prototype.onAddedToNode = function(node)
{
	if(!node.transform)
		node.transform = this;
}

Transform.prototype.onRemovedFromNode = function(node)
{
	if(node.transform == this)
		delete node["transform"];
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
		scale: [ this._scale[0],this._scale[1],this._scale[2] ],
		matrix: toArray( this._local_matrix ) //could be useful
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
* @method getGlobalPosition
* @return {[[x,y,z]]} the position
*/
Transform.prototype.getGlobalPosition = function(p)
{
	if(this._parent)
	{
		var tmp = vec3.create();
		return mat4.multiplyVec3( p || tmp, this.getGlobalMatrix(), tmp );
	}
	if(p) return vec3.copy(p,this._position);
	return vec3.clone( this._position );
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
Transform.prototype.getGlobalRotation = function()
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
* @method getGlobalScale
* @return {[[x,y,z]]} the scale
*/
Transform.prototype.getGlobalScale = function()
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
* updates the global matrix using the parents transformation
* @method updateGlobalMatrix
* @param {bool} fast it doesnt recompute parent matrices, just uses the stored one, is faster but could create errors if the parent doesnt have its global matrix update
*/
Transform.prototype.updateGlobalMatrix = function (fast)
{
	if(this._dirty)
		this.updateMatrix();
	if (this._parent)
		mat4.multiply( this._global_matrix, fast ? this._parent._global_matrix : this._parent.getGlobalMatrix(), this._local_matrix );
	else
		this._global_matrix.set( this._local_matrix ); 
}

/**
* Returns a copy of the local matrix of this transform (it updates the matrix automatically)
* @method getLocalMatrix
* @return {mat4} the matrix in array format
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
* @return {mat4} the matrix in array format
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
* @return {mat4} the matrix in array format
*/
Transform.prototype.getGlobalMatrix = function (m, fast)
{
	if(this._dirty)
		this.updateMatrix();
	m = m || mat4.create();
	if (this._parent)
		mat4.multiply( this._global_matrix, fast ? this._parent._global_matrix : this._parent.getGlobalMatrix(), this._local_matrix );
	else
		this._global_matrix.set( this._local_matrix ); 
	m.set(this._global_matrix);
	return m;
}

/**
* Returns a quaternion with all parents rotations
* @method getGlobalRotation
* @return {quat} Quaternion
*/
Transform.prototype.getGlobalRotation = function (q)
{
	q = q || quat.create();
	q.set(this._rotation);

	//concatenate all parents rotations
	var aux = this._parent;
	while(aux)
	{
		quat.multiply(q,q,aux._rotation);
		aux = aux._parent;
	}
	return q;
}

/**
* Returns a Matrix with all parents rotations
* @method getGlobalRotationMatrix
* @return {mat4} Matrix rotation
*/
Transform.prototype.getGlobalRotationMatrix = function (m)
{
	var q = quat.clone(this._rotation);

	var aux = this._parent;
	while(aux)
	{
		quat.multiply(q, q, aux._rotation);
		aux = aux._parent;
	}

	m = m || mat4.create();
	return mat4.fromQuat(m,q);
}

/**
* Returns a copy of the global matrix of this transform (it updates the matrix automatically)
* @method getGlobalMatrix
* @return {mat4} the matrix in array format
*/
Transform.prototype.getGlobalMatrixRef = function ()
{
	return this._global_matrix;
}

/**
* Returns the world matrix of this transform without the scale
* @method getMatrixWithoutScale
* @return {mat4} the matrix in array format
*/
Transform.prototype.getMatrixWithoutScale = function ()
{
	var pos = this.getGlobalPosition();
	return mat4.fromRotationTranslation(mat4.create(), this.getGlobalRotation(), pos) 
}

/**
* Returns the world matrix of this transform without the scale
* @method getMatrixWithoutRotation
* @return {mat4} the matrix in array format
*/
Transform.prototype.getMatrixWithoutRotation = function ()
{
	var pos = this.getGlobalPosition();
	return mat4.clone([1,0,0,0, 0,1,0,0, 0,0,1,0, pos[0], pos[1], pos[2], 1]);
}


/**
* Returns the matrix for the normals in the shader
* @method getNormalMatrix
* @return {mat4} the matrix in array format
*/
Transform.prototype.getNormalMatrix = function (m)
{
	if(this._dirty)
		this.updateMatrix();

	m = m || mat4.create();
	if (this._parent)
		mat4.multiply( this._global_matrix, this._parent.getGlobalMatrix(), this._local_matrix );
	else
		m.set(this._local_matrix); //return local because it has no parent
	return mat4.transpose(m, mat4.invert(m,m));
}

/**
* Configure the transform from a local Matrix (do not tested carefully)
* @method fromMatrix
* @param {mat4} src, the matrix in array format
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
	//quat.fromMat4(this._rotation, M);
	//*
	vec3.normalize( M.subarray(0,3), M.subarray(0,3) );
	vec3.normalize( M.subarray(4,7), M.subarray(4,7) );
	vec3.normalize( M.subarray(8,11), M.subarray(8,11) );
	var M3 = mat3.fromMat4( mat3.create(), M);
	mat3.transpose(M3, M3);
	quat.fromMat3(this._rotation, M3);
	quat.normalize(this._rotation, this._rotation);
	//*/

	if(m != this._local_matrix)
		mat4.copy(this._local_matrix, m);
	this._dirty = false;
	this._on_change();
}

/**
* Configure the transform rotation from a vec3 Euler angles (heading,attitude,bank)
* @method setRotationFromEuler
* @param {mat4} src, the matrix in array format
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
* @param {number} x 
* @param {number} y
* @param {number} z 
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
* @param {number} x 
* @param {number} y
* @param {number} z 
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
* @param {number} x 
* @param {number} y
* @param {number} z 
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
* @param {number} x 
* @param {number} y
* @param {number} z 
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
* @param {number} angle_in_deg 
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
* @param {number} angle_in_deg 
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
* rotate object in world space using a quat
* @method rotateQuat
* @param {quat} quaternion
*/
Transform.prototype.rotateQuat = function(quaternion)
{
	quat.multiply(this._rotation, quaternion, this._rotation);
	this._dirty = true;
	this._on_change();
}

/**
* rotate object in world space using a quat
* @method rotateQuat
* @param {quat} quaternion
*/
Transform.prototype.rotateQuatLocal = function(quaternion)
{
	quat.multiply(this._rotation, this._rotation, quaternion);
	this._dirty = true;
	this._on_change();
}

/**
* scale the object
* @method scale
* @param {number} x 
* @param {number} y
* @param {number} z 
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
* @param {number} factor from 0 to 1 
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
* @param {vec3} position
* @param {vec3} target
* @param {vec3} up
* @param {boolean} in_world tells if the values are in world coordinates (otherwise asume its in local coordinates)
*/
Transform.prototype.lookAt = function(pos, target, up, in_world)
{
	var temp = mat4.create();
	if(in_world && this._parent)
	{
		var M = this._parent.getGlobalMatrix();
		var inv = mat4.invert(M,M);
		pos = mat4.multiplyVec3(vec3.create(), inv, pos);
		target = mat4.multiplyVec3(vec3.create(), inv,target);
		up = mat4.rotateVec3(vec3.create(), inv, up );
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
* @return {vec3}
*/
Transform.prototype.getFront = function(dest) {
	return vec3.transformQuat(dest || vec3.create(), vec3.fromValues(0,0,1), this.getGlobalRotation() );
}

/**
* returns the [0,1,0] vector in world space
* @method getTop
* @return {vec3}
*/
Transform.prototype.getTop = function(dest) {
	return vec3.transformQuat(dest || vec3.create(), vec3.fromValues(0,1,0), this.getGlobalRotation() );
}

/**
* returns the [1,0,0] vector in world space
* @method getRight
* @return {vec3}
*/
Transform.prototype.getRight = function(dest) {
	//return mat4.rotateVec3( this._matrix, vec3.create([1,0,0]) );
	return vec3.transformQuat(dest || vec3.create(), vec3.fromValues(1,0,0), this.getGlobalRotation() );
}

/**
* Applies the local transformation to a point (multiply it by the matrix)
* If no destination is specified the transform is applied to vec
* @method transformPoint
* @param {vec3} point
* @param {vec3} destination (optional)
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
* @param {vec3} point
* @param {vec3} destination (optional)
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
* @param {vec3} vector
* @param {vec3} destination (optional)
*/
Transform.prototype.transformVector = function(vec, dest) {
	return vec3.transformQuat(dest || vec3.create(), vec, this._rotation );
}

/**
* Applies the transformation to a vector (rotate but not translate)
* If no destination is specified the transform is applied to vec
* @method transformVectorGlobal
* @param {vec3} vector
* @param {vec3} destination (optional)
*/
Transform.prototype.transformVectorGlobal = function(vec, dest) {
	return vec3.transformQuat(dest || vec3.create(), vec, this.getGlobalRotation() );
}

/**
* Applies the transformation using a matrix
* @method applyTransformMatrix
* @param {mat4} matrix with the transform
* @param {bool} is_global (optional)
*/
Transform.prototype.applyTransformMatrix = function(t, is_global) {
	if(!this._parent)
	{
		if(is_global)
			mat4.multiply(this._local_matrix, t, this._local_matrix);
		else
			mat4.multiply(this._local_matrix, this._local_matrix, t);
		this.fromMatrix(this._local_matrix);
		mat4.copy(this._global_matrix, this._local_matrix); //no parent? then is the global too
		return;
	}

	var g = this.getGlobalMatrix();
	var pg = this._parent._global_matrix;
	var temp = mat4.create();
	mat4.multiply( this._global_matrix, t, g );

	mat4.invert(temp,pg);
	mat4.multiply(this._local_matrix, temp, this._global_matrix );
	this.fromMatrix(this._local_matrix);
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
	this.enabled = true;

	this._type = Camera.PERSPECTIVE;

	this._eye = vec3.fromValues(0,100, 100); //change to position
	this._center = vec3.fromValues(0,0,0);	//change to target
	this._up = vec3.fromValues(0,1,0);
	
	this._near = 1;
	this._far = 1000;

	this._ortho = new Float32Array([-1,1,-1,1]);

	this._aspect = 1.0;
	this._fov = 45; //persp
	this._frustum_size = 50; //ortho

	this._viewport = new Float32Array([0,0,1,1]);

	this._view_matrix = mat4.create();
	this._projection_matrix = mat4.create();
	this._viewprojection_matrix = mat4.create();
	this._model_matrix = mat4.create(); //inverse of viewmatrix (used for local vectors)

	this._to_texture = ""; //name
	this._texture_size = 512;

	if(o) this.configure(o);
	//this.updateMatrices(); //done by configure

	//LEvent.bind(this,"cameraEnabled", this.onCameraEnabled.bind(this));
}

Camera.icon = "mini-icon-camera.png";

Camera.PERSPECTIVE = 1;
Camera.ORTHOGRAPHIC = 2;
Camera.ORTHO2D = 3;

// used when rendering a cubemap to set the camera view direction
Camera.cubemap_camera_parameters = [
	{ dir: vec3.fromValues(1,0,0), 	up: vec3.fromValues(0,-1,0) }, //positive X
	{ dir: vec3.fromValues(-1,0,0), up: vec3.fromValues(0,-1,0) }, //negative X
	{ dir: vec3.fromValues(0,1,0), 	up: vec3.fromValues(0,0,1) }, //positive Y
	{ dir: vec3.fromValues(0,-1,0), up: vec3.fromValues(0,0,-1) }, //negative Y
	{ dir: vec3.fromValues(0,0,1), 	up: vec3.fromValues(0,-1,0) }, //positive Z
	{ dir: vec3.fromValues(0,0,-1), up: vec3.fromValues(0,-1,0) } //negative Z
];

Camera.prototype.getResources = function (res)
{
	//nothing to do, cameras dont use assets
	return res;
}


/*
Camera.prototype.onCameraEnabled = function(e,options)
{
	if(this.flip_x)
		options.reverse_backfacing = !options.reverse_backfacing;
}
*/

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
* The up vector of the camera (in node space)
* @property up {vec3}
* @default [0,1,0]
*/
Object.defineProperty( Camera.prototype, "up", {
	get: function() {
		return this._up;
	},
	set: function(v) {
		this._up.set(v);
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
* The frustum size when working in ORTHOGRAPHIC
* @property frustum_size {number}
* @default 50
*/

Object.defineProperty( Camera.prototype, "frustum_size", {
	get: function() {
		return this._frustum_size;
	},
	set: function(v) {
		if(	this._frustum_size != v)
			this._dirty_matrices = true;
		this._frustum_size  = v;
	}
});


Camera.prototype.onAddedToNode = function(node)
{
	if(!node.camera)
		node.camera = this;
	LEvent.bind(node, "collectCameras", this.onCollectCameras, this );
}

Camera.prototype.onRemovedFromNode = function(node)
{
	if(node.camera == this)
		delete node.camera;

}

Camera.prototype.onCollectCameras = function(e, cameras)
{
	if(!this.enabled)
		return;
	cameras.push(this);
}

/**
* 
* @method lookAt
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
		mat4.ortho(this._projection_matrix, -this._frustum_size*this._aspect*0.5, this._frustum_size*this._aspect*0.5, -this._frustum_size*0.5, this._frustum_size*0.5, this._near, this._far);
	else if (this.type == Camera.ORTHO2D)
		mat4.ortho(this._projection_matrix, this._ortho[0], this._ortho[1], this._ortho[2], this._ortho[3], this._near, this._far);
	else
		mat4.perspective(this._projection_matrix, this._fov * DEG2RAD, this._aspect, this._near, this._far);

	//if (this.type != Camera.ORTHO2D)
	mat4.lookAt(this._view_matrix, this._eye, this._center, this._up);

	/*
	if(this.flip_x) //used in reflections
	{
		//mat4.scale(this._projection_matrix,this._projection_matrix, [-1,1,1]);
	};
	*/
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
	if(this._root && this._root.transform)
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
	if(this._root && this._root.transform)
		mat4.multiply(temp, temp, this._root.transform.getGlobalMatrixRef() );
	return mat4.rotateVec3(dest, temp, v );
}

Camera.prototype.getEye = function()
{
	var eye = vec3.clone( this._eye );
	if(this._root && this._root.transform && this._root._parent)
		return mat4.multiplyVec3(eye, this._root.transform.getGlobalMatrixRef(), eye );
	return eye;
}

Camera.prototype.getFront = function()
{
	var front = vec3.sub( vec3.create(), this._center, this._eye ); 
	if(this._root && this._root.transform && this._root._parent)
		return mat4.rotateVec3(front, this._root.transform.getGlobalMatrixRef(), front );
	return vec3.normalize(front, front);
}


Camera.prototype.getUp = function()
{
	var up = vec3.clone( this._up );
	if(this._root && this._root.transform && this._root._parent)
		return mat4.rotateVec3( up, this._root.transform.getGlobalMatrixRef(), up );
	return up;
}

Camera.prototype.getTop = function()
{
	var front = vec3.sub( vec3.create(), this._center, this._eye ); 
	var right = vec3.cross( vec3.create(), this._up, front );
	var top = vec3.cross( vec3.create(), front, right );
	vec3.normalize(top,top);

	if(this._root && this._root.transform && this._root._parent)
		return mat4.rotateVec3( top, this._root.transform.getGlobalMatrixRef(), top );
	return top;
}


Camera.prototype.getCenter = function()
{
	var center = vec3.clone( this._center );
	if(this._root && this._root.transform && this._root._parent)
		return mat4.multiplyVec3(center, this._root.transform.getGlobalMatrixRef(), center );
	return center;
}

Camera.prototype.setEye = function(v)
{
	return vec3.copy( this._eye, v );
}

Camera.prototype.setCenter = function(v)
{
	return vec3.copy( this._center, v );
}

/*
//in global coordinates (when inside a node)
Camera.prototype.getGlobalFront = function(dest)
{
	dest = dest || vec3.create();
	vec3.subtract( dest, this._center, this._eye);
	vec3.normalize(dest, dest);
	if(this._root && this._root.transform)
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

	if(this._root && this._root.transform)
		this._root.transform.transformVector(dest, dest);
	return dest;
}
*/

Camera.prototype.setOrthographic = function( left,right, bottom,top, near, far )
{
	this._near = near;
	this._far = far;
	this._ortho.set([left,right,bottom,top]);
	this._type = Camera.ORTHO2D;
	this._dirty_matrices = true;
}

Camera.prototype.move = function(v)
{
	vec3.add(this._center, this._center, v);
	vec3.add(this._eye, this._eye, v);
	this._dirty_matrices = true;
}


Camera.prototype.rotate = function(angle_in_deg, axis, in_local_space)
{
	if(in_local_space)
		this.getLocalVector(axis, axis);

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

Camera.prototype.setOrientation = function(q, use_oculus)
{
	var center = this.getCenter();
	var eye = this.getEye();
	var up = [0,1,0];

	var to_target = vec3.sub( vec3.create(), center, eye );
	var dist = vec3.length( to_target );

	var front = null;
	front = vec3.fromValues(0,0,-dist);

	if(use_oculus)
	{
		vec3.rotateY( front, front, Math.PI * -0.5 );
		vec3.rotateY( up, up, Math.PI * -0.5 );
	}

	vec3.transformQuat(front, front, q);
	vec3.transformQuat(up, up, q);

	if(use_oculus)
	{
		vec3.rotateY( front, front, Math.PI * 0.5 );
		vec3.rotateY( up, up, Math.PI * 0.5 );
	}

	this.center = vec3.add( vec3.create(), eye, front );
	this.up = up;

	this._dirty_matrices = true;
}

Camera.prototype.setEulerAngles = function(yaw,pitch,roll)
{
	var q = quat.create();
	quat.fromEuler(q, [yaw, pitch, roll] );
	this.setOrientation(q);
}


Camera.prototype.fromViewmatrix = function(mat)
{
	var M = mat4.invert( mat4.create(), mat );
	this.eye = vec3.transformMat4(vec3.create(),vec3.create(),M);
	this.center = vec3.transformMat4(vec3.create(),[0,0,-1],M);
	this.up = mat4.rotateVec3( vec3.create(), M, [0,1,0] );
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

	if(this.type == Camera.ORTHOGRAPHIC)
		eye = vec3.unproject(vec3.create(), [x,y,0], this._view_matrix, this._projection_matrix, viewport );

	var dir = vec3.subtract( vec3.create(), pos, eye );
	vec3.normalize(dir, dir);
	return { start: eye, direction: dir };
}

Camera.prototype.configure = function(o)
{
	if(o.enabled != null) this.enabled = o.enabled;
	if(o.type != null) this._type = o.type;

	if(o.eye != null) this._eye.set(o.eye);
	if(o.center != null) this._center.set(o.center);
	if(o.up != null) this._up.set(o.up);

	if(o.near != null) this._near = o.near;
	if(o.far != null) this._far = o.far;
	if(o.fov != null) this._fov = o.fov;
	if(o.aspect != null) this._aspect = o.aspect;
	if(o.frustum_size != null) this._frustum_size = o.frustum_size;
	if(o.viewport != null) this._viewport.set( o.viewport );

	this.updateMatrices();
}

Camera.prototype.serialize = function()
{
	var o = {
		enabled: this.enabled,
		type: this._type,
		eye: vec3.toArray(this._eye),
		center: vec3.toArray(this._center),
		up: vec3.toArray(this._up),
		near: this._near,
		far: this._far,
		fov: this._fov,
		aspect: this._aspect,
		frustum_size: this._frustum_size,
		viewport: toArray( this._viewport ),
		to_texture: this._to_texture,
		texture_size: this._texture_size
	};

	//clone
	return o;
}

LS.registerComponent(Camera);
LS.Camera = Camera;
//***** LIGHT ***************************

/**
* Light that contains the info about the camera
* @class Light
* @constructor
* @param {Object} object to configure from
*/

function Light(o)
{
	/**
	* Position of the light in world space
	* @property position
	* @type {[[x,y,z]]}
	* @default [0,0,0]
	*/
	this.position = vec3.create();
	/**
	* Position where the light is pointing at (in world space)
	* @property target
	* @type {[[x,y,z]]}
	* @default [0,0,1]
	*/
	this.target = vec3.fromValues(0,0,1);
	/**
	* Up vector (in world coordinates)
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
	this.att_start = 0;
	this.att_end = 1000;
	this.offset = 0;
	this.spot_cone = true;

	//use target (when attached to node)
	this.use_target = false;

	/**
	* The color of the light
	* @property color
	* @type {[[r,g,b]]}
	* @default [1,1,1]
	*/
	this.color = vec3.fromValues(1,1,1);
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
	this.shadowmap_resolution = 1024;
	this.type = Light.OMNI;
	this.frustum_size = 50; //ortho

	//vectors in world space
	this._front = vec3.clone( Light.FRONT_VECTOR );
	this._right = vec3.clone( Light.RIGHT_VECTOR );
	this._top = vec3.clone( Light.UP_VECTOR );

	//for caching purposes
	this._macros = {};
	this._uniforms = {};

	if(o) 
	{
		this.configure(o);
		if(o.shadowmap_resolution)
			this.shadowmap_resolution = parseInt(o.shadowmap_resolution); //LEGACY: REMOVE
	}
}

//do not change
Light.FRONT_VECTOR = new Float32Array([0,0,-1]); //const
Light.RIGHT_VECTOR = new Float32Array([1,0,0]); //const
Light.UP_VECTOR = new Float32Array([0,1,0]); //const

Light.OMNI = 1;
Light.SPOT = 2;
Light.DIRECTIONAL = 3;

Light.DEFAULT_SHADOWMAP_RESOLUTION = 1024;
Light.DEFAULT_DIRECTIONAL_FRUSTUM_SIZE = 50;

Light.prototype.onAddedToNode = function(node)
{
	if(!node.light) node.light = this;

	LEvent.bind(node, "collectLights", this.onCollectLights, this );
}

Light.prototype.onRemovedFromNode = function(node)
{
	if(node.light == this) delete node.light;
}

Light.prototype.onCollectLights = function(e, lights)
{
	if(!this.enabled)
		return;

	//add to lights vector
	lights.push(this);
}

Light._temp_matrix = mat4.create();
Light._temp2_matrix = mat4.create();
Light._temp3_matrix = mat4.create();
Light._temp_position = vec3.create();
Light._temp_target = vec3.create();
Light._temp_up = vec3.create();
Light._temp_front = vec3.create();

Light.prototype.updateLightCamera = function()
{
	if(!this._light_camera)
		this._light_camera = new Camera();

	var camera = this._light_camera;
	camera.eye = this.getPosition(Light._temp_position);
	camera.center = this.getTarget(Light._temp_target);

	var up = this.getUp(Light._temp_up);
	var front = this.getFront(Light._temp_front);
	if( Math.abs( vec3.dot(front,up) ) > 0.999 ) 
		vec3.set(up,0,0,1);
	camera.up = up;

	camera.type = this.type == Light.DIRECTIONAL ? Camera.ORTHOGRAPHIC : Camera.PERSPECTIVE;

	camera._frustum_size = this.frustum_size || Light.DEFAULT_DIRECTIONAL_FRUSTUM_SIZE;
	camera.near = this.near;
	camera.far = this.far;
	camera.fov = (this.angle_end || 45); //fov is in degrees

	camera.updateMatrices();
	this._light_matrix = camera._viewprojection_matrix;

	/* ALIGN TEXEL OF SHADOWMAP IN DIRECTIONAL
	if(this.type == Light.DIRECTIONAL && this.cast_shadows && this.enabled)
	{
		var shadowmap_resolution = this.shadowmap_resolution || Light.DEFAULT_SHADOWMAP_RESOLUTION;
		var texelSize = frustum_size / shadowmap_resolution;
		view_matrix[12] = Math.floor( view_matrix[12] / texelSize) * texelSize;
		view_matrix[13] = Math.floor( view_matrix[13] / texelSize) * texelSize;
	}
	*/	

	return camera;
}

Light.prototype.getLightCamera = function()
{
	if(!this._light_camera)
		this.updateLightCamera();
	return this._light_camera;
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
	LS.cloneObject(o,this);
}

Light.prototype.updateVectors = function()
{
	if(!this._root || !this._root.transform) 
	{
		//position, target and up are already valid
		 //front
		 //vec3.subtract(this._front, this.position, this.target ); //positive z front
		 vec3.subtract(this._front, this.target, this.position ); //positive z front
		 vec3.normalize(this._front,this._front);
		 //right
		 vec3.normalize( temp_v3, this.up );
		 vec3.cross( this._right, this._front, temp_v3 );
		 //top
		 vec3.cross( this._top, this._right, this._front );
		 return;
	}

	var mat = this._root.transform.getGlobalMatrixRef();
	//position
	mat4.getTranslation( this.position, mat);
	//target
	if (!this.use_target)
		mat4.multiplyVec3( this.target, mat, Light.FRONT_VECTOR ); //right in front of the object
	//up
	mat4.multiplyVec3( this.up, mat, Light.UP_VECTOR ); //right in front of the object

	//vectors
	mat4.rotateVec3( this._front, mat, Light.FRONT_VECTOR ); 
	mat4.rotateVec3( this._right, mat, Light.RIGHT_VECTOR ); 
	vec3.copy( this._top, this.up ); 
}

Light.prototype.getPosition = function(p)
{
	//if(this._root && this._root.transform) return this._root.transform.transformPointGlobal(this.position, p || vec3.create() );
	if(this._root && this._root.transform) return this._root.transform.getGlobalPosition();
	return vec3.clone(this.position);
}

Light.prototype.getTarget = function(p)
{
	//if(this._root && this._root.transform && !this.use_target) 
	//	return this._root.transform.transformPointGlobal(this.target, p || vec3.create() );
	if(this._root && this._root.transform && !this.use_target) 
		return this._root.transform.transformPointGlobal( Light.FRONT_VECTOR , p || vec3.create() );
	return vec3.clone(this.target);
}

Light.prototype.getUp = function(p)
{
	if(this._root && this._root.transform) return this._root.transform.transformVector( Light.UP_VECTOR , p || vec3.create() );
	return vec3.clone(this.up);
}

Light.prototype.getFront = function(p) {
	var front = p || vec3.create();
	vec3.subtract(front, this.getPosition(), this.getTarget() ); //front is reversed?
	//vec3.subtract(front, this.getTarget(), this.getPosition() ); //front is reversed?
	vec3.normalize(front, front);
	return front;
}

Light.prototype.getLightRotationMatrix = function()
{

}

Light.prototype.getResources = function (res)
{
	if(this.projective_texture)
		res[ this.projective_texture ] = Texture;
	return res;
}

Light.prototype.onResourceRenamed = function (old_name, new_name, resource)
{
	if(this.projective_texture == old_name)
		this.projective_texture = new_name;
}


Light.prototype.prepare = function( render_options )
{
	var uniforms = this._uniforms;
	var macros = this._macros;
	wipeObject(macros); //delete all properties (I dont like to generate garbage)

	//projective texture needs the light matrix to compute projection
	if(this.projective_texture || this.cast_shadows || this.average_texture)
		this.updateLightCamera();

	this.updateVectors();

	//PREPARE MACROS
	if(this.type == Light.DIRECTIONAL)
		macros.USE_DIRECTIONAL_LIGHT = "";
	else if(this.type == Light.SPOT)
		macros.USE_SPOT_LIGHT = "";
	if(this.spot_cone)
		macros.USE_SPOT_CONE = "";
	if(this.linear_attenuation)
		macros.USE_LINEAR_ATTENUATION = "";
	if(this.range_attenuation)
		macros.USE_RANGE_ATTENUATION = "";
	if(this.offset > 0.001)
		macros.USE_LIGHT_OFFSET = "";

	if(this.projective_texture)
	{
		var light_projective_texture = this.projective_texture.constructor === String ? ResourcesManager.textures[this.projective_texture] : this.projective_texture;
		if(light_projective_texture)
		{
			macros.USE_PROJECTIVE_LIGHT = "";
			if(light_projective_texture.texture_type == gl.TEXTURE_CUBE_MAP)
				macros.USE_PROJECTIVE_LIGHT_CUBEMAP = "";
		}
	}

	if(this.average_texture)
	{
		var light_average_texture = this.average_texture.constructor === String ? ResourcesManager.textures[ this.average_texture ] : this.average_texture;
		if(light_average_texture)
			macros.USE_TEXTURE_AVERAGE_LIGHT = "";
	}

	//if(vec3.squaredLength( light.color ) < 0.001 || node.flags.ignore_lights)
	//	macros.USE_IGNORE_LIGHT = "";

	//PREPARE UNIFORMS
	if(this.type == Light.DIRECTIONAL || this.type == Light.SPOT)
		uniforms.u_light_front = this._front;
	if(this.type == Light.SPOT)
		uniforms.u_light_angle = [ this.angle * DEG2RAD, this.angle_end * DEG2RAD, Math.cos( this.angle * DEG2RAD * 0.5 ), Math.cos( this.angle_end * DEG2RAD * 0.5 ) ];

	uniforms.u_light_pos = this.position;
	uniforms.u_light_color = vec3.scale( uniforms.u_light_color || vec3.create(), this.color, this.intensity );
	uniforms.u_light_att = [this.att_start,this.att_end];
	uniforms.u_light_offset = this.offset;

	//generate shadowmaps
	if( render_options.update_shadowmaps && !render_options.shadows_disabled && !render_options.lights_disabled && !render_options.low_quality )
		this.generateShadowmap( render_options );
	if(this._shadowmap && !this.cast_shadows)
		this._shadowmap = null; //remove shadowmap

	this._uniforms = uniforms;
}

// gets the macros of the light (some macros have to be computed now because they depend not only on the light, also on the node or material)
Light.prototype.getMacros = function(instance, render_options)
{
	var macros = this._macros;

	var use_shadows = this.cast_shadows && this._shadowmap && this._light_matrix != null && !render_options.shadows_disabled;

	if(this.use_diffuse && !instance.material.constant_diffuse)
		macros.USE_DIFFUSE_LIGHT = "";
	else
		delete macros["USE_DIFFUSE_LIGHT"];

	if(this.use_specular && instance.material.specular_factor > 0)
		macros.USE_SPECULAR_LIGHT = "";	
	else
		delete macros["USE_SPECULAR_LIGHT"];

	if(use_shadows && instance.flags & RI_RECEIVE_SHADOWS)
	{
		macros.USE_SHADOW_MAP = "";
		if(this._shadowmap && this._shadowmap.texture_type == gl.TEXTURE_CUBE_MAP)
			macros.USE_SHADOW_CUBEMAP = "";
		if(this.hard_shadows || macros.USE_SHADOW_CUBEMAP != null)
			macros.USE_HARD_SHADOWS = "";
		macros.SHADOWMAP_OFFSET = "";
	}
	else
		delete macros["USE_SHADOW_MAP"];

	return macros;
}

Light.prototype.getUniforms = function( instance, render_options )
{
	var uniforms = this._uniforms;
	var use_shadows = this.cast_shadows && 
					instance.flags & RI_RECEIVE_SHADOWS && 
					this._shadowmap && this._light_matrix != null && 
					!render_options.shadows_disabled;

	//compute the light mvp
	if(this._light_matrix)
		uniforms.u_lightMatrix = mat4.multiply( uniforms.u_lightMatrix || mat4.create(), this._light_matrix, instance.matrix );

	//projective texture
	if(this.projective_texture)
	{
		var light_projective_texture = this.projective_texture.constructor === String ? ResourcesManager.textures[this.projective_texture] : this.projective_texture;
		if(light_projective_texture)
		{
			uniforms.light_texture = light_projective_texture.bind(11); //fixed slot
			//if(light_projective_texture.texture_type == gl.TEXTURE_CUBE_MAP)
			//	uniforms.light_rotation_matrix = 
		}
	}
	else
		delete uniforms["light_texture"];

	//average texture
	if(this.average_texture)
	{
		var light_average_texture = this.average_texture.constructor === String ? ResourcesManager.textures[ this.average_texture ] : this.average_texture;
		if(light_average_texture)
			uniforms.light_average_texture = light_average_texture.bind(12); //fixed slot
	}
	else
		delete uniforms["light_average_texture"];

	//use shadows?
	if(use_shadows)
	{
		uniforms.u_shadow_params = [ 1.0 / this._shadowmap.width, this.shadow_bias, this.near, this.far ];
		uniforms.shadowmap = this._shadowmap.bind(10); //fixed slot
	}
	else
	{
		delete uniforms["u_shadow_params"];
		delete uniforms["shadowmap"];
	}

	return uniforms;
}

Light.prototype.generateShadowmap = function (render_options)
{
	if(!this.cast_shadows)
		return;

	var renderer = render_options.current_renderer;

	//create the texture
	var shadowmap_resolution = this.shadowmap_resolution;
	if(!shadowmap_resolution)
		shadowmap_resolution = Light.DEFAULT_SHADOWMAP_RESOLUTION;

	var tex_type = this.type == Light.OMNI ? gl.TEXTURE_CUBE_MAP : gl.TEXTURE_2D;
	if(this._shadowmap == null || this._shadowmap.width != shadowmap_resolution || this._shadowmap.texture_type != tex_type)
	{
		this._shadowmap = new GL.Texture( shadowmap_resolution, shadowmap_resolution, { texture_type: tex_type, format: gl.RGBA, magFilter: gl.NEAREST, minFilter: gl.NEAREST });
		ResourcesManager.textures[":shadowmap_" + this._uid ] = this._shadowmap; //debug
	}

	//render the scene inside the texture
	if(this.type == Light.OMNI) //render to cubemap
	{
		render_options.current_pass = "shadow";
		render_options.is_shadowmap = true;
		this._shadowmap.unbind(); 
		renderer.renderToCubemap( this.getPosition(), shadowmap_resolution, this._shadowmap, render_options, this.near, this.far );
		render_options.is_shadowmap = false;
	}
	else //DIRECTIONAL and SPOTLIGHT
	{
		var shadow_camera = this.getLightCamera();
		renderer.enableCamera( shadow_camera, render_options, true );

		// Render the object viewed from the light using a shader that returns the
		// fragment depth.
		this._shadowmap.unbind(); 
		renderer._current_target = this._shadowmap;
		this._shadowmap.drawTo(function() {

			gl.clearColor(0, 0, 0, 1);
			//gl.clearColor(1, 1, 1, 1);
			gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

			render_options.current_pass = "shadow";
			render_options.is_shadowmap = true;

			//RENDER INSTANCES in the shadowmap
			renderer.renderInstances( render_options );
			render_options.is_shadowmap = false;
		});
		renderer._current_target = null;
	}
}



LS.registerComponent(Light);
LS.Light = Light;

/**
* LightFX create volumetric and flare effects to the light
* @class LightFX
* @constructor
* @param {Object} object to configure from
*/

function LightFX(o)
{
	this.enabled = true;

	this.volume_visibility = 0;
	this.volume_radius = 1;
	this.volume_density = 1;

	this.glare_visibility = 1;
	this.glare_size = vec2.fromValues(0.2,0.2);
	this.glare_texture = null;

	//for caching purposes
	this._macros = {};
	this._uniforms = {};

	if(o) 
		this.configure(o);
}

LightFX["@glare_texture"] = { type:"texture" };
LightFX["@glare_size"] = { type:"vec2", step: 0.001 };
LightFX["@glare_visibility"] = { type:"number", step: 0.001 };

LightFX.icon = "mini-icon-lightfx.png";

LightFX.prototype.onAddedToNode = function(node)
{
	LEvent.bind(node, "collectRenderInstances", this.onCollectInstances, this);
}

LightFX.prototype.onRemovedFromNode = function(node)
{
	LEvent.unbind(node, "collectRenderInstances", this.onCollectInstances, this);
}

LightFX.prototype.onCollectInstances = function(e,instances)
{
	if(!this.enabled) return;

	var light = this._root.light;
	if(light && !light.enabled)
		return;

	if(this.volume_visibility && light)
		instances.push( this.getVolumetricRenderInstance(light) );

	if(this.glare_visibility)
	{
		var ri = this.getGlareRenderInstance(light);
		if(ri)
			instances.push( ri );
	}
}

//not finished
LightFX.prototype.getVolumetricRenderInstance = function()
{
	//sphere
	if(!this._volumetric_mesh)
	{
		this._volumetric_mesh = GL.Mesh.sphere();
	}

	var RI = this._volumetric_render_instance;
	if(!RI)
		this._volumetric_render_instance = RI = new RenderInstance(this._root, this);

	RI.flags = RenderInstance.ALPHA; //reset and set
	
	//material
	var mat = this._volumetric_material;
	if(!mat)
		mat = this._volumetric_material = new Material({shader_name:"volumetric_light", blending: Material.ADDITIVE_BLENDING });
	vec3.copy( mat.color, light.color );
	mat.opacity = this.volume_visibility;
	RI.material = mat;

	//do not need to update
	RI.matrix.set( this._root.transform._global_matrix );
	//mat4.identity( RI.matrix );
	//mat4.setTranslation( RI.matrix, this.getPosition() ); 

	mat4.multiplyVec3( RI.center, RI.matrix, light.position );
	mat4.scale( RI.matrix, RI.matrix, [this.volume_radius,this.volume_radius,this.volume_radius]);

	var volume_info = vec4.create();
	volume_info.set(RI.center);
	volume_info[3] = this.volume_radius * 0.5;
	RI.uniforms["u_volume_info"] = volume_info;
	RI.uniforms["u_volume_density"] = this.volume_density;
	
	RI.setMesh( this._mesh, gl.TRIANGLES );
	RI.flags = RI_CULL_FACE | RI_BLEND | RI_DEPTH_TEST;

	return RI;
}

LightFX.prototype.getGlareRenderInstance = function(light)
{
	if(!this.glare_texture)
		return null;

	var RI = this._glare_render_instance;
	if(!RI)
	{
		this._glare_render_instance = RI = new RenderInstance(this._root, this);
		RI.setMesh( GL.Mesh.plane({size:1}), gl.TRIANGLES );
		RI.priority = 1;
		RI.onPreRender = LightFX.onGlarePreRender;
	}
	
	RI.flags = RI_2D_FLAGS;
	if(light)
		vec3.copy( RI.center, light.getPosition() );
	else
		vec3.copy( RI.center, this._root.transform.getGlobalPosition() );
	RI.pos2D = vec3.create();
	RI.scale_2D = this.glare_size;

	//debug
	//RI.matrix.set( this._root.transform._global_matrix );

	var mat = this._glare_material;
	if(!mat)
		mat = this._glare_material = new Material({ blending: Material.ADDITIVE_BLENDING });
	if(light)
	{
		vec3.scale( mat.color, light.color, this.glare_visibility * light.intensity );
		mat.textures.color = this.glare_texture;
	}
	RI.setMaterial( mat );
	RI.flags |= RI_BLEND;
	
	return RI;
}

LightFX.onGlarePreRender = function(render_options)
{
	if(render_options.current_pass != "color")
		return; 

	//project point to 2D
	mat4.projectVec3( this.pos2D, Renderer._viewprojection_matrix, this.center );
	this.pos2D[2] = 0; //reset Z
	//this.material.opacity = 1 / (2*vec3.distance(this.pos2D, [0,0,0])); //attenuate by distance

	var center = this.center;
	var eye = Renderer._current_camera.getEye();
	var scene = Renderer._current_scene;
	var dir = vec3.sub(vec3.create(), eye, center );
	var dist = vec3.length(dir);
	vec3.scale(dir,dir,1/dist);
	var coll = Renderer.raycast( scene, center, dir, dist );

	if(coll.length)
	{
		this.material.opacity -= 0.05;
		if(this.material.opacity < 0.0)
			this.material.opacity = 0.0;
	}
	else
	{
		this.material.opacity += 0.05;
		if(this.material.opacity > 1.0)
			this.material.opacity = 1;
	}
}

LightFX.prototype.getResources = function (res)
{
	if(this.glare_texture)
		res[ this.glare_texture ] = Texture;
	return res;
}

LightFX.prototype.onResourceRenamed = function (old_name, new_name, resource)
{
	if(this.glare_texture == old_name)
		this.glare_texture = new_name;
}

LS.registerComponent(LightFX);
LS.LightFX = LightFX;


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

MeshRenderer.icon = "mini-icon-teapot.png";

//vars
MeshRenderer["@mesh"] = { widget: "mesh" };
MeshRenderer["@lod_mesh"] = { widget: "mesh" };
MeshRenderer["@primitive"] = {widget:"combo", values: {"Default":null, "Points": 0, "Lines":1, "Triangles":4 }};
MeshRenderer["@submesh_id"] = {widget:"combo", values: function() {
	var component = this.instance;
	var mesh = component.getMesh();
	if(!mesh) return null;
	if(!mesh || !mesh.info || !mesh.info.groups || mesh.info.groups.length < 2)
		return null;

	var t = {"all":null};
	for(var i = 0; i < mesh.info.groups.length; ++i)
		t[mesh.info.groups[i].name] = i;
	return t;
}};

MeshRenderer.prototype.onAddedToNode = function(node)
{
	if(!node.meshrenderer)
		node.meshrenderer = this;
	LEvent.bind(node, "collectRenderInstances", this.onCollectInstances, this);
}

MeshRenderer.prototype.onRemovedFromNode = function(node)
{
	if(node.meshrenderer)
		delete node["meshrenderer"];
	LEvent.unbind(node, "collectRenderInstances", this.onCollectInstances, this);
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
	this.two_sided = !!o.two_sided;
	if(o.material)
		this.material = typeof(o.material) == "string" ? o.material : new Material(o.material);

	if(o.morph_targets)
		this.morph_targets = o.morph_targets;
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
		o.two_sided = this.two_sided;
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

MeshRenderer.prototype.onResourceRenamed = function (old_name, new_name, resource)
{
	if(this.mesh == old_name)
		this.mesh = new_name;
	if(this.lod_mesh == old_name)
		this.lod_mesh = new_name;
}

//MeshRenderer.prototype.getRenderInstance = function(options)
MeshRenderer.prototype.onCollectInstances = function(e, instances)
{
	var mesh = this.getMesh();
	if(!mesh) return null;

	var node = this._root;
	if(!this._root) return;

	var RI = this._RI;
	if(!RI)
		this._RI = RI = new RenderInstance(this._root, this);

	//matrix: do not need to update, already done
	RI.matrix.set( this._root.transform._global_matrix );
	//this._root.transform.getGlobalMatrix(RI.matrix);
	mat4.multiplyVec3( RI.center, RI.matrix, vec3.create() );

	//flags
	RI.flags = RI_DEFAULT_FLAGS | RI_RAYCAST_ENABLED;
	RI.applyNodeFlags();

	if(this.two_sided)
		RI.flags &= ~RI_CULL_FACE;

	//material (after flags because it modifies the flags)
	RI.setMaterial( this.material || this._root.getMaterial() );

	//buffers from mesh and bounding
	RI.setMesh( mesh, this.primitive );
	if(this.submesh_id != -1 && this.submesh_id != null)
		RI.submesh_id = this.submesh_id;

	//used for raycasting
	if(this.lod_mesh)
	{
		if(typeof(this.lod_mesh) === "string")
			RI.collision_mesh = ResourcesManager.resources[ this.lod_mesh ];
		else
			RI.collision_mesh = this.lod_mesh;
	}
	else
		RI.collision_mesh = mesh;

	instances.push(RI);
}

LS.registerComponent(MeshRenderer);
LS.MeshRenderer = MeshRenderer;

function SkinnedMeshRenderer(o)
{
	this.enabled = true;
	this.cpu_skinning = false;
	this.mesh = null;
	this.lod_mesh = null;
	this.submesh_id = -1;
	this.material = null;
	this.primitive = null;
	this.two_sided = false;
	this.ignore_transform = true;
	//this.factor = 1;

	//check how many floats can we put in a uniform
	if(!SkinnedMeshRenderer.num_supported_uniforms)
	{
		SkinnedMeshRenderer.num_supported_uniforms = gl.getParameter( gl.MAX_VERTEX_UNIFORM_VECTORS );
		SkinnedMeshRenderer.num_supported_textures = gl.getParameter( gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS );
		//check if GPU skinning is supported
		if( SkinnedMeshRenderer.num_supported_uniforms < SkinnedMeshRenderer.MAX_BONES*3 && SkinnedMeshRenderer.num_supported_textures == 0)
			SkinnedMeshRenderer.gpu_skinning_supported = false;
	}

	if(o)
		this.configure(o);

	if(!MeshRenderer._identity) //used to avoir garbage
		MeshRenderer._identity = mat4.create();
}

SkinnedMeshRenderer.MAX_BONES = 64;
SkinnedMeshRenderer.gpu_skinning_supported = true;
SkinnedMeshRenderer.icon = "mini-icon-teapot.png";

//vars
SkinnedMeshRenderer["@mesh"] = { widget: "mesh" };
SkinnedMeshRenderer["@lod_mesh"] = { widget: "mesh" };
SkinnedMeshRenderer["@primitive"] = {widget:"combo", values: {"Default":null, "Points": 0, "Lines":1, "Triangles":4 }};
SkinnedMeshRenderer["@submesh_id"] = {widget:"combo", values: function() {
	var component = this.instance;
	var mesh = component.getMesh();
	if(!mesh) return null;
	if(!mesh || !mesh.info || !mesh.info.groups || mesh.info.groups.length < 2)
		return null;

	var t = {"all":null};
	for(var i = 0; i < mesh.info.groups.length; ++i)
		t[mesh.info.groups[i].name] = i;
	return t;
}};

SkinnedMeshRenderer.prototype.onAddedToNode = function(node)
{
	if(!node.meshrenderer)
		node.meshrenderer = this;
	LEvent.bind(node, "collectRenderInstances", this.onCollectInstances, this);
}

SkinnedMeshRenderer.prototype.onRemovedFromNode = function(node)
{
	if(node.meshrenderer)
		delete node["meshrenderer"];
	LEvent.unbind(node, "collectRenderInstances", this.onCollectInstances, this);
}

/**
* Configure from a serialized object
* @method configure
* @param {Object} object with the serialized info
*/
SkinnedMeshRenderer.prototype.configure = function(o)
{
	if(o.enabled != null)
		this.enabled = !!(o.enabled);
	this.cpu_skinning = !!(o.cpu_skinning);
	this.ignore_transform = !!(o.ignore_transform);

	this.mesh = o.mesh;
	this.lod_mesh = o.lod_mesh;
	this.submesh_id = o.submesh_id;
	this.primitive = o.primitive; //gl.TRIANGLES
	this.two_sided = !!o.two_sided;
	if(o.material)
		this.material = typeof(o.material) == "string" ? o.material : new Material(o.material);
}

/**
* Serialize the object 
* @method serialize
* @return {Object} object with the serialized info
*/
SkinnedMeshRenderer.prototype.serialize = function()
{
	var o = { 
		enabled: this.enabled,
		cpu_skinning: this.cpu_skinning,
		ignore_transform: this.ignore_transform,
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
		o.two_sided = this.two_sided;
	return o;
}

SkinnedMeshRenderer.prototype.getMesh = function() {
	if(typeof(this.mesh) === "string")
		return ResourcesManager.meshes[this.mesh];
	return this.mesh;
}

SkinnedMeshRenderer.prototype.getLODMesh = function() {
	if(typeof(this.lod_mesh) === "string")
		return ResourcesManager.meshes[this.lod_mesh];
	return this.low_mesh;
}

SkinnedMeshRenderer.prototype.getResources = function(res)
{
	if(typeof(this.mesh) == "string")
		res[this.mesh] = Mesh;
	if(typeof(this.lod_mesh) == "string")
		res[this.lod_mesh] = Mesh;
	return res;
}

SkinnedMeshRenderer.prototype.onResourceRenamed = function (old_name, new_name, resource)
{
	if(this.mesh == old_name)
		this.mesh = new_name;
	if(this.lod_mesh == old_name)
		this.lod_mesh = new_name;
}

SkinnedMeshRenderer.prototype.getNodeMatrix = function(name)
{
	var node = Scene.getNode(name);
	if(!node)
		return null;
	node._is_bone = true;
	return node.transform.getGlobalMatrixRef();
}

SkinnedMeshRenderer.prototype.getBoneMatrices = function(ref_mesh)
{
	//bone matrices
	var bones = this._last_bones;

	//reuse bone matrices
	if(!this._last_bones || this._last_bones.length != ref_mesh.bones.length )
	{
		bones = this._last_bones = [];
		for(var i = 0; i < ref_mesh.bones.length; ++i)
			bones[i] = mat4.create();
	}

	for(var i = 0; i < ref_mesh.bones.length; ++i)
	{
		var m = bones[i]; //mat4.create();
		var mat = this.getNodeMatrix( ref_mesh.bones[i][0] ); //get the current matrix from the bone Node transform
		if(!mat)
			mat4.identity( m );
		else
		{
			var inv = ref_mesh.bones[i][1];
			mat4.multiply( m, mat, inv );
			if(ref_mesh.bind_matrix)
				mat4.multiply( m, m, ref_mesh.bind_matrix);
		}

		//bones[i].push( m ); //multiply by the inv bindpose matrix
	}

	return bones;
}

//MeshRenderer.prototype.getRenderInstance = function(options)
SkinnedMeshRenderer.prototype.onCollectInstances = function(e, instances, options)
{
	var mesh = this.getMesh();
	if(!mesh) return null;

	var node = this._root;
	if(!this._root) return;

	var RI = this._render_instance;
	if(!RI)
		this._render_instance = RI = new RenderInstance(this._root, this);

	//this mesh doesnt have skinning info
	if(!mesh.getBuffer("vertices") || !mesh.getBuffer("bone_indices"))
		return;

	if(!this.enabled)
	{
		RI.setMesh(mesh, this.primitive);
		//remove the flags to avoid recomputing shaders
		delete RI.macros["USE_SKINNING"]; 
		delete RI.macros["USE_SKINNING_TEXTURE"];
		delete RI.samplers["u_bones"];
	}
	else if( SkinnedMeshRenderer.gpu_skinning_supported && !this.cpu_skinning ) 
	{
		RI.setMesh(mesh, this.primitive);

		//add skinning
		RI.macros["USE_SKINNING"] = "";
		
		//retrieve all the bones
		var bones = this.getBoneMatrices(mesh);
		var bones_size = bones.length * 12;

		var u_bones = this._u_bones;
		if(!u_bones || u_bones.length != bones_size)
			this._u_bones = u_bones = new Float32Array( bones_size );

		//pack the bones in one single array (also skip the last row, is always 0,0,0,1)
		for(var i = 0; i < bones.length; i++)
		{
			mat4.transpose( bones[i], bones[i] );
			u_bones.set( bones[i].subarray(0,12), i * 12, (i+1) * 12 );
		}

		//can we pass the bones as a uniform?
		if( SkinnedMeshRenderer.num_supported_uniforms >= bones_size )
		{
			//upload the bones as uniform (faster but doesnt work in all GPUs)
			RI.uniforms["u_bones"] = u_bones;
			delete RI.samplers["u_bones"]; //use uniforms, not samplers
		}
		else if( SkinnedMeshRenderer.num_supported_textures > 0 ) //upload the bones as a float texture (slower)
		{
			var texture = this._bones_texture;
			if(!texture)
			{
				texture = this._bones_texture = new GL.Texture( 1, SkinnedMeshRenderer.MAX_BONES * 3, { format: gl.RGBA, type: gl.FLOAT, filter: gl.NEAREST} );
				texture._data = new Float32Array( texture.width * texture.height * 4 );
			}

			texture._data.set( u_bones );
			texture.uploadData( texture._data, { no_flip: true } );
			RI.macros["USE_SKINNING_TEXTURE"] = "";
			RI.samplers["u_bones"] = texture;
			delete RI.uniforms["u_bones"]; //use samplers, not uniforms
		}
		else
			console.error("impossible to get here")

	}
	else //cpu skinning (mega slow)
	{
		if(!this._skinned_mesh || this._skinned_mesh._reference != mesh)
		{
			this._skinned_mesh = new GL.Mesh();
			this._skinned_mesh._reference = mesh;
			var vertex_buffer = mesh.getBuffer("vertices");
			var normal_buffer = mesh.getBuffer("normals");

			//clone 
			for (var i in mesh.vertexBuffers)
				this._skinned_mesh.vertexBuffers[i] = mesh.vertexBuffers[i];
			for (var i in mesh.indexBuffers)
				this._skinned_mesh.indexBuffers[i] = mesh.indexBuffers[i];

			//new ones clonning old ones
			this._skinned_mesh.addVertexBuffer("vertices","a_vertex", 3, new Float32Array( vertex_buffer.data ), gl.STREAM_DRAW );
			if(normal_buffer)
				this._skinned_mesh.addVertexBuffer("normals","a_normal", 3, new Float32Array( normal_buffer.data ), gl.STREAM_DRAW );
		}


		//apply cpu skinning
		this.applySkin(mesh, this._skinned_mesh);
		RI.setMesh(this._skinned_mesh, this.primitive);
		//remove the flags to avoid recomputing shaders
		delete RI.macros["USE_SKINNING"]; 
		delete RI.macros["USE_SKINNING_TEXTURE"];
		delete RI.samplers["u_bones"];
	}

	//do not need to update
	//RI.matrix.set( this._root.transform._global_matrix );
	if(this.ignore_transform)
		mat4.identity(RI.matrix);
	else
		this._root.transform.getGlobalMatrix(RI.matrix);
	mat4.multiplyVec3( RI.center, RI.matrix, vec3.create() );

	if(this.submesh_id != -1 && this.submesh_id != null)
		RI.submesh_id = this.submesh_id;
	RI.material = this.material || this._root.getMaterial();

	RI.flags = RI_DEFAULT_FLAGS;
	RI.applyNodeFlags();
	if(this.two_sided)
		RI.flags &= ~RI_CULL_FACE;

	if(this.enabled)
		RI.flags |= RI_IGNORE_FRUSTUM; //no frustum test

	instances.push(RI);
	//return RI;
}


SkinnedMeshRenderer.zero_matrix = new Float32Array(16);

SkinnedMeshRenderer.prototype.applySkin = function(ref_mesh, skin_mesh)
{
	var original_vertices = ref_mesh.getBuffer("vertices").data;
	var original_normals = null;
	if(ref_mesh.getBuffer("normals"))
		original_normals = ref_mesh.getBuffer("normals").data;

	var weights = ref_mesh.getBuffer("weights").data;
	var bone_indices = ref_mesh.getBuffer("bone_indices").data;

	var vertices_buffer = skin_mesh.getBuffer("vertices");
	var vertices = vertices_buffer.data;

	var normals_buffer = null;
	var normals = null;

	if(original_normals)
	{
		normals_buffer = skin_mesh.getBuffer("normals");
		normals = normals_buffer.data;
	}

	//bone matrices
	var bones = this.getBoneMatrices( ref_mesh );
	if(bones.length == 0) //no bones found
		return null;

	//var factor = this.factor; //for debug

	//apply skinning per vertex
	var temp = vec3.create();
	var ov_temp = vec3.create();
	var temp_matrix = mat4.create();
	for(var i = 0, l = vertices.length / 3; i < l; ++i)
	{
		var ov = original_vertices.subarray(i*3, i*3+3);

		var b = bone_indices.subarray(i*4, i*4+4);
		var w = weights.subarray(i*4, i*4+4);
		var v = vertices.subarray(i*3, i*3+3);

		var bmat = [ bones[ b[0] ], bones[ b[1] ], bones[ b[2] ], bones[ b[3] ] ];

		temp_matrix.set( SkinnedMeshRenderer.zero_matrix );
		mat4.scaleAndAdd( temp_matrix, temp_matrix, bmat[0], w[0] );
		if(w[1] > 0.0) mat4.scaleAndAdd( temp_matrix, temp_matrix, bmat[1], w[1] );
		if(w[2] > 0.0) mat4.scaleAndAdd( temp_matrix, temp_matrix, bmat[2], w[2] );
		if(w[3] > 0.0) mat4.scaleAndAdd( temp_matrix, temp_matrix, bmat[3], w[3] );

		mat4.multiplyVec3(v, temp_matrix, original_vertices.subarray(i*3, i*3+3) );
		if(normals)
		{
			var n = normals.subarray(i*3, i*3+3);
			mat4.rotateVec3(n, temp_matrix, original_normals.subarray(i*3, i*3+3) );
		}
		
		//we could also multiply the normal but this is already superslow...

		/* apply weights
		v[0] = v[1] = v[2] = 0.0; //reset
		mat4.multiplyVec3(v, bmat[0], ov_temp);
		vec3.scale(v,v,w[0]);
		for(var j = 1; j < 4; ++j)
			if(w[j] > 0.0)
			{
				mat4.multiplyVec3(temp, bmat[j], ov_temp);
				vec3.scaleAndAdd(v, v, temp, w[j]);
			}
		//*/

		//if(factor != 1) vec3.lerp( v, ov, v, factor);
	}

	//upload
	vertices_buffer.compile(gl.STREAM_DRAW);
	if(normals_buffer)
		normals_buffer.compile(gl.STREAM_DRAW);
}

LS.registerComponent(SkinnedMeshRenderer);
LS.SkinnedMeshRenderer = SkinnedMeshRenderer;

function SpriteRenderer(o)
{
	if(o)
		this.configure(o);
}

SpriteRenderer.icon = "mini-icon-teapot.png";

SpriteRenderer.prototype.onAddedToNode = function(node)
{
	LEvent.bind(node, "collectRenderInstances", this.onCollectInstances, this);
}

SpriteRenderer.prototype.onRemovedFromNode = function(node)
{
	LEvent.unbind(node, "collectRenderInstances", this.onCollectInstances, this);
}


//MeshRenderer.prototype.getRenderInstance = function(options)
SpriteRenderer.prototype.onCollectInstances = function(e, instances)
{
	var node = this._root;
	if(!this._root) return;

	var mesh = this._mesh;
	if(!this._mesh)
	{
		this._mesh = GL.Mesh.plane();
		mesh = this._mesh;
	}

	var RI = this._render_instance;
	if(!RI)
		this._render_instance = RI = new RenderInstance(this._root, this);

	//do not need to update
	RI.matrix.set( this._root.transform._global_matrix );
	mat4.multiplyVec3( RI.center, RI.matrix, vec3.create() );

	RI.setMesh(mesh, gl.TRIANGLES);
	RI.material = this._root.getMaterial();

	RI.flags = RI_DEFAULT_FLAGS;
	RI.applyNodeFlags();

	instances.push(RI);
}

LS.registerComponent(SpriteRenderer);

function Skybox(o)
{
	this.texture = null;
	this.intensity = 1;
	this.use_environment = true;
	if(o)
		this.configure(o);
}

Skybox.icon = "mini-icon-teapot.png";

//vars
Skybox["@texture"] = { widget: "texture" };

Skybox.prototype.onAddedToNode = function(node)
{
	LEvent.bind(node, "collectRenderInstances", this.onCollectInstances, this);
}

Skybox.prototype.onRemovedFromNode = function(node)
{
	LEvent.unbind(node, "collectRenderInstances", this.onCollectInstances, this);
}

Skybox.prototype.getResources = function(res)
{
	if(typeof(this.texture) == "string")
		res[this.texture] = Texture;
	return res;
}

Skybox.prototype.onResourceRenamed = function (old_name, new_name, resource)
{
	if(this.texture == old_name)
		this.texture = new_name;
}

Skybox.prototype.onCollectInstances = function(e, instances)
{
	if(!this._root) return;

	var texture = null;
	if (this.use_environment)
		texture = Renderer._current_scene.textures["environment"];
	else
		texture = this.texture;

	if(!texture) return;

	if(texture.constructor === String)
		texture = LS.ResourcesManager.textures[texture];

	var mesh = this._mesh;
	if(!mesh)
		mesh = this._mesh = GL.Mesh.cube({size: 10});

	var node = this._root;

	var RI = this._render_instance;
	if(!RI)
	{
		this._render_instance = RI = new RenderInstance(this._root, this);
		RI.priority = 100;

		RI.onPreRender = function(render_options) { 
			var cam_pos = render_options.current_camera.getEye();
			mat4.identity(this.matrix);
			mat4.setTranslation( this.matrix, cam_pos );
			if(this.node.transform)
			{
				var R = this.node.transform.getGlobalRotationMatrix();
				mat4.multiply( this.matrix, this.matrix, R );
			}

			//this.updateAABB(); this node doesnt have AABB (its always visible)
			vec3.copy( this.center, cam_pos );
		};
	}

	var mat = this._material;
	if(!mat)
		mat = this._material = new LS.Material({use_scene_ambient:false});

	vec3.copy( mat.color, [ this.intensity, this.intensity, this.intensity ] );
	mat.textures["color"] = texture;

	if(texture && texture.texture_type == gl.TEXTURE_2D)
	{
		mat.textures["color_uvs"] = "polar_vertex";
		texture.bind(0);
		texture.setParameter( gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE ); //to avoid going up
		texture.setParameter( gl.TEXTURE_MIN_FILTER, gl.LINEAR ); //avoid ugly error in atan2 edges
	}
	else
		delete mat.textures["color_uvs"];

	RI.setMesh(mesh);

	RI.flags = RI_DEFAULT_FLAGS;
	RI.applyNodeFlags();
	RI.enableFlag( RI_CW | RI_IGNORE_LIGHTS | RI_IGNORE_FRUSTUM | RI_IGNORE_CLIPPING_PLANE); 
	RI.disableFlag( RI_CAST_SHADOWS | RI_DEPTH_WRITE | RI_DEPTH_TEST ); 

	RI.setMaterial(mat);

	instances.push(RI);
}

LS.registerComponent(Skybox);
LS.Skybox = Skybox;

function BackgroundRenderer(o)
{
	this.texture = null;
	this.color = vec3.fromValues(1,1,1);
	this.material_name = null;

	if(o)
		this.configure(o);
}

BackgroundRenderer.icon = "mini-icon-teapot.png";
BackgroundRenderer["@texture"] = { widget: "texture" };
BackgroundRenderer["@color"] = { widget: "color" };
BackgroundRenderer["@material_name"] = { widget: "material" };

BackgroundRenderer.prototype.onAddedToNode = function(node)
{
	LEvent.bind(node, "collectRenderInstances", this.onCollectInstances, this);
}

BackgroundRenderer.prototype.onRemovedFromNode = function(node)
{
	LEvent.unbind(node, "collectRenderInstances", this.onCollectInstances, this);
}

BackgroundRenderer.prototype.getResources = function(res)
{
	if(typeof(this.texture) == "string")
		res[this.texture] = Texture;
	return res;
}

BackgroundRenderer.prototype.onResourceRenamed = function (old_name, new_name, resource)
{
	if(this.texture == old_name)
		this.texture = new_name;
}

BackgroundRenderer.prototype.onCollectInstances = function(e, instances)
{
	var mat = null;

	if( this.material_name )
		mat = LS.ResourcesManager.materials[ this.material_name ];

	if(!mat)
	{
		var texture = this.texture;
		if(!texture) 
			return;
		if(texture.constructor === String)
			texture = LS.ResourcesManager.textures[texture];

		if(!this._material)
			mat = this._material = new LS.Material({use_scene_ambient:false});
		else
			mat = this._material;
		mat.textures["color"] = texture;
		mat.color.set( this.color );
	}

	var mesh = this._mesh;
	if(!mesh)
		mesh = this._mesh = GL.Mesh.plane({size:2});

	var RI = this._render_instance;
	if(!RI)
	{
		this._render_instance = RI = new RenderInstance(this._root, this);
		RI.priority = 100; //render the first one (is a background)
	}

	RI.setMesh(mesh);
	RI.material = mat;

	RI.flags = RI_DEFAULT_FLAGS;
	RI.applyNodeFlags();
	RI.disableFlag( RI_CAST_SHADOWS ); //never cast shadows
	RI.enableFlag( RI_IGNORE_LIGHTS ); //no lights
	RI.enableFlag( RI_CW );
	RI.disableFlag( RI_DEPTH_WRITE ); 
	RI.disableFlag( RI_DEPTH_TEST ); 
	RI.disableFlag( RI_CULL_FACE ); 
	RI.enableFlag( RI_IGNORE_FRUSTUM );
	RI.enableFlag( RI_IGNORE_VIEWPROJECTION );

	instances.push(RI);
}

LS.registerComponent(BackgroundRenderer);
LS.BackgroundRenderer = BackgroundRenderer;

function Collider(o)
{
	this.shape = 1;
	this.mesh = null;
	this.size = vec3.fromValues(0.5,0.5,0.5);
	this.center = vec3.create();
	if(o)
		this.configure(o);
}

Collider.icon = "mini-icon-teapot.png";

//vars
Collider["@size"] = { type: "vec3", step: 0.01 };
Collider["@center"] = { type: "vec3", step: 0.01 };
Collider["@mesh"] = { type: "mesh" };
Collider["@shape"] = { widget:"combo", values: {"Box":1, "Sphere": 2, "Mesh":5 }};

Collider.prototype.onAddedToNode = function(node)
{
	LEvent.bind(node, "collectPhysicInstances", this.onGetColliders, this);
}

Collider.prototype.onRemovedFromNode = function(node)
{
	LEvent.unbind(node, "collectPhysicInstances", this.onGetColliders, this);
}

Collider.prototype.getMesh = function() {
	if(typeof(this.mesh) === "string")
		return ResourcesManager.meshes[this.mesh];
	return this.mesh;
}

Collider.prototype.getResources = function(res)
{
	if(!this.mesh) return;
	if(typeof(this.mesh) == "string")
		res[this.mesh] = Mesh;
	return res;
}

Collider.prototype.onResourceRenamed = function (old_name, new_name, resource)
{
	if(this.mesh == old_name)
		this.mesh = new_name;
}

Collider.prototype.onGetColliders = function(e, colliders)
{
	var PI = this._PI;
	if(!PI)
		this._PI = PI = new PhysicsInstance(this._root, this);

	PI.matrix.set( this._root.transform._global_matrix );
	PI.type = this.shape;

	if(PI.type == PhysicsInstance.SPHERE)
		BBox.setCenterHalfsize( PI.oobb, this.center, [this.size[0],this.size[0],this.size[0]]);
	else
		BBox.setCenterHalfsize( PI.oobb, this.center, this.size);
	vec3.copy( PI.center, this.center );
	if(PI.type == PhysicsInstance.MESH)
	{
		var mesh = this.getMesh();
		if(!mesh) return;
		PI.setMesh(mesh);
	}
	colliders.push(PI);
}


LS.registerComponent(Collider);
LS.Collider = Collider;
function AnnotationComponent(o)
{
	this.text = "";
	this.notes = [];
	this._screen_pos = vec3.create();
	this._selected = null;
	this.configure(o);
}

AnnotationComponent.editor_color = [0.33,0.874,0.56,0.9];


AnnotationComponent.onShowMainAnnotation = function (node)
{
	if(typeof(AnnotationModule) != "undefined")
		AnnotationModule.editAnnotation(node);
}

AnnotationComponent.onShowPointAnnotation = function (node, note)
{
	var comp = node.getComponent( AnnotationComponent );
	if(!comp) return;

	//in editor...
	if(typeof(AnnotationModule) != "undefined")
	{
		AnnotationModule.showDialog( note.text, { 
			item: note, 
			on_close: inner_update_note.bind(note), 
			on_delete: function(info) { 
				comp.removeAnnotation(info.item);
				Scene.refresh();
			},
			on_focus: function(info) { 
				AnnotationModule.focusInAnnotation(info.item);
				comp._selected = info.item;
			}});
	}


	function inner_update_note(text)
	{
		this.text = text;
	}
}

AnnotationComponent.prototype.addAnnotation = function(item)
{
	this._selected = null;
	this.notes.push(item);
}

AnnotationComponent.prototype.removeAnnotation = function(item)
{
	this._selected = null;
	var pos = this.notes.indexOf(item);
	if(pos != -1)
		this.notes.splice(pos,1);
}

AnnotationComponent.prototype.setStartTransform = function()
{
	this.start_position = this.getObjectCenter();
}

AnnotationComponent.prototype.getObjectCenter = function()
{
	var center = vec3.create();
	var mesh = this._root.getMesh();
	if(mesh && mesh.bounding )
		vec3.copy( center, BBox.getCenter(mesh.bounding) );
	var pos = this._root.transform.transformPointGlobal(center, vec3.create());
	return pos;
}

AnnotationComponent.prototype.serialize = function()
{
	var o = {
		text: this.text,
		notes: [],
		start_position: this.start_position
	};
	
	for(var i in this.notes)
	{
		var note = this.notes[i];
		for(var j in note)
		{
			if(note[j].constructor == Float32Array)
				Array.prototype.slice.call( note[j] );
		}
		o.notes.push(note);
	}
	return o;
}

AnnotationComponent.prototype.onAddedToNode = function(node)
{
	LEvent.bind(node,"mousedown",this.onMouse.bind(this),this);
}

AnnotationComponent.prototype.onRemovedFromNode = function(node)
{
}

AnnotationComponent.prototype.onMouse = function(type, e)
{
	if(e.eventType == "mousedown")
	{
		var node = this._root;
		this._screen_pos[2] = 0;
		var dist = vec3.dist( this._screen_pos, [e.canvasx, gl.canvas.height - e.canvasy, 0] );
		if(dist < 30)
		{
			var that = this;
			AnnotationComponent.onShowMainAnnotation(this._root);
		}

		for(var i in this.notes)
		{
			var note = this.notes[i];
			dist = vec2.dist( note._end_screen, [e.mousex, gl.canvas.height - e.mousey] );
			if(dist < 30)
			{
				this._selected = note;
				AnnotationComponent.onShowPointAnnotation(this._root, note);
				return true;
			}
		}
	}
}

LS.registerComponent(AnnotationComponent);
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

Rotator.icon = "mini-icon-rotator.png";

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
	var scene = this._root._in_tree;

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

	if(scene)
		LEvent.trigger(scene,"change");
}

LS.registerComponent(Rotator);
/**
* Camera controller
* @class CameraController
* @constructor
* @param {String} object to configure from
*/

function CameraController(o)
{
	this.speed = 10;
	this.rot_speed = 1;
	this.wheel_speed = 1;
	this.smooth = false;
	this.allow_panning = true;
	this.cam_type = "orbit"; //"fps"
	this._moving = vec3.fromValues(0,0,0);
	this.orbit_center = null;
	this._collision = vec3.create();

	this.configure(o);
}

CameraController.icon = "mini-icon-cameracontroller.png";

CameraController.prototype.onAddedToNode = function(node)
{
	LEvent.bind(node,"mousedown",this.onMouse,this);
	LEvent.bind(node,"mousemove",this.onMouse,this);
	LEvent.bind(node,"mousewheel",this.onMouse,this);
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
			//move using the delta vector
			if(this._moving[0] != 0 || this._moving[1] != 0 || this._moving[2] != 0)
			{
				var delta = cam.getLocalVector( this._moving );
				vec3.scale(delta, delta, this.speed * (this._move_fast?10:1));
				cam.move(delta);
				cam.updateMatrices();
			}
		}
	}

	if(this.smooth)
	{
		Scene.refresh();
	}
}

CameraController.prototype.onMouse = function(e, mouse_event)
{
	if(!this._root) return;
	
	var cam = this._root.camera;
	if(!cam) return;

	if(!mouse_event) mouse_event = e;

	if(mouse_event.eventType == "mousewheel")
	{
		cam.orbitDistanceFactor(1 + mouse_event.wheel * -0.001 * this.wheel_speed, this.orbit_center);
		cam.updateMatrices();
		return;
	}

	if(mouse_event.eventType == "mousedown")
	{
		this.testPerpendicularPlane( mouse_event.canvasx, gl.canvas.height - mouse_event.canvasy, cam.getCenter(), this._collision );
	}

	//regular mouse dragging
	if(!mouse_event.dragging)
		return;

	if(this._root.transform)
	{
		//TODO
	}
	else 
	{
		if(this.cam_type == "fps")
		{
			cam.rotate(-mouse_event.deltax * this.rot_speed,[0,1,0]);
			cam.updateMatrices();
			var right = cam.getLocalVector([1,0,0]);
			cam.rotate(-mouse_event.deltay * this.rot_speed,right);
			cam.updateMatrices();
		}
		else if(this.cam_type == "orbit")
		{
			if(this.allow_panning && (mouse_event.ctrlKey || mouse_event.button == 1)) //pan
			{
				var collision = vec3.create();
				this.testPerpendicularPlane( mouse_event.canvasx, gl.canvas.height - mouse_event.canvasy, cam.getCenter(), collision );
				var delta = vec3.sub( vec3.create(), this._collision, collision);
				cam.move( delta );
				//vec3.copy(  this._collision, collision );
				cam.updateMatrices();
			}
			else
			{
				cam.orbit(-mouse_event.deltax * this.rot_speed,[0,1,0], this.orbit_center);
				//if(e.shiftKey)
				//{
					cam.updateMatrices();
					var right = cam.getLocalVector([1,0,0]);
					cam.orbit(-mouse_event.deltay * this.rot_speed,right, this.orbit_center);
				/*
				}
				else
				{
					cam.orbitDistanceFactor(1 + mouse_event.deltay * 0.01, this.orbit_center);
					cam.updateMatrices();
				}
				*/
			}
		}
	}
}

CameraController.prototype.testPerpendicularPlane = function(x,y, center, result)
{
	var cam = this._root.camera;
	var ray = cam.getRayInPixel( x, gl.canvas.height - y );

	var front = cam.getFront();
	var center = center || cam.getCenter();
	var result = result || vec3.create();

	//test against plane
	if( geo.testRayPlane( ray.start, ray.direction, center, front, result ) )
		return true;
	return false;
}

CameraController.prototype.onKey = function(e, key_event)
{
	if(!this._root) return;
	//trace(key_event);
	if(key_event.keyCode == 87)
	{
		if(key_event.type == "keydown")
			this._moving[2] = -1;
		else
			this._moving[2] = 0;
	}
	else if(key_event.keyCode == 83)
	{
		if(key_event.type == "keydown")
			this._moving[2] = 1;
		else
			this._moving[2] = 0;
	}
	else if(key_event.keyCode == 65)
	{
		if(key_event.type == "keydown")
			this._moving[0] = -1;
		else
			this._moving[0] = 0;
	}
	else if(key_event.keyCode == 68)
	{
		if(key_event.type == "keydown")
			this._moving[0] = 1;
		else
			this._moving[0] = 0;
	}
	else if(key_event.keyCode == 16) //shift in windows chrome
	{
		if(key_event.type == "keydown")
			this._move_fast = true;
		else
			this._move_fast = false;
	}

	//if(e.shiftKey) vec3.scale(this._moving,10);


	//LEvent.trigger(Scene,"change");
}

LS.registerComponent(CameraController);
/**
* Node manipulator, allows to rotate it
* @class NodeManipulator
* @constructor
* @param {String} object to configure from
*/

function NodeManipulator(o)
{
	this.rot_speed = [1,1]; //degrees
	this.smooth = false;
	this.configure(o);
}

NodeManipulator.icon = "mini-icon-rotator.png";

NodeManipulator.prototype.onAddedToNode = function(node)
{
	node.interactive = true;
	LEvent.bind(node,"mousemove",this.onMouse,this);
	LEvent.bind(node,"update",this.onUpdate,this);
}

NodeManipulator.prototype.onUpdate = function(e)
{
	if(!this._root) return;

	if(!this._root.transform)
		return;

	if(this.smooth)
	{
		Scene.refresh();
	}
}

NodeManipulator.prototype.onMouse = function(e, mouse_event)
{
	if(!this._root || !this._root.transform) return;
	
	//regular mouse dragging
	if(!mouse_event.dragging)
		return;

	this._root.transform.rotate(mouse_event.deltax * this.rot_speed[0], [0,1,0] );
	this._root.transform.rotateLocal(-mouse_event.deltay * this.rot_speed[1], [1,0,0] );
}

LS.registerComponent(NodeManipulator);
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

	this.factor = 1;
	this.target = null;
	this.cylindrical = false;

	this.configure(o);
}

FaceTo.icon = "mini-icon-billboard.png";

FaceTo["@target"] = {type:'node'};

FaceTo.prototype.onAddedToNode = function(node)
{
	//LEvent.bind(node,"computeVisibility",this.updateOrientation,this);
	LEvent.bind(node,"afterVisibility",this.updateOrientation,this);
}

FaceTo.prototype.updateOrientation = function(e, render_options)
{
	if(!this._root) return;
	var scene = this._root._in_tree;

	/*
	var dir = vec3.subtract( info.camera.getEye(), this._root.transform.getPosition(), vec3.create() );
	quat.lookAt( this._root.transform._rotation, dir, [0,1,0] );
	this._root.transform._dirty = true;
	*/

	var eye = null;
	var camera = render_options.main_camera;
	var target_position = null;
	var up = vec3.fromValues(0,1,0);
	var position = this._root.transform.getGlobalPosition();

	if(this.target)
	{
		var node = scene.getNode( this.target );
		if(!node || node == this._root ) //avoid same node
			return;
		target_position = node.transform.getGlobalPosition();
	}
	else
	{
		target_position = camera.getEye();
	}

	if( this.cylindrical )
	{
		target_position[1] = position[1];
		up.set([0,1,0]);
	}

	/*
	if(this._root.transform._parent)
	{
		var mat = this._root.transform._parent.getGlobalMatrix();
		var inv = mat4.invert( mat4.create(), mat );
		mat4.multiplyVec3(target_position, inv, target_position);
		//mat4.rotateVec3(up, inv, up);
	}
	//var up = camera.getLocalVector([0,1,0]);
	*/

	this._root.transform.lookAt( position, target_position, up, true );
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

FogFX.icon = "mini-icon-fog.png";

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

FollowNode.icon = "mini-icon-follow.png";

FollowNode.prototype.onAddedToNode = function(node)
{
	LEvent.bind(node,"computeVisibility",this.updatePosition,this);
}

FollowNode.prototype.updatePosition = function(e,info)
{
	if(!this._root) return;

	var pos = null;
	var camera = Scene.getCamera(); //main camera

	if(this.follow_camera)
		pos =  camera.getEye();
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
	this.size = 10;
	this.subdivisions = 10;
	this.geometry = GeometricPrimitive.CUBE;
	this.primitive = null;
	this.align_z = false;

	if(o)
		this.configure(o);
}

GeometricPrimitive.CUBE = 1;
GeometricPrimitive.PLANE = 2;
GeometricPrimitive.CYLINDER = 3;
GeometricPrimitive.SPHERE = 4;

GeometricPrimitive.icon = "mini-icon-cube.png";
GeometricPrimitive["@geometry"] = { type:"enum", values: {"Cube":GeometricPrimitive.CUBE, "Plane": GeometricPrimitive.PLANE, "Cylinder":GeometricPrimitive.CYLINDER,  "Sphere":GeometricPrimitive.SPHERE }};
GeometricPrimitive["@primitive"] = {widget:"combo", values: {"Default":null, "Points": 0, "Lines":1, "Triangles":4 }};

GeometricPrimitive.prototype.onAddedToNode = function(node)
{
	LEvent.bind(node, "collectRenderInstances", this.onCollectInstances, this);
}

GeometricPrimitive.prototype.onRemovedFromNode = function(node)
{
	LEvent.unbind(node, "collectRenderInstances", this.onCollectInstances, this);
}

GeometricPrimitive.prototype.updateMesh = function()
{
	var subdivisions = Math.max(1,this.subdivisions|0);

	var key = "" + this.geometry + "|" + this.size + "|" + subdivisions + "|" + this.align_z;

	switch (this.geometry)
	{
		case GeometricPrimitive.CUBE: 
			this._mesh = GL.Mesh.cube({size: this.size, normals:true,coords:true});
			break;
		case GeometricPrimitive.PLANE:
			this._mesh = GL.Mesh.plane({size: this.size, detail: subdivisions, xz: this.align_z, normals:true,coords:true});
			break;
		case GeometricPrimitive.CYLINDER:
			this._mesh = GL.Mesh.cylinder({size: this.size, subdivisions: subdivisions, normals:true,coords:true});
			break;
		case GeometricPrimitive.SPHERE:
			this._mesh = GL.Mesh.sphere({size: this.size, "long":subdivisions, lat: subdivisions, normals:true,coords:true});
			break;
	}
	this._key = key;
}

//GeometricPrimitive.prototype.getRenderInstance = function()
GeometricPrimitive.prototype.onCollectInstances = function(e, instances)
{
	//if(this.size == 0) return;
	var mesh = null;
	if(!this._root) return;

	var subdivisions = Math.max(1,this.subdivisions|0);
	var key = "" + this.geometry + "|" + this.size + "|" + subdivisions + "|" + this.align_z;

	if(!this._mesh || this._key != key)
		this.updateMesh();

	var RI = this._render_instance;
	if(!RI)
		this._render_instance = RI = new RenderInstance(this._root, this);

	this._root.transform.getGlobalMatrix(RI.matrix);
	mat4.multiplyVec3(RI.center, RI.matrix, vec3.create());
	RI.setMesh( this._mesh, this.primitive );
	this._root.mesh = this._mesh;
	
	RI.flags = RI_DEFAULT_FLAGS | RI_RAYCAST_ENABLED;
	RI.applyNodeFlags();
	RI.setMaterial( this.material || this._root.getMaterial() );

	instances.push(RI);
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
	this.enabled = true;
	this.force_redraw = true;

	this.on_event = "update";
	this._graph = new LGraph();

	if(o)
		this.configure(o);
	else //default
	{
		var graphnode = LiteGraph.createNode("scene/node");
		this._graph.add(graphnode);
	}
	
	LEvent.bind(this,"trigger", this.trigger, this );	
}

GraphComponent["@on_event"] = { type:"enum", values: ["start","render","update","trigger"] };

GraphComponent.icon = "mini-icon-graph.png";

/**
* Returns the first component of this container that is of the same class
* @method configure
* @param {Object} o object with the configuration info from a previous serialization
*/
GraphComponent.prototype.configure = function(o)
{
	this.enabled = !!o.enabled;
	if(o.graph_data)
	{
		try
		{
			var obj = JSON.parse(o.graph_data);
			this._graph.configure( obj );
		}
		catch (err)
		{
			console.err("Error parsing Graph data");
		}
	}
}

GraphComponent.prototype.serialize = function()
{
	return { enabled: this.enabled, force_redraw: this.force_redraw , graph_data: JSON.stringify( this._graph.serialize() ) };
}

GraphComponent.prototype.onAddedToNode = function(node)
{
	this._graph._scenenode = node;

	LEvent.bind(node,"start", this.onEvent, this );
	LEvent.bind(node,"beforeRenderMainPass", this.onEvent, this );
	LEvent.bind(node,"update", this.onEvent, this );
}

GraphComponent.prototype.onRemovedFromNode = function(node)
{
	LEvent.unbind(node,"start", this.onEvent, this );
	LEvent.unbind(node,"beforeRenderMainPass", this.onEvent, this );
	LEvent.unbind(node,"update", this.onEvent, this );
}


GraphComponent.prototype.onEvent = function(event_type, event_data)
{
	if(event_type == "beforeRenderMainPass")
		event_type = "render";

	if(this.on_event == event_type)
		this.runGraph();
}

GraphComponent.prototype.trigger = function(e)
{
	if(this.on_event == "trigger")
		this.runGraph();
}

GraphComponent.prototype.runGraph = function()
{
	if(!this._root._in_tree || !this.enabled) return;
	if(this._graph)
		this._graph.runStep(1);
	if(this.force_redraw)
		LEvent.trigger(this._root._in_tree, "change");
}


LS.registerComponent(GraphComponent);
window.GraphComponent = GraphComponent;



/**
* This component allow to integrate a rendering post FX using a graph
* @class FXGraphComponent
* @param {Object} o object with the serialized info
*/
function FXGraphComponent(o)
{
	this.enabled = true;
	this.use_viewport_size = false;
	this.use_high_precision = false;
	this.use_antialiasing = false;
	this._graph = new LGraph();
	if(o)
	{
		this.configure(o);
	}
	else //default
	{
		this._graph_color_texture_node = LiteGraph.createNode("texture/texture","Color Buffer");
		this._graph_color_texture_node.ignore_remove = true;

		this._graph_depth_texture_node = LiteGraph.createNode("texture/texture","Depth Buffer");
		this._graph_depth_texture_node.ignore_remove = true;
		this._graph_depth_texture_node.pos[1] = 400;

		this._graph.add( this._graph_color_texture_node );
		this._graph.add( this._graph_depth_texture_node );

		this._graph_viewport_node = LiteGraph.createNode("texture/toviewport","Viewport");
		this._graph_viewport_node.pos[0] = 500;
		this._graph.add( this._graph_viewport_node );

		this._graph_color_texture_node.connect(0, this._graph_viewport_node );
	}

	if(FXGraphComponent.high_precision_format == null)
	{
		if(gl.half_float_ext)
			FXGraphComponent.high_precision_format = gl.HALF_FLOAT_OES;
		else if(gl.float_ext)
			FXGraphComponent.high_precision_format = gl.FLOAT;
		else
			FXGraphComponent.high_precision_format = gl.UNSIGNED_BYTE;
	}
}

FXGraphComponent.icon = "mini-icon-graph.png";
FXGraphComponent.buffer_size = [1024,512];

/**
* Returns the first component of this container that is of the same class
* @method configure
* @param {Object} o object with the configuration info from a previous serialization
*/
FXGraphComponent.prototype.configure = function(o)
{
	if(!o.graph_data)
		return;

	this.enabled = !!o.enabled;
	this.use_viewport_size = !!o.use_viewport_size;
	this.use_high_precision = !!o.use_high_precision;
	this.use_antialiasing = !!o.use_antialiasing;

	this._graph.configure( JSON.parse( o.graph_data ) );
	this._graph_color_texture_node = this._graph.findNodesByTitle("Color Buffer")[0];
	this._graph_depth_texture_node = this._graph.findNodesByTitle("Depth Buffer")[0];
	this._graph_viewport_node = this._graph.findNodesByTitle("Viewport")[0];
}

FXGraphComponent.prototype.serialize = function()
{
	return { enabled: this.enabled, use_antialiasing: this.use_antialiasing, use_high_precision: this.use_high_precision, use_viewport_size: this.use_viewport_size, graph_data: JSON.stringify( this._graph.serialize() ) };
}

FXGraphComponent.prototype.getResources = function(res)
{
	var nodes = this._graph.findNodesByType("texture/texture");
	for(var i in nodes)
	{
		if(nodes[i].properties.name)
			res[nodes[i].properties.name] = Texture;
	}
	return res;
}

FXGraphComponent.prototype.onAddedToNode = function(node)
{
	this._graph._scenenode = node;
	LEvent.bind(Scene,"beforeRenderPass", this.onBeforeRender, this );
	LEvent.bind(Scene,"afterRenderPass", this.onAfterRender, this );
}

FXGraphComponent.prototype.onRemovedFromNode = function(node)
{
	LEvent.unbind(Scene,"beforeRenderPass", this.onBeforeRender, this );
	LEvent.unbind(Scene,"afterRenderPass", this.onAfterRender, this );
	Renderer.color_rendertarget = null;
	Renderer.depth_rendertarget = null;
}

FXGraphComponent.prototype.onBeforeRender = function(e, render_options)
{
	if(!this._graph || !render_options.render_fx) return;

	var use_depth = false;
	if(this._graph_depth_texture_node && this._graph_depth_texture_node.isOutputConnected(0))
		use_depth = true;

	var width = FXGraphComponent.buffer_size[0];
	var height = FXGraphComponent.buffer_size[1];
	if( this.use_viewport_size )
	{
		width = gl.canvas.width;
		height = gl.canvas.height;
		//var v = gl.getParameter(gl.VIEWPORT);
		//width = v[2];
		//height = v[3];
	}

	var type = this.use_high_precision ? gl.HIGH_PRECISION_FORMAT : gl.UNSIGNED_BYTE;

	if(!this.color_texture || this.color_texture.width != width || this.color_texture.height != height || this.color_texture.type != type)
	{
		this.color_texture = new GL.Texture(width,height,{ format: gl.RGB, filter: gl.LINEAR, type: type });
		ResourcesManager.textures[":color_buffer"] = this.color_texture;
	}

	if((!this.depth_texture || this.depth_texture.width != width || this.depth_texture.height != height) && use_depth)
	{
		this.depth_texture = new GL.Texture(width, height, { filter: gl.NEAREST, format: gl.DEPTH_COMPONENT, type: gl.UNSIGNED_INT });
		ResourcesManager.textures[":depth_buffer"] = this.depth_texture;
	}		

	if(this.enabled)
	{
		Renderer.color_rendertarget = this.color_texture;
		if(use_depth)
			Renderer.depth_rendertarget = this.depth_texture;
		else
			Renderer.depth_rendertarget = null;
	}
	else
	{
		Renderer.color_rendertarget = null;
		Renderer.depth_rendertarget = null;
	}
}


FXGraphComponent.prototype.onAfterRender = function(e,render_options)
{
	if(!this._graph || !this.enabled || !render_options.render_fx) return;

	if(!this._graph_color_texture_node)
		this._graph_color_texture_node = this._graph.findNodesByTitle("Color Buffer")[0];
	if(!this._depth_depth_texture_node)
		this._depth_depth_texture_node = this._graph.findNodesByTitle("Depth Buffer")[0];

	if(!this._graph_color_texture_node)
		return;

	this._graph_color_texture_node.properties.name = ":color_buffer";
	if(this._graph_depth_texture_node)
		this._graph_depth_texture_node.properties.name = ":depth_buffer";
	if(this._graph_viewport_node) //force antialiasing
		this._graph_viewport_node.properties.antialiasing = this.use_antialiasing;

	this._graph.runStep(1);
}


LS.registerComponent(FXGraphComponent);
window.FXGraphComponent = FXGraphComponent;








/**
* KnobComponent allows to rotate a mesh like a knob
* @class KnobComponent
* @constructor
* @param {String} object to configure from
*/

function KnobComponent(o)
{
	this.value = 0;
	this.delta = 0.01;

	this.steps = 0; //0 = continuous
	this.min_value = 0;
	this.max_value = 1;
	this.min_angle = -120;
	this.max_angle = 120;
	this.axis = vec3.fromValues(0,0,1);

	if(o)
		this.configure(o);
}

KnobComponent.icon = "mini-icon-knob.png";

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
	this.value -= mouse_event.deltay * this.delta;

	if(this.value > this.max_value) this.value = this.max_value;
	else if(this.value < this.min_value) this.value = this.min_value;

	this.updateKnob();

	LEvent.trigger( this, "change", this.value);
	if(this._root)
		LEvent.trigger( this._root, "knobChange", this.value);

	return false;
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

ParticleEmissor.prototype.onResourceRenamed = function (old_name, new_name, resource)
{
	if(this.emissor_mesh == old_name)
		this.emissor_mesh = new_name;
	if(this.texture == old_name)
		this.texture = new_name;
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
		this.updateMesh(Renderer._current_camera);

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

	var camera = Renderer._current_camera;

	if(this.align_always)
		this.updateMesh(camera);

	if(!this._material)
		this._material = new Material({ opacity: this.opacity - 0.01, shader:"lowglobalshader" });

	this._material.opacity = this.opacity - 0.01; //try to keep it under 1
	this._material.setTexture(this.texture);
	this._material.blend_mode = this.additive_blending ? Blend.ADD : Blend.ALPHA;
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

	var material = (this._root.material && this.use_node_material) ? this._root.getMaterial() : this._material;
	mat4.multiplyVec3(RI.center, RI.matrix, vec3.create());

	RI.flags = RI_DEFAULT_FLAGS | RI_IGNORE_FRUSTUM;
	RI.applyNodeFlags();

	RI.setMaterial( material );
	RI.setMesh( this._mesh, gl.TRIANGLES );
	RI.setRange(0, this._visible_particles * 6); //6 vertex per particle

	instances.push(RI);
}


LS.registerComponent(ParticleEmissor);
/**
* Reads animation tracks from an Animation resource and applies the properties to the objects referenced
* @class PlayAnimation
* @constructor
* @param {String} object to configure from
*/


function PlayAnimation(o)
{
	this.animation = "";
	this.take = "default";
	this.playback_speed = 1.0;
	this.mode = "loop";
	this.play = true;
	this.current_time = 0;

	this.disabled_tracks = {};

	if(o)
		this.configure(o);
}

PlayAnimation["@animation"] = { widget: "resource" };
PlayAnimation["@mode"] = { type:"enum", values: ["loop","pingpong","once"] };

PlayAnimation.prototype.configure = function(o)
{
	if(o.animation)
		this.animation = o.animation;
	if(o.take)
		this.take = o.take;
	if(o.playback_speed != null)
		this.playback_speed = parseFloat( o.playback_speed );
}


PlayAnimation.icon = "mini-icon-reflector.png";

PlayAnimation.prototype.onAddedToNode = function(node)
{
	LEvent.bind(node,"update",this.onUpdate, this);
}


PlayAnimation.prototype.onRemoveFromNode = function(node)
{
	LEvent.unbind(node,"update",this.onUpdate, this);
}

PlayAnimation.prototype.onUpdate = function(e, dt)
{
	if(!this.animation) return;

	var animation = LS.ResourcesManager.resources[ this.animation ];
	if(!animation) return;

	//var time = Scene.getTime() * this.playback_speed;
	if(this.play)
		this.current_time += dt * this.playback_speed;

	var take = animation.takes[ this.take ];
	if(!take) return;

	take.actionPerSample( this.current_time, this._processSample, { disabled_tracks: this.disabled_tracks } );
	Scene.refresh();
}

PlayAnimation.prototype._processSample = function(nodename, property, value, options)
{
	var node = Scene.getNode(nodename);
	if(!node) 
		return;

	switch(property)
	{
		case "matrix": if(node.transform)
							node.transform.fromMatrix(value);
						break;
		default: break;
	}
}

PlayAnimation.prototype.getResources = function(res)
{
	if(this.animation)
		res[ this.animation ] = LS.Animation;
}

PlayAnimation.prototype.onResourceRenamed = function (old_name, new_name, resource)
{
	if(this.animation == old_name)
		this.animation = new_name;
}

LS.registerComponent(PlayAnimation);
/**
* Realtime Reflective surface
* @class RealtimeReflector
* @constructor
* @param {String} object to configure from
*/


function RealtimeReflector(o)
{
	this.enabled = true;
	this.texture_size = 512;
	this.brightness_factor = 1.0;
	this.colorclip_factor = 0.0;
	this.clip_offset = 0.5; //to avoid ugly edges near clipping plane
	this.rt_name = "";
	this.use_cubemap = false;
	this.blur = 0;
	this.generate_mipmaps = false;
	this.use_mesh_info = false;
	this.offset = vec3.create();
	this.ignore_this_mesh = true;
	this.high_precision = false;
	this.refresh_rate = 1; //in frames
	this._rt = null;

	if(o)
		this.configure(o);
}

RealtimeReflector.icon = "mini-icon-reflector.png";

RealtimeReflector["@texture_size"] = { type:"enum", values:[64,128,256,512,1024,2048] };

RealtimeReflector.prototype.onAddedToNode = function(node)
{
	LEvent.bind(node,"renderReflections", this.onRenderRT, this );
}


RealtimeReflector.prototype.onRemoveFromNode = function(node)
{
	LEvent.unbind(node,"renderReflections", this.onRenderRT, this);
}


RealtimeReflector.prototype.onRenderRT = function(e, render_options)
{
	if(!this.enabled || !this._root) return;

	var camera = render_options.main_camera;

	this.refresh_rate = this.refresh_rate << 0;

	if( (Scene._frame == 0 || (Scene._frame % this.refresh_rate) != 0) && this._rt)
		return;

	//texture
	if( !isPowerOfTwo(this.texture_size) )
		this.texture_size = 256;

	var texture_type = this.use_cubemap ? gl.TEXTURE_CUBE_MAP : gl.TEXTURE_2D;
	var type = this.high_precision ? gl.HIGH_PRECISION_FORMAT : gl.UNSIGNED_BYTE;
	if(!this._rt || this._rt.width != this.texture_size || this._rt.type != type || this._rt.texture_type != texture_type || this._rt.mipmaps != this.generate_mipmaps)
	{
		this._rt = new Texture(this.texture_size,this.texture_size, { type: type, texture_type: texture_type, minFilter: this.generate_mipmaps ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR });
		this._rt.mipmaps = this.generate_mipmaps;
	}

	//compute planes
	var plane_center = this._root.transform.getGlobalPosition();
	var plane_normal = this._root.transform.getTop();
	var cam_eye = camera.getEye();
	var cam_center = camera.getCenter();
	var cam_up = camera.getUp();

	//use the first vertex and normal from a mesh
	if(this.use_mesh_info)
	{
		var mesh = this._root.getMesh();
		if(mesh)
		{
			plane_center = this._root.transform.transformPointGlobal( mesh.vertices.subarray(0,3) );
			plane_normal = this._root.transform.transformVectorGlobal( mesh.normals.subarray(0,3) );
		}
	}

	vec3.add( plane_center, plane_center, this.offset );

	//camera
	var reflected_camera = this._reflected_camera || new Camera();
	this._reflected_camera = reflected_camera;
	reflected_camera.configure( camera.serialize() );

	var visible = this._root.flags.visible;
	if(this.ignore_this_mesh)
		this._root.flags.visible = false;

	//add flags
	render_options.is_rt = true;
	render_options.is_reflection = true;
	render_options.brightness_factor = this.brightness_factor;
	render_options.colorclip_factor = this.colorclip_factor;

	if( !this.use_cubemap ) //planar reflection
	{
		reflected_camera.fov = camera.fov;
		reflected_camera.aspect = camera.aspect;
		reflected_camera.eye = geo.reflectPointInPlane( cam_eye, plane_center, plane_normal );
		reflected_camera.center = geo.reflectPointInPlane( cam_center, plane_center, plane_normal );
		reflected_camera.up = geo.reflectPointInPlane( cam_up, [0,0,0], plane_normal );
		//reflected_camera.up = cam_up;

		//little offset
		vec3.add(plane_center, plane_center,vec3.scale(vec3.create(), plane_normal, -this.clip_offset));
		var clipping_plane = [plane_normal[0], plane_normal[1], plane_normal[2], vec3.dot(plane_center, plane_normal)  ];
		render_options.clipping_plane = clipping_plane;
		Renderer.renderInstancesToRT(reflected_camera,this._rt, render_options);
	}
	else //spherical reflection
	{
		reflected_camera.eye = plane_center;
		Renderer.renderInstancesToRT(reflected_camera,this._rt, render_options );
	}

	//remove flags
	delete render_options.clipping_plane;
	delete render_options.is_rt;
	delete render_options.is_reflection;
	delete render_options.brightness_factor;
	delete render_options.colorclip_factor;

	if(this.blur)
	{
		if( this._temp_blur_texture && !Texture.compareFormats(this._temp_blur_texture, this._rt) )
			this._temp_blur_texture = null;	 //remove old one
		this._temp_blur_texture = this._rt.applyBlur( this.blur, this.blur, 1, this._temp_blur_texture);
		//ResourcesManager.registerResource(":BLUR", this._temp_blur_texture);//debug
	}


	if(this.generate_mipmaps)
	{
		this._rt.bind();
		gl.generateMipmap(this._rt.texture_type);
		this._rt.unbind();
	}

	this._root.flags.visible = visible;

	if(this.rt_name)
		ResourcesManager.registerResource(this.rt_name, this._rt);

	if(!this._root.material) return;
	
	var mat = this._root.getMaterial();
	if(mat)
		mat.setTexture(this.rt_name ? this.rt_name : this._rt, Material.ENVIRONMENT_TEXTURE, Material.COORDS_FLIPPED_SCREEN);
}

LS.registerComponent(RealtimeReflector);
function ScriptComponent(o)
{
	this.enabled = true;
	this.code = "function update(dt)\n{\n\tScene.refresh();\n}";
	this._component = null;

	this._script = new LScript();
	this._script.valid_callbacks = ScriptComponent.valid_callbacks;
	this._last_error = null;
	this._script.onerror = (function(err) { this.onError(err); }).bind(this);

	this.configure(o);
	if(this.code)
		this.processCode();
}

ScriptComponent.icon = "mini-icon-script.png";

ScriptComponent["@code"] = {type:'script'};

ScriptComponent.valid_callbacks = ["start","update","trigger"];

ScriptComponent.prototype.getContext = function()
{
	if(this._script)
			return this._script._context;
	return null;
}

ScriptComponent.prototype.processCode = function()
{
	this._script.code = this.code;
	this._script.compile({component:this, node: this._root});
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

	this._script.callMethod("start");

	//if(this.enabled && this._component && this._component.start)
	//	this._component.start();
}

ScriptComponent.prototype.onUpdate = function(e,dt)
{
	this._script.callMethod("update",[dt]);

	//if(this.enabled && this._component && this._component.update)
	//	this._component.update(dt);
}

ScriptComponent.prototype.onError = function(err)
{
	console.log("app stopping due to error in script");
	Scene.stop();
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

TerrainRenderer.icon = "mini-icon-terrain.png";

TerrainRenderer.prototype.onAddedToNode = function(node)
{
	LEvent.bind(node, "collectRenderInstances", this.onCollectInstances, this);
}

TerrainRenderer.prototype.onRemovedFromNode = function(node)
{
	LEvent.unbind(node, "collectRenderInstances", this.onCollectInstances, this);
	if(this._root.mesh == this._mesh)
		delete this._root["mesh"];
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

TerrainRenderer.prototype.onResourceRenamed = function (old_name, new_name, resource)
{
	if(this.heightmap == old_name)
		this.heightmap = new_name;
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
	var hsize = this.size * 0.5;
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
	var xzScale = hsize / (subdivisions-1);

	for (var y = 0; y <= detailY; y++) 
	{
		var t = y / detailY;
		for (var x = 0; x <= detailX; x++) 
		{
			var s = x / detailX;

			h = data[y * subdivisions * 4 + x * 4] / 255; //red channel
			vertices.push(hsize*(2 * s - 1), h * height, hsize*(2 * t - 1));
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

	var mesh = new GL.Mesh({vertices:vertices,normals:normals,coords:coords},{triangles:triangles});
	mesh.setBounding( [0,this.height*0.5,0], [hsize,this.height*0.5,hsize] );
	this._mesh = mesh;
	this._info = [ this.heightmap, this.size, this.height, this.subdivisions, this.smooth ];
}

TerrainRenderer.PLANE = null;

TerrainRenderer.prototype.onCollectInstances = function(e, instances)
{
	if(!this._mesh && this.heightmap)
		this.updateMesh();

	if(this.auto_update && this._info)
	{
		if( this._info[0] != this.heightmap || this._info[1] != this.size || this._info[2] != this.height || this._info[3] != this.subdivisions || this._info[4] != this.smooth )
			this.updateMesh();
	}

	var RI = this._render_instance;
	if(!RI)
		this._render_instance = RI = new RenderInstance(this._root, this);

	if(!this._mesh)
	{
		if(!TerrainRenderer.PLANE)
			TerrainRenderer.PLANE = GL.Mesh.plane({xz:true,normals:true,coords:true});	
		RI.mesh = TerrainRenderer.PLANE;
		return RI;
	};

	RI.material = this._root.getMaterial();
	RI.setMesh( this._mesh, gl.TRIANGLES );
	
	this._root.mesh = this._mesh;
	this._root.transform.getGlobalMatrix( RI.matrix );
	mat4.multiplyVec3(RI.center, RI.matrix, vec3.create());

	RI.flags = RI_DEFAULT_FLAGS;
	RI.applyNodeFlags();
	
	instances.push(RI);
}

LS.registerComponent(TerrainRenderer);


function Cloner(o)
{
	this.count = [10,1,1];
	this.size = [100,100,100];
	this.mesh = null;
	this.lod_mesh = null;
	this.material = null;
	this.mode = Cloner.GRID_MODE;

	if(o)
		this.configure(o);

	if(!Cloner._identity) //used to avoir garbage
		Cloner._identity = mat4.create();
}

Cloner.GRID_MODE = 1;
Cloner.RADIAL_MODE = 2;

Cloner.icon = "mini-icon-teapot.png";

//vars
Cloner["@mesh"] = { widget: "mesh" };
Cloner["@lod_mesh"] = { widget: "mesh" };
Cloner["@mode"] = {widget:"combo", values: {"Grid":1, "Radial": 2}};
Cloner["@count"] = {widget:"vector3", min:1, step:1 };

Cloner.prototype.onAddedToNode = function(node)
{
	LEvent.bind(node, "collectRenderInstances", this.onCollectInstances, this);
}

Cloner.prototype.onRemovedFromNode = function(node)
{
	LEvent.unbind(node, "collectRenderInstances", this.onCollectInstances, this);
}

Cloner.prototype.getMesh = function() {
	if(typeof(this.mesh) === "string")
		return ResourcesManager.meshes[this.mesh];
	return this.mesh;
}

Cloner.prototype.getLODMesh = function() {
	if(typeof(this.lod_mesh) === "string")
		return ResourcesManager.meshes[this.lod_mesh];
	return this.low_mesh;
}

Cloner.prototype.getResources = function(res)
{
	if(typeof(this.mesh) == "string")
		res[this.mesh] = Mesh;
	if(typeof(this.lod_mesh) == "string")
		res[this.lod_mesh] = Mesh;
	return res;
}

Cloner.generateTransformKey = function(count, hsize, offset)
{
	var key = new Float32Array(9);
	key.set(count);
	key.set(hsize,3);
	key.set(offset,6);
	return key;
}

Cloner.compareKeys = function(a,b)
{
	for(var i = 0; i < a.length; ++i)
		if(a[i] != b[i])
			return false;
	return true;
}


Cloner.prototype.onCollectInstances = function(e, instances)
{
	var mesh = this.getMesh();
	if(!mesh) return null;

	var node = this._root;
	if(!this._root) return;

	var total = this.count[0] * this.count[1] * this.count[2];
	if(!total) return;

	if(!this._RIs || this._RIs.length != total)
	{
		//create RIs
		if(!this._RIs)
			this._RIs = new Array(total);
		else
			this._RIs.length = total;

		for(var i = 0; i < total; ++i)
			if(!this._RIs[i])
				this._RIs[i] = new RenderInstance(this._root, this);
	}

	var RIs = this._RIs;
	var global = this._root.transform.getGlobalMatrix(mat4.create());
	var material = this.material || this._root.getMaterial();

	var hsize = vec3.scale( vec3.create(), this.size, 0.5 );
	var offset = [0,0,0];
	if(this.count[0] > 1) offset[0] = this.size[0] / (this.count[0]-1);
	else hsize[0] = 0;
	if(this.count[1] > 1) offset[1] = this.size[1] / (this.count[1]-1);
	else hsize[1] = 0;
	if(this.count[2] > 1) offset[2] = this.size[2] / (this.count[2]-1);
	else hsize[2] = 0;

	var flags = 0;

	/*
	var update_transform = true;
	var current_key = Cloner.generateTransformKey(this.count,hsize,offset);
	if( this._genereate_key && Cloner.compareKeys(current_key, this._genereate_key))
		update_transform = false;
	this._genereate_key = current_key;
	*/

	var start_array_pos = instances.length;
	instances.length = start_array_pos + total;

	var i = 0;
	var tmp = vec3.create(), zero = vec3.create();
	for(var x = 0; x < this.count[0]; ++x)
	for(var y = 0; y < this.count[1]; ++y)
	for(var z = 0; z < this.count[2]; ++z)
	{
		var RI = RIs[i];

		//genereate flags for the first instance
		if(i == 0)
		{
			RI.flags = RI_DEFAULT_FLAGS;
			RI.applyNodeFlags();
			flags = RI.flags;
		}
		else //for the rest just reuse the same as the first one
			RI.flags = flags;

		RI.setMesh(mesh);
		RI.material = material;

		tmp.set([x * offset[0] - hsize[0],y * offset[1] - hsize[1], z * offset[2] - hsize[2]]);
		mat4.translate( RI.matrix, global, tmp );
		mat4.multiplyVec3( RI.center, RI.matrix, zero );

		instances[start_array_pos + i] = RI;
		++i;
	}


	//return RI;
}

LS.registerComponent(Cloner);
LS.Cloner = Cloner;
/**
* Spherize deforms a mesh, it is an example of a component that modifies the meshes being rendered
* @class Spherize
* @constructor
* @param {String} object to configure from
*/

function Spherize(o)
{
	if(!this._uid)
		this._uid = LS.generateUId();

	this.radius = 10;
	this.center = vec3.create();
	this.factor = 0.5;

	this._uniforms_code = Spherize._uniforms_code.replaceAll({"@": this._uid});
	this._code = Spherize._code.replaceAll({"@": this._uid});
}

Spherize["@factor"] = { type: "number", step: 0.001 };

Spherize.icon = "mini-icon-rotator.png";

Spherize.prototype.onAddedToNode = function(node)
{
	LEvent.bind(node,"computingShaderMacros",this.onMacros,this);
	LEvent.bind(node,"computingShaderUniforms",this.onUniforms,this);
}


Spherize.prototype.onRemoveFromNode = function(node)
{
	LEvent.unbindAll(node,this);
}

Spherize._uniforms_code = "uniform vec3 u_spherize_center@; uniform float u_spherize_radius@; uniform float u_spherize_factor@;";
Spherize._code = "vec3 vn@ = normalize(vertex-u_spherize_center@); vertex4.xyz = mix(vertex4.xyz, vn@ * u_spherize_radius@, u_spherize_factor@); v_normal = (mix(v_normal, vn@, clamp(0.0,1.0,u_spherize_factor@)));";

Spherize.prototype.onMacros = function(e, macros)
{
	if(macros.USE_VERTEX_SHADER_UNIFORMS)
		macros.USE_VERTEX_SHADER_UNIFORMS += this._uniforms_code;
	else
		macros.USE_VERTEX_SHADER_UNIFORMS = this._uniforms_code;

	if(macros.USE_VERTEX_SHADER_CODE)
		macros.USE_VERTEX_SHADER_CODE += this._code;
	else
		macros.USE_VERTEX_SHADER_CODE = this._code;
}

Spherize.prototype.onUniforms = function(e, uniforms)
{
	uniforms["u_spherize_center" + this._uid ] = this.center;
	uniforms["u_spherize_radius" + this._uid ] = this.radius;
	uniforms["u_spherize_factor" + this._uid ] = this.factor;
}


LS.registerComponent(Spherize);
/**
* This component allow to integrate with Oculus Rift renderer
* @class OculusController
* @param {Object} o object with the serialized info
*/
function OculusController(o)
{
	this.enabled = true;
	this.eye_distance = 1;
	if(o)
		this.configure(o);
}

OculusController.rift_server_url = "http://tamats.com/uploads/RiftServer_0_3.zip";
OculusController.icon = "mini-icon-graph.png";

OculusController.prototype.onAddedToNode = function(node)
{
	LEvent.bind(Scene,"start", this.onStart, this );
	LEvent.bind(Scene,"stop", this.onStop, this );
	LEvent.bind(Scene,"beforeRender", this.onBeforeRender, this );
	LEvent.bind(Scene,"afterRender", this.onAfterRender, this );
	LEvent.bind(node, "collectCameras", this.onCollectCameras, this );
}

OculusController.prototype.onRemovedFromNode = function(node)
{
	LEvent.unbind(Scene,"start", this.onStart, this );
	LEvent.unbind(Scene,"stoo", this.onStop, this );
	LEvent.unbind(Scene,"beforeRender", this.onBeforeRender, this );
	LEvent.unbind(Scene,"afterRender", this.onAfterRender, this );
	LEvent.unbind(node, "collectCameras", this.onCollectCameras, this );
	Renderer.color_rendertarget = null;
}

OculusController.prototype.onCollectCameras = function(e, cameras)
{
	var main_camera = Renderer.main_camera;

	if(this._orientation)
		main_camera.setOrientation(this._orientation, true);

	var right_vector = main_camera.getLocalVector([ this.eye_distance * 0.5, 0, 0]);
	var left_vector = vec3.scale( vec3.create(), right_vector, -1);

	if(!this._left_camera)
	{
		this._left_camera = new LS.Camera();
		this._right_camera = new LS.Camera();
	}

	var main_info = main_camera.serialize();

	this._left_camera.configure(main_info);
	this._right_camera.configure(main_info);

	this._left_camera.eye = vec3.add(vec3.create(), main_camera.eye, left_vector);
	this._right_camera.eye = vec3.add(vec3.create(), main_camera.eye, right_vector);

	this._left_camera._viewport.set([0,0,0.5,1]);
	this._right_camera._viewport.set([0.5,0,0.5,1]);
	this._right_camera._ignore_clear = true;

	cameras.push( this._left_camera, this._right_camera );
}

OculusController.prototype.onStart = function(e)
{
	var ws = new WebSocket("ws://localhost:1981");
	ws.onopen = function()
	{
		console.log("OVR connection stablished");
	}

	ws.onmessage = this.onMessage.bind(this);

	ws.onclose = function()
	{
		console.log("OVR connection lost");
	}

	ws.onerror = function()
	{
		console.error("Oculus Server not found in your machine. To run an app using Oculus Rift you need to use a client side app, you can download it from: " + OculusController.rift_server_url );
	}

	this._ws = ws;
}

OculusController.prototype.onMessage = function(e)
{
	var data = e.data;
	data = JSON.parse("[" + data + "]");

	var q = quat.create();
	q.set( data );
	var q2 = quat.fromValues(-1,0,0,0);	quat.multiply(q,q2,q);
	this._orientation = q;

	Scene.refresh();
}

OculusController.prototype.onStop = function(e)
{
	if(this._ws)
	{
		this._ws.close();
		this._ws = null;
	}
}

OculusController.prototype.onBeforeRender = function(e,dt)
{
	var width = 1024;
	var height = 512;
	var v = gl.getParameter(gl.VIEWPORT);
	width = v[2];
	height = v[3];

	if(!this._color_texture || this._color_texture.width != width || this._color_texture.height != height)
	{
		this._color_texture = new GL.Texture(width,height,{ format: gl.RGB, filter: gl.LINEAR });
		ResourcesManager.textures[":ovr_color_buffer"] = this._color_texture;
	}

	if(this.enabled)
	{
		Renderer.color_rendertarget = this._color_texture;
	}
	else
	{
		Renderer.color_rendertarget = null;
	}

	//Renderer.disable_main_render
}


OculusController.prototype.onAfterRender = function(e,dt)
{
	if(this._color_texture)
		this._color_texture.toViewport();
}


LS.registerComponent(OculusController);
window.OculusController = OculusController;





if(typeof(LiteGraph) != "undefined")
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
		var node = this.getNode();
		/*
		var r = [];
		for(var i = 0; i < node._components.length; ++i)
		{
			var comp = node._components[i];
			var classname = getObjectClassName(comp);
			var vars = getObjectAttributes(comp);
			r.push([classname,vars]);
		}
		return r;
		*/

		var r = [["Transform","Transform"],["Material","Material"],["Mesh","Mesh"],["Enabled","boolean"]];
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
		var mat = this.getMaterial();
		if(!mat)
			return;

		//read inputs
		for(var i in this.inputs)
		{
			var input = this.inputs[i];
			var v = this.getInputData(i);
			if(v == undefined)
				continue;

			if(input.name == "Material")
				continue;

			mat.setProperty(input.name, v);

			/*
			switch( input.name )
			{
				case "Alpha": mat.alpha = v; break;
				case "Specular f.": mat.specular_factor = v; break;
				case "Diffuse": vec3.copy(mat.diffuse,v); break;
				case "Ambient": vec3.copy(mat.ambient,v); break;
				case "Emissive": vec3.copy(mat.emissive,v); break;
				case "UVs trans.": mat.uvs_matrix.set(v); break;
				default:
					if(input.name.substr(0,4) == "tex_")
					{
						var channel = input.name.substr(4);
						mat.setTexture(v, channel);
					}
					break;
			}
			*/
		}

		//write outputs
		for(var i in this.outputs)
		{
			var output = this.outputs[i];
			if(!output.links || !output.links.length)
				continue;
			var v = mat.getProperty( output.name );
			/*
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
			*/
			this.setOutputData( i, v );
		}

		//this.setOutputData(0, parseFloat( this.properties["value"] ) );
	}

	LGraphMaterial.prototype.getMaterial = function()
	{
		var node = this._node;
		if(	this.properties.node_id )
			node = Scene.getNode( this.properties.node_id );
		if(!node)
			node = this.graph._scenenode; //use the attached node

		if(!node) 
			return null;

		var mat = null;

		//if it has an input material, use that one
		var slot = this.findInputSlot("Material");
		if( slot != -1)
			return this.getInputData(slot);

		//otherwise return the node material
		return node.getMaterial();
	}

	LGraphMaterial.prototype.onGetInputs = function()
	{
		var mat = this.getMaterial();
		if(!mat) return;
		var o = mat.getProperties();
		var results = [["Material","Material"]];
		for(var i in o)
			results.push([i,o[i]]);
		return results;

		/*
		var results = [["Material","Material"],["Alpha","number"],["Specular f.","number"],["Diffuse","color"],["Ambient","color"],["Emissive","color"],["UVs trans.","texmatrix"]];
		for(var i in Material.TEXTURE_CHANNELS)
			results.push(["Tex." + Material.TEXTURE_CHANNELS[i],"Texture"]);
		return results;
		*/
	}

	LGraphMaterial.prototype.onGetOutputs = function()
	{
		var mat = this.getMaterial();
		if(!mat) return;
		var o = mat.getProperties();
		var results = [["Material","Material"]];
		for(var i in o)
			results.push([i,o[i]]);
		return results;

		/*
		var results = [["Material","Material"],["Alpha","number"],["Specular f.","number"],["Diffuse","color"],["Ambient","color"],["Emissive","color"],["UVs trans.","texmatrix"]];
		for(var i in Material.TEXTURE_CHANNELS)
			results.push(["Tex." + Material.TEXTURE_CHANNELS[i],"Texture"]);
		return results;
		*/
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
};
if(typeof(LiteGraph) != "undefined")
{
	function LGraphTexture()
	{
		this.addOutput("Texture","Texture");
		this.properties = {name:""};
		this.size = [LGraphTexture.image_preview_size, LGraphTexture.image_preview_size];
	}

	LGraphTexture.title = "Texture";
	LGraphTexture.desc = "Texture";
	LGraphTexture.widgets_info = {"name": { widget:"texture"} };

	LGraphTexture.textures_container = null; //where to seek for the textures
	LGraphTexture.loadTextureCallback = null; //function in charge of loading textures when not present in the container

	LGraphTexture.prototype.onExecute = function()
	{
		if(!this.properties.name)
			return;

		if(!ResourcesManager) return;

		var container = LGraphTexture.textures_container;
		if(!container && typeof(ResourcesManager) != "undefined")
			container = ResourcesManager.textures;
		if(!container)
			throw("Cannot load texture, container of textures not found");

		var tex = container[ this.properties.name ];
		if(!tex && this.properties.name[0] != ":")
		{
			if(!LGraphTexture.loadTextureCallback && typeof(ResourcesManager) != "undefined")
				LGraphTexture.loadTextureCallback = ResourcesManager.load.bind(ResourcesManager);

			var loader = LGraphTexture.loadTextureCallback;
			if(loader)
				loader( this.properties.name );
			return;
		}

		this._last_tex = tex;
		this.setOutputData(0, tex);
	}

	LGraphTexture.prototype.onDrawBackground = function(ctx)
	{
		if(!this.properties.name || this.flags.collapsed || this.size[1] <= 20)
			return;

		//Different texture? then get it from the GPU
		if(this._last_preview_tex != this._last_tex)
		{
			var tex_canvas = LGraphTexture.generateLowResTexturePreview(this._last_tex);
			if(!tex_canvas) return;

			this._last_preview_tex = this._last_tex;
			this._canvas = cloneCanvas(tex_canvas);
		}

		if(!this._canvas)
			return;

		//render to graph canvas
		ctx.save();
		if(1)
		{
			ctx.translate(0,this.size[1]);
			ctx.scale(1,-1);
		}
		ctx.drawImage(this._canvas,0,0,this.size[0],this.size[1]);
		ctx.restore();
	}


	LGraphTexture.image_preview_size = 256;
	LGraphTexture.generateLowResTexturePreview = function(tex)
	{
		if(!tex) return null;

		var size = LGraphTexture.image_preview_size;
		var temp_tex = tex;

		//Generate low-level version in the GPU to speed up
		if(tex.width > size || tex.height > size)
		{
			temp_tex = this._preview_temp_tex;
			if(!this._preview_temp_tex)
			{
				temp_tex = new GL.Texture(size,size, { minFilter: gl.NEAREST });
				this._preview_temp_tex = temp_tex;
			}

			//copy
			tex.copyTo(temp_tex);
			tex = temp_tex;
		}

		//create intermediate canvas with lowquality version
		var tex_canvas = this._preview_canvas;
		if(!tex_canvas)
		{
			tex_canvas = createCanvas(size,size);
			this._preview_canvas = tex_canvas;
		}

		if(temp_tex)
			temp_tex.toCanvas(tex_canvas);
		return tex_canvas;
	}

	LiteGraph.registerNodeType("texture/texture", LGraphTexture );
	window.LGraphTexture = LGraphTexture;

	//**************************************

	function LGraphTextureSave()
	{
		this.addInput("Texture","Texture");
		this.properties = {name:""};
	}

	LGraphTextureSave.title = "Save";
	LGraphTextureSave.desc = "Save a texture in the repository";

	LGraphTextureSave.prototype.onExecute = function()
	{
		if(!this.properties.name)
			return;

		var tex = this.getInputData(0);
		if(!tex) return;
			
		ResourcesManager.textures[ this.properties.name ] = tex;
	}

	LiteGraph.registerNodeType("texture/save", LGraphTextureSave );
	window.LGraphTextureSave = LGraphTextureSave;

	//****************************************************

	function LGraphTextureOperation()
	{
		this.addInput("Texture","Texture");
		this.addInput("TextureB","Texture");
		this.addInput("value","number");
		this.addOutput("Texture","Texture");
		this.help = "<p>pixelcode must be vec3</p>\
			<p>uvcode must be vec2, is optional</p>\
			<p><strong>uv:</strong> tex. coords</p><p><strong>color:</strong> texture</p><p><strong>colorB:</strong> textureB</p><p><strong>time:</strong> scene time</p><p><strong>value:</strong> input value</p>";

		this.properties = {value:1, uvcode:"", pixelcode:"color + colorB * value", low_precision: false };
	}

	LGraphTextureOperation.widgets_info = {"uvcode": { widget:"textarea", height: 100 }, "pixelcode": { widget:"textarea", height: 100 } };
	LGraphTextureOperation.title = "Operation";
	LGraphTextureOperation.desc = "Texture shader operation";

	LGraphTextureOperation.prototype.onExecute = function()
	{
		var tex = this.getInputData(0);
		var texB = this.getInputData(1);

		if(!this.properties.uvcode && !this.properties.pixelcode)
			return;

		var width = 512;
		var height = 512;
		var type = gl.UNSIGNED_BYTE;
		if(tex)
		{
			width = tex.width;
			height = tex.height;
			type = tex.type;
		}
		else if (texB)
		{
			width = texB.width;
			height = texB.height;
			type = texB.type;
		}

		if(this.properties.low_precision)
			type = gl.UNSIGNED_BYTE;

		if(!this._tex || this._tex.width != width || this._tex.height != height || this._tex.type != type )
			this._tex = new GL.Texture( width, height, { type: type, format: gl.RGBA, filter: gl.LINEAR });

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

		var shader = this._shader;

		if(!shader || this._shader_code != (uvcode + "|" + pixelcode) )
		{
			this._shader = new GL.Shader(LGraphTextureOperation.vertex_shader, LGraphTextureOperation.pixel_shader, { UV_CODE: uvcode, PIXEL_CODE: pixelcode });
			this._shader_code = (uvcode + "|" + pixelcode);
			shader = this._shader;
		}

		if(!shader)
		{
			this.boxcolor = "red";
			return;
		}
		else
			this.boxcolor = "green";

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
			var mesh = Mesh.getScreenQuad();
			shader.uniforms({texture:0, textureB:1, value: value, texSize:[width,height], time: Scene._global_time - Scene._start_time}).draw(mesh);
		});

		this.setOutputData(0, this._tex);
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

	LiteGraph.registerNodeType("texture/operation", LGraphTextureOperation );
	window.LGraphTextureOperation = LGraphTextureOperation;

	//****************************************************

	function LGraphTextureShader()
	{
		this.addOutput("Texture","Texture");
		this.properties = {code:"", width: 512, height: 512};

		this.properties.code = "\nvoid main() {\n  vec2 uv = coord;\n  vec3 color = vec3(0.0);\n//your code here\n\ngl_FragColor = vec4(color, 1.0);\n}\n";
		this.widgets_info = {"code": { widget:"textarea", height: 100 } };
	}

	LGraphTextureShader.title = "Shader";
	LGraphTextureShader.desc = "Texture shader";

	LGraphTextureShader.prototype.onExecute = function()
	{
		//replug 
		if(this._shader_code != this.properties.code)
		{
			this._shader_code = this.properties.code;
			this._shader = new GL.Shader(LGraphTextureShader.vertex_shader, LGraphTextureShader.pixel_shader + this.properties.code );
			if(!this._shader) {
				this.boxcolor = "red";
				return;
			}
			else
				this.boxcolor = "green";
			/*
			var uniforms = this._shader.uniformLocations;
			//disconnect inputs
			if(this.inputs)
				for(var i = 0; i < this.inputs.length; i++)
				{
					var slot = this.inputs[i];
					if(slot.link != null)
						this.disconnectInput(i);
				}

			for(var i = 0; i < uniforms.length; i++)
			{
				var type = "number";
				if( this._shader.isSampler[i] )
					type = "texture";
				else
				{
					var v = gl.getUniform(this._shader.program, i);
					type = typeof(v);
					if(type == "object" && v.length)
					{
						switch(v.length)
						{
							case 1: type = "number"; break;
							case 2: type = "vec2"; break;
							case 3: type = "vec3"; break;
							case 4: type = "vec4"; break;
							case 9: type = "mat3"; break;
							case 16: type = "mat4"; break;
							default: continue;
						}
					}
				}
				this.addInput(i,type);
			}
			*/
		}

		if(!this._tex || this._tex.width != this.properties.width || this._tex.height != this.properties.height )
			this._tex = new GL.Texture( this.properties.width, this.properties.height, { format: gl.RGBA, filter: gl.LINEAR });
		var tex = this._tex;
		var shader = this._shader;
		tex.drawTo(function()	{
			shader.uniforms({texSize: [tex.width, tex.height], time: Scene._global_time - Scene._start_time}).draw( Mesh.getScreenQuad() );
		});

		this.setOutputData(0, this._tex);
	}

	LGraphTextureShader.vertex_shader = "precision highp float;\n\
			attribute vec3 a_vertex;\n\
			attribute vec2 a_coord;\n\
			varying vec2 coord;\n\
			void main() {\n\
				coord = a_coord; gl_Position = vec4(coord * 2.0 - 1.0, 0.0, 1.0);\n\
			}\n\
			";

	LGraphTextureShader.pixel_shader = "precision highp float;\n\
			\n\
			varying vec2 coord;\n\
			uniform float time;\n\
			";

	LiteGraph.registerNodeType("texture/shader", LGraphTextureShader );
	window.LGraphTextureShader = LGraphTextureShader;

	//**************************
	function LGraphTexturePreview()
	{
		this.addInput("Texture","Texture");
		this.properties = { flipY: false };
		this.size = [LGraphTexture.image_preview_size, LGraphTexture.image_preview_size];
	}

	LGraphTexturePreview.title = "Preview";
	LGraphTexturePreview.desc = "Show a texture in the graph canvas";

	LGraphTexturePreview.prototype.onDrawBackground = function(ctx)
	{
		if(this.flags.collapsed) return;

		var tex = this.getInputData(0);
		if(!tex) return;

		var tex_canvas = LGraphTexture.generateLowResTexturePreview(tex);

		//render to graph canvas
		ctx.save();
		if(this.properties.flipY)
		{
			ctx.translate(0,this.size[1]);
			ctx.scale(1,-1);
		}
		ctx.drawImage(tex_canvas,0,0,this.size[0],this.size[1]);
		ctx.restore();
	}

	LiteGraph.registerNodeType("texture/preview", LGraphTexturePreview );
	window.LGraphTexturePreview = LGraphTexturePreview;

	// Texture to Viewport *****************************************
	function LGraphTextureToViewport()
	{
		this.addInput("Texture","Texture");
		this.properties = { additive: false, antialiasing: false };

		if(!LGraphTextureToViewport._shader)
			LGraphTextureToViewport._shader = new GL.Shader( LGraphTextureToViewport.vertex_shader, LGraphTextureToViewport.pixel_shader );
	}

	LGraphTextureToViewport.title = "to Viewport";
	LGraphTextureToViewport.desc = "Texture to viewport";

	LGraphTextureToViewport.prototype.onExecute = function()
	{
		var tex = this.getInputData(0);
		if(!tex) return;

		if(this.properties.additive)
		{
			gl.enable( gl.BLEND );
			gl.blendFunc( gl.SRC_ALPHA, gl.ONE );
		}
		else
			gl.disable( gl.BLEND );
		gl.disable( gl.DEPTH_TEST );
		if(this.properties.antialiasing)
		{
			var viewport = gl.getViewport(); //gl.getParameter(gl.VIEWPORT);
			if(tex)	tex.bind(0);
			var mesh = Mesh.getScreenQuad();
			LGraphTextureToViewport._shader.uniforms({texture:0, uViewportSize:[tex.width,tex.height], inverseVP: [1/tex.width,1/tex.height] }).draw(mesh);
		}
		else
			tex.toViewport();
	}

	LGraphTextureToViewport.vertex_shader = "precision highp float;\n\
			attribute vec3 a_vertex;\n\
			attribute vec2 a_coord;\n\
			varying vec2 v_coord;\n\
			void main() {\n\
				v_coord = a_coord; gl_Position = vec4(v_coord * 2.0 - 1.0, 0.0, 1.0);\n\
			}\n\
			";

	LGraphTextureToViewport.pixel_shader = "precision highp float;\n\
			precision highp float;\n\
			varying vec2 v_coord;\n\
			uniform sampler2D u_texture;\n\
			uniform vec2 uViewportSize;\n\
			uniform vec2 inverseVP;\n\
			#define FXAA_REDUCE_MIN   (1.0/ 128.0)\n\
			#define FXAA_REDUCE_MUL   (1.0 / 8.0)\n\
			#define FXAA_SPAN_MAX     8.0\n\
			\n\
			/* from mitsuhiko/webgl-meincraft based on the code on geeks3d.com */\n\
			vec4 applyFXAA(sampler2D tex, vec2 fragCoord)\n\
			{\n\
				vec4 color = vec4(0.0);\n\
				/*vec2 inverseVP = vec2(1.0 / uViewportSize.x, 1.0 / uViewportSize.y);*/\n\
				vec3 rgbNW = texture2D(tex, (fragCoord + vec2(-1.0, -1.0)) * inverseVP).xyz;\n\
				vec3 rgbNE = texture2D(tex, (fragCoord + vec2(1.0, -1.0)) * inverseVP).xyz;\n\
				vec3 rgbSW = texture2D(tex, (fragCoord + vec2(-1.0, 1.0)) * inverseVP).xyz;\n\
				vec3 rgbSE = texture2D(tex, (fragCoord + vec2(1.0, 1.0)) * inverseVP).xyz;\n\
				vec3 rgbM  = texture2D(tex, fragCoord  * inverseVP).xyz;\n\
				vec3 luma = vec3(0.299, 0.587, 0.114);\n\
				float lumaNW = dot(rgbNW, luma);\n\
				float lumaNE = dot(rgbNE, luma);\n\
				float lumaSW = dot(rgbSW, luma);\n\
				float lumaSE = dot(rgbSE, luma);\n\
				float lumaM  = dot(rgbM,  luma);\n\
				float lumaMin = min(lumaM, min(min(lumaNW, lumaNE), min(lumaSW, lumaSE)));\n\
				float lumaMax = max(lumaM, max(max(lumaNW, lumaNE), max(lumaSW, lumaSE)));\n\
				\n\
				vec2 dir;\n\
				dir.x = -((lumaNW + lumaNE) - (lumaSW + lumaSE));\n\
				dir.y =  ((lumaNW + lumaSW) - (lumaNE + lumaSE));\n\
				\n\
				float dirReduce = max((lumaNW + lumaNE + lumaSW + lumaSE) * (0.25 * FXAA_REDUCE_MUL), FXAA_REDUCE_MIN);\n\
				\n\
				float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);\n\
				dir = min(vec2(FXAA_SPAN_MAX, FXAA_SPAN_MAX), max(vec2(-FXAA_SPAN_MAX, -FXAA_SPAN_MAX), dir * rcpDirMin)) * inverseVP;\n\
				\n\
				vec3 rgbA = 0.5 * (texture2D(tex, fragCoord * inverseVP + dir * (1.0 / 3.0 - 0.5)).xyz + \n\
					texture2D(tex, fragCoord * inverseVP + dir * (2.0 / 3.0 - 0.5)).xyz);\n\
				vec3 rgbB = rgbA * 0.5 + 0.25 * (texture2D(tex, fragCoord * inverseVP + dir * -0.5).xyz + \n\
					texture2D(tex, fragCoord * inverseVP + dir * 0.5).xyz);\n\
				\n\
				return vec4(rgbA,1.0);\n\
				float lumaB = dot(rgbB, luma);\n\
				if ((lumaB < lumaMin) || (lumaB > lumaMax))\n\
					color = vec4(rgbA, 1.0);\n\
				else\n\
					color = vec4(rgbB, 1.0);\n\
				return color;\n\
			}\n\
			\n\
			void main() {\n\
			   gl_FragColor = applyFXAA( u_texture, v_coord * uViewportSize) ;\n\
			}\n\
			";


	LiteGraph.registerNodeType("texture/toviewport", LGraphTextureToViewport );
	window.LGraphTextureToViewport = LGraphTextureToViewport;


	// Texture Copy *****************************************
	function LGraphTextureCopy()
	{
		this.addInput("Texture","Texture");
		this.addOutput("","Texture");
		this.properties = { size: 0, low_precision: false, generate_mipmaps: false };
	}

	LGraphTextureCopy.title = "Copy";
	LGraphTextureCopy.desc = "Copy Texture";
	LGraphTextureCopy.widgets_info = { size: { widget:"combo", values:[0,32,64,128,256,512,1024,2048]} };

	LGraphTextureCopy.prototype.onExecute = function()
	{
		var tex = this.getInputData(0);
		if(!tex) return;

		var width = tex.width;
		var height = tex.height;

		if(this.properties.size != 0)
		{
			width = this.properties.size;
			height = this.properties.size;
		}

		var temp = this._temp_texture;
		var type = this.properties.low_precision ? gl.UNSIGNED_BYTE : tex.type;
		if(!temp || temp.width != width || temp.height != height || temp.type != type )
		{
			var minFilter = gl.LINEAR;
			if( this.properties.generate_mipmaps && isPowerOfTwo(width) && isPowerOfTwo(height) )
				minFilter = gl.LINEAR_MIPMAP_LINEAR;
			this._temp_texture = new GL.Texture( width, height, { type: type, format: gl.RGBA, minFilter: minFilter, magFilter: gl.LINEAR });
		}
		tex.copyTo(this._temp_texture);

		if(this.properties.generate_mipmaps)
		{
			this._temp_texture.bind(0);
			gl.generateMipmap(this._temp_texture.texture_type);
			this._temp_texture.unbind(0);
		}


		this.setOutputData(0,this._temp_texture);
	}

	LiteGraph.registerNodeType("texture/copy", LGraphTextureCopy );
	window.LGraphTextureCopy = LGraphTextureCopy;


	// Texture Copy *****************************************
	function LGraphTextureAverage()
	{
		this.addInput("Texture","Texture");
		this.addOutput("","Texture");
		this.properties = { low_precision: false };
	}

	LGraphTextureAverage.title = "Average";
	LGraphTextureAverage.desc = "Compute average of a texture and stores it as a texture";

	LGraphTextureAverage.prototype.onExecute = function()
	{
		var tex = this.getInputData(0);
		if(!tex) return;

		if(!LGraphTextureAverage._shader)
		{
			LGraphTextureAverage._shader = new GL.Shader(LGraphTextureAverage.vertex_shader, LGraphTextureAverage.pixel_shader);
			var samples = new Float32Array(32);
			for(var i = 0; i < 32; ++i)	
				samples[i] = Math.random();
			LGraphTextureAverage._shader.uniforms({u_samples_a: samples.subarray(0,16), u_samples_b: samples.subarray(16,32) });
		}

		var temp = this._temp_texture;
		var type = this.properties.low_precision ? gl.UNSIGNED_BYTE : tex.type;
		if(!temp || temp.type != type )
			this._temp_texture = new GL.Texture( 1, 1, { type: type, format: gl.RGBA, filter: gl.NEAREST });

		var shader = LGraphTextureAverage._shader;
		this._temp_texture.drawTo(function(){
			tex.toViewport(shader,{u_texture:0});
		});

		this.setOutputData(0,this._temp_texture);
	}

	LGraphTextureAverage.vertex_shader = "precision highp float;\n\
			attribute vec3 a_vertex;\n\
			attribute vec2 a_coord;\n\
			void main() {\n\
				gl_Position = vec4(a_coord * 2.0 - 1.0, 0.0, 1.0);\n\
			}\n\
			";

	LGraphTextureAverage.pixel_shader = "precision highp float;\n\
			precision highp float;\n\
			uniform mat4 u_samples_a;\n\
			uniform mat4 u_samples_b;\n\
			uniform sampler2D u_texture;\n\
			\n\
			void main() {\n\
				vec4 color = vec4(0.0);\n\
				for(int i = 0; i < 4; ++i)\n\
					for(int j = 0; j < 4; ++j)\n\
					{\n\
						color += texture2D(u_texture, vec2( u_samples_a[i][j], u_samples_b[i][j] ) );\n\
						color += texture2D(u_texture, vec2( 1.0 - u_samples_a[i][j], u_samples_b[i][j] ) );\n\
					}\n\
			   gl_FragColor = color * 0.03125;\n\
			}\n\
			";

	LiteGraph.registerNodeType("texture/average", LGraphTextureAverage );
	window.LGraphTextureAverage = LGraphTextureAverage;

	// Image To Texture *****************************************
	function LGraphImageToTexture()
	{
		this.addInput("Image","image");
		this.addOutput("","Texture");
		this.properties = {};
	}

	LGraphImageToTexture.title = "Image to Texture";
	LGraphImageToTexture.desc = "Uploads an image to the GPU";
	//LGraphImageToTexture.widgets_info = { size: { widget:"combo", values:[0,32,64,128,256,512,1024,2048]} };

	LGraphImageToTexture.prototype.onExecute = function()
	{
		var img = this.getInputData(0);
		if(!img) return;

		var width = img.videoWidth || img.width;
		var height = img.videoHeight || img.height;

		var temp = this._temp_texture;
		if(!temp || temp.width != width || temp.height != height )
			this._temp_texture = new GL.Texture( width, height, { format: gl.RGBA, filter: gl.LINEAR });

		try
		{
			this._temp_texture.uploadImage(img);
		}
		catch(err)
		{
			console.error("image comes from an unsafe location, cannot be uploaded to webgl");
			return;
		}

		this.setOutputData(0,this._temp_texture);
	}

	LiteGraph.registerNodeType("texture/imageToTexture", LGraphImageToTexture );
	window.LGraphImageToTexture = LGraphImageToTexture;	


	// Texture LUT *****************************************
	function LGraphTextureLUT()
	{
		this.addInput("Texture","Texture");
		this.addInput("LUT","Texture");
		this.addInput("Intensity","number");
		this.addOutput("","Texture");
		this.properties = { intensity: 1 };

		if(!LGraphTextureLUT._shader)
			LGraphTextureLUT._shader = new GL.Shader( LGraphTextureLUT.vertex_shader, LGraphTextureLUT.pixel_shader );
	}

	LGraphTextureLUT.title = "LUT";
	LGraphTextureLUT.desc = "Apply LUT to Texture";

	LGraphTextureLUT.prototype.onExecute = function()
	{
		var tex = this.getInputData(0);
		if(!tex) return;

		var lut_tex = this.getInputData(1);
		if(!lut_tex)
		{
			this.setOutputData(0,tex);
			return;
		}
		lut_tex.bind(0);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR );
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE );
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE );
		gl.bindTexture(gl.TEXTURE_2D, null);

		var intensity = this.properties.intensity;
		if( this.isInputConnected(2) )
			this.properties.intensity = intensity = this.getInputData(2);

		var width = tex.width;
		var height = tex.height;
		var temp = this._temp_texture;
		if(!temp || temp.width != width || temp.height != height) //type is always UNSIGNED_BYTE
			this._temp_texture = new GL.Texture( width, height, { format: gl.RGBA, filter: gl.LINEAR });

		var mesh = Mesh.getScreenQuad();

		this._temp_texture.drawTo(function() {
			tex.bind(0);
			lut_tex.bind(1);
			LGraphTextureLUT._shader.uniforms({texture:0, textureB:1, u_amount: intensity, uViewportSize:[tex.width,tex.height]}).draw(mesh);
		});

		this.setOutputData(0,this._temp_texture);
	}

	LGraphTextureLUT.vertex_shader = "precision highp float;\n\
			attribute vec3 a_vertex;\n\
			attribute vec2 a_coord;\n\
			varying vec2 coord;\n\
			void main() {\n\
				coord = a_coord; gl_Position = vec4(a_coord * 2.0 - 1.0, 0.0, 1.0);\n\
			}\n\
			";

	LGraphTextureLUT.pixel_shader = "precision highp float;\n\
			precision highp float;\n\
			varying vec2 coord;\n\
			uniform sampler2D texture;\n\
			uniform sampler2D textureB;\n\
			uniform float u_amount;\n\
			\n\
			void main() {\n\
				 lowp vec4 textureColor = clamp( texture2D(texture, coord), vec4(0.0), vec4(1.0) );\n\
				 mediump float blueColor = textureColor.b * 63.0;\n\
				 mediump vec2 quad1;\n\
				 quad1.y = floor(floor(blueColor) / 8.0);\n\
				 quad1.x = floor(blueColor) - (quad1.y * 8.0);\n\
				 mediump vec2 quad2;\n\
				 quad2.y = floor(ceil(blueColor) / 8.0);\n\
				 quad2.x = ceil(blueColor) - (quad2.y * 8.0);\n\
				 highp vec2 texPos1;\n\
				 texPos1.x = (quad1.x * 0.125) + 0.5/512.0 + ((0.125 - 1.0/512.0) * textureColor.r);\n\
				 texPos1.y = 1.0 - ((quad1.y * 0.125) + 0.5/512.0 + ((0.125 - 1.0/512.0) * textureColor.g));\n\
				 highp vec2 texPos2;\n\
				 texPos2.x = (quad2.x * 0.125) + 0.5/512.0 + ((0.125 - 1.0/512.0) * textureColor.r);\n\
				 texPos2.y = 1.0 - ((quad2.y * 0.125) + 0.5/512.0 + ((0.125 - 1.0/512.0) * textureColor.g));\n\
				 lowp vec4 newColor1 = texture2D(textureB, texPos1);\n\
				 lowp vec4 newColor2 = texture2D(textureB, texPos2);\n\
				 lowp vec4 newColor = mix(newColor1, newColor2, fract(blueColor));\n\
				 gl_FragColor = vec4( mix( textureColor.rgb, newColor.rgb, u_amount), textureColor.w);\n\
			}\n\
			";

	LiteGraph.registerNodeType("texture/LUT", LGraphTextureLUT );
	window.LGraphTextureLUT = LGraphTextureLUT;

	// Texture Mix *****************************************
	function LGraphTextureChannels()
	{
		this.addInput("Texture","Texture");

		this.addOutput("R","Texture");
		this.addOutput("G","Texture");
		this.addOutput("B","Texture");
		this.addOutput("A","Texture");

		this.properties = {};
		if(!LGraphTextureChannels._shader)
			LGraphTextureChannels._shader = new GL.Shader( LGraphTextureChannels.vertex_shader, LGraphTextureChannels.pixel_shader );
	}

	LGraphTextureChannels.title = "Channels";
	LGraphTextureChannels.desc = "Split texture channels";

	LGraphTextureChannels.prototype.onExecute = function()
	{
		var texA = this.getInputData(0);
		if(!texA) return;

		if(!this._channels)
			this._channels = Array(4);

		var connections = 0;
		for(var i = 0; i < 4; i++)
		{
			if(this.isOutputConnected(i))
			{
				if(!this._channels[i] || this._channels[i].width != texA.width || this._channels[i].height != texA.height || this._channels[i].type != texA.type)
					this._channels[i] = new GL.Texture( texA.width, texA.height, { type: texA.type, format: gl.RGBA, filter: gl.LINEAR });
				connections++;
			}
			else
				this._channels[i] = null;
		}

		if(!connections)
			return;

		gl.disable( gl.BLEND );
		gl.disable( gl.DEPTH_TEST );

		var mesh = Mesh.getScreenQuad();
		var shader = LGraphTextureChannels._shader;
		var masks = [[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]];

		for(var i = 0; i < 4; i++)
		{
			if(!this._channels[i])
				continue;

			this._channels[i].drawTo( function() {
				texA.bind(0);
				shader.uniforms({u_texture:0, u_mask: masks[i]}).draw(mesh);
			});
			this.setOutputData(i, this._channels[i]);
		}
	}

	LGraphTextureChannels.vertex_shader = "precision highp float;\n\
			attribute vec3 a_vertex;\n\
			attribute vec2 a_coord;\n\
			varying vec2 v_coord;\n\
			void main() {\n\
				v_coord = a_coord; gl_Position = vec4(v_coord * 2.0 - 1.0, 0.0, 1.0);\n\
			}\n\
			";

	LGraphTextureChannels.pixel_shader = "precision highp float;\n\
			precision highp float;\n\
			varying vec2 v_coord;\n\
			uniform sampler2D u_texture;\n\
			uniform vec4 u_mask;\n\
			\n\
			void main() {\n\
			   gl_FragColor = vec4( vec3( length( texture2D(u_texture, v_coord) * u_mask )), 1.0 );\n\
			}\n\
			";

	LiteGraph.registerNodeType("texture/channels", LGraphTextureChannels );
	window.LGraphTextureChannels = LGraphTextureChannels;

	// Texture Mix *****************************************
	function LGraphTextureMix()
	{
		this.addInput("A","Texture");
		this.addInput("B","Texture");
		this.addInput("Mixer","Texture");

		this.addOutput("Texture","Texture");
		this.properties = {};

		if(!LGraphTextureMix._shader)
			LGraphTextureMix._shader = new GL.Shader( LGraphTextureMix.vertex_shader, LGraphTextureMix.pixel_shader );
	}

	LGraphTextureMix.title = "Mix";
	LGraphTextureMix.desc = "Generates a texture mixing two textures";

	LGraphTextureMix.prototype.onExecute = function()
	{
		var texA = this.getInputData(0);
		var texB = this.getInputData(1);
		var texMix = this.getInputData(2);
		if(!texA || !texB || !texMix) return;

		if(!this._temp_texture || this._temp_texture.width != texA.width || this._temp_texture.height != texA.height || this._temp_texture.type != texA.type)
			this._temp_texture = new GL.Texture( texA.width, texA.height, { type: texA.type, format: gl.RGBA, filter: gl.LINEAR });

		gl.disable( gl.BLEND );
		gl.disable( gl.DEPTH_TEST );

		var mesh = Mesh.getScreenQuad();
		var shader = LGraphTextureMix._shader;

		this._temp_texture.drawTo( function() {
			texA.bind(0);
			texB.bind(1);
			texMix.bind(2);
			shader.uniforms({u_textureA:0,u_textureB:1,u_textureMix:2}).draw(mesh);
		});

		this.setOutputData(0, this._temp_texture);
	}

	LGraphTextureMix.vertex_shader = "precision highp float;\n\
			attribute vec3 a_vertex;\n\
			attribute vec2 a_coord;\n\
			varying vec2 v_coord;\n\
			void main() {\n\
				v_coord = a_coord; gl_Position = vec4(v_coord * 2.0 - 1.0, 0.0, 1.0);\n\
			}\n\
			";

	LGraphTextureMix.pixel_shader = "precision highp float;\n\
			precision highp float;\n\
			varying vec2 v_coord;\n\
			uniform sampler2D u_textureA;\n\
			uniform sampler2D u_textureB;\n\
			uniform sampler2D u_textureMix;\n\
			\n\
			void main() {\n\
			   gl_FragColor = mix( texture2D(u_textureA, v_coord), texture2D(u_textureB, v_coord), texture2D(u_textureMix, v_coord) );\n\
			}\n\
			";

	LiteGraph.registerNodeType("texture/mix", LGraphTextureMix );
	window.LGraphTextureMix = LGraphTextureMix;

	// Texture Edges detection *****************************************
	function LGraphTextureEdges()
	{
		this.addInput("Tex.","Texture");

		this.addOutput("Edges","Texture");
		this.properties = { invert: true, low_precision: false };

		if(!LGraphTextureEdges._shader)
			LGraphTextureEdges._shader = new GL.Shader( LGraphTextureEdges.vertex_shader, LGraphTextureEdges.pixel_shader );
	}

	LGraphTextureEdges.title = "Edges";
	LGraphTextureEdges.desc = "Detects edges";

	LGraphTextureEdges.prototype.onExecute = function()
	{
		var tex = this.getInputData(0);
		if(!tex) return;

		var type = tex.type;
		if(this.properties.low_precision)
			type = gl.UNSIGNED_BYTE;

		if(!this._temp_texture || this._temp_texture.width != tex.width || this._temp_texture.height != tex.height || this._temp_texture.type != type)
			this._temp_texture = new GL.Texture( tex.width, tex.height, { type: type, format: gl.RGBA, filter: gl.LINEAR });

		gl.disable( gl.BLEND );
		gl.disable( gl.DEPTH_TEST );

		var mesh = Mesh.getScreenQuad();
		var shader = LGraphTextureEdges._shader;
		var invert = this.properties.invert;

		this._temp_texture.drawTo( function() {
			tex.bind(0);
			shader.uniforms({u_texture:0, u_isize:[1/tex.width,1/tex.height], u_invert: invert ? 1 : 0}).draw(mesh);
		});

		this.setOutputData(0, this._temp_texture);
	}

	LGraphTextureEdges.vertex_shader = "precision highp float;\n\
			attribute vec3 a_vertex;\n\
			attribute vec2 a_coord;\n\
			varying vec2 v_coord;\n\
			void main() {\n\
				v_coord = a_coord; gl_Position = vec4(v_coord * 2.0 - 1.0, 0.0, 1.0);\n\
			}\n\
			";

	LGraphTextureEdges.pixel_shader = "precision highp float;\n\
			precision highp float;\n\
			varying vec2 v_coord;\n\
			uniform sampler2D u_texture;\n\
			uniform vec2 u_isize;\n\
			uniform int u_invert;\n\
			\n\
			void main() {\n\
				vec4 center = texture2D(u_texture, v_coord);\n\
				vec4 up = texture2D(u_texture, v_coord + u_isize * vec2(0.0,1.0) );\n\
				vec4 down = texture2D(u_texture, v_coord + u_isize * vec2(0.0,-1.0) );\n\
				vec4 left = texture2D(u_texture, v_coord + u_isize * vec2(1.0,0.0) );\n\
				vec4 right = texture2D(u_texture, v_coord + u_isize * vec2(-1.0,0.0) );\n\
				vec4 diff = abs(center - up) + abs(center - down) + abs(center - left) + abs(center - right);\n\
				if(u_invert == 1)\n\
					diff = vec4(1.0) - diff;\n\
			   gl_FragColor = diff;\n\
			}\n\
			";

	LiteGraph.registerNodeType("texture/edges", LGraphTextureEdges );
	window.LGraphTextureEdges = LGraphTextureEdges;

	// Texture Depth *****************************************
	function LGraphTextureDepthRange()
	{
		this.addInput("Texture","Texture");
		this.addInput("Distance","number");
		this.addInput("Range","number");
		this.addOutput("Texture","Texture");
		this.properties = { distance:100, range: 50, high_precision: false };

		if(!LGraphTextureDepthRange._shader)
			LGraphTextureDepthRange._shader = new GL.Shader( LGraphTextureDepthRange.vertex_shader, LGraphTextureDepthRange.pixel_shader );
	}

	LGraphTextureDepthRange.title = "Depth Range";
	LGraphTextureDepthRange.desc = "Generates a texture with a depth range";

	LGraphTextureDepthRange.prototype.onExecute = function()
	{
		var tex = this.getInputData(0);
		if(!tex) return;

		var precision = gl.UNSIGNED_BYTE;
		if(this.properties.high_precision)
			precision = gl.half_float_ext ? gl.HALF_FLOAT_OES : gl.FLOAT;			

		if(!this._temp_texture || this._temp_texture.type != precision ||
			this._temp_texture.width != tex.width || this._temp_texture.height != tex.height)
			this._temp_texture = new GL.Texture( tex.width, tex.height, { type: precision, format: gl.RGBA, filter: gl.LINEAR });

		//iterations
		var distance = this.properties.distance;
		if( this.isInputConnected(1) )
		{
			distance = this.getInputData(1);
			this.properties.distance = distance;
		}

		var range = this.properties.range;
		if( this.isInputConnected(2) )
		{
			range = this.getInputData(2);
			this.properties.range = range;
		}

		gl.disable( gl.BLEND );
		gl.disable( gl.DEPTH_TEST );
		var mesh = Mesh.getScreenQuad();
		var shader = LGraphTextureDepthRange._shader;
		var camera = Renderer._current_camera;

		this._temp_texture.drawTo( function() {
			tex.bind(0);
			shader.uniforms({texture:0, u_distance: distance, u_range: range, u_camera_planes: [Renderer._current_camera.near,Renderer._current_camera.far] })
				.draw(mesh);
		});

		this.setOutputData(0, this._temp_texture);
	}

	LGraphTextureDepthRange.vertex_shader = "precision highp float;\n\
			attribute vec3 a_vertex;\n\
			attribute vec2 a_coord;\n\
			varying vec2 v_coord;\n\
			void main() {\n\
				v_coord = a_coord; gl_Position = vec4(v_coord * 2.0 - 1.0, 0.0, 1.0);\n\
			}\n\
			";

	LGraphTextureDepthRange.pixel_shader = "precision highp float;\n\
			precision highp float;\n\
			varying vec2 v_coord;\n\
			uniform sampler2D u_texture;\n\
			uniform vec2 u_camera_planes;\n\
			uniform float u_distance;\n\
			uniform float u_range;\n\
			\n\
			float LinearDepth()\n\
			{\n\
				float n = u_camera_planes.x;\n\
				float f = u_camera_planes.y;\n\
				return (2.0 * n) / (f + n - texture2D(u_texture, v_coord).x * (f - n));\n\
			}\n\
			\n\
			void main() {\n\
				float diff = abs(LinearDepth() * u_camera_planes.y - u_distance);\n\
				float dof = 1.0;\n\
				if(diff <= u_range)\n\
					dof = diff / u_range;\n\
			   gl_FragColor = vec4(dof);\n\
			}\n\
			";

	LiteGraph.registerNodeType("texture/depth_range", LGraphTextureDepthRange );
	window.LGraphTextureDepthRange = LGraphTextureDepthRange;

	// Texture Blur *****************************************
	function LGraphTextureBlur()
	{
		this.addInput("Texture","Texture");
		this.addInput("Iterations","number");
		this.addInput("Intensity","number");
		this.addOutput("Blurred","Texture");
		this.properties = { intensity: 1, iterations: 1, preserve_aspect: false, scale:[1,1] };

		if(!LGraphTextureBlur._shader)
			LGraphTextureBlur._shader = new GL.Shader( LGraphTextureBlur.vertex_shader, LGraphTextureBlur.pixel_shader );
	}

	LGraphTextureBlur.title = "Blur";
	LGraphTextureBlur.desc = "Blur a texture";

	LGraphTextureBlur.prototype.onExecute = function()
	{
		var tex = this.getInputData(0);
		if(!tex) return;

		var temp = this._temp_texture;

		if(!temp || temp.width != tex.width || temp.height != tex.height || temp.type != tex.type )
		{
			//we need two textures to do the blurring
			this._temp_texture = new GL.Texture( tex.width, tex.height, { type: tex.type, format: gl.RGBA, filter: gl.LINEAR });
			this._final_texture = new GL.Texture( tex.width, tex.height, { type: tex.type, format: gl.RGBA, filter: gl.LINEAR });
		}

		//iterations
		var iterations = this.properties.iterations;
		if( this.isInputConnected(1) )
		{
			iterations = this.getInputData(1);
			this.properties.iterations = iterations;
		}
		iterations = Math.floor(iterations);
		if(iterations == 0) //skip blurring
		{
			this.setOutputData(0, tex);
			return;
		}

		var intensity = this.properties.intensity;
		if( this.isInputConnected(2) )
		{
			intensity = this.getInputData(2);
			this.properties.intensity = intensity;
		}

		gl.disable( gl.BLEND );
		gl.disable( gl.DEPTH_TEST );
		var mesh = Mesh.getScreenQuad();
		var shader = LGraphTextureBlur._shader;
		var scale = this.properties.scale || [1,1];

		//iterate
		var start_texture = tex;
		var aspect = this.properties.preserve_aspect ? Renderer._current_camera.aspect : 1;
		for(var i = 0; i < iterations; ++i)
		{
			this._temp_texture.drawTo( function() {
				start_texture.bind(0);
				shader.uniforms({texture:0, u_intensity: 1, u_offset: [0, aspect/start_texture.height * scale[1] ] })
					.draw(mesh);
			});

			this._temp_texture.bind(0);
			this._final_texture.drawTo( function() {
				shader.uniforms({texture:0, u_intensity: intensity, u_offset: [1/start_texture.width * scale[0], 0] })
					.draw(mesh);
			});
			start_texture = this._final_texture;
		}
		
		this.setOutputData(0, this._final_texture);
	}

	LGraphTextureBlur.vertex_shader = "precision highp float;\n\
			attribute vec3 a_vertex;\n\
			attribute vec2 a_coord;\n\
			varying vec2 v_coord;\n\
			void main() {\n\
				v_coord = a_coord; gl_Position = vec4(v_coord * 2.0 - 1.0, 0.0, 1.0);\n\
			}\n\
			";

	LGraphTextureBlur.pixel_shader = "precision highp float;\n\
			precision highp float;\n\
			varying vec2 v_coord;\n\
			uniform sampler2D u_texture;\n\
			uniform vec2 u_offset;\n\
			uniform float u_intensity;\n\
			void main() {\n\
			   vec4 sum = vec4(0.0);\n\
			   sum += texture2D(u_texture, v_coord + u_offset * -4.0) * 0.05/0.98;\n\
			   sum += texture2D(u_texture, v_coord + u_offset * -3.0) * 0.09/0.98;\n\
			   sum += texture2D(u_texture, v_coord + u_offset * -2.0) * 0.12/0.98;\n\
			   sum += texture2D(u_texture, v_coord + u_offset * -1.0) * 0.15/0.98;\n\
			   sum += texture2D(u_texture, v_coord) * 0.16/0.98;\n\
			   sum += texture2D(u_texture, v_coord + u_offset * 4.0) * 0.05/0.98;\n\
			   sum += texture2D(u_texture, v_coord + u_offset * 3.0) * 0.09/0.98;\n\
			   sum += texture2D(u_texture, v_coord + u_offset * 2.0) * 0.12/0.98;\n\
			   sum += texture2D(u_texture, v_coord + u_offset * 1.0) * 0.15/0.98;\n\
			   gl_FragColor = u_intensity * sum;\n\
			}\n\
			";

	LiteGraph.registerNodeType("texture/blur", LGraphTextureBlur );
	window.LGraphTextureBlur = LGraphTextureBlur;

	// Texture Webcam *****************************************
	function LGraphTextureWebcam()
	{
		this.addOutput("Webcam","Texture");
		this.properties = {};
	}

	LGraphTextureWebcam.title = "Webcam";
	LGraphTextureWebcam.desc = "Webcam texture";


	LGraphTextureWebcam.prototype.openStream = function()
	{
		//Vendor prefixes hell
		navigator.getUserMedia = (navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia);
		window.URL = window.URL || window.webkitURL;

		if (!navigator.getUserMedia) {
		  //console.log('getUserMedia() is not supported in your browser, use chrome and enable WebRTC from about://flags');
		  return;
		}

		this._waiting_confirmation = true;

		// Not showing vendor prefixes.
		navigator.getUserMedia({video: true}, this.streamReady.bind(this), onFailSoHard);		

		var that = this;
		function onFailSoHard(e) {
			trace('Webcam rejected', e);
			that._webcam_stream = false;
			that.box_color = "red";
		};
	}

	LGraphTextureWebcam.prototype.streamReady = function(localMediaStream)
	{
		this._webcam_stream = localMediaStream;
		//this._waiting_confirmation = false;

	    var video = this._video;
		if(!video)
		{
			video = document.createElement("video");
			video.autoplay = true;
		    video.src = window.URL.createObjectURL(localMediaStream);
			this._video = video;
			//document.body.appendChild( video ); //debug
			//when video info is loaded (size and so)
			video.onloadedmetadata = function(e) {
				// Ready to go. Do some stuff.
				console.log(e);
			};
		}


	},

	LGraphTextureWebcam.prototype.onExecute = function()
	{
		if(this._webcam_stream == null && !this._waiting_confirmation)
			this.openStream();

		if(!this._video || !this._video.videoWidth) return;

		var width = this._video.videoWidth;
		var height = this._video.videoHeight;

		var temp = this._temp_texture;
		if(!temp || temp.width != width || temp.height != height )
			this._temp_texture = new GL.Texture( width, height, { format: gl.RGB, filter: gl.LINEAR });

		this._temp_texture.uploadImage( this._video );
		this.setOutputData(0,this._temp_texture);
	}

	LiteGraph.registerNodeType("texture/webcam", LGraphTextureWebcam );
	window.LGraphTextureWebcam = LGraphTextureWebcam;
} //LiteGraph defined
/** RenderOptions contains info about how to render the FULL scene (not just a render pass)
* It is used to store info about which passes should be applied, and what actions performed
* It could occasionally contain info about the current pass
* it should not be associated with an scene (the same RenderOptions could be used with different scenes)
* @class RenderOptions
* @constructor
**/

function RenderOptions(o)
{
	//this.renderer = null; //which renderer is in use

	//info
	this.main_camera = null; //this camera is the primary camera, some actions require to know the primary user point of view
	this.current_camera = null; //this camera is the one being rendered at this moment
	this.current_pass = null; //name of the current pass ("color","shadow","depth","picking")
	this.current_renderer = null; //current renderer being used

	//rendering properties
	this.ignore_viewports = false;
	this.ignore_clear = false;

	this.force_wireframe = false;	//render everything in wireframe
	this.shadows_disabled = false; //no shadows on the render
	this.lights_disabled = false; //flat lighting
	this.low_quality = false;	//try to use low quality shaders

	this.update_shadowmaps = true; //automatically update shadowmaps in every frame (enable if there are dynamic objects)
	this.update_materials = true; //update info in materials in every frame
	this.render_all_cameras = true; //render secundary cameras too
	this.render_fx = true; //postprocessing fx

	this.sort_instances_by_distance = true;
	this.sort_instances_by_priority = true;
	this.z_pass = false; //enable when the shaders are too complex (normalmaps, etc) to reduce work of the GPU (still some features missing)
	this.frustum_culling = true;

	//this should change one day...
	this.default_shader_id = "global";
	this.default_low_shader_id = "lowglobal";

	//copy
	if(o)
		for(var i in o)
			this[i] = o[i];
}
/**
* RenderInstance contains info of one object to be rendered on the scene.
*
* @class RenderInstance
* @namespace LS
* @constructor
*/

//Flags to control rendering states
//0-7: render state flags
var RI_CULL_FACE =			1;		//for two sided
var RI_CW =					1 << 1; //reverse normals
var RI_DEPTH_TEST =			1 << 2; //use depth test
var RI_DEPTH_WRITE = 		1 << 3; //write in the depth buffer
var RI_ALPHA_TEST =			1 << 4; //do alpha test
var RI_BLEND = 				1 << 5; //use blend function

//8-16: rendering pipeline flags
var RI_CAST_SHADOWS = 		1 << 8;	//render in shadowmaps
var RI_RECEIVE_SHADOWS =	1 << 9;	//receive shadowmaps
var RI_IGNORE_LIGHTS = 		1 << 10;//render without taking into account light info
var RI_IGNORE_FRUSTUM = 	1 << 11;//render even when outside of frustum 
var RI_RENDER_2D = 			1 << 12;//render in screen space using the position projection (similar to billboard)
var RI_IGNORE_VIEWPROJECTION = 1 << 13; //do not multiply by viewprojection, use model as mvp
var RI_IGNORE_CLIPPING_PLANE = 1 << 14; //ignore the plane clipping (in reflections)

//16-24: instance properties
var RI_RAYCAST_ENABLED = 1 << 16; //if it could be raycasted


//default flags for any instance
var RI_DEFAULT_FLAGS = RI_CULL_FACE | RI_DEPTH_TEST | RI_DEPTH_WRITE | RI_CAST_SHADOWS | RI_RECEIVE_SHADOWS;
var RI_2D_FLAGS = RI_RENDER_2D | RI_CULL_FACE | RI_BLEND | RI_IGNORE_LIGHTS | RI_IGNORE_FRUSTUM;

function RenderInstance(node, component)
{
	this._key = ""; //not used yet
	this._uid = LS.generateUId(); //unique identifier for this RI

	//info about the mesh
	this.vertex_buffers = null;
	this.index_buffer = null;
	this.wireframe_index_buffer = null;
	this.range = new Int32Array([0,-1]); //start, offset
	this.mesh = null; //shouldnt be used, but just in case
	this.collision_mesh = null; //in case of raycast
	this.primitive = gl.TRIANGLES;

	//where does it come from
	this.node = node;
	this.component = component;
	this.priority = 10; //instances are rendered from higher to lower priority

	//rendering flags
	this.flags = RI_DEFAULT_FLAGS;
	this.blend_func = BlendFunctions["normal"]; //Blend.funcs["add"], ...

	//transformation
	this.matrix = mat4.create();
	this.normal_matrix = mat4.create();
	this.center = vec3.create();

	//for visibility computation
	this.oobb = BBox.create(); //object space bounding box
	this.aabb = BBox.create(); //axis aligned bounding box

	//info about the material
	this.material = null;

	//for extra data for the shader
	this.macros = {};
	this.uniforms = {};
	this.samplers = {};

	//for internal use
	this._final_macros = {};
	this._final_uniforms = {};
	this._final_samplers = {};
}


RenderInstance.prototype.generateKey = function(step, options)
{
	this._key = step + "|" + this.node._uid + "|" + this.material._uid + "|";
	return this._key;
}

//set the material and apply material flags to render instance
RenderInstance.prototype.setMaterial = function(material)
{
	this.material = material;
	if(material)
		material.applyToRenderInstance(this);
}

RenderInstance.prototype.setMesh = function(mesh, primitive)
{
	if( !primitive && primitive != 0)
		primitive = gl.TRIANGLES;

	this.mesh = mesh;
	this.primitive = primitive;
	this.vertex_buffers = mesh.vertexBuffers;

	switch(primitive)
	{
		case gl.TRIANGLES: 
			this.index_buffer = mesh.indexBuffers["triangles"]; //works for indexed and non-indexed
			break;
		case gl.LINES: 
			if(!mesh.indexBuffers["lines"])
				mesh.computeWireframe();
			this.index_buffer = mesh.indexBuffers["lines"];
			break;
		case gl.POINTS: 
		default:
			this.index_buffer = null;
			break;
	}

	if(mesh.bounding)
	{
		this.oobb.set( mesh.bounding ); //copy
		this.flags &= ~RI_IGNORE_FRUSTUM; //test against frustum
	}
	else
		this.flags |= RI_IGNORE_FRUSTUM; //no frustum, no test
}

RenderInstance.prototype.setRange = function(start, offset)
{
	this.range[0] = start;
	this.range[1] = offset;
}

/**
* takes the flags on the node and update the render instance flags
*
* @method applyNodeFlags
*/
RenderInstance.prototype.applyNodeFlags = function()
{
	var node_flags = this.node.flags;

	if(node_flags.two_sided == true) this.flags &= ~RI_CULL_FACE;
	if(node_flags.flip_normals == true) this.flags |= RI_CW;
	if(node_flags.depth_test == false) this.flags &= ~RI_DEPTH_TEST;
	if(node_flags.depth_write == false) this.flags &= ~RI_DEPTH_WRITE;
	if(node_flags.alpha_test == true) this.flags |= RI_ALPHA_TEST;

	if(node_flags.cast_shadows == false) this.flags &= ~RI_CAST_SHADOWS;
	if(node_flags.receive_shadows == false) this.flags &= ~RI_RECEIVE_SHADOWS;	
}

/**
* Enable flag in the flag bit field
*
* @method enableFlag
* @param {number} flag id
*/
RenderInstance.prototype.enableFlag = function(flag)
{
	this.flags |= flag;
}

/**
* Disable flag in the flag bit field
*
* @method enableFlag
* @param {number} flag id
*/
RenderInstance.prototype.disableFlag = function(flag)
{
	this.flags &= ~flag;
}

/**
* Tells if a flag is enabled
*
* @method enableFlag
* @param {number} flag id
* @return {boolean} flag value
*/
RenderInstance.prototype.isFlag = function(flag)
{
	return (this.flags & flag);
}

/**
* Updates the normal matrix using the matrix
*
* @method computeNormalMatrix
*/
RenderInstance.prototype.computeNormalMatrix = function()
{
	var m = mat4.invert(this.normal_matrix, this.matrix);
	if(m)
		mat4.transpose(this.normal_matrix, m);
}

/**
* Computes the instance bounding box in world space from the one in local space
*
* @method updateAABB
*/
RenderInstance.prototype.updateAABB = function()
{
	BBox.transformMat4(this.aabb, this.oobb, this.matrix );
}

/**
* Calls render taking into account primitive and submesh id
*
* @method render
* @param {Shader} shader
*/
RenderInstance.prototype.render = function(shader)
{
	shader.drawBuffers( this.vertex_buffers,
	  this.index_buffer,
	  this.primitive, this.range[0], this.range[1] );
}


/* moved to PhysicsInstance
RenderInstance.prototype.setCollisionMesh = function(mesh)
{
	this.flags |= RI_USE_MESH_AS_COLLIDER;
	this.collision_mesh = mesh;
}
*/


//************************************
/**
* The Renderer is in charge of generating one frame of the scene. Contains all the passes and intermediate functions to create the frame.
*
* @class Renderer
* @namespace LS
* @constructor
*/

var Renderer = {

	default_render_options: new RenderOptions(),
	default_material: new StandardMaterial(), //used for objects without material

	color_rendertarget: null, //null means screen, otherwise if texture it will render to that texture
	depth_rendertarget: null, //depth texture to store depth

	_full_viewport: vec4.create(), //contains info about the full viewport available to render (depends if using FBOs)

	_current_scene: null,
	_current_render_options: null,
	_current_camera: null,
	_current_target: null, //texture where the image is being rendered

	_visible_cameras: null,
	_visible_lights: null,
	_visible_instances: null,

	//stats
	_rendercalls: 0,
	_rendered_instances: 0,

	//reusable locals
	_view_matrix: mat4.create(),
	_projection_matrix: mat4.create(),
	_viewprojection_matrix: mat4.create(),
	_2Dviewprojection_matrix: mat4.create(),
	_mvp_matrix: mat4.create(),
	_temp_matrix: mat4.create(),
	_identity_matrix: mat4.create(),

	reset: function()
	{
		this.color_rendertarget = null;
		this.depth_rendertarget = null;
	},

	/**
	* Renders the current scene to the screen
	*
	* @method render
	* @param {SceneTree} scene
	* @param {Camera} camera
	* @param {RenderOptions} render_options
	*/
	render: function(scene, main_camera, render_options)
	{
		render_options = render_options || this.default_render_options;
		render_options.current_renderer = this;
		this._current_render_options = render_options;
		this._current_scene = scene;
		this._main_camera = main_camera;

		//done at the beginning just in case it crashes
		scene._frame += 1;
		scene._must_redraw = false;

		render_options.main_camera = main_camera;
		this._rendercalls = 0;
		this._rendered_instances = 0;

		//events
		LEvent.trigger(scene, "beforeRender", render_options );
		scene.triggerInNodes("beforeRender", render_options );

		//get render instances, lights, materials and all rendering info ready: computeVisibility
		this.processVisibleData(scene, render_options);

		//settings for cameras
		var cameras = this._visible_cameras;
		if(main_camera) // && !render_options.render_all_cameras )
			cameras = [ main_camera ];
		render_options.main_camera = cameras[0];

		scene.triggerInNodes("afterVisibility", render_options );		

		//generate shadowmaps
		/*
		if( render_options.update_shadowmaps && !render_options.shadows_disabled && !render_options.lights_disabled && !render_options.low_quality )
		{
			LEvent.trigger(scene, "generateShadowmaps", render_options );
			for(var i in this._visible_lights) 
			{
				var light = this._visible_lights[i];
				if( light.cast_shadows )
					light.generateShadowmap( render_options );
			}

			//LEvent.triggerArray( this._visible_lights, "generateShadowmaps", render_options );
			//this.renderShadowMaps(scene, render_options);
		}
		*/

		LEvent.trigger(scene, "afterRenderShadows", render_options );
		scene.triggerInNodes("afterRenderShadows", render_options );

		LEvent.trigger(scene, "renderReflections", render_options );
		scene.triggerInNodes("renderReflections", render_options );

		LEvent.trigger(scene, "beforeRenderMainPass", render_options );
		scene.triggerInNodes("beforeRenderMainPass", render_options );

		//for each camera
		for(var i in cameras)
		{
			var current_camera = cameras[i];
			LEvent.trigger(current_camera, "beforeRenderPass", render_options );
			LEvent.trigger(scene, "beforeRenderPass", render_options );

			//Render scene to screen, buffer, to Color&Depth buffer 
			Renderer._full_viewport.set([0,0,gl.canvas.width, gl.canvas.height]);
			gl.viewport(0,0,gl.canvas.width, gl.canvas.height);

			if(render_options.render_fx && this.color_rendertarget && this.depth_rendertarget) //render color & depth to RT
				Texture.drawToColorAndDepth(this.color_rendertarget, this.depth_rendertarget, this.renderFrame.bind(this, this.color_rendertarget, current_camera) );
			else if(render_options.render_fx && this.color_rendertarget) //render color to RT
				this.color_rendertarget.drawTo(this.renderFrame.bind(this, this.color_rendertarget, current_camera));
			else //Screen render
			{
				gl.viewport(0,0,gl.canvas.width,gl.canvas.height);
				this.renderFrame(null,current_camera); //main render
				//gl.viewport(0,0,gl.canvas.width,gl.canvas.height);
			}
			LEvent.trigger(current_camera, "afterRenderPass", render_options );
			LEvent.trigger(scene, "afterRenderPass", render_options );
		}

		//events
		LEvent.trigger(scene, "afterRender", render_options );
		scene.triggerInNodes("afterRender", render_options );

	},

	renderFrame: function (tex, camera)
	{
		var render_options = this._current_render_options;
		var scene = this._current_scene;

		//gl.scissor( this.active_viewport[0], this.active_viewport[1], this.active_viewport[2], this.active_viewport[3] );
		//gl.enable(gl.SCISSOR_TEST);
		if(tex)
			Renderer._full_viewport.set([0,0,tex.width, tex.height]);

		this.enableCamera( camera, render_options ); //set as active camera and set viewport

		//clear
		gl.clearColor(scene.background_color[0],scene.background_color[1],scene.background_color[2], scene.background_color.length > 3 ? scene.background_color[3] : 0.0);
		if(render_options.ignore_clear != true && !camera._ignore_clear)
			gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

		//render scene
		//RenderPipeline.renderInstances(render_options);
		render_options.current_pass = "color";

		LEvent.trigger(scene, "beforeRenderScene", camera);
		scene.triggerInNodes("beforeRenderScene", camera);

		Renderer.renderInstances(render_options);

		LEvent.trigger(scene, "afterRenderScene", camera);
		scene.triggerInNodes("afterRenderScene", camera);

		//gl.disable(gl.SCISSOR_TEST);
	},

	/**
	* Set camera as the main scene camera
	*
	* @method enableCamera
	* @param {Camera} camera
	* @param {RenderOptions} render_options
	*/
	enableCamera: function(camera, render_options, skip_viewport)
	{
		LEvent.trigger(camera, "cameraEnabled", render_options);

		//camera.setActive();
		var width = Renderer._full_viewport[2];
		var height = Renderer._full_viewport[3];
		var final_width = width * camera._viewport[2];
		var final_height = height * camera._viewport[3];

		if(!skip_viewport)
		{
			if(render_options && render_options.ignore_viewports)
			{
				camera._aspect = width / height;
				gl.viewport( this._full_viewport[0], this._full_viewport[1], this._full_viewport[2], this._full_viewport[3] );
			}
			else
			{
				camera._aspect = final_width / final_height;
				gl.viewport( camera._viewport[0] * width, camera._viewport[1] * height, camera._viewport[2] * width, camera._viewport[3] * height );
			}
		}

		//compute matrices
		camera.updateMatrices();

		//store matrices locally
		mat4.copy( this._view_matrix, camera._view_matrix );
		mat4.copy( this._projection_matrix, camera._projection_matrix );
		mat4.copy( this._viewprojection_matrix, camera._viewprojection_matrix );

		//2D Camera: TODO: MOVE THIS SOMEWHERE ELSE
		mat4.ortho( this._2Dviewprojection_matrix, -1, 1, -1, 1, 1, -1 );

		//set as the current camera
		this._current_camera = camera;
		if(render_options)
			render_options.current_camera = camera;
	},

	
	renderInstances: function(render_options)
	{
		var scene = this._current_scene;

		var frustum_planes = geo.extractPlanes( this._viewprojection_matrix, this.frustum_planes );
		this.frustum_planes = frustum_planes;
		var apply_frustum_culling = render_options.frustum_culling;

		LEvent.trigger(scene, "beforeRenderInstances", render_options);
		scene.triggerInNodes("beforeRenderInstances", render_options);

		//compute global scene info
		this.fillSceneShaderMacros( scene, render_options );
		this.fillSceneShaderUniforms( scene, render_options );

		//render background: maybe this should be moved to a component
		if(!render_options.is_shadowmap && !render_options.is_picking && scene.textures["background"])
		{
			var texture = null;
			if(typeof(scene.textures["background"]) == "string")
				texture = LS.ResourcesManager.textures[ scene.textures["background"] ];
			if(texture)
			{
				gl.disable( gl.BLEND );
				gl.disable( gl.DEPTH_TEST );
				texture.toViewport();
			}
		}

		//reset state of everything!
		gl.enable( gl.DEPTH_TEST );
		gl.depthFunc( gl.LESS );
		gl.disable( gl.BLEND );
		gl.lineWidth(1);

		//this.updateVisibleInstances(scene,options);
		var lights = this._visible_lights;
		var render_instances = this._visible_instances;

		//compute visibility pass
		for(var i in render_instances)
		{
			//render instance
			var instance = render_instances[i];
			var node_flags = instance.node.flags;
			instance._in_camera = false;

			//hidden nodes
			if(render_options.is_rt && node_flags.seen_by_reflections == false)
				continue;
			if(render_options.is_shadowmap && !(instance.flags & RI_CAST_SHADOWS))
				continue;
			if(node_flags.seen_by_camera == false && !render_options.is_shadowmap && !render_options.is_picking && !render_options.is_reflection)
				continue;
			if(node_flags.seen_by_picking == false && render_options.is_picking)
				continue;

			//done here because sometimes some nodes are moved in this action
			if(instance.onPreRender)
				if( instance.onPreRender(render_options) === false)
					continue;

			if(instance.material.opacity <= 0) //remove this, do it somewhere else
				continue;

			//test visibility against camera frustum
			if(apply_frustum_culling && !(instance.flags & RI_IGNORE_FRUSTUM))
			{
				if(geo.frustumTestBox( frustum_planes, instance.aabb ) == CLIP_OUTSIDE)
					continue;
			}

			//save visibility info
			instance._in_camera = true;
		}


		//for each render instance
		for(var i in render_instances)
		{
			//render instance
			var instance = render_instances[i];

			if(!instance._in_camera)
				continue;

			//Compute lights affecting this RI
			//TODO

			if(instance.flags & RI_RENDER_2D)
			{
				this.render2DInstance(instance, scene, render_options );
				if(instance.onPostRender)
					instance.onPostRender(render_options);
				continue;
			}

			this._rendered_instances += 1;

			//choose the appropiate render pass
			if(render_options.is_shadowmap)
				this.renderShadowPassInstance( instance, render_options );
			else if(render_options.is_picking)
				this.renderPickingInstance( instance, render_options );
			else
				this.renderColorPassInstance( instance, lights, scene, render_options );

			if(instance.onPostRender)
				instance.onPostRender(render_options);
		}

		LEvent.trigger(scene, "renderScreenSpace", render_options);

		//foreground object
		if(!render_options.is_shadowmap && !render_options.is_picking && scene.textures["foreground"])
		{
			var texture = null;
			if(typeof(scene.textures["foreground"]) == "string")
				texture = LS.ResourcesManager.textures[ scene.textures["foreground"] ];
			if(texture)
			{
				gl.enable( gl.BLEND );
				gl.blendFunc( gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA );
				gl.disable( gl.DEPTH_TEST );
				texture.toViewport();
				gl.disable( gl.BLEND );
				gl.enable( gl.DEPTH_TEST );
			}
		}

		//restore state
		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(gl.LESS);
		gl.depthMask(true);
		gl.disable(gl.BLEND);
		gl.frontFace(gl.CCW);

		LEvent.trigger(scene, "afterRenderInstances", render_options);
		scene.triggerInNodes("afterRenderInstances", render_options);

		//EVENT SCENE after_render
		//restore state
		gl.enable(gl.DEPTH_TEST);
		gl.depthFunc(gl.LESS);
		gl.depthMask(true);
		gl.disable(gl.BLEND);
		gl.frontFace(gl.CCW);
	},

	//possible optimizations: bind the mesh once, bind the surface textures once
	renderColorPassInstance: function(instance, lights, scene, render_options)
	{

		var node = instance.node;
		var material = instance.material;

		//compute matrices
		var model = instance.matrix;
		if(instance.flags & RI_IGNORE_VIEWPROJECTION)
			this._mvp_matrix.set( model );
		else
			mat4.multiply(this._mvp_matrix, this._viewprojection_matrix, model );

		//node matrix info
		var instance_final_macros = instance._final_macros;
		var instance_final_uniforms = instance._final_uniforms;
		var instance_final_samplers = instance._final_samplers;

		//maybe this two should be somewhere else
		instance_final_uniforms.u_model = model; 
		instance_final_uniforms.u_normal_model = instance.normal_matrix; 

		//update matrices (because they depend on the camera) 
		instance_final_uniforms.u_mvp = this._mvp_matrix;


		//FLAGS: enable GL flags like cull_face, CCW, etc
		this.enableInstanceFlags(instance, render_options);

		//set blend flags
		if(material.blend_mode != Blend.NORMAL)
		{
			gl.enable( gl.BLEND );
			gl.blendFunc( instance.blend_func[0], instance.blend_func[1] );
		}
		else
			gl.disable( gl.BLEND );

		//pack material samplers 
		var samplers = {};
		samplers.merge( scene._samplers );
		samplers.merge( instance_final_samplers );

		//enable samplers and store where [TODO: maybe they are not used..., improve here]
		var sampler_uniforms = {};
		var slot = 0;
		for(var i in samplers)
			sampler_uniforms[ i ] = samplers[i].bind( slot++ );

		//find shader name
		var shader_name = render_options.default_shader_id;
		if(render_options.low_quality)
			shader_name = render_options.default_low_shader_id;
		if( material.shader_name )
			shader_name = material.shader_name;

		//multi pass instance rendering
		var num_lights = lights.length;

		//no lights rendering (flat light)
		var ignore_lights = node.flags.ignore_lights || (instance.flags & RI_IGNORE_LIGHTS) || render_options.lights_disabled;
		if(!num_lights || ignore_lights)
		{
			var macros = { FIRST_PASS:"", USE_AMBIENT_ONLY:"" };
			macros.merge(scene._macros);
			macros.merge(instance_final_macros); //contains node, material and instance macros

			if( ignore_lights )
				macros.USE_IGNORE_LIGHT = "";
			if(render_options.clipping_plane && !(instance.flags & RI_IGNORE_CLIPPING_PLANE) )
				macros.USE_CLIPPING_PLANE = "";

			if( material.onModifyMacros )
				material.onModifyMacros( macros );

			var shader = ShadersManager.get(shader_name, macros);

			//assign uniforms
			shader.uniforms( sampler_uniforms );
			shader.uniforms( scene._uniforms );
			shader.uniforms( instance_final_uniforms );

			//render
			instance.render( shader );
			this._rendercalls += 1;
			return;
		}

		//Regular rendering (multipass)
		for(var iLight = 0; iLight < num_lights; iLight++)
		{
			var light = lights[iLight];

			//compute the  shader
			var shader = null;
			if(!shader)
			{
				var light_macros = light.getMacros( instance, render_options );

				if(iLight == 0) light_macros.FIRST_PASS = "";
				if(iLight == (num_lights-1)) light_macros.LAST_PASS = "";

				var macros = {};
				macros.merge(scene._macros);
				macros.merge(instance_final_macros); //contains node, material and instance macros
				macros.merge(light_macros);

				if(render_options.clipping_plane && !(instance.flags & RI_IGNORE_CLIPPING_PLANE) )
					macros.USE_CLIPPING_PLANE = "";

				if( material.onModifyMacros )
					material.onModifyMacros( macros );

				shader = ShadersManager.get(shader_name, macros);
			}

			//fill shader data
			var light_uniforms = light.getUniforms( instance, render_options );

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
			//set depth func
			if(material.depth_func)
				gl.depthFunc( gl[material.depth_func] );

			//assign uniforms
			shader.uniforms( sampler_uniforms ); //where is every texture binded
			shader.uniforms( scene._uniforms );  //used mostly for environment textures
			shader.uniforms( instance_final_uniforms ); //contains node, material and instance uniforms
			shader.uniforms( light_uniforms ); //should this go before instance_final? to prioritize

			//render the instance
			instance.render( shader );
			this._rendercalls += 1;

			//avoid multipass in simple shaders
			if(shader.global && !shader.global.multipass)
				break; 
		}
	},

	renderShadowPassInstance: function(instance, render_options)
	{
		var scene = this._current_scene;
		var node = instance.node;
		var material = instance.material;

		//compute matrices
		var model = instance.matrix;
		mat4.multiply(this._mvp_matrix, this._viewprojection_matrix, model );

		//node matrix info
		var instance_final_macros = instance._final_macros;
		var instance_final_uniforms = instance._final_uniforms;
		var instance_final_samplers = instance._final_samplers;

		//maybe this two should be somewhere else
		instance_final_uniforms.u_model = model; 
		instance_final_uniforms.u_normal_model = instance.normal_matrix; 

		//update matrices (because they depend on the camera) 
		instance_final_uniforms.u_mvp = this._mvp_matrix;

		//FLAGS
		this.enableInstanceFlags(instance, render_options);

		var macros = {};
		macros.merge( instance_final_macros );

		if(this._current_target && this._current_target.texture_type == gl.TEXTURE_CUBE_MAP)
			macros["USE_LINEAR_DISTANCE"] = "";

		/*
		if(node.flags.alpha_shadows == true )
		{
			macros["USE_ALPHA_TEST"] = "0.5";
			var color = material.getTexture("color");
			if(color)
			{
				var color_uvs = material.textures["color_uvs"] || Material.DEFAULT_UVS["color"] || "0";
				macros.USE_COLOR_TEXTURE = "uvs_" + color_uvs;
				color.bind(0);
			}

			var opacity = material.getTexture("opacity");
			if(opacity)	{
				var opacity_uvs = material.textures["opacity_uvs"] || Material.DEFAULT_UVS["opacity"] || "0";
				macros.USE_OPACITY_TEXTURE = "uvs_" + opacity_uvs;
				opacity.bind(1);
			}

			shader = ShadersManager.get("depth", macros);
			shader.uniforms({ texture: 0, opacity_texture: 1 });
		}
		else
		{
			shader = ShadersManager.get("depth", macros );
		}
		*/

		if(node.flags.alpha_shadows == true )
			macros["USE_ALPHA_TEST"] = "0.5";

		var shader = ShadersManager.get("depth", macros );

		var samplers = {};
		samplers.merge( scene._samplers );
		samplers.merge( instance_final_samplers );

		var slot = 1;
		var sampler_uniforms = {};
		for(var i in samplers)
			if(shader.samplers[i]) //only enable a texture if the shader uses it
				sampler_uniforms[ i ] = samplers[i].bind( slot++ );

		shader.uniforms( sampler_uniforms );
		shader.uniforms( scene._uniforms );
		shader.uniforms( instance._final_uniforms );

		instance.render(shader);
		this._rendercalls += 1;
	},

	//renders using an orthographic projection
	render2DInstance:  function(instance, scene, options)
	{
		var node = instance.node;
		var material = instance.material;

		//compute matrices
		var model = this._temp_matrix;
		mat4.identity(model);

		//project from 3D to 2D
		var pos = vec3.create();

		if(instance.pos2D)
			pos.set(instance.pos2D);
		else
		{
			mat4.projectVec3( pos, this._viewprojection_matrix, instance.center );
			if(pos[2] < 0) return;
			pos[2] = 0;
		}

		mat4.translate( model, model, pos );
		var aspect = gl.canvas.width / gl.canvas.height;
		var scale = vec3.fromValues(1, aspect ,1);
		if(instance.scale_2D)
		{
			scale[0] *= instance.scale_2D[0];
			scale[1] *= instance.scale_2D[1];
		}
		mat4.scale( model, model, scale );
		mat4.multiply(this._mvp_matrix, this._2Dviewprojection_matrix, model );

		var node_uniforms = node._uniforms;
		node_uniforms.u_mvp = this._mvp_matrix;
		node_uniforms.u_model = model;
		node_uniforms.u_normal_model = this._identity_matrix;

		//FLAGS
		this.enableInstanceFlags(instance, options);

		//blend flags
		if(material.blend_mode != Blend.NORMAL)
		{
			gl.enable( gl.BLEND );
			gl.blendFunc( instance.blend_func[0], instance.blend_func[1] );
		}
		else
		{
			gl.enable( gl.BLEND );
			gl.blendFunc( gl.SRC_ALPHA, gl.ONE );
		}

		//assign material samplers (maybe they are not used...)
		var slot = 0;
		for(var i in material._samplers )
			material._uniforms[ i ] = material._samplers[i].bind( slot++ );

		var shader_name = "flat_texture";
		var shader = ShadersManager.get(shader_name);

		//assign uniforms
		shader.uniforms( node_uniforms );
		shader.uniforms( material._uniforms );
		shader.uniforms( instance.uniforms );

		//render
		instance.render( shader );
		this._rendercalls += 1;
		return;
	},	

	renderPickingInstance: function(instance, render_options)
	{
		var node = instance.node;
		var model = instance.matrix;
		mat4.multiply(this._mvp_matrix, this._viewprojection_matrix, model );
		var pick_color = this.getNextPickingColor( instance );
		/*
		this._picking_next_color_id += 10;
		var pick_color = new Uint32Array(1); //store four bytes number
		pick_color[0] = this._picking_next_color_id; //with the picking color for this object
		var byte_pick_color = new Uint8Array( pick_color.buffer ); //read is as bytes
		//byte_pick_color[3] = 255; //Set the alpha to 1
		this._picking_nodes[this._picking_next_color_id] = node;
		*/

		var macros = {};
		macros.merge(instance._final_macros);

		var shader = ShadersManager.get("flat", macros);
		shader.uniforms({u_mvp: this._mvp_matrix, u_material_color: pick_color });

		//hardcoded, ugly
		/*
		if( macros["USE_SKINNING"] && instance.uniforms["u_bones"] )
			if( macros["USE_SKINNING_TEXTURE"] )
				shader.uniforms({ u_bones: });
		*/

		instance.render(shader);
	},

	//do not reuse the macros, they change between rendering passes (shadows, reflections, etc)
	fillSceneShaderMacros: function( scene, render_options )
	{
		var macros = {};

		//camera info
		if(render_options == "color")
		{
			if(render_options.current_camera.type == Camera.ORTHOGRAPHIC)
				macros.USE_ORTHOGRAPHIC_CAMERA = "";

			if(render_options.brightness_factor && render_options.brightness_factor != 1)
				macros.USE_BRIGHTNESS_FACTOR = "";

			if(render_options.colorclip_factor)
				macros.USE_COLORCLIP_FACTOR = "";
		}

		scene._macros = macros;
	},

	//DO NOT CACHE, parameter can change between render passes
	fillSceneShaderUniforms: function( scene, render_options )
	{
		var camera = render_options.current_camera;

		//global uniforms
		var uniforms = {
			u_camera_eye: camera.getEye(),
			u_camera_planes: [camera.near, camera.far],
			//u_viewprojection: this._viewprojection_matrix,
			u_time: scene._time || getTime() * 0.001,
			u_brightness_factor: render_options.brightness_factor != null ? render_options.brightness_factor : 1,
			u_colorclip_factor: render_options.colorclip_factor != null ? render_options.colorclip_factor : 0,
			u_ambient_light: scene.ambient_color,
			u_background_color: scene.background_color.subarray(0,3)
		};

		if(render_options.clipping_plane)
			uniforms.u_clipping_plane = render_options.clipping_plane;

		scene._uniforms = uniforms;
		scene._samplers = {};


		//if(scene.textures.environment)
		//	scene._samplers.push(["environment" + (scene.textures.environment.texture_type == gl.TEXTURE_2D ? "_texture" : "_cubemap") , scene.textures.environment]);

		for(var i in scene.textures) 
		{
			var texture = LS.getTexture( scene.textures[i] );
			if(!texture) continue;
			if(i != "environment" && i != "irradiance") continue; //TO DO: improve this, I dont want all textures to be binded 
			var type = (texture.texture_type == gl.TEXTURE_2D ? "_texture" : "_cubemap");
			if(texture.texture_type == gl.TEXTURE_2D)
			{
				texture.bind(0);
				texture.setParameter( gl.TEXTURE_MIN_FILTER, gl.LINEAR ); //avoid artifact
			}
			scene._samplers[i + type] = texture;
			scene._macros[ "USE_" + (i + type).toUpperCase() ] = "uvs_polar_reflected";
		}
	},	

	getNextPickingColor: function(instance, data)
	{
		this._picking_next_color_id += 10;
		var pick_color = new Uint32Array(1); //store four bytes number
		pick_color[0] = this._picking_next_color_id; //with the picking color for this object
		var byte_pick_color = new Uint8Array( pick_color.buffer ); //read is as bytes
		//byte_pick_color[3] = 255; //Set the alpha to 1

		this._picking_nodes[ this._picking_next_color_id ] = [instance, data];
		return new Float32Array([byte_pick_color[0] / 255,byte_pick_color[1] / 255,byte_pick_color[2] / 255, 1]);
	},

	enableInstanceFlags: function(instance, render_options)
	{
		var flags = instance.flags;

		//backface culling
		if( flags & RI_CULL_FACE )
			gl.enable( gl.CULL_FACE );
		else
			gl.disable( gl.CULL_FACE );

		//  depth
		gl.depthFunc( gl.LEQUAL );
		if(flags & RI_DEPTH_TEST)
			gl.enable( gl.DEPTH_TEST );
		else
			gl.disable( gl.DEPTH_TEST );

		if(flags & RI_DEPTH_WRITE)
			gl.depthMask(true);
		else
			gl.depthMask(false);

		//when to reverse the normals?
		var order = gl.CCW;
		if(flags & RI_CW)
			order = gl.CW;
		if(render_options.reverse_backfacing)
			order = order == gl.CW ? gl.CCW : gl.CW;
		gl.frontFace(order);
	},

	//collects and process the rendering instances, cameras and lights that are visible
	//its like a prepass shared among all rendering passes
	processVisibleData: function(scene, render_options)
	{
		//options = options || {};
		//options.scene = scene;

		//update containers in scene
		scene.collectData();

		var opaque_instances = [];
		var blend_instances = [];
		var materials = {}; //I dont want repeated materials here

		var instances = scene._instances;
		var camera = render_options.main_camera; // || scene.getCamera();
		var camera_eye = camera.getEye();

		//process render instances (add stuff if needed)
		for(var i in instances)
		{
			var instance = instances[i];
			if(!instance) continue;
			var node_flags = instance.node.flags;

			//materials
			if(!instance.material)
				instance.material = this.default_material;
			materials[instance.material._uid] = instance.material;

			//add extra info
			instance._dist = vec3.dist( instance.center, camera_eye );

			//change conditionaly
			if(render_options.force_wireframe) 
			{
				instance.primitive = gl.LINES;
				if(instance.mesh)
				{
					if(!instance.mesh.indexBuffers["lines"])
						instance.mesh.computeWireframe();
					instance.index_buffer = instance.mesh.indexBuffers["lines"];
				}
			}

			//and finally, the alpha thing to determine if it is visible or not
			if(instance.flags & RI_BLEND)
				blend_instances.push(instance);
			else
				opaque_instances.push(instance);

			//node & mesh constant information
			var macros = instance.macros;
			if(instance.flags & RI_ALPHA_TEST)
				macros.USE_ALPHA_TEST = "0.5";
			else if(macros["USE_ALPHA_TEST"])
				delete macros["USE_ALPHA_TEST"];

			var buffers = instance.vertex_buffers;
			if(!("normals" in buffers))
				macros.NO_NORMALS = "";
			if(!("coords" in buffers))
				macros.NO_COORDS = "";
			if(("coords1" in buffers))
				macros.USE_COORDS1_STREAM = "";
			if(("colors" in buffers))
				macros.USE_COLOR_STREAM = "";
			if(("tangents" in buffers))
				macros.USE_TANGENT_STREAM = "";
		}

		//sort RIs in Z for alpha sorting
		if(render_options.sort_instances_by_distance)
		{
			opaque_instances.sort(this._sort_near_to_far_func);
			blend_instances.sort(this._sort_far_to_near_func);
		}

		var all_instances = opaque_instances.concat(blend_instances); //merge

		if(render_options.sort_instances_by_priority)
			all_instances.sort( this._sort_by_priority_func );


		//update materials info only if they are in use
		if(render_options.update_materials)
		{
			for(var i in materials)
			{
				var material = materials[i];
				if(!material._macros)
				{
					material._macros = {};
					material._uniforms = {};
					material._samplers = {};
				}
				material.fillSurfaceShaderMacros(scene); //update shader macros on this material
				material.fillSurfaceUniforms(scene); //update uniforms
			}
		}

		//pack all macros, uniforms, and samplers relative to this instance in single containers
		for(var i in instances)
		{
			var instance = instances[i];
			var node = instance.node;
			var material = instance.material;

			var macros = instance._final_macros;
			wipeObject(macros);
			macros.merge(node._macros);
			macros.merge(material._macros);
			macros.merge(instance.macros);

			var uniforms = instance._final_uniforms;
			wipeObject(uniforms);
			uniforms.merge( node._uniforms );
			uniforms.merge( material._uniforms );
			uniforms.merge( instance.uniforms );

			var samplers = instance._final_samplers;
			wipeObject(samplers);
			//samplers.merge( node._samplers );
			samplers.merge( material._samplers );
			samplers.merge( instance.samplers );			
		}


		//prepare lights
		var lights = scene._lights;
		for(var i in lights)
			lights[i].prepare(render_options);

		this._blend_instances = blend_instances;
		this._opaque_instances = opaque_instances;
		this._visible_instances = all_instances; //sorted version
		this._visible_lights = scene._lights; //sorted version
		this._visible_cameras = scene._cameras; //sorted version
		this._visible_materials = materials;
	},

	_sort_far_to_near_func: function(a,b) { return b._dist - a._dist; },
	_sort_near_to_far_func: function(a,b) { return a._dist - b._dist; },
	_sort_by_priority_func: function(a,b) { return b.priority - a.priority; },

	//Renders the scene to an RT
	renderInstancesToRT: function(cam, texture, render_options)
	{
		render_options = render_options || this.default_render_options;
		this._current_target = texture;

		if(texture.texture_type == gl.TEXTURE_2D)
		{
			this.enableCamera(cam, render_options);
			texture.drawTo( inner_draw_2d );
		}
		else if( texture.texture_type == gl.TEXTURE_CUBE_MAP)
			this.renderToCubemap(cam.getEye(), texture.width, texture, render_options, cam.near, cam.far);
		this._current_target = null;

		function inner_draw_2d()
		{
			var scene = Renderer._current_scene;
			gl.clearColor(scene.background_color[0], scene.background_color[1], scene.background_color[2], scene.background_color.length > 3 ? scene.background_color[3] : 0.0);
			if(render_options.ignore_clear != true)
				gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
			//render scene
			Renderer.renderInstances(render_options);
		}
	},

	/*
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
				Renderer.renderInstances(options);
			});
		}
	},
	*/

	/* reverse
	cubemap_camera_parameters: [
		{dir: [1,0,0], up:[0,1,0]}, //positive X
		{dir: [-1,0,0], up:[0,1,0]}, //negative X
		{dir: [0,-1,0], up:[0,0,-1]}, //positive Y
		{dir: [0,1,0], up:[0,0,1]}, //negative Y
		{dir: [0,0,-1], up:[0,1,0]}, //positive Z
		{dir: [0,0,1], up:[0,1,0]} //negative Z
	],
	*/

	//renders the current scene to a cubemap centered in the given position
	renderToCubemap: function(position, size, texture, render_options, near, far)
	{
		size = size || 256;
		near = near || 1;
		far = far || 1000;

		var eye = position;
		if( !texture || texture.constructor != Texture) texture = null;

		var scene = this._current_scene;

		texture = texture || new Texture(size,size,{texture_type: gl.TEXTURE_CUBE_MAP, minFilter: gl.NEAREST});
		this._current_target = texture;
		texture.drawTo( function(texture, side) {

			var cams = Camera.cubemap_camera_parameters;
			if(render_options.is_shadowmap == "shadow")
				gl.clearColor(0,0,0,0);
			else
				gl.clearColor( scene.background_color[0], scene.background_color[1], scene.background_color[2], scene.background_color.length > 3 ? scene.background_color[3] : 1.0);

			gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
			var cubemap_cam = new Camera({ eye: eye, center: [ eye[0] + cams[side].dir[0], eye[1] + cams[side].dir[1], eye[2] + cams[side].dir[2]], up: cams[side].up, fov: 90, aspect: 1.0, near: near, far: far });

			Renderer.enableCamera( cubemap_cam, render_options, true );
			Renderer.renderInstances( render_options );
		});

		this._current_target = null;
		return texture;
	},


	//picking
	_pickingMap: null,
	_picking_color: new Uint8Array(4),
	_picking_depth: 0,
	_picking_next_color_id: 0,
	_picking_nodes: {},
	_picking_render_options: new RenderOptions({is_picking: true}),

	renderPickingBuffer: function(scene, camera, x,y)
	{
		if(this._pickingMap == null || this._pickingMap.width != gl.canvas.width || this._pickingMap.height != gl.canvas.height )
		{
			this._pickingMap = new GL.Texture( gl.canvas.width, gl.canvas.height, { format: gl.RGBA, filter: gl.NEAREST });
			ResourcesManager.textures[":picking"] = this._pickingMap;
		}

		y = gl.canvas.height - y; //reverse Y
		var small_area = true;
		this._picking_next_color_id = 0;

		this._current_target = this._pickingMap;
		this._pickingMap.drawTo(function() {
			//trace(" START Rendering ");

			var viewport = scene.viewport || [0,0,gl.canvas.width, gl.canvas.height];
			camera.aspect = viewport[2] / viewport[3];
			gl.viewport( viewport[0], viewport[1], viewport[2], viewport[3] );

			if(small_area)
			{
				gl.scissor(x-1,y-1,2,2);
				gl.enable(gl.SCISSOR_TEST);
			}

			gl.clearColor(0,0,0,0);
			gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

			Renderer.enableCamera(camera, Renderer._picking_render_options);

			//gl.viewport(x-20,y-20,40,40);
			Renderer._picking_render_options.current_pass = "picking";
			Renderer.renderInstances(Renderer._picking_render_options);
			//gl.scissor(0,0,gl.canvas.width,gl.canvas.height);

			LEvent.trigger(scene,"renderPicking", [x,y] );

			gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,Renderer._picking_color);

			if(small_area)
				gl.disable(gl.SCISSOR_TEST);
		});
		this._current_target = null;

		//if(!this._picking_color) this._picking_color = new Uint8Array(4); //debug
		//trace(" END Rendering: ", this._picking_color );
		return this._picking_color;
	},

	getNodeAtCanvasPosition: function(scene, camera, x,y)
	{
		camera = camera || scene.getCamera();

		this._picking_nodes = {};

		//render all Render Instances
		this.renderPickingBuffer(scene, camera, x,y);

		this._picking_color[3] = 0; //remove alpha, because alpha is always 255
		var id = new Uint32Array(this._picking_color.buffer)[0]; //get only element

		var instance_info = this._picking_nodes[id];
		this._picking_nodes = {};

		if(!instance_info) return null;

		var instance = instance_info[0];
		return instance.node;
	},

	//used to get special info about the instance below the mouse
	getInstanceAtCanvasPosition: function(scene, camera, x,y)
	{
		camera = camera || scene.getCamera();

		this._picking_nodes = {};

		//render all Render Instances
		this.renderPickingBuffer(scene, camera, x,y);

		this._picking_color[3] = 0; //remove alpha, because alpha is always 255
		var id = new Uint32Array(this._picking_color.buffer)[0]; //get only element

		var instance_info = this._picking_nodes[id];
		this._picking_nodes = {};
		return instance_info;
	},	

	//similar to Physics.raycast but using only visible meshes
	raycast: function(scene, origin, direction, max_dist)
	{
		max_dist = max_dist || Number.MAX_VALUE;

		var instances = scene._instances;
		var collisions = [];

		var local_start = vec3.create();
		var local_direction = vec3.create();

		//for every instance
		for(var i = 0; i < instances.length; ++i)
		{
			var instance = instances[i];

			if(!(instance.flags & RI_RAYCAST_ENABLED))
				continue;

			if(instance.flags & RI_BLEND)
				continue; //avoid semitransparent

			//test against AABB
			var collision_point = vec3.create();
			if( !geo.testRayBBox( origin, direction, instance.aabb, null, collision_point, max_dist) )
				continue;

			var model = instance.matrix;

			//ray to local
			var inv = mat4.invert( mat4.create(), model );
			mat4.multiplyVec3( local_start, inv, origin );
			mat4.rotateVec3( local_direction, inv, direction );

			//test against OOBB (a little bit more expensive)
			if( !geo.testRayBBox(local_start, local_direction, instance.oobb, null, collision_point, max_dist) )
				continue;

			//test against mesh
			if( instance.collision_mesh )
			{
				var mesh = instance.collision_mesh;
				var octree = mesh.octree;
				if(!octree)
					octree = mesh.octree = new Octree( mesh );
				var hit = octree.testRay( local_start, local_direction, 0.0, max_dist );
				if(!hit)
					continue;
				mat4.multiplyVec3(collision_point, model, hit.pos);
			}
			else
				vec3.transformMat4(collision_point, collision_point, model);

			var distance = vec3.distance( origin, collision_point );
			if(distance < max_dist)
				collisions.push([instance, collision_point, distance]);
		}

		collisions.sort( function(a,b) { return a[2] - b[2]; } );
		return collisions;
	}
};

//Add to global Scope
LS.Renderer = Renderer;
/* This is in charge of basic physics actions like ray tracing against the colliders */

/**
* PhysicsInstance contains info of one object to test physics against
*
* @class PhysicsInstance
* @namespace LS
* @constructor
*/
function PhysicsInstance(node, component)
{
	this._uid = LS.generateUId(); //unique identifier for this RI

	this.type = PhysicsInstance.BOX;
	this.mesh = null; 

	//where does it come from
	this.node = node;
	this.component = component;

	//transformation
	this.matrix = mat4.create();
	this.center = vec3.create();

	//for visibility computation
	this.oobb = BBox.create(); //object space bounding box
	this.aabb = BBox.create(); //axis aligned bounding box
}

PhysicsInstance.BOX = 1;
PhysicsInstance.SPHERE = 2;
PhysicsInstance.PLANE = 3;
PhysicsInstance.CAPSULE = 4;
PhysicsInstance.MESH = 5;
PhysicsInstance.FUNCTION = 6; //used to test against a internal function

/**
* Computes the instance bounding box in world space from the one in local space
*
* @method updateAABB
*/
PhysicsInstance.prototype.updateAABB = function()
{
	BBox.transformMat4(this.aabb, this.oobb, this.matrix );
}

PhysicsInstance.prototype.setMesh = function(mesh)
{
	this.mesh = mesh;
	this.type = PhysicsInstance.MESH;	
	BBox.setCenterHalfsize( this.oobb, mesh.bounding.aabb_center, mesh.bounding.aabb_halfsize );
}



/**
* Physics is in charge of all physics testing methods
*
* @class Physics
* @namespace LS
* @constructor
*/
var Physics = {
	raycast: function(scene, origin, direction)
	{
		var colliders = scene._colliders;
		var collisions = [];

		var local_start = vec3.create();
		var local_direction = vec3.create();

		//for every instance
		for(var i = 0; i < colliders.length; ++i)
		{
			var instance = colliders[i];

			//test against AABB
			var collision_point = vec3.create();
			if( !geo.testRayBBox(origin, direction, instance.aabb, null, collision_point) )
				continue;

			var model = instance.matrix;

			//ray to local
			var inv = mat4.invert( mat4.create(), model );
			mat4.multiplyVec3( local_start, inv, origin);
			mat4.rotateVec3( local_direction, inv, direction);

			//test in world space, is cheaper
			if( instance.type == PhysicsInstance.SPHERE)
			{
				if(!geo.testRaySphere( local_start, local_direction, instance.center, instance.oobb[3], collision_point))
					continue;
				vec3.transformMat4(collision_point, collision_point, model);
			}
			else //the rest test first with the local BBox
			{
				//test against OOBB (a little bit more expensive)
				if( !geo.testRayBBox( local_start, local_direction, instance.oobb, null, collision_point) )
					continue;

				if( instance.type == PhysicsInstance.MESH)
				{
					var octree = instance.mesh.octree;
					if(!octree)
						octree = instance.mesh.octree = new Octree( instance.mesh );
					var hit = octree.testRay( local_start, local_direction, 0.0, 10000 );
					if(!hit)
						continue;

					mat4.multiplyVec3(collision_point, model, hit.pos);
				}
				else
					vec3.transformMat4(collision_point, collision_point, model);
			}

			var distance = vec3.distance( origin, collision_point );
			collisions.push([instance, collision_point, distance]);
		}

		//sort collisions by distance
		collisions.sort( function(a,b) { return a[2] - b[2]; } );
		return collisions;
	}
}


LS.Physics = Physics;
/* 
Parser should only be in charge of extracting info from a data chunk (text or binary) and returning in a better way
It shouldnt have any dependency to allow to be used in workers in the future
*/
var Parser = {

	flipAxis: 0,
	merge_smoothgroups: false,
	safe_parsing: false,

	image_extensions: ["png","jpg"], //for images
	nonative_image_extensions: ["tga","dds"], //for images that need parsing
	mesh_extensions: ["obj", "bin","ase","gr2","json","jsmesh"], //for meshes
	scene_extensions: ["dae"], //for scenes
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
		var info = this.getFileFormatInfo(filename);
		if(options.extension)
			info.extension = options.extension; //force a format
		var parser = this.parsers[info.extension];
		if(!parser)
		{
			console.error("Parser Error: No parser found for " + info.extension + " format");
			return null;
		}

		var result = null;
		if(!this.safe_parsing)
			result = parser.parse(data,options,filename);
		else
			try
			{
				result = parser.parse(data,options,filename);
			}
			catch (err)
			{
				console.error("Error parsing content", err );
				return null;
			}
		if(result)
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

		var center = [(min[0] + max[0]) * 0.5,(min[1] + max[1]) * 0.5, (min[2] + max[2]) * 0.5];
		var halfsize = [ min[0] - center[0], min[1] - center[1], min[2] - center[2]];
		return BBox.setCenterHalfsize( BBox.create(), center, halfsize );
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
	SCENE_DATA: "SCENE",
	IMAGE_DATA: "IMAGE",
	NONATIVE_IMAGE_DATA: "NONATIVE_IMAGE",
	GENERIC_DATA: "GENERIC",
	
	getFileFormatInfo: function(filename)
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
		else if  (this.scene_extensions.indexOf(extension) != -1)
			r.type = Parser.SCENE_DATA; 
		else if  (this.nonative_image_extensions.indexOf(extension) != -1)
			r.type = Parser.NONATIVE_IMAGE_DATA; 
		else if  (this.generic_extensions.indexOf(extension) != -1)
			r.type = Parser.GENERIC_DATA; //unkinown data, could be anything
		return r;
	}
};














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

		var mesh = { info: {} };

		mesh.vertices = new Float32Array(positionsArray);
		if (normalsArray.length > 0)
			mesh.normals = new Float32Array(normalsArray);
		if (texcoordsArray.length > 0)
			mesh.coords = new Float32Array(texcoordsArray);

		//extra info
		mesh.bounding = Parser.computeMeshBounding(mesh.vertices);
		if(groups.length > 1)
			mesh.info.groups = groups;
		return mesh;
	}
};
Parser.registerParser( parserASE );

var temp_v3 = vec3.create();

var parserDAE = {
	extension: 'dae',
	data_type: 'scene',
	format: 'text',

	_xmlroot: null,

	no_flip: true,

	_nodes_by_id: null,

	safeString: function (str) { return str.replace(/ /g,"_"); },

	parse: function(data, options, filename)
	{
		options = options || {};

		//console.log("Parsing collada");
		var flip = true;

		var xmlparser = new DOMParser();
		var root = xmlparser.parseFromString(data,"text/xml");
		this._xmlroot = root;
		var xmlvisual_scene = root.querySelector("visual_scene");

		//hack to avoid problems with bones with spaces in names
		this._nodes_by_id = {}; //clear
		this.readAllNodeNames(xmlvisual_scene);

		var scene = { 
			object_type:"SceneTree", 
			light: null,
			resources: {},
			root:{ children:[] }
		};

		//parse nodes tree
		var xmlnodes = xmlvisual_scene.childNodes;
		for(var i = 0; i < xmlnodes.length; i++)
		{
			if(xmlnodes[i].localName != "node")
				continue;

			var node = this.readNode( xmlnodes[i], scene, 0, flip );
			scene.root.children.push(node);
		}

		//read animations
		var animations = this.readAnimations(root, scene);
		if(animations)
		{
			var animations_name = "#animations_" + filename.substr(0,filename.indexOf("."));
			scene.resources[ animations_name ] = animations;
			scene.root.animations = animations_name;
		}

		//console.log(scene);
		return scene;
	},

	/* Collect node ids, in case there is bones (with spaces in name) I need to know the nodenames in advance */
	readAllNodeNames: function(xmlnode)
	{
		var node_id = this.safeString( xmlnode.getAttribute("id") );
		if(node_id)
			this._nodes_by_id[node_id] = true; //node found
		for( var i = 0; i < xmlnode.childNodes.length; i++ )
		{
			var xmlchild = xmlnode.childNodes[i];

			//children
			if(xmlchild.localName != "node")
				continue;
			this.readAllNodeNames(xmlchild);
		}
	},

	readNode: function(xmlnode, scene, level, flip)
	{
		var node_id = this.safeString( xmlnode.getAttribute("id") );
		var node_type = xmlnode.getAttribute("type");
		var node = { id: node_id, children:[], _depth: level };
		this._nodes_by_id[node_id] = node;

		//transform
		node.model = this.readTransform(xmlnode, level, flip );

		//node elements
		for( var i = 0; i < xmlnode.childNodes.length; i++ )
		{
			var xmlchild = xmlnode.childNodes[i];

			//children
			if(xmlchild.localName == "node")
			{
				node.children.push( this.readNode(xmlchild, scene, level+1, flip) );
				continue;
			}

			//geometry
			if(xmlchild.localName == "instance_geometry")
			{
				var url = xmlchild.getAttribute("url");
				if(!scene.resources[ url ])
				{
					var mesh_data = this.readGeometry(url, flip);
					if(mesh_data)
					{
						mesh_data.name = url;
						scene.resources[url] = mesh_data;
					}
				}

				node.mesh = url;

				//binded material
				try 
				{
					var xmlmaterial = xmlchild.querySelector("instance_material");
					if(xmlmaterial)
					{
						var matname = xmlmaterial.getAttribute("symbol");
						if(scene.resources[matname])
							node.material = matname;
						else
						{
							var material = this.readMaterial(matname);
							if(material)
							{
								material.id = matname;
								scene.resources[matname] = material;
							}
							node.material = matname;
						}
					}
				}
				catch(err)
				{
					console.error("Error parsing material, check that materials doesnt have space in their names");
				}
			}


			//skinned or morph targets
			if(xmlchild.localName == "instance_controller")
			{
				var url = xmlchild.getAttribute("url");
				var mesh_data = this.readController(url, flip, scene );
				if(mesh_data)
				{
					var mesh = mesh_data;
					if( mesh_data.type == "morph" )
					{
						mesh = mesh_data.mesh;
						node.morph_targets = mesh_data.morph_targets;
					}

					mesh.name = url;
					node.mesh = url;
					scene.resources[url] = mesh;
				}
			}

			//light
			if(xmlchild.localName == "instance_light")
			{
				var url = xmlchild.getAttribute("url");
				this.readLight(node, url, flip);
			}

			//other possible tags?
		}

		return node;
	},

	translate_table: {
		transparency: "opacity",
		reflectivity: "reflection_factor",
		specular: "specular_factor",
		shininess: "specular_gloss",
		emission: "emissive",
		diffuse: "color"
	},

	readMaterial: function(url)
	{
		var xmlmaterial = this._xmlroot.querySelector("library_materials material#" + url);
		if(!xmlmaterial) return null;

		//get effect name
		var xmleffect = xmlmaterial.querySelector("instance_effect");
		if(!xmleffect) return null;

		var effect_url = xmleffect.getAttribute("url");

		//get effect
		var xmleffects = this._xmlroot.querySelector("library_effects effect" + effect_url);
		if(!xmleffects) return null;

		//get common
		var xmltechnique = xmleffects.querySelector("technique");
		if(!xmltechnique) return null;

		var material = {};

		var xmlphong = xmltechnique.querySelector("phong");
		if(!xmlphong) return null;

		//colors
		var xmlcolors = xmlphong.querySelectorAll("color");
		for(var i = 0; i < xmlcolors.length; ++i)
		{
			var xmlcolor = xmlcolors[i];
			var param = xmlcolor.getAttribute("sid");
			if(this.translate_table[param])
				param = this.translate_table[param];
			material[param] = this.readContentAsFloats( xmlcolor ).subarray(0,3);
			if(param == "specular_factor")
				material[param] = (material[param][0] + material[param][1] + material[param][2]) / 3; //specular factor
		}

		//factors
		var xmlfloats = xmlphong.querySelectorAll("float");
		for(var i = 0; i < xmlfloats.length; ++i)
		{
			var xmlfloat = xmlfloats[i];
			var param = xmlfloat.getAttribute("sid");
			if(this.translate_table[param])
				param = this.translate_table[param];
			material[param] = this.readContentAsFloats( xmlfloat )[0];
			if(param == "opacity")
				material[param] = 1 - material[param]; //reverse 
		}

		material.object_Type = "Material";
		return material;
	},

	readLight: function(node, url)
	{
		var light = {};

		var xmlnode = this._xmlroot.querySelector("library_lights " + url);
		if(!xmlnode) return null;

		//pack
		var children = [];
		var xml = xmlnode.querySelector("technique_common");
		if(xml)
			for(var i in xml.childNodes )
				if( xml.childNodes[i].nodeType == 1 ) //tag
					children.push( xml.childNodes[i] );

		var xmls = xmlnode.querySelectorAll("technique");
		for(var i = 0; i < xmls.length; i++)
		{
			for(var j in xmls[i].childNodes )
				if( xmls[i].childNodes[j].nodeType == 1 ) //tag
					children.push( xmls[i].childNodes[j] );
		}

		//get
		for(var i in children)
		{
			var xml = children[i];
			switch( xml.localName )
			{
				case "point": 
					light.type = LS.Light.OMNI; 
					parse_params(light, xml);
					break;
				case "spot": 
					light.type = LS.Light.SPOT; 
					parse_params(light, xml);
					break;
				case "intensity": light.intensity = this.readContentAsFloats( xml )[0]; break;
			}
		}

		function parse_params(light, xml)
		{
			for(var i in xml.childNodes)
			{
				var child = xml.childNodes[i];
				if( !child || child.nodeType != 1 ) //tag
					continue;

				switch( child.localName )
				{
					case "color": light.color = parserDAE.readContentAsFloats( child ); break;
					case "falloff_angle": 
						light.angle_end = parserDAE.readContentAsFloats( child )[0]; 
						light.angle = light.angle_end - 10; 
					break;
				}
			}
		}

		/*
		if(node.model)
		{
			var M = mat4.create();
			var R = mat4.rotate(M,M, Math.PI * 0.5, [1,0,0]);
			//mat4.multiply( node.model, node.model, R );
		}
		*/
		light.position = [0,0,0];
		light.target = [0,-1,0];

		node.light = light;
	},

	readTransform: function(xmlnode, level, flip)
	{
		//identity
		var matrix = mat4.create(); 
		var rotation = quat.create();
		var tmpmatrix = mat4.create();
		var tmpq = quat.create();
		var translate = vec3.create();
		var scale = vec3.fromValues(1,1,1);
		
		var flip_fix = false;

		//search for the matrix
		for(var i = 0; i < xmlnode.childNodes.length; i++)
		{
			var xml = xmlnode.childNodes[i];

			if(xml.localName == "matrix")
			{
				var matrix = this.readContentAsFloats(xml);
				//console.log("Nodename: " + xmlnode.getAttribute("id"));
				//console.log(matrix);
				this.transformMatrix(matrix, level == 0);
				//console.log(matrix);
				return matrix;
			}

			if(xml.localName == "translate")
			{
				var values = this.readContentAsFloats(xml);
				translate.set(values);
				continue;
			}

			//rotate
			if(xml.localName == "rotate")
			{
				var values = this.readContentAsFloats(xml);
				if(values.length == 4) //x,y,z, angle
				{
					var id = xml.getAttribute("sid");
					if(id == "jointOrientX")
					{
						values[3] += 90;
						flip_fix = true;
					}

					if(flip)
					{
						var tmp = values[1];
						values[1] = values[2];
						values[2] = -tmp; //swap coords
					}

					quat.setAxisAngle(tmpq, values.subarray(0,3), values[3] * DEG2RAD);
					quat.multiply(rotation,rotation,tmpq);
				}
				continue;
			}

			//scale
			if(xml.localName == "scale")
			{
				var values = this.readContentAsFloats(xml);
				if(flip)
				{
					var tmp = values[1];
					values[1] = values[2];
					values[2] = -tmp; //swap coords
				}
				scale.set(values);
			}
		}

		if(flip && level > 0)
		{
			var tmp = translate[1];
			translate[1] = translate[2];
			translate[2] = -tmp; //swap coords
		}
		mat4.translate(matrix, matrix, translate);

		mat4.fromQuat( tmpmatrix , rotation );
		//mat4.rotateX(tmpmatrix, tmpmatrix, Math.PI * 0.5);
		mat4.multiply( matrix, matrix, tmpmatrix );
		mat4.scale( matrix, matrix, scale );


		return matrix;
	},

	readGeometry: function(id, flip)
	{
		var xmlgeometry = this._xmlroot.querySelector("geometry" + id);
		if(!xmlgeometry) return null;

		var use_indices = false;
		var xmlmesh = xmlgeometry.querySelector("mesh");
			
		//get data sources
		var sources = {};
		var xmlsources = xmlmesh.querySelectorAll("source");
		for(var i = 0; i < xmlsources.length; i++)
		{
			var xmlsource = xmlsources[i];
			if(!xmlsource.querySelector) continue;
			var float_array = xmlsource.querySelector("float_array");
			if(!float_array) continue;
			var floats = this.readContentAsFloats( xmlsource );

			var xmlaccessor = xmlsource.querySelector("accessor");
			var stride = parseInt( xmlaccessor.getAttribute("stride") );

			sources[ xmlsource.getAttribute("id") ] = {stride: stride, data: floats};
		}

		//get streams
		var xmlvertices = xmlmesh.querySelector("vertices input");
		vertices_source = sources[ xmlvertices.getAttribute("source").substr(1) ];
		sources[ xmlmesh.querySelector("vertices").getAttribute("id") ] = vertices_source;

		var groups = [];

		var triangles = false;
		var polylist = false;
		var vcount = null;
		var xmlpolygons = xmlmesh.querySelector("polygons");
		if(!xmlpolygons)
		{
			xmlpolygons = xmlmesh.querySelector("polylist");
			if(xmlpolygons)
			{
				console.error("Polylist not supported, please be sure to enable TRIANGULATE option in your exporter.");
				return null;
			}
			//polylist = true;
			//var xmlvcount = xmlpolygons.querySelector("vcount");
			//var vcount = this.readContentAsUInt32( xmlvcount );
		}
		if(!xmlpolygons)
		{
			xmlpolygons = xmlmesh.querySelector("triangles");
			triangles = true;
		}
		if(!xmlpolygons)
		{
			console.log("no polygons or triangles in mesh: " + id);
			return null;
		}


		var xmltriangles = xmlmesh.querySelectorAll("triangles");
		if(!xmltriangles.length)
		{
			console.error("no triangles in mesh: " + id);
			return null;
		}
		else
			triangles = true;

		var buffers = [];
		var last_index = 0;
		var facemap = {};
		var vertex_remap = [];
		var indicesArray = [];

		//for every triangles set
		for(var tris = 0; tris < xmltriangles.length; tris++)
		{
			var xml_shape_root = xmltriangles[tris];

			//for each buffer (input)
			var xmlinputs = xml_shape_root.querySelectorAll("input");
			if(tris == 0) //first iteration, create buffers
				for(var i = 0; i < xmlinputs.length; i++)
				{
					var xmlinput = xmlinputs[i];
					if(!xmlinput.getAttribute) continue;
					var semantic = xmlinput.getAttribute("semantic").toUpperCase();
					var stream_source = sources[ xmlinput.getAttribute("source").substr(1) ];
					var offset = parseInt( xmlinput.getAttribute("offset") );
					var data_set = 0;
					if(xmlinput.getAttribute("set"))
						data_set = parseInt( xmlinput.getAttribute("set") );

					buffers.push([semantic, [], stream_source.stride, stream_source.data, offset, data_set]);
				}
			//assuming buffers are ordered by offset

			var xmlps = xml_shape_root.querySelectorAll("p");
			var num_data_vertex = buffers.length; //one value per input buffer

			//for every polygon
			for(var i = 0; i < xmlps.length; i++)
			{
				var xmlp = xmlps[i];
				if(!xmlp || !xmlp.textContent) break;

				var data = xmlp.textContent.trim().split(" ");

				//used for triangulate polys
				var first_index = -1;
				var current_index = -1;
				var prev_index = -1;

				if(use_indices && last_index >= 256*256)
					break;

				//for every pack of indices in the polygon (vertex, normal, uv, ... )
				for(var k = 0, l = data.length; k < l; k += num_data_vertex)
				{
					var vertex_id = data.slice(k,k+num_data_vertex).join(" "); //generate unique id

					prev_index = current_index;
					if(facemap.hasOwnProperty(vertex_id)) //add to arrays, keep the index
						current_index = facemap[vertex_id];
					else
					{
						for(var j = 0; j < buffers.length; ++j)
						{
							var buffer = buffers[j];
							var index = parseInt(data[k + j]);
							var array = buffer[1]; //array with all the data
							var source = buffer[3]; //where to read the data from
							if(j == 0)
								vertex_remap[ array.length / num_data_vertex ] = index;
							index *= buffer[2]; //stride
							for(var x = 0; x < buffer[2]; ++x)
								array.push( source[index+x] );
						}
						
						current_index = last_index;
						last_index += 1;
						facemap[vertex_id] = current_index;
					}

					if(!triangles) //split polygons then
					{
						if(k == 0)	first_index = current_index;
						if(k > 2 * num_data_vertex) //triangulate polygons
						{
							indicesArray.push( first_index );
							indicesArray.push( prev_index );
						}
					}

					indicesArray.push( current_index );
				}//per vertex
			}//per polygon

			//groups.push(indicesArray.length);
		}//per triangles group


		var mesh = {
			vertices: new Float32Array(buffers[0][1]),
			_remap: new Uint16Array(vertex_remap)
		};

		var translator = {
			"normal":"normals",
			"texcoord":"coords"
		};

		for(var i = 1; i < buffers.length; ++i)
		{
			var name = buffers[i][0].toLowerCase();
			var data = buffers[i][1];
			if(!data.length) continue;

			if(translator[name])
				name = translator[name];
			if(mesh[name])
				name = name + buffers[i][5];
			mesh[ name ] = new Float32Array(data); //are they always float32? I think so
		}
		
		if(indicesArray.length)
			mesh.triangles = new Uint16Array(indicesArray);

		//console.log(mesh);


		//swap coords (X,Y,Z) -> (X,Z,-Y)
		if(flip && !this.no_flip)
		{
			var tmp = 0;
			var array = mesh.vertices;
			for(var i = 0, l = array.length; i < l; i += 3)
			{
				tmp = array[i+1]; 
				array[i+1] = array[i+2];
				array[i+2] = -tmp; 
			}

			array = mesh.normals;
			for(var i = 0, l = array.length; i < l; i += 3)
			{
				tmp = array[i+1]; 
				array[i+1] = array[i+2];
				array[i+2] = -tmp; 
			}
		}

		//extra info
		mesh.filename = id;
		mesh.object_type = "Mesh";
		return mesh;
		
	},

	//like querySelector but allows spaces in names...
	findXMLNodeById: function(root, nodename, id)
	{
		var childs = root.childNodes;
		for(var i = 0; i < childs.length; ++i)
		{
			var xmlnode = childs[i];
			if(xmlnode.nodeType != 1 ) //no tag
				continue;
			if(xmlnode.localName != nodename)
				continue;
			var node_id = xmlnode.getAttribute("id");
			if(node_id == id)
				return xmlnode;
		}
		return null;
	},

	readAnimations: function(root, scene)
	{
		var xmlanimations = root.querySelector("library_animations");
		if(!xmlanimations) return null;

		var xmlanimation_childs = xmlanimations.childNodes;

		var animations = {
			object_type: "Animation",
			takes: {}
		};

		var default_take = { tracks: [] };
		var tracks = default_take.tracks;

		for(var i = 0; i < xmlanimation_childs.length; ++i)
		{
			var xmlanimation = xmlanimation_childs[i];
			if(xmlanimation.nodeType != 1 ) //no tag
				continue;

			var anim_id = xmlanimation.getAttribute("id");

			xmlanimation = xmlanimation.querySelector("animation"); //yes... DAE has <animation> inside animation...
			if(!xmlanimation) continue;


			//channels are like animated properties
			var xmlchannel = xmlanimation.querySelector("channel");
			if(!xmlchannel) continue;

			var source = xmlchannel.getAttribute("source");
			var target = xmlchannel.getAttribute("target");

			//sampler, is in charge of the interpolation
			//var xmlsampler = xmlanimation.querySelector("sampler" + source);
			xmlsampler = this.findXMLNodeById(xmlanimation, "sampler", source.substr(1) );
			if(!xmlsampler)
			{
				console.error("Error DAE: Sampler not found in " + source);
				continue;
			}

			var inputs = {};
			var sources = {};
			var params = {};
			var xmlinputs = xmlsampler.querySelectorAll("input");

			var time_data = null;

			//iterate inputs
			for(var j = 0; j < xmlinputs.length; j++)
			{
				var xmlinput = xmlinputs[j];
				var source_name =  xmlinput.getAttribute("source");
				var semantic = xmlinput.getAttribute("semantic");

				//Search for source
				var xmlsource = this.findXMLNodeById( xmlanimation, "source", source_name.substr(1) );
				if(!xmlsource)
					continue;

				var xmlparam = xmlsource.querySelector("param");
				if(!xmlparam) continue;

				var type = xmlparam.getAttribute("type");
				inputs[ semantic ] = { source: source_name, type: type };

				var data_array = null;

				if(type == "float" || type == "float4x4")
				{
					var xmlfloatarray = xmlsource.querySelector("float_array");
					var floats = this.readContentAsFloats( xmlfloatarray );
					sources[ source_name ] = floats;
					data_array = floats;

				}
				else //only floats and matrices are supported in animation
					continue;

				var param_name = xmlparam.getAttribute("name");
				if(param_name == "TIME")
					time_data = data_array;
				params[ param_name || "OUTPUT" ] = type;
			}

			if(!time_data)
			{
				console.error("Error DAE: no TIME info found in animation: " + anim_id);
				continue;
			}

			//construct animation
			var path = target.split("/");

			var anim = {}
			anim.nodename = this.safeString( path[0] ); //where it goes
			anim.property = path[1];
			var node = this._nodes_by_id[ anim.nodename ];

			var element_size = 1;
			var param_type = params["OUTPUT"];
			switch(param_type)
			{
				case "float": element_size = 1; break;
				case "float3x3": element_size = 9; break;
				case "float4x4": element_size = 16; break;
				default: break;
			}

			anim.value_size = element_size;
			anim.duration = time_data[ time_data.length - 1]; //last sample

			var value_data = sources[ inputs["OUTPUT"].source ];
			if(!value_data) continue;

			//Pack data ****************
			var num_samples = time_data.length;
			var sample_size = element_size + 1;
			var anim_data = new Float32Array( num_samples * sample_size );
			//for every sample
			for(var j = 0; j < time_data.length; ++j)
			{
				anim_data[j * sample_size] = time_data[j]; //set time
				var value = value_data.subarray( j * element_size, (j+1) * element_size );
				if(param_type == "float4x4")
				{
					this.transformMatrix( value, node._depth == 0 );
					//mat4.transpose(value, value);
				}
				anim_data.set(value, j * sample_size + 1); //set data
			}

			anim.data = anim_data;
			tracks.push(anim);
		}

		if(!tracks.length) 
			return null; //empty animation

		animations.takes["default"] = default_take;
		return animations;
	},		

	findNode: function(root, id)
	{
		if(root.id == id) return root;
		if(root.children)
			for(var i in root.children)
			{
				var ret = this.findNode(root.children[i], id);
				if(ret) return ret;
			}
		return null;
	},

	//used for skinning and morphing
	readController: function(id, flip, scene)
	{
		//get root
		var xmlcontroller = this._xmlroot.querySelector("controller" + id);
		if(!xmlcontroller) return null;

		var use_indices = false;
		var xmlskin = xmlcontroller.querySelector("skin");
		if(xmlskin)
			return this.readSkinController(xmlskin, flip, scene);

		var xmlmorph = xmlcontroller.querySelector("morph");
		if(xmlmorph)
			return this.readMorphController(xmlmorph, flip, scene);

		return null;
	},

	//read this to more info about DAE and skinning https://collada.org/mediawiki/index.php/Skinning
	readSkinController: function(xmlskin, flip, scene)
	{
		//base geometry
		var id_geometry = xmlskin.getAttribute("source");
		var mesh = this.readGeometry( id_geometry, flip );
		if(!mesh)
			return null;

		var sources = this.readSources(xmlskin, flip);
		if(!sources)
			return null;

		//matrix
		var bind_matrix = null;
		var xmlbindmatrix = xmlskin.querySelector("bind_shape_matrix");
		if(xmlbindmatrix)
		{
			bind_matrix = this.readContentAsFloats( xmlbindmatrix );
			this.transformMatrix(bind_matrix, true, true );			
		}
		else
			bind_matrix = mat4.create(); //identity

		//joints
		var joints = [];
		var xmljoints = xmlskin.querySelector("joints");
		if(xmljoints)
		{
			var joints_source = null; //which bones
			var inv_bind_source = null; //bind matrices
			var xmlinputs = xmljoints.querySelectorAll("input");
			for(var i = 0; i < xmlinputs.length; i++)
			{
				var xmlinput = xmlinputs[i];
				var sem = xmlinput.getAttribute("semantic").toUpperCase();
				var src = xmlinput.getAttribute("source");
				var source = sources[ src.substr(1) ];
				if(sem == "JOINT")
					joints_source = source;
				else if(sem == "INV_BIND_MATRIX")
					inv_bind_source = source;
			}

			//save bone names and inv matrix
			if(!inv_bind_source || !joints_source)
			{
				console.error("Error DAE: no joints or inv_bind sources found");
				return null;
			}

			for(var i in joints_source)
			{
				//get the inverse of the bind pose
				var inv_mat = inv_bind_source.subarray(i*16,i*16+16);
				var nodename = joints_source[i];
				var node = this._nodes_by_id[ nodename ];
				this.transformMatrix(inv_mat, node._depth == 0, true );
				joints.push([ nodename, inv_mat ]);
			}
		}

		//weights
		var xmlvertexweights = xmlskin.querySelector("vertex_weights");
		if(xmlvertexweights)
		{
			//here we see the order 
			var weights_indexed_array = null;
			var xmlinputs = xmlvertexweights.querySelectorAll("input");
			for(var i = 0; i < xmlinputs.length; i++)
			{
				if( xmlinputs[i].getAttribute("semantic").toUpperCase() == "WEIGHT" )
					weights_indexed_array = sources[ xmlinputs[i].getAttribute("source").substr(1) ];
			}

			if(!weights_indexed_array)
				throw("no weights found");

			var xmlvcount = xmlvertexweights.querySelector("vcount");
			var vcount = this.readContentAsUInt32( xmlvcount );

			var xmlv = xmlvertexweights.querySelector("v");
			var v = this.readContentAsUInt32( xmlv );

			var num_vertices = mesh.vertices.length / 3; //3 components per vertex
			var weights_array = new Float32Array(4 * num_vertices); //4 bones per vertex
			var bone_index_array = new Uint8Array(4 * num_vertices); //4 bones per vertex

			var pos = 0;
			var remap = mesh._remap;
			var max_bone = 0; //max bone affected

			for(var i = 0; i < vcount.length; ++i)
			{
				var num_bones = vcount[i]; //num bones influencing this vertex

				//find 4 with more influence
				//var v_tuplets = v.subarray(offset, offset + num_bones*2);

				var offset = pos;
				var b = bone_index_array.subarray(i*4, i*4 + 4);
				var w = weights_array.subarray(i*4, i*4 + 4);

				var sum = 0;
				for(var j = 0; j < num_bones && j < 4; ++j)
				{
					b[j] = v[offset + j*2];
					if(b[j] > max_bone) max_bone = b[j];

					w[j] = weights_indexed_array[ v[offset + j*2 + 1] ];
					sum += w[j];
				}

				//normalize weights
				if(num_bones > 4 && sum < 1.0)
				{
					var inv_sum = 1/sum;
					for(var j = 0; j < 4; ++j)
						w[j] *= inv_sum;
				}

				pos += num_bones * 2;
			}


			//remap: because vertices order is now changed after parsing the mesh
			var final_weights = new Float32Array(4 * num_vertices); //4 bones per vertex
			var final_bone_indices = new Uint8Array(4 * num_vertices); //4 bones per vertex
			for(var i = 0; i < num_vertices; ++i)
			{
				var p = remap[ i ] * 4;
				var w = weights_array.subarray(p,p+4);
				var b = bone_index_array.subarray(p,p+4);

				//sort by weight so relevant ones goes first
				for(var k = 0; k < 3; ++k)
				{
					var max_pos = k;
					var max_value = w[k];
					for(var j = k+1; j < 4; ++j)
					{
						if(w[j] <= max_value)
							continue;
						max_pos = j;
						max_value = w[j];
					}
					if(max_pos != k)
					{
						var tmp = w[k];
						w[k] = w[max_pos];
						w[max_pos] = tmp;
						tmp = b[k];
						b[k] = b[max_pos];
						b[max_pos] = tmp;
					}
				}

				//store
				final_weights.set( w, i*4);
				final_bone_indices.set( b, i*4);
			}

			//console.log("Bones: ", joints.length, "Max bone: ", max_bone);
			if(max_bone >= joints.length)
				console.warning("Mesh uses higher bone index than bones found");

			mesh.weights = final_weights;
			mesh.bone_indices = final_bone_indices;
			mesh.bones = joints;
			mesh.bind_matrix = bind_matrix;
			delete mesh["_remap"];
		}

		return mesh;
	},

	readMorphController: function(xmlmorph, flip, scene)
	{
		var id_geometry = xmlmorph.getAttribute("source");
		var base_mesh = this.readGeometry( id_geometry, flip );
		if(!base_mesh)
			return null;

		//read sources with blend shapes info (which ones, and the weight)
		var sources = this.readSources(xmlmorph, flip);

		var morphs = [];

		//targets
		var xmltargets = xmlmorph.querySelector("targets");
		if(!xmltargets)
			return null;

		var xmlinputs = xmltargets.querySelectorAll("input");
		var targets = null;
		var weights = null;

		for(var i = 0; i < xmlinputs.length; i++)
		{
			var semantic = xmlinputs[i].getAttribute("semantic").toUpperCase();
			var data = sources[ xmlinputs[i].getAttribute("source").substr(1) ];
			if( semantic == "MORPH_TARGET" )
				targets = data;
			else if( semantic == "MORPH_WEIGHT" )
				weights = data;
		}

		if(!targets || !weights)
			return null;

		//get targets
		for(var i in targets)
		{
			var id = "#" + targets[i];
			var geometry = this.readGeometry( id, flip );
			scene.resources[id] = geometry;
			morphs.push([id, weights[i]]);
		}

		return { type: "morph", mesh: base_mesh, morph_targets: morphs };
	},

	readSources: function(xmlnode, flip)
	{
		//for data sources
		var sources = {};
		var xmlsources = xmlnode.querySelectorAll("source");
		for(var i = 0; i < xmlsources.length; i++)
		{
			var xmlsource = xmlsources[i];
			if(!xmlsource.querySelector) 
				continue;

			var float_array = xmlsource.querySelector("float_array");
			if(float_array)
			{
				var floats = this.readContentAsFloats( xmlsource );
				sources[ xmlsource.getAttribute("id") ] = floats;
				continue;
			}

			var name_array = xmlsource.querySelector("Name_array");
			if(name_array)
			{
				var names = this.readContentAsStringsArray( name_array );
				if(!names)
					continue;
				sources[ xmlsource.getAttribute("id") ] = names;
				continue;
			}
		}

		return sources;
	},

	readContentAsUInt32: function(xmlnode)
	{
		if(!xmlnode) return null;
		var text = xmlnode.textContent;
		text = text.replace(/\n/gi, " "); //remove line breaks
		text = text.trim(); //remove empty spaces
		if(text.length == 0) return null;
		var numbers = text.split(" "); //create array
		var floats = new Uint32Array( numbers.length );
		for(var k = 0; k < numbers.length; k++)
			floats[k] = parseInt( numbers[k] );
		return floats;
	},

	readContentAsFloats: function(xmlnode)
	{
		if(!xmlnode) return null;
		var text = xmlnode.textContent;
		text = text.replace(/\n/gi, " "); //remove line breaks
		text = text.replace(/\s\s/gi, " ");
		text = text.trim(); //remove empty spaces
		var numbers = text.split(" "); //create array
		var length = xmlnode.getAttribute("count") || numbers.length;
		var floats = new Float32Array( length );
		for(var k = 0; k < numbers.length; k++)
			floats[k] = parseFloat( numbers[k] );
		return floats;
	},
	
	readContentAsStringsArray: function(xmlnode)
	{
		if(!xmlnode) return null;
		var text = xmlnode.textContent;
		text = text.replace(/\n/gi, " "); //remove line breaks
		text = text.replace(/\s\s/gi, " ");
		text = text.trim(); //remove empty spaces
		var words = text.split(" "); //create array
		for(var k = 0; k < words.length; k++)
			words[k] = words[k].trim();
		if(xmlnode.getAttribute("count") && parseInt(xmlnode.getAttribute("count")) != words.length)
		{
			var merged_words = [];
			var name = "";
			for (var i in words)
			{
				if(!name)
					name = words[i];
				else
					name += " " + words[i];
				if(!this._nodes_by_id[ this.safeString(name) ])
					continue;
				merged_words.push( this.safeString(name) );
				name = "";
			}

			var count = parseInt(xmlnode.getAttribute("count"));
			if(merged_words.length == count)
				return merged_words;

			console.error("Error: bone names have spaces, avoid using spaces in names");
			return null;
		}
		return words;
	},

	max3d_matrix_0: new Float32Array([0, -1, 0, 0, 0, 0, -1, 0, 1, 0, 0, -0, 0, 0, 0, 1]),
	//max3d_matrix_other: new Float32Array([0, -1, 0, 0, 0, 0, -1, 0, 1, 0, 0, -0, 0, 0, 0, 1]),

	transformMatrix: function(matrix, first_level, inverted)
	{
		mat4.transpose(matrix,matrix);

		if(this.no_flip)
			return matrix;

		//WARNING: DO NOT CHANGE THIS FUNCTION, THE SKY WILL FALL
		if(first_level){

			//flip row two and tree
			var temp = new Float32Array(matrix.subarray(4,8)); //swap rows
			matrix.set( matrix.subarray(8,12), 4 );
			matrix.set( temp, 8 );

			//reverse Z
			temp = matrix.subarray(8,12);
			vec4.scale(temp,temp,-1);
		}
		else 
		{
			var M = mat4.create();
			var m = matrix;

			//if(inverted) mat4.invert(m,m);

			/* non trasposed
			M.set([m[0],m[8],-m[4]], 0);
			M.set([m[2],m[10],-m[6]], 4);
			M.set([-m[1],-m[9],m[5]], 8);
			M.set([m[3],m[11],-m[7]], 12);
			*/

			M.set([m[0],m[2],-m[1]], 0);
			M.set([m[8],m[10],-m[9]], 4);
			M.set([-m[4],-m[6],m[5]], 8);
			M.set([m[12],m[14],-m[13]], 12);

			m.set(M);

			//if(inverted) mat4.invert(m,m);

		}
		return matrix;
	},

	debugMatrix: function(str, first_level )
	{
		var m = new Float32Array( JSON.parse("["+str.split(" ").join(",")+"]") );
		return this.transformMatrix(m, first_level );
	}

};
Parser.registerParser(parserDAE);

mat4.fromDAE = function(str)
{
	var m = new Float32Array( JSON.parse("["+str.split(" ").join(",")+"]") );
	mat4.transpose(m,m);
	return m;
}

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
		//console.log( DDS.getDDSTextureFromMemoryEx(data) );
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
		mesh.bounding = Mesh.computeBounding(mesh.vertices);
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
/**
* The SceneTree contains all the info about the Scene and nodes
*
* @class SceneTree
* @constructor
*/

function SceneTree()
{
	this._uid = LS.generateUId();

	this._root = new LS.SceneNode("root");
	this._root.removeAllComponents();
	this._root._is_root  = true;
	this._root._in_tree = this;
	this._nodes = [ this._root ];
	this._nodes_by_id = {"root":this._root};

	LEvent.bind(this,"treeItemAdded", this.onNodeAdded.bind(this));
	LEvent.bind(this,"treeItemRemoved", this.onNodeRemoved.bind(this));


	this.init();
}

//globals
SceneTree.DEFAULT_BACKGROUND_COLOR = new Float32Array([0,0,0,1]);
SceneTree.DEFAULT_AMBIENT_COLOR = vec3.fromValues(0.2, 0.2, 0.2);

//LS.extendClass(ComponentContainer, SceneTree); //container methods

Object.defineProperty( SceneTree.prototype, "root", {
	enumerable: true,
	get: function() {
		return this._root;
	},
	set: function(v) {
		throw("Root node cannot be replaced");
	}
});

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
	//this.materials = {}; //shared materials cache: moved to LS.RM.resources
	this.local_repository = null;

	this._root.removeAllComponents();
	this._nodes = [ this._root ];
	this._nodes_by_id = {"root":this._root};
	this.rt_cameras = [];

	//this._components = []; //remove all components

	this._root.addComponent( new Camera() );
	this.current_camera = this._root.camera;

	this._root.addComponent( new Light({ position: vec3.fromValues(100,100,100), target: vec3.fromValues(0,0,0) }) );

	this.ambient_color = new Float32Array( SceneTree.DEFAULT_AMBIENT_COLOR );
	this.background_color = new Float32Array( SceneTree.DEFAULT_BACKGROUND_COLOR );
	this.textures = {};

	this._frame = 0;
	this._last_collect_frame = -1; //force collect
	this._time = 0;
	this._global_time = 0; //in seconds
	this._start_time = 0; //in seconds
	this._last_dt = 1/60; //in seconds
	this._must_redraw = true;

	if(this.selected_node) delete this.selected_node;

	this.extra = {};

	this._renderer = LS.Renderer;
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
	while(this._root._children && this._root._children.length)
		this._root.removeChild(this._root._children[0]);

	//remove scene components
	this._root.processActionInComponents("onRemovedFromNode",this); //send to components
	this._root.processActionInComponents("onRemovedFromScene",this); //send to components

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
	this._root.removeAllComponents(); //remove light and camera

	//this._components = [];
	//this.camera = this.light = null; //legacy

	if(scene_info.object_type != "SceneTree")
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

	if(scene_info.root)
		this.root.configure( scene_info.root );

	//legacy
	if(scene_info.nodes)
		this.root.configure( { children: scene_info.nodes } );

	//parse materials
	/*
	if(scene_info.materials)
		for(var i in scene_info.materials)
			this.materials[ i ] = new Material( scene_info.materials[i] );
	*/

	//legacy
	if(scene_info.components)
		this._root.configureComponents(scene_info);

	// LEGACY...
	if(scene_info.camera)
	{
		if(this._root.camera)
			this._root.camera.configure( scene_info.camera );
		else
			this._root.addComponent( new Camera( scene_info.camera ) );
	}

	if(scene_info.light)
	{
		if(this._root.light)
			this._root.light.configure( scene_info.light );
		else
			this._root.addComponent( new Light(scene_info.light) );
	}
	else if(scene_info.hasOwnProperty("light")) //light is null
	{
		//skip default light
		if(this._root.light)
		{
			this._root.removeComponent( this._root.light );
			this._root.light = null;
		}
	}

	//if(scene_info.animations)
	//	this._root.animations = scene_info.animations;

	LEvent.trigger(this,"configure",scene_info);
	LEvent.trigger(this,"change");
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

	o.object_type = getObjectClassName(this);

	//legacy
	o.local_repository = this.local_repository;

	//this is ugly but scenes can have also some rendering properties
	o.ambient_color = toArray( this.ambient_color );
	o.background_color = toArray( this.background_color ); //to non-typed
	o.textures = cloneObject(this.textures);

	//o.nodes = [];
	o.extra = this.extra || {};

	//add nodes
	o.root = this.root.serialize();

	//add shared materials
	/*
	if(this.materials)
	{
		o.materials = {};
		for(var i in this.materials)
			o.materials[ i ] = this.materials[i].serialize();
	}
	*/

	//serialize scene components
	//this.serializeComponents(o);

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
	if(!url) return;
	var that = this;
	var nocache = ResourcesManager.getNoCache(true);
	if(nocache)
		url += (url.indexOf("?") == -1 ? "?" : "&") + nocache;


	LS.request({
		url: url,
		dataType: 'json',
		success: inner_success,
		error: inner_error
	});

	function inner_success(response)
	{
		that.init();
		that.configure(response);
		that.loadResources(inner_all_loaded);
	}

	function inner_all_loaded()
	{
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
	//clone: because addNode removes it from scene.nodes array
	var nodes = scene.root.childNodes;

	/*
	//bring materials
	for(var i in scene.materials)
		this.materials[i] = scene.materials[i];
	*/
	
	//add every node one by one
	for(var i in nodes)
	{
		var node = nodes[i];
		var new_node = new LS.SceneNode( node.id );
		this.root.addChild( new_node );
		new_node.configure( node.constructor == LS.SceneNode ? node.serialize() : node  );
	}
}

SceneTree.prototype.getCamera = function()
{
	return this._root.camera;
}

SceneTree.prototype.getLight = function()
{
	return this._root.light;
}

/*
SceneTree.prototype.removeNode = function(node)
{
	if(!node._in_tree || node._in_tree != this)
		return;
	node.parentNode.removeChild(node);
}
*/

SceneTree.prototype.onNodeAdded = function(e,node)
{
	//remove from old scene
	if(node._in_tree && node._in_tree != this)
		throw("Cannot add a node from other scene, clone it");

	//generate unique id
	if(node.id && node.id != -1)
	{
		if(this._nodes_by_id[node.id] != null)
			node.id = node.id + "_" + (Math.random() * 1000).toFixed(0);
		this._nodes_by_id[node.id] = node;
	}

	//store
	this._nodes.push(node);

	//LEvent.trigger(node,"onAddedToScene", this);
	node.processActionInComponents("onAddedToScene",this); //send to components
	LEvent.trigger(this,"nodeAdded", node);
	LEvent.trigger(this,"change");
}

SceneTree.prototype.onNodeRemoved = function(e,node)
{
	var pos = this._nodes.indexOf(node);
	if(pos == -1) return;

	this._nodes.splice(pos,1);
	if(node.id)
		delete this._nodes_by_id[ node.id ];

	node.processActionInComponents("onRemovedFromNode",this); //send to components
	node.processActionInComponents("onRemovedFromScene",this); //send to components

	LEvent.trigger(this,"nodeRemoved", node);
	LEvent.trigger(this,"change");
	return true;
}


SceneTree.prototype.getNodes = function()
{
	return this._nodes;
}

/*
SceneTree.prototype.getNodes = function()
{
	var r = [];
	getnodes(this.root, r);

	function getnodes(node, result)
	{
		for(var i in node._children)
		{
			var n = node._children[i];
			result.push(n);
			if(n._children && n._children.length)
				getnodes(n,result);
		}
	}

	return r;
}
*/

/**
* retrieves a Node
*
* @method getNode
* @param {String} id node id
* @return {Object} the node or null if it didnt find it
*/

SceneTree.prototype.getNode = function(id)
{
	return this._nodes_by_id[id];
}

//for those who are more traditional
SceneTree.prototype.getElementById = SceneTree.prototype.getNode;


SceneTree.prototype.filterNodes = function( filter )
{
	var r = [];
	for(var i in this._nodes)
		if( filter(this._nodes[i]) )
			r.push(this._nodes[i]);
	return r;
}



/**
* retrieves a Node
*
* @method getNodeByUid
* @param {number} uid number
* @return {Object} the node or null if it didnt find it
*/

/*
SceneTree.prototype.getNodeByUid = function(uid)
{
	for(var i in this.nodes)
		if(this.nodes[i]._uid == uid)
			return this.nodes[i];
	return null;
}
*/

/**
* retrieves a Node by its index
*
* @method getNodeByIndex
* @param {Number} node index
* @return {Object} returns the node at the 'index' position in the nodes array
*/
/*
SceneTree.prototype.getNodeByIndex = function(index)
{
	return this.nodes[index];
}
*/

/**
* retrieves a Node index
*
* @method getNodeIndex
* @param {Node} node
* @return {Number} returns the node index in the nodes array
*/
/*
SceneTree.prototype.getNodeIndex = function(node)
{
	return this.nodes.indexOf(node);
}
*/

/**
* retrieves a Node
*
* @method getNodesByClass
* @param {String} className class name
* @return {Object} returns all the nodes that match this class name
*/

/*
SceneTree.prototype.getNodesByClass = function(classname)
{
	var r = [];
	for (var i in this.nodes)
		if(this.nodes[i].className && this.nodes[i].className.split(" ").indexOf(classname) != -1)
			r.push(this.nodes[i]);
	return r;
}
*/


/**
* loads all the resources of all the nodes in this scene
* it sends a signal to every node to get all the resources info
* and load them in bulk using the ResourceManager
*
* @method loadResources
*/

SceneTree.prototype.loadResources = function(on_complete)
{
	var res = {};

	//scene resources
	for(var i in this.textures)
		if(this.textures[i])
			res[ this.textures[i] ] = Texture;

	if(this.light) this.light.getResources(res);

	//resources from nodes
	for(var i in this._nodes)
		this._nodes[i].getResources(res);

	//used for scenes with special repository folders
	var options = {};
	if(this.local_repository)
		options.local_repository = this.local_repository;

	//count resources
	var num_resources = 0;
	for(var i in res)
		++num_resources;

	//load them
	if(num_resources == 0)
	{
		if(on_complete)
			on_complete();
		return;
	}

	LEvent.bind( LS.ResourcesManager, "end_loading_resources", on_loaded );
	LS.ResourcesManager.loadResources(res);

	function on_loaded()
	{
		LEvent.unbind( LS.ResourcesManager, "end_loading_resources", on_loaded );
		if(on_complete)
			on_complete();
	}
}

/**
* start the scene (triggers and start event)
*
* @method start
* @param {Number} dt delta time
*/
SceneTree.prototype.start = function()
{
	if(this._state == "running") return;

	this._state = "running";
	this._start_time = getTime() * 0.001;
	LEvent.trigger(this,"start",this);
	this.triggerInNodes("start");
}

/**
* stop the scene (triggers and start event)
*
* @method stop
* @param {Number} dt delta time
*/
SceneTree.prototype.stop = function()
{
	if(this._state == "stopped") return;

	this._state = "stopped";
	LEvent.trigger(this,"stop",this);
	this.triggerInNodes("stop");
}


/**
* renders the scene using the assigned renderer
*
* @method render
*/
SceneTree.prototype.render = function(camera, options)
{
	this._renderer.render(this, camera, options);
}

SceneTree.prototype.collectData = function()
{
	//var nodes = scene.nodes;
	var nodes = this.getNodes();
	var instances = [];
	var lights = [];
	var cameras = [];
	var colliders = [];

	//collect render instances, lights and cameras
	for(var i in nodes)
	{
		var node = nodes[i];

		if(node.flags.visible == false) //skip invisibles
			continue;

		//trigger event
		LEvent.trigger(node, "computeVisibility"); //, {camera: camera} options: options }

		//compute global matrix
		if(node.transform)
			node.transform.updateGlobalMatrix();

		//special node deformers (done here because they are shared for every node)
			//this should be moved to Renderer but not a clean way to do it
			var node_macros = {};
			LEvent.trigger(node, "computingShaderMacros", node_macros );

			var node_uniforms = {};
			LEvent.trigger(node, "computingShaderUniforms", node_uniforms );

		//store info
		node._macros = node_macros;
		node._uniforms = node_uniforms;
		node._instances = [];

		//get render instances: remember, triggers only support one parameter
		LEvent.trigger(node,"collectRenderInstances", node._instances );
		LEvent.trigger(node,"collectPhysicInstances", colliders );
		LEvent.trigger(node,"collectLights", lights );
		LEvent.trigger(node,"collectCameras", cameras );

		instances = instances.concat( node._instances );
	}

	//for each render instance collected
	for(var j in instances)
	{
		var instance = instances[j];
		instance.computeNormalMatrix();
		//compute the axis aligned bounding box
		if(!(instance.flags & RI_IGNORE_FRUSTUM))
			instance.updateAABB();
	}

	//for each physics instance collected
	for(var j in colliders)
	{
		var collider = colliders[j];
		collider.updateAABB();
	}

	this._instances = instances;
	this._lights = lights;
	this._cameras = cameras;
	this._colliders = colliders;

	//remember when was last time I collected to avoid repeating it
	this._last_collect_frame = this._frame;
}


SceneTree.prototype.update = function(dt)
{
	LEvent.trigger(this,"beforeUpdate", this);

	this._global_time = getTime() * 0.001;
	this._time = this._global_time - this._start_time;
	this._last_dt = dt;

	LEvent.trigger(this,"update", dt);
	this.triggerInNodes("update",dt, true);

	LEvent.trigger(this,"afterUpdate", this);
}

/**
* triggers an event to all nodes in the scene
*
* @method triggerInNodes
* @param {String} event_type event type name
* @param {Object} data data to send associated to the event
*/

SceneTree.prototype.triggerInNodes = function(event_type, data)
{
	LEvent.triggerArray( this._nodes, event_type, data);
}


SceneTree.prototype.generateUniqueNodeName = function(prefix)
{
	prefix = prefix || "node";
	var i = 1;

	var pos = prefix.lastIndexOf("_");
	if(pos)
	{
		var n = prefix.substr(pos+1);
		if( parseInt(n) )
		{
			i = parseInt(n);
			prefix = prefix.substr(0,pos);
		}
	}

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
	return this._time;
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
LS.extendClass(ComponentContainer, SceneNode); //container methods
LS.extendClass(CompositePattern, SceneNode); //container methods

/**
* changes the node id (its better to do not change the id, it can lead to unexpected results)
* remember that two nodes can't have the same id
* @method setId
* @param {String} new_id the new id
* @return {Object} returns true if the name changed
*/

SceneNode.prototype.setId = function(new_id)
{
	if(this.id == new_id) return true; //no changes

	var scene = this._in_tree;
	if(!scene)
	{
		this.id = new_id;
		return;
	}

	if( scene.getNode(new_id) != null)
	{
		console.error("ID already in use");
		return false;
	}

	if(this.id)
		delete scene._nodes_by_id[this.id];

	this.id = new_id;
	if(this.id)
		scene._nodes_by_id[ this.id ] = this;

	LEvent.trigger(this,"idChanged", new_id);
	LEvent.trigger(Scene,"nodeIdChanged", this);
	return true;
}

SceneNode.prototype.getResources = function(res, include_children)
{
	//resources in components
	for(var i in this._components)
		if( this._components[i].getResources )
			this._components[i].getResources( res );

	//res in material
	if(this.material)
	{
		if(typeof(this.material) == "string")
		{
			if(this.material[0] != ":") //not a local material, then its a reference
			{
				res[this.material] = LS.Material;
			}
		}
		else //get the material to get the resources
		{
			var mat = this.getMaterial();
			if(mat)
				mat.getResources( res );
		}
	}

	//prefab
	if(this.prefab)
		res[this.prefab] = LS.Prefab;

	//propagate
	if(include_children)
		for(var i in this._children)
			this._children[i].getResources(res, true);

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
	if(this.material.constructor === String)
		return this._in_tree ? LS.ResourcesManager.materials[ this.material ] : null;
	return this.material;
}


SceneNode.prototype.setPrefab = function(prefab_name)
{
	this._prefab_name = prefab_name;
	var prefab = LS.ResourcesManager.resources[prefab_name];
	if(!prefab)
		return;


}


/**
* remember clones this node and returns the new copy (you need to add it to the scene to see it)
* @method clone
* @return {Object} returns a cloned version of this node
*/

SceneNode.prototype.clone = function()
{
	var scene = this._in_tree;

	var new_name = scene ? scene.generateUniqueNodeName( this.id ) : this.id ;
	var newnode = new SceneNode( new_name );
	var info = this.serialize();
	info.id = null;
	newnode.configure( info );

	/*
	//clone children (none of them is added to the SceneTree)
	for(var i in this._children)
	{
		var new_child_name = scene ? scene.generateUniqueNodeName( this._children[i].id ) : this._children[i].id;
		var childnode = new SceneNode( new_child_name );
		var info = this._children[i].serialize();
		info.id = null;
		childnode.configure( info );
		newnode.addChild(childnode);
	}
	*/

	return newnode;
}

/**
* Configure this node from an object containing the info
* @method configure
* @param {Object} info the object with all the info (comes from the serialize method)
*/
SceneNode.prototype.configure = function(info)
{
	if (info.id) this.setId(info.id);
	if (info.className)	this.className = info.className;

	//useful parsing
	if(info.mesh)
	{
		var mesh = info.mesh;
		if(typeof(mesh) == "string")
			mesh = ResourcesManager.meshes[mesh];

		if(mesh)
		{
			if(mesh.bones)
				this.addComponent( new SkinnedMeshRenderer({ mesh: info.mesh, submesh_id: info.submesh_id }) );
			else
				this.addComponent( new MeshRenderer({ mesh: info.mesh, submesh_id: info.submesh_id, morph_targets: info.morph_targets }) );
		}
	}

	//first the no components
	if(info.material)
	{
		var mat_class = info.material.material_class;
		if(!mat_class) 
			mat_class = "Material";
		this.material = typeof(info.material) == "string" ? info.material : new LS.MaterialClasses[mat_class](info.material);
	}

	if(info.flags) //merge
		for(var i in info.flags)
			this.flags[i] = info.flags[i];
	
	//DEPRECATED: hardcoded components
	if(info.transform) this.transform.configure( info.transform ); //all nodes have a transform
	if(info.light) this.addComponent( new Light(info.light) );
	if(info.camera)	this.addComponent( new Camera(info.camera) );

	//DEPRECATED: model in matrix format
	if(info.model) this.transform.fromMatrix( info.model ); 

	if(info.prefab) this.prefab = info.prefab;

	//add animation
	if(info.animations)
	{
		this.animations = info.animations;
		this.addComponent( new PlayAnimation({animation:this.animations}) );
	}

	//extra user info
	if(info.extra)
		this.extra = info.extra;

	if(info.comments)
		this.comments = info.comments;

	//restore components
	if(info.components)
		this.configureComponents(info);

	this.configureChildren(info);

	//ierarchy: this goes last because it needs to read transform
	/*
	if(info.parent_id) //name of the parent
	{
		if(this._in_tree)
		{
			var parent = this._in_tree.getNode( info.parent_id );
			if(parent) 
				parent.addChild( this );
		}
		else
			this.parent = info.parent_id;
	}
	*/

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
	if(this.prefab) o.prefab = this.prefab;

	if(this.flags) o.flags = cloneObject(this.flags);

	//extra user info
	if(this.extra) o.extra = this.extra;
	if(this.comments) o.comments = this.comments;

	if(this._children)
		o.children = this.serializeChildren();

	//save children ierarchy
	//if(this.parentNode)
	//	o.parent_id = this.parentNode.id;
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

SceneNode.prototype._onChildAdded = function(node, recompute_transform)
{
	if(recompute_transform && this.transform)
	{
		var M = node.transform.getGlobalMatrix(); //get son transform
		var M_parent = this.transform.getGlobalMatrix(); //parent transform
		mat4.invert(M_parent,M_parent);
		node.transform.fromMatrix( mat4.multiply(M_parent,M_parent,M) );
	}
	//link transform
	if(this.transform)
		node.transform._parent = this.transform;
}

SceneNode.prototype._onChangeParent = function(future_parent, recompute_transform)
{
	if(recompute_transform && future_parent.transform)
	{
		var M = this.transform.getGlobalMatrix(); //get son transform
		var M_parent = future_parent.transform.getGlobalMatrix(); //parent transform
		mat4.invert(M_parent,M_parent);
		this.transform.fromMatrix( mat4.multiply(M_parent,M_parent,M) );
	}
	//link transform
	if(future_parent.transform)
		this.transform._parent = future_parent.transform;
}

SceneNode.prototype._onChildRemoved = function(node, recompute_transform)
{
	if(this.transform)
	{
		//unlink transform
		if(recompute_transform)
		{
			var m = node.transform.getGlobalMatrix();
			node.transform._parent = null;
			node.transform.fromMatrix(m);
		}
		else
			node.transform._parent = null;
	}
}

//***************************************************************************

//create one default scene

LS.SceneTree = SceneTree;
LS.SceneNode = SceneNode;
var Scene = new SceneTree();

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
* A Prefab behaves as a container of something packed with resources. This allow to have in one single file
* textures, meshes, etc.
* @class Prefab
* @constructor
*/

function Prefab(o)
{
	if(o)
		this.configure(o);
}

/**
* configure the prefab
* @method configure
* @param {*} data
**/

Prefab.prototype.configure = function(data)
{
	var prefab_json = data["@json"];
	var resources_names = data["@resources_name"];
	this.prefab_json = prefab_json;

	//extract resource names
	if(resources_names)
	{
		var resources = {};
		for(var i in resources_names)
			resources[ resources_names[i] ] = data[ resources_names[i] ];
		this.resources = resources;
	}

	//store resources in ResourcesManager
	this.processResources();
}

Prefab.fromBinary = function(data)
{
	if(data.constructor == ArrayBuffer)
		data = WBin.load(data, true);

	return new Prefab(data);
}

Prefab.prototype.processResources = function()
{
	if(!this.resources)
		return;

	var resources = this.resources;

	//block this resources of being loaded, this is to avoid chain reactions when a resource uses 
	//another one contained in this Prefab
	for(var resname in resources)
	{
		if( LS.ResourcesManager.resources[resname] )
			continue; //already loaded
		LS.ResourcesManager.resources_being_processes[resname] = true;
	}

	//process and store in ResourcesManager
	for(var resname in resources)
	{
		if( LS.ResourcesManager.resources[resname] )
			continue; //already loaded

		var resdata = resources[resname];
		LS.ResourcesManager.processResource(resname,resdata);
	}
}

/**
* Creates an instance of the object inside the prefab
* @method createObject
* @return object contained 
**/

Prefab.prototype.createObject = function()
{
	if(!this.prefab_json)
		return null;

	var conf_data = JSON.parse(this.prefab_json);

	var node = new LS.SceneNode();
	node.configure(conf_data);
	ResourcesManager.loadResources( node.getResources({},true) );

	if(this.fullpath)
		node.prefab = this.fullpath;

	return node;
}

/**
* to create a new prefab, it packs all the data an instantiates the resource
* @method createPrefab
* @return object contained 
**/

Prefab.createPrefab = function(filename, node_data, resources)
{
	if(!filename) return;

	filename = filename.replace(/ /gi,"_");
	resources = resources || {};

	node_data.id = null; //remove the id
	node_data.object_type = "SceneNode";

	var prefab = new Prefab();
	filename += ".wbin";

	prefab.filename = filename;
	prefab.resources = resources;
	prefab.prefab_json = JSON.stringify( node_data );

	//get all the resources and store them
	var bindata = Prefab.packResources(resources, { "@json": prefab.prefab_json });
	prefab._original_file = bindata;

	return prefab;
}

Prefab.packResources = function(resources, base_data)
{
	var to_binary = base_data || {};
	var resources_name = [];
	for(var i in resources)
	{
		var res_name = resources[i];
		var resource = LS.ResourcesManager.resources[res_name];
		if(!resource) continue;

		var data = null;
		if(resource._original_data) //must be string or bytes
			data = resource._original_data;
		else
		{
			var data_info = LS.ResourcesManager.computeResourceInternalData(resource);
			data = data_info.data;
		}

		if(!data)
		{
			console.warning("Wrong data in resource");
			continue;
		}

		resources_name.push(res_name);
		to_binary[res_name] = data;
	}

	to_binary["@resources_name"] = resources_name;
	return WBin.create( to_binary, "Prefab" );
}

LS.Prefab = Prefab;


/**
* An Animation is a resource that contains samples of properties over time, similar to animation curves
* Values could be associated to an specific node.
* Data is contained in tracks
*
* @class Animation
* @namespace LS
* @constructor
*/

function Animation(o)
{
	this.takes = {}; //packs of tracks
	if(o)
		this.configure(o);
}

Animation.prototype.configure = function(data)
{
	if(data.takes)
	{
		for(var i in data.takes)
		{
			var take = data.takes[i];
			for(var j in take.tracks)
				this.addTrackToTake( i, new LS.Animation.Track( take.tracks[j] ) );
		}
	}
}

Animation.fromBinary = function(data)
{
	if(data.constructor == ArrayBuffer)
		data = WBin.load(data, true);

	var o = data["@json"];
	for(var i in o.takes)
	{
		var take = o.takes[i];
		for(var j in take.tracks)
		{
			var track = take.tracks[j];
			track.data = data["@track_" + track.data];
		}
	}

	return new Animation(o);
}

Animation.prototype.toBinary = function()
{
	var o = {};
	var tracks_data = [];

	//we need to remove the bin data to generate the JSON
	for(var i in this.takes)
	{
		var take = this.takes[i];
		for(var j in take.tracks)
		{
			var track = take.tracks[j];
			var bindata = track.data;
			var num = tracks_data.length;
			o["@track_" + num] = bindata;
			track.data = num;
			tracks_data.push(bindata); //to restore after
		}
	}

	//create the binary
	o["@json"] = { takes: this.takes };
	var bin = WBin.create(o, "Animation");

	//restore the bin data state in this instance
	for(var i in this.takes)
	{
		var take = this.takes[i];
		for(var j in take.tracks)
		{
			var track = take.tracks[j];
			track.data = tracks_data[ track.data ];
		}
	}

	return bin;
}

Animation.prototype.addTrackToTake = function(takename, track)
{
	var take = this.takes[takename];
	if(!take)
		take = this.takes[takename] = new Take();
	take.tracks.push(track);
}


LS.Animation = Animation;

/** Represents a set of animations **/
function Take(o)
{
	this.tracks = [];
	this.duration = 0;
}

Take.prototype.getPropertiesSample = function(time, result)
{
	result = result || [];
	for(var i in this.tracks)
	{
		var track = this.tracks[i];
		var value = track.getSample(time);
		result.push([track.nodename, track.property, value ]);
	}
	return result;
}

Take.prototype.actionPerSample = function(time, callback, options)
{
	for(var i in this.tracks)
	{
		var track = this.tracks[i];
		var value = track.getSample(time, true);
		if( options.disabled_tracks && options.disabled_tracks[ track.nodename ] )
			continue;

		callback(track.nodename, track.property, value, options);
	}
}

Animation.Take = Take;


/**
* Represents one track with data over time about one property
*
* @class Animation.Track
* @namespace LS
* @constructor
*/

function Track(o)
{
	this.nodename = ""; //nodename
	this.property = ""; //property
	this.duration = 0; //length of the animation
	this.value_size = 0; //how many numbers contains every sample of this property
	this.data = null;

	if(o)
		this.configure(o);
}

Track.prototype.configure = function(data)
{
	this.property = data.property;
	this.duration = data.duration;
	this.nodename = data.nodename;
	this.value_size = data.value_size;
	this.data = data.data;
}

Track.prototype.getSample = function(time, interpolate)
{
	var local_time = (time % this.duration);
	if(local_time < 0)
		local_time = this.duration + local_time;

	var data = this.data;
	var last_time = 0;

	var value = data.subarray(1,offset);
	var last_value = value;

	var value_size = this.value_size;
	var offset = this.value_size + 1;
	var current_time = time;

	for(var p = 0, l = data.length; p < l; p += offset)
	{
		last_time = current_time;
		current_time = data[p];
		last_value = value;
		value = data.subarray(p + 1, p + offset);
		if(current_time < local_time) 
			continue;
		break;
	}

	if(!interpolate || last_value == value)
	{
		if(value_size == 1)
			return last_value[0];
		else
			return last_value;
	}

	var factor = (local_time - last_time) / (current_time - last_time);

	if(last_value != null && value != null)
	{
		if(value_size == 1)
			return last_value[0] * (1.0 - factor) +  value[0] * factor;
		else
		{
			if(!this._last_sample)	
				this._last_sample = new Float32Array( value_size );
			var result = this._last_sample;
			for(var i = 0; i < value_size; i++)
				result[i] = last_value[i] * (1.0 - factor) +  value[i] * factor;
			return result;
		}
	}
	else if(last_value != null)
		return last_value;
	return value;
}

Animation.Track = Track;
/**
* Context class allows to handle the app context easily without having to glue manually all events
	There is a list of options
	==========================
	- canvas: the canvas where the scene should be rendered, if not specified one will be created
	- container_id: string with container id where to create the canvas, width and height will be those from the container
	- width: the width for the canvas in case it is created without a container_id
	- height: the height for the canvas in case it is created without a container_id
	- resources: string with the path to the resources folder
	- shaders: string with the url to the shaders.xml file
	- redraw: boolean to force to render the scene constantly (useful for animated scenes)
	Optional callbacks to attach
	============================
	- onPreDraw: executed before drawing a frame
	- onDraw: executed after drawing a frame
	- onPreUpdate(dt): executed before updating the scene (delta_time as parameter)
	- onUpdate(dt): executed after updating the scene (delta_time as parameter)
	- onMouse(e): when a mouse event is triggered
	- onKey(e): when a key event is triggered
* @namespace LS
* @class Context
* @constructor
* @param {Object} options settings for the webgl context creation
*/
function Context(options)
{
	options = options || {};

	if(options.container_id)
	{
		var container = document.getElementById(options.container_id);
		if(container)
		{
			var canvas = document.createElement("canvas");
			canvas.width = container.offsetWidth;
			canvas.height = container.offsetHeight;
			container.appendChild(canvas);
			options.canvas = canvas;
		}
	}

	this.gl = GL.create(options);
	this.canvas = this.gl.canvas;
	this.render_options = new RenderOptions();

	if(options.resources)
		LS.ResourcesManager.setPath( options.resources );
	if(options.shaders)
		ShadersManager.init( options.shaders );
	if(options.proxy)
		LS.ResourcesManager.setProxy( options.proxy );

	this.force_redraw = options.redraw || false;
	this.interactive = true;

	this.gl.ondraw = Context.prototype._ondraw.bind(this);
	this.gl.onupdate = Context.prototype._onupdate.bind(this);
	this.gl.onmousedown = Context.prototype._onmouse.bind(this);
	this.gl.onmousemove = Context.prototype._onmouse.bind(this);
	this.gl.onmouseup = Context.prototype._onmouse.bind(this);
	this.gl.onmousewheel = Context.prototype._onmouse.bind(this);
	this.gl.onkeydown = Context.prototype._onkey.bind(this);
	this.gl.onkeyup = Context.prototype._onkey.bind(this);

	gl.captureMouse(true);
	gl.captureKeys(true);
	gl.animate();
}

/**
* Loads an scene and triggers start
* @method loadScene
* @param {String} url url to the JSON file containing all the scene info
* @param {Function} on_complete callback trigged when the scene and the resources are loaded
*/
Context.prototype.loadScene = function(url, on_complete)
{
	Scene.loadScene(url, inner_start);

	function inner_start()
	{
		Scene.start();
		if(on_complete)
			on_complete();
	}
}

Context.prototype._ondraw = function()
{
	if(this.onPreDraw)
		this.onPreDraw();

	if(Scene._must_redraw || this.force_redraw )
		Scene.render( Scene.getCamera(), this.render_options );

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
	//trace(e);

	//check which node was clicked
	if(this.interactive && (e.eventType == "mousedown" || e.eventType == "mousewheel" ))
	{
		var node = Renderer.getNodeAtCanvasPosition(Scene, null, e.mousex,e.mousey);
		this._clicked_node = node;
	}

	var levent = null; //levent dispatched

	//send event to clicked node
	if(this._clicked_node && this._clicked_node.interactive)
	{
		e.scene_node = this._clicked_node;
		levent = LEvent.trigger(this._clicked_node,e.eventType,e);
	}

	//send event to root
	if(!levent || !levent.stop)
		LEvent.trigger(Scene.root,e.eventType,e);

	if(e.eventType == "mouseup")
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

	LEvent.trigger(Scene,e.eventType,e);
}

LS.Context = Context;

//here goes the ending of commonjs stuff
