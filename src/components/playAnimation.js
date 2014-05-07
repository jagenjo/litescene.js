/**
* Reads animation tracks from an Animation resource and applies the properties to the objects referenced
* @class PlayAnimation
* @constructor
* @param {String} object to configure from
*/


function PlayAnimation(o)
{
	this.animation = "";
	this.take = "default";
	this.playback_speed = 1.0;
	this.mode = "loop";
	this.play = true;
	this.current_time = 0;

	this.disabled_tracks = {};

	if(o)
		this.configure(o);
}

PlayAnimation["@animation"] = { widget: "resource" };
PlayAnimation["@mode"] = { type:"enum", values: ["loop","pingpong","once"] };

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

PlayAnimation.prototype.onUpdate = function(e, dt)
{
	if(!this.animation) return;

	var animation = LS.ResourcesManager.resources[ this.animation ];
	if(!animation) return;

	//var time = Scene.getTime() * this.playback_speed;
	if(this.play)
		this.current_time += dt * this.playback_speed;

	var take = animation.takes[ this.take ];
	if(!take) return;

	take.actionPerSample( this.current_time, this._processSample, { disabled_tracks: this.disabled_tracks } );
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