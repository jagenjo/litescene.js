
/**
* GUI is a static class used to attach HTML elements on top of the 3D Canvas in a safe way
*
* @class GUI
* @namespace LS
* @constructor
*/
var GUI = {

	_root: null, //root DOM element containing the GUI

	/**
	* Returns the DOM element responsible for the GUI of the app. This is helpful because this GUI will be automatically removed if the app finishes.
	*
	* @method getRoot
	* @return {HTMLElement} 
	*/
	getRoot: function()
	{
		if( this._root )
		{
			if(!this._root.parentNode && gl.canvas.parentNode)
				gl.canvas.parentNode.appendChild( gui );
			return this._root;
		}

		if(LS.GlobalScene._state != LS.PLAYING)
			console.warn("GUI element created before the scene is playing. Only create the GUI elements from onStart or after, otherwise the GUI elements will be lost.");

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
	* attach HTMLElement to GUI Root in the anchor position specified
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

		var gui_root = this.getRoot();
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
	* shows the GUI 
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
	* hides the GUI (but it is still existing) 
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
			var gui_root = LS.GUI.getRoot();
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

	}
};

LS.GUI = GUI;