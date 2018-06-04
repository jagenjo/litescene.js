//Shadows are complex because there are too many combinations: SPOT/DIRECT,OMNI or DEPTH_COMPONENT,RGBA or HARD,SOFT,VARIANCE
//It would be nice to have classes that can encapsulate different shadowmap algorithms so they are easy to develop

//TODO: Move all the ShadowMaps code here
function HardShadowsContext()
{
	this.bias = 0;
	this.format = GL.DEPTH_COMPONENT;
	this.fbo = null;
	this.texture = null;
}

HardShadowsContext.prototype.enable = function()
{
	//enable FBO
}

HardShadowsContext.prototype.disable = function()
{
	//disable FBO apply postpo
}

HardShadowsContext.prototype.toViewport = function()
{
	//for debug
}

HardShadowsContext.prototype.enableFlag = function()
{
	//shadercode flags
}

/* shadowmaps shader example

float computeShadow( vec3 pos, vec3 N )
{
	//...
}

*/


