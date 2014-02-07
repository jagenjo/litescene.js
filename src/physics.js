/* This is in charge of basic physics actions like ray tracing against the colliders */

/**
* PhysicsInstance contains info of one object to test physics against
*
* @class PhysicsInstance
* @namespace LS
* @constructor
*/
function PhysicsInstance(node, component)
{
	this._uid = LS.generateUId(); //unique identifier for this RI

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
	BBox.setCenterHalfsize( this.oobb, mesh.bounding.aabb_center, mesh.bounding.aabb_halfsize );
}



/**
* Physics is in charge of all physics testing methods
*
* @class Physics
* @namespace LS
* @constructor
*/
var Physics = {
	raycast: function(scene, origin, direction)
	{
		var colliders = scene._colliders;
		var collisions = [];

		//for every instance
		for(var i = 0; i < colliders.length; ++i)
		{
			var instance = colliders[i];

			//test against AABB
			var collision_point = vec3.create();
			if( !geo.testRayBBox(origin, direction, instance.aabb, null, collision_point) )
				continue;

			var model = instance.matrix;

			//ray to local
			var inv = mat4.invert( mat4.create(), model );
			var local_start = mat4.multiplyVec3(vec3.create(), inv, origin);
			var local_direction = mat4.rotateVec3(vec3.create(), inv, direction);

			//test in world space, is cheaper
			if( instance.type == PhysicsInstance.SPHERE)
			{
				if(!geo.testRaySphere(local_start, local_direction, instance.center, instance.oobb[3], collision_point))
					continue;
				vec3.transformMat4(collision_point, collision_point, model);
			}
			else //the rest test first with the local BBox
			{
				//test against OOBB (a little bit more expensive)
				if( !geo.testRayBBox(local_start, local_direction, instance.oobb, null, collision_point) )
					continue;

				if( instance.type == PhysicsInstance.MESH)
				{
					var octree = instance.mesh.octree;
					if(!octree)
						octree = instance.mesh.octree = new Octree( instance.mesh );
					var hit = octree.testRay( local_start, local_direction, 0.0, 10000 );
					if(!hit)
						continue;

					mat4.multiplyVec3(collision_point, model, hit.pos);
				}
				else
					vec3.transformMat4(collision_point, collision_point, model);
			}

			var distance = vec3.distance( origin, collision_point );
			collisions.push([instance, collision_point, distance]);
		}

		collisions.sort( function(a,b) { return a[2] - b[2]; } );
		return collisions;
	}
}


LS.Physics = Physics;