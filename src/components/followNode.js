///@INFO: UNCOMMON
/**
* FollowNode 
* @class FollowNode
* @constructor
* @param {String} object to configure from
*/

function FollowNode(o)
{
	this.enabled = true;
	this.node_id = "";
	this.align = false;
	this.fixed_y = false;
	this.follow_camera = false;
	if(o)
		this.configure(o);
}

FollowNode.icon = "mini-icon-follow.png";

FollowNode["@node_id"] = { type: LS.TYPES.SCENENODE_ID };

FollowNode.prototype.onAddedToScene = function(scene)
{
	LEvent.bind( scene,"beforeRender", this.updatePosition, this);
}

FollowNode.prototype.onRemovedFromScene = function(scene)
{
	LEvent.unbind(scene,"beforeRender", this.updatePosition, this);
}

FollowNode.prototype.updatePosition = function(e,info)
{
	if(!this._root || !this._root.transform || !this.enabled)
		return;

	var pos = null;
	var scene = this._root.scene;

	if( this.follow_camera )
	{
		var camera = LS.Renderer._main_camera; //main camera
		if(!camera)
			return;
		pos = camera.getEye();
	}
	else
	{
		var target_node = scene.getNode( this.node_id );
		if(!target_node || !target_node.transform)
			return;
		pos = target_node.transform.getGlobalPosition();
		if(this.align)
			this._root.transform.rotation = target_node.transform.getGlobalRotation();
	}

	if(this.fixed_y)
		pos[1] = this._root.transform._position[1];

	this._root.transform.position = pos;
}

LS.registerComponent( FollowNode );