/** 
* This module allows to store custom data inside a node
* @class CustomData
* @constructor
* @param {Object} object to configure from
*/

function CustomData(o)
{
	this.properties = [];

	if(o)
		this.configure(o);
}


CustomData.icon = "mini-icon-bg.png";

CustomData.prototype.getResources = function(res)
{
	return res;
}

CustomData.prototype.addProperties = function( property )
{
	this.properties.push( property );
}

CustomData.prototype.getProperty = function( name )
{
	for(var i = 0; i < this.properties.length; i++)
		if(this.properties[i].name == name)
			return this.properties[i];
	return null;
}

CustomData.prototype.getProperties = function()
{
	return this.properties;
}

CustomData.prototype.updateProperty = function( p )
{
	//TODO
}

//used for animation tracks
CustomData.prototype.getPropertyInfoFromPath = function( path )
{
}

CustomData.prototype.setPropertyValueFromPath = function( path, value )
{
}


CustomData.prototype.onResourceRenamed = function (old_name, new_name, resource)
{
}

LS.registerComponent( CustomData );
LS.CustomData = CustomData;