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