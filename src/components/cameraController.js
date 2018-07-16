/**
* Camera controller
* Allows to move a camera with the user input. It uses the first camera attached to the same node
* @class CameraController
* @constructor
* @param {String} object to configure from
*/

function CameraController(o)
{
	this.enabled = true;

	this.no_button_action = CameraController.NONE;
	this.left_button_action = CameraController.ORBIT;
	this.right_button_action = CameraController.PAN;
	this.middle_button_action = CameraController.PAN;
	this.mouse_wheel_action = CameraController.CHANGE_DISTANCE;

	this.keyboard_walk = false;
	this.lock_mouse = false;

	this.rot_speed = 1;
	this.walk_speed = 10;
	this.wheel_speed = 1;
	this.smooth = false;

	this._moving = vec3.fromValues(0,0,0);

	this._collision_none = vec3.create();
	this._collision_left = vec3.create();
	this._collision_middle = vec3.create();
	this._collision_right = vec3.create();
	this._dragging = false; //true if the mousedown was caught so the drag belongs to this component
	this._camera = null;

	this.configure(o);
}

CameraController.NONE = 0; //no action

CameraController.ORBIT = 1; //orbits around the center
CameraController.ORBIT_HORIZONTAL = 2; //orbits around the center only around Y axis

CameraController.ROTATE = 5; //rotates relative to the camera
CameraController.ROTATE_HORIZONTAL = 6; //moves relative to the camera

CameraController.PAN = 10; //moves paralel to the near plane
CameraController.PAN_XZ = 11; //pans only in the XZ plane

CameraController.CHANGE_DISTANCE = 15; //scales the center from eye to center
CameraController.WALK = 16; //moves forward or backward
CameraController.ELEVATE = 17; //moves forward or backward
CameraController.FOV = 18; //changes zoom (FOV)


CameraController.icon = "mini-icon-cameracontroller.png";

CameraController.mode_values = { 
		"None": CameraController.NONE,
		"Orbit": CameraController.ORBIT,
		"Orbit Horizontal": CameraController.ORBIT_HORIZONTAL, 
		"Rotate": CameraController.ROTATE,
		"Rotate Horizontal": CameraController.ROTATE_HORIZONTAL, 
		"Pan": CameraController.PAN,
		"Pan XZ": CameraController.PAN_XZ,
		"Change Distance": CameraController.CHANGE_DISTANCE,
		"Walk": CameraController.WALK,
		"Elevate": CameraController.ELEVATE
	};

CameraController.wheel_values = { 
		"None": CameraController.NONE,
		"Change Distance": CameraController.CHANGE_DISTANCE,
		"FOV": CameraController.FOV,
		"Walk": CameraController.WALK,
		"Elevate": CameraController.ELEVATE
};

CameraController["@no_button_action"] = { type:"enum", values: CameraController.mode_values };
CameraController["@left_button_action"] = { type:"enum", values: CameraController.mode_values };
CameraController["@middle_button_action"] = { type:"enum", values: CameraController.mode_values };
CameraController["@right_button_action"] = { type:"enum", values: CameraController.mode_values };
CameraController["@mouse_wheel_action"] = { type:"enum", values: CameraController.wheel_values };

CameraController.prototype.onAddedToScene = function( scene )
{
	LEvent.bind( scene, "start",this.onStart,this);
	LEvent.bind( scene, "finish",this.onFinish,this);
	LEvent.bind( scene, "mousedown",this.onMouse,this);
	LEvent.bind( scene, "mousemove",this.onMouse,this);
	LEvent.bind( scene, "mousewheel",this.onMouse,this);
	LEvent.bind( scene, "touchstart",this.onTouch,this);
	LEvent.bind( scene, "touchmove",this.onTouch,this);
	LEvent.bind( scene, "touchend",this.onTouch,this);
	LEvent.bind( scene, "keydown",this.onKey,this);
	LEvent.bind( scene, "keyup",this.onKey,this);
	LEvent.bind( scene, "update",this.onUpdate,this);
}

CameraController.prototype.onRemovedFromScene = function( scene )
{
	LEvent.unbindAll( scene, this );
}

CameraController.prototype.onStart = function(e)
{
	if(this.lock_mouse)
	{
		LS.Input.lockMouse(true);
	}
}

CameraController.prototype.onFinish = function(e)
{
	if(this.lock_mouse)
	{
		LS.Input.lockMouse(false);
	}
}

CameraController.prototype.onUpdate = function(e)
{
	if(!this._root || !this.enabled) 
		return;

	//get first camera attached to this node
	var cam = this._root.camera;

	//no camera or disabled, then nothing to do
	if(!cam || !cam.enabled)
		return;

	if(this._root.transform) //attached to node
	{
	}
	else 
	{
		if(this.keyboard_walk)
		{
			//move using the delta vector
			if(this._moving[0] != 0 || this._moving[1] != 0 || this._moving[2] != 0)
			{
				var delta = cam.getLocalVector( this._moving );
				vec3.scale(delta, delta, this.walk_speed );
				cam.move(delta);
				cam.updateMatrices();
			}
		}
	}

	if(this.smooth)
	{
		this._root.scene.requestFrame();
	}
}

CameraController.prototype.processMouseButtonDownEvent = function( mode, mouse_event, coll_point )
{
	var node = this._root;
	var cam = this._camera = node.camera;
	if(!cam || !cam.enabled)
		return;

	var is_global_camera = node._is_root;
	var changed = false;

	if(mode == CameraController.PAN)
		this.testPerpendicularPlane( mouse_event.canvasx, gl.canvas.height - mouse_event.canvasy, cam.getCenter(), coll_point );
	else if(mode == CameraController.PAN_XZ)
		this.testOriginPlane( mouse_event.canvasx, gl.canvas.height - mouse_event.canvasy, coll_point );

	return changed;
}

CameraController.prototype.processMouseButtonMoveEvent = function( mode, mouse_event, coll_point )
{
	var node = this._root;
	var cam = this._camera = node.camera;
	if(!cam || !cam.enabled)
		return;

	var is_global_camera = node._is_root;
	var changed = false;

	if(mode == CameraController.NONE)
		return false;

	if(mode == CameraController.ORBIT)
	{
		var yaw = mouse_event.deltax * this.rot_speed;
		var pitch = -mouse_event.deltay * this.rot_speed;

		//yaw rotation
		if( Math.abs(yaw) > 0.0001 )
		{
			if(is_global_camera)
			{
				cam.orbit( -yaw, [0,1,0] );
				cam.updateMatrices();
			}
			else
			{
				var eye = cam.getEye();
				node.transform.globalToLocal( eye, eye );
				node.transform.orbit( -yaw, [0,1,0], eye );
				cam.updateMatrices();
			}
			changed = true;
		}

		//pitch rotation
		var right = cam.getRight();
		var front = cam.getFront();
		var up = cam.getUp();
		var problem_angle = vec3.dot( up, front );
		if( !(problem_angle > 0.99 && pitch > 0 || problem_angle < -0.99 && pitch < 0)) //avoid strange behaviours
		{
			if(is_global_camera)
			{
				cam.orbit( -pitch, right, this.orbit_center );
			}
			else
			{
				var eye = cam.getEye();
				node.transform.globalToLocal( eye, eye );
				node.transform.orbit( -pitch, right, eye );
			}
			changed = true;
		}
	}
	else if(mode == CameraController.ORBIT_HORIZONTAL)
	{
		var yaw = mouse_event.deltax * this.rot_speed;

		if( Math.abs(yaw) > 0.0001 )
		{
			if(is_global_camera)
			{
				cam.orbit( -yaw, [0,1,0] );
				cam.updateMatrices();
			}
			else
			{
				var eye = cam.getEye();
				node.transform.globalToLocal( eye, eye );
				node.transform.orbit( -yaw, [0,1,0], eye );
				cam.updateMatrices();
			}
			changed = true;
		}
	}
	else if(mode == CameraController.ROTATE || mode == CameraController.ROTATE_HORIZONTAL )
	{
		var top = LS.TOP; //cam.getLocalVector(LS.TOP);
		cam.rotate( -mouse_event.deltax * this.rot_speed * 0.2, top );
		cam.updateMatrices();

		if( mode == CameraController.ROTATE )
		{
			var right = cam.getLocalVector(LS.RIGHT);
			if(is_global_camera)
			{
				cam.rotate(-mouse_event.deltay * this.rot_speed * 0.2,right);
				cam.updateMatrices();
			}
			else
			{
				node.transform.rotate( -mouse_event.deltay * this.rot_speed * 0.2, LS.RIGHT );
				cam.updateMatrices();
			}
		}
		changed = true;
	}
	else if(mode == CameraController.PAN)
	{
		var collision = vec3.create();
		var center = vec3.create();
		var delta = vec3.create();

		cam.getCenter( center );
		this.testPerpendicularPlane( mouse_event.canvasx, gl.canvas.height - mouse_event.canvasy, center, collision );
		vec3.sub( delta, coll_point, collision );

		if(is_global_camera)
		{
			cam.move( delta );
			cam.updateMatrices();
		}
		else
		{
			node.transform.translateGlobal( delta );
			cam.updateMatrices();
		}

		changed = true;	
	}
	else if(mode == CameraController.PAN_XZ)
	{
		var collision = vec3.create();
		var delta = vec3.create();
		this.testOriginPlane( mouse_event.canvasx, gl.canvas.height - mouse_event.canvasy, collision );
		vec3.sub( delta, coll_point, collision );
		if(is_global_camera)
			cam.move( delta );
		else
			node.transform.translateGlobal( delta );
		cam.updateMatrices();

		changed = true;
	}
	else if(mode == CameraController.CHANGE_DISTANCE)
	{
		var factor = mouse_event.deltay * this.wheel_speed;
		cam.orbitDistanceFactor(1 + factor * -0.05 );
		cam.updateMatrices();
		changed = true;
	}
	else if(mode == CameraController.WALK)
	{
		var delta = cam.getLocalVector( [0,0, mouse_event.deltay * this.walk_speed] );
		cam.move(delta);
		cam.updateMatrices();
		changed = true;
	}
	else if(mode == CameraController.ELEVATE)
	{
		cam.move([0,mouse_event.deltay * this.walk_speed,0]);
		cam.updateMatrices();
		changed = true;
	}

	return changed;
}

//triggered on mouse move, or button clicked
CameraController.prototype.onMouse = function(e, mouse_event)
{
	if(!this._root || !this.enabled) 
		return;
	
	var node = this._root;
	var cam = node.camera;
	if(!cam || !cam.enabled)
		return;

	var is_global_camera = node._is_root;

	if(!mouse_event)
		mouse_event = e;

	if(mouse_event.eventType == "mousewheel")
	{
		var wheel = mouse_event.wheel > 0 ? 1 : -1;

		switch( this.mouse_wheel_action )
		{
			case CameraController.CHANGE_DISTANCE: 
				cam.orbitDistanceFactor(1 + wheel * -0.05 * this.wheel_speed );
				cam.updateMatrices();
				break;
			case CameraController.FOV: 
				cam.fov = cam.fov - wheel;
				cam.updateMatrices();
				break;
		}

		node.scene.requestFrame();
		return;
	}

	var changed = false;

	if(mouse_event.eventType == "mousedown")
	{
		if( LS.Input.Mouse.isButtonPressed( GL.LEFT_MOUSE_BUTTON ) )
			changed |= this.processMouseButtonDownEvent( this.left_button_action, mouse_event, this._collision_left );
		if( LS.Input.Mouse.isButtonPressed( GL.MIDDLE_MOUSE_BUTTON ) )
			changed |= this.processMouseButtonDownEvent( this.middle_button_action, mouse_event, this._collision_middle );
		if( LS.Input.Mouse.isButtonPressed( GL.RIGHT_MOUSE_BUTTON ) )
			changed |= this.processMouseButtonDownEvent( this.right_button_action, mouse_event, this._collision_right );
		this._dragging = true;
	}
	if(!mouse_event.dragging)
		this._dragging = false;

	//mouse move
	if( mouse_event.eventType == "mousemove" && this.lock_mouse && document.pointerLockElement )
		changed |= this.processMouseButtonMoveEvent( this.no_button_action, mouse_event, this._collision_none  );

	//regular mouse dragging
	if( mouse_event.eventType == "mousemove" && mouse_event.dragging && this._dragging )
	{
		if( LS.Input.Mouse.isButtonPressed( GL.LEFT_MOUSE_BUTTON ) )
			changed |= this.processMouseButtonMoveEvent( this.left_button_action, mouse_event, this._collision_left  );
		if( LS.Input.Mouse.isButtonPressed( GL.MIDDLE_MOUSE_BUTTON ) )
			changed |= this.processMouseButtonMoveEvent( this.middle_button_action, mouse_event, this._collision_middle  );
		if( LS.Input.Mouse.isButtonPressed( GL.RIGHT_MOUSE_BUTTON ) )
			changed |= this.processMouseButtonMoveEvent( this.right_button_action, mouse_event, this._collision_right  );
	}

	if(changed)
		this._root.scene.requestFrame();
}

//manage pinching and dragging two fingers in a touch pad
CameraController.prototype.onTouch = function( e, touch_event)
{
	if(!this._root || !this.enabled) 
		return;
	
	var node = this._root;
	var cam = node.camera;
	if(!cam || !cam.enabled)
		return;

	var is_global_camera = node._is_root;

	if(!touch_event)
		touch_event = e;

	//console.log( e );
	//touch!
	if( touch_event.type == "touchstart" )
	{
		if( touch_event.touches.length == 2)
		{
			var distx = touch_event.touches[0].clientX - touch_event.touches[1].clientX;
			var disty = touch_event.touches[0].clientY - touch_event.touches[1].clientY;
			this._touch_distance = Math.sqrt(distx*distx + disty*disty);
			this._touch_center = [ (touch_event.touches[0].clientX + touch_event.touches[1].clientX) * 0.5,
									(touch_event.touches[0].clientY + touch_event.touches[1].clientY) * 0.5 ];
			touch_event.preventDefault();
			return false; //block
		}
	}
	if( touch_event.type == "touchmove" )
	{
		if(touch_event.touches.length == 2)
		{
			var distx = touch_event.touches[0].clientX - touch_event.touches[1].clientX;
			var disty = touch_event.touches[0].clientY - touch_event.touches[1].clientY;
			var distance = Math.sqrt(distx*distx + disty*disty);
			if(distance < 0.1)
				distance = 0.1;
			var delta_dist = this._touch_distance / distance;
			this._touch_distance = distance;
			//console.log( delta_dist );
			cam.orbitDistanceFactor( delta_dist );
			cam.updateMatrices();

			var delta_x = (touch_event.touches[0].clientX + touch_event.touches[1].clientX) * 0.5 - this._touch_center[0];
			var delta_y = (touch_event.touches[0].clientY + touch_event.touches[1].clientY) * 0.5 - this._touch_center[1];
			var panning_factor = cam.focalLength / gl.canvas.width;
			cam.panning( -delta_x, delta_y, panning_factor );
			this._touch_center[0] = (touch_event.touches[0].clientX + touch_event.touches[1].clientX) * 0.5;
			this._touch_center[1] = (touch_event.touches[0].clientY + touch_event.touches[1].clientY) * 0.5;

			cam.updateMatrices();
			this._root.scene.requestFrame();
			touch_event.preventDefault();
			return false; //block
		}
	}
}

CameraController.prototype.testOriginPlane = function(x,y, result)
{
	var cam = this._root.camera;
	var ray = cam.getRayInPixel( x, gl.canvas.height - y );
	var result = result || vec3.create();

	//test against plane at 0,0,0
	if( geo.testRayPlane( ray.origin, ray.direction, LS.ZEROS, LS.TOP, result ) )
		return true;
	return false;
}

CameraController.prototype.testPerpendicularPlane = function(x,y, center, result)
{
	var cam = this._root.camera;
	var ray = cam.getRayInPixel( x, gl.canvas.height - y );

	var front = cam.getFront();
	var center = center || cam.getCenter();
	var result = result || vec3.create();

	//test against plane
	if( geo.testRayPlane( ray.origin, ray.direction, center, front, result ) )
		return true;
	return false;
}

CameraController.prototype.onKey = function(e, key_event)
{
	if(!this._root || !this.enabled) 
		return;

	//trace(key_event);
	if(key_event.keyCode == 87)
	{
		if(key_event.type == "keydown")
			this._moving[2] = -1;
		else
			this._moving[2] = 0;
	}
	else if(key_event.keyCode == 83)
	{
		if(key_event.type == "keydown")
			this._moving[2] = 1;
		else
			this._moving[2] = 0;
	}
	else if(key_event.keyCode == 65)
	{
		if(key_event.type == "keydown")
			this._moving[0] = -1;
		else
			this._moving[0] = 0;
	}
	else if(key_event.keyCode == 68)
	{
		if(key_event.type == "keydown")
			this._moving[0] = 1;
		else
			this._moving[0] = 0;
	}
	
	if(key_event.keyCode == 16) //shift in windows chrome
	{
		if(key_event.type == "keydown")
			vec3.scale( this._moving, this._moving, 10 );
	}

	//LEvent.trigger(Scene,"change");
}

LS.registerComponent( CameraController );
