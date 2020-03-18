///@INFO: GRAPHS
if(typeof(LiteGraph) != "undefined")
{
	LiteGraph.CORNER_TOP_LEFT = 0;
	LiteGraph.CORNER_TOP_RIGHT = 1;
	LiteGraph.CORNER_BOTTOM_LEFT = 2;
	LiteGraph.CORNER_BOTTOM_RIGHT = 3;
	LiteGraph.CORNER_TOP_CENTER = 4;
	LiteGraph.CORNER_BOTTOM_CENTER = 5;

	var corner_options = { type:"enum", values:{ 
		"top-left": LiteGraph.CORNER_TOP_LEFT, 
		"top-right": LiteGraph.CORNER_TOP_RIGHT,
		"bottom-left": LiteGraph.CORNER_BOTTOM_LEFT,
		"bottom-right": LiteGraph.CORNER_BOTTOM_RIGHT,
		"top-center": LiteGraph.CORNER_TOP_CENTER,
		"bottom-center": LiteGraph.CORNER_BOTTOM_CENTER
	}};

	function positionToArea( position, corner, area )
	{
		var x = position[0];
		var y = position[1];

		switch( corner )
		{
			case LiteGraph.CORNER_TOP_RIGHT: x = gl.canvas.width - x; break;
			case LiteGraph.CORNER_BOTTOM_LEFT: y = gl.canvas.height - y; break;
			case LiteGraph.CORNER_BOTTOM_RIGHT: x = gl.canvas.width - x; y = gl.canvas.height - y; break;
			case LiteGraph.CORNER_TOP_CENTER: x = gl.canvas.width * 0.5; break;
			case LiteGraph.CORNER_BOTTOM_CENTER: x = gl.canvas.width * 0.5; y = gl.canvas.height - y; break;
			case LiteGraph.CORNER_TOP_LEFT:
			default:
		}

		area[0] = x;
		area[1] = y;
	}


	function LGraphInputMouse()
	{
		this.addOutput("pos","vec2");
		this.addOutput("left_button","boolean");
		this.addOutput("right_button","boolean");
		this.properties = {};
	}

	LGraphInputMouse.title = "Mouse";
	LGraphInputMouse.desc = "Mouse state info";

	LGraphInputMouse.prototype.onExecute = function()
	{
		this.setOutputData(0, LS.Input.Mouse.position );
		this.setOutputData(1, LS.Input.Mouse.buttons & LS.Input.BUTTONS_LEFT );
		this.setOutputData(2, LS.Input.Mouse.buttons & LS.Input.BUTTONS_RIGHT );
	}

	LiteGraph.registerNodeType("input/mouse", LGraphInputMouse );

	//special kind of node
	function LGraphGUIPanel()
	{
		this.addOutput("pos","vec2");
		this.addOutput("enabled","boolean");
		this.properties = { enabled: true, draggable: false, title: "", color: [0.1,0.1,0.1], opacity: 0.7, titlecolor: [0,0,0], position: [10,10], size: [300,200], rounding: 8, corner: LiteGraph.CORNER_TOP_LEFT };
		this._area = vec4.create();
		this._color = vec4.create();
		this._titlecolor = vec4.create();
		this._offset = [0,0];
	}

	LGraphGUIPanel.title = "GUIPanel";
	LGraphGUIPanel.desc = "renders a rectangle on webgl canvas";
	LGraphGUIPanel.priority = -1; //render first

	LGraphGUIPanel["@corner"] = corner_options;
	LGraphGUIPanel["@color"] = { type:"color" };
	LGraphGUIPanel["@titlecolor"] = { type:"color" };
	LGraphGUIPanel["@opacity"] = { widget:"slider", min:0,max:1 };

	LGraphGUIPanel.prototype.onExecute = function()
	{
		this.setOutputData(0, this._area );
		this.setOutputData(1, this.properties.enabled );
	}

	LGraphGUIPanel.prototype.onRenderGUI = function()
	{ 
		this.properties.enabled = this.getInputOrProperty("enabled");
		if(this.properties.enabled === false)
			return;

		var ctx = window.gl;
		if(!ctx)
			return;

		this._color.set( this.properties.color || [0.1,0.1,0.1] );
		this._color[3] = this.properties.opacity;
		ctx.fillColor = this._color;
		positionToArea( this.properties.position, this.properties.corner, this._area );
		this._area[0] += this._offset[0];
		this._area[1] += this._offset[1];
		this._area[2] = this.properties.size[0];
		this._area[3] = this.properties.size[1];

		//var mouse = LS.Input.current_click;
		//var clicked = LS.Input.isEventInRect( mouse, this._area, LS.GUI._offset );
		//if(clicked)
		//	LS.Input.current_click = false; //consume event

		gl.disable( gl.DEPTH_TEST );
		gl.enable( gl.BLEND );
		gl.blendFunc( gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA );
		var rounding = Math.min(15,this.properties.rounding);
		if(rounding > 0)
		{
			ctx.beginPath();
			ctx.roundRect( this._area[0], this._area[1], this.properties.size[0], this.properties.size[1], rounding, rounding );
			ctx.fill();
		}
		else
			ctx.fillRect( this._area[0], this._area[1], this.properties.size[0], this.properties.size[1] );

		if(this.properties.title)
		{
			this._titlecolor.set( this.properties.titlecolor || [0.3,0.3,0.3] );
			this._titlecolor[3] = this.properties.opacity;
			ctx.fillColor = this._titlecolor;
			if(rounding > 0)
			{
				ctx.beginPath();
				ctx.roundRect( this._area[0], this._area[1], this.properties.size[0], 30, rounding, 0 );
				ctx.fill();
			}
			else
				ctx.fillRect( this._area[0], this._area[1], this.properties.size[0], 30 );
			ctx.fillColor = [0.8,0.8,0.8,this.properties.opacity];
			ctx.font = "20px Arial";
			ctx.fillText( this.properties.title, 10 + this._area[0],24 + this._area[1]);
		}
	}

	LGraphGUIPanel.prototype.onMouse = function(e,v)
	{
		if(!this.properties.enabled || !this.properties.draggable )
			return;

		var area = this._area;
		var x = e.mousex;
		var y = e.mousey;
		if( e.type == "mousedown" )
		{
			//check if inside
			if( x >= area[0] && x < (area[0] + area[2]) && 
				y >= area[1] && y < (area[1] + area[3]) )
			{
				this._dragging = true;
				return true;
			}
		}
		else if( e.type == "mousemove" )
		{
			if( this._dragging )
			{
				this._offset[0] += e.deltax;
				this._offset[1] += e.deltay;
				return true;
			}
		}
		else //mouse up
			this._dragging = false;
	}

	LGraphGUIPanel.prototype.onGetInputs = function(){
		return [["enabled","boolean"]];
	}

	LiteGraph.registerNodeType("gui/panel", LGraphGUIPanel );

	function LGraphGUIText()
	{
		this.addInput("text");
		this.properties = { enabled: true, text: "", font: "", color: [1,1,1,1], precision: 3, position: [20,20], corner: LiteGraph.CORNER_TOP_LEFT };
		this._pos = vec2.create();
		this._text = "";
	}

	LGraphGUIText.title = "GUIText";
	LGraphGUIText.desc = "renders text on webgl canvas";

	LGraphGUIText["@corner"] = corner_options;
	LGraphGUIText["@color"] = { type:"color" };

	LGraphGUIText.prototype.onGetInputs = function(){
		return [["enabled","boolean"]];
	}

	LGraphGUIText.prototype.onExecute = function()
	{
		var v = this.getInputData(0);
		if(v != null)
		{
			if( v.constructor === Number )
				this._text = v.toFixed( this.properties.precision );
			else
				this._text = String(v);
		}
	}

	LGraphGUIText.prototype.onRenderGUI = function()
	{ 
		var ctx = window.gl;
		if(!ctx)
			return;

		var enabled = this.getInputOrProperty("enabled");
		if(enabled === false)
			return;

		var text = (this.properties.text || "") + this._text;
		if(text == "")
			return;

		ctx.font = this.properties.font || "20px Arial";
		ctx.textAlign = "left";
		ctx.fillColor = this.properties.color || [1,1,1,1];

		positionToArea( this.properties.position, this.properties.corner, this._pos );

		gl.disable( gl.DEPTH_TEST );
		gl.enable( gl.BLEND );
		gl.blendFunc( gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA );
		ctx.fillText( text, this._pos[0], this._pos[1] );
	}

	LiteGraph.registerNodeType("gui/text", LGraphGUIText );

	function LGraphGUIImage()
	{
		this.addInput("","image,canvas,texture");
		this.properties = { enabled: true, opacity: 1, keep_aspect: true, flipX: false, flipY: false, force_update: false, position: [20,20], size: [300,200], corner: LiteGraph.CORNER_TOP_LEFT };
		this._pos = vec2.create();
	}

	LGraphGUIImage.title = "GUIImage";
	LGraphGUIImage.desc = "renders an image on webgl canvas";

	LGraphGUIImage["@corner"] = corner_options;
	LGraphGUIImage["@opacity"] = { widget:"slider", min:0,max:1 };

	LGraphGUIImage.prototype.onGetInputs = function(){
		return [["enabled","boolean"],["parent_pos","vec2"]];
	}

	LGraphGUIImage.prototype.onRenderGUI = function()
	{ 
		var ctx = window.gl;
		if(!ctx)
			return;

		var img = this.getInputData(0);
		var enabled = this.getInputOrProperty("enabled");
		if(enabled === false || !img)
			return;

		if(this.properties.force_update)
			img.mustUpdate = true;

		positionToArea( this.properties.position, this.properties.corner, this._pos );

		gl.disable( gl.DEPTH_TEST );
		gl.enable( gl.BLEND );
		gl.blendFunc( gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA );
		var tmp = ctx.globalAlpha;
		ctx.globalAlpha *= this.properties.opacity;
		var x = this._pos[0];
		var y = this._pos[1];
		var parent_pos = this.getInputOrProperty("parent_pos");
		if(parent_pos)
		{
			x += parent_pos[0];
			y += parent_pos[1];
		}
		var w = this.properties.size[0];
		var h = this.properties.size[1];
		if(this.properties.keep_aspect)
			h = (this.properties.size[0] / img.width) * img.height;
		if(this.properties.flipX)
		{
			x += w;
			w *= -1;
		}
		if(this.properties.flipY)
		{
			y += h;
			h *= -1;
		}
		ctx.drawImage( img, x, y, w, h );
		ctx.globalAlpha = tmp;
	}

	LiteGraph.registerNodeType("gui/image", LGraphGUIImage );


	//special kind of node
	function LGraphGUISlider()
	{
		this.addOutput("v");
		this.properties = { enabled: true, text: "", min: 0, max: 1, value: 0, position: [20,20], size: [200,40], corner: LiteGraph.CORNER_TOP_LEFT };
		this._area = vec4.create();
	}

	LGraphGUISlider.title = "GUISlider";
	LGraphGUISlider.desc = "Renders a slider on the main canvas";
	LGraphGUISlider["@corner"] = corner_options;

	LGraphGUISlider.prototype.onRenderGUI = function()
	{
		if(!this.getInputOrProperty("enabled"))
			return;
		positionToArea( this.properties.position, this.properties.corner, this._area );
		this._area[2] = this.properties.size[0];
		this._area[3] = this.properties.size[1];

		var parent_pos = this.getInputOrProperty("parent_pos");
		if(parent_pos)
		{
			this._area[0] += parent_pos[0];
			this._area[1] += parent_pos[1];
		}

		this.properties.value = LS.GUI.HorizontalSlider( this._area, Number(this.properties.value), Number(this.properties.min), Number(this.properties.max), true );
		if(this.properties.text)
		{
			gl.textAlign = "right";
			gl.fillStyle = "#AAA";
			gl.fillText( this.properties.text, this._area[0] - 20, this._area[1] + this._area[3] * 0.75);
			gl.textAlign = "left";
		}
	}

	LGraphGUISlider.prototype.onExecute = function()
	{
		if(this.inputs && this.inputs.length)
			this.properties.enabled = this.getInputOrProperty("enabled");
		this.setOutputData(0, this.properties.value );
	}

	LGraphGUISlider.prototype.onGetInputs = function(){
		return [["enabled","boolean"],["parent_pos","vec2"]];
	}

	LiteGraph.registerNodeType("gui/slider", LGraphGUISlider );


	function LGraphGUIToggle()
	{
		this.addOutput("v");
		this.properties = { enabled: true, value: true, text:"toggle", position: [20,20], size: [140,40], corner: LiteGraph.CORNER_TOP_LEFT };
		this._area = vec4.create();
	}

	LGraphGUIToggle.title = "GUIToggle";
	LGraphGUIToggle.desc = "Renders a toggle widget on the main canvas";
	LGraphGUIToggle["@corner"] = corner_options;

	LGraphGUIToggle.prototype.onRenderGUI = function()
	{
		if(!this.getInputOrProperty("enabled"))
			return;

		positionToArea( this.properties.position, this.properties.corner, this._area );
		var parent_pos = this.getInputOrProperty("parent_pos");
		if(parent_pos)
		{
			this._area[0] += parent_pos[0];
			this._area[1] += parent_pos[1];
		}
		this._area[2] = this.properties.size[0];
		this._area[3] = this.properties.size[1];
		this.properties.value = LS.GUI.Toggle( this._area, this.properties.value, this.properties.text );
	}

	LGraphGUIToggle.prototype.onExecute = function()
	{
		this.setOutputData(0, this.properties.value );
	}

	LGraphGUIToggle.prototype.onGetInputs = function(){
		return [["enabled","boolean"],["parent_pos","vec2"]];
	}

	LiteGraph.registerNodeType("gui/toggle", LGraphGUIToggle );

	function LGraphGUIButton()
	{
		this.addOutput("",LiteGraph.EVENT);
		this.addOutput("was_pressed");
		this.properties = { enabled: true, text:"clickme", position: [20,20], size: [140,40], corner: LiteGraph.CORNER_TOP_LEFT };
		this.widgets_start_y = 2;
		this.addWidget("text","text","clickme","text");
		this._area = vec4.create();
		this._was_pressed = false;
	}

	LGraphGUIButton.title = "GUIButton";
	LGraphGUIButton.desc = "Renders a toggle widget on the main canvas";
	LGraphGUIButton["@corner"] = corner_options;

	LGraphGUIButton.prototype.onRenderGUI = function()
	{
		if(!this.getInputOrProperty("enabled"))
			return;
		positionToArea( this.properties.position, this.properties.corner, this._area );
		var parent_pos = this.getInputOrProperty("parent_pos");
		if(parent_pos)
		{
			this._area[0] += parent_pos[0];
			this._area[1] += parent_pos[1];
		}
		this._area[2] = this.properties.size[0];
		this._area[3] = this.properties.size[1];
		this._was_pressed = LS.GUI.Button( this._area, this.properties.text );
	}

	LGraphGUIButton.prototype.onExecute = function()
	{
		var enabled = this.getInputDataByName("enabled");
		if(enabled === false || enabled === true)
			this.properties.enabled = enabled;
		if(this._was_pressed)
			this.triggerSlot(0);
		this.setOutputData(1, this._was_pressed );
		this._was_pressed = false;
	}

	LGraphGUIButton.prototype.onGetInputs = function(){
		return [["enabled","boolean"],["parent_pos","vec2"]];
	}

	LiteGraph.registerNodeType("gui/button", LGraphGUIButton );

	function LGraphGUIMultipleChoice()
	{
		this.addOutput("v");
		this.addOutput("i");
		this.properties = { enabled: true, selected: 0, values:"option1;option2;option3", one_line: false, position: [20,20], size: [180,100], corner: LiteGraph.CORNER_TOP_LEFT };
		this._area = vec4.create();
		this._values = this.properties.values.split(";");
		var that = this;
		this.widget = this.addWidget("text","Options",this.properties.values,function(v){
			that.properties.values = v;
			that.onPropertyChanged("values",v);
		});
		this.size = [240,70];
	}

	LGraphGUIMultipleChoice.title = "GUIMultipleChoice";
	LGraphGUIMultipleChoice.desc = "Renders a multiple choice widget on the main canvas";
	LGraphGUIMultipleChoice["@corner"] = corner_options;

	LGraphGUIMultipleChoice.prototype.onPropertyChanged = function(name,value)
	{
		if(name == "values")
		{
			this._values = value.split(";");
			this.widget.value = value;
		}
	}

	LGraphGUIMultipleChoice.prototype.onAction = function(name, param)
	{
		if(name == "prev")
			this.properties.selected -= 1;
		else if(name == "next")
			this.properties.selected += 1;
		this.properties.selected = this.properties.selected % this._values.length;
		if(this.properties.selected < 0)
			this.properties.selected += this._values.length;
	}

	LGraphGUIMultipleChoice.prototype.onRenderGUI = function()
	{
		var enabled = this.getInputOrProperty("enabled");

		if(!this._values.length || !enabled )
			return;

		var selected = this.properties.selected = Math.floor( this.properties.selected );
		positionToArea( this.properties.position, this.properties.corner, this._area );
		var ctx = gl;
		
		var parent_pos = this.getInputOrProperty("parent_pos");
		if(parent_pos)
		{
			this._area[0] += parent_pos[0];
			this._area[1] += parent_pos[1];
		}

		if(this.properties.one_line)
		{
			var pos = this.properties.position;
			var size = this.properties.size;
			var w = size[1]; //use height as width
			this._area[2] = w * 2;
			this._area[3] = size[1];
			if( LS.GUI.ClickArea( this._area ) )
				selected -= 1;
			this._area[0] += size[0] - w*2;
			if( LS.GUI.ClickArea( this._area ) )
				selected += 1;
			selected = selected % this._values.length;
			if(selected < 0)
				selected += this._values.length;
			ctx.fillStyle = "black";
			ctx.strokeStyle = "#AAA";
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.roundRect( pos[0], pos[1], size[0], size[1], w * 0.5 );
			ctx.fill();
			ctx.stroke();
			ctx.fillStyle = "white";
			ctx.beginPath();
			var m = w * 0.25;
			ctx.moveTo( pos[0] + m, pos[1] + w * 0.5 );
			ctx.lineTo( pos[0] + w*0.5 + m*2, pos[1] + m );
			ctx.lineTo( pos[0] + w*0.5 + m*2, pos[1] + w - m);
			ctx.fill();
			ctx.beginPath();
			ctx.moveTo( pos[0] + size[0] - m, pos[1] + w * 0.5 );
			ctx.lineTo( pos[0] + size[0] - w*0.5 - m*2, pos[1] + m);
			ctx.lineTo( pos[0] + size[0] - w*0.5 - m*2, pos[1] + w - m);
			ctx.fill();
			ctx.fillStyle = "#AAA";
			ctx.textAlign = "center";
			ctx.font = (w*0.75).toFixed(0) + "px " + LS.GUI.GUIStyle.font;
			ctx.fillText( String(this._values[selected]), pos[0] + size[0] * 0.5, pos[1] + size[1] * 0.75 );
		}
		else
		{
			this._area[2] = this.properties.size[0];
			this._area[3] = this.properties.size[1] / this._values.length;
			var y = this._area[1];
			for(var i = 0; i < this._values.length; ++i)
			{
				this._area[1] = y + i * this._area[3];
				if( LS.GUI.Toggle( this._area, i == selected, this._values[i], null, true ) )
					selected = i;
			}
		}

		this.properties.selected = selected;

		var mouse = LS.Input.current_click;
		if(mouse)
		{
			var clicked = LS.Input.isEventInRect( mouse, this._area, LS.GUI._offset );
			if(clicked)
				LS.Input.current_click = false; //consume event
		}
	}

	LGraphGUIMultipleChoice.prototype.onGetInputs = function(){
		return [["enabled","boolean"],["parent_pos","vec2"],["options","array"],["next",LiteGraph.ACTION],["prev",LiteGraph.ACTION]];
	}

	LGraphGUIMultipleChoice.prototype.onExecute = function()
	{
		if(this.inputs)
		{
			for(var i = 0; i < this.inputs.length; ++i)
			{
				var input_info = this.inputs[i];
				var v = this.getInputData(i);
				if( input_info.name == "enabled" )
					this.properties.enabled = Boolean(v);
				else if( input_info.name == "options" && v)
				{
					this._values = v;
					this.properties.values = v.join(";");
					this.widget.value = this.properties.values;
				}
			}
		}
		this.setOutputData( 0, this._values[ this.properties.selected ] );
		this.setOutputData( 1, this.properties.selected );
	}

	LiteGraph.registerNodeType("gui/multiple_choice", LGraphGUIMultipleChoice );


	//based in the NNI distance 
	function LGraphMap2D()
	{
		this.addInput("x","number");
		this.addInput("y","number");
		this.addOutput("[]","array");
		this.addOutput("obj","object");
		this.addOutput("img","image");
		this.addProperty("circular",false);
		this.points = [];
		this.weights = [];
		this.weights_obj = {};
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
		this.setOutputData(1, this.weights_obj );

		if(this.isOutputConnected(2))
		{
			if(!this.temp_canvas)
				this.temp_canvas = document.createElement("canvas");
			this.temp_canvas.width = this.size[0];
			this.temp_canvas.height = this.size[1];
			var temp_ctx = this.temp_canvas.getContext("2d");
			this.renderToCanvas( temp_ctx, this.temp_canvas );
			this.setOutputData(2, this.temp_canvas );
		}
	}
	
	//now to compute the final weight we iterate for every cell to see if our point is nearer to the cell than the nearest point of the cell,
	//if that is the case we increase the weight of the nearest point. At the end we normalize the weights of the points by the number of near points
	//and that give us the weight for every point
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
		{
			weights[i] /= total_inside;
			this.weights_obj[ this.points[i].name ] = weights[i];
		}
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

		this.renderToCanvas( ctx );

		//weights
		var margin = this.margin;
		var w = this.size[0];
		var h = this.size[1];

		ctx.save();
		ctx.fillStyle = "black";
		ctx.fillRect( margin, h - margin + 2, w - margin * 2, margin - 4);
		ctx.strokeStyle = "white";
		ctx.strokeRect( margin, h - margin + 2, w - margin * 2, margin - 4);
		ctx.textAlign = "center";
		ctx.fillStyle = "white";
		ctx.fillText( "Visualize Weights", w * 0.5, h - margin * 0.3 );
		ctx.textAlign = "left";

		if(this.weights.length && this._visualize_weights)
		{
			var x = w + 5;
			var y = 16; //h - this.weights.length * 5 - 10;
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

	LGraphMap2D.prototype.renderToCanvas = function( ctx, canvas )
	{
		var pos = this.current_pos;
		var circular = this.properties.circular;
		var show_names = this.show_names;
		var margin = this.margin;
		var w = canvas ? canvas.width : this.size[0];
		var h = canvas ? canvas.height : this.size[1];

		ctx.fillStyle = "black";
		ctx.strokeStyle = "#BBB";
		if(circular)
		{
			this.circle_center[0] = w * 0.5;
			this.circle_center[1] = h * 0.5;
			this.circle_radius = h * 0.5 - margin;
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
			ctx.fillRect(margin,margin,w-margin*2, h-margin*2);
			ctx.strokeRect(margin,margin,w-margin*2, h-margin*2);
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
				ctx.drawImage( image, margin, margin,w-margin*2, h-margin*2 );
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
			x = x * (w-margin*2) + margin;
			y = y * (h-margin*2) + margin;
			x = Math.clamp( x, margin, w-margin);
			y = Math.clamp( y, margin, h-margin);
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
		x = x * (w-margin*2) + margin;
		y = y * (h-margin*2) + margin;
		x = Math.clamp( x, margin, w-margin);
		y = Math.clamp( y, margin, h-margin);
		ctx.arc(x,y,5,0,Math.PI*2);
		ctx.fill();

		if(canvas)
			canvas.mustUpdate = true;
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

	//here we precompute for every cell, which is the closest point of the points set and how far it is from the center of the cell
	//we store point index and distance in this._precomputed_weights
	//this is done only when the points set change
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
		inspector.widgets_per_row = 2;
		inspector.addString("New Point","",{ width:"75%", callback: function(v){
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
		this.addInput("in","array"); //array because they are already in order
		this.addOutput("out","object");
		this.points = [];	//2D points, name of point ("happy","sad") and weights ("mouth_left":0.4, "mouth_right":0.3)
		this.current_weights = {}; //object that tells the current state of weights, like "mouth_left":0.3, ...
		this.properties = { enabled: true };
		var node = this;
		this.combo = this.addWidget("combo","Point", "", function(v){
			node._selected_point = node.findPoint(v);
		}, { values:[] } );
		this.import_button = this.addWidget("button", "import weights", "", function(){
			node.importWeights(true,true);
		});
		this.size = [170,80];
		this._selected_point = null;
	}

	LGraphRemapWeights.title = "Remap Weights";

	LGraphRemapWeights.prototype.onExecute = function()
	{
		var enabled = this.getInputOrProperty("enabled");
		if(!enabled)
			return;

		var point_weights = this.getInputData(0); //array

		if(this.inputs)
		for(var i = 1; i < this.inputs.length; ++i)
		{
			var input_info = this.inputs[i];
			if(input_info.name == "selected")
			{
				var selected = this.getInputData(i); 
				if(selected)
				{
					this._selected_point = this.findPoint(selected);
					this.combo.value = selected;
				}
			}
		}

		for(var i in this.current_weights)
			this.current_weights[i] = 0;

		var points_has_changed = false;
		if( point_weights )
		for(var i = 0; i < point_weights.length; ++i)
		{
			var point = this.points[i];
			if(!point)
			{
				points_has_changed = true;
				continue;
			}
			var w = point_weights[i]; //input
			//for(var j = 0, l = point.weights.length; j < lw && j < l; ++j)
			for(var j in point.weights)
			{
				var v = (point.weights[j] || 0) * w;
				this.current_weights[j] += v;
			}
		}

		//output weights
		this.setOutputData(0, this.current_weights );

		if(this.outputs)
		for(var i = 1; i < this.outputs.length; ++i)
		{
			var output_info = this.outputs[i];
			if(!output_info)
				continue;
			if(output_info.name == "selected")
				this.setOutputData(i, this._selected_point ? this._selected_point.name : "" );
			else
				this.setOutputData(i, this.current_weights[output_info.name] );
		}

		if(points_has_changed)
			this.importPoints();
	}

	LGraphRemapWeights.prototype.onAction = function(name, params)
	{
		if(name == "import")
			this.importWeights(true); //do not force or recursion ahead
	}

	//adds a 2D point with the weights associated to it (not used?)
	LGraphRemapWeights.prototype.addPoint = function( name, weights )
	{
		if(!weights)
		{
			console.warn("no weights passed to add point");
			return;
		}
		var w = {};
		for(var i in weights)
			w[i] = weights[i];
		this.points.push({name: name, weights: w});	
	}

	//import 2D points from input node (usually LGraphMap2D), just the names
	LGraphRemapWeights.prototype.importPoints = function()
	{
		var input_node = this.getInputNode(0);
		if(!input_node || !input_node.points || !input_node.points.length )
			return;
		this.points.length = input_node.points.length;
		for(var i = 0; i < this.points.length; ++i)
			this.points[i] = { name: input_node.points[i].name, weights: {} };
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

	//when called it reads the output nodes to get which morph targets it is using and read their weights
	//then sets the current 2D point to this weights
	LGraphRemapWeights.prototype.importWeights = function( assign, run_graph )
	{
		//force data to flow from inputs to here
		if(this.graph && run_graph)
			this.graph.runStep(1,false, this.order );

		var name_weights = this.getInputDataByName("name_weights");
		
		if(name_weights)
		{
			for(var j in name_weights)
				this.current_weights[j] = name_weights[j];
		}
		else //get from output
		{
			var output_nodes = this.getOutputNodes(0);
			if(!output_nodes || output_nodes.length == 0)
				return;

			for(var i = 0; i < output_nodes.length; ++i)
			{
				var output_node = output_nodes[i];
				if( !output_node.getComponent )
					continue;

				var component = output_node.getComponent();
				if(!component)
					continue;

				var compo_weights = component.name_weights;
				var compo_weights = component.name_weights;
				for(var j in compo_weights)
					this.current_weights[j] = compo_weights[j];
			}
		}

		this.setDirtyCanvas(true);

		if( !assign || !this._selected_point)
			return;
		this._selected_point.weights = {};
		for(var i in this.current_weights)
			this._selected_point.weights[i] = this.current_weights[i];
	}

	LGraphRemapWeights.prototype.findPoint = function( name )
	{
		for(var i = 0; i < this.points.length; ++i)
			if( this.points[i].name == name )
				return this.points[i];
		return null;
	}

	LGraphRemapWeights.prototype.assignCurrentWeightsToPoint = function( point )
	{
		for(var i in this.current_weights)
			point.weights[i] = this.current_weights[i];
	}

	LGraphRemapWeights.prototype.onSerialize = function(o)
	{
		o.current_weights = this.current_weights;
		o.points = this.points;
		o.enabled = this.enabled;
	}

	LGraphRemapWeights.prototype.onConfigure = function(o)
	{
		if(o.enabled !== undefined)
			this.properties.enabled = o.enabled;
		if( o.current_weights )
			this.current_weights = o.current_weights;
		if(o.points)
		{
			this.points = o.points;

			//legacy
			for(var i = 0;i < this.points.length; ++i)
			{
				var p = this.points[i];
				if(p.weights && p.weights.constructor !== Object)
					p.weights = {};
			}

			//widget
			this.combo.options.values = this.points.map(function(a){ return a.name; });
			this.combo.value = this.combo.options.values[0] || "";
		}
	}

	LGraphRemapWeights.prototype.onInspect = function( inspector )
	{
		var node = this;

		inspector.addButton(null,"Import points from input", { callback: function(){
			node.importPoints();
			inspector.refresh();
		}});
		inspector.addButton(null,"Import weights from output", { callback: function(){
			node.importWeights(null,true);
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
			if(node._selected_point)
				for(var i in node._selected_point.weights)
					node.current_weights[i] = node._selected_point.weights[i];
			node.setDirtyCanvas(true);
			inspector.refresh();
		}});

		inspector.addButton(null,"current weights to point", { callback: function(){
			if(!node._selected_point)
				return;
			node.assignCurrentWeightsToPoint(node._selected_point);
			inspector.refresh();
		}});

		inspector.addSeparator();
		inspector.addTitle("Weights");

		for(var i in this.current_weights)
		{
			inspector.addNumber( i, this.current_weights[i], { name_width: "80%", index: i, callback: function(v){
				node.current_weights[ this.options.index ] = v;
			}});
		}

		inspector.addStringButton("Add Weight","", { button: "+", callback_button: function(v){
			node.current_weights[v] = 0;
			inspector.refresh();
		}});

		inspector.addSeparator();
	}

    LGraphRemapWeights.prototype.onGetOutputs = function() {
        var r = [["selected","string"]];
		for(var i in this.current_weights)
			r.push([i,"number"]);
		return r;
    };

	LGraphRemapWeights.prototype.onGetInputs = function()
	{
		return [["enabled","boolean"],["import",LiteGraph.ACTION],["selected","string"],["name_weights","object"]];
	}

	LiteGraph.registerNodeType("math/remap_weights", LGraphRemapWeights );

	//******************************************

	function LGraphCameraRay()
	{
		this.addInput("camera","component,camera");
		this.addInput("pos2D","vec2");
		this.addOutput("ray","ray");
		this.properties = {
			reverse_y: false
		};
		this._ray = new LS.Ray();
	}

	LGraphCameraRay.title = "Camera Ray";

	LGraphCameraRay.prototype.onExecute = function()
	{
		var camera = this.getInputData(0) || LS.Renderer.getCurrentCamera();
		var pos = this.getInputData(1);
		if(!camera || camera.constructor != LS.Camera || !pos)
			return;
		var viewport = null;
		var y = pos[1];
		if( this.properties.reverse_y )
			y = gl.canvas.height - pos[1];
		camera.getRay( pos[0], y, viewport, false, this._ray );
		this.setOutputData(0, this._ray);
	}

	LiteGraph.registerNodeType("math3d/camera_ray", LGraphCameraRay );

	function LGraphCameraProject()
	{
		this.addInput("camera","component,camera");
		this.addInput("pos3D","vec3");
		this.addOutput("screen_pos","vec4");
		this.properties = {
			clamp_to_viewport: false,
			reverse_y: true
		};

		this._screen_pos = vec4.create();
		this.size = [160,50];
	}

	LGraphCameraProject.title = "Camera Project";

	LGraphCameraProject.prototype.onExecute = function()
	{
		var camera = this.getInputData(0);
		var pos = this.getInputData(1);
		if(!camera || camera.constructor != LS.Camera || !pos)
			return;

		camera.project( pos, null, this._screen_pos, this.properties.reverse_y );
		var dist = vec3.distance( camera.eye, pos );
		this._screen_pos[3] = (Math.sin(camera.fov * DEG2RAD) / dist) * 100.0;

		if( this.properties.clamp_to_viewport )
		{
			this._screen_pos[0] = Math.clamp( this._screen_pos[0], 0, gl.canvas.width);
			this._screen_pos[1] = Math.clamp( this._screen_pos[1], 0, gl.canvas.height);
		}
		this.setOutputData(0, this._screen_pos);
	}

	LiteGraph.registerNodeType("math3d/camera_project", LGraphCameraProject );

	//*****************************

	function LGraphRayPlaneTest()
	{
		this.addInput("ray","ray");
		this.addInput("P","vec3");
		this.addInput("N","vec3");
		this.addOutput("pos","vec3");
		this.properties = {};
	}

	LGraphRayPlaneTest.title = "Ray-Plane test";

	LGraphRayPlaneTest.prototype.onExecute = function()
	{
		var ray = this.getInputData(0);
		var p = this.getInputData(1);
		var n = this.getInputData(2);
		if(!ray || ray.constructor != LS.Ray )
			return;
		if(!p)
			p = LS.ZEROS;
		if(!n)
			n = LS.TOP;
		var r = ray.testPlane(p,n);
		this.setOutputData( 0, ray.collision_point );
	}

	LiteGraph.registerNodeType("math3d/rayplane-test", LGraphRayPlaneTest );


	function LGraphRayCollidersTest()
	{
		this.addInput("enabled","boolean");
		this.addInput("ray","ray");
		this.addOutput("collides","boolean");
		this.addOutput("node","scenenode");
		this.addOutput("pos","vec3");
		this.addOutput("normal","vec3");
		this.properties = { max_dist: 1000, layers: 0xFF, mode: 0 };
		this.options = {};
	}

	LGraphRayCollidersTest.COLLIDERS = 0;
	LGraphRayCollidersTest.RENDERINSTANCES_BOUNDING = 1;
	LGraphRayCollidersTest.RENDERINSTANCES_MESH = 2;

	LGraphRayCollidersTest.title = "Ray-Colliders test";
	LGraphRayCollidersTest["@layers"] = { widget:"layers" };
	LGraphRayCollidersTest["@mode"] = { type:"enum", values: { "colliders": LGraphRayCollidersTest.COLLIDERS, "renderInstance_bounding": LGraphRayCollidersTest.RENDERINSTANCES_BOUNDING, "renderInstance_mesh": LGraphRayCollidersTest.RENDERINSTANCES_MESH } };

	LGraphRayCollidersTest.prototype.onExecute = function()
	{
		var enabled = this.getInputData(0);
		var ray = this.getInputData(1);
		if(enabled === false || !ray || ray.constructor != LS.Ray )
			return;
		var options = this.options;
		options.max_dist = this.properties.max_dist;
		options.normal = this.isInputConnected(3);
		options.layers = this.properties.layers;
		options.triangle_collision = this.properties.mode == LGraphRayCollidersTest.RENDERINSTANCES_MESH;
			
		var collisions = null;
		if(this.properties.mode == LGraphRayCollidersTest.COLLIDERS)
			collisions = LS.Physics.raycast( ray.origin, ray.direction, options );
		else 
			collisions = LS.Physics.raycastRenderInstances( ray.origin, ray.direction, options );

		if( collisions && collisions.length )
		{
			var coll = collisions[0];
			this.setOutputData( 0, true );
			this.setOutputData( 1, coll.node );
			this.setOutputData( 2, coll.position );
			this.setOutputData( 3, coll.normal );
		}
		else
			this.setOutputData( 0, false );
	}

	LiteGraph.registerNodeType("math3d/raycolliders-test", LGraphRayCollidersTest );

	//*********************************************

	function LGraphInputKey()
	{
		this.addOutput("","boolean");
		this.addOutput("",LiteGraph.EVENT);
		this.properties = {
			key: "SPACE"
		};
		var that = this;
		this.widgets_up = true;
		this.addWidget("text","Key",this.properties.key,function(v){
			if(v)
				that.properties.key = v;
		});
	}

	LGraphInputKey.title = "Key";

    LGraphInputKey.prototype.getTitle = function() {
        if (this.flags.collapsed) {
            return "Key: " + this.properties.key;
        }
        return this.title;
    };

	LGraphInputKey.prototype.onExecute = function()
	{
		var v = LS.Input.wasKeyPressed(this.properties.key);
		this.boxcolor = v ? "#fff" : "#000";
		this.setOutputData(0,v);
		if(v)
			this.triggerSlot(1,this.properties.key);
	}

	LiteGraph.registerNodeType("input/key", LGraphInputKey );
}
