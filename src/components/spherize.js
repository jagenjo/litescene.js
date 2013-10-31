/**
* Spherize deforms a mesh, it is an example of a component that modifies the meshes being rendered
* @class Spherize
* @constructor
* @param {String} object to configure from
*/

function Spherize(o)
{
	if(!this._uid)
		this._uid = LS.generateUId();

	this.radius = 10;
	this.center = vec3.create();
	this.factor = 0.5;

	var replaces = {
		u_spherize_center: "u_spherize_center_" + this._uid,
		u_spherize_radius: "u_spherize_radius_" + this._uid,
		u_spherize_factor: "u_spherize_factor_" + this._uid
	};
		

	this._uniforms_code = Spherize._uniforms_code.replaceAll(replaces);
	this._code = Spherize._code.replaceAll(replaces);
}

Spherize["@factor"] = { type: "number", step: 0.001 };

Spherize.icon = "mini-icon-rotator.png";

Spherize.prototype.onAddedToNode = function(node)
{
	LEvent.bind(node,"computingShaderMacros",this.onMacros,this);
	LEvent.bind(node,"computingShaderUniforms",this.onUniforms,this);
}


Spherize.prototype.onRemoveFromNode = function(node)
{
	LEvent.unbindAll(node,this);
}

Spherize._uniforms_code = "uniform vec3 u_spherize_center; uniform float u_spherize_radius; uniform float u_spherize_factor;";
Spherize._code = "vertex = mix(vertex, normalize(vertex-u_spherize_center) * u_spherize_radius, u_spherize_factor);";

Spherize.prototype.onMacros = function(e, macros)
{
	if(macros.USE_VERTEX_SHADER_UNIFORMS)
		macros.USE_VERTEX_SHADER_UNIFORMS += this._uniforms_code;
	else
		macros.USE_VERTEX_SHADER_UNIFORMS = this._uniforms_code;

	if(macros.USE_VERTEX_SHADER_CODE)
		macros.USE_VERTEX_SHADER_CODE += this._code;
	else
		macros.USE_VERTEX_SHADER_CODE = this._code;
}

Spherize.prototype.onUniforms = function(e, uniforms)
{
	uniforms["u_spherize_center_" + this._uid ] = this.center;
	uniforms["u_spherize_radius_" + this._uid ] = this.radius;
	uniforms["u_spherize_factor_" + this._uid ] = this.factor;
}


LS.registerComponent(Spherize);