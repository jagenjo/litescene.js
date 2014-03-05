/**
* Moves objects acording to animation
* @class PlayAnimation
* @constructor
* @param {String} object to configure from
*/


function PlayAnimation(o)
{
	this.animation = "";
	this.playback_speed = 1.0;
	if(o)
		this.configure(o);
}

PlayAnimation["@animation"] = { widget: "resource" };


PlayAnimation.prototype.configure = function(o)
{
	this.animation = o.animation;
	if(o.playback_speed)
		this.playback_speed = parseFloat( o.playback_speed );
}


PlayAnimation.icon = "mini-icon-reflector.png";

PlayAnimation.prototype.onAddedToNode = function(node)
{
	LEvent.bind(node,"update",this.onUpdate,this);
}


PlayAnimation.prototype.onRemoveFromNode = function(node)
{
	LEvent.unbind(node,"update",this.onUpdate,this);
}

PlayAnimation.prototype.onUpdate = function(e)
{
	if(!this.animation) return;

	var animation = LS.ResourcesManager.resources[ this.animation ];
	if(!animation) return;

	var time = Scene.getTime() * this.playback_speed;

	for(var i in animation.tracks)
	{
		var track = animation.tracks[i];
		var nodename = track.nodename;
		var node = Scene.getNode(nodename);
		if(!node) continue;

		var local_time = time % track.duration;
		var data = track.data;
		var last_value = null;
		var value = null;
		for(var p = 0; p < data.length; p += track.value_size + 1)
		{
			var t = data[p];
			last_value = value;
			value = data.subarray(p + 1, p + track.value_size + 1);
			if(t < local_time) continue;
			break;
		}

		//var final_value = new Float32Array(value.length);

		switch(track.property)
		{
			case "matrix": if(node.transform)
								node.transform.fromMatrix(value);
			default: break;
		}
	}

	Scene.refresh();
}

LS.registerComponent(PlayAnimation);