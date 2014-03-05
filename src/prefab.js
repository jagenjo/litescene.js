
/**
* A Prefab behaves as a container of something packed with resources. This allow to have in one single file
* textures, meshes, etc.
* @class Prefab
* @constructor
*/

function Prefab(o)
{
	if(o)
		this.configure(o);
}

/**
* configure the prefab
* @method configure
* @param {*} data
**/

Prefab.prototype.configure = function(data)
{
	var prefab_json = data["@json"];
	var resources_names = data["@resources_name"];
	this.prefab_json = prefab_json;

	//extract resource names
	if(resources_names)
	{
		var resources = {};
		for(var i in resources_names)
			resources[ resources_names[i] ] = data[ resources_names[i] ];
		this.resources = resources;
	}

	//store resources in ResourcesManager
	this.processResources();
}

Prefab.fromBinary = function(data)
{
	if(data.constructor == ArrayBuffer)
		data = WBin.load(data, true);

	return new Prefab(data);
}

Prefab.prototype.processResources = function()
{
	if(!this.resources)
		return;

	var resources = this.resources;

	//block this resources of being loaded, this is to avoid chain reactions when a resource uses 
	//another one contained in this Prefab
	for(var resname in resources)
	{
		if( LS.ResourcesManager.resources[resname] )
			continue; //already loaded
		LS.ResourcesManager.resources_being_processes[resname] = true;
	}

	//process and store in ResourcesManager
	for(var resname in resources)
	{
		if( LS.ResourcesManager.resources[resname] )
			continue; //already loaded

		var resdata = resources[resname];
		LS.ResourcesManager.processResource(resname,resdata);
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
		return null;

	var conf_data = JSON.parse(this.prefab_json);

	var node = new LS.SceneNode();
	node.configure(conf_data);
	ResourcesManager.loadResources( node.getResources({},true) );

	if(this.fullpath)
		node.prefab = this.fullpath;

	return node;
}

/**
* to create a new prefab, it packs all the data an instantiates the resource
* @method createPrefab
* @return object contained 
**/

Prefab.createPrefab = function(filename, node_data, resources)
{
	if(!filename) return;

	filename = filename.replace(/ /gi,"_");
	resources = resources || {};

	node_data.id = null; //remove the id
	node_data.object_type = "SceneNode";

	var prefab = new Prefab();
	filename += ".wbin";

	prefab.filename = filename;
	prefab.resources = resources;
	prefab.prefab_json = JSON.stringify( node_data );

	//get all the resources and store them
	var bindata = Prefab.packResources(resources, { "@json": prefab.prefab_json });
	prefab._original_file = bindata;

	return prefab;
}

Prefab.packResources = function(resources, base_data)
{
	var to_binary = base_data || {};
	var resources_name = [];
	for(var i in resources)
	{
		var res_name = resources[i];
		var resource = LS.ResourcesManager.resources[res_name];
		if(!resource) continue;

		var data = null;
		if(resource._original_data) //must be string or bytes
			data = resource._original_data;
		else
		{
			var data_info = LS.ResourcesManager.computeResourceInternalData(resource);
			data = data_info.data;
		}

		if(!data)
		{
			console.warning("Wrong data in resource");
			continue;
		}

		resources_name.push(res_name);
		to_binary[res_name] = data;
	}

	to_binary["@resources_name"] = resources_name;
	return WBin.create( to_binary, "Prefab" );
}

LS.Prefab = Prefab;
