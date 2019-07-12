///@INFO: GRAPHS
//This is a Work In Progress concept to create Configurable Rendering Pipelines
/*
if(typeof(LiteGraph) != "undefined")
{

//Triggers the start of a render
function LGRenderTrigger()
{
	this.addOutput("start",LiteGraph.EVENT);
	this.addOutput("camera","camera");
	this.addOutput("viewport_size","vec2");
}

LGRenderTrigger.title = "Render Trigger";
LiteGraph.registerNodeType("pipeline/trigger", LGRenderTrigger );


//Contains a rendering context
function LGRenderFrameContext()
{
	//properties: format, type
	this.addInput("in", LiteGraph.ACTION);
	this.addOutput("out",LiteGraph.EVENT);

	this.addInput("size","vec2");
	this.addOutput("size","vec2");

	this.addInput("color1","texture");
	this.addInput("color2","texture");
	this.addInput("color3","texture");
	this.addInput("color4","texture");
	this.addInput("depth","texture");

	this.addOutput("context","renderFrameContext");
	this.addOutput("color1","texture");
	this.addOutput("color2","texture");
	this.addOutput("color3","texture");
	this.addOutput("color4","texture");
	this.addOutput("depth","texture");

	this.average = vec3.create();
}

LGRenderFrameContext.prototype.onTrigger = function(event, params)
{

}

LGRenderFrameContext.title = "RenderFrameContext";
LiteGraph.registerNodeType("pipeline/frame_context", LGRenderFrameContext );


//Renders the view of a camera to the render frame context
function LGSceneRenderer()
{
	this.addInput("in", LiteGraph.ACTION);
	this.addInput("out", LiteGraph.EVENT);
	this.addInput("context", "renderFrameContext");

	this.addInput("camera", "camera");
	this.addInput("layers", "layers");
	this.addInput("material", "material");
}


LGSceneRenderer.title = "Scene Renderer";
LiteGraph.registerNodeType("pipeline/scene_renderer", LGSceneRenderer );



//for every pixel it fetches the irradiance from an Irradiance Cache
function LGApplyIrradiance()
{
	this.addInput("in", LiteGraph.ACTION);
	this.addInput("context", "renderFrameContext");
	this.addOutput("out", LiteGraph.EVENT );
}

LGApplyIrradiance.title = "Apply Irradiance";
LiteGraph.registerNodeType("pipeline/applyIrradiance", LGApplyIrradiance );


//fetches all lights visible
function LGDeferredRender()
{
	this.addInput("in", LiteGraph.ACTION);
	this.addInput("camera", LiteGraph.ACTION );
	this.addInput("diffuse", "texture");
	this.addInput("normals", "texture");
	this.addInput("mat_prop", "texture");
	this.addInput("depth", "texture");

	this.addOutput("out", LiteGraph.EVENT );
	this.addOutput("diffuse", "texture");

}

LGDeferredRender.title = "Deferred Renderer";
LiteGraph.registerNodeType("pipeline/deferred", LGDeferredRender );


}
*/