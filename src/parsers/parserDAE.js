
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
		var data = Collada.parse( data, options, filename );
		console.log(data); 

		//change local collada ids to valid uids 
		var renamed = {};
		replace_uids( data.root );

		function replace_uids( node )
		{
			//change uid
			if(node.id)
			{
				node.uid = "@" + filename + "::" + node.id;
				renamed[ node.id ] = node.uid;
			}

			if(node.children)
				for(var i in node.children)
					replace_uids( node.children[i] );
		}

		//replace skinning joint ids
		for(var i in data.meshes)
		{
			var mesh = data.meshes[i];
			if(!mesh.bones)
				continue;

			for(var j in mesh.bones)
			{
				var id = mesh.bones[j][0];
				var uid = renamed[ id ];
				if(uid)
					mesh.bones[j][0] = uid;
			}
		}


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
