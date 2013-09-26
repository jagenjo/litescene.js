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