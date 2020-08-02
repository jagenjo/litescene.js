///@INFO: PARSER
//***** OBJ parser adapted from SpiderGL implementation *****************
var parserOBJ = {
	extension: 'obj',
	type: 'mesh',
	resource: 'Mesh',
	format: 'text',
	dataType:'text',

	flipAxis: false,

	parse: function(text, options)
	{
		options = options || {};
		var support_uint = true;

		//unindexed containers
		var vertices = [];
		var normals = [];
		var uvs = [];

		//final containers
		var vertices_buffer_data = [];
		var normals_buffer_data = [];
		var uvs_buffer_data = [];

		//groups
		var group_id = 0;
		var groups = [];
		var current_group_materials = {};
		var last_group_name = null;
		var materials_found = {};
		var mtllib = null;
		var group = createGroup();

		var indices_map = new Map();
		var next_index = 0;

		var V_CODE = 1;
		var VT_CODE = 2;
		var VN_CODE = 3;
		var F_CODE = 4;
		var G_CODE = 5;
		var O_CODE = 6;
		var USEMTL_CODE = 7;
		var MTLLIB_CODE = 8;
		var codes = { v: V_CODE, vt: VT_CODE, vn: VN_CODE, f: F_CODE, g: G_CODE, o: O_CODE, usemtl: USEMTL_CODE, mtllib: MTLLIB_CODE };

		var x,y,z;

		var lines = text.split("\n");
		var length = lines.length;
		for (var lineIndex = 0;  lineIndex < length; ++lineIndex) {

			var line = lines[lineIndex];
			line = line.replace(/[ \t]+/g, " ").replace(/\s\s*$/, ""); //better than trim

			if(line[ line.length - 1 ] == "\\") //breakline support
			{
				lineIndex += 1;
				var next_line = lines[lineIndex].replace(/[ \t]+/g, " ").replace(/\s\s*$/, ""); //better than trim
				line = (line.substr(0,line.length - 1) + next_line).replace(/[ \t]+/g, " ").replace(/\s\s*$/, "");
			}
			
			if (line[0] == "#")
				continue;
			if(line == "")
				continue;

			var tokens = line.split(" ");
			var code = codes[ tokens[0] ];

			if( code <= VN_CODE ) //v,vt,vn
			{
				x = parseFloat(tokens[1]);
				y = parseFloat(tokens[2]);
				if( code != VT_CODE ) //not always present
					z = parseFloat(tokens[3]); 
			}
			
			switch(code)
			{
				case V_CODE: vertices.push(x,y,z);	break;
				case VT_CODE: uvs.push(x,y);	break;
				case VN_CODE: normals.push(x,y,z);	break;
				case F_CODE: 
					if (tokens.length < 4)
						continue; //faces with less that 3 vertices? nevermind
					//get the triangle indices
					var polygon_indices = [];
					for(var i = 1; i < tokens.length; ++i)
						polygon_indices.push( getIndex( tokens[i] ) );
					group.indices.push( polygon_indices[0], polygon_indices[1], polygon_indices[2] );
					//polygons are break intro triangles (assuming they are convex!)
					for(var i = 2; i < polygon_indices.length-1; ++i)
						group.indices.push( polygon_indices[0], polygon_indices[i], polygon_indices[i+1] );
					break;
				case G_CODE:  
				case O_CODE:  //whats the difference?
					var name = tokens[1];
					last_group_name = name;
					if(!group.name)
						group.name = name;
					else
					{
						current_group_materials = {};
						group = createGroup( name );
					}
					break;
				case USEMTL_CODE: 
					changeMaterial( tokens[1] );
					break;
				case MTLLIB_CODE:
					mtllib = tokens[1];
					break;
				default:
			}
		}

		//generate indices
		var indices = [];
		var group_index = 0;
		var final_groups = [];
		for(var i = 0; i < groups.length; ++i)
		{
			var group = groups[i];
			if(!group.indices) //already added?
				continue;
			group.start = group_index;
			group.length = group.indices.length;
			indices = indices.concat( group.indices );
			delete group.indices; //do not store indices in JSON format!
			group_index += group.length;
			final_groups.push( group );
		}
		groups = final_groups;

		//finish mesh
		var mesh = {};

		if(!vertices.length)
		{
			console.error("mesh without vertices");
			return null;
		}

		//create typed arrays
		mesh.vertices = new Float32Array( vertices_buffer_data );
		if ( normals_buffer_data.length )
			mesh.normals = new Float32Array( normals_buffer_data );
		if ( uvs_buffer_data.length )
			mesh.coords = new Float32Array( uvs_buffer_data );
		if ( indices && indices.length > 0 )
			mesh.triangles = new ( support_uint && group_index > 256*256 ? Uint32Array : Uint16Array )(indices);

		//extra info
		mesh.bounding = GL.Mesh.computeBoundingBox( mesh.vertices );
		var info = {};
		if(groups.length > 1)
		{
			info.groups = groups;
			//compute bounding of groups? //TODO: this is complicated, it is affected by indices, etc, better done afterwards
		}

		mesh.info = info;
		if( !mesh.bounding )
		{
			console.log("empty mesh");
			return null;
		}

		if( mesh.bounding.radius == 0 || isNaN(mesh.bounding.radius))
			console.log("no radius found in mesh");
		//console.log(mesh);
		return mesh;

		//this function helps reuse triplets that have been created before
		function getIndex( str )
		{
			var pos,tex,nor,f;
			var has_negative = false;

			//cannot use negative indices as keys, convert them to positive
			if(str.indexOf("-") == -1)
			{
				var index = indices_map.get(str);
				if(index !== undefined)
					return index;
			}
			else
				has_negative = true;

			if(!f) //maybe it was parsed before
				f = str.split("/");

			if (f.length == 1) { //unpacked
				pos = parseInt(f[0]);
				tex = pos;
				nor = pos;
			}
			else if (f.length == 2) { //no normals
				pos = parseInt(f[0]);
				tex = parseInt(f[1]);
				nor = pos;
			}
			else if (f.length == 3) { //all three indexed
				pos = parseInt(f[0]);
				tex = parseInt(f[1]);
				nor = parseInt(f[2]);
			}
			else {
				console.log("Problem parsing: unknown number of values per face");
				return -1;
			}

			//negative indices are relative to the end
			if(pos < 0) 
				pos = vertices.length / 3 + pos + 1;
			if(nor < 0)
				nor = normals.length / 2 + nor + 1;
			if(tex < 0)
				tex = uvs.length / 2 + tex + 1;

			//try again to see if we already have this
			if(has_negative)
			{
				str = pos + "/" + tex + "/" + nor;
				var index = indices_map.get(str);
				if(index !== undefined)
					return index;
			}

			//fill buffers
			pos -= 1; tex -= 1; nor -= 1; //indices in obj start in 1, buffers in 0
			vertices_buffer_data.push( vertices[pos*3+0], vertices[pos*3+1], vertices[pos*3+2] );
			if(uvs.length)
				uvs_buffer_data.push( uvs[tex*2+0], uvs[tex*2+1] );
			if(normals.length)
				normals_buffer_data.push( normals[nor*3+0], normals[nor*3+1], normals[nor*3+2] );

			//store index
			var index = next_index;
			indices_map.set( str, index );
			++next_index;
			return index;
		}

		function createGroup( name )
		{
			var g = {
				name: name || "",
				material: "",
				start: -1,
				length: -1,
				indices: []
			};
			groups.push(g);
			return g;
		}

		function changeMaterial( material_name )
		{
			if( !group.material )
			{
				group.material = material_name + ".json";
				current_group_materials[ material_name ] = group;
				return group;
			}

			var g = current_group_materials[ material_name ];
			if(!g)
			{
				g = createGroup( last_group_name + "_" + material_name );
				g.material = material_name + ".json";
				current_group_materials[ material_name ] = g;
			}
			group = g;
			return g;
		}
	}
};

ONE.Formats.addSupportedFormat( "obj", parserOBJ );


//***** MTL parser *****************
//info from: http://paulbourke.net/dataformats/mtl/
var parserMTL = {
	extension: 'mtl',
	type: 'material',
	resource: 'StandardMaterial',
	format: 'text',
	dataType:'text',

	parse: function( text, options )
	{
		var lines = text.split("\n");
		var length = lines.length;

		var materials = {};
		var current_material = null;

		for (var lineIndex = 0;  lineIndex < length; ++lineIndex)
		{
			var line = lines[lineIndex].replace(/[ \t]+/g, " ").replace(/\s\s*$/, ""); //trim
			line = line.trim();

			if (line[0] == "#" || line == "")
				continue;

			var tokens = line.split(" ");
			var c = tokens[0];

			switch(c)
			{
				case "newmtl":
					var filename = tokens[1] + ".json";
					current_material = { filename: filename, textures: {} };
					materials[ filename ] = current_material;
					break;
				case "Ka":
					current_material.ambient = readVector3(tokens);
					break;
				case "Kd":
					current_material.color = readVector3(tokens);
					break;
				case "Ks":
					current_material.specular_factor = parseFloat(tokens[1]); //readVector3(tokens);
					break;
				case "Ke":
					current_material.emissive = readVector3(tokens); //readVector3(tokens);
					break;
				case "Ns": //glossiness
					current_material.specular_gloss = parseFloat(tokens[1]);
					break;
				case "Tr": //reflection coefficient
					current_material.reflection = parseFloat( tokens[1] );
					break;
				case "map_Kd":
					current_material.textures["color"] = this.clearPath( tokens[1] );
					current_material.color = [1,1,1];
					break;
				case "map_Ka":
					current_material.textures["ambient"] = this.clearPath( tokens[1] );
					current_material.ambient = [1,1,1];
					break;
				case "map_Ks":
					current_material.textures["specular"] = this.clearPath( tokens[1] );
					current_material.specular_factor = 1;
					break;
				case "map_d":
					current_material.textures["opacity"] = this.clearPath( tokens[1] );
					current_material.blend_mode = ONE.Blend.ALPHA;
					break;
				case "bump":
				case "map_bump":
					current_material.textures["bump"] = this.clearPath( tokens[1] );
					break;
				case "d": //disolve is like transparency
					current_material.opacity = parseFloat( tokens[1] );
					break;
				case "Tr": //reflection coefficient
					current_material.opacity = parseFloat( tokens[1] );
					break;
				//Not supported stuff
				case "illum": //illumination model (raytrace related)
				case "Tf": //reflection by components
				case "Ni": //refraction coefficient
					break;
				default:
					console.log("Unknown MTL info: ", c);
					break;
			}
		}

		for(var i in materials)
		{
			var material_info = materials[i];

			//hack, ambient must be 1,1,1
			material_info.ambient = [1,1,1];

			var material = new ONE.StandardMaterial(material_info);
			ONE.RM.registerResource( material_info.filename, material );
		}

		return null;

		function readVector3(v)
		{
			return [ parseFloat(v[1]), parseFloat(v[2]), parseFloat(v[3]) ];
		}
	},

	clearPath: function(path)
	{
		var pos = path.lastIndexOf("\\");
		if(pos != -1)
			path = path.substr(pos+1);
		var filename = ONE.RM.getFilename(path);
		if( ONE.RM.resources_renamed_recently[filename] )
			filename = ONE.RM.resources_renamed_recently[filename];
		return filename.toLowerCase();
	}
};

ONE.Formats.addSupportedFormat( "mtl", parserMTL );