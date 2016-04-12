/** 
* This module allows to store custom data inside a node
* properties have the form of:
* - name:
* - value:
* - type:
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
	var varname = path[0];
	var property = this.getProperty( varname );
	if(!property)
		return null;
	return {
		node: this._root,
		target: this,
		name: varname,
		value: property.value,
		type: property.type
	};
}

CustomData.prototype.setPropertyValueFromPath = function( path, value, offset )
{
	offset = offset || 0;

	var varname = path[offset];
	var property = this.getProperty( varname );
	if(!property)
		return;

	//assign
	if(property.value && property.value.set)
		property.value.set( value ); //typed arrays
	else
		property.value = value;
}


CustomData.prototype.onResourceRenamed = function (old_name, new_name, resource)
{
}

LS.registerComponent( CustomData );
LS.CustomData = CustomData;