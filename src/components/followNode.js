/**
* FollowNode 
* @class FollowNode
* @constructor
* @param {String} object to configure from
*/

function FollowNode(o)
{
	this.node_name = "";
	this.fixed_y = false;
	this.follow_camera = false;
	if(o)
		this.configure(o);
}

FollowNode.icon = "mini-icon-follow.png";

FollowNode.prototype.onAddedToNode = function(node)
{
	LEvent.bind(node,"computeVisibility", this.updatePosition, this);
}

FollowNode.prototype.onRemovedFromNode = function(node)
{
	LEvent.unbind(node,"computeVisibility", this.updatePosition, this);
}

FollowNode.prototype.updatePosition = function(e,info)
{
	if(!this._root) return;

	var pos = null;
	var scene = this._root.scene;
	var camera = scene.getCamera(); //main camera

	if(this.follow_camera)
		pos =  camera.getEye();
	else
	{
		var target_node = scene.getNode( this.node_name );
		if(!target_node) return;
		pos = target_node.transform.getPosition();
	}

	if(this.fixed_y)
		pos[1] = this._root.transform._position[1];
	this._root.transform.setPosition( pos );
}

LS.registerComponent( FollowNode );