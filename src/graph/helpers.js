///@INFO: GRAPHS
if(typeof(LiteGraph) != "undefined")
{
	//special kind of node
	function LGraphGUIText()
	{
		this.addInput("text");
		this.properties = { text: "", font: "", color: [1,1,1,1], position: [20,20], corner: LGraphGUIText.CORNER_TOP_LEFT };
	}

	LGraphGUIText.title = "GUIText";
	LGraphGUIText.desc = "renders text on webgl canvas";
	LGraphGUIText.priority = 2; //render at the end

	LGraphGUIText.CORNER_TOP_LEFT = 0;
	LGraphGUIText.CORNER_TOP_RIGHT = 1;
	LGraphGUIText.CORNER_BOTTOM_LEFT = 2;
	LGraphGUIText.CORNER_BOTTOM_RIGHT = 3;
	LGraphGUIText.CORNER_TOP_CENTER = 4;
	LGraphGUIText.CORNER_BOTTOM_CENTER = 5;

	LGraphGUIText["@corner"] = { type:"enum", values:{ 
		"top-left": LGraphGUIText.CORNER_TOP_LEFT, 
		"top-right": LGraphGUIText.CORNER_TOP_RIGHT,
		"bottom-left": LGraphGUIText.CORNER_BOTTOM_LEFT,
		"bottom-right": LGraphGUIText.CORNER_BOTTOM_RIGHT,
		"top-center": LGraphGUIText.CORNER_TOP_CENTER,
		"bottom-center": LGraphGUIText.CORNER_BOTTOM_CENTER
	}};
	LGraphGUIText["@color"] = { type:"color" };

	LGraphGUIText.prototype.onGetInputs = function(){
		return [["enabled","boolean"]];
	}

	LGraphGUIText.prototype.onExecute = function()
	{ 
		var ctx = window.gl;
		if(!ctx)
			return;

		if( !window.LS || !LS.Renderer._current_render_settings || !LS.Renderer._current_render_settings.render_gui )
			return;

		var enabled = this.getInputData(1);
		if(enabled === false)
			return;

		var input_text = this.getInputData(0);
		if( input_text == null )
			input_text = "";

		if(input_text.constructor === Number )
			input_text = input_text.toFixed(3);

		var text = (this.properties.text || "") + input_text;
		if(text === "")
			return;

		ctx.font = this.properties.font || "20px Arial";
		ctx.fillColor = this.properties.color || [1,1,1,1];
		var x = this.properties.position[0];
		var y = this.properties.position[1];

		switch( this.properties.corner )
		{
			case LGraphGUIText.CORNER_TOP_RIGHT: x = gl.canvas.width - x; break;
			case LGraphGUIText.CORNER_BOTTOM_LEFT: y = gl.canvas.height - y; break;
			case LGraphGUIText.CORNER_BOTTOM_RIGHT: x = gl.canvas.width - x; y = gl.canvas.height - y; break;
			case LGraphGUIText.CORNER_TOP_CENTER: x = gl.canvas.width * 0.5; break;
			case LGraphGUIText.CORNER_BOTTOM_CENTER: x = gl.canvas.width * 0.5; y = gl.canvas.height - y; break;
			case LGraphGUIText.CORNER_TOP_LEFT:
			default:
		}

		gl.disable( gl.DEPTH_TEST );
		gl.enable( gl.BLEND );
		gl.blendFunc( gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA );
		ctx.fillText( text, x, y );
	}

	LiteGraph.registerNodeType("gui/text", LGraphGUIText );


	//based in the NNI distance 
	function LGraphMap2D()
	{
		this.addInput("x","number");
		this.addInput("y","number");
		this.addOutput("weights","array");
		this.addProperty("circular",false);
		this.points = [];
		this.weights = [];
		this.current_pos = new Float32Array([0.5,0.5]);
		this.size = [200,200];
		this.dragging = false;
		this.show_names = true;
		this.circle_center = [0,0];
		this.circle_radius = 1;
		this.margin = 20;
		this._values_changed = true;
		this._visualize_weights = false;
		this._version = 0;
		this._selected_point = null;
	}

	LiteGraph.LGraphMap2D = LGraphMap2D;
	LGraphMap2D.title = "Map2D";
	LGraphMap2D.colors = [[255,0,0],[0,255,0],[0,0,255],[0,128,128,0],[128,0,128],[128,128,0],[255,128,0],[255,0,128],[0,128,255],[128,0,255]];
	LGraphMap2D.grid_size = 64;

	LGraphMap2D.prototype.onExecute = function()
	{
		var pos = this.current_pos;
		pos[0] = this.getInputData(0) || pos[0];
		pos[1] = this.getInputData(1) || pos[1];
		this.computeWeights(pos);
		this.setOutputData(0, this.weights );
	}

	LGraphMap2D.prototype.computeWeights = function(pos)
	{
		if(!this.points.length)
			return;
		var values = this._precomputed_weights;
		if(!values || this._values_changed )
			values = this.precomputeWeights();
		var pos2 = vec2.create();
		var circular = this.properties.circular;
		var weights = this.weights;
		weights.length = this.points.length;
		var gridsize = LGraphMap2D.grid_size;
		for(var i = 0; i < weights.length; ++i)
			weights[i] = 0;
		var total_inside = 0;
		for(var y = 0; y < gridsize; ++y)
			for(var x = 0; x < gridsize; ++x)
			{
				pos2[0] = x / gridsize;
				pos2[1] = y / gridsize;
				if(circular)
				{
					pos2[0] = pos2[0] * 2 - 1;
					pos2[1] = pos2[1] * 2 - 1;
				}
				var data_pos = x*2 + y * gridsize*2;
				var point_index = values[ data_pos ];
				var is_inside = vec2.distance( pos2, pos ) < (values[ data_pos + 1] + 0.001); //epsilon
				if(is_inside)
				{
					weights[ point_index ] += 1;
					total_inside++;
				}
			}
		for(var i = 0; i < weights.length; ++i)
			weights[i] /= total_inside;
		return weights;
	}

	LGraphMap2D.prototype.onMouseDown = function(e,pos)
	{
		if(this.flags.collapsed || pos[1] < 0 || pos[0] < this.margin || pos[0] > (this.size[0] - this.margin) || pos[1] < this.margin )
			return false;
		if( pos[1] > (this.size[1] - this.margin))
		{
			this._visualize_weights = !this._visualize_weights;
			return true;
		}

		this.dragging = true;
		return true;
	}

	LGraphMap2D.prototype.onMouseUp = function(e,pos)
	{
		this.dragging = false;
	}

	LGraphMap2D.prototype.onMouseMove = function(e,pos)
	{
		if( !this.dragging || this.flags.collapsed )
			return;
		var margin = this.margin;
		var center = [0,0];
		var radius = this.size[1] * 0.5 - margin;
		var cpos = this.current_pos;
		cpos[0] = Math.clamp( (pos[0] - margin) / (this.size[0] - margin*2), 0,1 );
		cpos[1] = Math.clamp( (pos[1] - margin) / (this.size[1] - margin*2), 0,1 );
		if( this.properties.circular )
		{
			cpos[0] = cpos[0] * 2 - 1;
			cpos[1] = cpos[1] * 2 - 1;
			var dist = vec2.distance( cpos, center );
			if(dist > 1)
				vec2.normalize(cpos,cpos);
		}
		return true;
	}

	LGraphMap2D.prototype.onDrawBackground = function( ctx )
	{
		if(this.flags.collapsed)
			return;
		var pos = this.current_pos;
		var margin = this.margin;
		var circular = this.properties.circular;
		var show_names = this.show_names;

		ctx.fillStyle = "black";
		ctx.strokeStyle = "#BBB";
		if(circular)
		{
			this.circle_center[0] = this.size[0] * 0.5;
			this.circle_center[1] = this.size[1] * 0.5;
			this.circle_radius = this.size[1] * 0.5 - margin;
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.arc( this.circle_center[0], this.circle_center[1], this.circle_radius, 0, Math.PI * 2 );
			ctx.fill();
			ctx.stroke();
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.moveTo( this.circle_center[0] + 0.5, this.circle_center[1] - this.circle_radius );
			ctx.lineTo( this.circle_center[0] + 0.5, this.circle_center[1] + this.circle_radius );
			ctx.moveTo( this.circle_center[0] - this.circle_radius, this.circle_center[1]);
			ctx.lineTo( this.circle_center[0] + this.circle_radius, this.circle_center[1]);
			ctx.stroke();
		}
		else
		{
			ctx.fillRect(margin,margin,this.size[0]-margin*2, this.size[1]-margin*2);
			ctx.strokeRect(margin,margin,this.size[0]-margin*2, this.size[1]-margin*2);
		}

		var image = this.precomputeWeightsToImage( pos );
		if(image)
		{
			ctx.globalAlpha = 0.5;
			ctx.imageSmoothingEnabled = false;
			if(circular)
			{
				ctx.save();
				ctx.beginPath();
				ctx.arc( this.circle_center[0], this.circle_center[1], this.circle_radius, 0, Math.PI * 2 );
				ctx.clip();
				ctx.drawImage( image, this.circle_center[0] - this.circle_radius, this.circle_center[1] - this.circle_radius, this.circle_radius*2, this.circle_radius*2 );
				ctx.restore();
			}
			else
				ctx.drawImage( image, margin, margin,this.size[0]-margin*2, this.size[1]-margin*2 );
			ctx.imageSmoothingEnabled = true;
			ctx.globalAlpha = 1;
		}

		for(var i = 0; i < this.points.length; ++i)
		{
			var point = this.points[i];
			var x = point.pos[0];
			var y = point.pos[1];
			if(circular)
			{
				x = x*0.5 + 0.5;
				y = y*0.5 + 0.5;
			}
			x = x * (this.size[0]-margin*2) + margin;
			y = y * (this.size[1]-margin*2) + margin;
			x = Math.clamp( x, margin, this.size[0]-margin);
			y = Math.clamp( y, margin, this.size[1]-margin);
			ctx.fillStyle = point == this._selected_point ? "#9DF" : "#789";
			ctx.beginPath();
			ctx.arc(x,y,3,0,Math.PI*2);
			ctx.fill();
			if( show_names )
				ctx.fillText( point.name, x + 5, y + 5);
		}

		ctx.fillStyle = "white";
		ctx.beginPath();
		var x = pos[0];
		var y = pos[1];
		if(circular)
		{
			x = x*0.5 + 0.5;
			y = y*0.5 + 0.5;
		}
		x = x * (this.size[0]-margin*2) + margin;
		y = y * (this.size[1]-margin*2) + margin;
		x = Math.clamp( x, margin, this.size[0]-margin);
		y = Math.clamp( y, margin, this.size[1]-margin);
		ctx.arc(x,y,5,0,Math.PI*2);
		ctx.fill();

		//weights
		ctx.save();
		ctx.fillStyle = "black";
		ctx.fillRect( margin, this.size[1] - margin + 2, this.size[0] - margin * 2, margin - 4);
		ctx.strokeStyle = "white";
		ctx.strokeRect( margin, this.size[1] - margin + 2, this.size[0] - margin * 2, margin - 4);
		ctx.textAlign = "center";
		ctx.fillStyle = "white";
		ctx.fillText( "Visualize Weights", this.size[0] * 0.5, this.size[1] - margin * 0.3 );
		ctx.textAlign = "left";

		if(this.weights.length && this._visualize_weights)
		{
			var x = this.size[0] + 5;
			var y = 16; //this.size[1] - this.weights.length * 5 - 10;
			for(var i = 0; i < this.weights.length; ++i)
			{
				var c = LGraphMap2D.colors[i % LGraphMap2D.colors.length];
				ctx.fillStyle = "black";
				ctx.fillRect(x, y + i*5, 100,4 );
				ctx.fillStyle = "rgb(" + ((c[0]*255)|0) + "," + ((c[1]*255)|0) + "," + ((c[2]*255)|0) + ")";
				ctx.fillRect(x, y + i*5, this.weights[i]*100,4 );
			}
		}
		ctx.restore();
	}

	LGraphMap2D.prototype.addPoint = function( name, pos )
	{
		if( this.findPoint(name) )
		{
			console.warn("there is already a point with that name" );
			return;
		}
		if(!pos)
			pos = [this.current_pos[0], this.current_pos[1]];
		pos[0] = Math.clamp( pos[0], -1,1 );
		pos[1] = Math.clamp( pos[1], -1,1 );
		this.points.push({ name: name, pos: pos });
		this._values_changed = true;
		this.setDirtyCanvas(true);
	}

	LGraphMap2D.prototype.removePoint = function(name)
	{
		for(var i = 0; i < this.points.length; ++i)
			if( this.points[i].name == name )
			{
				this.points.splice(i,1);
				this._values_changed = true;
				return;
			}
	}

	LGraphMap2D.prototype.findPoint = function( name )
	{
		for(var i = 0; i < this.points.length; ++i)
			if( this.points[i].name == name )
				return this.points[i];
		return null;
	}

	LGraphMap2D.prototype.precomputeWeights = function()
	{
		var points = this.points;
		var num_points = points.length;
		var pos = vec2.create();
		var circular = this.properties.circular;
		this._values_changed = false;
		this._version++;
		var gridsize = LGraphMap2D.grid_size;
		var total_nums = 2 * gridsize * gridsize;
		if(!this._precomputed_weights || this._precomputed_weights.length != total_nums )
			this._precomputed_weights = new Float32Array( total_nums );
		var values = this._precomputed_weights;
		this._precomputed_weights_gridsize = gridsize;

		for(var y = 0; y < gridsize; ++y)
			for(var x = 0; x < gridsize; ++x)
			{
				var nearest = -1;
				var min_dist = 100000;
				for(var i = 0; i < num_points; ++i)
				{
					pos[0] = x / gridsize;
					pos[1] = y / gridsize;
					if(circular)
					{
						pos[0] = pos[0] * 2 - 1;
						pos[1] = pos[1] * 2 - 1;
					}

					var dist = vec2.distance( pos, points[i].pos );
					if( dist > min_dist )
						continue;
					nearest = i;
					min_dist = dist;
				}

				values[ x*2 + y*2*gridsize ] = nearest;
				values[ x*2 + y*2*gridsize + 1] = min_dist;
			}

		return values;
	}

	LGraphMap2D.prototype.precomputeWeightsToImage = function(pos)
	{
		if(!this.points.length)
			return null;
		var values = this._precomputed_weights;
		if(!values || this._values_changed || this._precomputed_weights_gridsize != LGraphMap2D.grid_size)
			values = this.precomputeWeights();
		var canvas = this._canvas;
		var gridsize = LGraphMap2D.grid_size;
		if(!canvas)
			canvas = this._canvas = document.createElement("canvas");
		canvas.width = canvas.height = gridsize;
		var ctx = canvas.getContext("2d");
		var white = [255,255,255];
		var pos2 = vec2.create();
		var circular = this.properties.circular;
		var weights = this.weights;
		weights.length = this.points.length;
		for(var i = 0; i < weights.length; ++i)
			weights[i] = 0;
		var total_inside = 0;
		var pixels = ctx.getImageData(0,0,gridsize,gridsize);
		for(var y = 0; y < gridsize; ++y)
			for(var x = 0; x < gridsize; ++x)
			{
				pos2[0] = x / gridsize;
				pos2[1] = y / gridsize;
				if(circular)
				{
					pos2[0] = pos2[0] * 2 - 1;
					pos2[1] = pos2[1] * 2 - 1;
				}

				var pixel_pos = x*4 + y*gridsize*4;
				var data_pos = x*2 + y * gridsize*2;
				var point_index = values[ data_pos ];
				var c = LGraphMap2D.colors[ point_index % LGraphMap2D.colors.length ];
				var is_inside = vec2.distance( pos2, pos ) < (values[ data_pos + 1] + 0.001);
				if(is_inside)
				{
					weights[ point_index ] += 1;
					total_inside++;
				}
				pixels.data[pixel_pos] = c[0] + (is_inside ? 128 : 0);
				pixels.data[pixel_pos+1] = c[1] + (is_inside ? 128 : 0);
				pixels.data[pixel_pos+2] = c[2] + (is_inside ? 128 : 0);
				pixels.data[pixel_pos+3] = 255;
			}
		for(var i = 0; i < weights.length; ++i)
			weights[i] /= total_inside;
		ctx.putImageData(pixels,0,0);
		return canvas;
	}

	LGraphMap2D.prototype.clear = function()
	{
		this.points.length = 0;
		this._precomputed_weights = null;
		this._canvas = null;
		this._selected_point = null;
		this.setDirtyCanvas(true);
	}

	LGraphMap2D.prototype.getExtraMenuOptions = function()
	{
		return[{content:"Clear Points", callback: this.clear.bind(this) }];
	}

	LGraphMap2D.prototype.onInspect = function( inspector )
	{
		var node = this;
		if(!this._selected_point && this.points.length)
			this._selected_point = this.points[0];
		inspector.addTitle("Points");

		inspector.widgets_per_row = 4;

		for(var i = 0; i < this.points.length; ++i)
		{
			var point = this.points[i];
			inspector.addString( null, point.name, { point: point, width: "40%", callback: function(v){
				this.options.point.name = v;
				node.setDirtyCanvas(true);
			}});
			var posX_widget = inspector.addNumber(null, point.pos[0], { point: point, width: "20%", min:-1, max:1, step: 0.01, callback: function(v){
				this.options.point.pos[0] = Math.clamp( v, -1, 1 );
				node._values_changed = true;
			}});
			var posY_widget = inspector.addNumber(null,point.pos[1], { point: point, width: "20%", min:-1, max:1, step: 0.01, callback: function(v){
				this.options.point.pos[1] = Math.clamp( v, -1, 1 );
				node._values_changed = true;
			}});
			inspector.addButton(null,"o", { point: point, width: "10%", callback: function(){
				this.options.point.pos[0] = node.current_pos[0];
				this.options.point.pos[1] = node.current_pos[1];
				node._values_changed = true;
			}});
			inspector.addButton(null,"X", { point: point, width: "10%", callback: function(){
				LiteGUI.confirm("Are you sure? Removing one point could mess up the whole weights order", (function(v){
					if(!v)
						return;
					node.removePoint( this.point.name );	
					inspector.refresh();
				}).bind(this.options));
			}});
		}
		inspector.widgets_per_row = 1;

		var new_point_name = "";
		inspector.addSeparator();
		inspector.addTitle("New Point");
		inspector.widgets_per_row = 2;
		inspector.addString("Name","",{ width:"75%", callback: function(v){
			new_point_name = v;
		}});
		inspector.addButton(null,"Create",{ width:"25%",callback: function(v){
			if(new_point_name)
				node.addPoint( new_point_name );
			inspector.refresh();
		}});
		inspector.widgets_per_row = 1;

		inspector.addSeparator();
	}

	LGraphMap2D.prototype.onSerialize = function(o)
	{
		o.current_pos = this.current_pos;
		for(var i = 0; i < this.points.length; ++i)
			delete this.points[i]._dist;
		o.points = this.points;
	}

	LGraphMap2D.prototype.onConfigure = function(o)
	{
		if(o.current_pos)
			this.current_pos = o.current_pos;
		if(o.points)
			this.points = o.points;
	}


	LiteGraph.registerNodeType("math/map2D", LGraphMap2D );


	function LGraphRemapWeights()
	{
		this.addInput("in","array");
		this.addOutput("out","array");
		this.points = [];
		this.weights = [];

		var node = this;
		this.combo = this.addWidget("combo","Point", "", function(v){
			node._selected_point = node.findPoint(v);
		}, { values:[] } );
		this.import_button = this.addWidget("button", "import weights", "", function(){
			node.importWeights(true);
		});
		this.size = [170,80];
		this._selected_point = null;
	}

	LGraphRemapWeights.title = "Remap Weights";

	LGraphRemapWeights.prototype.onExecute = function()
	{
		var point_weights = this.getInputData(0);

		var lw = this.weights.length;
		for(var i = 0; i < lw; ++i)
			this.weights[i] = 0;

		if( point_weights )
		for(var i = 0; i < point_weights.length; ++i)
		{
			var point = this.points[i];
			var w = point_weights[i];
			for(var j = 0, l = point.weights.length; j < lw && j < l; ++j)
				this.weights[j] += point.weights[j] * w;
		}

		//output weights
		this.setOutputData(0, this.weights );
	}

	LGraphRemapWeights.prototype.addPoint = function(name, weights)
	{
		if(!weights)
			weights = new Array( this.weights.length );
		this.points.push({name: name, weights:weights});	
	}

	LGraphRemapWeights.prototype.importPoints = function(name, weights)
	{
		var input_node = this.getInputNode(0);
		if(!input_node || !input_node.points || !input_node.points.length )
			return;
		this.points.length = input_node.points.length;
		for(var i = 0; i < this.points.length; ++i)
			this.points[i] = { name: input_node.points[i].name, weights: new Array( this.weights.length ) };
		this._selected_point = this.points[0];
		if( this._selected_point )
		{
			this.combo.value = this._selected_point.name;
			this.combo.options.values = this.points.map(function(a){return a.name;});
		}
		else
		{
			this.combo.value = "";
			this.combo.options.values = [""];
		}
	}

	LGraphRemapWeights.prototype.importWeights = function( assign )
	{
		var output_nodes = this.getOutputNodes(0);
		if(!output_nodes || output_nodes.length == 0)
			return;
		if( output_nodes.length > 1)
			console.warn("More than one node connected, taking the first one");
		var output_node = output_nodes[0];
		if( !output_node.getComponent )
			return;

		var component = output_node.getComponent();
		if(!component)
			return;

		var compo_weights = component.weights;
		this.weights.length = compo_weights.length;
		for(var i = 0; i < this.weights.length; ++i)
			this.weights[i] = compo_weights[i];
		this.updatePointsWeight();
		this.setDirtyCanvas(true);

		if( !assign || !this._selected_point)
			return;
		this._selected_point.weights = this.weights.concat();
	}

	LGraphRemapWeights.prototype.updatePointsWeight = function()
	{
		for(var i = 0; i < this.points.length; ++i)
		{
			var point = this.points[i];
			point.weights.length = this.weights.length;
		}
	}

	LGraphRemapWeights.prototype.findPoint = function( name )
	{
		for(var i = 0; i < this.points.length; ++i)
			if( this.points[i].name == name )
				return this.points[i];
		return null;
	}

	LGraphRemapWeights.prototype.onSerialize = function(o)
	{
		o.weights = this.weights;
		o.points = this.points;
	}

	LGraphRemapWeights.prototype.onConfigure = function(o)
	{
		if(o.weights)
			this.weights = o.weights;
		if(o.points)
		{
			this.points = o.points;
			this.combo.options.values = this.points.map(function(a){ return a.name; });
			this.combo.value = this.combo.options.values[0] || "";
		}
	}

	LGraphRemapWeights.prototype.onInspect = function( inspector )
	{
		var node = this;

		inspector.addButton(null,"Import points", { callback: function(){
			node.importPoints();
			inspector.refresh();
		}});
		inspector.addButton(null,"Import weights", { callback: function(){
			node.importWeights();
			inspector.refresh();
		}});

		inspector.addSeparator();

		inspector.addTitle("Points");

		var point_names = [];
		for(var i = 0; i < this.points.length; ++i)
		{
			var point = this.points[i];
			point_names.push( point.name );
		}

		if(!this._selected_point && this.points.length)
			this._selected_point = this.points[0];

		inspector.addCombo("Points",this._selected_point ? this._selected_point.name : "", { values: point_names, callback: function(v){
			node._selected_point = node.findPoint(v);
			node.combo.value = v;
			node.setDirtyCanvas(true);
			inspector.refresh();
		}});

		inspector.addSeparator();
		inspector.addTitle("Weights");

		for(var i = 0; i < this.weights.length; ++i)
		{
			inspector.addNumber( i.toString(), this.weights[i], { index: i, callback: function(v){
				node.weights[ this.options.index ] = v;
			}});
		}

		inspector.addButton(null,"+", function(){
			node.weights.push(0);
			node.updatePointsWeight();
			inspector.refresh();
		});

		inspector.addSeparator();
	}

	LiteGraph.registerNodeType("math/remap_weights", LGraphRemapWeights );
}
