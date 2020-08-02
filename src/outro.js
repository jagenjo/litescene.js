///@INFO: BASE
//here goes the ending of commonjs stuff

//create Global Scene
var Scene = ONE.GlobalScene = new ONE.Scene();

ONE.newMeshNode = function(id,mesh_name)
{
	var node = new ONE.SceneNode(id);
	node.addComponent( new ONE.Components.MeshRenderer() );
	node.setMesh(mesh_name);
	return node;
}

ONE.newLightNode = function(id)
{
	var node = new ONE.SceneNode(id);
	node.addComponent( new ONE.Components.Light() );
	return node;
}

ONE.newCameraNode = function(id)
{
	var node = new ONE.SceneNode(id);
	node.addComponent( new ONE.Components.Camera() );
	return node;
}

global.ONE = ONE;
global.LS = ONE; //Legacy

//*******************************/
})( typeof(window) != "undefined" ? window : self ); //TODO: add support for commonjs