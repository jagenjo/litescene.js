/* WBin: Javi Agenjo javi.agenjo@gmail.com  Febrary 2014

WBin works by packing info
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

Lump header: (32 bytes total)
	* start: 4 bytes, where the lump start in the binary area
	* length: 4 bytes, size of the lump
	* code: 2 bytes to represent data type using code table (Uint8Array, Float32Array, ...)
	* name: 22 bytes name for the lump

Lump binary: all the binary data...

*/

function WBin()
{
}

WBin.HEADER_SIZE = 64; //num bytes per header, some are free to future improvements
WBin.FOUR_CC = "WBIN";
WBin.VERSION = 0.1; //use numbers, never strings, fixed size in binary
WBin.CLASSNAME_SIZE = 32; //32 bytes: stores a type for the object stored inside this binary

WBin.LUMPHEADER_SIZE = 4+4+2+22; //32 bytes: 4 start, 4 length, 2 code, 22 name
WBin.LUMPNAME_SIZE = 22; 

WBin.CODES = {
	"ArrayBuffer":"AB", "Int8Array":"I1", "Uint8Array":"i1", "Int16Array":"I2", "Uint16Array":"i2", "Int32Array":"I4", "Uint32Array":"i4",
	"Float32Array":"F4", "Float64Array": "F8", "Object":"OB","String":"ST","Number":"NU", "null":"00", "WBin":"WB"
};

WBin.REVERSE_CODES = {};
for(var i in WBin.CODES)
	WBin.REVERSE_CODES[ WBin.CODES[i] ] = i;

WBin.FULL_BINARY = 1; //means this binary should be passed as binary, not as object of chunks

//converts and object in a arraybuffer
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

		lumps.push({code: code, name: i.substring(0,WBin.LUMPNAME_SIZE), data: data, start: lump_offset, size: data_length});
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


//Takes a Uint8Array and creates the object with all the data
WBin.load = function( data_array )
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
	if(header.classname)
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
			console.log("Classname not found or method fromBinary not found: " + header.classname );
	}	

	return object;
}


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
		var lumpheader = data_array.subarray( WBin.HEADER_SIZE + i * WBin.LUMPHEADER_SIZE );
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

