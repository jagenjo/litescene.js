function CustomMaterial(o)
{
	this._uid = LS.generateUId();
	this._dirty = true;

	this.shader_name = "base";
	this.blend_mode = Blend.NORMAL;

	//this.shader_name = null; //default shader
	this.color = new Float32Array([1.0,1.0,1.0]);
	this.opacity = 1.0;
	this.vs_code = "";
	this.code = "vec4 surf() {\n\treturn u_material_color * vec4(1.0,0.0,0.0,1.0);\n}\n";

	this._uniforms = {};
	this._macros = {};

	this.textures = {};
	this.uvs_matrix = new Float32Array([1,0,0, 0,1,0, 0,0,1]);

	if(o) 
		this.configure(o);
	this.computeCode();
}

CustomMaterial.ps_shader_definitions = "\n\
";

CustomMaterial.icon = "mini-icon-material.png";

CustomMaterial.prototype.onCodeChange = function()
{
	this.computeCode();
}

CustomMaterial.prototype.computeCode = function()
{


	this._ps_uniforms_code = "";
	var lines = this.code.split("\n");
	for(var i in lines)
		lines[i] = lines[i].split("//")[0]; //remove comments
	this._ps_functions_code = lines.join("");
	this._ps_code = "vec4 result = surf(); color = result.xyz; alpha = result.a;";
}

// RENDERING METHODS
CustomMaterial.prototype.onModifyMacros = function(macros)
{
	if(macros.USE_PIXEL_SHADER_UNIFORMS)
		macros.USE_PIXEL_SHADER_UNIFORMS += this._ps_uniforms_code;
	else
		macros.USE_PIXEL_SHADER_UNIFORMS = this._ps_uniforms_code;

	if(macros.USE_PIXEL_SHADER_FUNCTIONS)
		macros.USE_PIXEL_SHADER_FUNCTIONS += this._ps_functions_code;
	else
		macros.USE_PIXEL_SHADER_FUNCTIONS = this._ps_functions_code;

	if(macros.USE_PIXEL_SHADER_CODE)
		macros.USE_PIXEL_SHADER_CODE += this._ps_code;
	else
		macros.USE_PIXEL_SHADER_CODE = this._ps_code;	
}

CustomMaterial.prototype.fillSurfaceShaderMacros = function(scene)
{
	var macros = {};
	this._macros = macros;
}


CustomMaterial.prototype.fillSurfaceUniforms = function( scene, options )
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

CustomMaterial.prototype.configure = function(o) { LS.cloneObject(o, this); },
CustomMaterial.prototype.serialize = function() { return LS.cloneObject(this); },


LS.extendClass( Material, CustomMaterial );
LS.registerMaterialClass(CustomMaterial);
LS.CustomMaterial = CustomMaterial;