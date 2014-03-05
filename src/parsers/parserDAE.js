var parserDAE = {
	extension: 'dae',
	data_type: 'scene',
	format: 'text',

	_xmlroot: null,

	parse: function(data, options, filename)
	{
		options = options || {};

		//console.log("Parsing collada");
		var flip = true;

		var xmlparser = new DOMParser();
		var root = xmlparser.parseFromString(data,"text/xml");
		this._xmlroot = root;
		var xmlnodes = root.querySelector("visual_scene");
		xmlnodes = xmlnodes.childNodes;

		var scene = { 
			object_type:"SceneTree", 
			light: null,
			resources: {},
			root:{ children:[] }
		};

		for(var i = 0; i < xmlnodes.length; i++)
		{
			if(xmlnodes[i].localName != "node")
				continue;

			var node = this.readNode( xmlnodes[i], scene, 0, flip );
			scene.root.children.push(node);
		}

		//read animations
		var animations = this.readAnimations(root, scene);
		if(animations)
		{
			var animations_name = "#animations_" + filename.substr(0,filename.indexOf("."));
			scene.resources[ animations_name ] = animations;
			scene.root.animations = animations_name;
		}

		console.log(scene);
		return scene;
	},

	readNode: function(xmlnode, scene, level, flip)
	{
		var node_id = xmlnode.getAttribute("id");
		var node_type = xmlnode.getAttribute("type");
		var node = { id: node_id, children:[] };

		//node elements
		for( var i = 0; i < xmlnode.childNodes.length; i++ )
		{
			var xmlchild = xmlnode.childNodes[i];

			//children
			if(xmlchild.localName == "node")
			{
				node.children.push( this.readNode(xmlchild, scene, level+1, flip) );
				continue;
			}

			//transform
			node.model = this.readTransform(xmlnode, level, flip );

			//geometry
			if(xmlchild.localName == "instance_geometry")
			{
				var url = xmlchild.getAttribute("url");
				if(!scene.resources[ url ])
				{
					var mesh_data = this.readGeometry(url, flip);
					if(mesh_data)
					{
						mesh_data.name = url;
						scene.resources[url] = mesh_data;
					}
				}

				node.mesh = url;

				//binded material
				try 
				{
					var xmlmaterial = xmlchild.querySelector("instance_material");
					if(xmlmaterial)
					{
						var matname = xmlmaterial.getAttribute("symbol");
						if(scene.resources[matname])
							node.material = matname;
						else
						{
							var material = this.readMaterial(matname);
							if(material)
							{
								material.id = matname;
								scene.materials[matname] = material;
							}
							node.material = matname;
						}
					}
				}
				catch(err)
				{
					console.error("Error parsing material, check that materials doesnt have space in their names");
				}
			}


			//skinned or morph targets
			if(xmlchild.localName == "instance_controller")
			{
				var url = xmlchild.getAttribute("url");
				var mesh_data = this.readController(url, flip, scene );
				if(mesh_data)
				{
					var mesh = mesh_data;
					if( mesh_data.type == "morph" )
					{
						mesh = mesh_data.mesh;
						node.morph_targets = mesh_data.morph_targets;
					}

					mesh.name = url;
					node.mesh = url;
					scene.resources[url] = mesh;
				}
			}

			//light
			if(xmlchild.localName == "instance_light")
			{
				var url = xmlchild.getAttribute("url");
				this.readLight(node, url, flip);
			}

			//other possible tags?
		}

		return node;
	},

	translate_table: {
		transparency: "opacity",
		reflectivity: "reflection_factor",
		specular: "specular_factor",
		shininess: "specular_gloss",
		emission: "emissive",
		diffuse: "color"
	},

	readMaterial: function(url)
	{
		var xmlmaterial = this._xmlroot.querySelector("library_materials material#" + url);
		if(!xmlmaterial) return null;

		//get effect name
		var xmleffect = xmlmaterial.querySelector("instance_effect");
		if(!xmleffect) return null;

		var effect_url = xmleffect.getAttribute("url");

		//get effect
		var xmleffects = this._xmlroot.querySelector("library_effects effect" + effect_url);
		if(!xmleffects) return null;

		//get common
		var xmltechnique = xmleffects.querySelector("technique");
		if(!xmltechnique) return null;

		var material = {};

		var xmlphong = xmltechnique.querySelector("phong");
		if(!xmlphong) return null;

		//colors
		var xmlcolors = xmlphong.querySelectorAll("color");
		for(var i = 0; i < xmlcolors.length; ++i)
		{
			var xmlcolor = xmlcolors[i];
			var param = xmlcolor.getAttribute("sid");
			if(this.translate_table[param])
				param = this.translate_table[param];
			material[param] = this.readContentAsFloats( xmlcolor ).subarray(0,3);
			if(param == "specular_factor")
				material[param] = (material[param][0] + material[param][1] + material[param][2]) / 3; //specular factor
		}

		//factors
		var xmlfloats = xmlphong.querySelectorAll("float");
		for(var i = 0; i < xmlfloats.length; ++i)
		{
			var xmlfloat = xmlfloats[i];
			var param = xmlfloat.getAttribute("sid");
			if(this.translate_table[param])
				param = this.translate_table[param];
			material[param] = this.readContentAsFloats( xmlfloat )[0];
			if(param == "opacity")
				material[param] = 1 - material[param]; //reverse 
		}

		material.object_Type = "Material";
		return material;
	},

	readLight: function(node, url)
	{
		var light = {};

		var xmlnode = this._xmlroot.querySelector("library_lights " + url);
		if(!xmlnode) return null;

		//pack
		var children = [];
		var xml = xmlnode.querySelector("technique_common");
		if(xml)
			for(var i in xml.childNodes )
				if( xml.childNodes[i].nodeType == 1 ) //tag
					children.push( xml.childNodes[i] );

		var xmls = xmlnode.querySelectorAll("technique");
		for(var i = 0; i < xmls.length; i++)
		{
			for(var j in xmls[i].childNodes )
				if( xmls[i].childNodes[j].nodeType == 1 ) //tag
					children.push( xmls[i].childNodes[j] );
		}

		//get
		for(var i in children)
		{
			var xml = children[i];
			switch( xml.localName )
			{
				case "point": 
					light.type = LS.Light.OMNI; 
					parse_params(light, xml);
					break;
				case "spot": 
					light.type = LS.Light.SPOT; 
					parse_params(light, xml);
					break;
				case "intensity": light.intensity = this.readContentAsFloats( xml )[0]; break;
			}
		}

		function parse_params(light, xml)
		{
			for(var i in xml.childNodes)
			{
				var child = xml.childNodes[i];
				if( !child || child.nodeType != 1 ) //tag
					continue;

				switch( child.localName )
				{
					case "color": light.color = parserDAE.readContentAsFloats( child ); break;
					case "falloff_angle": 
						light.angle_end = parserDAE.readContentAsFloats( child )[0]; 
						light.angle = light.angle_end - 10; 
					break;
				}
			}
		}

		/*
		if(node.model)
		{
			var M = mat4.create();
			var R = mat4.rotate(M,M, Math.PI * 0.5, [1,0,0]);
			//mat4.multiply( node.model, node.model, R );
		}
		*/
		light.position = [0,0,0];
		light.target = [0,-1,0];

		node.light = light;
	},

	transformMatrix: function(matrix)
	{
		//3ds max coords conversion
		mat4.transpose(matrix,matrix);

		//flip
		var temp = new Float32Array(matrix.subarray(4,8));
		matrix.set( matrix.subarray(8,12), 4 );
		matrix.set( temp, 8 );
		matrix[10] *= -1;
		matrix[14] *= -1;
	},

	readTransform: function(xmlnode, level, flip)
	{
		//identity
		var matrix = mat4.create(); 
		var rotation = quat.create();
		var tmpmatrix = mat4.create();
		var tmpq = quat.create();
		var translate = vec3.create();
		var scale = vec3.fromValues(1,1,1);
		
		var flip_fix = false;

		//search for the matrix
		for(var i = 0; i < xmlnode.childNodes.length; i++)
		{
			var xml = xmlnode.childNodes[i];

			if(xml.localName == "matrix")
			{
				var matrix = this.readContentAsFloats(xml);
				this.transformMatrix(matrix);
				return matrix;
			}

			if(xml.localName == "translate")
			{
				var values = this.readContentAsFloats(xml);
				translate.set(values);
				continue;
			}

			//rotate
			if(xml.localName == "rotate")
			{
				var values = this.readContentAsFloats(xml);
				if(values.length == 4) //x,y,z, angle
				{
					var id = xml.getAttribute("sid");
					if(id == "jointOrientX")
					{
						values[3] += 90;
						flip_fix = true;
					}

					if(flip)
					{
						var tmp = values[1];
						values[1] = values[2];
						values[2] = -tmp; //swap coords
					}

					quat.setAxisAngle(tmpq, values.subarray(0,3), values[3] * DEG2RAD);
					quat.multiply(rotation,rotation,tmpq);
				}
				continue;
			}

			//scale
			if(xml.localName == "scale")
			{
				var values = this.readContentAsFloats(xml);
				if(flip)
				{
					var tmp = values[1];
					values[1] = values[2];
					values[2] = -tmp; //swap coords
				}
				scale.set(values);
			}
		}

		if(flip && level > 0)
		{
			var tmp = translate[1];
			translate[1] = translate[2];
			translate[2] = -tmp; //swap coords
		}
		mat4.translate(matrix, matrix, translate);

		mat4.fromQuat( tmpmatrix , rotation );
		//mat4.rotateX(tmpmatrix, tmpmatrix, Math.PI * 0.5);
		mat4.multiply( matrix, matrix, tmpmatrix );
		mat4.scale( matrix, matrix, scale );


		return matrix;
	},

	readGeometry: function(id, flip)
	{
		var xmlgeometry = this._xmlroot.querySelector("geometry" + id);
		if(!xmlgeometry) return null;

		var use_indices = false;
		var xmlmesh = xmlgeometry.querySelector("mesh");
			
		//get data sources
		var sources = {};
		var xmlsources = xmlmesh.querySelectorAll("source");
		for(var i = 0; i < xmlsources.length; i++)
		{
			var xmlsource = xmlsources[i];
			if(!xmlsource.querySelector) continue;
			var float_array = xmlsource.querySelector("float_array");
			if(!float_array) continue;
			var floats = this.readContentAsFloats( xmlsource );

			var xmlaccessor = xmlsource.querySelector("accessor");
			var stride = parseInt( xmlaccessor.getAttribute("stride") );

			sources[ xmlsource.getAttribute("id") ] = {stride: stride, data: floats};
		}

		//get streams
		var xmlvertices = xmlmesh.querySelector("vertices input");
		vertices_source = sources[ xmlvertices.getAttribute("source").substr(1) ];
		sources[ xmlmesh.querySelector("vertices").getAttribute("id") ] = vertices_source;

		var groups = [];

		var triangles = false;
		var polylist = false;
		var vcount = null;
		var xmlpolygons = xmlmesh.querySelector("polygons");
		if(!xmlpolygons)
		{
			xmlpolygons = xmlmesh.querySelector("polylist");
			if(xmlpolygons)
			{
				console.error("Polylist not supported, please be sure to enable TRIANGULATE option in your exporter.");
				return null;
			}
			//polylist = true;
			//var xmlvcount = xmlpolygons.querySelector("vcount");
			//var vcount = this.readContentAsUInt32( xmlvcount );
		}
		if(!xmlpolygons)
		{
			xmlpolygons = xmlmesh.querySelector("triangles");
			triangles = true;
		}
		if(!xmlpolygons)
		{
			console.log("no polygons or triangles in mesh: " + id);
			return null;
		}


		var xmltriangles = xmlmesh.querySelectorAll("triangles");
		if(!xmltriangles.length)
		{
			console.error("no triangles in mesh: " + id);
			return null;
		}
		else
			triangles = true;

		var buffers = [];
		var last_index = 0;
		var facemap = {};
		var vertex_remap = [];
		var indicesArray = [];

		//for every triangles set
		for(var tris = 0; tris < xmltriangles.length; tris++)
		{
			var xml_shape_root = xmltriangles[tris];

			//for each buffer (input)
			var xmlinputs = xml_shape_root.querySelectorAll("input");
			if(tris == 0) //first iteration, create buffers
				for(var i = 0; i < xmlinputs.length; i++)
				{
					var xmlinput = xmlinputs[i];
					if(!xmlinput.getAttribute) continue;
					var semantic = xmlinput.getAttribute("semantic").toUpperCase();
					var stream_source = sources[ xmlinput.getAttribute("source").substr(1) ];
					var offset = parseInt( xmlinput.getAttribute("offset") );
					var data_set = 0;
					if(xmlinput.getAttribute("set"))
						data_set = parseInt( xmlinput.getAttribute("set") );

					buffers.push([semantic, [], stream_source.stride, stream_source.data, offset, data_set]);
				}
			//assuming buffers are ordered by offset

			var xmlps = xml_shape_root.querySelectorAll("p");
			var num_data_vertex = buffers.length; //one value per input buffer

			//for every polygon
			for(var i = 0; i < xmlps.length; i++)
			{
				var xmlp = xmlps[i];
				if(!xmlp || !xmlp.textContent) break;

				var data = xmlp.textContent.trim().split(" ");

				//used for triangulate polys
				var first_index = -1;
				var current_index = -1;
				var prev_index = -1;

				if(use_indices && last_index >= 256*256)
					break;

				//for every pack of indices in the polygon (vertex, normal, uv, ... )
				for(var k = 0, l = data.length; k < l; k += num_data_vertex)
				{
					var vertex_id = data.slice(k,k+num_data_vertex).join(" "); //generate unique id

					prev_index = current_index;
					if(facemap.hasOwnProperty(vertex_id)) //add to arrays, keep the index
						current_index = facemap[vertex_id];
					else
					{
						for(var j = 0; j < buffers.length; ++j)
						{
							var buffer = buffers[j];
							var index = parseInt(data[k + j]);
							var array = buffer[1]; //array with all the data
							var source = buffer[3]; //where to read the data from
							if(j == 0)
								vertex_remap[ array.length / num_data_vertex ] = index;
							index *= buffer[2]; //stride
							for(var x = 0; x < buffer[2]; ++x)
								array.push( source[index+x] );
						}
						
						current_index = last_index;
						last_index += 1;
						facemap[vertex_id] = current_index;
					}

					if(!triangles) //split polygons then
					{
						if(k == 0)	first_index = current_index;
						if(k > 2 * num_data_vertex) //triangulate polygons
						{
							indicesArray.push( first_index );
							indicesArray.push( prev_index );
						}
					}

					indicesArray.push( current_index );
				}//per vertex
			}//per polygon

			//groups.push(indicesArray.length);
		}//per triangles group


		var mesh = {
			vertices: new Float32Array(buffers[0][1]),
			_remap: new Uint16Array(vertex_remap)
		};

		var translator = {
			"normal":"normals",
			"texcoord":"coords"
		};

		for(var i = 1; i < buffers.length; ++i)
		{
			var name = buffers[i][0].toLowerCase();
			var data = buffers[i][1];
			if(!data.length) continue;

			if(translator[name])
				name = translator[name];
			if(mesh[name])
				name = name + buffers[i][5];
			mesh[ name ] = new Float32Array(data); //are they always float32? I think so
		}
		
		if(indicesArray.length)
			mesh.triangles = new Uint16Array(indicesArray);

		//console.log(mesh);


		//swap coords X and Y
		if(flip && 1)
		{
			var tmp = 0;
			var array = mesh.vertices;
			for(var i = 0, l = array.length; i < l; i += 3)
			{
				tmp = array[i+1]; 
				array[i+1] = array[i+2];
				array[i+2] = -tmp; 
			}

			array = mesh.normals;
			for(var i = 0, l = array.length; i < l; i += 3)
			{
				tmp = array[i+1]; 
				array[i+1] = array[i+2];
				array[i+2] = -tmp; 
			}
		}

		//extra info
		mesh.filename = id;
		mesh.object_type = "Mesh";
		return mesh;
		
	},

	/* old version
	readGeometry2: function(id, flip)
	{
		var xmlgeometry = this._xmlroot.querySelector("geometry" + id);
		if(!xmlgeometry) return null;

		var use_indices = false;
		var xmlmesh = xmlgeometry.querySelector("mesh");
			
		//for data sources
		var sources = {};
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

		var triangles = false;
		var polylist = false;
		var vcount = null;
		var xmlpolygons = xmlmesh.querySelector("polygons");
		if(!xmlpolygons)
		{
			xmlpolygons = xmlmesh.querySelector("polylist");
			if(xmlpolygons)
			{
				console.error("Polylist not supported, please be sure to enable TRIANGULATE option in your exporter.");
				return null;
			}
			//polylist = true;
			//var xmlvcount = xmlpolygons.querySelector("vcount");
			//var vcount = this.readContentAsUInt32( xmlvcount );
		}
		if(!xmlpolygons)
		{
			xmlpolygons = xmlmesh.querySelector("triangles");
			triangles = true;
		}
		if(!xmlpolygons)
		{
			console.log("no polygons or triangles in mesh: " + id);
			return null;
		}


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
		var vertex_remap = [];

		var num_data_vertex = 3;

		//for every polygon
		for(var i = 0; i < xmlps.length; i++)
		{
			var xmlp = xmlps[i];
			if(!xmlp || !xmlp.textContent) break;
			var data = xmlp.textContent.trim().split(" ");
			var first_index = -1;
			var current_index = -1;
			var prev_index = -1;

			if(use_indices && last_index >= 256*256)
				break;

			//for every pack of indices in the polygon (vertex, normal, uv, ... )
			for(var k = 0; k < data.length; k += num_data_vertex)
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

				if(!triangles) //polygon triangulation
				{
					if(!use_indices && k > 6) //put the vertices again (6 is 3 vertices, 2 values per vertex)
					{
						vertex_remap[ verticesArray.length / 3 ] = vertex_remap[ first_index ];

						verticesArray.push( verticesArray[first_index*3], verticesArray[first_index*3+1], verticesArray[first_index*3+2] );
						normalsArray.push( normalsArray[first_index*3], normalsArray[first_index*3+1], normalsArray[first_index*3+2] );
						coordsArray.push( coordsArray[first_index*2], coordsArray[first_index*2+1] );

						vertex_remap[ verticesArray.length / 3 ] = vertex_remap[ prev_index+1 ];
						
						verticesArray.push( verticesArray[(prev_index+1)*3], verticesArray[(prev_index+1)*3+1], verticesArray[(prev_index+1)*3+2] );
						normalsArray.push( normalsArray[(prev_index+1)*3], normalsArray[(prev_index+1)*3+1], normalsArray[(prev_index+1)*3+2] );
						coordsArray.push( coordsArray[(prev_index+1)*2], coordsArray[(prev_index+1)*2+1] );
						last_index += 2;
						current_index = last_index-1;
					}
				}

				prev_index = current_index;
				if(!use_indices || !facemap.hasOwnProperty(ids)) //reuse indexed
				{
					var index = parseInt(data[k + vertex_offset]);
					vertex_remap[ verticesArray.length / 3 ] = index;
					index *= 3;

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
			vertices: new Float32Array(verticesArray),
			_remap: new Uint16Array(vertex_remap)
		};
		
		if (normalsArray.length)
			mesh.normals = new Float32Array(normalsArray);
		if (coordsArray.length)
			mesh.coords = new Float32Array(coordsArray);
		if(indicesArray.length)
			mesh.triangles = new Uint16Array(indicesArray);

		//swap coords
		if(flip && 1)
		{
			var tmp = 0;
			var array = mesh.vertices;
			for(var i = 0, l = array.length; i < l; i += 3)
			{
				tmp = array[i+1]; 
				array[i+1] = array[i+2];
				array[i+2] = -tmp; 
			}

			array = mesh.normals;
			for(var i = 0, l = array.length; i < l; i += 3)
			{
				tmp = array[i+1]; 
				array[i+1] = array[i+2];
				array[i+2] = -tmp; 
			}
		}

		//extra info
		var bounding = Parser.computeMeshBounding(mesh.vertices);
		mesh.bounding = bounding;
		if( isNaN(bounding.radius) )
			return null;

		return mesh;
	},
	*/

	readAnimations: function(root, scene)
	{
		var xmlanimations = root.querySelector("library_animations");
		if(!xmlanimations) return null;

		var xmlanimation_childs = xmlanimations.childNodes;

		var animations = {
			object_type: "Animation",
			tracks: []
		};

		for(var i = 0; i < xmlanimation_childs.length; ++i)
		{
			var xmlanimation = xmlanimation_childs[i];
			if(xmlanimation.nodeType != 1 ) //no tag
				continue;

			xmlanimation = xmlanimation.querySelector("animation"); //yes... DAE has animation inside animation...
			if(!xmlanimation) continue;

			//channels are like animated properties
			var xmlchannel = xmlanimation.querySelector("channel");
			if(!xmlchannel) continue;

			var source = xmlchannel.getAttribute("source");
			var target = xmlchannel.getAttribute("target");

			//sampler, is in charge of the interpolation
			var xmlsampler = xmlanimation.querySelector("sampler" + source);

			var inputs = {};
			var sources = {};
			var params = {};
			var xmlinputs = xmlsampler.querySelectorAll("input");

			var time_data = null;

			//iterate inputs
			for(var j = 0; j < xmlinputs.length; j++)
			{
				var xmlinput = xmlinputs[j];
				var source_name =  xmlinput.getAttribute("source");
				var semantic = xmlinput.getAttribute("semantic");

				//Search for source
				var xmlsource = xmlanimation.querySelector("source" + source_name);
				if(!xmlsource)
					continue;

				var xmlparam = xmlsource.querySelector("param");
				if(!xmlparam) continue;

				var type = xmlparam.getAttribute("type");
				inputs[ semantic ] = { source: source_name, type: type };

				var data_array = null;

				if(type == "float" || type == "float4x4")
				{
					var xmlfloatarray = xmlsource.querySelector("float_array");
					var floats = this.readContentAsFloats( xmlfloatarray );
					sources[ source_name ] = floats;
					data_array = floats;

				}
				else
					continue;

				var param_name = xmlparam.getAttribute("name");
				if(param_name == "TIME")
					time_data = data_array;
				params[ param_name || "OUTPUT" ] = type;
			}

			//construct animation
			var path = target.split("/");

			var anim = {}
			anim.nodename = path[0]; //where it goes
			anim.property = path[1];

			var element_size = 1;
			var param_type = params["OUTPUT"];
			switch(param_type)
			{
				case "float": element_size = 1; break;
				case "float3x3": element_size = 9; break;
				case "float4x4": element_size = 16; break;
				default: break;
			}

			anim.value_size = element_size;
			anim.duration = time_data[ time_data.length - 1]; //last sample

			var value_data = sources[ inputs["OUTPUT"].source ];
			if(!value_data) continue;

			//pack data
			var num_samples = time_data.length;
			var sample_size = element_size + 1;
			var anim_data = new Float32Array( num_samples * sample_size );

			for(var j = 0; j < time_data.length; ++j)
			{
				anim_data[j * sample_size] = time_data[j]; //set time
				var value = value_data.subarray( j * element_size, (j+1) * element_size );
				if(param_type == "float4x4")
					mat4.transpose(value, value);
				anim_data.set(value, j * sample_size + 1); //set data
			}

			anim.data = anim_data;
			animations.tracks.push(anim);

			/* store per node? no, better do it global
			var node = this.findNode( scene.root, anim.node );
			if(node)
			{
				if(!node.animations)
					node.animations = [];
				node.animations.push(anim);
			}
			*/
		}

		return animations;
	},		

	findNode: function(root, id)
	{
		if(root.id == id) return root;
		if(root.children)
			for(var i in root.children)
			{
				var ret = this.findNode(root.children[i], id);
				if(ret) return ret;
			}
		return null;
	},

	//used for skinning and morphing
	readController: function(id, flip, scene)
	{
		//get root
		var xmlcontroller = this._xmlroot.querySelector("controller" + id);
		if(!xmlcontroller) return null;

		var use_indices = false;
		var xmlskin = xmlcontroller.querySelector("skin");
		if(xmlskin)
			return this.readSkinController(xmlskin, flip, scene);

		var xmlmorph = xmlcontroller.querySelector("morph");
		if(xmlmorph)
			return this.readMorphController(xmlmorph, flip, scene);

		return null;
	},

	readSkinController: function(xmlskin, flip, scene)
	{
		//base geometry
		var id_geometry = xmlskin.getAttribute("source");
		var mesh = this.readGeometry( id_geometry, flip );
		if(!mesh)
			return null;

		var sources = this.readSources(xmlskin, flip);

		//matrix
		var bind_matrix = null;
		var xmlbindmatrix = xmlskin.querySelector("bind_shape_matrix");
		if(xmlbindmatrix)
			bind_matrix = this.readContentAsFloats( xmlbindmatrix );
		else
			bind_matrix = mat4.create(); //identity

		//joints
		var joints = [];
		var xmljoints = xmlskin.querySelector("joints");
		if(xmljoints)
		{
			var joints_source = null; //which bones
			var inv_bind_source = null; //bind matrices
			var xmlinputs = xmljoints.querySelectorAll("input");
			for(var i = 0; i < xmlinputs.length; i++)
			{
				var xmlinput = xmlinputs[i];
				var sem = xmlinput.getAttribute("semantic").toUpperCase();
				var src = xmlinput.getAttribute("source");
				var source = sources[ src.substr(1) ];
				if(sem == "JOINT")
					joints_source = source;
				else if(sem == "INV_BIND_MATRIX")
					inv_bind_source = source;
			}

			//save bone names and inv matrix
			if(!inv_bind_source || !joints_source)
				throw("no joints or inv_bind sources found");

			for(var i in joints_source)
			{
				var mat = inv_bind_source.subarray(i*16,i*16+16);
				vec3.scale( mat.subarray(4,8), mat.subarray(4,8), -1 );
				var temp = mat4.create();
				mat4.swapRows(temp, mat, 0, 1 );
				mat4.transpose(temp, temp);
				joints.push([joints_source[i], temp]);
			}
		}

		//weights
		var xmlvertexweights = xmlskin.querySelector("vertex_weights");
		if(xmlvertexweights)
		{
			//here we see the order 
			var weights_indexed_array = null;
			var xmlinputs = xmlvertexweights.querySelectorAll("input");
			for(var i = 0; i < xmlinputs.length; i++)
			{
				if( xmlinputs[i].getAttribute("semantic").toUpperCase() == "WEIGHT" )
					weights_indexed_array = sources[ xmlinputs[i].getAttribute("source").substr(1) ];
			}

			if(!weights_indexed_array)
				throw("no weights found");

			var xmlvcount = xmlvertexweights.querySelector("vcount");
			var vcount = this.readContentAsUInt32( xmlvcount );

			var xmlv = xmlvertexweights.querySelector("v");
			var v = this.readContentAsUInt32( xmlv );

			var num_vertices = mesh.vertices.length / 3; //3 components per vertex
			var weights_array = new Float32Array(4 * num_vertices); //4 bones per vertex
			var bone_index_array = new Uint8Array(4 * num_vertices); //4 bones per vertex

			var pos = 0;
			var remap = mesh._remap;

			for(var i = 0; i < vcount.length; ++i)
			{
				var num_bones = vcount[i];
				//sort by weight (to be sure we dont throw the highest one)
				//TODO
				if(num_bones > 4) num_bones = 4;

				for(var j = 0; j < num_bones; ++j)
				{
					bone_index_array[i * 4 + j] = v[pos];
					weights_array[i * 4 + j] = weights_indexed_array[ v[pos+1] ];
					pos += 2;
				}
			}

			//remap
			var final_weights = new Float32Array(4 * num_vertices); //4 bones per vertex
			var final_bone_indices = new Uint8Array(4 * num_vertices); //4 bones per vertex
			for(var i = 0; i < num_vertices; ++i)
			{
				var p = remap[ i ] * 4;
				final_weights.set( weights_array.subarray(p,p+4), i*4);
				final_bone_indices.set( bone_index_array.subarray(p,p+4), i*4);
			}

			mesh.weights = final_weights;
			mesh.bone_indices = final_bone_indices;
			mesh.bones = joints;
		}

		return mesh;
	},

	readMorphController: function(xmlmorph, flip, scene)
	{
		var id_geometry = xmlmorph.getAttribute("source");
		var base_mesh = this.readGeometry( id_geometry, flip );
		if(!base_mesh)
			return null;

		//read sources with blend shapes info (which ones, and the weight)
		var sources = this.readSources(xmlmorph, flip);

		var morphs = [];

		//targets
		var xmltargets = xmlmorph.querySelector("targets");
		if(!xmltargets)
			return null;

		var xmlinputs = xmltargets.querySelectorAll("input");
		var targets = null;
		var weights = null;

		for(var i = 0; i < xmlinputs.length; i++)
		{
			var semantic = xmlinputs[i].getAttribute("semantic").toUpperCase();
			var data = sources[ xmlinputs[i].getAttribute("source").substr(1) ];
			if( semantic == "MORPH_TARGET" )
				targets = data;
			else if( semantic == "MORPH_WEIGHT" )
				weights = data;
		}

		if(!targets || !weights)
			return null;

		//get targets
		for(var i in targets)
		{
			var id = "#" + targets[i];
			var geometry = this.readGeometry( id, flip );
			scene.resources[id] = geometry;
			morphs.push([id, weights[i]]);
		}

		return { type: "morph", mesh: base_mesh, morph_targets: morphs };
	},

	readSources: function(xmlnode, flip)
	{
		//for data sources
		var sources = {};
		var xmlsources = xmlnode.querySelectorAll("source");
		for(var i = 0; i < xmlsources.length; i++)
		{
			var xmlsource = xmlsources[i];
			if(!xmlsource.querySelector) continue;

			var float_array = xmlsource.querySelector("float_array");
			if(float_array)
			{
				var floats = this.readContentAsFloats( xmlsource );
				sources[ xmlsource.getAttribute("id") ] = floats;
				continue;
			}

			var name_array = xmlsource.querySelector("Name_array");
			if(name_array)
			{
				var names = this.readContentAsStringsArray( name_array );
				if(!names)
					return null;
				sources[ xmlsource.getAttribute("id") ] = names;
				continue;
			}
		}

		return sources;
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
		text = text.replace(/\s\s/gi, " ");
		text = text.trim(); //remove empty spaces
		var numbers = text.split(" "); //create array
		var length = xmlnode.getAttribute("count") || numbers.length;
		var floats = new Float32Array( length );
		for(var k = 0; k < numbers.length; k++)
			floats[k] = parseFloat( numbers[k] );
		return floats;
	},
	
	readContentAsStringsArray: function(xmlnode)
	{
		if(!xmlnode) return null;
		var text = xmlnode.textContent;
		text = text.replace(/\n/gi, " "); //remove line breaks
		text = text.replace(/\s\s/gi, " ");
		text = text.trim(); //remove empty spaces
		var words = text.split(" "); //create array
		for(var k = 0; k < words.length; k++)
			words[k] = words[k].trim();
		if(xmlnode.getAttribute("count") && parseInt(xmlnode.getAttribute("count")) != words.length)
		{
			console.error("Error: bone names with spaces not supported by DAE");
			return null;
		}
		return words;
	}
	
	/*
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
	*/
};
Parser.registerParser(parserDAE);
