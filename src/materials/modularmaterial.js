function ModularMaterial(o)
{
	this.modules = [];

	if(o) 
		this.configure(o);
}

ModularMaterial.prototype.configure = function(o)
{
}

ModularMaterial.prototype.serialize = function()
{
	return {};
}

ModularMaterial.prototype.getShader = function(shader_name, macros, options)
{

	return this.pass[ options.pass || "main" ].shader;
}

ModularMaterial.prototype.getMaterialShaderData = function(instance, node, scene, options)
{
	var uniforms = this._uniforms || {};
	if(!this._uniforms) this._uniforms = uniforms;

	for(var i in this.modules)
	{
		var m = this.modules[i];

	}
}

ModularMaterial.prototype.getLightShaderData = function(light, instance, node, scene, options)
{
}

//*********** MODULES ******************



