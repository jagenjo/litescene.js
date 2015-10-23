/**
* Transitions between different poses
* @class Poser
* @constructor
* @param {String} object to configure from
*/


function Poser(o)
{
	this.poses = {};

	if(o)
		this.configure(o);
}

//Poser["@animation"] = { widget: "resource" };

Poser.prototype.configure = function(o)
{
}


Poser.icon = "mini-icon-clock.png";

Poser.prototype.onAddedToNode = function(node)
{
	LEvent.bind(node,"update",this.onUpdate, this);
}

Poser.prototype.onRemoveFromNode = function(node)
{
	LEvent.unbind(node,"update",this.onUpdate, this);
}

Poser.prototype.onUpdate = function(e, dt)
{


	var scene = this._root.scene;
	if(!scene)
		scene.refresh();
}

Poser.prototype.getResources = function(res)
{
}

Poser.prototype.onResourceRenamed = function (old_name, new_name, resource)
{
}

//LS.registerComponent( Poser );