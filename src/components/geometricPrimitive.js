/**
* GeometricPrimitive renders a primitive
* @class GeometricPrimitive
* @constructor
* @param {String} object to configure from
*/

function GeometricPrimitive(o)
{
	//this.size = 10;
	this.two_sided = false;
	this.geometry = GeometricPrimitive.CUBE;
	this.align_z = false;
	if(!GeometricPrimitive.MESHES)
		GeometricPrimitive.MESHES = {};

	if(o)
		this.configure(o);
}

GeometricPrimitive.CUBE = 1;
GeometricPrimitive.PLANE = 2;
GeometricPrimitive.CYLINDER = 3;
GeometricPrimitive.SPHERE = 4;

GeometricPrimitive.MESHES = null;

GeometricPrimitive.icon = "mini-icon-cube.png";
GeometricPrimitive["@geometry"] = { type:"enum", values: {"Cube":GeometricPrimitive.CUBE, "Plane": GeometricPrimitive.PLANE, "Cylinder":GeometricPrimitive.CYLINDER,  "Sphere":GeometricPrimitive.SPHERE }};

/**
* Configure the component getting the info from the object
* @method configure
* @param {Object} object to configure from
*/

GeometricPrimitive.prototype.configure = function(o)
{
	cloneObject(o, this);
}

/**
* Serialize this component)
* @method serialize
* @return {Object} object with the serialization info
*/

GeometricPrimitive.prototype.serialize = function()
{
	 var o = cloneObject(this);
	 return o;
}

GeometricPrimitive.prototype.getRenderInstance = function()
{
	//if(this.size == 0) return;
	var mesh = null;
	if(!this._root) return;

	if(this.geometry == GeometricPrimitive.CUBE)
	{
		if(!GeometricPrimitive.MESHES[GeometricPrimitive.CUBE])
			GeometricPrimitive.MESHES[GeometricPrimitive.CUBE] = GL.Mesh.cube({normals:true,coords:true});
		mesh = GeometricPrimitive.MESHES[GeometricPrimitive.CUBE];
	}
	else if(this.geometry == GeometricPrimitive.PLANE)
	{
		if(!GeometricPrimitive.MESHES[GeometricPrimitive.PLANE])
			GeometricPrimitive.MESHES[GeometricPrimitive.PLANE] = GL.Mesh.plane({xz:true,normals:true,coords:true});
		mesh = GeometricPrimitive.MESHES[GeometricPrimitive.PLANE];
	}
	else if(this.geometry == GeometricPrimitive.CYLINDER)
	{
		if(!GeometricPrimitive.MESHES[GeometricPrimitive.CYLINDER])
			GeometricPrimitive.MESHES[GeometricPrimitive.CYLINDER] = GL.Mesh.cylinder({normals:true,coords:true});
		mesh = GeometricPrimitive.MESHES[GeometricPrimitive.CYLINDER];
	}
	else if(this.geometry == GeometricPrimitive.SPHERE)
	{
		if(!GeometricPrimitive.MESHES[GeometricPrimitive.SPHERE])
			GeometricPrimitive.MESHES[GeometricPrimitive.SPHERE] = GL.Mesh.sphere({"long":32,"lat":32,normals:true,coords:true});
		mesh = GeometricPrimitive.MESHES[GeometricPrimitive.SPHERE];
	}
	else 
		return null;

	var RI = this._render_instance || new RenderInstance();

	this._root.transform.getGlobalMatrix(RI.matrix);

	if(this.align_z)
	{
		mat4.rotateX( RI.matrix, RI.matrix, Math.PI * -0.5 );
		//mat4.rotateZ( matrix, Math.PI );
	}
	//mat4.scale(matrix, [this.size,this.size,this.size]);
	mat4.multiplyVec3(RI.center, RI.matrix, vec3.create());

	this._root.mesh = mesh;

	RI.mesh = mesh;
	RI.material = this.material || this._root.getMaterial();
	if(this.two_sided)
		RI.enableFlag( RenderInstance.TWO_SIDED );
	return RI;
}

LS.registerComponent(GeometricPrimitive);
