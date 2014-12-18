(function(){

/**
* Knob allows to rotate a mesh like a knob
* @class Knob
* @constructor
* @param {String} object to configure from
*/

function Knob(o)
{
	this.value = 0;
	this.delta = 0.01;

	this.steps = 0; //0 = continuous
	this.min_value = 0;
	this.max_value = 1;
	this.min_angle = -120;
	this.max_angle = 120;
	this.axis = vec3.fromValues(0,0,1);

	if(o)
		this.configure(o);
}

Knob.icon = "mini-icon-knob.png";

/**
* Configure the component getting the info from the object
* @method configure
* @param {Object} object to configure from
*/

Knob.prototype.configure = function(o)
{
	cloneObject(o, this);
}

/**
* Serialize this component)
* @method serialize
* @return {Object} object with the serialization info
*/

Knob.prototype.serialize = function()
{
	 var o = cloneObject(this);
	 return o;
}

Knob.prototype.onAddedToNode = function(node)
{
	node.flags.interactive = true;
	LEvent.bind(node,"mousemove",this.onmousemove,this);
	this.updateKnob();
}

Knob.prototype.updateKnob = function() {
	if(!this._root) return;
	var f = this.value / (this.max_value - this.min_value)
	quat.setAxisAngle(this._root.transform._rotation,this.axis, (this.min_angle + (this.max_angle - this.min_angle) * f )* DEG2RAD);
	this._root.transform._dirty = true;
}

Knob.prototype.onmousemove = function(e, mouse_event) { 
	this.value -= mouse_event.deltay * this.delta;

	if(this.value > this.max_value) this.value = this.max_value;
	else if(this.value < this.min_value) this.value = this.min_value;

	this.updateKnob();

	LEvent.trigger( this, "change", this.value);
	if(this._root)
		LEvent.trigger( this._root, "knobChange", this.value);

	return false;
};

LS.registerComponent(Knob);

})();