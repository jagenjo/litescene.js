///@INFO: ANIMATION
/**
* Reads animation from a ONE.SkeletalAnimation resource and applies the properties to the SkinDeformer in this node
* @class PlaySkeletalAnimation
* @namespace ONE.Components
* @constructor
* @param {String} object to configure from
*/
function PlaySkeletalAnimation(o)
{
	this.enabled = true;
	this.animation = "";
	this.playback_speed = 1.0;

	this._skeleton = new ONE.Skeleton();

	/**
	* how to play the animation, options are:
    *   PlaySkeletalAnimation.LOOP
	*	PlaySkeletalAnimation.PINGPONG
	*	PlaySkeletalAnimation.ONCE
	*	PlaySkeletalAnimation.PAUSED
	* @property mode {Number}
	*/
	this.mode = PlaySkeletalAnimation.LOOP;
	this.playing = true;
	this.current_time = 0;
	this.range = null;
	this.interpolate = true;

	if(o)
		this.configure(o);
}

PlaySkeletalAnimation.LOOP = 1;
PlaySkeletalAnimation.PINGPONG = 2;
PlaySkeletalAnimation.ONCE = 3;
PlaySkeletalAnimation.PAUSED = 4;

PlaySkeletalAnimation.MODES = {"loop":PlaySkeletalAnimation.LOOP, "pingpong":PlaySkeletalAnimation.PINGPONG, "once":PlaySkeletalAnimation.ONCE, "paused":PlaySkeletalAnimation.PAUSED };

PlaySkeletalAnimation["@animation"] = { widget: "resource", resource_classname:"SkeletalAnimation" };
PlaySkeletalAnimation["@mode"] = { type:"enum", values: PlaySkeletalAnimation.MODES };
PlaySkeletalAnimation["@current_time"] = { type: ONE.TYPES.NUMBER, min: 0, units:"s" };

PlaySkeletalAnimation.prototype.configure = function(o)
{
	if(o.enabled !== undefined)
		this.enabled = !!o.enabled;
	if(o.range) 
		this.range = o.range.concat();
	if(o.mode !== undefined) 
		this.mode = o.mode;
	if(o.animation)
		this.animation = o.animation;
	if(o.playback_speed != null)
		this.playback_speed = parseFloat( o.playback_speed );
	if(o.current_time != null)
		this.current_time = parseFloat( o.current_time );
	if(o.playing !== undefined)
		this.playing = o.playing;
}

PlaySkeletalAnimation.icon = "mini-icon-clock.png";

PlaySkeletalAnimation.prototype.onAddedToScene = function(scene)
{
	LEvent.bind( scene, "update", this.onUpdate, this);
}

PlaySkeletalAnimation.prototype.onRemovedFromScene = function(scene)
{
	LEvent.unbind( scene, "update", this.onUpdate, this);

	//Remove from SkinDeformer
}

PlaySkeletalAnimation.prototype.onUpdate = function(e, dt)
{
	if(!this.enabled)
		return;

	if(!this.playing)
		return;

	if( this.mode != PlaySkeletalAnimation.PAUSED )
		this.current_time += dt * this.playback_speed;

	this.onUpdateAnimation( dt );
}

PlaySkeletalAnimation.prototype.onUpdateAnimation = function(dt)
{
	var animation = this.getAnimation();
	if( !animation || animation.constructor != ONE.SkeletalAnimation ) 
		return;

	var time = this.current_time;
	var start_time = 0;
	var duration = animation.duration;
	var end_time = duration;

	if(this.range)
	{
		start_time = this.range[0];
		end_time = this.range[1];
		duration = end_time - start_time;
	}

	if(time > end_time)
	{
		switch( this.mode )
		{
			case PlaySkeletalAnimation.ONCE: 
				time = end_time; 
				//time = start_time; //reset after
				LEvent.trigger( this, "end_animation" );
				this.playing = false;
				break;
			case PlaySkeletalAnimation.PINGPONG:
				if( ((time / duration)|0) % 2 == 0 ) //TEST THIS
					time = this.current_time % duration; 
				else
					time = duration - (this.current_time % duration);
				break;
			case PlaySkeletalAnimation.PINGPONG:
				time = end_time; 
				break;
			case PlaySkeletalAnimation.LOOP: 
			default: 
				time = ((this.current_time - start_time) % duration) + start_time;
				LEvent.trigger( this, "animation_loop" );
				break;
		}
	}
	else if(time < start_time)
		time = start_time;

	this.applyAnimation( time );

	var scene = this._root.scene;
	if(scene)
		scene.requestFrame();
}

/**
* returns the current animation or an animation with a given name
* @method getAnimation
* @param {String} name [optional] the name of the animation, if omited then uses the animation set in the component
* @return {ONE.Animation} the animation container
*/
PlaySkeletalAnimation.prototype.getAnimation = function( name )
{
	name = name === undefined ? this.animation : name;
	var anim = ONE.ResourcesManager.getResource( name );
	if( anim && anim.constructor === ONE.SkeletalAnimation )
		return anim;
	return null;
}

/**
* Gets the duration of the current animation
* @method getDuration
* @return {Number} the duration of the animation, or -1 if the animation was not found
*/
PlaySkeletalAnimation.prototype.getDuration = function()
{
	var anim = this.getAnimation();
	if(anim) 
		return anim.duration;
	return -1;
}

/**
* Resets the time to zero and starts playing the current animation
* It also triggers a "start_animation" event
* @method play
*/
PlaySkeletalAnimation.prototype.play = function()
{
	if(!this._root || !this._root.scene)
		console.error("cannot play an animation if the component doesnt belong to a node in a scene");

	this.playing = true;

	this.current_time = 0;
	if(this.range)
		this.current_time = this.range[0];
	LEvent.trigger( this, "start_animation" );
}

/**
* Pauses the animation
* @method pause
*/
PlaySkeletalAnimation.prototype.pause = function()
{
	this.playing = false;
}

/**
* Stops the animation and sets the time to zero
* @method stop
*/
PlaySkeletalAnimation.prototype.stop = function()
{
	this.playing = false;

	this.current_time = 0;
	if(this.range)
		this.current_time = this.range[0];
}

/**
* Starts playing the animation but only using a range of it
* @method playRange
* @param {Number} start start time
* @param {Number} end end time
*/
PlaySkeletalAnimation.prototype.playRange = function( start, end )
{
	this.playing = true;
	this.current_time = start;
	this.range = [ start, end ];
}

/**
* applys the animation to the scene nodes
* @method applyAnimation
* @param {Number} time the time where to sample the tracks
*/
PlaySkeletalAnimation.prototype.applyAnimation = function( time )
{
	if(!this._root)
		return;

	var animation = this.getAnimation();
	if(!animation)
		return;

	animation.assignTime(time, true, this.interpolate );
	this._skeleton.copyFrom( animation.skeleton );

	var deformer = this._root.getComponent( ONE.Components.SkinDeformer );
	if(deformer)
		deformer._skeleton = this._skeleton;
}

PlaySkeletalAnimation.prototype.getResources = function(res)
{
	if(this.animation)
		res[ this.animation ] = ONE.SkeletalAnimation;
}

PlaySkeletalAnimation.prototype.onResourceRenamed = function (old_name, new_name, resource)
{
	if(this.animation == old_name)
		this.animation = new_name;
}

//returns which events can trigger this component
PlaySkeletalAnimation.prototype.getEvents = function()
{
	return { "start_animation": "event", "end_animation": "event" };
}

//returns which actions can be triggered in this component
PlaySkeletalAnimation.prototype.getActions = function( actions )
{
	actions = actions || {};
	actions["play"] = "function";
	actions["pause"] = "function";
	actions["stop"] = "function";
	return actions;
}

PlaySkeletalAnimation.prototype.getPropertiesInfo = function()
{
	var properties = {
		enabled: "boolean",
		current_time: "number",
		mode: "number",
		playing: "boolean",
		playback_speed: "number",
		skeleton: "skeleton"
	};
	return properties;
}

ONE.registerComponent( PlaySkeletalAnimation );