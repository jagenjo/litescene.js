/* This is in charge of basic physics actions like ray tracing against the colliders */

/**
* Contains information about the collision of a ray and the scene
* - position: vec3
* - node: SceneNode
* - instance: could be a RenderInstance or a PhysicsInstance
* - distance: number
* @class Collision
* @namespace LS
* @constructor
* @param {SceneNode} node
* @param {PhysicsInstance|RenderInstance} instance
* @param {vec3} position collision position
* @param {number} distance
*/
function Collision( node, instance, position, distance, normal )
{
	this.position = vec3.create();
	if(position)
		this.position.set(position);
	this.node = node || null; //the node belonging to this colliding object
	this.instance = instance || null; //could be a RenderInstance or a PhysicsInstance
	this.distance = distance || 0; //distance from the ray start
	this.normal = normal;
}

Collision.isCloser = function(a,b) { return a.distance - b.distance; }

LS.Collision = Collision;

/**
* PhysicsInstance contains info of a colliding object. Used to test collisions with the scene
*
* @class PhysicsInstance
* @namespace LS
* @constructor
*/
function PhysicsInstance(node, component)
{
	this.uid = LS.generateUId("PHSX"); //unique identifier for this RI
	this.layers = 3|0;

	this.type = PhysicsInstance.BOX; //SPHERE, MESH
	this.mesh = null; 

	//where does it come from
	this.node = node;
	this.component = component;

	//transformation
	this.matrix = mat4.create();
	this.center = vec3.create();

	//for visibility computation
	this.oobb = BBox.create(); //local object oriented bounding box
	this.aabb = BBox.create(); //world axis aligned bounding box
}

PhysicsInstance.BOX = 1;
PhysicsInstance.SPHERE = 2;
PhysicsInstance.PLANE = 3;
PhysicsInstance.CAPSULE = 4;
PhysicsInstance.MESH = 5;
PhysicsInstance.FUNCTION = 6; //used to test against a internal function

/**
* Computes the instance bounding box in world space from the one in local space
*
* @method updateAABB
*/
PhysicsInstance.prototype.updateAABB = function()
{
	BBox.transformMat4(this.aabb, this.oobb, this.matrix );
}

PhysicsInstance.prototype.setMesh = function(mesh)
{
	this.mesh = mesh;
	this.type = PhysicsInstance.MESH;	
	BBox.setCenterHalfsize( this.oobb, BBox.getCenter( mesh.bounding ), BBox.getHalfsize( mesh.bounding ) );
}

LS.PhysicsInstance = PhysicsInstance;



/**
* Physics is in charge of all physics testing methods
*
* @class Physics
* @namespace LS
* @constructor
*/
var Physics = {

	/**
	* Cast a ray that traverses the scene checking for collisions with Colliders
	* @method raycast
	* @param {vec3} origin in world space
	* @param {vec3} direction in world space
	* @param {Object} options ( max_dist maxium distance, layers which layers to check, scene, first_collision )
	* @return {Array} Array of Collision objects containing all the nodes that collided with the ray or null in the form [SceneNode, Collider, collision point, distance]
	*/
	raycast: function( origin, direction, options )
	{
		options = options || {};
		var layers = options.layers;
		if(layers === undefined)
			layers = 0xFFFF;
		var max_distance = options.max_distance || Number.MAX_VALUE;
		var scene = options.scene || LS.GlobalScene;
		var first_collision = options.first_collision;

		var colliders = options.colliders || scene._colliders;
		var collisions = [];

		var compute_normal = !!options.normal;

		if(!colliders)
			return null;

		var local_start = vec3.create();
		var local_direction = vec3.create();

		//for every instance
		for(var i = 0; i < colliders.length; ++i)
		{
			var instance = colliders[i];

			if( (layers & instance.layers) === 0 )
				continue;

			//test against AABB
			var collision_point = vec3.create();
			var collision_normal = null;
			if( !geo.testRayBBox(origin, direction, instance.aabb, null, collision_point, max_distance) )
				continue;

			var model = instance.matrix;

			//spheres are tested in world space, is cheaper (if no non-uniform scales...)
			if( instance.type == PhysicsInstance.SPHERE )
			{
				if(!geo.testRaySphere( origin, direction, instance.center, instance.oobb[3], collision_point, max_distance))
					continue;
				if(compute_normal)
					collision_normal = vec3.sub( vec3.create(), collision_point, instance.center );
			}
			else //the rest test first with the local BBox
			{
				//ray to local instance coordinates
				var inv = mat4.invert( mat4.create(), model );
				mat4.multiplyVec3( local_start, inv, origin);
				mat4.rotateVec3( local_direction, inv, direction);

				//test against OOBB (a little bit more expensive)
				if( !geo.testRayBBox( local_start, local_direction, instance.oobb, null, collision_point, max_distance) )
					continue;

				//if mesh use Octree
				if( instance.type == PhysicsInstance.MESH )
				{
					var octree = instance.mesh.octree;
					if(!octree)
						octree = instance.mesh.octree = new GL.Octree( instance.mesh );
					var hit = octree.testRay( local_start, local_direction, 0.0, max_distance );
					if(!hit)
						continue;

					mat4.multiplyVec3( collision_point, model, hit.pos );
					if(compute_normal)
						collision_normal = mat4.rotateVec3( vec3.create(), model, hit.normal );
				}
				else //if just a BBox collision
				{
					vec3.transformMat4( collision_point, collision_point, model );
				}
			}

			var distance = vec3.distance( origin, collision_point );
			collisions.push( new LS.Collision( instance.node, instance, collision_point, distance, collision_normal ));

			if(first_collision)
				return collisions;
		}

		//sort collisions by distance
		collisions.sort( Collision.isCloser );
		return collisions;
	},

	/**
	* Test if a sphere collides with any of the colliders in the scene
	* @method testSphere
	* @param {vec3} origin in world space
	* @param {radius} radius
	* @param {Object} options layers, colliders, scene
	* @return {PhysicsInstance} the first PhysicsObject that collided with, otherwise null
	*/
	testSphere: function( origin, radius, options )
	{
		options = options || {};
		var layers = options.layers;
		if(layers === undefined)
			layers = 0xFFFF;
		var scene = options.scene || LS.GlobalScene;

		var colliders = options.colliders || scene._colliders;
		var collisions = [];

		var local_start = vec3.create();

		if(!colliders)
			return null;

		//for every instance
		for(var i = 0; i < colliders.length; ++i)
		{
			var instance = colliders[i];

			if( (layers & instance.layers) === 0 )
				continue;

			//test against AABB
			if( !geo.testSphereBBox( origin, radius, instance.aabb ) )
				continue;

			var model = instance.matrix;

			//ray to local
			var inv = mat4.invert( mat4.create(), model );
			mat4.multiplyVec3( local_start, inv, origin);

			//test in world space, is cheaper
			if( instance.type == LS.PhysicsInstance.SPHERE)
			{
				if( vec3.distance( origin, local_start ) > (radius + BBox.getRadius(instance.oobb)) )
					continue;
			}
			else //the rest test first with the local BBox
			{
				//test against OOBB (a little bit more expensive)
				if( !geo.testSphereBBox( local_start, radius, instance.oobb) )
					continue;

				if( instance.type == LS.PhysicsInstance.MESH )
				{
					var octree = instance.mesh.octree;
					if(!octree)
						octree = instance.mesh.octree = new GL.Octree( instance.mesh );
					if( !octree.testSphere( local_start, radius ) )
						continue;
				}
			}

			return instance;
		}

		return null;
	},

	testCollision: function( A, B )
	{
		//test AABBs
		if( !geo.testBBoxBBox( A.aabb, B.aabb ) )
			return false;

		return true; //TODO

		//conver A to B local Space

		//test box box

		//test box sphere

		//test box mesh

		//test sphere box

		//test sphere sphere

		//mesh mesh not supported

		return true;
	},

	testAllCollisions: function( on_collision, layers, scene )
	{
		if(layers === undefined)
			layers = 0xFFFF;
		scene = scene || LS.GlobalScene;

		var colliders = scene._colliders;
		var l = colliders.length;

		var collisions = false;

		for(var i = 0; i < l; ++i)
		{
			var instance_A = colliders[i];

			if( (layers & instance_A.layers) === 0 )
				continue;

			for(var j = i+1; j < l; ++j)
			{
				var instance_B = colliders[j];

				if( (layers & instance_B.layers) === 0 )
					continue;

				if( this.testCollision( instance_A, instance_B ) )
				{
					if(on_collision)
						on_collision( instance_A, instance_B );
					collisions = true;
				}
			}
		}

		return collisions;
	}
}


LS.Physics = Physics;