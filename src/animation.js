
/**
* An Animation is a resource that contains samples of properties over time, similar to animation curves
* Values could be associated to an specific node.
* Data is contained in tracks
*
* @class Animation
* @namespace LS
* @constructor
*/

function Animation(o)
{
	this.takes = {}; //packs of tracks
	if(o)
		this.configure(o);
}

Animation.prototype.configure = function(data)
{
	if(data.takes)
	{
		for(var i in data.takes)
		{
			var take = data.takes[i];
			for(var j in take.tracks)
				this.addTrackToTake( i, new LS.Animation.Track( take.tracks[j] ) );
		}
	}
}

Animation.fromBinary = function(data)
{
	if(data.constructor == ArrayBuffer)
		data = WBin.load(data, true);

	var o = data["@json"];
	for(var i in o.takes)
	{
		var take = o.takes[i];
		for(var j in take.tracks)
		{
			var track = take.tracks[j];
			track.data = data["@track_" + track.data];
		}
	}

	return new Animation(o);
}

Animation.prototype.toBinary = function()
{
	var o = {};
	var tracks_data = [];

	//we need to remove the bin data to generate the JSON
	for(var i in this.takes)
	{
		var take = this.takes[i];
		for(var j in take.tracks)
		{
			var track = take.tracks[j];
			var bindata = track.data;
			var num = tracks_data.length;
			o["@track_" + num] = bindata;
			track.data = num;
			tracks_data.push(bindata); //to restore after
		}
	}

	//create the binary
	o["@json"] = { takes: this.takes };
	var bin = WBin.create(o, "Animation");

	//restore the bin data state in this instance
	for(var i in this.takes)
	{
		var take = this.takes[i];
		for(var j in take.tracks)
		{
			var track = take.tracks[j];
			track.data = tracks_data[ track.data ];
		}
	}

	return bin;
}

Animation.prototype.addTrackToTake = function(takename, track)
{
	var take = this.takes[takename];
	if(!take)
		take = this.takes[takename] = new Take();
	take.tracks.push(track);
}


LS.Animation = Animation;

/** Represents a set of animations **/
function Take(o)
{
	this.tracks = [];
	this.duration = 0;
}

Take.prototype.getPropertiesSample = function(time, result)
{
	result = result || [];
	for(var i in this.tracks)
	{
		var track = this.tracks[i];
		var value = track.getSample(time);
		result.push([track.nodename, track.property, value ]);
	}
	return result;
}

Take.prototype.actionPerSample = function(time, callback, options)
{
	for(var i in this.tracks)
	{
		var track = this.tracks[i];
		var value = track.getSample(time, true);
		callback(track.nodename, track.property, value, options);
	}
}

Animation.Take = Take;


/** Represents one track with data over time about one property **/
function Track(o)
{
	this.nodename = ""; //nodename
	this.property = ""; //property
	this.duration = 0; //length of the animation
	this.value_size = 0; //how many numbers contains every sample of this property
	this.data = null;

	if(o)
		this.configure(o);
}

Track.prototype.configure = function(data)
{
	this.property = data.property;
	this.duration = data.duration;
	this.nodename = data.nodename;
	this.value_size = data.value_size;
	this.data = data.data;
}

Track.prototype.getSample = function(time, interpolate)
{
	var local_time = time % this.duration;
	var data = this.data;
	var last_time = 0;

	var value = data.subarray(1,offset);
	var last_value = value;

	var value_size = this.value_size;
	var offset = this.value_size + 1;
	var current_time = time;

	for(var p = 0, l = data.length; p < l; p += offset)
	{
		last_time = current_time;
		current_time = data[p];
		last_value = value;
		value = data.subarray(p + 1, p + offset);
		if(current_time < local_time) 
			continue;
		break;
	}

	if(!interpolate || last_value == value)
	{
		if(value_size == 1)
			return last_value[0];
		else
			return last_value;
	}

	var factor = (local_time - last_time) / (current_time - last_time);

	if(last_value != null && value != null)
	{
		if(value_size == 1)
			return last_value[0] * (1.0 - factor) +  value[0] * factor;
		else
		{
			if(!this._last_sample)	
				this._last_sample = new Float32Array( value_size );
			var result = this._last_sample;
			for(var i = 0; i < value_size; i++)
				result[i] = last_value[i] * (1.0 - factor) +  value[i] * factor;
			return result;
		}
	}
	else if(last_value != null)
		return last_value;
	return value;
}

Animation.Track = Track;