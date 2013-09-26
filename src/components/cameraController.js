/**
* Camera controller
* @class FPSController
* @constructor
* @param {String} object to configure from
*/

function CameraController(o)
{
	this.speed = 10;
	this.rot_speed = 1;
	this.cam_type = "orbit"; //"fps"
	this._moving = vec3.fromValues(0,0,0);
	this.orbit_center = null;
}

CameraController.prototype.onAddedToNode = function(node)
{
	LEvent.bind(node,"mousemove",this.onMouse,this);
	LEvent.bind(node,"keydown",this.onKey,this);
	LEvent.bind(node,"keyup",this.onKey,this);
	LEvent.bind(node,"update",this.onUpdate,this);
}

CameraController.prototype.onUpdate = function(e)
{
	if(!this._root) return;

	if(this._root.transform)
	{
	}
	else if(this._root.camera)
	{
		var cam = this._root.camera;
		if(this.cam_type == "fps")
		{
			if(this._moving[0] != 0 || this._moving[1] != 0 || this._moving[2] != 0)
			{
				var delta = cam.getLocalVector( this._moving );
				vec3.scale(delta, delta, this.speed * (this._move_fast?10:1));
				cam.move(delta);
				cam.updateMatrices();
			}
		}
	}
}

CameraController.prototype.onMouse = function(e)
{
	if(!this._root) return;
	
	if(e.dragging)
	{
		if(this._root.transform)
		{
		}
		else if(this._root.camera)
		{
			if(this.cam_type == "fps")
			{
				var cam = this._root.camera;
				cam.rotate(-e.deltaX * this.rot_speed,[0,1,0]);
				cam.updateMatrices();
				var right = cam.getLocalVector([1,0,0]);
				cam.rotate(-e.deltaY * this.rot_speed,right);
				cam.updateMatrices();
			}
			else if(this.cam_type == "orbit")
			{
				var cam = this._root.camera;

				if(e.ctrlKey)
				{
					var delta = cam.getLocalVector( [ this.speed * -e.deltaX * 0.1, this.speed * e.deltaY * 0.1, 0]);
					cam.move(delta);
					cam.updateMatrices();
				}
				else
				{
					cam.orbit(-e.deltaX * this.rot_speed,[0,1,0], this.orbit_center);
					if(e.shiftKey)
					{
						cam.updateMatrices();
						var right = cam.getLocalVector([1,0,0]);
						cam.orbit(-e.deltaY,right, this.orbit_center);
					}
					else
					{
						cam.orbitDistanceFactor(1 + e.deltaY * 0.01, this.orbit_center);
						cam.updateMatrices();
					}
				}
			}
		}
	}
	//LEvent.trigger(Scene,"change");
}

CameraController.prototype.onKey = function(e)
{
	if(!this._root) return;
	//trace(e);
	if(e.keyCode == 87)
	{
		if(e.type == "keydown")
			this._moving[2] = -1;
		else
			this._moving[2] = 0;
	}
	else if(e.keyCode == 83)
	{
		if(e.type == "keydown")
			this._moving[2] = 1;
		else
			this._moving[2] = 0;
	}
	else if(e.keyCode == 65)
	{
		if(e.type == "keydown")
			this._moving[0] = -1;
		else
			this._moving[0] = 0;
	}
	else if(e.keyCode == 68)
	{
		if(e.type == "keydown")
			this._moving[0] = 1;
		else
			this._moving[0] = 0;
	}
	else if(e.keyCode == 16) //shift in windows chrome
	{
		if(e.type == "keydown")
			this._move_fast = true;
		else
			this._move_fast = false;
	}

	//if(e.shiftKey) vec3.scale(this._moving,10);


	//LEvent.trigger(Scene,"change");
}

LS.registerComponent(CameraController);