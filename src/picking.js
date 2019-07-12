///@INFO: UNCOMMON
/**
* Picking is used to detect which element is below one pixel (using the GPU) or using raycast
*
* @class Picking
* @namespace LS
* @constructor
*/
var Picking = {

	picking_color_offset: 10, //color difference between picking objects
	_picking_points: [], //used during picking fetching
	_picking_nodes: null, //created before picking

	//picking
	_pickingMap: null,
	_picking_color: new Uint8Array(4),
	_picking_depth: 0,
	_picking_next_color_id: 0,
	_picking_render_settings: new RenderSettings(),

	_use_scissor_test: true,

	/**
	* Renders the pixel and retrieves the color to detect which object it was, slow but accurate
	* @method getNodeAtCanvasPosition
	* @param {number} x in canvas coordinates
	* @param {number} y in canvas coordinates
	* @param {Camera} camera default is all cameras
	* @param {number} layers default is 0xFFFF which is all
	* @param {Scene} scene default is GlobalScene
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
	* @param {number} x in canvas coordinates (0,0 is bottom-left)
	* @param {number} y in canvas coordinates
	* @param {Camera} camera
	* @param {number} layers default is 0xFFFF which is all
	* @param {Scene} scene
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
		this.getPickingColorFromBuffer( scene, camera, x, y, layers );

		this._picking_color[3] = 0; //remove alpha, because alpha is always 255
		var id = new Uint32Array(this._picking_color.buffer)[0]; //get only element

		var instance_info = this._picking_nodes[id];
		this._picking_nodes = {};
		return instance_info;
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
		this._picking_next_color_id += this.picking_color_offset;
		var pick_color = new Uint32Array(1); //store four bytes number
		pick_color[0] = this._picking_next_color_id; //with the picking color for this object
		var byte_pick_color = new Uint8Array( pick_color.buffer ); //read is as bytes
		//byte_pick_color[3] = 255; //Set the alpha to 1

		if(!this._picking_nodes) //not necessary but used for debug
			this._picking_nodes = {};
		this._picking_nodes[ this._picking_next_color_id ] = info;
		return vec4.fromValues( byte_pick_color[0] / 255, byte_pick_color[1] / 255, byte_pick_color[2] / 255, 1 );
	},

	//x,y must be in canvas coordinates (0,0 is bottom-left)
	getPickingColorFromBuffer: function( scene, camera, x, y, layers )
	{
		//create texture
		if(this._pickingMap == null || this._pickingMap.width != gl.canvas.width || this._pickingMap.height != gl.canvas.height )
		{
			this._pickingMap = new GL.Texture( gl.canvas.width, gl.canvas.height, { format: gl.RGBA, filter: gl.NEAREST });
			this._pickingFBO = new GL.FBO([this._pickingMap]);
			//LS.ResourcesManager.textures[":picking"] = this._pickingMap; //debug the texture
		}

		var small_area = this._use_scissor_test;
		LS.Renderer._current_target = this._pickingMap;

		this._pickingFBO.bind();

			//var viewport = camera.getLocalViewport();
			//camera._real_aspect = viewport[2] / viewport[3];
			//gl.viewport( viewport[0], viewport[1], viewport[2], viewport[3] );

			if(small_area)
			{
				gl.scissor(x-1,y-1,2,2);
				gl.enable(gl.SCISSOR_TEST);
			}

			this.renderPickingBuffer( scene, camera, layers, [x,y] );

			gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE, this._picking_color );

			if(small_area)
				gl.disable(gl.SCISSOR_TEST);

		this._pickingFBO.unbind();

		LS.Renderer._current_target = null; //??? deprecated

		//if(!this._picking_color) this._picking_color = new Uint8Array(4); //debug
		//trace(" END Rendering: ", this._picking_color );
		return this._picking_color;
	},

	//pos must be in canvas coordinates (0,0 is bottom-left)
	renderPickingBuffer: function( scene, camera, layers, pos )
	{
		if(layers === undefined)
			layers = 0xFFFF;
		var picking_render_settings = this._picking_render_settings;

		LS.Renderer.enableCamera( camera, this._picking_render_settings );

		gl.clearColor(0,0,0,0);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

		this._picking_next_color_id = 0;
		LS.Renderer.setRenderPass( PICKING_PASS );
		picking_render_settings.layers = layers;

		//check instances colliding with cursor using a ray against AABBs
		var instances = null;
		if( pos ) //not tested yet
		{
			var ray = camera.getRay( pos[0], pos[1] );
			var instances_collisions = LS.Physics.raycastRenderInstances( ray.origin, ray.direction );
			if( instances_collisions )
			{
				instances = Array( instances_collisions.length );
				for(var i = 0; i < instances_collisions.length; ++i)
					instances[i] = instances_collisions[i].instance;
			}
			//console.log("Instances ray collided:", instances_collisions.length);
		}
		else
			instances = scene._instances;

		LS.Renderer.renderInstances( picking_render_settings, instances );

		//Nodes
		/* done in EditorView
		var ray = null;
		if(mouse_pos)
		{
			ray = camera.getRayInPixel( pos[0], pos[1] );
			ray.end = vec3.add( vec3.create(), ray.origin, vec3.scale(vec3.create(), ray.direction, 10000 ) );
		}

		for(var i = 0, l = scene._nodes.length; i < l; ++i)
		{
			var node = scene._nodes[i];
			if(!node.visible)
				continue;

			//nodes with special pickings?
			if(node.renderPicking)
				node.renderPicking(ray);

			if( node.transform )
			{
				var pos = vec3.create();
				mat4.multiplyVec3(pos, node.transform.getGlobalMatrixRef(), pos); //create a new one to store them
			}

			for(var j in node._components)
			{
				var component = node._components[j];
				if(component.renderPicking)
					component.renderPicking(ray);
			}
		}
		*/

		LEvent.trigger( scene, "renderPicking", pos );
		LEvent.trigger( LS.Renderer, "renderPicking", pos );

		LS.Renderer.setRenderPass( COLOR_PASS );
	},

	addPickingPoint: function( position, size, info )
	{
		size = size || 5.0;
		var color = LS.Picking.getNextPickingColor( info );
		this._picking_points.push([ position,color,size]);
	},

	renderPickingPoints: function()
	{
		//render all the picking points 
		if(this._picking_points.length)
		{
			var points = new Float32Array( this._picking_points.length * 3 );
			var colors = new Float32Array( this._picking_points.length * 4 );
			var sizes = new Float32Array( this._picking_points.length );
			for(var i = 0; i < this._picking_points.length; i++)
			{
				points.set( this._picking_points[i][0], i*3 );
				colors.set( this._picking_points[i][1], i*4 );
				sizes[i] = this._picking_points[i][2];
			}
			LS.Draw.setPointSize(1);
			LS.Draw.setColor([1,1,1,1]);
			gl.disable( gl.DEPTH_TEST ); //because nodes are show over meshes
			LS.Draw.renderPointsWithSize( points, colors, sizes );
			gl.enable( gl.DEPTH_TEST );
			this._picking_points.length = 0;
		}
	},

	visualize: function(v)
	{
		//to visualize picking buffer
		LS.Renderer.setRenderPass( v ? LS.PICKING_PASS : LS.COLOR_PASS );
	}
};

//Extra info
// renderPicking is not called from LiteScene, only from WebGLStudio EditorView

LS.Picking = Picking;


