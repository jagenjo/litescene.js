
var parserDAE = {
	extension: 'dae',
	data_type: 'scene',
	format: 'text',

	no_flip: true,

	parse: function( data, options, filename )
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

		//skip renaming ids (this is done to ensure no collision with names coming from other files)
		if(options.skip_renaming)
			return data;

		var basename = filename.substr(0, filename.indexOf("."));

		//change local collada ids to valid uids 
		var renamed = {};
		replace_uids( data.root );

		function replace_uids( node )
		{
			//change uid
			if(node.id)
			{
				node.uid = "@" + basename + "::" + node.id;
				renamed[ node.id ] = node.uid;
			}

			//change mesh names
			if(node.mesh)
			{
				var newmeshname = basename + "__" + node.mesh;
				newmeshname = newmeshname.replace(/[^a-z0-9]/gi,"_"); //newmeshname.replace(/ /#/g,"_");
				renamed[ node.mesh ] = newmeshname;
				node.mesh = newmeshname;
			}

			if(node.children)
				for(var i in node.children)
					replace_uids( node.children[i] );
		}

		//replace skinning joint ids
		var newmeshes = {};

		for(var i in data.meshes)
		{
			var mesh = data.meshes[i];
			if(mesh.bones)
			{
				for(var j in mesh.bones)
				{
					var id = mesh.bones[j][0];
					var uid = renamed[ id ];
					if(uid)
						mesh.bones[j][0] = uid;
				}
			}

			newmeshes[ renamed[i] ] = mesh;
		}
		data.meshes = newmeshes;

		return data;
	}
};
Parser.registerParser(parserDAE);
