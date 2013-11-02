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

	this._uniforms_code = Spherize._uniforms_code.replaceAll({"@": this._uid});
	this._code = Spherize._code.replaceAll({"@": this._uid});
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

Spherize._uniforms_code = "uniform vec3 u_spherize_center@; uniform float u_spherize_radius@; uniform float u_spherize_factor@;";
Spherize._code = "vec3 vn@ = normalize(vertex-u_spherize_center@); vertex = mix(vertex, vn@ * u_spherize_radius@, u_spherize_factor@); v_normal = (mix(v_normal, vn@, clamp(0.0,1.0,u_spherize_factor@)));";

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
	uniforms["u_spherize_center" + this._uid ] = this.center;
	uniforms["u_spherize_radius" + this._uid ] = this.radius;
	uniforms["u_spherize_factor" + this._uid ] = this.factor;
}


LS.registerComponent(Spherize);