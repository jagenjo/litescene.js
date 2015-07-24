
function GlobalInfo(o)
{
	this.ambient_color = new Float32Array( GlobalInfo.DEFAULT_AMBIENT_COLOR );
	this.background_color = new Float32Array( GlobalInfo.DEFAULT_BACKGROUND_COLOR );
	this.textures = {};

	if(o)
		this.configure(o);
}

GlobalInfo.icon = "mini-icon-bg.png";
GlobalInfo.DEFAULT_BACKGROUND_COLOR = new Float32Array([0,0,0,1]);
GlobalInfo.DEFAULT_AMBIENT_COLOR = vec3.fromValues(0.2, 0.2, 0.2);

GlobalInfo.prototype.onAddedToScene = function(scene)
{
	scene.info = this;
}

GlobalInfo.prototype.onRemovedFromScene = function(scene)
{
	//scene.info = null;
}


GlobalInfo.prototype.getResources = function(res)
{
	for(var i in this.textures)
	{
		if(typeof(this.textures[i]) == "string")
			res[ this.textures[i] ] = GL.Texture;
	}
	return res;
}

GlobalInfo.prototype.onResourceRenamed = function (old_name, new_name, resource)
{
	for(var i in this.textures)
	{
		if(this.textures[i] == old_name)
			this.texture[i] = new_name;
	}
}


LS.registerComponent( GlobalInfo );
LS.GlobalInfo = GlobalInfo;