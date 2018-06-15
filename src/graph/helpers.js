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
}
