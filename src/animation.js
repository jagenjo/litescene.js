
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
	//array of Tracks
	this.tracks = [];
	if(o)
		this.configure(o);
}

Animation.prototype.configure = function(data)
{
	if(data.tracks)
		for(var i in data.tracks)
			this.addTrack( data.tracks[i] );
}

Animation.fromBinary = function(data)
{
	if(data.constructor == ArrayBuffer)
		data = WBin.load(data, true);

	var o = data["@json"];
	if(o.tracks)
		for(var i in o.tracks)
		{
			var track = o.tracks[i];
			var bindata = data["@track_" + i];
			track.data = bindata;
		}

	return new Animation(o);
}

Animation.prototype.toBinary = function()
{
	var o = {};
	var track_data = [];
	for(var i in this.tracks)
	{
		var track = this.tracks[i];
		var bindata = track.data;
		o["@track_" + i] = bindata;
		track.data = null;
		track_data.push(bindata); //to restore after
	}

	//fill
	o["@json"] = { tracks: this.tracks };

	//generate the binary
	var bin = WBin.create(o, "Animation");

	//restore the bin data state
	for(var i in track_data)
		this.tracks[i].data = track_data[i];

	return bin;
}

Animation.prototype.addTrack = function(track)
{
	this.tracks.push(track);
}




LS.Animation = Animation;


function Track(o)
{
	this.nodename = ""; //nodename
	this.property = ""; //property
	this.duration = 0;
	this.data = null;
}

Animation.Track = Track;