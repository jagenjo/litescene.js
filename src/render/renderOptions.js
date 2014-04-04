/** RenderOptions contains info about how to render the FULL scene (not just a render pass)
* It is used to store info about which passes should be applied, and what actions performed
* It could occasionally contain info about the current pass
* it should not be associated with an scene (the same RenderOptions could be used with different scenes)
* @class RenderOptions
* @constructor
**/

function RenderOptions(o)
{
	//this.renderer = null; //which renderer is in use

	//info
	this.main_camera = null; //this camera is the primary camera, some actions require to know the primary user point of view
	this.current_camera = null; //this camera is the one being rendered at this moment
	this.current_pass = null; //name of the current pass ("color","shadow","depth","picking")
	this.current_renderer = null; //current renderer being used

	//rendering properties
	this.ignore_viewports = false;
	this.ignore_clear = false;

	this.force_wireframe = false;	//render everything in wireframe
	this.shadows_disabled = false; //no shadows on the render
	this.lights_disabled = false; //flat lighting
	this.low_quality = false;	//try to use low quality shaders

	this.update_shadowmaps = true; //automatically update shadowmaps in every frame (enable if there are dynamic objects)
	this.update_materials = true; //update info in materials in every frame
	this.render_all_cameras = true; //render secundary cameras too
	this.render_fx = true; //postprocessing fx

	this.sort_instances_by_distance = true;
	this.sort_instances_by_priority = true;
	this.z_pass = false; //enable when the shaders are too complex (normalmaps, etc) to reduce work of the GPU (still some features missing)
	this.frustum_culling = true;

	//this should change one day...
	this.default_shader_id = "global";
	this.default_low_shader_id = "lowglobal";

	//copy
	if(o)
		for(var i in o)
			this[i] = o[i];
}