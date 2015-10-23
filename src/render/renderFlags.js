
//NOT USED YET

function RenderFlags()
{
	this.two_sided = false;
	this.flip_normals = false;
	this.alpha_test = false;
	this.alpha_test_shadows = false;

	this.ignore_lights = false;
	this.ignore_ambient = false;

	this.seen_by_camera = true;
	this.seen_by_reflections = true;
	this.seen_by_picking = true;

	this.cast_shadows = true;
	this.receive_shadows = true;
}



LS.RenderFlags = RenderFlags;