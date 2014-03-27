//blending mode
var Blend = {
	NORMAL: "normal",
	ALPHA: "alpha",
	ADD: "add",
	MULTIPLY: "multiply",
	SCREEN: "screen",
	CUSTOM: "custom"
}

if(typeof(GL) == "undefined")
	throw("LiteSCENE requires to have litegl.js included before litescene.js");

BlendFunctions = {
	"normal": 	[GL.ONE, GL.ZERO],
	"alpha": 	[GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA],	
	"add": 		[GL.SRC_ALPHA, GL.DST_ALPHA],
	"multiply": [GL.DST_COLOR, GL.ONE_MINUS_SRC_ALPHA],
	"screen": 	[GL.SRC_ALPHA, GL.ONE],
	"custom": 	[GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA]
}

