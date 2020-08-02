//adds functionalities to walk around spaces
function PlayerController(o)
{
	this.yaw = 0;
	this.pitch = 0;
	this.velocity = vec2.create();

	this.camera_node = null;

	if(o)
		this.configure(o);
}

PlayerController["@camera_node"] = { type:"node" };

PlayerController.prototype.onAddedToScene = function(scene)
{
	LEvent.bind(scene,"update",this.onUpdate,this);
}

PlayerController.prototype.onRemovedFromScene = function(scene)
{
	LEvent.unbind(scene,"update",this.onUpdate,this);	
}

PlayerController.prototype.onUpdate = function(e,dt)
{
	console.log(this.camera_node);
}

ONE.registerComponent( PlayerController );