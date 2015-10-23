/**
* Rotator rotate a mesh over time
* @class Rotator
* @constructor
* @param {String} object to configure from
*/

function Rotator(o)
{
	this.speed = 10;
	this.axis = [0,1,0];
	this.local_space = true;
	this.swing = false;
	this.swing_amplitude = 45;

	if(o)
		this.configure(o);
}

Rotator.icon = "mini-icon-rotator.png";

Rotator.prototype.onAddedToScene = function(scene)
{
	LEvent.bind(scene,"update",this.onUpdate,this);
}


Rotator.prototype.onRemovedFromScene = function(scene)
{
	LEvent.unbind(scene,"update",this.onUpdate,this);
}

Rotator.prototype.onUpdate = function(e,dt)
{
	if(!this._root) return;
	var scene = this._root.scene;

	if(!this._default)
		this._default = this._root.transform.getRotation();

	vec3.normalize(this.axis,this.axis);

	if(this.swing)
	{
		var R = quat.setAxisAngle(quat.create(), this.axis, Math.sin( this.speed * scene._global_time * 2 * Math.PI) * this.swing_amplitude * DEG2RAD );
		quat.multiply( this._root.transform._rotation, R, this._default);
		this._root.transform._dirty = true;
	}
	else
	{
		if(this.local_space)
			this._root.transform.rotate(this.speed * dt,this.axis);
		else
			this._root.transform.rotateGlobal(this.speed * dt,this.axis);
	}

	if(scene)
		scene.refresh();
}

LS.registerComponent(Rotator);