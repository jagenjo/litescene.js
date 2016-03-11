
/**
* Pack is an object that contain several resources, helpful when you want to carry a whole scene in one single file
* 
* @class Pack
* @constructor
*/

function Pack(o)
{
	this.resource_names = []; 
	this.metadata = {};
	this._resources_data = {};
	if(o)
		this.configure(o);
}

Pack.version = "0.1"; //used to know where the file comes from 

/**
* configure the pack from an unpacked WBin
* @method configure
* @param {*} data
**/
Pack.prototype.configure = function( data )
{
	var version = data["@version"];
	var metadata = data["@metadata"];
	if(metadata)
		this.metadata = metadata.constructor === String ? JSON.parse( metadata ) : metadata;

	//extract resource names
	this.resource_names = data["@resource_names"];
	this._resources_data = {};
	if(this.resource_names)
	{
		for(var i in this.resource_names)
			this._resources_data[ this.resource_names[i] ] = data[ "@RES_" + i ];
	}

	//store resources in LS.ResourcesManager
	this.processResources();
}

Pack.fromBinary = function(data)
{
	if(data.constructor == ArrayBuffer)
		data = WBin.load(data, true);
	return new LS.Pack(data);
}

//given a list of resources that come from the Pack (usually a wbin) it extracts, process and register them 
Pack.prototype.processResources = function()
{
	if(!this.resource_names)
		return;

	//block this resources of being loaded, this is to avoid chain reactions when a resource uses 
	//another one contained in this pack
	for(var i = 0; i < this.resource_names.length; ++i)
	{
		var resname = this.resource_names[i];
		if( LS.ResourcesManager.resources[ resname ] )
			continue; //already loaded
		LS.ResourcesManager.resources_being_processed[ resname ] = true;
	}

	//process and store in LS.ResourcesManager
	for(var i = 0; i < this.resource_names.length; ++i)
	{
		var resname = this.resource_names[i];
		if( LS.ResourcesManager.resources[resname] )
			continue; //already loaded

		var resdata = this._resources_data[ resname ];
		if(!resdata)
		{
			console.warn("resource data in Pack is undefined, skipping it:" + resname);
			continue;
		}
		var resource = LS.ResourcesManager.processResource( resname, resdata, { is_local: true, from_pack: true } );
	}
}

Pack.prototype.setResources = function( resource_names, mark_them )
{
	this.resource_names = [];
	this._resources_data = {};

	//get resources
	for(var i = 0; i < resource_names.length; ++i)
	{
		var res_name = resource_names[i];
		if(this.resource_names.indexOf(res_name) != -1)
			continue;
		var resource = LS.ResourcesManager.resources[ res_name ];
		if(!resource)
			continue;
		if(mark_them)
			resource.from_pack = true;
		this.resource_names.push( res_name );
	}

	//repack the pack info
	this._original_data = LS.Pack.packResources( resource_names, { "@metadata": JSON.stringify( this.metadata ), "@version": LS.Pack.version } );
	this._modified = true;
}

Pack.prototype.addResources = function( resource_names, mark_them )
{
	this.setResources( this.resource_names.concat( resource_names ), mark_them );
}

/**
* to create a WBin containing all the resource and metadata
* @method Pack.createWBin
* @param {String} fullpath for the pack
* @param {Array} resource_names array with the names of all the resources to store
* @param {Object} metadata [optional] extra data to store
* @param {boolean} mark_them [optional] marks all the resources as if they come from a pack
* @return object containing the pack data ready to be converted to WBin
**/
Pack.createPack = function( filename, resource_names, metadata, mark_them )
{
	if(!filename)
		return;

	if(!resource_names || resource_names.constructor !== Array)
		throw("Pack.createPack resources must be array with names");

	filename = filename.replace(/ /gi,"_");

	var pack = new LS.Pack();
	filename += ".wbin";
	pack.filename = filename;
	if(metadata)
		pack.metadata = metadata;
	var metadata_json = JSON.stringify( pack.metadata );

	pack.resource_names = resource_names;
	for(var i = 0; i < resource_names.length; ++i)
	{
		var res_name = resource_names[i];
		var resource = LS.ResourcesManager.resources[ res_name ];
		if(!resource)
			continue;
		if(mark_them)
			resource.from_pack = true;
	}

	//create the WBIN in case this pack gets stored
	var bindata = LS.Pack.packResources( resource_names, { "@metadata": metadata_json, "@version": LS.Pack.version } );
	pack._original_data = bindata;

	return pack;
}

//Given a bunch of resource names it creates a WBin with all inside
Pack.packResources = function( resource_names, base_object )
{
	var to_binary = base_object || {};
	var final_resource_names = [];

	for(var i = 0; i < resource_names.length; ++i)
	{
		var res_name = resource_names[i];
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

		to_binary["@RES_" + final_resource_names.length ] = data;
		final_resource_names.push( res_name );
		//to_binary[res_name] = data;
	}

	to_binary["@resource_names"] = final_resource_names;
	return WBin.create( to_binary, "Pack" );
}

//just tells the resources where they come from, we cannot do that before because we didnt have the name of the pack
Pack.prototype.flagResources = function()
{
	if(!this.resource_names)
		return;

	for(var i = 0; i < this.resource_names.length; ++i)
	{
		var res_name = this.resource_names[i];
		var resource = LS.ResourcesManager.resources[ res_name ];
		if(!resource)
			continue;

		resource.from_pack = this.fullpath || this.filename || true;
	}
}

LS.Classes["Pack"] = LS.Pack = Pack;
