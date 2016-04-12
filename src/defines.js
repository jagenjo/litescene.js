//blending mode
var Blend = {
	AUTOMATIC: "automatic",
	NORMAL: "normal",
	ALPHA: "alpha",
	ADD: "add",
	MULTIPLY: "multiply",
	SCREEN: "screen",
	CUSTOM: "custom"
}

LS.Blend = Blend;

if(typeof(GL) == "undefined")
	throw("LiteSCENE requires to have litegl.js included before litescene.js");

LS.BlendFunctions = {};

LS.BlendFunctions[ Blend.AUTOMATIC ] = [GL.ONE, GL.ZERO];
LS.BlendFunctions[ Blend.NORMAL ] = [GL.ONE, GL.ZERO];
LS.BlendFunctions[ Blend.ALPHA ] = [GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA];
LS.BlendFunctions[ Blend.ADD ] = [GL.SRC_ALPHA, GL.ONE];
LS.BlendFunctions[ Blend.MULTIPLY ] = [GL.DST_COLOR, GL.ONE_MINUS_SRC_ALPHA];
LS.BlendFunctions[ Blend.SCREEN ] =	[GL.SRC_ALPHA, GL.ONE];
LS.BlendFunctions[ Blend.CUSTOM ] =	[GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA];

//used to know the state of the application
LS.STOPPED = 0;
LS.RUNNING = 1;
LS.PAUSED = 2;
