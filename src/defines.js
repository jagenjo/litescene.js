///@INFO: BASE
if(typeof(GL) == "undefined")
	throw("LiteSCENE requires to have litegl.js included before litescene.js");

//blending mode
var Blend = {
	AUTOMATIC: 1,
	NORMAL: 2,
	ALPHA: 3,
	ADD: 4,
	MULTIPLY: 5,
	SCREEN: 6,
	CUSTOM: 7
}

LS.Blend = Blend;

LS.BlendFunctions = {};

LS.BlendFunctions[ Blend.AUTOMATIC ] = [GL.ONE, GL.ZERO];
LS.BlendFunctions[ Blend.NORMAL ] = [GL.ONE, GL.ZERO];
LS.BlendFunctions[ Blend.ALPHA ] = [GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA];
LS.BlendFunctions[ Blend.ADD ] = [GL.SRC_ALPHA, GL.ONE];
LS.BlendFunctions[ Blend.MULTIPLY ] = [GL.DST_COLOR, GL.ONE_MINUS_SRC_ALPHA];
LS.BlendFunctions[ Blend.SCREEN ] =	[GL.SRC_ALPHA, GL.ONE];
LS.BlendFunctions[ Blend.CUSTOM ] =	[GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA];

//Used for interpolation and splines
LS.NONE = 0;
LS.LINEAR = 1;
LS.TRIGONOMETRIC = 2;
LS.CUBIC = 3;
LS.SPLINE = 4;
LS.BEZIER = 5;
LS.HERMITE = 6;

//used to know the state of the application
LS.STOPPED = 0;
LS.PLAYING = 1; 
LS.PAUSED = 2;
LS.LOADING = 3;

LS.RUNNING = 1; //LEGACY

//helpful consts
LS.ZEROS = vec3.create();
LS.ZEROS4 = vec4.create();
LS.ONES = vec3.fromValues(1,1,1);
LS.TOP = vec3.fromValues(0,1,0);
LS.BOTTOM = vec3.fromValues(0,-1,0);
LS.RIGHT = vec3.fromValues(1,0,0);
LS.LEFT = vec3.fromValues(-1,0,0);
LS.FRONT = vec3.fromValues(0,0,-1);
LS.BACK = vec3.fromValues(0,0,1);
LS.IDENTITY = mat4.create();
LS.QUAT_IDENTITY = quat.create();
LS.WHITE = LS.ONES;
LS.BLACK = LS.ZEROS;

LS.POSX = 1;
LS.POSY = 2;
LS.POSZ = 3;
LS.NEGX = 4;
LS.NEGY = 5;
LS.NEGZ = 6;

//types
LS.TYPES = {
	BOOLEAN: "boolean",
	NUMBER : "number",
	STRING : "string",
	VEC2 : "vec2",
	VEC3 : "vec3",
	VEC4 : "vec4",
	COLOR : "color",
	COLOR4 : "color4",
	EVENT : "event",
	RESOURCE: "resource",
	TEXTURE : "texture",
	MESH: "mesh",
	OBJECT: "object",
	SCENE: "scene",
	NODE: "node",
	SCENENODE: "node",
	SCENENODE_ID: "node_id",
	COMPONENT: "component",
	COMPONENT_ID: "component_id",
	MATERIAL: "material",
	ANIMATION: "animation",
	ARRAY: "array",
	QUAT : "quat",
	TRANS10 : "trans10",
	POSITION : "position"
};

LS.TYPES_INDEX = {};
var index = 0;
for(var i in LS.TYPES)
	LS.TYPES_INDEX[ LS.TYPES[i] ] = index++;

LS.RESOURCE_TYPES = {};
LS.RESOURCE_TYPES[ LS.TYPES.RESOURCE ] = true;
LS.RESOURCE_TYPES[ LS.TYPES.TEXTURE ] = true;
LS.RESOURCE_TYPES[ LS.TYPES.MESH ] = true;
LS.RESOURCE_TYPES[ LS.TYPES.ANIMATION ] = true;
//audio and video?


//Events
var EVENT = LS.EVENT = {};

/**
* A Ray that contains an origin and a direction (it uses the Ray class from litegl, so to check documentation go to litegl doc
* @class Ray
* @namespace LS
* @constructor
* @param {vec3} origin
* @param {vec3} direction
*/
LS.Ray = GL.Ray;
