function TerrainRenderer(o)
{
	this.height = 2;
	this.size = 10;

	this.subdivisions = 10;
	this.heightmap = null;
	this.auto_update = true;
	this._mesh = null;
	this.action = "Update"; //button
	if(o)
		this.configure(o);
}

TerrainRenderer.icon = "mini-icon-terrain.png";

TerrainRenderer.prototype.onAddedToNode = function(node)
{
	LEvent.bind(node, "collectRenderInstances", this.onCollectInstances, this);
}

TerrainRenderer.prototype.onRemovedFromNode = function(node)
{
	LEvent.unbind(node, "collectRenderInstances", this.onCollectInstances, this);
	if(this._root.mesh == this._mesh)
		delete this._root["mesh"];
}


/**
* Configure the component getting the info from the object
* @method configure
* @param {Object} object to configure from
*/

TerrainRenderer.prototype.configure = function(o)
{
	cloneObject(o, this);
}

/**
* Serialize this component)
* @method serialize
* @return {Object} object with the serialization info
*/

TerrainRenderer.prototype.serialize = function()
{
	 var o = cloneObject(this);
	 return o;
}

TerrainRenderer.prototype.getResources = function(res)
{
	if(this.heightmap)
		res[ this.heightmap ] = Texture;
}

TerrainRenderer["@subdivisions"] = { widget: "number", min:1,max:255,step:1 };
TerrainRenderer["@heightmap"] = { widget: "texture" };
TerrainRenderer["@action"] = { widget: "button", callback: function() { this.options.component.updateMesh(); }};

TerrainRenderer.prototype.updateMesh = function()
{
	trace("updating terrain mesh...");
	//check that we have all the data
	if(!this.heightmap) return;
	var heightmap = typeof(this.heightmap) == "string" ? ResourcesManager.textures[this.heightmap] : this.heightmap;
	if(!heightmap) return;
	var img = heightmap.img;
	if(!img) return;

	if(this.subdivisions > img.width)
		this.subdivisions = img.width;
	if(this.subdivisions > img.height)
		this.subdivisions = img.height;

	if(this.subdivisions > 255)	this.subdivisions = 255; //MAX because of indexed nature

	//optimize it
	var hsize = this.size * 0.5;
	var subdivisions = (this.subdivisions)<<0;
	var height = this.height;

	//get the pixels
	var canvas = createCanvas(subdivisions,subdivisions);
	var ctx = canvas.getContext("2d");
	ctx.drawImage(img,0,0,img.width,img.height,0,0,canvas.width, canvas.height);
	//$("body").append(canvas);

	var pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
	var data = pixels.data;

	//create the mesh
	var triangles = [];
	var vertices = [];
	var normals = [];
	var coords = [];

	var detailY = detailX = subdivisions-1;
	var h,lh,th,rh,bh = 0;

	var yScale = height;
	var xzScale = hsize / (subdivisions-1);

	for (var y = 0; y <= detailY; y++) 
	{
		var t = y / detailY;
		for (var x = 0; x <= detailX; x++) 
		{
			var s = x / detailX;

			h = data[y * subdivisions * 4 + x * 4] / 255; //red channel
			vertices.push(hsize*(2 * s - 1), h * height, hsize*(2 * t - 1));
			coords.push(s,1-t);

			if(x == 0 || y == 0 || x == detailX-1 || y == detailY-1)
				normals.push(0, 1, 0);
			else
			{
				var sX = (data[y * subdivisions * 4 + (x+1) * 4] / 255) - (data[y * subdivisions * 4 + (x-1) * 4] / 255);
				var sY = (data[(y+1) * subdivisions * 4 + x * 4] / 255) - (data[(y-1) * subdivisions * 4 + x * 4] / 255);
				var N = [-sX*yScale,2*xzScale,-sY*yScale];
				vec3.normalize(N,N);
				normals.push(N[0],N[1],N[2]);
			}

			//add triangle
			if (x < detailX && y < detailY)
			{
				var i = x + y * (detailX + 1);
				triangles.push(i+1, i, i + detailX + 1);
				triangles.push(i + 1, i + detailX + 1, i + detailX + 2);
			}
		}
	}

	var mesh = new GL.Mesh({vertices:vertices,normals:normals,coords:coords},{triangles:triangles});
	mesh.setBounding( [0,this.height*0.5,0], [hsize,this.height*0.5,hsize] );
	this._mesh = mesh;
	this._info = [ this.heightmap, this.size, this.height, this.subdivisions, this.smooth ];
}

TerrainRenderer.PLANE = null;

TerrainRenderer.prototype.onCollectInstances = function(e, instances)
{
	if(!this._mesh && this.heightmap)
		this.updateMesh();

	if(this.auto_update && this._info)
	{
		if( this._info[0] != this.heightmap || this._info[1] != this.size || this._info[2] != this.height || this._info[3] != this.subdivisions || this._info[4] != this.smooth )
			this.updateMesh();
	}

	var RI = this._render_instance;
	if(!RI)
		this._render_instance = RI = new RenderInstance(this._root, this);

	if(!this._mesh)
	{
		if(!TerrainRenderer.PLANE)
			TerrainRenderer.PLANE = GL.Mesh.plane({xz:true,normals:true,coords:true});	
		RI.mesh = TerrainRenderer.PLANE;
		return RI;
	};

	RI.material = this._root.getMaterial();
	RI.mesh = this._mesh;
	this._root.mesh = this._mesh;
	this._root.transform.getGlobalMatrix( RI.matrix );
	mat4.multiplyVec3(RI.center, RI.matrix, vec3.create());

	RI.flags = RI_DEFAULT_FLAGS;
	RI.applyNodeFlags();
	
	instances.push(RI);
}

LS.registerComponent(TerrainRenderer);
