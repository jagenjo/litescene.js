
/**
* Input is a static class used to read the input state (keyboard, mouse, gamepad, etc)
*
* @class Input
* @namespace LS
* @constructor
*/
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
	Mouse: {},
	Gamepads: [],

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
		//capture gamepads snapshot
		this.Gamepads = gl.getGamepads();
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
	isMouseInRect: function(x,y,width,height, flip_y)
	{
		return this.Mouse.isInsideRect(x,y,width,height,flip_y);
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
	* Returns if the given mouse button is pressed
	*
	* @method isMouseButtonPressed
	* @param {String} name the name of the button  "LEFT","MIDDLE,"RIGHT" (also you could specify the number)
	* @return {Boolean} if the button is pressed
	*/
	isMouseButtonPressed: function(name)
	{
		var num = 0;
		if(name && name.constructor === String)
			num = this.mapping[name];
		else
			num = name;
		if(num === undefined)
			return false;
		return (this.Mouse.buttons & (1<<num)) !== 0;
	}
};

LS.Input = Input;