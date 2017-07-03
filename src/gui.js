
/**
* GUI is a static class used to attach HTML elements on top of the 3D Canvas in a safe way
*
* @class GUI
* @namespace LS
* @constructor
*/
var GUI = {

	_root: null, //root DOM element containing the GUI
	_allow_change_cursor: true,
	_is_on_top_of_immediate_widget: false,

	GUIStyle: {
		font: "Arial",
		color: "#FFF",
		backgroundColor: "#333",
		backgroundColorOver: "#AAA",
		selected: "#AAF",
		unselected: "#AAA"
	},

	clicked_enter: false,

	/**
	* Returns the DOM element responsible for the HTML GUI of the app. This is helpful because this GUI will be automatically removed if the app finishes.
	* Any HTML must be attached to this element, otherwise it may have problems with the editor.
	*
	* @method getHTMLRoot
	* @return {HTMLElement} 
	*/
	getHTMLRoot: function()
	{
		if( this._root )
		{
			if(!this._root.parentNode && gl.canvas.parentNode)
				gl.canvas.parentNode.appendChild( gui );
			return this._root;
		}

		if(LS.GlobalScene._state != LS.PLAYING)
			console.warn("GUI element created before the scene is playing will be deleted once the app starts. Only create the GUI elements from onStart or after, otherwise the GUI elements will be lost.");

		var gui = document.createElement("div");
		gui.className = "litescene-gui";
		gui.style.position = "absolute";
		gui.style.top = "0";
		gui.style.left = "0";

		//normalize
		gui.style.color = "#999";
		gui.style.font = "20px Arial";

		//make it fullsize
		gui.style.width = "100%";
		gui.style.height = "100%";
		gui.style.overflow = "hidden";
		gui.style.pointerEvents = "none";

		if(!this._style)
		{
			var style = this._style = document.createElement("style");
			style.appendChild(document.createTextNode(""));
			document.head.appendChild(style);
			style.sheet.insertRule(".litescene-gui button, .litescene-gui input { pointer-events: auto; }",0);
		}

		//append on top of the canvas
		gl.canvas.parentNode.appendChild( gui );
		
		this._root = gui;
		return gui;
	},

	/**
	* Creates a HTMLElement of the tag_type and adds it to the DOM on top of the canvas
	*
	* @method createElement
	* @param {String} tag_type the tag type "div"
	* @param {String} anchor "top-left", "top-right", "bottom-left", "bottom-right" or "none"
	* @return {HTMLElement} 
	*/
	createElement: function( tag_type, anchor )
	{
		tag_type = tag_type || "div";

		var element = document.createElement(tag_type);
		element.style.pointerEvents = "auto";
		return this.attach( element, anchor );
	},

	/**
	* attach HTMLElement to HTML GUI Root in the anchor position specified
	*
	* @method attach
	* @param {HTMLElement} element
	* @param {String} anchor "top-left", "top-right", "bottom-left", "bottom-right" or "none"
	*/
	attach: function( element, anchor )
	{
		if(!element)
		{
			console.error("attachToGUI: element cannot be null");
			return;
		}

		element.style.position = "absolute";

		anchor = anchor || "none"; //"top-left";

		switch(anchor)
		{
			case "bottom":
			case "bottom-left":
				element.style.bottom = "0";
				element.style.left = "0";
				break;
			case "bottom-right":
				element.style.bottom = "0";
				element.style.right = "0";
				break;
			case "bottom-middle":
				element.style.bottom = "0";
				element.style.width = "50%";
				element.style.margin = "0 auto";
				break;
			case "right":
			case "top-right":
				element.style.top = "0";
				element.style.right = "0";
				break;
			case "top-middle":
				element.style.top = "0";
				element.style.width = "50%";
				element.style.margin = "0 auto";
				break;
			case "left":
			case "top":
			case "top-left":
				element.style.top = "0";
				element.style.left = "0";
				break;
			case "none": break;
			default:
				console.warn("invalid GUI anchor position: ",anchor);
		}

		var gui_root = this.getHTMLRoot();
		gui_root.appendChild( element );
		return element;
	},

	/**
	* Removes an element from the GUI (same as  element.parentNode.removeChild( element ); )
	*
	* @method detach
	* @param {HTMLElement} element HTML element to detach from the GUI
	*/
	detach: function( element )
	{
		if(element && element.parentNode )
			element.parentNode.removeChild( element );
	},

	/**
	* Removes all the GUI elements from the DOM
	*
	* @method reset
	*/
	reset: function()
	{
		if( !this._root )
			return;

		if(this._root.parentNode)
			this._root.parentNode.removeChild( this._root );
		this._root = null;

		if(this._style)
		{
			this._style.parentNode.removeChild( this._style );
			this._style = null;		
		}
		return;
	},

	/**
	* shows the HTML GUI 
	*
	* @method show
	*/
	show: function()
	{
		if(!this._root)
			return;
		this._root.style.display = "";

	},

	/**
	* hides the HTML GUI (but it is still existing) 
	*
	* @method hide
	*/
	hide: function()
	{
		if(!this._root)
			return;
		this._root.style.display = "none";
	},

	/**
	* Loads resource containing the HTML code for the GUI and attachs it inside a div to the hud
	*
	* @method load
	* @param {String} url the url of the resource containing all the HTML code
	* @param {Function} on_complete callback that will be called once the HTML has been loaded and attached to the doom, it receives the HTMLElement containing all the HTML
	*/
	load: function( url, on_complete )
	{
		LS.ResourcesManager.load( url, function(res){
			var gui_root = LS.GUI.getHTMLRoot();
			var html = res.getAsHTML();
			if(!html)
			{
				console.error("html resource is not a string");
				return;
			}
			html.style.pointerEvents = "none";
			html.style.width = "100%";
			html.style.height = "100%";
			gui_root.appendChild( html );

			LS.GUI.replaceHTMLSources( gui_root );

			if(on_complete)
				on_complete( html, res );
		});
	},

	//WIP: allows to use resources 
	replaceHTMLSources: function(root)
	{
		//fetch all the tags with a src attribute
		var elements = root.querySelectorAll("*[src]");
		for(var i = 0; i < elements.length; ++i)
		{
			var element = elements[i];
			var src = element.getAttribute("src");

			//check if the src contains a @
			if(!src || src[0] != "@" )
				continue;

			src = src.substr(1);
			//replace that with a local URL to that resource in case is loaded
			var resource = LS.ResourcesManager.getResource( src );
			if( resource && resource._local_url )
				src = resource._local_url;
			else
				src = LS.ResourcesManager.getFullURL( src );
			element.setAttribute("src", src );
		}

	},

	//IMMEDIATE GUI STUFF

	/**
	* Called by the LS.Renderer to clear intermediate stuff
	*
	* @method ResetImmediateGUI
	*/
	ResetImmediateGUI: function()
	{
		this._is_on_top_of_immediate_widget = false;
		this.setCursor(null);
		LS.GlobalScene.requestFrame(); //force redraws
		this.clicked_enter = false;
	},

	/**
	* Renders an immediate gui BOX, used as background
	*
	* @method Box
	* @param {Array} area [x,y,width,height]
	* @param {String} color a color in string format "#AFAFAF"
	*/
	Box: function( area, color )
	{
		if(!area)
			throw("No area");
		var ctx = gl;
		ctx.fillStyle = color || "#333";
		ctx.fillRect( area[0], area[1], area[2], area[3] );
	},

	/**
	* Renders a text (or a texture)
	*
	* @method Label
	* @param {Array} area [x,y,width,height]
	* @param {String|GL.Texture} content could be a string or a GL.Texture
	*/
	Label: function( area, content )
	{
		if(!area)
			throw("No area");
		if(!content)
			return;

		var ctx = gl;

		if(content.constructor === GL.Texture)
		{
			ctx.drawImage( content, area[0], area[1], area[2], area[3] );
		}
		else if(content.constructor === String)
		{
			ctx.fillStyle = this.GUIStyle.color;
			ctx.font = (area[3]*0.75).toFixed(0) + "px " + this.GUIStyle.font;
			ctx.textAlign = "left";
			ctx.fillText( content, area[0] + area[3] * 0.2, area[1] + area[3] * 0.75 );
		}
	},

	/**
	* Renders a Button and returns if the button was pressed
	*
	* @method Button
	* @param {Array} area [x,y,width,height]
	* @param {String|GL.Texture} content could be a string or a GL.Texture
	* @param {String|GL.Texture} content_over same as before but in case the mouse is over
	* @return {Boolean} true if the button was pressed 
	*/
	Button: function( area, content, content_over )
	{
		if(!area)
			throw("No area");

		var ctx = gl;
		var is_over = LS.Input.isEventInRect( LS.Input.Mouse, area );
		if(is_over)
		{
			this._is_on_top_of_immediate_widget = true;
			this.setCursor("pointer");
		}
		var mouse = LS.Input.current_click;
		var clicked = false;
		if( mouse )
		{
			clicked = LS.Input.isEventInRect( mouse, area );
			if(clicked)
				LS.Input.current_click = false; //consume event
		}

		if( !content || content.constructor === String )
		{
			ctx.fillStyle = clicked ? "#FFF" : (is_over ? this.GUIStyle.backgroundColorOver : this.GUIStyle.backgroundColor );
			ctx.fillRect( area[0], area[1], area[2], area[3] );
		}

		if(content)
		{
			if(content.constructor === GL.Texture)
			{
				var texture = content;
				if( is_over && content_over && content_over.constructor === GL.Texture)
					texture = content_over;
				ctx.drawImage( texture, area[0], area[1], area[2], area[3] );
			}
			else if(content.constructor === String)
			{
				ctx.fillStyle = this.GUIStyle.color;
				ctx.font = (area[3]*0.75).toFixed(0) + "px " + this.GUIStyle.font;
				ctx.textAlign = "center";
				ctx.fillText( content, area[0] + area[2] * 0.5, area[1] + area[3] * 0.75 );
				ctx.textAlign = "left";
			}
		}

		return clicked;
	},

	/**
	* Renders a Toolbar (list of buttons) and returns the active one
	*
	* @method Toolbar
	* @param {Array} area [x,y,width,height]
	* @param {Number} selected the index of the selected option
	* @param {Array[String|GL.Texture]} options an array containing either strings or GL.Texture
	* @return {Number} the selected index
	*/
	Toolbar: function( area, selected, options )
	{
		if( !area )
			throw("No area");
		if( !options || options.constructor !== Array )
			throw("No options");

		var ctx = gl;
		var is_over = LS.Input.isEventInRect( LS.Input.Mouse, area );
		if(is_over)
		{
			this._is_on_top_of_immediate_widget = true;
			this.setCursor("pointer");
		}
		var mouse = LS.Input.current_click;
		var num = options.length;
		var x = area[0];
		var w = area[2];
		area[2] = w/num;

		for(var i = 0; i < num; ++i)
		{
			var content = options[i];
			var is_selected = selected == i;
			var clicked = false;
			area[0] = x + area[2] * i;

			if( mouse )
			{
				clicked = LS.Input.isEventInRect( mouse, area );
				if(clicked)
				{
					selected = i;
					is_selected = true;
					LS.Input.current_click = false; //consume event
				}
			}

			if( !content || content.constructor === String )
			{
				ctx.fillStyle = is_selected ? this.GUIStyle.backgroundColorOver : this.GUIStyle.backgroundColor;
				ctx.fillRect( area[0], area[1], area[2], area[3] );
			}

			if(content)
			{
				if(content.constructor === GL.Texture)
				{
					var texture = content;
					if(!is_selected)
						ctx.globalAlpha = 0.5;
					ctx.drawImage( texture, area[0], area[1], area[2], area[3] );
					ctx.globalAlpha = 1;
				}
				else if(content.constructor === String)
				{
					ctx.fillStyle = this.GUIStyle.color;
					ctx.font = (area[3]*0.75).toFixed(0) + "px " + this.GUIStyle.font;
					ctx.textAlign = "center";
					ctx.fillText( content, area[0] + area[2] * 0.5, area[1] + area[3] * 0.75 );
					ctx.textAlign = "left";
				}
			}
		}

		area[0] = x;
		area[2] = w;

		return selected;
	},

	/**
	* Renders a checkbox widget, and returns the current state
	* Remember: you must pass as value the same value returned by this function in order to work propertly
	*
	* @method Toggle
	* @param {Array} area [x,y,width,height]
	* @param {Boolean} value if the checkbox is on or off
	* @param {String|GL.Texture} content an string or image in case the checkbox is on
	* @param {String|GL.Texture} content_off an string or image in case the checkbox is off 
	* @return {Boolean} the current state of the checkbox (will be different from value if it was pressed)
	*/
	Toggle: function( area, value, content, content_off )
	{
		if(!area)
			throw("No area");
		value = !!value;

		var ctx = gl;
		var is_over = LS.Input.isEventInRect( LS.Input.Mouse, area );
		if(is_over)
		{
			this._is_on_top_of_immediate_widget = true;
			this.setCursor("pointer");
		}
		var mouse = LS.Input.current_click;
		var clicked = false;
		if( mouse )
		{
			clicked = LS.Input.isEventInRect( mouse, area );
			if(clicked)
			{
				LS.Input.current_click = false; //consume event
			}
		}

		var margin = (area[3]*0.2)

		if(content)
		{
			if(content.constructor === GL.Texture)
			{
				var texture = content;
				if( !value && content_off && content_off.constructor === GL.Texture)
					texture = content_off;
				ctx.drawImage( texture, area[0], area[1], area[2], area[3] );
			}
			else if(content.constructor === String)
			{
				ctx.fillStyle = this.GUIStyle.color;
				ctx.font = (area[3]*0.75).toFixed(0) + "px " + this.GUIStyle.font;
				ctx.fillText( content, area[0] + margin, area[1] + area[3] * 0.75 );

				var w = area[3] * 0.6;
				ctx.fillStyle = this.GUIStyle.backgroundColor;
				ctx.fillRect( area[0] + area[2] - margin*1.5 - w, area[1] + margin*0.5, w+margin, area[3] - margin );
				ctx.fillStyle = value ? this.GUIStyle.selected : "#000";
				ctx.fillRect( area[0] + area[2] - margin - w, area[1] + margin, w, area[3] - margin*2 );
			}
		}

		return clicked ? !value : value;
	},


	/**
	* Renders a textfield widget and returns the current value
	* Remember: you must pass as text the same text returned by this function in order to work propertly
	*
	* @method Toggle
	* @param {Array} area [x,y,width,height]
	* @param {Boolean} value if the checkbox is on or off
	* @param {Number} max_length to limit the text, otherwise leave blank
	* @return {Boolean} the current state of the checkbox (will be different from value if it was pressed)
	*/
	TextField: function( area, text, max_length )
	{
		if(!area)
			throw("No area");

		text = text === undefined ? "" : String(text);
		max_length = max_length || 1024;

		var ctx = gl;
		var is_over = LS.Input.isEventInRect( LS.Input.Mouse, area );
		if(is_over)
		{
			this._is_on_top_of_immediate_widget = true;
			this.setCursor("pointer");
		}
		var mouse = LS.Input.current_click;
		var clicked = false;
		if( mouse )
		{
			clicked = LS.Input.isEventInRect( mouse, area );
			if(clicked)
			{
				LS.Input.current_click = null; //consume event
				LS.Input.last_click = mouse;
			}
		}
		var is_selected = false;
		if( LS.Input.last_click && LS.Input.isEventInRect( LS.Input.last_click, area ) )
		{
			is_selected = true;
		}

		if(is_selected)
		{
			var keys = LS.Input.keys_buffer;
			for( var i = 0; i < keys.length; ++i )
			{
				var key = keys[i];
				switch(key.keyCode)
				{
					case 8: text = text.substr(0, text.length - 1 ); break; //backspace
					case 13: this.clicked_enter = true; break; //return
					case 32: if(text.length < max_length) text += " "; break;
					default:
						if(text.length < max_length && key.key && key.key.length == 1) //length because control keys send a string like "Shift"
							text += key.key;
						/*
						if( key.keyCode >= 65 && key.keyCode <= 122 ) //letters
							text += key.shiftKey ? key.character.toUpperCase() : key.character.toLowerCase();
						*/
				}
				//console.log(key.charCode, key.keyCode, key.character, key.which, key );
			}
			keys.length = 0; //consume them
			LS.Input.current_key = null;
		}

		var line = (area[3]*0.02);
		var margin = (area[3]*0.2);

		//contour
		ctx.fillStyle = this.GUIStyle.backgroundColor;
		ctx.fillRect( area[0], area[1], area[2], area[3] );
		ctx.fillStyle = "#000";
		ctx.fillRect( area[0] + line, area[1] + line, area[2] - line*2, area[3] - line*2 );

		ctx.fillStyle = this.GUIStyle.color;
		ctx.font = (area[3]*0.75).toFixed(0) + "px " + this.GUIStyle.font;
		ctx.textAlign = "left";

		var cursor = "";
		if( is_selected && (((getTime() * 0.002)|0) % 2) == 0 )
			cursor = "|";

		ctx.fillText( text + cursor, area[0] + margin*2, area[1] + area[3] * 0.75 );

		return text;
	},

	/**
	* Renders an horizontal slider widget, returns the current value
	* Remember: you must pass as value the same value returned by this function in order to work propertly
	*
	* @method HorizontalSlider
	* @param {Array} area [x,y,width,height]
	* @param {Number} value the value to show in the slider
	* @param {Number} left_value the minimum value for the slider
	* @param {Number} right_value the maximum value for the slider
	* @param {Boolean} show_value if you want to see a caption in text format with the value
	* @return {Number} the current value of the slider (will be different from value if it was clicked)
	*/
	HorizontalSlider: function( area, value, left_value, right_value, show_value )
	{
		if(!area)
			throw("No area");

		if(left_value === undefined)
			left_value = 0;
		if(right_value === undefined)
			right_value = 1;
		value = Number(value);
		left_value = Number(left_value);
		right_value = Number(right_value);

		var ctx = gl;
		var is_over = LS.Input.isEventInRect( LS.Input.Mouse, area );
		if(is_over)
		{
			this._is_on_top_of_immediate_widget = true;
			this.setCursor("pointer");
		}
		var mouse = LS.Input.current_click;
		var clicked = false;
		var range = right_value - left_value;
		var norm_value = (value - left_value) / range;
		if(norm_value < 0) norm_value = 0;
		if(norm_value > 1) norm_value = 1;

		var margin = (area[3]*0.2);

		if( mouse )
		{
			clicked = LS.Input.isEventInRect( mouse, area );
			if(clicked)
			{
				norm_value = (LS.Input.Mouse.mousex - (area[0] + margin)) / (area[2] - margin*2);
				if(norm_value < 0) norm_value = 0;
				if(norm_value > 1) norm_value = 1;
				value = norm_value * range + left_value;
			}
		}

		ctx.fillStyle = this.GUIStyle.backgroundColor;
		ctx.fillRect( area[0], area[1], area[2], area[3] );
		ctx.fillStyle = clicked ? this.GUIStyle.selected : this.GUIStyle.unselected;
		ctx.fillRect( area[0] + margin, area[1] + margin, (area[2] - margin*2) * norm_value, area[3] - margin*2 );

		if(show_value)
		{
			ctx.textAlign = "center";
			ctx.fillStyle = this.GUIStyle.color;
			ctx.font = (area[3]*0.5).toFixed(0) + "px " + this.GUIStyle.font;
			ctx.fillText( value.toFixed(2), area[0] + area[2] * 0.5, area[1] + area[3] * 0.7 );
		}

		return value;
	},

	/**
	* Renders an vertical slider widget, returns the current value
	* Remember: you must pass as value the same value returned by this function in order to work propertly
	*
	* @method VerticalSlider
	* @param {Array} area [x,y,width,height]
	* @param {Number} value the value to show in the slider
	* @param {Number} bottom_value the minimum value for the slider
	* @param {Number} top_value the maximum value for the slider
	* @return {Number} the current value of the slider (will be different from value if it was clicked)
	*/
	VerticalSlider: function( area, value, bottom_value, top_value )
	{
		if(!area)
			throw("No area");

		value = Number(value);
		if(bottom_value === undefined)
			bottom_value = 0;
		if(top_value === undefined)
			top_value = 1;
		bottom_value = Number(bottom_value);
		top_value = Number(top_value);

		var ctx = gl;
		var is_over = LS.Input.isEventInRect( LS.Input.Mouse, area );
		if(is_over)
		{
			this._is_on_top_of_immediate_widget = true;
			this.setCursor("pointer");
		}
		var mouse = LS.Input.current_click;
		var clicked = false;
		var range = top_value - bottom_value;
		var norm_value = (value - bottom_value) / range;
		if(norm_value < 0) norm_value = 0;
		if(norm_value > 1) norm_value = 1;

		var margin = (area[2]*0.2)

		if( mouse )
		{
			clicked = LS.Input.isEventInRect( mouse, area );
			if(clicked)
			{
				norm_value = (LS.Input.Mouse.mousey - (area[1] + margin)) / (area[3] - margin*2);
				if(norm_value < 0) norm_value = 0;
				if(norm_value > 1) norm_value = 1;
				norm_value = 1 - norm_value; //reverse slider
				value = norm_value * range + bottom_value;
			}
		}

		ctx.fillStyle = this.GUIStyle.backgroundColor;
		ctx.fillRect( area[0], area[1], area[2], area[3] );
		ctx.fillStyle = clicked ? this.GUIStyle.selected : this.GUIStyle.unselected;
		ctx.fillRect( area[0] + margin, area[1] + area[3] - (area[3] - margin*2) * norm_value - margin, area[2] - margin*2, (area[3] - margin*2) * norm_value );

		return value;
	},

	setCursor: function(type)
	{
		if(!this._allow_change_cursor)
			return;
		gl.canvas.style.cursor = type || "";
	}
};

GUI.getRoot = function()
{
	console.warn("LS.GUI.getRoot() deprecated, use LS.GUI.getHTMLRoot() instead.");
	return LS.GUI.getHTMLRoot();
}

LS.GUI = GUI;