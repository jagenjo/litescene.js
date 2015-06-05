/*
*  Components are elements that attach to Nodes or other objects to add functionality
*  Some important components are Transform, Light or Camera
*
*	*  ctor: must accept an optional parameter with the serialized data
*	*  onAddedToNode: triggered when added to node
*	*  onRemovedFromNode: triggered when removed from node
*	*  onAddedToScene: triggered when the node is added to the scene
*	*  onRemovedFromScene: triggered when the node is removed from the scene
*	*  serialize: returns a serialized version packed in an object
*	*  configure: recieves an object to unserialize and configure this instance
*	*  getResources: adds to the object the resources to load
*	*  _root contains the node where the component is added
*
*	*  use the LEvent system to hook events to the node or the scene
*	*  never share the same component instance between two nodes
*
*/

function Component(o)
{
	if(o)
		this.configure(o);
}

//default methods inserted in components that doesnt have a configure or serialize method
Component.prototype.configure = function(o)
{ 
	if(!o)
		return;
	if(o.uid) //special case, uid must never be enumerable to avoid showing it in the editor
	{
		if(!this.uid && !Object.hasOwnProperty(this, "uid"))
			Object.defineProperty(this, "uid", { value: o.uid, enumerable: false });
		else
			this.uid = o.uid;
	}
	LS.cloneObject(o, this); 
}

Component.prototype.serialize = function()
{
	var o = LS.cloneObject(this);
	if(this.uid) //special case, not enumerable
		o.uid = this.uid;
	return o;
}

LS.Component = Component;