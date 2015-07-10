
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
	this.name = "";
	this.takes = {}; //packs of tracks
	if(o)
		this.configure(o);
}

Animation.prototype.createTake = function( name, duration )
{
	var take = new Animation.Take();
	take.name = name;
	take.duration = duration || 0;
	this.addTake( take );
	return take;
}

Animation.prototype.addTake = function(take)
{
	this.takes[ take.name ] = take;
	return take;
}


Animation.prototype.addTrackToTake = function(takename, track)
{
	var take = this.takes[ takename ];
	if(!take)
		take = this.createTake( takename );
	take.addTrack( track );
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


LS.Animation = Animation;

/** Represents a set of animations **/
function Take(o)
{
	this.name = null;
	this.tracks = [];
	this.duration = 0;
}

Take.prototype.addTrack = function( track )
{
	this.tracks.push( track );
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
		if( options.disabled_tracks && options.disabled_tracks[ track.nodename ] )
			continue;

		callback(track.nodename, track.property, value, options);
	}
}

Animation.Take = Take;


/**
* Represents one track with data over time about one property
* Data could be stored in two forms, or an array containing arrays of [time,data] or in a single typed array, depends on the attribute typed_mode
*
* @class Animation.Track
* @namespace LS
* @constructor
*/

function Track(o)
{
	this.nodename = ""; //nodename
	this.property = ""; //property
	this.duration = 0; //length of the animation
	this.typed_mode = false; //this means the data is stored in one continuous datatype, faster but harder to edit
	this.value_size = 0; //how many numbers contains every sample of this property
	this.data = null; //array or typed array where you have the time value followed by this.value_size bytes of data

	if(o)
		this.configure(o);
}

Track.prototype.configure = function( data )
{
	this.property = data.property;
	this.duration = data.duration;
	this.nodename = data.nodename;
	this.value_size = data.value_size;

	if( data.data.constructor == Array )
		this.typed_mode = false;
	else
		this.typed_mode = true;
	this.data = data.data;

}

//check for the last sample time
Track.prototype.computeDuration = function()
{
	if(!this.data)
		return;

	if(this.typed_mode)
	{
		var time = this.data[ this.data.length - 2 - this.value_size ];
		this.duration = time;
		return time;
	}

	//not typed
	var last = this.data[ this.data.length - 1 ];
	if(last)
		this.duration = last[0];
}

Track.prototype.convertToTyped = function()
{
	//TODO
}

Track.prototype.convertToArray = function()
{
	//TODO
}

/* not tested
Track.prototype.findSampleIndex = function(time)
{
	var data = this.data;
	var offset = this.value_size + 1;
	var l = data.length;
	var n = l / offset;
	var imin = 0;
	var imax = n;
	var imid = 0;

	//dichotimic search
	// continue searching while [imin,imax] is not empty
	while (imax >= imin)
	{
		// calculate the midpoint for roughly equal partition
		imid = (((imax - imin)*0.5)|0) + imin;
		var v = data[ imid * offset ];
		if( v == time )
			return imid * offset; 
			// determine which subarray to search
		else if (v < key)
			// change min index to search upper subarray
			imin = imid + 1;
		else         
			// change max index to search lower subarray
			imax = imid - 1;
	}

	return imid * offset;
}
*/

Track.prototype.getSample = function(time, interpolate)
{
	var local_time = (time % this.duration);
	if(local_time < 0)
		local_time = this.duration + local_time;

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