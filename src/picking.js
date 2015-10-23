//
/**
* Picking is used to detect which element is below one pixel (used the GPU) or using raycast
*
* @class Picking
* @namespace LS
* @constructor
*/
var Picking = {

	/**
	* Renders the pixel and retrieves the color to detect which object it was, slow but accurate
	* @method getNodeAtCanvasPosition
	* @param {number} x in canvas coordinates
	* @param {number} y in canvas coordinates
	* @param {Camera} camera default is all cameras
	* @param {number} layers default is 0xFFFF which is all
	* @param {SceneTree} scene default is GlobalScene
	*/
	getNodeAtCanvasPosition: function( x, y, camera, layers, scene )
	{
		var instance = this.getInstanceAtCanvasPosition( x, y, camera, layers, scene );
		if(!instance)
			return null;

		if(instance.constructor == LS.SceneNode)
			return instance;

		if(instance._root && instance._root.constructor == LS.SceneNode)
			return instance._root;

		if(instance.node)
			return instance.node;

		return null;
	},

	/**
	* Returns the instance under a screen position
	* @method getInstanceAtCanvasPosition
	* @param {number} x in canvas coordinates
	* @param {number} y in canvas coordinates
	* @param {Camera} camera
	* @param {number} layers default is 0xFFFF which is all
	* @param {SceneTree} scene
	* @return {Object} the info supplied by the picker (usually a SceneNode)
	*/
	getInstanceAtCanvasPosition: function( x, y, camera, layers, scene )
	{
		scene = scene || LS.GlobalScene;

		if(!camera)
			camera = LS.Renderer.getCameraAtPosition( x, y, scene._cameras );

		if(!camera)
			return null;

		this._picking_nodes = {};

		//render all Render Instances
		this.renderPickingBuffer( scene, camera, x,y, layers );

		this._picking_color[3] = 0; //remove alpha, because alpha is always 255
		var id = new Uint32Array(this._picking_color.buffer)[0]; //get only element

		var instance_info = this._picking_nodes[id];
		this._picking_nodes = {};
		return instance_info;
	},	

	/**
	* Cast a ray that traverses the scene checking for collisions with RenderInstances
	* Similar to Physics.raycast but using only the bounding boxes of the visible meshes
	* @method raycast
	* @param {vec3} origin in world space
	* @param {vec3} direction in world space
	* @param {number} max_dist maxium distance
	* @param {SceneTree} scene
	* @return {Array} array containing all the RenderInstances that collided with the ray in the form [SceneNode, RenderInstance, collision point, distance]
	*/
	raycast: function( origin, direction, max_dist, layers, scene )
	{
		max_dist = max_dist || Number.MAX_VALUE;
		if(layers === undefined)
			layers = 0xFFFF;
		scene = scene || LS.GlobalScene;

		var instances = scene._instances;
		if(!instances || !instances.length)
			return null;

		var collisions = [];

		var local_start = vec3.create();
		var local_direction = vec3.create();

		//for every instance
		for(var i = 0; i < instances.length; ++i)
		{
			var instance = instances[i];

			if(!(instance.flags & RI_RAYCAST_ENABLED) || (layers & instance.layers) === 0 )
				continue;

			if(instance.flags & RI_BLEND)
				continue; //avoid semitransparent

			//test against AABB
			var collision_point = vec3.create();
			if( !geo.testRayBBox( origin, direction, instance.aabb, null, collision_point, max_dist) )
				continue;

			var model = instance.matrix;

			//ray to local
			var inv = mat4.invert( mat4.create(), model );
			mat4.multiplyVec3( local_start, inv, origin );
			mat4.rotateVec3( local_direction, inv, direction );

			//test against OOBB (a little bit more expensive)
			if( !geo.testRayBBox(local_start, local_direction, instance.oobb, null, collision_point, max_dist) )
				continue;

			//test against mesh
			if( instance.collision_mesh )
			{
				var mesh = instance.collision_mesh;
				var octree = mesh.octree;
				if(!octree)
					octree = mesh.octree = new Octree( mesh );
				var hit = octree.testRay( local_start, local_direction, 0.0, max_dist );
				if(!hit)
					continue;
				mat4.multiplyVec3(collision_point, model, hit.pos);
			}
			else
				vec3.transformMat4(collision_point, collision_point, model);

			var distance = vec3.distance( origin, collision_point );
			if(distance < max_dist)
				collisions.push( new LS.Collision( instance.node, instance, collision_point, distance ) );
		}

		collisions.sort( Collision.isCloser );
		return collisions;
	},

	/**
	* Returns a color you should use to paint this node during picking rendering
	* you tell what info you want to retrieve associated with this object if it is clicked
	* @method getNextPickingColor
	* @param {*} info
	* @return {vec3} array containing all the RenderInstances that collided with the ray
	*/
	getNextPickingColor: function( info )
	{
		this._picking_next_color_id += 10;
		var pick_color = new Uint32Array(1); //store four bytes number
		pick_color[0] = this._picking_next_color_id; //with the picking color for this object
		var byte_pick_color = new Uint8Array( pick_color.buffer ); //read is as bytes
		//byte_pick_color[3] = 255; //Set the alpha to 1

		this._picking_nodes[ this._picking_next_color_id ] = info;
		return vec4.fromValues( byte_pick_color[0] / 255, byte_pick_color[1] / 255, byte_pick_color[2] / 255, 1 );
	},

	//picking
	_pickingMap: null,
	_picking_color: new Uint8Array(4),
	_picking_depth: 0,
	_picking_next_color_id: 0,
	_picking_nodes: {},
	_picking_render_options: new RenderOptions({is_picking: true}),

	renderPickingBuffer: function( scene, camera, x, y, layers )
	{
		var that = this;
		if(layers === undefined)
			layers = 0xFFFF;

		if(this._pickingMap == null || this._pickingMap.width != gl.canvas.width || this._pickingMap.height != gl.canvas.height )
		{
			this._pickingMap = new GL.Texture( gl.canvas.width, gl.canvas.height, { format: gl.RGBA, filter: gl.NEAREST });
			//LS.ResourcesManager.textures[":picking"] = this._pickingMap; //debug
		}

		//y = gl.canvas.height - y; //reverse Y
		var small_area = true;
		this._picking_next_color_id = 0;

		this._current_target = this._pickingMap;

		this._pickingMap.drawTo(function() {
			//var viewport = camera.getLocalViewport();
			//camera._real_aspect = viewport[2] / viewport[3];
			//gl.viewport( viewport[0], viewport[1], viewport[2], viewport[3] );

			LS.Renderer.enableCamera( camera, that._picking_render_options );

			if(small_area)
			{
				gl.scissor(x-1,y-1,2,2);
				gl.enable(gl.SCISSOR_TEST);
			}

			gl.clearColor(0,0,0,0);
			gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

			//gl.viewport(x-20,y-20,40,40);
			that._picking_render_options.current_pass = "picking";
			that._picking_render_options.layers = layers;

			//check instances colliding with cursor using a ray against AABBs
			//TODO

			LS.Renderer.renderInstances( that._picking_render_options )//, cursor_instances );
			//gl.scissor(0,0,gl.canvas.width,gl.canvas.height);

			LEvent.trigger( scene, "renderPicking", [x,y] );

			gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE, that._picking_color );

			if(small_area)
				gl.disable(gl.SCISSOR_TEST);
		});
		this._current_target = null;

		//if(!this._picking_color) this._picking_color = new Uint8Array(4); //debug
		//trace(" END Rendering: ", this._picking_color );
		return this._picking_color;
	}
};

LS.Picking = Picking;