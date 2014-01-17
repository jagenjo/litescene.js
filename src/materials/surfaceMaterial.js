function SurfaceMaterial(o)
{
	this._uid = LS.generateUId();
	this._dirty = true;

	this.shader_name = "surface";

	//this.shader_name = null; //default shader
	this.color = new Float32Array([1.0,1.0,1.0]);
	this.opacity = 1.0;
	this.blending = Material.NORMAL;

	this.vs_code = "";
	this.code = "void surf(in Input IN, inout SurfaceOutput o) {\n\
	o.Albedo = vec3(1.0,0.5,0.1);\n\
	o.Normal = IN.worldNormal;\n\
	o.Emission = vec3(0.0);\n\
	o.Specular = 2.0;\n\
	o.Gloss = 10.0;\n\
	o.Reflectivity = 0.5;\n\
	o.Alpha = 1.0;\n}\n";

	this._uniforms = {};
	this._macros = {};

	this.textures = {};

	if(o) 
		this.configure(o);
	this.computeCode();
}

SurfaceMaterial.icon = "mini-icon-material.png";

SurfaceMaterial.prototype.onCodeChange = function()
{
	this.computeCode();
}

SurfaceMaterial.prototype.computeCode = function()
{
	var lines = this.code.split("\n");
	for(var i in lines)
		lines[i] = lines[i].split("//")[0]; //remove comments
	this._surf_code = lines.join("");
}

// RENDERING METHODS
SurfaceMaterial.prototype.onModifyMacros = function(macros)
{
	if(this._ps_uniforms_code)
	{
		if(macros.USE_PIXEL_SHADER_UNIFORMS)
			macros.USE_PIXEL_SHADER_UNIFORMS += this._ps_uniforms_code;
		else
			macros.USE_PIXEL_SHADER_UNIFORMS = this._ps_uniforms_code;
	}

	if(this._ps_functions_code)
	{
		if(macros.USE_PIXEL_SHADER_FUNCTIONS)
			macros.USE_PIXEL_SHADER_FUNCTIONS += this._ps_functions_code;
		else
			macros.USE_PIXEL_SHADER_FUNCTIONS = this._ps_functions_code;
	}

	if(this._ps_code)
	{
		if(macros.USE_PIXEL_SHADER_CODE)
			macros.USE_PIXEL_SHADER_CODE += this._ps_code;
		else
			macros.USE_PIXEL_SHADER_CODE = this._ps_code;	
	}

	macros.USE_SURF = this._surf_code;
}

SurfaceMaterial.prototype.fillSurfaceShaderMacros = function(scene)
{
	var macros = {};
	this._macros = macros;
}


SurfaceMaterial.prototype.fillSurfaceUniforms = function( scene, options )
{
	var samplers = [];
	for(var i in this.textures) 
	{
		var texture = this.getTexture(i);
		if(!texture) continue;
		samplers.push([i + (texture.texture_type == gl.TEXTURE_2D ? "_texture" : "_cubemap") , texture]);
	}

	this._uniforms.u_material_color = new Float32Array([this.color[0], this.color[1], this.color[2], this.opacity]);
	this._samplers = samplers;
}

SurfaceMaterial.prototype.configure = function(o) { LS.cloneObject(o, this); },

LS.extendClass( Material, SurfaceMaterial );
LS.registerMaterialClass(SurfaceMaterial);
LS.SurfaceMaterial = SurfaceMaterial;