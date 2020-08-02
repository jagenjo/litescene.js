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

ONE.Blend = Blend;

ONE.BlendFunctions = {};

ONE.BlendFunctions[ Blend.AUTOMATIC ] = [GL.ONE, GL.ZERO];
ONE.BlendFunctions[ Blend.NORMAL ] = [GL.ONE, GL.ZERO];
ONE.BlendFunctions[ Blend.ALPHA ] = [GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA];
ONE.BlendFunctions[ Blend.ADD ] = [GL.SRC_ALPHA, GL.ONE];
ONE.BlendFunctions[ Blend.MULTIPLY ] = [GL.DST_COLOR, GL.ONE_MINUS_SRC_ALPHA];
ONE.BlendFunctions[ Blend.SCREEN ] =	[GL.SRC_ALPHA, GL.ONE];
ONE.BlendFunctions[ Blend.CUSTOM ] =	[GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA];

//Used for interpolation and splines
ONE.NONE = 0;
ONE.LINEAR = 1;
ONE.TRIGONOMETRIC = 2;
ONE.CUBIC = 3;
ONE.SPLINE = 4;
ONE.BEZIER = 5;
ONE.HERMITE = 6;

//used to know the state of the application
ONE.STOPPED = 0;
ONE.PLAYING = 1; 
ONE.PAUSED = 2;
ONE.LOADING = 3;

ONE.RUNNING = 1; //LEGACY

//helpful consts
ONE.ZEROS = vec3.create();
ONE.ZEROS4 = vec4.create();
ONE.ONES = vec3.fromValues(1,1,1);
ONE.ONES4 = vec4.fromValues(1,1,1,1);
ONE.TOP = vec3.fromValues(0,1,0);
ONE.BOTTOM = vec3.fromValues(0,-1,0);
ONE.RIGHT = vec3.fromValues(1,0,0);
ONE.LEFT = vec3.fromValues(-1,0,0);
ONE.FRONT = vec3.fromValues(0,0,-1);
ONE.BACK = vec3.fromValues(0,0,1);
ONE.IDENTITY = mat4.create();
ONE.QUAT_IDENTITY = quat.create();
ONE.WHITE = ONE.ONES;
ONE.BLACK = ONE.ZEROS;

ONE.POSX = 1;
ONE.POSY = 2;
ONE.POSZ = 3;
ONE.NEGX = 4;
ONE.NEGY = 5;
ONE.NEGZ = 6;

//types
ONE.TYPES = {
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

ONE.TYPES_INDEX = {};
var index = 0;
for(var i in ONE.TYPES)
{
	ONE.TYPES_INDEX[ ONE.TYPES[i] ] = index;
	ONE.TYPES_INDEX[ ONE.TYPES[i].toUpperCase() ] = index;
	index++
}

ONE.RESOURCE_TYPES = {};
ONE.RESOURCE_TYPES[ ONE.TYPES.RESOURCE ] = true;
ONE.RESOURCE_TYPES[ ONE.TYPES.TEXTURE ] = true;
ONE.RESOURCE_TYPES[ ONE.TYPES.MESH ] = true;
ONE.RESOURCE_TYPES[ ONE.TYPES.ANIMATION ] = true;
//audio and video?


//Events
var EVENT = ONE.EVENT = {};
//events are defined in the file that triggers them:
//- renderer.js: render related events (RENDER_INSTANCES,etc)
//- scene.js: scene related (INIT,START,UPDATE)
//- input.js: player related (MOUSEDOWN,KEYDOWN)


/**
* A Ray that contains an origin and a direction (it uses the Ray class from litegl, so to check documentation go to litegl doc
* @class Ray
* @namespace LS
* @constructor
* @param {vec3} origin
* @param {vec3} direction
*/
ONE.Ray = GL.Ray;
