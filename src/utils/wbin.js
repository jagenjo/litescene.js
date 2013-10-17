function WBin()
{
}

WBin.FOUR_CC = "WBIN";
WBin.VERSION = 0.1; //use numbers, never strings
WBin.CLASSNAME_SIZE = 32; //32 bytes
WBin.CHUNKNAME_SIZE = 14; //14 bytes + 2 of data code
WBin.CODES = {
	"Int8Array":"I1","Uint8Array":"i1","Int16Array":"I2","Uint16Array":"i2","Int32Array":"I4","Uint32Array":"i4",
	"Float32Array":"F4", "Float64Array": "F8", "Object":"OB","string":"ST","number":"NU","WBin":"WB"
};

WBin.REVERSE_CODES = {};
for(var i in WBin.CODES)
	WBin.REVERSE_CODES[ WBin.CODES[i] ] = i;

//Takes a Uint8Array and creates the object with all the data
WBin.load = function( data_array )
{
	//clone
	data_array = new Uint8Array(data_array); //clone

	//check FOURCC
	var header = data_array.subarray(0,4);
	var good_header = true;
	for(var i = 0; i < header.length; i++)
		if(header[i] != 0 && header[i] != WBin.FOUR_CC.charCodeAt(i))
		{
			console.err("WBin header is wrong");
			return null;
		}

	//check version
	var version = new Float32Array(data_array.subarray(4,8).buffer)[0];
	if(version > WBin.VERSION)
		console.log("ALERT: WBin version is higher that code version");

	//get class name
	var classname = WBin.Uint8ArrayToString( data_array.subarray(8,8 + WBin.CLASSNAME_SIZE) );

	//get rest of data
	var content_data = data_array.subarray(8+WBin.CLASSNAME_SIZE);

	//check if class exists
	if(classname)
	{
		var ctor = window[ classname ];
		if(ctor && ctor.prototype.fromBinary)
		{
			var object = new ctor();
			object.fromBinary( content_data );
			return object;
		}
	}

	//if class do not exist use regular chunk unpacking
	var object = {};
	var current_position = 0;
	while(true)
	{
		if (current_position == content_data.length)
			break;

		var code = WBin.Uint8ArrayToString( content_data.subarray( current_position, current_position + WBin.CHUNKNAME_SIZE + 2) );
		if(code == "") break;

		var length = WBin.readUint32(content_data, current_position + WBin.CHUNKNAME_SIZE + 2);
		if(length == 0) break;

		current_position += WBin.CHUNKNAME_SIZE + 2 + 4;
		var data = content_data.subarray(current_position, current_position + length);
		current_position += length;

		if(code == "" || length == 0) return null;
		var chunk = { code: code, length: length, data: data };

		chunks[ chunk.code ] = chunk;

		//process chunk
		var data_code = chunk.code.substring(0,2);
		var data_name = chunk.code.substring(2,WBin.CHUNKNAME_SIZE);
		var data = chunk.data;
		var data_class_name = WBin.REVERSE_CODE[data_code];

		switch(data_class_name)
		{
			case "string": data = WBin.Uint8ArrayToString( data ); break;
			case "number": data = parseFloat( WBin.Uint8ArrayToString( data ) ); break;
			case "Object": data = JSON.parse( WBin.Uint8ArrayToString( data ) ); break;
			default:
				data = new Uint8Array(data); //clone to avoid problems with bytes alignment
				data = new window[data_class_name](data.buffer);
		}
		object[data_name] = data;
	}

	return object;
}

WBin.create = function( object )
{
	if(!object)
		throw("WBin null object passed");

	//generate content
	if(object.toBinary)
	{
		var content = object.toBinary();
		var classname = WBin.getObjectClassName( object );
		//alloc memory
		var data = new Uint8Array(8+WBin.CLASSNAME_SIZE + content.length);
		//set fourcc
		data.set(WBin.stringToUint8Array( WBin.FOUR_CC ));
		//set version
		data.set(new Float32Array([WBin.VERSION]).buffer, 4);
		//set classname
		data.set(WBin.stringToUint8Array(classname,WBin.CLASSNAME_SIZE), 8);
		//set data
		data.set(content, 8 + WBin.CLASSNAME_SIZE);
		return data;
	}

	//create object
	var total_size = 8 + WBin.CLASSNAME_SIZE;
	var chunks = [];

	//gather chunks
	for(var i in object)
	{
		var data = object[i];
		if(data == null) continue;

		var classname = WBin.getClassName(data);

		var data_info = WBin.CHUNK_CODES[ classname ];
		if(data_info == null)
			continue; //type not supported

		var code = data_info + i.substring(0,WBin.CHUNKNAME_SIZE); //max 14 chars per varname
		var bytes = 1;
		if(data.BYTES_PER_ELEMENT)
			bytes = data.BYTES_PER_ELEMENT;

		//class specific actions
		if (classname == "number")
			data = data.toString();
		else if(classname == "Object")
			data = JSON.stringify(data); //serialize the object

		chunks.push({code:code, data: data});
		var chunk_size = 4 + 2 + BinaryPack.CHUNKNAME_SIZE + data.length * bytes;
		//chunk_size += chunk_size % 4; //use multiple of 4 sizes to avoid problems with typed arrays
		total_size += chunk_size;
	}

	//construct the binary pack
	var data = new Uint8Array(total_size);
	//set fourcc
	data.set(WBin.stringToUint8Array( WBin.FOUR_CC ));
	//set version
	data.set(new Float32Array([WBin.VERSION]).buffer, 4);

	//copy chunks
	var nextChunkPos = 8 + WBin.CLASSNAME_SIZE;
	for(var j in chunks)
	{
		var chunk = chunks[j];
		var buffer = chunk.data;

		if(typeof(buffer) == "string")
			buffer = WBin.stringToUint8Array(buffer);

		//code
		var code_array = WBin.stringToUint8Array( chunk.code, WBin.CHUNKNAME_SIZE + 2);
		data.set(code_array, nextChunkPos);
		nextChunkPos += code_array.length;

		//chunk size, convert to bytes
		var length_array = new Uint32Array([buffer.byteLength]);
		var temp = new Uint8Array(length_array.buffer);
		data.set(temp, nextChunkPos);
		nextChunkPos += temp.length; //4

		//data
		var view = new Uint8Array(buffer.buffer);
		data.set(view, nextChunkPos);
		this.nextChunkPos += view.length; 
	}

	return data;
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

WBin.readUint32 = function(buffer, pos)
{
	var f = new Uint32Array(1);
	var view = new Uint8Array(f.buffer);
	view.set( buffer.subarray(pos,pos+4), 0 );
	return f[0];
}

