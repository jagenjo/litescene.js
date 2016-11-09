//***** BVH Parser *****************
var parserBVH = {
	extension: "bvh",
	type: "scene",
	resource: "SceneTree",
	format: 'text',
	dataType:'text',
	
	parse: function( text, options, filename )
	{
		var MODE_HIERARCHY = 1;
		var MODE_MOTION = 2;
		var MODE_MOTION_DATA = 3;

		var mode = 0;
		var root = null;
		var parent = null;
		var node = null;
		var stack = [];
		var inside_of = null;
		var channels = [];

		var num_frames = -1;
		var frame_time = -1;
		var duration = -1;
		var current_frame = 0;

		var translator = {
			"Xposition":"x","Yposition":"y","Zposition":"z","Xrotation":"xrotation","Yrotation":"yrotation","Zrotation":"zrotation"
		};

		var ignore = false;

		var lines = text.split("\n");
		var length = lines.length;
		for (var lineIndex = 0;  lineIndex < length; ++lineIndex)
		{
			var line = lines[lineIndex].trim();

			if (line[0] == "#")
				continue;
			if(line == "")
				continue;

			var tokens = line.split(" ");
			var cmd = tokens[0];

			if(!mode)
			{
				switch(cmd)
				{
					case "HIERARCHY":
						mode = MODE_HIERARCHY;
						break;
				}
			}
			else if(mode == MODE_HIERARCHY)
			{
				switch(cmd)
				{
					case "ROOT":
						root = node = { name: tokens[1] };
						break;
					case "JOINT":
						parent = node;
						stack.push(parent);
						node = { name: tokens[1], node_type: "JOINT" };
						if(!parent.children)
							parent.children = [];
						parent.children.push(node);
						break;
					case "End":
						ignore = true;
						break;
					case "{":
						break;
					case "}":
						if(ignore)
							ignore = false; //ignoreEND
						else
						{
							node = stack.pop();
							if(!node)
								node = root;
							inside_of = node;
						}
						break;
					case "CHANNELS":
						for(var j = 2; j < tokens.length; ++j)
						{
							var property = tokens[j];
							if(translator[property])
								property = translator[property];
							channels.push( { name: tokens[j], property: node.name + "/" + property, type: "number", value_size: 1, data: [], packed_data: true } );
						}
						break;
					case "OFFSET":
						node.transform = { position: readFloats(tokens,1) };
						break;
					case "MOTION":
						mode = MODE_MOTION;
						break;
				}
			}//mode hierarchy
			else if(mode == MODE_MOTION)
			{
				if(tokens[0] == "Frames:")
					num_frames = parseInt( tokens[1] );
				else if(tokens[0] == "Frame" && tokens[1] == "Time:")
					frame_time = parseFloat( tokens[2] );

				if(num_frames != -1 && frame_time != -1)
				{
					duration = num_frames * frame_time;
					mode = MODE_MOTION_DATA;
				}
			}
			else if(mode == MODE_MOTION_DATA)
			{
				var current_time = current_frame * frame_time;
				for(var j = 0; j < channels.length; ++j)
				{
					var channel = channels[j];
					channel.data.push( current_time, parseFloat( tokens[j] ) );
				}

				++current_frame;
			}
		}

		function readFloats(tokens, offset)
		{
			var r = tokens.slice(offset || 0);
			return r.map(parseFloat);
		}

		var tracks = channels;
		for(var i = 0; i < tracks.length; ++i)
		{
			var track = tracks[i];
			track.duration = duration;
		}
		var animation = { name: "#animation", object_type: "Animation", takes: { "default": { name: "default", tracks: tracks } } };
		root.animations = animation.name;
		var resources = {};
		resources[ animation["name"] ] = animation;
		var scene = { root: root, object_type: "SceneNode", resources: resources };

		console.log(scene);
		return scene;
	}
};

LS.Formats.addSupportedFormat( "bvh", parserBVH );