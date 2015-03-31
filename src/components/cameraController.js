/**
* Camera controller
* @class CameraController
* @constructor
* @param {String} object to configure from
*/

function CameraController(o)
{
	this.speed = 10;
	this.rot_speed = 1;
	this.wheel_speed = 1;
	this.smooth = false;
	this.allow_panning = true;
	this.cam_type = "orbit"; //"fps"
	this._moving = vec3.fromValues(0,0,0);
	this.orbit_center = null;
	this._collision = vec3.create();

	this.configure(o);
}

CameraController.icon = "mini-icon-cameracontroller.png";

CameraController.prototype.onAddedToNode = function(node)
{
	LEvent.bind(node,"mousedown",this.onMouse,this);
	LEvent.bind(node,"mousemove",this.onMouse,this);
	LEvent.bind(node,"mousewheel",this.onMouse,this);
	LEvent.bind(node,"keydown",this.onKey,this);
	LEvent.bind(node,"keyup",this.onKey,this);
	LEvent.bind(node,"update",this.onUpdate,this);
}

CameraController.prototype.onUpdate = function(e)
{
	if(!this._root) 
		return;

	if(this._root.transform)
	{
	}
	else if(this._root.camera)
	{
		var cam = this._root.camera;
		if(this.cam_type == "fps")
		{
			//move using the delta vector
			if(this._moving[0] != 0 || this._moving[1] != 0 || this._moving[2] != 0)
			{
				var delta = cam.getLocalVector( this._moving );
				vec3.scale(delta, delta, this.speed * (this._move_fast?10:1));
				cam.move(delta);
				cam.updateMatrices();
			}
		}
	}

	if(this.smooth)
	{
		this._root.scene.refresh();
	}
}

CameraController.prototype.onMouse = function(e, mouse_event)
{
	if(!this._root) return;
	
	var cam = this._root.camera;
	if(!cam) return;

	if(!mouse_event) mouse_event = e;

	if(mouse_event.eventType == "mousewheel")
	{
		var wheel = mouse_event.wheel > 0 ? 1 : -1;
		cam.orbitDistanceFactor(1 + wheel * -0.05 * this.wheel_speed, this.orbit_center);
		cam.updateMatrices();
		return;
	}

	if(mouse_event.eventType == "mousedown")
	{
		this.testPerpendicularPlane( mouse_event.canvasx, gl.canvas.height - mouse_event.canvasy, cam.getCenter(), this._collision );
	}

	//regular mouse dragging
	if(!mouse_event.dragging)
		return;

	if(this._root.transform)
	{
		//TODO
	}
	else 
	{
		if(this.cam_type == "fps")
		{
			cam.rotate(-mouse_event.deltax * this.rot_speed,[0,1,0]);
			cam.updateMatrices();
			var right = cam.getLocalVector([1,0,0]);
			cam.rotate(-mouse_event.deltay * this.rot_speed,right);
			cam.updateMatrices();
		}
		else if(this.cam_type == "orbit")
		{
			if(this.allow_panning && (mouse_event.ctrlKey || mouse_event.button == 1)) //pan
			{
				var collision = vec3.create();
				this.testPerpendicularPlane( mouse_event.canvasx, gl.canvas.height - mouse_event.canvasy, cam.getCenter(), collision );
				var delta = vec3.sub( vec3.create(), this._collision, collision);
				cam.move( delta );
				//vec3.copy(  this._collision, collision );
				cam.updateMatrices();
			}
			else
			{
				cam.orbit(-mouse_event.deltax * this.rot_speed,[0,1,0], this.orbit_center);
				cam.updateMatrices();
				var right = cam.getLocalVector([1,0,0]);
				cam.orbit(-mouse_event.deltay * this.rot_speed,right, this.orbit_center);

			}
		}
	}
}

CameraController.prototype.testPerpendicularPlane = function(x,y, center, result)
{
	var cam = this._root.camera;
	var ray = cam.getRayInPixel( x, gl.canvas.height - y );

	var front = cam.getFront();
	var center = center || cam.getCenter();
	var result = result || vec3.create();

	//test against plane
	if( geo.testRayPlane( ray.start, ray.direction, center, front, result ) )
		return true;
	return false;
}

CameraController.prototype.onKey = function(e, key_event)
{
	if(!this._root) return;
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
	else if(key_event.keyCode == 16) //shift in windows chrome
	{
		if(key_event.type == "keydown")
			this._move_fast = true;
		else
			this._move_fast = false;
	}

	//if(e.shiftKey) vec3.scale(this._moving,10);


	//LEvent.trigger(Scene,"change");
}

LS.registerComponent(CameraController);