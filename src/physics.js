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
function Collision( node, instance, position, distance )
{
	this.position = vec3.create();
	if(position)
		this.position.set(position);
	this.node = node || null; //the node belonging to this colliding object
	this.instance = instance || null; //could be a RenderInstance or a PhysicsInstance
	this.distance = distance || 0; //distance from the ray start
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

	this.type = PhysicsInstance.BOX;
	this.mesh = null; 

	//where does it come from
	this.node = node;
	this.component = component;

	//transformation
	this.matrix = mat4.create();
	this.center = vec3.create();

	//for visibility computation
	this.oobb = BBox.create(); //object space bounding box
	this.aabb = BBox.create(); //axis aligned bounding box
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
	* @param {number} max_dist maxium distance
	* @param {number} layers which layers to check
	* @param {SceneTree} scene
	* @return {Array} Array of Collision objects containing all the nodes that collided with the ray or null in the form [SceneNode, Collider, collision point, distance]
	*/
	raycast: function( origin, direction, max_dist, layers, scene)
	{
		max_dist = max_dist || Number.MAX_VALUE;
		if(layers === undefined)
			layers = 0xFFFF;
		scene = scene || LS.GlobalScene;

		var colliders = scene._colliders;
		var collisions = [];

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
			if( !geo.testRayBBox(origin, direction, instance.aabb, null, collision_point, max_dist) )
				continue;

			var model = instance.matrix;

			//ray to local
			var inv = mat4.invert( mat4.create(), model );
			mat4.multiplyVec3( local_start, inv, origin);
			mat4.rotateVec3( local_direction, inv, direction);

			//test in world space, is cheaper
			if( instance.type == PhysicsInstance.SPHERE)
			{
				if(!geo.testRaySphere( local_start, local_direction, instance.center, instance.oobb[3], collision_point, max_dist))
					continue;
				vec3.transformMat4(collision_point, collision_point, model);
			}
			else //the rest test first with the local BBox
			{
				//test against OOBB (a little bit more expensive)
				if( !geo.testRayBBox( local_start, local_direction, instance.oobb, null, collision_point, max_dist) )
					continue;

				if( instance.type == PhysicsInstance.MESH)
				{
					var octree = instance.mesh.octree;
					if(!octree)
						octree = instance.mesh.octree = new Octree( instance.mesh );
					var hit = octree.testRay( local_start, local_direction, 0.0, max_dist );
					if(!hit)
						continue;

					mat4.multiplyVec3(collision_point, model, hit.pos);
				}
				else
					vec3.transformMat4(collision_point, collision_point, model);
			}

			var distance = vec3.distance( origin, collision_point );
			collisions.push( new LS.Collision( instance.node, instance, collision_point, distance ));
		}

		//sort collisions by distance
		collisions.sort( Collision.isCloser );
		return collisions;
	}
}


LS.Physics = Physics;