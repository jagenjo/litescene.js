# Input #

When using the Script component we can read the input using the auto-event handlers like ```onMouseDown```, ```onMouseMove```, ```onMouseUp```, ```onKeyDown```, ```onKeyUp```, ```onButtonDown```, ```onButtonUp```.

Or if the component is made by ours we can bind the events for "mousedown","mousemove","mouseup","keyup","keydown", etc.

But sometimes you want to read the user raw input like the mouse coordinates, keyboard keys pressed or the gamepad axis.

In these situations you can use the ```LS.Input``` class to see the input state of:
- ```LS.Input.Mouse``` to read the mouse state
- ```LS.Input.Keyboard```to read the keyboard state
- ```LS.Input.Gamepads``` to read the gamepads state

## Mouse Input ##

When reading the mouse input you can access the ```LS.Input.Mouse```.

To access the mouse coordinates there is several ways:
- ```x```: x coordinate in canvas coordinates
- ```y```: y coordinate in canvas coordinates (0 is the bottom canvas position)
- ```clientx```: x coordinate in client coordinates 
- ```clienty```: y coordinate in client coordinates (0 is the top canvas position)

To get the mouse buttons state you can read the ```LS.Input.Mouse.buttons``` and mask to read every button state:

```javascript
if( LS.Input.Mouse.buttons | GL.LEFT_MOUSE_BUTTON )
	//...
```

or use the ```left_button```,```middle_button``` and ```right_button``` flags to check the state.

```javascript
if( LS.Input.Mouse.left_button )
	//...
```


## Touch events ##

By default LiteScene converts every touch event in a mouse event, this disables using multitouch gestures but we will work on this in the future.

## Keyboard ##

To read the keyboard state you can use the ```LS.Input.Keyboard``` where you have all the keys state:

```LS.Input.Keyboard["UP"]``` will tell you if the cursor UP key is pressed.
```LS.Input.Keyboard["a"]``` will tell you if the character 'a' key is pressed.

or you can use the keycode:
```LS.Input.Keyboard[32]``` will tell you if the RETURN key is pressed.

## Gamepads ##

To read the gamepads state you use a similar approach:

```javascript
var gamepad = LS.Input.Gamepads[0];
if(gamepad) //is gamepad connected
{
  var x = gamepad.axes[0]; //here axes must be referenced using a number
  if( gamepad.buttons[0].pressed )
  {...}
}
```

or to read the axes directly:
```javascript
var x_axis = LS.Input.getGamepadAxis(0,"LX"); //returns the LEFT AXIS value of the gamepad 0
```

or to read the buttons directly:
```javascript
if( LS.Input.isGamepadButtonPressed(0,"A") ) //returns if the "A" button of the gamepad 0 is pressed
  ...
```

## Using events ##

You can catch the events easily from the scripts using the events provided for that purpose:

- ```onMouseDown```: when a mouse button is pressed
- ```onMouseUp```: when a mouse button is unpressed
- ```onMouseMove```: when the mouse moves
- ```onMouseWheel```: when the mouse wheel rotates
- ```onKeyDown```: when a key is unpressed
- ```onKeyUp```: when a key is pressed
- ```onGamepadConnected```: when a gamepad is connected
- ```onGamepadDisconnected```: when a gamepad is disconnected
- ```onButtonDown```: when a gamepad button is pressed
- ```onButtonUp```: when a gamepad button is unpressed

All this functions receive the system event by parameter.

```javascript

this.onKeyDown = function(e)
{
	if(e.keyCode == 39)
		console.log("Right");
}
```

or if we are using a component:

```javascript

this.onAddedToScene = function(scene)
{
	LEvent.bind( scene, "mousedown", this.onMouse, this );
}

this.onRemovedFromScene = function(scene)
{
	LEvent.unbind( scene, "mousedown", this.onMouse, this );
}

this.onMouse = function(type, event)
{
	if( type == "mousedown" )
		console.log("mouse button clicked:", event.button );
}
```


## Example ##

This example moves the object using the gamepad or the keyboard cursors.

```javascript
//@unnamed
//defined: component, node, scene, globals

this.moving_speed = 100;
this.rotating_speed = 90;

this.onStart = function()
{
}

this.onUpdate = function(dt)
{
  var x_axis = 0;
  var y_axis = 0;
  
  var gamepad = LS.Input.getGamepad(0);
  if(gamepad)
  {
    x_axis = LS.Input.getGamepadAxis(0,"LX");
    y_axis = LS.Input.getGamepadAxis(0,"LY");
  }
  
  if(LS.Input.Keyboard["UP"])
    y_axis -= 1;
  if(LS.Input.Keyboard["DOWN"])
    y_axis += 1;
  if(LS.Input.Keyboard["LEFT"])
    x_axis -= 1;
  if(LS.Input.Keyboard["RIGHT"])
    x_axis += 1;
  
  x_axis = Math.clamp(x_axis,-1,1);
  y_axis = Math.clamp(y_axis,-1,1);
  
  node.transform.translate(0,0,y_axis * dt * this.moving_speed);
  node.transform.rotateY(-x_axis * dt * this.rotating_speed);
  
	node.scene.refresh();
}

this.onGamepadConnected = function()
{
  console.log("Gamepad connected!");
}
```
