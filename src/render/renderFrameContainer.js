/*	RenderFrameContainer
	This class is used when you want to render one camera not to the screen but to some texture and apply postprocessing 
	Check the PostFX components to see it in action.
	There is not much in it, but it helps clearing up future features
*/

function RenderFrameContainer()
{
	this.camera = null;
}

RenderFrameContainer.prototype.onRender = function()
{
	//overwrite this function
}

LS.RenderFrameContainer = RenderFrameContainer;
