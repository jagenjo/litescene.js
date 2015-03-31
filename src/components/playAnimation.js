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
	if(!this.animation) 
		return;

	var animation = LS.ResourcesManager.resources[ this.animation ];
	if(!animation) 
		return;

	//var time = Scene.getTime() * this.playback_speed;
	if(this.play)
		this.current_time += dt * this.playback_speed;

	var take = animation.takes[ this.take ];
	if(!take) 
		return;

	take.actionPerSample( this.current_time, this._processSample, { disabled_tracks: this.disabled_tracks } );

	var scene = this._root.scene;
	if(!scene)
		scene.refresh();
}

PlayAnimation.prototype._processSample = function(nodename, property, value, options)
{
	var scene = this._root.scene;
	if(!scene)
		return;
	var node = scene.getNode(nodename);
	if(!node) 
		return;
		
	var trans = node.transform;

	switch(property)
	{
		case "translate.X": if(trans) trans.position[0] = value; break;
		case "translate.Y": if(trans) trans.position[1] = value; break;
		case "translate.Z": if(trans) trans.position[2] = value; break;
		//NOT TESTED
		/*
		case "rotateX.ANGLE": if(trans) trans.rotation[0] = value * DEG2RAD; break;
		case "rotateY.ANGLE": if(trans) trans.rotation[1] = value * DEG2RAD; break;
		case "rotateZ.ANGLE": if(trans) trans.rotation[2] = value * DEG2RAD; break;
		*/
		case "matrix": if(trans) trans.fromMatrix(value); break;
		default: break;
	}
	
	if(node.transform)
		node.transform.updateMatrix();
}

PlayAnimation.prototype.getResources = function(res)
{
	if(this.animation)
		res[ this.animation ] = LS.Animation;
}

PlayAnimation.prototype.onResourceRenamed = function (old_name, new_name, resource)
{
	if(this.animation == old_name)
		this.animation = new_name;
}

LS.registerComponent(PlayAnimation);