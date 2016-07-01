
/**
* Prefab work in two ways: 
* - It can contain a node structure and all the associated resources (textures, meshes, animations, etc)
* - When a node in the scene was created from a Prefab, the prefab is loaded so the associated resources are recovered, but the node structure is not modified.
* 
* @class Prefab
* @constructor
*/

function Prefab(o)
{
	this.resource_names = []; 
	this.prefab_json = null;
	this.prefab_data = null; //json object
	this._resources_data = {}; //data as it was loaded from the WBin

	if(o)
		this.configure(o);
}

Prefab.version = "0.2"; //used to know where the file comes from 

/**
* configure the prefab
* @method configure
* @param {*} data
**/

Prefab.prototype.configure = function(data)
{
	if(!data)
		throw("No prefab data found");

	if(data.hasOwnProperty("prefab_data"))
	{
		this.prefab_data = data.prefab_data;
		this.prefab_json = data.prefab_json || JSON.stringify( this.prefab_data );
	}
	else
	{
		//read from WBin info
		var prefab_json = data["@json"];
		if(!prefab_json)
		{
			console.warn("No JSON found in prefab");
			return;
		}

		var version = data["@version"]; //not used yet
		this.prefab_json = prefab_json;
		this.prefab_data = JSON.parse( prefab_json );
	}

	this.resource_names = data["@resources_name"] || data.resource_names;

	//extract resource names
	if(this.resource_names)
	{
		var resources = {};
		for(var i in this.resource_names)
		{
			if(!version) //legacy
				resources[ this.resource_names[i] ] = data[ this.resource_names[i] ];
			else
				resources[ this.resource_names[i] ] = data[ "@RES_" + i ];
		}
		this._resources_data = resources;
	}

	//store resources in ResourcesManager
	this.processResources();
}

Prefab.fromBinary = function(data)
{
	if(data.constructor == ArrayBuffer)
		data = WBin.load(data, true);

	return new LS.Prefab(data);
}

//given a list of resources that come from a Prefab (usually a wbin) it extracts, process and register them 
Prefab.prototype.processResources = function()
{
	if(!this._resources_data)
		return;

	var resources = this._resources_data;

	//block this resources of being loaded, this is to avoid chain reactions when a resource uses 
	//another one contained in this Prefab
	for(var resname in resources)
	{
		if( LS.ResourcesManager.resources[ resname ] )
			continue; //already loaded
		LS.ResourcesManager.resources_being_processed[ resname ] = true;
	}

	//process and store in ResourcesManager
	for(var resname in resources)
	{
		if( LS.ResourcesManager.resources[resname] )
			continue; //already loaded

		var resdata = resources[resname];
		if(!resdata)
		{
			console.warn("resource data in prefab is undefined, skipping it:" + resname);
			continue;
		}
		var resource = LS.ResourcesManager.processResource( resname, resdata, { is_local: true, from_prefab: true } );
	}
}

/**
* Creates an instance of the object inside the prefab
* @method createObject
* @return object contained 
**/

Prefab.prototype.createObject = function()
{
	if(!this.prefab_json)
		throw("No prefab_json data found");

	var conf_data = JSON.parse(this.prefab_json);

	if(!conf_data)
	{
		console.error("Prefab data is null");
		return null;
	}

	var node = new LS.SceneNode();
	node.configure(conf_data);
	LS.ResourcesManager.loadResources( node.getResources({},true) );

	if(this.fullpath)
		node.prefab = this.fullpath;

	return node;
}

/**
* to create a new prefab, it packs all the data an instantiates the resource
* @method Prefab.createPrefab
* @param {String} filename a name for this prefab (if wbin is not appended, it will)
* @param {Object} node_data an object containing all the node data to store
* @param {Array} resource_names_list an array with the name of the resources to store
* @return object containing the prefab data ready to be converted to WBin (it also stores _original_data with the WBin)
**/
Prefab.createPrefab = function( filename, node_data, resource_names_list )
{
	if(!filename)
		return;

	if(!node_data)
		throw("No node_data in prefab");

	filename = filename.replace(/ /gi,"_");
	resource_names_list = resource_names_list || [];

	//LS.clearUIds( node_data ); //remove uids of nodes and components
	node_data.object_type = "SceneNode";

	var prefab = new LS.Prefab();
	var ext = LS.ResourcesManager.getExtension(filename);
	if(ext != "wbin")
		filename += ".wbin";

	//checkfilenames and rename them to short names
	prefab.filename = filename;
	prefab.resource_names = resource_names_list;
	prefab.prefab_data = node_data;
	prefab.prefab_json = JSON.stringify( prefab.prefab_data );

	//get all the resources and store them in a WBin
	var bindata = LS.Prefab.packResources( resource_names_list, { "@json": prefab.prefab_json, "@version": Prefab.version } );
	prefab._original_data = bindata;

	return prefab;
}

//Given a list of resources and some base data, it creates a WBin with all the data
Prefab.packResources = function( resource_names_list, base_data )
{
	var to_binary = base_data || {};
	var resource_names = [];

	if(resource_names_list && resource_names_list.length)
	{
		for(var i = 0; i < resource_names_list.length; ++i)
		{
			var res_name = resource_names_list[i];
			var resource = LS.ResourcesManager.resources[ res_name ];
			if(!resource)
				continue;

			var data = null;
			if(resource._original_data) //must be string or bytes
				data = resource._original_data;
			else
			{
				var data_info = LS.Resource.getDataToStore( resource );
				data = data_info.data;
			}

			if(!data)
			{
				console.warning("Wrong data in resource");
				continue;
			}

			if(data.constructor === Blob || data.constructor === File)
			{
				console.warning("WBin does not support to store File or Blob, please convert to ArrayBuffer using FileReader");
				continue;
			}

			to_binary["@RES_" + resource_names.length ] = data;
			resource_names.push( res_name );
		}
	}

	to_binary["@resources_name"] = resource_names;
	return WBin.create( to_binary, "Prefab" );
}

Prefab.prototype.containsResources = function()
{
	return this.resource_names.length > 0;
}

Prefab.prototype.updateFromNode = function( node, clear_uids )
{
	var data = node.serialize(true);
	if(clear_uids)
		LS.clearUIds(data); //remove UIDs
	this.prefab_data = data;
	this.prefab_json = JSON.stringify( data );
}

Prefab.prototype.flagResources = function()
{
	if(!this.resource_names)
		return;

	for(var i = 0; i < this.resource_names.length; ++i)
	{
		var res_name = this.resource_names[i];
		var resource = LS.ResourcesManager.resources[ res_name ];
		if(!resource)
			continue;

		resource.from_prefab = this.fullpath || this.filename || true;
	}
}

Prefab.prototype.setResourcesLink = function( value )
{
	for(var i = 0; i < this.resource_names.length; ++i)
	{
		var res_name = this.resource_names[i];
		var resource = LS.ResourcesManager.resources[ res_name ];
		if(!resource)
			continue;
		if(value)
			resource.from_prefab = value;
		else
			delete resource.from_prefab;
	}
}

//search for nodes using this prefab and creates the nodes
Prefab.prototype.applyToNodes = function( scene )
{
	scene = scene || LS.GlobalScene;	
	var name = this.fullpath || this.filename;

	for(var i = 0; i < scene._nodes.length; ++i)
	{
		var node = scene._nodes[i];
		if(node.prefab != name)
			continue;
		node.reloadFromPrefab();
	}
}

Prefab.prototype.getDataToStore = function()
{
	this.prefab_json = JSON.stringify( this.prefab_data );
	return LS.Prefab.packResources( this.resource_names, { "@json": this.prefab_json, "@version": LS.Prefab.version } );
}

LS.Prefab = Prefab;
LS.registerResourceClass( Prefab );
