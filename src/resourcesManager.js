/**
* Static class that contains all the resources loaded, parsed and ready to use.
* It also contains the parsers and methods in charge of processing them
*
* @class ResourcesManager
* @constructor
*/

// **** RESOURCES MANANGER *********************************************
// Resources should follow the text structure
// + id: if stored in remote server
// + resource_type: string ("Mesh","Texture",...) or if omitted the classname will be used
// + filename: string
// + fullpath: the full path to reach the file on the server (folder + filename)
// + preview: img
// + toBinary: generates a binary version to store on the server
// + serialize: generates an stringifible object to store on the server

var ResourcesManager = {

	path: "", //url to retrieve resources relative to the index.html
	ignore_cache: false, //change to true to ignore server cache
	free_data: false, //free all data once it has been uploaded to the VRAM

	resources: {}, //filename associated to a resource (texture,meshes,audio,script...)

	meshes: {}, //loadead meshes
	textures: {}, //loadead textures

	resources_being_loaded: {}, //resources waiting to be loaded
	num_resources_being_loaded: 0,
	MAX_TEXTURE_SIZE: 4096,

	formats: {"js":"text", "json":"json", "xml":"xml", "jpg":"image", "png":"image", "bmp":"image" },
	resource_parsers: {}, //in charge or converting a file in a resource

	/**
	* Returns a string to append to any url that should use the browser cache (when updating server info)
	*
	* @method getNoCache
	* @param {Boolean} force force to return a nocache string ignoring the default configuration
	* @return {String} a string to attach to a url so the file wont be cached
	*/

	getNoCache: function(force) { return (!this.ignore_cache && !force) ? "" : "?nocache=" + new Date().getTime() + Math.floor(Math.random() * 1000); },

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

	/**
	* Returns the filename extension from an url
	*
	* @method getExtension
	* @param {String} url
	* @return {String} filename extension
	*/

	getExtension: function(url)
	{
		var point = url.lastIndexOf(".");
		if(point == -1) return "";
		var question = url.lastIndexOf("?");
		question = (question == -1 ? url.length : (question - 1) ) - point;
		return url.substr(point+1,question).toLowerCase();
	},

	/**
	* Loads a generic resource, the type will be inferet from the extension
	*
	* @method load
	* @param {String} url where the resource is located (if its a relative url it depends on the path attribute)
	* @param {Object}[options={}] options to apply to the loaded image
	* @param {Function} [on_complete=null] callback when the resource is loaded and cached
	*/

	load: function(url, options, on_complete)
	{
		options = options || {};
		if(this.resources[url] != null)
		{
			if(on_complete)
				on_complete(this.resources[url]);
			return true;
		}

		//already being loaded
		if(this.resources_being_loaded[url] != null)
		{
			this.resources_being_loaded[url].push( {options: options, callback: on_complete} );
			return;
		}

		//load a new one
		this.resources_being_loaded[url] = [{options: options, callback: on_complete}];
		if(this.num_resources_being_loaded == 0)
			LEvent.trigger(ResourcesManager,"start_loading_resources",url);
			//$(ResourcesManager).trigger("start_loading_resources", url);
		this.num_resources_being_loaded++;

		var pos = url.lastIndexOf(".")+1;
		var extension = url.substr(pos,url.length).toLowerCase();

		var full_url = "";
		if(url.substr(0,7) == "http://")
			full_url = url;
		else
		{
			if(options.local_repository)
				full_url = options.local_repository + "/" + url;
			else
				full_url = this.path + url;
		}

		if(options.force_local_url)
			full_url = url;

		var nocache = this.getNoCache();

		//ajax call
		var settings = {
			url: full_url + nocache,
			success: function(response){
				var res = ResourcesManager.processResource(url,response,options);
				ResourcesManager._resource_loaded_success(url,res); //triggers the on_complete
			},
			error: function(err) { 	ResourcesManager._resource_loaded_error(url,err); }
		};

		var extension = this.getExtension(url);
		var file_format = this.formats[ extension ];
		if(!file_format) file_format = "text";
		settings.dataType = file_format;
		LS.request(settings); //ajax call
		return false;
	},

	/**
	* Process resource (most cases to upload it to the GPU)
	*
	* @method processResource
	* @param {String} url where the resource is located (if its a relative url it depends on the path attribute)
	* @param {*} data the data of the resource (could be string, arraybuffer, image... )
	* @param {Object}[options={}] options to apply to the loaded resource
	*/

	processResource: function(url, data, options)
	{
		var resource = null;
		if(data.object_type && window[ data.object_type ] )
			resource = new window[ data.object_type ](data);
		else if(typeof(resource) == "object")
			resource = data; //its a JSON
		else
		{
			console.error("Unknown resource");
			return null;
		}

		if(!resource.fullpath)
			resource.fullpath = url;

		if(resource.getResources) //associate resources
			ResourcesManager.loadResources( resource.getResources({}) );

		this.registerResource(url,resource);
		return resource;
	},
	
	/**
	* Loads a Mesh from url (in case it is already cached it skips the loading)
	*
	* @method loadMesh
	* @param {String} url where the mesh is located (if its a relative url it depends on the path attribute
	* @param {Object}[options={}] options to apply to the loaded image
	* @param {Function} [on_complete=null] callback when the mesh is loaded and cached
	*/

	loadMesh: function(url, options, on_complete)
	{
		options = options || {};

		if(this.meshes[url] != null)
		{
			if(on_complete)
				on_complete(this.meshes[url]);
			return true;
		}

		//already being loaded
		if(this.resources_being_loaded[url] != null)
		{
			this.resources_being_loaded[url].push( {options: options, callback: on_complete} );
			return;
		}

		//load a new one
		this.resources_being_loaded[url] = [{options: options, callback: on_complete}];
		if(this.num_resources_being_loaded == 0)
			LEvent.trigger(ResourcesManager,"start_loading_resources",url);
			//$(ResourcesManager).trigger("start_loading_resources", url);
		this.num_resources_being_loaded++;

		var pos = url.lastIndexOf(".")+1;
		var extension = url.substr(pos,url.length).toLowerCase();

		var full_url = "";
		if(url.substr(0,7) == "http://")
			full_url = url;
		else
		{
			if(options.local_repository)
				full_url = options.local_repository + "/" + url;
			else
				full_url = this.path + url;
		}

		if(options.force_local_url)
			full_url = url;

		var nocache = this.getNoCache();

		//ajax call
		var settings = {
			url: full_url + nocache,
			success: function(response){
				var mesh = ResourcesManager.processMesh(url,response,options);
				ResourcesManager._resource_loaded_success(url,mesh);
			},
			error: function(err) { 	ResourcesManager._resource_loaded_error(url,err); }
		};

		var res_info = Parser.getResourceInfo(url);

		settings.dataType = "text";
		if(res_info.format == Parser.JSON_FORMAT)
			settings.dataType = 'json';
		else if(res_info.format == Parser.XML_FORMAT)
			settings.dataType = 'xml';
		else if(res_info.format == Parser.BINARY_FORMAT)
			settings.dataType = 'binary';

		LS.request(settings);
		return false;
	},

	/**
	* Takes mesh raw data and creates a propper Mesh instance (uploads to GPU), caches it and launch the associated events
	*
	* @method processMesh
	* @param {String} filename the filename to process this raw data
	* @param {Object} data raw data of the mesh
	* @return {Object} the mesh instance
	*/

	processMesh: function(filename, data, options)
	{
		options = options || {};
		if(!gl) return null;

		//obtain info about the resource (extension, type of res, etc)
		var res_info = Parser.getResourceInfo(filename);

		var mesh_data = null;

		if(options.ignore_parser)
			mesh_data = data;
		else
			mesh_data = Parser.parse(filename, data, options);

		if(mesh_data == null)
		{
			throw ("Error parsing mesh: " + filename);
		}

		filename = options.name || filename; //used to rename AFTER parsing (otherwise parser can get the format wrong)

		var mesh = GL.Mesh.load(mesh_data);
		mesh.object_type = "Mesh"; //useful
		mesh.info = mesh_data.info; //save extra info like bounding
		mesh.metadata = {};
		mesh.filename = filename;
		mesh.generateMetadata(); //useful
		if(!mesh.bounding)
			mesh.computeBounding();

		if(this.free_data) //free buffers to reduce memory usage
			mesh.freeData();

		//save mesh in manager
		this.registerResource(filename,mesh);
		return mesh;
	},

	/**
	* Loads an Image from the internet and calls processImage (it the image is already loaded it skips the loading)
	*
	* @method loadImage
	* @param {String} url where the mesh is located (if its a relative url it depends on the path attribute
	* @param {Function} [on_complete=null] callback when the image is loaded, uploaded to GPU and cached
	* @param {Object}[options={}] options to apply to the loaded image
	*/

	loadImage: function(url, options, on_complete)
	{
		options = options || {};
		if(this.textures[url] != null) //reuse old version
		{
			if(on_complete)
				on_complete(this.textures[url]);
			return true;
		}

		//already being loaded
		if(this.resources_being_loaded[url] != null)
		{
			this.resources_being_loaded[url].push( {options: null, callback: on_complete} );
			return;
		}

		if(url[0] == ":")
		{
			console.error("loadImage: cannot load filenames starting with ':'");
			return null;
		}

		this.resources_being_loaded[url] = [{options: null, callback: on_complete}];
		if(this.num_resources_being_loaded == 0)
			LEvent.trigger(ResourcesManager,"start_loading_resources", url);
			//$(ResourcesManager).trigger("start_loading_resources", url);
		this.num_resources_being_loaded++;

		var full_url = "";
		if(url.substr(0,7) == "http://" || url.substr(0,8) == "https://" || options.force_local_url)
			full_url = url;
		else
		{
			if(options.local_repository)
				full_url = options.local_repository + "/" + url;
			else
				full_url = this.path + url;
		}

		var nocache = this.getNoCache();

		//console.log("Processing image: " + url);
		var res_info = Parser.getResourceInfo(url);
		if(res_info.type == Parser.IMAGE_DATA)
		{
			var img = new Image();
			img.type = 'IMG';
			img.onload = function()
			{
				this.onload = null;
				this.filename = url;
				if(options.flipY) this.flipY = options.flipY;
				var texture = ResourcesManager.processImage(url,this, options);
				ResourcesManager._resource_loaded_success(url,texture);
			}

			//img.onprogress = function(e) { console.log("Image: " + url + "    " + e); }
			img.onerror = function(err) { ResourcesManager._resource_loaded_error(url,err); }

			img.src = full_url + nocache;
		}
		else if (res_info.type == Parser.NONATIVE_IMAGE_DATA)
		{
			var full_url = this.path + url;
			var nocache = this.getNoCache();

			LS.request({
				url: full_url + nocache,
				dataType: "binary",
				success: function(response){
					var img = Parser.parse(url, response);
					var texture = null;
					if (img) {
						texture = ResourcesManager.processImage(url,img, options);
						ResourcesManager._resource_loaded_success(url,texture);
					}
					delete ResourcesManager.resources_being_loaded[url];
				},
				error: function(err) { ResourcesManager._resource_loaded_error(url,err); }
			});
		}
		else
			ResourcesManager._resource_loaded_error(url,"Wront file format");

		return false;
	},

	/**
	* Takes image raw data and creates a propper Texture instance, caches it and launch the associated events
	*
	* @method processImage
	* @param {String} filename the filename to process this raw data
	* @param {Object} data raw data of the image (could be an Image tag or a Canvas tag)
	* @param {Object}[options={}] options to process the data
	* @return {Object} the Texture instance
	*/

	processImage: function(filename, img, options)
	{
		options = options || {};
		if(!gl) return null;

		if (img.width > this.MAX_TEXTURE_SIZE)
		{
			console.log("too big, max is " + this.MAX_TEXTURE_SIZE);
			return null;
		}
		/*
		else if (img.width != img.height)
		{
			if(img.width != (img.height / 6) && (img.height % 6) != 0)
			{
				console.log("Warning: Image must be square (same width and height)");
				//return null;
			}
		}
		else if ( ((Math.log(img.width) / Math.log(2)) % 1) != 0 || ((Math.log(img.height) / Math.log(2)) % 1) != 0)
		{
			console.log("Image dimensions must be power of two (64,128,256,512)");
			return null;
		}
		*/

		if(img.constructor == Texture)
		{
			var texture = img;
			texture.filename = filename;
			this.registerResource(filename, texture);
			console.log("DDS created");
		}
		else if(img.width == (img.height / 6)) //cubemap
		{
			var texture = Texture.cubemapFromImage(img, { wrapS: gl.MIRROR, wrapT: gl.MIRROR, magFilter: gl.LINEAR, minFilter: gl.LINEAR_MIPMAP_LINEAR });
			texture.img = img;
			texture.filename = filename;
			this.registerResource(filename, texture);
			console.log("Cubemap created");
		}
		else //regular texture
		{
			var default_mag_filter = gl.LINEAR;
			//var default_min_filter = img.width == img.height ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR;
			var default_min_filter = gl.LINEAR_MIPMAP_LINEAR;
			if( !isPowerOfTwo(img.width) || !isPowerOfTwo(img.height) )
				default_min_filter = gl.LINEAR;
			var texture = null;

			//from TGAs...
			if(img.pixels)
				texture = GL.Texture.fromMemory(img.width, img.height, img.pixels, { format: (img.bpp == 24 ? gl.RGB : gl.RGBA), flipY: img.flipY, wrapS: gl.REPEAT, wrapT: gl.REPEAT, magFilter: default_mag_filter, minFilter: default_min_filter });
			else //RGBA because particles have alpha (PNGs)
				texture = GL.Texture.fromImage(img, { format: gl.RGBA, wrapS: gl.REPEAT, wrapT: gl.REPEAT, magFilter: default_mag_filter, minFilter: default_min_filter, flipY: img.flipY });
			texture.img = img;
			texture.filename = filename;
			this.registerResource(filename, texture);
		}

		texture.filename = filename;
		texture.generateMetadata(); //useful

		LEvent.trigger(Scene,"change");
		return texture;
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
				ResourcesManager.registerResource(i,mesh);
			}
		}

		var scene = new LS.SceneTree();
		scene.configure(scene_data);

		//load resources
		scene.loadResources();

		return scene;
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
		
			if(res[i] == Mesh)
				this.loadMesh( i, options );
			else if(res[i] == Texture)
				this.loadImage( i, options );
			else
				this.load(i, options );
		}
	},

	computeImageMetadata: function(texture)
	{
		var metadata = { width: texture.width, height: texture.height };
		return metadata;
	},

	/**
	* Stores the resource in the manager containers
	*
	* @method registerResource
	* @param {String} filename 
	* @param {Object} resource 
	*/

	registerResource: function(filename,res)
	{
		if(!res.object_type)
			res.object_type = getObjectClassName(res);
		var type = res.object_type;
		if(type == "Mesh")
			this.meshes[filename] = res;
		else if(type == "Texture")
			this.textures[filename] = res;
		else if(type == "Material")
			Scene.materials[filename] = res;

		this.resources[filename] = res;
		LEvent.trigger(this,"resource_loaded", res);
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
	_resource_loaded_success: function(url,res)
	{
		if( LS.ResourcesManager.debug )
			console.log("RES: " + url + " ---> " + ResourcesManager.num_resources_being_loaded);
		for(var i in ResourcesManager.resources_being_loaded[url])
		{
			if(ResourcesManager.resources_being_loaded[url][i].callback != null)
				ResourcesManager.resources_being_loaded[url][i].callback(res);
		}
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

	_resource_loaded_error: function(url, error)
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