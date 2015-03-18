/**
* GeometricPrimitive renders a primitive
* @class GeometricPrimitive
* @constructor
* @param {String} object to configure from
*/

function GeometricPrimitive(o)
{
	this.size = 10;
	this.subdivisions = 10;
	this.geometry = GeometricPrimitive.CUBE;
	this.primitive = null;
	this.align_z = false;

	if(o)
		this.configure(o);
}

GeometricPrimitive.CUBE = 1;
GeometricPrimitive.PLANE = 2;
GeometricPrimitive.CYLINDER = 3;
GeometricPrimitive.SPHERE = 4;
GeometricPrimitive.CIRCLE = 5;
GeometricPrimitive.HEMISPHERE = 6;
GeometricPrimitive.ICOSAHEDRON = 7;

GeometricPrimitive.icon = "mini-icon-cube.png";
GeometricPrimitive["@geometry"] = { type:"enum", values: {"Cube":GeometricPrimitive.CUBE, "Plane": GeometricPrimitive.PLANE, "Cylinder":GeometricPrimitive.CYLINDER, "Sphere":GeometricPrimitive.SPHERE, "Icosahedron":GeometricPrimitive.ICOSAHEDRON, "Circle":GeometricPrimitive.CIRCLE, "Hemisphere":GeometricPrimitive.HEMISPHERE  }};
GeometricPrimitive["@primitive"] = {widget:"combo", values: {"Default":null, "Points": 0, "Lines":1, "Triangles":4, "Wireframe":10 }};
GeometricPrimitive["@subdivisions"] = { type:"number", step:1, min:0 };

GeometricPrimitive.prototype.onAddedToNode = function(node)
{
	LEvent.bind(node, "collectRenderInstances", this.onCollectInstances, this);
}

GeometricPrimitive.prototype.onRemovedFromNode = function(node)
{
	LEvent.unbind(node, "collectRenderInstances", this.onCollectInstances, this);
}

GeometricPrimitive.prototype.updateMesh = function()
{
	var subdivisions = Math.max(0,this.subdivisions|0);

	var key = "" + this.geometry + "|" + this.size + "|" + subdivisions + "|" + this.align_z;

	switch (this.geometry)
	{
		case GeometricPrimitive.CUBE: 
			this._mesh = GL.Mesh.cube({size: this.size, normals:true,coords:true});
			break;
		case GeometricPrimitive.PLANE:
			this._mesh = GL.Mesh.plane({size: this.size, detail: subdivisions, xz: this.align_z, normals:true,coords:true});
			break;
		case GeometricPrimitive.CYLINDER:
			this._mesh = GL.Mesh.cylinder({size: this.size, subdivisions: subdivisions, normals:true,coords:true});
			break;
		case GeometricPrimitive.SPHERE:
			this._mesh = GL.Mesh.sphere({size: this.size, "long":subdivisions, lat: subdivisions, normals:true,coords:true});
			break;
		case GeometricPrimitive.CIRCLE:
			this._mesh = GL.Mesh.circle({size: this.size, slices:subdivisions, xz: this.align_z, normals:true, coords:true});
			break;
		case GeometricPrimitive.HEMISPHERE:
			this._mesh = GL.Mesh.sphere({size: this.size, slices:subdivisions, xz: this.align_z, normals:true, coords:true, hemi: true});
			break;
		case GeometricPrimitive.ICOSAHEDRON:
			this._mesh = GL.Mesh.icosahedron({size: this.size, subdivisions:subdivisions });
			break;
	}
	this._key = key;
}

//GeometricPrimitive.prototype.getRenderInstance = function()
GeometricPrimitive.prototype.onCollectInstances = function(e, instances)
{
	//if(this.size == 0) return;
	var mesh = null;
	if(!this._root) return;

	var subdivisions = Math.max(0,this.subdivisions|0);
	var key = "" + this.geometry + "|" + this.size + "|" + subdivisions + "|" + this.align_z;

	if(!this._mesh || this._key != key)
		this.updateMesh();

	var RI = this._render_instance;
	if(!RI)
		this._render_instance = RI = new RenderInstance(this._root, this);

	this._root.transform.getGlobalMatrix(RI.matrix);
	mat4.multiplyVec3(RI.center, RI.matrix, vec3.create());
	RI.setMesh( this._mesh, this.primitive );
	this._root.mesh = this._mesh;
	
	RI.flags = RI_DEFAULT_FLAGS | RI_RAYCAST_ENABLED;
	RI.applyNodeFlags();
	RI.setMaterial( this.material || this._root.getMaterial() );

	instances.push(RI);
}

LS.registerComponent(GeometricPrimitive);
