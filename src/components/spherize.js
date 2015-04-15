/**
* Spherize deforms a mesh, it is an example of a component that modifies the meshes being rendered
* @class Spherize
* @constructor
* @param {String} object to configure from
*/

function Spherize(o)
{
	this._num_id = LS._last_uid++;
	this.radius = 10;
	this.center = vec3.create();
	this.factor = 0.5;

	this._uniforms_code = Spherize._uniforms_code.replaceAll({"@": this._num_id});
	this._code = Spherize._code.replaceAll({"@": this._num_id});
	
	if(o)
		this.configure(o);
}

Spherize["@factor"] = { type: "number", step: 0.001 };

Spherize.icon = "mini-icon-circle.png";

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
Spherize._code = "vec3 vn@ = normalize(vertex4.xyz-u_spherize_center@); vertex4.xyz = mix(vertex4.xyz, vn@ * u_spherize_radius@, u_spherize_factor@); v_normal = (mix(v_normal, vn@, clamp(0.0,1.0,u_spherize_factor@)));";

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
	uniforms["u_spherize_center" + this._num_id ] = this.center;
	uniforms["u_spherize_radius" + this._num_id ] = this.radius;
	uniforms["u_spherize_factor" + this._num_id ] = this.factor;
}


LS.registerComponent(Spherize);