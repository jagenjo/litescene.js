/* WARNING: THIS FILE IS NOT IN USE, IT IS A WORK IN PROGRESS .... */

/* Generates RenderPass for a node according to the material an its context
   a RenderPass has:
	+ mesh
	+ primitive, start, offset
	+ render flags (blend, cullface, depth)
	+ shader
	+ uniforms: matrices included here
*/


/* Problems to solve 

	Elements affecting the render passes
	+ Material
	+ Near Lights
	+ Components (skinning?)
	+ Scene parameters (fog)

	Passes:
	+ ZPass
	+ Shadow maps
	+ Reflection passes (clip plane, etc)
	+ Light multipass
	+ Picking pass for mouse

	Who stores all those shaders? the material?
	What about all the different passes? 
	Who is in charge of setting up everything?

*/

function Renderer()
{
	this.default_shader = "globalshader";
}

/* produces render passes according to the context of the object */
Renderer.prototype.renderInstance = function(step, instance, lights, options)
{
	if(step == "shadow")
	{
		this.renderShadow(instance, options);
		return;
	}

	if(step == "object_id")
	{
		return;
	}

	if(step == "main")
	{
		Renderer.prototype.renderMain(instance, lights, options);
		return;
	}
}

Renderer.prototype.renderMain = function(step, instance, lights, options)
{
	var uniforms = {};
	var mesh = instance.mesh;

	//get material uniforms
	var material_uniforms = this.getMaterialShaderData( instance, instance.node, Scene, options );
	for(var im in material_uniforms)
		uniforms[im] = material_uniforms[im];

	//for every light
	for(var iL = 0, l = lights.length; iL < l; iL++)
	{
		var light = lights[i];

		var light_uniforms = this.getLightShaderData( light, instance, Scene, options );
		for(var il in light_uniforms)
			uniforms[il] = light_uniforms[il];

		var render_shader = null;
		if(instance.scene.overwrite_shader) render_shader = instance.scene.overwrite_shader;
		else if(instance.node.shader) render_shader = instance.node.shader; //node shader has priority over mat shader
		else if(instance.material.shader) render_shader = instance.material.shader;
		else render_shader = this.default_shader;

		var shader = null;

		//shader is an string: COMPILE
		if(render_shader.constructor == String) 
		{
			var macros = {};
			renderpass_info.macros = macros;

			//material & light macros
			if(material_uniforms.MACROS)
				for(var im in material_uniforms.MACROS)
					macros[im] = material_uniforms.MACROS[im];
			if(light_uniforms.MACROS)
				for(var im in light_uniforms.MACROS)
					macros[im] = light_uniforms.MACROS[im];

			//camera info
			if(this.active_camera.type == Camera.ORTHOGRAPHIC)
				macros.USE_ORTHOGRAPHIC_CAMERA = "";

			if(iL == 0) macros.FIRST_PASS = "";
			if(iL == (num_lights-1)) macros.LAST_PASS = "";

			if(node.flags.alpha_test == true)
				macros.USE_ALPHA_TEST = "0.5";

			if(options.clipping_plane)
				macros.USE_CLIPPING_PLANE = "";

			if(options.brightness_factor != 1)
				macros.USE_BRIGHTNESS_FACTOR = "";

			if(options.colorclip_factor > 0.0)
				macros.USE_COLORCLIP_FACTOR = "";

			//mesh information
			if(!("a_normal" in mesh.vertexBuffers))
				macros.NO_NORMALS = "";
			if(!("a_coord" in mesh.vertexBuffers))
				macros.NO_COORDS = "";
			if(("a_color" in mesh.vertexBuffers))
				macros.USE_COLOR_STREAM = "";
			if(("a_tangent" in mesh.vertexBuffers))
				macros.USE_TANGENT_STREAM = "";

			shader = Shaders.get(render_shader, macros );
		}
		else //const shader
		{
			shader = render_shader;
			renderpass_info.macros = null;
		}

		var shader = Shaders.get(render_shader, macros );
		this.doDrawCall(instance, shader);
	}
}

Renderer.prototype.renderShadow = function(instance, options)
{
	var node = instance.node;
	var mat = instance.material;

	if(node.flags.alpha_shadows == true && (mat.getTexture("color") || mat.getTexture("opacity")))
	{
		var macros = { USE_ALPHA_TEST: "0.5" };

		var color = mat.getTexture("color");
		if(color)
		{
			var color_uvs = mat.textures["color_uvs"] || Material.DEFAULT_UVS["color"] || "0";
			macros.USE_COLOR_TEXTURE = "uvs_" + color_uvs;
			color.bind(0);
		}

		var opacity = mat.getTexture("opacity");
		if(opacity)	{
			var opacity_uvs = mat.textures["opacity_uvs"] || Material.DEFAULT_UVS["opacity"] || "0";
			macros.USE_OPACITY_TEXTURE = "uvs_" + opacity_uvs;
			opacity.bind(1);
		}
		var shader = Shaders.get("depth",macros);
		shader.uniforms({u_mvp: RenderPipeline._mvp_matrix, u_material_color: [0,0,0, mat.alpha], texture: 0, opacity_texture: 1, u_texture_matrix: [mat.uvs_matrix[0],0,mat.uvs_matrix[2], 0,mat.uvs_matrix[1],mat.uvs_matrix[3], 0,0,1] });
	}
	else
	{
		var shader = Shaders.get("depth");
		shader.uniforms({u_mvp: RenderPipeline._mvp_matrix});
	}
	
	this.doDrawCall(instance, shader);
}

Renderer.prototype.doDrawCall = function(instance, shader)
{
	if(instance.submesh_id != null && instance.submesh_id != -1 && instance.mesh.info.groups && instance.mesh.info.groups.length > instance.submesh_id)
		shader.drawRange(instance.mesh, instance.primitive, instance.mesh.info.groups[instance.submesh_id].start, instance.mesh.info.groups[instance.submesh_id].length);
	else if(instance.start || instance.length)
		shader.drawRange(instance.mesh, instance.primitive, instance.start || 0, instance.length);
	else
		shader.draw(instance.mesh, instance.primitive);
}


// RENDERING METHODS
Renderer.prototype.getMaterialShaderData = function(instance, options)
{
	//compute the uniforms
	var uniforms = this._uniforms || {};
	if(!this._uniforms) this._uniforms = uniforms;

	var macros = {};
	var material = instance.material;
	var scene = instance.scene;

	//uniforms
	uniforms.u_material_color = [material.color[0], material.color[1], material.color[2], material.alpha];
	uniforms.u_ambient_color = node.flags.ignore_lights ? [1,1,1] : [scene.ambient_color[0] * material.ambient[0], scene.ambient_color[1] * material.ambient[1], scene.ambient_color[2] * material.ambient[2]];
	uniforms.u_diffuse_color = material.diffuse;
	uniforms.u_emissive_color = material.emissive || [0,0,0];
	uniforms.u_specular = [ material.specular_factor, material.specular_gloss ];
	uniforms.u_reflection_info = [ material.reflection_factor, material.reflection_fresnel ];
	uniforms.u_backlight_factor = material.backlight_factor;
	uniforms.u_normalmap_factor = material.normalmap_factor;
	uniforms.u_displacementmap_factor = material.displacementmap_factor;
	uniforms.u_velvet_info = [ material.velvet[0], material.velvet[1], material.velvet[2], (material.velvet_additive ? material.velvet_exp : -material.velvet_exp) ];
	uniforms.u_detail_info = material.detail;

	uniforms.u_texture_matrix = [material.uvs_matrix[0],0,material.uvs_matrix[2], 0,material.uvs_matrix[1],material.uvs_matrix[3], 0,0,1]; 

	//bind textures
	var last_slot = 0;
	for(var i in material.textures)
	{
		var texture = material.getTexture(i);
		if(!texture) continue;

		uniforms[ i + (texture.texture_type == gl.TEXTURE_2D ? "_texture" : "_cubemap") ] = texture.bind( last_slot );
		last_slot += 1;

		//special cases
		if(i == "environment")
		{
			if(material.reflection_factor <= 0) continue;

			if(texture.texture_type == gl.TEXTURE_2D)
			{
				var environment_uvs = material.textures.environment_uvs || Material.DEFAULT_UVS["environment"];
				if(!environment_uvs) environment_uvs = Material.COORDS_UV0;

				texture.setParameter( gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE ); //to avoid going up
				if(environment_uvs == Material.COORDS_POLAR_REFLECTED)
					texture.setParameter( gl.TEXTURE_MIN_FILTER, gl.LINEAR ); //avoid ugly error in atan2 edges
				else if(texture.has_mipmaps)
					texture.setParameter( gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR ); //avoid ugly error in atan2 edges
				macros.USE_ENVIRONMENT_TEXTURE = "uvs_" + environment_uvs;
				continue;
			}
		}
		else if(i == "normal")
		{
			var normal_uvs = material.textures.normal_uvs || Material.DEFAULT_UVS["normal"];
			if(material.normalmap_factor != 0.0 && (!material.normalmap_tangent || (material.normalmap_tangent && gl.derivatives_supported)) )
			{
				macros.USE_NORMAL_TEXTURE = "uvs_" + normal_uvs;
				if(material.normalmap_factor != 0.0)
					macros.USE_NORMALMAP_FACTOR = "";
				if(material.normalmap_tangent && gl.derivatives_supported)
					macros.USE_TANGENT_NORMALMAP = "";
			}
			continue;
		}
		else if(i == "displacement")
		{
			var displacement_uvs = material.textures.displacement_uvs || Material.DEFAULT_UVS["displacement"];
			if(material.displacementmap_factor != 0.0 && gl.derivatives_supported )
			{
				macros.USE_DISPLACEMENT_TEXTURE = "uvs_" + displacement_uvs;
				if(material.displacementmap_factor != 1.0)
					macros.USE_DISPLACEMENTMAP_FACTOR = "";
			}
			continue;
		}
		else if(i == "irradiance")
		{
			texture.setParameter( gl.TEXTURE_MIN_FILTER, gl.LINEAR );
			texture.setParameter( gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE );
			texture.setParameter( gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE );
			//texture.min_filter = gl.GL_LINEAR;
		}

		var texture_uvs = material.textures[i + "_uvs"] || Material.DEFAULT_UVS[i] || "0";
		macros[ "USE_" + i.toUpperCase() + (texture.texture_type == gl.TEXTURE_2D ? "_TEXTURE" : "_CUBEMAP") ] = "uvs_" + texture_uvs;
	}

	if(material.velvet && material.velvet_exp) //first light only
		macros.USE_VELVET = "";
	if(material.emissive_material)
		macros.USE_EMISSIVE_MATERIAL = "";
	if(material.specular_ontop)
		macros.USE_SPECULAR_ONTOP = "";
	if(material.specular_on_alpha)
		macros.USE_SPECULAR_ON_ALPHA = "";
	if(material.backlight_factor > 0.001)
		macros.USE_BACKLIGHT = "";

	//extra macros
	if(material.extra_macros)
		for(var im in material.extra_macros)
			macros[im] = material.extra_macros[im];

	uniforms["MACROS"] = macros;
	return uniforms;
}

Renderer.prototype.getLightShaderData = function(light, instance, scene, options)
{
	var uniforms = {};
	var node = instance.node;

	var light_projective_texture = light.projective_texture;
	if(light_projective_texture && light_projective_texture.constructor == String)
		light_projective_texture = ResourcesManager.textures[light_projective_texture];
	if(light_projective_texture)
		uniforms.light_texture = light_projective_texture.bind(11);
	var use_shadows = scene.settings.enable_shadows && light.cast_shadows && light._shadowMap && light._lightMatrix != null && !options.shadows_disabled;
	var shadowmap_size = use_shadows ? (light._shadowMap.width) : 1024;
	if(light.type == Light.DIRECTIONAL || light.type == Light.SPOT)
		uniforms.u_light_front = light.getFront();
	if(light.type == Light.SPOT)
		uniforms.u_light_angle = [ light.angle * DEG2RAD, light.angle_end * DEG2RAD, Math.cos( light.angle * DEG2RAD * 0.5 ), Math.cos( light.angle_end * DEG2RAD * 0.5 ) ];

	uniforms.u_light_pos = light.getPosition();
	uniforms.u_light_color = vec3.scale( vec3.create(), light.color, light.intensity );
	uniforms.u_light_att = [light.att_start,light.att_end];
	uniforms.u_light_offset = light.offset;

	if(light._lightMatrix)
		uniforms.u_lightMatrix = mat4.multiply( mat4.create(), light._lightMatrix, instance.matrix );

	//use shadows?
	if(use_shadows)
	{
		uniforms.u_shadow_params = [ 1.0 / light._shadowMap.width, light.shadow_bias ];
		uniforms.shadowMap = light._shadowMap.bind(10);
	}

	//macros
	var macros = {};

	//light macros
	if(light.use_diffuse && !this.constant_diffuse)
		macros.USE_DIFFUSE_LIGHT = "";
	if(light.use_specular && this.specular_factor > 0)
		macros.USE_SPECULAR_LIGHT = "";
	if(light.type == Light.DIRECTIONAL)
		macros.USE_DIRECTIONAL_LIGHT = "";
	else if(light.type == Light.SPOT)
		macros.USE_SPOT_LIGHT = "";
	if(light.spot_cone)
		macros.USE_SPOT_CONE = "";
	if(light.linear_attenuation)
		macros.USE_LINEAR_ATTENUATION = "";
	if(light.range_attenuation)
		macros.USE_RANGE_ATTENUATION = "";
	if(light_projective_texture)
		macros.USE_PROJECTIVE_LIGHT = "";

	if(vec3.squaredLength( light.color ) < 0.001 || node.flags.ignore_lights)
		macros.USE_AMBIENT_ONLY = "";

	if(light.offset > 0.001)
		macros.USE_LIGHT_OFFSET = "";

	if(use_shadows && node.flags.receive_shadows != false)
	{
		macros.USE_SHADOW_MAP = "";
		if(light.hard_shadows)
			macros.USE_HARD_SHADOWS = "";
		macros.SHADOWMAP_OFFSET = "";
	}

	uniforms["MACROS"] = macros;
	return uniforms;
}