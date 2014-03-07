/**
* Moves objects acording to animation
* @class PlayAnimation
* @constructor
* @param {String} object to configure from
*/


function PlayAnimation(o)
{
	this.animation = "";
	this.take = "default";
	this.playback_speed = 1.0;
	if(o)
		this.configure(o);
}

PlayAnimation["@animation"] = { widget: "resource" };


PlayAnimation.prototype.configure = function(o)
{
	if(o.animation)
		this.animation = o.animation;
	if(o.take)
		this.take = o.take;
	if(o.playback_speed != null)
		this.playback_speed = parseFloat( o.playback_speed );
}


PlayAnimation.icon = "mini-icon-reflector.png";

PlayAnimation.prototype.onAddedToNode = function(node)
{
	LEvent.bind(node,"update",this.onUpdate, this);
}


PlayAnimation.prototype.onRemoveFromNode = function(node)
{
	LEvent.unbind(node,"update",this.onUpdate, this);
}

PlayAnimation.prototype.onUpdate = function(e)
{
	if(!this.animation) return;

	var animation = LS.ResourcesManager.resources[ this.animation ];
	if(!animation) return;

	var time = Scene.getTime() * this.playback_speed;

	var take = animation.takes[ this.take ];
	if(!take) return;

	take.actionPerSample( time, this._processSample );
	Scene.refresh();
}

PlayAnimation.prototype._processSample = function(nodename, property, value, options)
{
	var node = Scene.getNode(nodename);
	if(!node) 
		return;

	switch(property)
	{
		case "matrix": if(node.transform)
							node.transform.fromMatrix(value);
						break;
		default: break;
	}
}

PlayAnimation.prototype.getResources = function(res)
{
	if(this.animation)
		res[ this.animation ] = LS.Animation;
}

LS.registerComponent(PlayAnimation);