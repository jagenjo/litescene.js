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

