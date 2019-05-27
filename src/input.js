///@INFO: BASE
/**
* Input is a static class used to read the input state (keyboard, mouse, gamepad, etc)
*
* @class Input
* @namespace LS
* @constructor
*/

//help info:
//mouse.mousey 0 is top
//mouse.canvasy 0 is bottom
//mouse.y is mousey

var Input = {
	mapping: {

		//xbox
		A_BUTTON: 0,
		B_BUTTON: 1,
		X_BUTTON: 2,
		Y_BUTTON: 3,
		LB_BUTTON: 4,
		RB_BUTTON: 5,
		BACK_BUTTON: 6,
		START_BUTTON: 7,
		LS_BUTTON: 8,
		RS_BUTTON: 9,

		LX: 0,
		LY: 1,
		RX: 2,
		RY: 3,
		TRIGGERS: 4,
		LEFT_TRIGGER: 4,
		RIGHT_TRIGGER: 5,

		//generic
		JUMP:0,
		FIRE:1,

		//mouse
		LEFT:0,
		MIDDLE:1,
		RIGHT:2
	},

	LEFT_MOUSE_BUTTON: 1,
	MIDDLE_MOUSE_BUTTON: 2,
	RIGHT_MOUSE_BUTTON: 3,

	Keyboard: [],
	Keyboard_previous: [],

	Mouse: {},
	Gamepads: [],

	//used for GUI elements
	last_mouse: null,
	last_click: null,
	current_click: null,
	current_key: null,
	keys_buffer: [], //array of keys that have been pressed from the last frame

	//_mouse_event_offset: [0,0],
	_last_frame: -1, //internal

	init: function()
	{
		this.Keyboard = gl.keys;
		this.Mouse = gl.mouse;
		this.Gamepads = gl.getGamepads();
	},

	reset: function()
	{
		this.Gamepads = gl.gamepads = []; //force reset so they send new events 
	},

	update: function()
	{
		//copy prev keys state
		for(var i = 0, l = this.Keyboard.length; i < l; ++i)
			this.Keyboard_previous[i] = this.Keyboard[i];

		//copy prev mouse state (this is only necessary if the update is not called from litegl main loop)
		this.Mouse.last_buttons = this.Mouse.buttons;

		//capture gamepads snapshot
		this.Gamepads = gl.getGamepads();
	},

	/**
	* returns true is the key is pressed now
	*
	* @method isKeyPressed
	* @param {Number} key_code
	* @return {boolean}
	*/
	isKeyPressed: function(key_code)
	{
		return !!this.Keyboard[ key_code ];
	},

	/**
	* returns true is the key was pressed between previous frame and now
	*
	* @method wasKeyPressed
	* @param {Number} key_code as in https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/keyCode#Browser_compatibility
	* @return {boolean}
	*/
	wasKeyPressed: function(key_code)
	{
		return this.Keyboard[ key_code ] && !this.Keyboard_previous[ key_code ];
	},

	/**
	* returns true is the mouse button is pressed now
	*
	* @method isMouseButtonPressed
	* @param {Number} button could be "left","middle","right" or GL.LEFT_MOUSE_BUTTON, GL.MIDDLE_MOUSE_BUTTON, GL.RIGHT_MOUSE_BUTTON
	* @return {boolean}
	*/
	isMouseButtonPressed: function(button)
	{
		var num = 0;
		if(button && button.constructor === String)
			num = this.mapping[button];
		else
			num = button;
		if(button === undefined)
			return false;

		return this.Mouse.isButtonPressed(num);
	},

	/**
	* returns true is the mouse button was pressed between previous frame and now
	*
	* @method wasMouseButtonPressed
	* @param {Number} button could be "left","middle","right" or GL.LEFT_MOUSE_BUTTON, GL.MIDDLE_MOUSE_BUTTON, GL.RIGHT_MOUSE_BUTTON
	* @return {boolean}
	*/
	wasMouseButtonPressed: function(button)
	{
		var num = 0;
		if(button && button.constructor === String)
			num = this.mapping[button];
		else
			num = button;
		if(button === undefined)
			return false;

		return this.Mouse.wasButtonPressed(num);
	},

	/**
	* locks the mouse (to use with first person view cameras) so when the mouse moves, the cameras moves
	*
	* @method lockMouse
	* @param {Boolean} v if true, the camera is locked, otherwise unlocked
	* @return {boolean}
	*/
	lockMouse: function(v)
	{
		if(v)
		{
			gl.canvas.requestPointerLock();

		}
		else
			document.exitPointerLock();
	},

	/**
	* returns true is mouse is in pointer lock mode
	*
	* @method isMouseLocked
	* @return {boolean}
	*/
	isMouseLocked: function()
	{
		return !!document.pointerLockElement;
	},

	//called from LS.Player when onmouse
	//returns true if the event was blocked
	onMouse: function(e)
	{
		this.last_mouse = e;

		if( this.isMouseLocked() )
		{
			e.canvasx = e.mousex = (gl.canvas.width * 0.5)|0;
			e.canvasy = e.mousey = (gl.canvas.height * 0.5)|0;
		}

		//mousey is from top
		this.Mouse.x = this.Mouse.mousex = e.mousex;
		this.Mouse.y = this.Mouse.mousey = e.mousey;
		//canvasy is from bottom
		this.Mouse.canvasx = e.canvasx;
		this.Mouse.canvasy = e.canvasy;

		//save it in case we need to know where was the last click
		if(e.type == "mousedown")
		{
			this.current_click = e;
			LS.triggerCoroutines( "click", e );
		}
		else if(e.type == "mouseup")
			this.current_click = null;

		//we test if this event should be sent to the components or it was blocked by the GUI
		return LS.GUI.testEventInBlockedArea(e);
	},

	//called from LS.Player when onkey
	onKey: function(e)
	{
		if(e.type == "keydown")
		{
			this.current_key = e;
			if( LS.Renderer._frame != this._last_frame )
			{
				this.keys_buffer.length = 0;
				LS.Renderer._frame = this._last_frame;
			}
			if( this.keys_buffer.length < 10 ) //safety first!
				this.keys_buffer.push(e);
		}
		else
			this.current_key = null;
	},

	/**
	* returns if the mouse is inside the rect defined by x,y, width,height
	*
	* @method isMouseInRect
	* @param {Number} x x coordinate of the mouse in canvas coordinates 
	* @param {Number} y y coordinate of the mouse in canvas coordinates (0 is bottom)
	* @param {Number} width rectangle width in pixels
	* @param {Number} height rectangle height in pixels
	* @param {boolean} flip [optional] if you want to flip the y coordinate
	* @return {boolean}
	*/
	isMouseInRect: function( x, y, width, height, flip_y )
	{
		return this.Mouse.isInsideRect(x,y,width,height,flip_y);
	},

	//uses {x,y}, instead of mousex,mousey
	isEventInRect: function( mouse, area, offset )
	{
		var x = mouse.mousex != null ? mouse.mousex : mouse.x;
		var y = mouse.mousey != null ? mouse.mousey : mouse.y;
		if(offset)
		{
			x -= offset[0];
			y -= offset[1];
		}
		return ( x >= area[0] && x < (area[0] + area[2]) && y >= area[1] && y < (area[1] + area[3]) );
	},

	/**
	* Returns the axis based on the gamepad or the keyboard cursors. Useful when you do now know if the player will use keyboard of gamepad
	*
	* @method getAxis
	* @param {String} "vertical" or "horizontal"
	* @return {Number} the value of the axis
	*/
	getAxis: function( axis )
	{
		if( axis == "vertical" )
		{
			if( this.isKeyPressed( 38 )	|| this.isKeyPressed( "W" )) //up
				return 1;
			if( this.isKeyPressed( 40 )	|| this.isKeyPressed( "S" )) //down
				return -1;
		}
		else if( axis == "horizontal" )
		{
			if( this.isKeyPressed( 37 )	|| this.isKeyPressed( "A" )) //left
				return -1;
			else if( this.isKeyPressed( 39 ) || this.isKeyPressed( "D" )) //right
				return 1;
		}

		var gamepad = this.Gamepads[0];
		if(gamepad)
		{
			if(axis == "horizontal")
				return gamepad.axes[0];
			else if(axis == "vertical")
				return gamepad.axes[1];
		}

		return 0;
	},

	/**
	* Returns a gamepad snapshot if it is connected
	*
	* @method getGamepad
	* @param {Number} index the index of the gamepad
	* @return {Object} gamepad snapshot with all the info
	*/
	getGamepad: function(index)
	{
		index = index || 0;
		return this.Gamepads[index];
	},

	/**
	* Returns a gamepad snapshot if it is connected
	*
	* @method getGamepadAxis
	* @param {Number} index the index of the gamepad
	* @param {String} name the name of the axis (also you could specify the number)
	* @param {boolean} raw [optional] if you want the data unfiltered
	* @return {Number} axis value from -1 to 1
	*/
	getGamepadAxis: function(index, name, raw)
	{
		var gamepad = this.Gamepads[index];
		if(!gamepad)
			return 0;

		var num = 0;
		if(name && name.constructor === String)
			num = this.mapping[name];
		else
			num = name;
		if(num === undefined)
			return 0;
		var v = gamepad.axes[num];
		if(!raw && v > -0.1 && v < 0.1 ) //filter
			return 0;
		return v;
	},

	/**
	* Returns if the given button of the specified gamepad is pressed
	*
	* @method isGamepadButtonPressed
	* @param {Number} index the index of the gamepad
	* @param {String} name the name of the button "A","B","X","Y","LB","RB","BACK","START","LS","RS" (also you could specify the number)
	* @return {Boolean} if the button is pressed
	*/
	isGamepadButtonPressed: function(input, name)
	{
		var gamepad = this.Gamepads[input];
		if(!gamepad)
			return null;

		var num = 0;
		if(name && name.constructor === String)
			num = this.mapping[name];
		else
			num = name;
		if(num === undefined)
			return 0;
		var button = gamepad.buttons[num];
		return button && button.pressed;
	},

	/**
	* Returns a Promise that will be fulfilled when the user clicks the screen
	* @method mouseClick
	* @return {Promise} 
	*/
	mouseClick: function()
	{
		return new Promise(function(resolve){
			LS.addWaitingCoroutine( resolve, "click" );
		});
	}
};


Object.defineProperty( MouseEvent.prototype, "getRay", { value: function(){
		//get camera under position
		var camera = LS.Renderer.getCameraAtPosition( this.mousex, this.mousey, LS.Renderer._visible_cameras );
		if(!camera)
			return null;
		//get ray
		return camera.getRay( this.mousex, this.mousey );
	},
	enumerable: false 
});

LS.Input = Input;