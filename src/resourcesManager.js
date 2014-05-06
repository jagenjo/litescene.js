/**
* Static class that contains all the resources loaded, parsed and ready to use.
* It also contains the parsers and methods in charge of processing them
*
* @class ResourcesManager
* @constructor
*/

// **** RESOURCES MANANGER *********************************************
// Resources should follow the text structure:
// + id: number, if stored in remote server
// + resource_type: string ("Mesh","Texture",...) or if omitted the classname will be used
// + filename: string (this string will be used to get the filetype)
// + fullpath: the full path to reach the file on the server (folder + filename)
// + preview: img url
// + toBinary: generates a binary version to store on the server
// + serialize: generates an stringifible object to store on the server

// + _original_data: ArrayBuffer with the bytes form the original file
// + _original_file: File with the original file where this res came from

var ResourcesManager = {

	path: "", //url to retrieve resources relative to the index.html
	proxy: "", //url to retrieve resources outside of this host
	ignore_cache: false, //change to true to ignore server cache
	free_data: false, //free all data once it has been uploaded to the VRAM
	keep_files: false, //keep the original files inside the resource (used mostly in the webglstudio editor)

	//some containers
	resources: {}, //filename associated to a resource (texture,meshes,audio,script...)
	meshes: {}, //loadead meshes
	textures: {}, //loadead textures
	materials: {}, //shared materials

	resources_being_loaded: {}, //resources waiting to be loaded
	resources_being_processes: {}, //used to avoid loading stuff that is being processes
	num_resources_being_loaded: 0,
	MAX_TEXTURE_SIZE: 4096,

	formats: {"js":"text", "json":"json", "xml":"xml"},
	formats_resource: {},	//tells which resource expect from this file format
	resource_pre_callbacks: {}, //used to extract resource info from a file ->  "obj":callback
	resource_post_callbacks: {}, //used to post process a resource type -> "Mesh":callback

	/**
	* Returns a string to append to any url that should use the browser cache (when updating server info)
	*
	* @method getNoCache
	* @param {Boolean} force force to return a nocache string ignoring the default configuration
	* @return {String} a string to attach to a url so the file wont be cached
	*/

	getNoCache: function(force) { return (!this.ignore_cache && !force) ? "" : "nocache=" + window.performance.now() + Math.floor(Math.random() * 1000); },

	/**
	* Resets all the resources cached, so it frees the memory
	*
	* @method reset
	*/
	reset: function()
	{
		this.resources = {};
		this.meshes = {};
		this.textures = {};
	},

	registerFileFormat: function(extension, data_type)
	{
		this.formats[extension.toLowerCase()] = data_type;
	},	

	registerResourcePreProcessor: function(fileformats, callback, data_type, resource_type)
	{
		var ext = fileformats.split(",");
		for(var i in ext)
		{
			var extension = ext[i].toLowerCase();
			this.resource_pre_callbacks[ extension ] = callback;
			if(data_type)
				this.formats[ extension ] = data_type;
			if(resource_type)
				this.formats_resource[ extension ] = resource_type;
		}
	},

	registerResourcePostProcessor: function(resource_type, callback)
	{
		this.resource_post_callbacks[ resource_type ] = callback;
	},

	/**
	* Returns the filename extension from an url
	*
	* @method getExtension
	* @param {String} url
	* @return {String} filename extension
	*/

	getExtension: function(url)
	{
		var question = url.indexOf("?");
		if(question != -1)
			url = url.substr(0,question);

		var point = url.lastIndexOf(".");
		if(point == -1) return "";
		return url.substr(point+1).toLowerCase();
	},

	/**
	* Returns the filename from a full path
	*
	* @method getFilename
	* @param {String} fullpath
	* @return {String} filename extension
	*/

	getFilename: function(fullpath)
	{
		var pos = fullpath.lastIndexOf("/");
		//if(pos == -1) return fullpath;
		var question = fullpath.lastIndexOf("?");
		question = (question == -1 ? fullpath.length : (question - 1) ) - pos;
		return fullpath.substr(pos+1,question);
	},	

	/**
	* Returns the filename without the extension
	*
	* @method getBasename
	* @param {String} fullpath
	* @return {String} filename extension
	*/

	getBasename: function(fullpath)
	{
		var name = this.getFilename(fullpath);
		var pos = name.indexOf(".");
		if(pos == -1) return name;
		return name.substr(0,pos);
	},		

	/**
	* Loads all the resources in the Object (it uses an object to store not only the filename but also the type)
	*
	* @method loadResources
	* @param {Object} resources contains all the resources, associated with its type
	* @param {Object}[options={}] options to apply to the loaded resources
	*/

	loadResources: function(res, options )
	{
		for(var i in res)
		{
			if( typeof(i) != "string" || i[0] == ":" )
				continue;
			this.load(i, options );
		}
	},	

	/**
	* Loads a generic resource, the type will be infered from the extension, if it is json or wbin it will be processed
	*
	* @method load
	* @param {String} url where the resource is located (if its a relative url it depends on the path attribute)
	* @param {Object}[options={}] options to apply to the loaded image
	* @param {Function} [on_complete=null] callback when the resource is loaded and cached
	*/

	load: function(url, options, on_complete)
	{
		options = options || {};

		//if we already have it, then nothing to do
		if(this.resources[url] != null)
		{
			if(on_complete)
				on_complete(this.resources[url]);
			return true;
		}

		//extract the filename extension
		var extension = this.getExtension(url);
		if(!extension) //unknown file type
			return false;

		//if it is already being loaded, then add the callback and wait
		if(this.resources_being_loaded[url] != null)
		{
			this.resources_being_loaded[url].push( {options: options, callback: on_complete} );
			return;
		}

		if(this.resources_being_processes[url])
			return; //nothing to load, just waiting for the callback to process it

		//otherwise we have to load it
		//set the callback
		this.resources_being_loaded[url] = [{options: options, callback: on_complete}];
		//send an event if we are starting to load (used for loading icons)
		if(this.num_resources_being_loaded == 0)
			LEvent.trigger(ResourcesManager,"start_loading_resources",url);
		this.num_resources_being_loaded++;


		var full_url = "";
		if(url.substr(0,7) == "http://")
		{
			full_url = url;
			if(this.proxy) //proxy external files
				full_url = this.proxy + url.substr(7);
		}
		else
		{
			if(options.local_repository)
				full_url = options.local_repository + "/" + url;
			else
				full_url = this.path + url;
		}

		//you can ignore the resources server for some assets if you want
		if(options.force_local_url)
			full_url = url;

		//avoid the cache (if you want)
		var nocache = this.getNoCache();
		if(nocache)
			full_url += (full_url.indexOf("?") == -1 ? "?" : "&") + nocache;

		//create the ajax request
		var settings = {
			url: full_url,
			success: function(response){
				ResourcesManager.processResource(url, response, options, ResourcesManager._resourceLoadedSuccess );
			},
			error: function(err) { 	ResourcesManager._resourceLoadedError(url,err); }
		};

		//in case we need to force a response format 
		var file_format = this.formats[ extension ];
		if(file_format) //if not it will be set by http server
			settings.dataType = file_format;

		//send the REQUEST
		LS.request(settings); //ajax call
		return false;
	},

	/**
	* Process resource: transform some data in an Object ready to use and stores it (in most cases uploads it to the GPU)
	*
	* @method processResource
	* @param {String} url where the resource is located (if its a relative url it depends on the path attribute)
	* @param {*} data the data of the resource (could be string, arraybuffer, image... )
	* @param {Object}[options={}] options to apply to the loaded resource
	*/

	processResource: function(url, data, options, on_complete)
	{
		options = options || {};
		if(!data) throw("No data found when processing resource: " + url);
		var resource = null;
		var extension = this.getExtension(url);

		//this.resources_being_loaded[url] = [];
		this.resources_being_processes[url] = true;

		//no extension, then or it is a JSON, or an object with object_type or a WBin
		if(!extension)
		{
			if(typeof(data) == "string")
				data = JSON.parse(data);

			if(data.constructor == ArrayBuffer)
			{
				resource = WBin.load(data);
				inner_onResource(url, resource);
				return;
			}
			else
			{
				var type = data.object_type;
				if(type && window[type])
				{
					var ctor = window[type];
					var resource = null;
					if(ctor.prototype.configure)
					{
						resource = new window[type]();
						resource.configure( data );
					}
					else
						resource = new window[type]( data );
					inner_onResource(url, resource);
					return;
				}
				else
					return false;
			}
		}

		var callback = this.resource_pre_callbacks[extension.toLowerCase()];
		if(!callback)
		{
			console.log("Resource format unknown: " + extension)
			return false;
		}

		//parse
		var resource = callback(url, data, options, inner_onResource);
		if(resource)
			inner_onResource(url, resource);

		//callback when the resource is ready
		function inner_onResource(filename, resource)
		{
			resource.filename = filename;
			if(options.filename) //used to overwrite
				resource.filename = options.filename;

			if(!resource.fullpath)
				resource.fullpath = url;

			if(LS.ResourcesManager.resources_being_processes[filename])
				delete LS.ResourcesManager.resources_being_processes[filename];

			//keep original file inside the resource
			if(LS.ResourcesManager.keep_files && (data.constructor == ArrayBuffer || data.constructor == String) )
				resource._original_data = data;

			//load associated resources
			if(resource.getResources)
				ResourcesManager.loadResources( resource.getResources({}) );

			//register in the containers
			LS.ResourcesManager.registerResource(url, resource);

			//callback 
			if(on_complete)
				on_complete(url, resource, options);
		}
	},

	/**
	* Stores the resource inside the manager containers. This way it will be retrieveble by anybody who needs it.
	*
	* @method registerResource
	* @param {String} filename 
	* @param {Object} resource 
	*/

	registerResource: function(filename,resource)
	{
		//get which kind of resource
		if(!resource.object_type)
			resource.object_type = LS.getObjectClassName(resource);
		var type = resource.object_type;
		if(resource.constructor.resource_type)
			type = resource.constructor.resource_type;

		//some resources could be postprocessed after being loaded
		var post_callback = this.resource_post_callbacks[ type ];
		if(post_callback)
			post_callback(filename, resource);

		//global container
		this.resources[filename] = resource;

		//send message to inform new resource is available
		LEvent.trigger(this,"resource_registered", resource);
		Scene.refresh(); //render scene
	},	

	/**
	* Returns an object with a representation of the resource internal data
	* The order to obtain that object is:
	* 1. test for _original_file (File or Blob)
	* 2. test for _original_data (ArrayBuffer)
	* 3. toBinary() (ArrayBuffer)
	* 4. toBlob() (Blob)
	* 5. toBase64() (String)
	* 6. serialize() (Object in JSON format)
	* 7. data property 
	* 8. JSON.stringify(...)
	*
	* @method computeResourceInternalData
	* @param {Object} resource 
	* @return {Object} it has two fields: data and encoding
	*/
	computeResourceInternalData: function(resource)
	{
		if(!resource) throw("Resource is null");

		var data = null;
		var encoding = "text";
		var extension = "";

		//get the data
		if (resource._original_file) //file
		{
			data = resource._original_file;
			encoding = "file";
		}
		else if(resource._original_data) //file in ArrayBuffer format
			data = resource._original_data;
		else if(resource.toBinary) //a function to compute the ArrayBuffer format
		{
			data = resource.toBinary();
			encoding = "binary";
			extension = "wbin";
		}
		else if(resource.toBlob) //a blob (Canvas should have this)
		{
			data = resource.toBlob();
			encoding = "file";
		}
		else if(resource.toBase64) //a base64 string
		{
			data = resource.toBase64();
			encoding = "base64";
		}
		else if(resource.serialize) //a json object
			data = JSON.stringify( resource.serialize() );
		else if(resource.data) //regular string data
			data = resource.data;
		else
			data = JSON.stringify( resource );

		if(data.buffer && data.buffer.constructor == ArrayBuffer)
			data = data.buffer; //store the data in the arraybuffer

		return {data:data, encoding: encoding, extension: extension};
	},	

	renameResource: function(old, newname)	
	{
		var res = this.resources[ old ];
		if(!res) return;

		res.filename = newname;
		res.fullpath = newname;
		this.resources[newname] = res;
		delete this.resources[ old ];

		//ugly: too hardcoded
		if( this.meshes[old] ) {
			delete this.meshes[ old ];
			this.meshes[ newname ] = res;
		}
		if( this.textures[old] ) {
			delete this.textures[ old ];
			this.textures[ newname ] = res;
		}
	},

	/**
	* Tells if it is loading resources
	*
	* @method isLoading
	* @return {Boolean}
	*/
	isLoading: function()
	{
		return this.num_resources_being_loaded > 0;
	},	

	processScene: function(filename, data, options)
	{
		var scene_data = Parser.parse(filename, data, options);

		//register meshes
		if(scene_data.meshes)
		{
			for (var i in scene_data.meshes)
			{
				var mesh_data = scene_data.meshes[i];
				var mesh = GL.Mesh.load(mesh_data);
				/*
				var morphs = [];
				if(mesh.morph_targets)
					for(var j in mesh.morph_targets)
					{

					}
				*/

				ResourcesManager.registerResource(i,mesh);
			}
		}

		var scene = new LS.SceneTree();
		scene.configure(scene_data);

		//load resources
		scene.loadResources();

		return scene;
	},

	computeImageMetadata: function(texture)
	{
		var metadata = { width: texture.width, height: texture.height };
		return metadata;
	},


	/**
	* returns a mesh resource if it is loaded
	*
	* @method getMesh
	* @param {String} filename 
	* @return {Mesh}
	*/

	getMesh: function(name) {
		if(name != null) return this.meshes[name];
		return null;
	},

	/**
	* returns a texture resource if it is loaded
	*
	* @method getTexture
	* @param {String} filename 
	* @return {Texture} 
	*/

	getTexture: function(name) {
		if(name != null) return this.textures[name];
		return null;
	},

	//*************************************

	//Called after a resource has been loaded successfully and processed
	_resourceLoadedSuccess: function(url,res)
	{
		if( LS.ResourcesManager.debug )
			console.log("RES: " + url + " ---> " + ResourcesManager.num_resources_being_loaded);

		for(var i in ResourcesManager.resources_being_loaded[url])
		{
			if(ResourcesManager.resources_being_loaded[url][i].callback != null)
				ResourcesManager.resources_being_loaded[url][i].callback(res);
		}
		//two pases, one for launching, one for removing
		if(ResourcesManager.resources_being_loaded[url])
		{
			delete ResourcesManager.resources_being_loaded[url];
			ResourcesManager.num_resources_being_loaded--;
			if( ResourcesManager.num_resources_being_loaded == 0)
			{
				LEvent.trigger( ResourcesManager, "end_loading_resources");
			}
		}
	},

	_resourceLoadedError: function(url, error)
	{
		console.log("Error loading " + url);
		delete ResourcesManager.resources_being_loaded[url];
		LEvent.trigger( ResourcesManager, "resource_not_found", url);
		ResourcesManager.num_resources_being_loaded--;
		if( ResourcesManager.num_resources_being_loaded == 0 )
			LEvent.trigger( ResourcesManager, "end_loading_resources");
			//$(ResourcesManager).trigger("end_loading_resources");
	},

	//NOT TESTED: to load script asyncronously, not finished. similar to require.js
	require: function(files, on_complete)
	{
		if(typeof(files) == "string")
			files = [files];

		//store for the callback
		var last = files[ files.length - 1];
		if(on_complete)
		{
			if(!ResourcesManager._waiting_callbacks[ last ])
				ResourcesManager._waiting_callbacks[ last ] = [on_complete];
			else
				ResourcesManager._waiting_callbacks[ last ].push(on_complete);
		}
		require_file(files);

		function require_file(files)
		{
			//avoid require twice a file
			var url = files.shift(1); 
			while( ResourcesManager._required_files[url] && url )
				url = files.shift(1);

			ResourcesManager._required_files[url] = true;

			LS.request({
				url: url,
				success: function(response)
				{
					eval(response);
					if( ResourcesManager._waiting_callbacks[ url ] )
						for(var i in ResourcesManager._waiting_callbacks[ url ])
							ResourcesManager._waiting_callbacks[ url ][i]();
					require_file(files);
				}
			});
		}
	},
	_required_files: {},
	_waiting_callbacks: {}
};

LS.ResourcesManager = ResourcesManager;
LS.RM = ResourcesManager;

LS.getTexture = function(name_or_texture) {
	return LS.ResourcesManager.getTexture(name_or_texture);
}	


//Post process resources *******************

LS.ResourcesManager.registerResourcePostProcessor("Mesh", function(filename, mesh ) {

	mesh.object_type = "Mesh"; //useful
	if(mesh.metadata)
	{
		mesh.metadata = {};
		mesh.generateMetadata(); //useful
	}
	if(!mesh.bounding || mesh.bounding.length != BBox.data_length)
	{
		mesh.bounding = null; //remove bad one (just in case)
		mesh.updateBounding();
	}
	if(!mesh.getBuffer("normals"))
		mesh.computeNormals();

	if(LS.ResourcesManager.free_data) //free buffers to reduce memory usage
		mesh.freeData();

	LS.ResourcesManager.meshes[filename] = mesh;
});

LS.ResourcesManager.registerResourcePostProcessor("Texture", function(filename, texture ) {
	//store
	LS.ResourcesManager.textures[filename] = texture;
});

LS.ResourcesManager.registerResourcePostProcessor("Material", function(filename, material ) {
	//store
	LS.ResourcesManager.materials[filename] = material;
});



//Resources readers *********
//global formats: take a file and extract info
LS.ResourcesManager.registerResourcePreProcessor("wbin", function(filename, data, options) {
	var data = new WBin.load(data);
	return data;
},"binary");

LS.ResourcesManager.registerResourcePreProcessor("json", function(filename, data, options) {
	var resource = data;
	if(typeof(data) == "object" && data.object_type && window[ data.object_type ])
	{
		var ctor = window[ data.object_type ];
		if(ctor.prototype.configure)
		{
			resource = new ctor();
			resource.configure(data);
		}
		else
			resource = new ctor(data);
	}
	return resource;
});

//Textures ********
//Takes one image (or canvas) as input and creates a Texture
LS.ResourcesManager.processImage = function(filename, img, options)
{
	if(img.width == (img.height / 6)) //cubemap
	{
		var texture = Texture.cubemapFromImage(img, { wrapS: gl.MIRROR, wrapT: gl.MIRROR, magFilter: gl.LINEAR, minFilter: gl.LINEAR_MIPMAP_LINEAR });
		texture.img = img;
		console.log("Cubemap created");
	}
	else //regular texture
	{
		var default_mag_filter = gl.LINEAR;
		var default_wrap = gl.REPEAT;
		//var default_min_filter = img.width == img.height ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR;
		var default_min_filter = gl.LINEAR_MIPMAP_LINEAR;
		if( !isPowerOfTwo(img.width) || !isPowerOfTwo(img.height) )
		{
			default_min_filter = gl.LINEAR;
			default_wrap = gl.CLAMP_TO_EDGE; 
		}
		var texture = null;

		//from TGAs...
		if(img.pixels) //not a real image, just an object with width,height and a buffer with all the pixels
			texture = GL.Texture.fromMemory(img.width, img.height, img.pixels, { format: (img.bpp == 24 ? gl.RGB : gl.RGBA), flipY: img.flipY, wrapS: gl.REPEAT, wrapT: gl.REPEAT, magFilter: default_mag_filter, minFilter: default_min_filter });
		else //default format is RGBA (because particles have alpha)
			texture = GL.Texture.fromImage(img, { format: gl.RGBA, wrapS: default_wrap, wrapT: default_wrap, magFilter: default_mag_filter, minFilter: default_min_filter, flipY: img.flipY });
		texture.img = img;
	}

	texture.filename = filename;
	texture.generateMetadata(); //useful
	return texture;
}

//basic formats
LS.ResourcesManager.registerResourcePreProcessor("jpg,jpeg,png,webp,gif", function(filename, data, options, callback) {

	var extension = LS.ResourcesManager.getExtension(filename);
	var mimetype = 'image/png';
	if(extension == "jpg" || extension == "jpeg")
		mimetype = "image/jpg";
	if(extension == "webp")
		mimetype = "image/webp";
	if(extension == "gif")
		mimetype = "image/gif";

	var blob = new Blob([data],{type: mimetype});
	var objectURL = URL.createObjectURL(blob);
	var image = new Image();
	image.src = objectURL;
	image.real_filename = filename; //hard to get the original name from the image
	image.onload = function()
	{
		var filename = this.real_filename;
		var texture = LS.ResourcesManager.processImage(filename, this, options);
		if(texture)
		{
			LS.ResourcesManager.registerResource(filename, texture);
			if(LS.ResourcesManager.keep_files)
				texture._original_data = data;
		}
		URL.revokeObjectURL(objectURL); //free memory
		if(!texture)
			return;

		if(callback)
			callback(filename,texture,options);
	}

},"binary","Texture");

//special formats parser inside the system
LS.ResourcesManager.registerResourcePreProcessor("dds,tga", function(filename, data, options) {

	//clone because DDS changes the original data
	var cloned_data = new Uint8Array(data).buffer;
	var texture_data = Parser.parse(filename, cloned_data, options);	

	if(texture_data.constructor == Texture)
	{
		var texture = texture_data;
		texture.filename = filename;
		return texture;
	}

	var texture = LS.ResourcesManager.processImage(filename, texture_data);
	return texture;
}, "binary","Texture");


//Meshes ********
LS.ResourcesManager.processASCIIMesh = function(filename, data, options) {

	var mesh_data = Parser.parse(filename, data, options);

	if(mesh_data == null)
	{
		console.error("Error parsing mesh: " + filename);
		return null;
	}

	var mesh = GL.Mesh.load(mesh_data);
	return mesh;
}

LS.ResourcesManager.registerResourcePreProcessor("obj,ase", LS.ResourcesManager.processASCIIMesh, "text","Mesh");

LS.ResourcesManager.processASCIIScene = function(filename, data, options) {

	var scene_data = Parser.parse(filename, data, options);

	if(scene_data == null)
	{
		console.error("Error parsing mesh: " + filename);
		return null;
	}

	//resources
	for(var i in scene_data.resources)
	{
		var resource = scene_data.resources[i];
		LS.ResourcesManager.processResource(i,resource);
	}

	var node = new LS.SceneNode();
	node.configure(scene_data.root);

	Scene.root.addChild(node);
	return node;
}

LS.ResourcesManager.registerResourcePreProcessor("dae", LS.ResourcesManager.processASCIIScene, "text","Scene");






Mesh.fromBinary = function( data_array )
{
	var o = null;
	if(data_array.constructor == ArrayBuffer )
		o = WBin.load( data_array );
	else
		o = data_array;

	var vertex_buffers = {};
	for(var i in o.vertex_buffers)
		vertex_buffers[ o.vertex_buffers[i] ] = o[ o.vertex_buffers[i] ];

	var index_buffers = {};
	for(var i in o.index_buffers)
		index_buffers[ o.index_buffers[i] ] = o[ o.index_buffers[i] ];

	var mesh = new GL.Mesh(vertex_buffers, index_buffers);
	mesh.info = o.info;
	mesh.bounding = o.bounding;
	if(o.bones)
	{
		mesh.bones = o.bones;
		//restore Float32array
		for(var i = 0; i < mesh.bones.length; ++i)
			mesh.bones[i][1] = mat4.clone(mesh.bones[i][1]);
		if(o.bind_matrix)
			mesh.bind_matrix = mat4.clone( o.bind_matrix );		
	}
	
	return mesh;
}

Mesh.prototype.toBinary = function()
{
	if(!this.info)
		this.info = {};


	//clean data
	var o = {
		object_type: "Mesh",
		info: this.info,
		groups: this.groups
	};

	if(this.bones)
	{
		var bones = [];
		//convert to array
		for(var i = 0; i < this.bones.length; ++i)
			bones.push([ this.bones[i][0], mat4.toArray( this.bones[i][1] ) ]);
		o.bones = bones;
		if(this.bind_matrix)
			o.bind_matrix = this.bind_matrix;
	}

	//bounding box
	if(!this.bounding)	
		this.updateBounding();
	o.bounding = this.bounding;

	var vertex_buffers = [];
	var index_buffers = [];

	for(var i in this.vertexBuffers)
	{
		var stream = this.vertexBuffers[i];
		o[ stream.name ] = stream.data;
		vertex_buffers.push( stream.name );

		if(stream.name == "vertices")
			o.info.num_vertices = stream.data.length / 3;
	}

	for(var i in this.indexBuffers)
	{
		var stream = this.indexBuffers[i];
		o[i] = stream.data;
		index_buffers.push( i );
	}

	o.vertex_buffers = vertex_buffers;
	o.index_buffers = index_buffers;

	//create pack file
	var bin = WBin.create(o, "Mesh");

	return bin;
}

