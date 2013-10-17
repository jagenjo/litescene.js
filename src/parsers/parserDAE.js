var parserDAE = {
	extension: 'dae',
	data_type: 'scene',
	format: 'text',

	_xmlroot: null,

	parse: function(data, options)
	{
		options = options || {};

		trace("Parsing collada");

		var xmlparser = new DOMParser();
		var root = xmlparser.parseFromString(data,"text/xml");
		this._xmlroot = root;
		var xmlnodes = root.querySelectorAll("library_visual_scenes visual_scene node");

		var meshes = {};
		var scene = { object_type:"SceneTree", meshes: meshes, root:{ children:[] } };

		for(var i = 0; i < xmlnodes.length; i++)
		{
			var xmlnode = xmlnodes[i];
			var node_id = xmlnode.getAttribute("id");
			var node_type = xmlnode.getAttribute("type");
			if( node_type == "JOINT" )
				continue;

			var node = { id: node_id, children:[] };
			xmlnode.treenode = node;

			//parent
			var xmlparent = xmlnode.parentNode;
			if( xmlparent.localName == "node" )
			{
				//node.parent = xmlparent.getAttribute("id");
				xmlparent.treenode.children.push( node );
			}
			else
				scene.root.children.push( node );

			//get transform
			node.model = this.readTransform(xmlnode);

			//get geometry
			var xmlgeometry = xmlnode.querySelector("instance_geometry");
			if(xmlgeometry)
			{
				var url = xmlgeometry.getAttribute("url");
				if(!meshes[ url ])
				{
					var mesh_data = this.readGeometry(url);
					if(mesh_data)
						meshes[url] = mesh_data;
					//var mesh = GL.Mesh.load(mesh_data);
					//ResourcesManager.registerResource(filename,mesh);
				}

				node.mesh = url;
			}


		}//i:xmlnodes
		console.log(scene);
		return scene;
	},

	readTransform: function(xmlnode)
	{
		//search for the matrix
		var xmlmatrix = xmlnode.querySelector("matrix");
		if(xmlmatrix)
		{
			var matrix = this.readContentAsFloats(xmlmatrix);
			//3ds max coords conversion
			mat4.transpose(matrix,matrix);
			var temp = new Float32Array(matrix.subarray(4,8));
			matrix.set( matrix.subarray(8,12), 4 );
			matrix.set( temp, 8 );
			matrix[10] *= -1;
			matrix[14] *= -1;
			return matrix;
		}

		//identity
		var matrix = mat4.create(); 

		//translate
		var xmltranslate = xmlnode.querySelector("translate");
		if(xmltranslate)
		{
			var values = this.readContentAsFloats(xmltranslate);
			//var tmp = values[1];values[1] = -values[2];values[2] = tmp; //swap coords
			if(values.length == 3)
				mat4.translate(matrix, matrix, values);
		}

		//rotate
		var xmlrotate = xmlnode.querySelector("rotate");
		if(xmlrotate)
		{
			var values = this.readContentAsFloats(xmlrotate);
			if(values.length == 4)
			{
				var q = new Float32Array(values);
				quat.scale(q,q,DEG2RAD);
				var R = mat4.fromQuat( mat4.create(), q );
				mat4.multiply( matrix, matrix, R );
			}
		}

		//scale
		var xmlscale = xmlnode.querySelector("scale");
		if(xmlscale)
		{
			var values = this.readContentAsFloats(xmlscale);
			var tmp = values[1]; values[1] = values[2]; values[2] = tmp; //swap coords
			if(values.length == 3) mat4.scale( matrix, matrix, values );
		}

		return matrix;
	},

	readGeometry: function(id)
	{
		var xmlgeometry = this._xmlroot.querySelector("geometry" + id);
		if(!xmlgeometry) return null;

		var use_indices = false;
		var xmlmesh = xmlgeometry.querySelector("mesh");
			
		//for data sources
		var sources = [];
		var xmlsources = xmlmesh.querySelectorAll("source");
		for(var i = 0; i < xmlsources.length; i++)
		{
			var xmlsource = xmlsources[i];
			if(!xmlsource.querySelector) continue;
			var float_array = xmlsource.querySelector("float_array");
			if(!float_array) continue;
			var floats = this.readContentAsFloats( xmlsource );
			sources[ xmlsource.getAttribute("id") ] = floats;
		}

		//get streams
		var xmlvertices = xmlmesh.querySelector("vertices input");
		vertices_source = sources[ xmlvertices.getAttribute("source").substr(1) ];
		sources[ xmlmesh.querySelector("vertices").getAttribute("id") ] = vertices_source;

		//swap coords
		if(1)
		{
			var tmp = 0;
			for(var i = 0, l = vertices_source.length; i < l; i += 3)
			{
				tmp = vertices_source[i+1]; 
				vertices_source[i+1] = vertices_source[i+2];
				vertices_source[i+2] = -tmp; 
			}
		}

		var xmlpolygons = xmlmesh.querySelector("polygons");
		var xmlinputs = xmlpolygons.querySelectorAll("input");
		var vertex_offset = -1;
		var normal_offset = -1;
		var uv_offset = -1;

		var vertices = null;
		var normals = null;
		var coords = null;

		for(var i = 0; i < xmlinputs.length; i++)
		{
			var xmlinput = xmlinputs[i];
			if(!xmlinput.getAttribute) continue;
			var semantic = xmlinput.getAttribute("semantic").toUpperCase();
			var stream_source = sources[ xmlinput.getAttribute("source").substr(1) ];
			if (semantic == "VERTEX")
			{
				vertices = stream_source;
				vertex_offset = parseInt( xmlinput.getAttribute("offset") );
			}
			else if (semantic == "NORMAL")
			{
				normals = stream_source;
				normal_offset = parseInt( xmlinput.getAttribute("offset") );
			}
			else if (semantic == "TEXCOORD")
			{
				coords = stream_source;
				uv_offset = parseInt( xmlinput.getAttribute("offset") );
			}
		}


		var verticesArray = [];
		var normalsArray = [];
		var coordsArray = [];
		var indicesArray = [];

		var last_index = 0;
		var facemap = {};

		var xmlps = xmlpolygons.querySelectorAll("p");

		//for every polygon
		for(var i = 0; i < xmlps.length; i++)
		{
			var xmlp = xmlps[i];
			if(!xmlp || !xmlp.textContent) break;
			var data = xmlp.textContent.split(" ");
			var first_index = -1;
			var current_index = -1;
			var prev_index = -1;

			if(use_indices && last_index >= 256*256)
				break;

			//for every triplet of indices in the polygon
			for(var k = 0; k < data.length; k += 3)
			{
				if(use_indices && last_index >= 256*256)
				{
					trace("Too many vertices for indexing");
					break;
				}
				
				//if (!use_indices && k >= 9) break; //only first triangle when not indexing

				var ids = data[k + vertex_offset] + "/"; //indices of vertex, normal and uvs
				if(normal_offset != -1)	ids += data[k + normal_offset] + "/";
				if(uv_offset != -1)	ids += data[k + uv_offset]; 

				if(!use_indices && k > 6) //put the vertices again
				{
					verticesArray.push( verticesArray[first_index*3], verticesArray[first_index*3+1], verticesArray[first_index*3+2] );
					normalsArray.push( normalsArray[first_index*3], normalsArray[first_index*3+1], normalsArray[first_index*3+2] );
					coordsArray.push( coordsArray[first_index*2], coordsArray[first_index*2+1] );
					
					verticesArray.push( verticesArray[(prev_index+1)*3], verticesArray[(prev_index+1)*3+1], verticesArray[(prev_index+1)*3+2] );
					normalsArray.push( normalsArray[(prev_index+1)*3], normalsArray[(prev_index+1)*3+1], normalsArray[(prev_index+1)*3+2] );
					coordsArray.push( coordsArray[(prev_index+1)*2], coordsArray[(prev_index+1)*2+1] );
					last_index += 2;
					current_index = last_index-1;
				}

				prev_index = current_index;
				if(!use_indices || !facemap.hasOwnProperty(ids))
				{
					var index = parseInt(data[k + vertex_offset]) * 3;
					verticesArray.push( vertices[index], vertices[index+1], vertices[index+2] );
					if(normal_offset != -1)
					{
						index = parseInt(data[k + normal_offset]) * 3;
						normalsArray.push( normals[index], normals[index+1], normals[index+2] );
					}
					if(uv_offset != -1)
					{
						index = parseInt(data[k + uv_offset]) * 2;
						coordsArray.push( coords[index], coords[index+1] );
					}
					
					current_index = last_index;
					last_index += 1;
					if(use_indices)
						facemap[ids] = current_index;
				}
				else if(use_indices)//already used vertex
				{
					current_index = facemap[ids];
				}

				if(k == 0)	first_index = current_index;
				if(use_indices)
				{
					if(k > 6) //triangulate polygons
					{
						indicesArray.push( first_index );
						indicesArray.push( prev_index );
					}
					indicesArray.push( current_index );
				}
			}//per vertex
		}//per polygon

		var mesh = {
			vertices: new Float32Array(verticesArray)
		};
		
		if (normalsArray.length)
			mesh.normals = new Float32Array(normalsArray);
		if (coordsArray.length)
			mesh.coords = new Float32Array(coordsArray);
		if(indicesArray.length)
			mesh.triangles = new Uint16Array(indicesArray);

		//extra info
		var bounding = Parser.computeMeshBounding(mesh.vertices);
		mesh.bounding = bounding;
		if( isNaN(bounding.radius) )
			return null;

		return mesh;
	},

	readContentAsUInt32: function(xmlnode)
	{
		if(!xmlnode) return null;
		var text = xmlnode.textContent;
		text = text.replace(/\n/gi, " "); //remove line breaks
		text = text.trim(); //remove empty spaces
		if(text.length == 0) return null;
		var numbers = text.split(" "); //create array
		var floats = new Uint32Array( numbers.length );
		for(var k = 0; k < numbers.length; k++)
			floats[k] = parseInt( numbers[k] );
		return floats;
	},

	readContentAsFloats: function(xmlnode)
	{
		if(!xmlnode) return null;
		var text = xmlnode.textContent;
		text = text.replace(/\n/gi, " "); //remove line breaks
		text = text.trim(); //remove empty spaces
		var numbers = text.split(" "); //create array
		var length = xmlnode.getAttribute("count") || numbers.length;
		var floats = new Float32Array( length );
		for(var k = 0; k < numbers.length; k++)
			floats[k] = parseFloat( numbers[k] );
		return floats;
	},
	
	parse2: function(data, options)
	{
		options = options || {};

		trace("Parsing collada");

		var xmlparser = new DOMParser();
		var root = xmlparser.parseFromString(data,"text/xml");
		var geometry_nodes = root.querySelectorAll("library_geometries geometry");
		if(!geometry_nodes || geometry_nodes.length == 0) return null;

		//trace(mesh_node);
		var data_info = {
			type: "",
			order: []
		};

		var use_indices = false;

		//trace(mesh_nodes);

		//for geometry_nodes
		for(var i in geometry_nodes)
		{
			var sources = {};

			var geometry_node = geometry_nodes[i];
			var geometry_id = geometry_node.getAttribute("id");
			if(!geometry_node.querySelector) continue; //in case is text

			var mesh_node = geometry_node.querySelector("mesh");
			
			//for data source
			var sources_xml = mesh_node.querySelectorAll("source");
			for (var j in sources_xml)
			{
				var source = sources_xml[j];
				if(!source.querySelector) continue;
				var float_array = source.querySelector("float_array");
				if(!float_array) continue;
				var text = float_array.textContent;
				text = text.replace(/\n/gi, " ");
				text = text.trim();
				var numbers = text.split(" ");
				var floats = new Float32Array(parseInt(float_array.getAttribute("count")));
				for(var k = 0; k < numbers.length; k++)
					floats[k] = parseFloat( numbers[k] );

				sources[ source.getAttribute("id") ] = floats;
			}

			var vertices_xml = mesh_node.querySelector("vertices input");
			vertices_source = sources[ vertices_xml.getAttribute("source").substr(1) ];
			sources[ mesh_node.querySelector("vertices").getAttribute("id") ] = vertices_source;

			var polygons_xml = mesh_node.querySelector("polygons");
			var inputs_xml = polygons_xml.querySelectorAll("input");
			var vertex_offset = -1;
			var normal_offset = -1;
			var uv_offset = -1;

			var vertices = null;
			var normals = null;
			var coords = null;


			for(var j in inputs_xml)
			{
				var input = inputs_xml[j];
				if(!input.getAttribute) continue;
				var semantic = input.getAttribute("semantic").toUpperCase();
				var stream_source = sources[ input.getAttribute("source").substr(1) ];
				if (semantic == "VERTEX")
				{
					vertices = stream_source;
					vertex_offset = parseInt( input.getAttribute("offset") );
				}
				else if (semantic == "NORMAL")
				{
					normals = stream_source;
					normal_offset = parseInt( input.getAttribute("offset") );
				}
				else if (semantic == "TEXCOORD")
				{
					coords = stream_source;
					uv_offset = parseInt( input.getAttribute("offset") );
				}
			}

			var p_xml = polygons_xml.querySelectorAll("p");

			var verticesArray = [];
			var normalsArray = [];
			var coordsArray = [];
			var indicesArray = [];

			var last_index = 0;
			var facemap = {};

			//for every polygon
			for(var j in p_xml)
			{
				var p = p_xml[j];
				if(!p || !p.textContent) break;
				var data = p.textContent.split(" ");
				var first_index = -1;
				var current_index = -1;
				var prev_index = -1;

				if(use_indices && last_index >= 256*256)
					break;

				//for every triplet of indices in the polygon
				for(var k = 0; k < data.length; k += 3)
				{
					if(use_indices && last_index >= 256*256)
					{
						trace("Too many vertices for indexing");
						break;
					}
					
					//if (!use_indices && k >= 9) break; //only first triangle when not indexing

					var ids = data[k + vertex_offset] + "/"; //indices of vertex, normal and uvs
					if(normal_offset != -1)	ids += data[k + normal_offset] + "/";
					if(uv_offset != -1)	ids += data[k + uv_offset]; 

					if(!use_indices && k > 6) //put the vertices again
					{
						verticesArray.push( verticesArray[first_index*3], verticesArray[first_index*3+1], verticesArray[first_index*3+2] );
						normalsArray.push( normalsArray[first_index*3], normalsArray[first_index*3+1], normalsArray[first_index*3+2] );
						coordsArray.push( coordsArray[first_index*2], coordsArray[first_index*2+1] );
						
						verticesArray.push( verticesArray[(prev_index+1)*3], verticesArray[(prev_index+1)*3+1], verticesArray[(prev_index+1)*3+2] );
						normalsArray.push( normalsArray[(prev_index+1)*3], normalsArray[(prev_index+1)*3+1], normalsArray[(prev_index+1)*3+2] );
						coordsArray.push( coordsArray[(prev_index+1)*2], coordsArray[(prev_index+1)*2+1] );
						last_index += 2;
						current_index = last_index-1;
					}

					prev_index = current_index;
					if(!use_indices || !facemap.hasOwnProperty(ids))
					{
						var index = parseInt(data[k + vertex_offset]) * 3;
						verticesArray.push( vertices[index], vertices[index+1], vertices[index+2] );
						if(normal_offset != -1)
						{
							index = parseInt(data[k + normal_offset]) * 3;
							normalsArray.push( normals[index], normals[index+1], normals[index+2] );
						}
						if(uv_offset != -1)
						{
							index = parseInt(data[k + uv_offset]) * 2;
							coordsArray.push( coords[index], coords[index+1] );
						}
						
						current_index = last_index;
						last_index += 1;
						if(use_indices)
							facemap[ids] = current_index;
					}
					else if(use_indices)//already used vertex
					{
						current_index = facemap[ids];
					}

					if(k == 0)	first_index = current_index;
					if(use_indices)
					{
						if(k > 6) //triangulate polygons
						{
							indicesArray.push( first_index );
							indicesArray.push( prev_index );
						}
						indicesArray.push( current_index );
					}
				}//per vertex
			}//per polygon

			var mesh = {
				vertices: new Float32Array(verticesArray)
			};
			
			if (normalsArray.length)
				mesh.normals = new Float32Array(normalsArray);
			if (coordsArray.length)
				mesh.coords = new Float32Array(coordsArray);
			if(indicesArray.length)
				mesh.triangles = new Uint16Array(indicesArray);

			//extra info
			var bounding = Parser.computeMeshBounding(mesh.vertices);
			mesh.bounding = bounding;
			if( isNaN(bounding.radius))
				return null;

			return mesh;
		}
	}
};
Parser.registerParser(parserDAE);
