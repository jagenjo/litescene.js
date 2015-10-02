//blending mode
var Blend = {
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

LS.BlendFunctions = {
	"normal": 	[GL.ONE, GL.ZERO],
	"alpha": 	[GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA],	
	"add": 		[GL.SRC_ALPHA, GL.ONE],
	"multiply": [GL.DST_COLOR, GL.ONE_MINUS_SRC_ALPHA],
	"screen": 	[GL.SRC_ALPHA, GL.ONE],
	"custom": 	[GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA]
}

//used to know the state of the application
LS.STOPPED = 0;
LS.RUNNING = 1;
LS.PAUSED = 2;
