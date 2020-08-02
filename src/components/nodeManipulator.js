///@INFO: UNCOMMON
/**
* Node manipulator, allows to rotate it
* @class NodeManipulator
* @constructor
* @param {String} object to configure from
*/

function NodeManipulator(o)
{
	this.enabled = true;
	this.on_node_clicked = false;
	this.use_global_up_for_yaw = false;
	this.rot_speed = [1,1]; //degrees
	if(o)
		this.configure(o);
}

NodeManipulator.icon = "mini-icon-rotator.png";

NodeManipulator.prototype.onAddedToScene = function(scene)
{
	LEvent.bind( scene, "mousemove",this.onSceneMouse,this);
}

NodeManipulator.prototype.onRemovedFromScene = function(scene)
{
	LEvent.unbind( scene, "mousemove",this.onSceneMouse, this);
}

NodeManipulator.prototype.onAddedToNode = function(node)
{
	LEvent.bind( node, "mousemove",this.onNodeMouse,this);
}

NodeManipulator.prototype.onRemovedFromNode = function(node)
{
	LEvent.unbind( node, "mousemove",this.onNodeMouse,this);
}

NodeManipulator.prototype.onNodeMouse = function( e, mouse_event )
{
	if(!this.on_node_clicked || !this.enabled)
		return;
	return this.onMouse( e, mouse_event );
}

NodeManipulator.prototype.onSceneMouse = function( e, mouse_event )
{
	if(this.on_node_clicked || !this.enabled)
		return;
	return this.onMouse( e, mouse_event );
}

NodeManipulator.prototype.onMouse = function( e, mouse_event )
{
	if(!this._root || !this._root.transform)
		return;
	
	//regular mouse dragging
	if(!mouse_event.dragging)
		return;

	var scene = this._root.scene;
	var camera = scene.getCamera();

	//yaw
	var up = this.use_global_up_for_yaw ? ONE.Components.Transform.UP : camera.getLocalVector( ONE.Components.Transform.UP );
	this._root.transform.rotateGlobal( mouse_event.deltax * this.rot_speed[0], up );

	//pitch
	var right = camera.getLocalVector( ONE.Components.Transform.RIGHT );
	this._root.transform.rotateGlobal( mouse_event.deltay * this.rot_speed[1], right );

	scene.requestFrame();
}

ONE.registerComponent( NodeManipulator );