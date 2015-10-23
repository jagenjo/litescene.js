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

CustomData.prototype.getProperties = function()
{
	var result = {};
	//TODO
	return result;
}

CustomData.prototype.setProperty = function( name, value )
{
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