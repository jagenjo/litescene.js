function AnimationBlender()
{
	this.active_entries = [];
}

AnimationBlender.prototype.addEntry = function( animation, take, time )
{
	if(animation.constructor === LS.AnimationBlender.Entry)
	{
		this.active_entries.push(animation);
		return;
	}

	var entry = new LS.AnimationBlender.Entry();
	entry.animation_name = animation;
	entry.take_name = take;
	entry.time = time;
	this.active_entries.push(entry);
	return entry;
}

AnimationBlender.prototype.removeEntry = function( entry )
{
	var index = this.active_entries.indexOf( entry );
	if(index != -1)
		this.active_entries.splice( index, 1 );
}

AnimationBlender.prototype.execute = function( root_node, scene )
{
	var tracks = {};

	//compute total weight (sum of all weights)
	var total_weight = 0;
	for(var i = 0; i < this.active_entries.length; ++i)
	{
		var entry = this.active_entries[i];
		if(!entry._animation_take)
			continue;
		total_weight += entry.weight;
		var take = entry._animation_take;
		for(var j = 0; j < take.tracks.length; ++j)
		{
			var track = take.tracks[j];
			var samples = tracks[ track.property ];
			if(!samples)
				samples = tracks[ track.property ] = [];
			var sample = track.getSample();
			samples.push( sample );
		}
	}

	//reverse weight system (hard to explain here...)
	for(var i = 0; i < this.active_entries.length; ++i)
	{
		var entry = this.active_entries[i];
		total_weight += entry.weight;
	}

	//
	for(var i = 0; i < this.active_entries.length; ++i)
	{
		var entry = this.active_entries[i];
		entry.execute( remaining / total_weight, false, root_node, scene );
		remaining -= entry.weight;
	}
}

LS.AnimationBlender = AnimationBlender;



function Entry()
{
	this.time = 0;
	this.weight = 1;

	this._animation_take = null; //pointer to the take

	this._animation_name = null;
	this._take_name = null;

	this._last_time = 0;
	this._must_update = false;
}

Object.defineProperty( Entry.prototype, "take_name", {
	set: function(v)
	{
		if( this._take_name == v )
			return;
		this._take_name = v;
		this._must_update = true;
	},
	get: function()
	{
		return this._take_name;
	},
	enumerable: false
});

Object.defineProperty( Entry.prototype, "animation_name", {
	set: function(v)
	{
		if( this._animation_name == v )
			return;
		this._animation_name = v;
		this._must_update = true;
	},
	get: function()
	{
		return this._animation_name;
	},
	enumerable: false
});

Object.defineProperty( Entry.prototype, "duration", {
	set: function(v)
	{
		throw("duration cannot be set. It depends in the animation duration");
	},
	get: function()
	{
		if(!this._animation_take)
			return -1;
		return this._animation_take.duration;
	},
	enumerable: false
});

Object.defineProperty( Entry.prototype, "loaded", {
	set: function(v)
	{
		throw("duration cannot be set. It depends in the animation duration");
	},
	get: function()
	{
		return !!this._animation_take; //to bool
	},
	enumerable: false
});


Entry.prototype.execute = function( final_weight, ignore_interpolation, root_node, scene )
{
	if( !this._animation_name || !this._take_name )
		return false;

	if( this._must_update )
	{
		var animation = LS.ResourcesManager.get( this._animation_name );
		if( !animation )
			return false;

		this._animation_take = animation.takes[ this._take_name ];
	}

	if(!this._animation_take)
		return;

	this._animation_take.applyTracks( this.time, this._last_time, ignore_interpolation, root_node, scene, final_weight );

	this._last_time = this.time;
	return true;
}


AnimationBlender.Entry = Entry;

