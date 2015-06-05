/**
* Spherize deforms a mesh, it is an example of a component that modifies the meshes being rendered
* @class Spherize
* @constructor
* @param {String} object to configure from
*/

function Spherize(o)
{
	this.enabled = true;
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
Spherize["@center"] = { type: "position", step: 0.001 };

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
Spherize._code = "\
	vec3 off@ = vertex4.xyz - u_spherize_center@;\
    float dist@ = length(off@);\
	vec3 vn@ = off@ / dist@;\
	float factor@ = max(0.0, u_spherize_factor@ / dist@ );\
	vertex4.xyz = mix(vertex4.xyz, vn@ * u_spherize_radius@, factor@);\
	v_normal = (mix(v_normal, vn@, clamp(0.0,1.0,factor@)));\
";

Spherize.prototype.onMacros = function(e, macros)
{
	if(!this.enabled)
		return;

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
	if(!this.enabled)
		return;

	uniforms["u_spherize_center" + this._num_id ] = this.center;
	uniforms["u_spherize_radius" + this._num_id ] = this.radius;
	uniforms["u_spherize_factor" + this._num_id ] = this.factor;
}

Spherize.prototype.renderEditor = function(node_selected, component_selected)
{
	if(!this.enabled)
		return;

	//if node is selected, render frustrum
	if (node_selected && this.enabled)
	{
		Draw.setPointSize(6);
		Draw.setColor([0.33,0.874,0.56, component_selected ? 0.8 : 0.5 ]);
		var pos = vec3.clone(this.center);
		if(this._root && this._root.transform)
			vec3.transformMat4( pos, pos, this._root.transform._global_matrix );
		Draw.renderRoundPoints( pos );
	}
}

//Mostly used for gizmos
Spherize.prototype.getTransformMatrix = function( element )
{
	if( !this._root || !this._root.transform )
		return null; //use the node transform

	var p = null;
	if (element == "center")
		p = this.center;
	else
		return false;

	var T = mat4.clone( this._root.transform._global_matrix );
	mat4.translate( T, T, p );
	return T;
}

Spherize.prototype.renderPicking = function(ray)
{
	var pos = vec3.clone(this.center);
	if(this._root && this._root.transform)
		vec3.transformMat4( pos, pos, this._root.transform._global_matrix );
	EditorView.addPickingPoint( pos, 4, { instance: this, info: "center" } );
}

Spherize.prototype.applyTransformMatrix = function( matrix, center, element )
{
	if( !this._root || !this._root.transform )
		return false; //ignore transform

	if (element != "center")
		return false;

	var p = this.center;
	mat4.multiplyVec3( p, matrix, p );
	return true;
}

LS.registerComponent( Spherize );