//WORK IN PROGRESS, NOT WORKING YET
function NavegationMesh( o )
{
	this._points = [];
	this._sectors = [];
	this.mesh = null;
	this._must_update_mesh = false;
	if(o)
		this.configure(o);

	this._current_mesh = null;
	this._current_triangle = null;
}

NavegationMesh["@mesh"] = { type: "mesh" };


NavegationMesh.prototype.adjustNode = function( node )
{
	//reproject old pos to current triangle

	//reproject new pos to current triangle plane

	//if outside of current triangle
		//find exit edge
		//if triangle in that edge
			//change current triangle
		//else
			//adjust to current triangle edge
}

NavegationMesh.prototype.renderEditor = function( camera )
{
	if(!this.enabled)
		return;

	//update mesh
	//render mesh
}

ONE.registerComponent( NavegationMesh );