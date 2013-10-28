/**
* Node manipulator, allows to rotate it
* @class NodeManipulator
* @constructor
* @param {String} object to configure from
*/

function NodeManipulator(o)
{
	this.rot_speed = [1,1]; //degrees
	this.smooth = false;
	this.configure(o);
}

NodeManipulator.icon = "mini-icon-rotator.png";

NodeManipulator.prototype.onAddedToNode = function(node)
{
	node.interactive = true;
	LEvent.bind(node,"mousemove",this.onMouse,this);
	LEvent.bind(node,"update",this.onUpdate,this);
}

NodeManipulator.prototype.onUpdate = function(e)
{
	if(!this._root) return;

	if(!this._root.transform)
		return;

	if(this.smooth)
	{
		Scene.refresh();
	}
}

NodeManipulator.prototype.onMouse = function(e, mouse_event)
{
	if(!this._root || !this._root.transform) return;
	
	//regular mouse dragging
	if(!mouse_event.dragging)
		return;

	this._root.transform.rotate(mouse_event.deltax * this.rot_speed[0], [0,1,0] );
	this._root.transform.rotateLocal(-mouse_event.deltay * this.rot_speed[1], [1,0,0] );
}

LS.registerComponent(NodeManipulator);