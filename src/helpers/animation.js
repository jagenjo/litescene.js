
//Interpolation methods
LS.NONE = 0;
LS.LINEAR = 1;
LS.TRIGONOMETRIC = 2;
LS.BEZIER = 3;
LS.SPLINE = 4;

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

Animation.prototype.getTake = function( name )
{
	return this.takes[ name ];
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
			var take = new LS.Animation.Take( data.takes[i] );
			this.addTake( take );
		}
	}
}

Animation.fromBinary = function( data )
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
			var name = "@take_" + i + "_track_" + j;
			if( data[name] )
				track.data = data[name];
		}
	}

	return new LS.Animation( o );
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
			track.packData(); //reduce storage space and speed ups load

			if(track.packed_data)
			{
				var bindata = track.data;
				var name = "@take_" + i + "_track_" + j;
				o[name] = bindata;
				track.data = null;
				tracks_data.push( bindata );
			}
		}
	}

	//create the binary
	o["@json"] = LS.cloneObject(this, null, true);
	var bin = WBin.create(o, "Animation");

	//restore the bin data state in this instance
	for(var i in this.takes)
	{
		var take = this.takes[i];
		for(var j in take.tracks)
		{
			var track = take.tracks[j];
			var name = "@take_" + i + "_track_" + j;
			if(o[name])
				track.data = o[name];
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
	this.duration = 10;
	
	if(!o)
		return;

	if( o.name ) this.name = o.name;
	if( o.tracks ) 
	{
		for(var i in o.tracks)
		{
			var track = new LS.Animation.Track( o.tracks[i] );
			this.addTrack( track );
		}
	}
	if( o.duration ) this.duration = o.duration;
}

Take.prototype.createTrack = function( data )
{
	if(!data)
		throw("Data missing when creating track");

	var track = this.getTrack( data.property );
	if( track )
		return track;

	var track = new LS.Animation.Track( data );
	this.addTrack( track );
	return track;
}

Take.prototype.applyTracks = function(time)
{
	for(var i = 0; i < this.tracks.length; ++i)
	{
		var track = this.tracks[i];
		if( track.enabled === false )
			continue;
		var sample = track.getSample( time, true );
		if( sample !== undefined )
			LS.GlobalScene.setPropertyValueFromPath( track._property_path, sample );
	}
}



Take.prototype.addTrack = function( track )
{
	this.tracks.push( track );
}

Take.prototype.getTrack = function( property )
{
	for(var i = 0; i < this.tracks.length; ++i)
		if(this.tracks[i].property == property)
			return this.tracks[i];
	return null;
}

Take.prototype.removeTrack = function( track )
{
	for(var i = 0; i < this.tracks.length; ++i)
		if(this.tracks[i] == track)
		{
			this.tracks.splice( i, 1 );
			return;
		}
}


Take.prototype.getPropertiesSample = function(time, result)
{
	result = result || [];
	for(var i = 0; i < this.tracks.length; ++i)
	{
		var track = this.tracks[i];
		var value = track.getSample( time );
		result.push([track.property, value]);
	}
	return result;
}

Take.prototype.actionPerSample = function(time, callback, options)
{
	for(var i in this.tracks)
	{
		var track = this.tracks[i];
		var value = track.getSample(time, true);
		if( options.disabled_tracks && options.disabled_tracks[ track.property ] )
			continue;
		callback(track.property, value, options);
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
	this.enabled = true;
	this.name = ""; //title
	this.type = null; //type of data (number, vec2, color, texture, etc)
	this.interpolation = LS.NONE;
	this.looped = false; //interpolate last keyframe with first

	//data
	this.packed_data = false; //this means the data is stored in one continuous datatype, faster to load but not editable
	this.value_size = 0; //how many numbers contains every sample of this property, 0 means basic type (string, boolean)
	this.data = null; //array or typed array where you have the time value followed by this.value_size bytes of data
	this.data_table = null; //used to index data when storing it

	//to speed up sampling
	Object.defineProperty( this, '_property', {
		value: "",
		enumerable: false,
		writable: true
	});

	Object.defineProperty( this, '_property_path', {
		value: [],
		enumerable: false,
		writable: true
	});

	if(o)
		this.configure(o);
}

Track.FRAMERATE = 30;

//string identifying the property being animated in a locator form ( node/component_uid/property )
Object.defineProperty( Track.prototype, 'property', {
	set: function( property )
	{
		this._property = property;
		this._property_path = property.split("/");
	},
	get: function(){
		return this._property;
	},
	enumerable: true
});

Track.prototype.configure = function( o )
{
	if(!o.property)
		console.warn("Track with property name");

	if(o.enabled !== undefined) this.enabled = o.enabled;
	if(o.name) this.name = o.name;
	if(o.property) this.property = o.property;
	if(o.type) this.type = o.type;
	if(o.looped) this.looped = o.looped;
	if(o.interpolation !== undefined)
		this.interpolation = o.interpolation;
	else
		this.interpolation = LS.LINEAR;

	if(o.data_table) this.data_table = o.data_table;

	//data
	if(o.data)
	{
		this.value_size = o.value_size;
		this.data = o.data;

		if( o.data.constructor == Array )
			this.packed_data = false;
		else
		{
			this.packed_data = true;
			this.unpackData();
		}
	}

	if(o.interpolation && !this.value_size)
		o.interpolation = LS.NONE;
}

Track.prototype.serialize = function()
{
	var o = {
		enabled: this.enabled,
		name: this.name,
		property: this.property, 
		type: this.type,
		interpolation: this.interpolation,
		looped: this.looped,
		value_size: this.value_size,
		packed_data: false,
		data_table: this.data_table
	}

	if(this.value_size <= 1)
		o.data = this.data; //regular array
	else //pack data
	{
		this.packData();
		o.data = this.data;
		o.packed_data = this.packed_data;
	}

	return o;
}

Track.prototype.toJSON = Track.prototype.serialize;

Track.prototype.addKeyframe = function( time, value, skip_replace )
{
	if(this.value_size > 1)
		value = new Float32Array( value ); //clone

	if(this.packed_data)
	{
		//TODO!!!!!
		console.warn("TODO: add keyframe in packed data");
		return -1;
	}

	for(var i = 0; i < this.data.length; ++i)
	{
		if(this.data[i][0] < time )
			continue;
		if(this.data[i][0] == time && !skip_replace )
			this.data[i][1] = value;
		else
			this.data.splice(i,0, [time,value]);
		return i;
	}

	this.data.push( [time,value] );
	return this.data.length - 1;
}

Track.prototype.getKeyframe = function(index)
{
	if(this.packed_data)
	{
		var pos = index * (1 + this.value_size );
		if(pos > (this.data.length - this.value_size) )
			return null;
		return [ this.data[pos], this.data.subarray(pos+1, pos+this.value_size) ];
	}

	return this.data[index];
}

Track.prototype.moveKeyframe = function(index, new_time)
{
	if(this.packed_data)
	{
		//TODO
		console.warn("Cannot move keyframes if packed");
		return -1;
	}

	if(index >= this.data.length)
	{
		console.warn("keyframe index out of bounds");
		return -1;
	}

	var new_index = this.findTimeIndex( new_time );
	var keyframe = this.data[ index ];
	var old_time = keyframe[0];
	if(old_time == new_time)
		return index;
	keyframe[0] = new_time; //set time
	if(old_time > new_time)
		new_index += 1;
	if(index == new_index)
	{
		//console.warn("same index");
		return index;
	}

	//extract
	this.data.splice(index, 1);
	//reinsert
	index = this.addKeyframe( keyframe[0], keyframe[1], true );

	this.sortKeyframes();
	return index;
}

//solve bugs
Track.prototype.sortKeyframes = function()
{
	if(this.packed_data)
	{
		//TODO!!!!!
		console.warn("TODO: sortKeyframes in packed data");
		return -1;
	}
	this.data.sort( function(a,b){ return a[0] - b[0];  });
}

Track.prototype.removeKeyframe = function(index)
{
	if(this.packed_data)
	{
		//TODO
		console.warn("Cannot move keyframes if packed");
		return;
	}

	if(index >= this.data.length)
	{
		console.warn("keyframe index out of bounds");
		return;
	}

	this.data.splice(index, 1);
}


Track.prototype.getNumberOfKeyframes = function()
{
	if(this.packed_data)
		return this.data.length / (1 + this.value_size );
	return this.data.length;
}

//check for the last sample time
Track.prototype.computeDuration = function()
{
	if(!this.data || this.data.length == 0)
		return 0;

	if(this.packed_data)
	{
		var time = this.data[ this.data.length - 2 - this.value_size ];
		this.duration = time;
		return time;
	}

	//not typed
	var last = this.data[ this.data.length - 1 ];
	if(last)
		return last[0];
	return 0;
}

//better for reading
Track.prototype.packData = function()
{
	if(this.packed_data)
		return;

	if(this.value_size == 0)
		return; //cannot be packed (bools and strings cannot be packed)

	var offset = this.value_size + 1;
	var data = this.data;
	var typed_data = new Float32Array( data.length * offset );

	for(var i = 0; i < data.length; ++i)
	{
		typed_data[i*offset] = data[i][0];
		if( this.value_size == 1 )
			typed_data[i*offset+1] = data[i][1];
		else
			typed_data.set( data[i][1], i*offset+1 );
	}

	this.data = typed_data;
	this.packed_data = true;
}

//better for writing
Track.prototype.unpackData = function()
{
	if(!this.packed_data)
		return;

	var offset = this.value_size + 1;
	var typed_data = this.data;
	var data = Array( typed_data.length / offset );

	for(var i = 0; i < typed_data.length; i += offset )
		data[i/offset] = [ typed_data[i], typed_data.subarray( i+1, i+offset ) ];

	this.data = data;
	this.packed_data = false;
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

//TODO: IMPROVE WITH DICOTOMIC SEARCH
//Returns the index of the last sample with a time less or equal to time
Track.prototype.findTimeIndex = function( time )
{
	var data = this.data;
	var l = this.data.length;
	if(!l)
		return -1;
	var i = 0;
	if(this.packed_data)
	{
		var offset = this.value_size + 1;
		for(i = 0; i < l; i += offset)
		{
			var current_time = data[i];
			if(current_time < time) 
				continue;
			return i-1; //prev sample
		}
	}
	else //unpacked data
	{
		for(i = 0; i < l; ++i )
		{
			if(time > data[i][0]) 
				continue;
			if(time == data[i][0]) 
				return i;
			if(i == 0)
				return 0;
			return i-1; //prev sample
		}
	}

	return l-1; //last sample
}


Track.prototype.getSample = function( time, interpolate, result )
{
	time = Math.clamp( time, 0, this.duration );

	var index = this.findTimeIndex( time );
	if(index == -1)
		return null;

	var index_a = index;
	var index_b = index + 1;
	var data = this.data;

	if(!interpolate || !this.interpolation || data.length == 1 || this.value_size == 0 || index_b == data.length || (index_a == 0 && this.data[0][0] > time)) //(index_b == this.data.length && !this.looped)
		return this.data[ index ][1];

	/*
	if(this.looped)
	{
		if(index_a == 0 && time < data[0][0])
			index_a = data.length - 1; //last
		if(index_b == data.length && time < data[0][0])
			index_b = 0; //last
	}
	*/

	var a = data[ index_a ];
	var b = data[ index_b ];

	var t = (b[0] - time) / (b[0] - a[0]);

	if(this.interpolation === LS.LINEAR)
	{
		if(this.value_size == 1)
			return a[1] * t + b[1] * (1-t);

		result = result || this._result;

		if(!result || result.length != this.value_size)
			result = this._result = new Float32Array( this.value_size );

		for(var i = 0; i < this.value_size; i++)
			result[i] = a[1][i] * t + b[1][i] * (1-t);

		if(this.type == "quat")
			quat.normalize(result, result);

		return result;
	}
	else if(this.interpolation === LS.BEZIER)
	{
		var pre_a = index > 0 ? data[ index - 1 ] : a;
		var post_b = index < data.length - 2 ? data[ index + 2 ] : b;

		if(this.value_size === 1)
			return Animation.EvaluateHermiteSpline(a[1],b[1],pre_a[1],post_b[1], 1 - t );

		result = result || this._result;

		//multiple data
		if(!result || result.length != this.value_size)
			result = this._result = new Float32Array( this.value_size );

		result = result || this._result;
		result = Animation.EvaluateHermiteSplineVector(a[1],b[1], pre_a[1], post_b[1], 1 - t, result );

		if(this.type == "quat")
			quat.normalize(result, result);

		return result;
	}

	return null;
}

Track.prototype.getPropertyInfo = function()
{
	return LS.GlobalScene.getPropertyInfo( this.property );
}

Track.prototype.getSampledData = function( start_time, end_time, num_samples )
{
	var delta = (end_time - start_time) / num_samples;
	if(delta <= 0)
		return null;

	var samples = [];
	for(var i = 0; i < num_samples; ++i)
	{
		var t = i * delta + start_time;
		var sample = this.getSample( t, true );
		if(this.value_size > 1)
			sample = new sample.constructor( sample );
		samples.push(sample);
	}

	return samples;
}

Animation.Track = Track;

/*
vec3f EvaluateHermiteSpline(const vec3f& p0, const vec3f& p1, const vec3f& t0, const vec3f& t1, float s)
{
	float s2 = s * s;
	float s3 = s2 * s;
	float h1 =  2*s3 - 3*s2 + 1;          // calculate basis function 1
	float h2 = -2*s3 + 3*s2;              // calculate basis function 2
	float h3 =   s3 - 2*s2 + s;         // calculate basis function 3
	float h4 =   s3 -  s2;              // calculate basis function 4
	vec3f p = h1*p0+                    // multiply and sum all funtions
						 h2*p1 +                    // together to build the interpolated
						 h3*t0 +                    // point along the curve.
						 h4*t1;
	return p;
}
*/


Animation.EvaluateHermiteSpline = function( p0, p1, pre_p0, post_p1, s )
{
	var s2 = s * s;
	var s3 = s2 * s;
	var h1 =  2*s3 - 3*s2 + 1;          // calculate basis function 1
	var h2 = -2*s3 + 3*s2;              // calculate basis function 2
	var h3 =   s3 - 2*s2 + s;         // calculate basis function 3
	var h4 =   s3 -  s2;              // calculate basis function 4
	
	var t0 = p1 - pre_p0;
	var t1 = post_p1 - p0;

	return h1 * p0 + h2 * p1 + h3 * t0 + h4 * t1;
}

Animation.EvaluateHermiteSplineVector = function( p0, p1, pre_p0, post_p1, s, result )
{
	result = result || new Float32Array( result.length );

	var s2 = s * s;
	var s3 = s2 * s;
	var h1 =  2*s3 - 3*s2 + 1;          // calculate basis function 1
	var h2 = -2*s3 + 3*s2;              // calculate basis function 2
	var h3 =   s3 - 2*s2 + s;         // calculate basis function 3
	var h4 =   s3 -  s2;              // calculate basis function 4

	for(var i = 0; i < result.length; ++i)
	{
		var t0 = p1[i] - pre_p0[i];
		var t1 = post_p1[i] - p0[i];
		result[i] = h1 * p0[i] + h2 * p1[i] + h3 * t0 + h4 * t1;
	}

	return result;
}