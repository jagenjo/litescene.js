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