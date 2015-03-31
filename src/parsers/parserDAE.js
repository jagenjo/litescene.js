var temp_v3 = vec3.create();

var parserDAE = {
	extension: 'dae',
	data_type: 'scene',
	format: 'text',

	no_flip: true,

	parse: function(data, options, filename)
	{
		Collada.material_translate_table = {
			transparency: "opacity",
			reflectivity: "reflection_factor",
			specular: "specular_factor",
			shininess: "specular_gloss",
			emission: "emissive",
			diffuse: "color"
		}; //this is done to match LS specification

		//parser moved to Collada.js library
		var data = Collada.parse(data, options, filename);

		//organize info
		/*
		var resources = {};
		for(var i in data.meshes)
			resources[i] = data.meshes[i];

		for(var i in data.materials)
			resources[i] = data.materials[i];
		
		//what about textures?
		//save resources
		data.resources = resources;
		*/

		return data;
	}
};
Parser.registerParser(parserDAE);
