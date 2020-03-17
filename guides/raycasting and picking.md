# Raycasting and Picking

Usually when working with 3D scenes you want to check if an object intersects with a ray (raycasting) or if the mouse is over one object (picking).

To solve those issues LiteScene comes with some classes meant to make the process easy.


## Raycasting

To do the ray cast we first need the ray. To create a ray:

```js
var ray = GL.Ray( [0,0,0], [0,0,-1] ); //front ray
```

or if we want to cast a ray from a point in the camera we can use the ```getRayInPixel``` method from ```Camera```:

```js
var ray = camera.getRayInPixel( x, y );
```

To test collisions of this ray with the scene we use the static class ```LS.Physics```:

```js
var collided = LS.Physics.raycastRenderInstances( ray.origin, ray.direction );
```

This will test the ray against the bounding boxes of all ```LS.RenderInstances``` of the scene.

If you want to get the specific position of the intersection you can pass the parameters ```triangle_collision```:

```js
var collided = LS.Physics.raycastRenderInstances( ray.origin, ray.direction, { triangle_collision: true} );
```

Other available options are:
- layers: a mask specifiying which layers to test collision with ( p.e. 0b1010 to test the second and the fourth layer)
- instances: an array of instances if you do not want to test against all the instances
- max_distance: if you want to stop testing after some distance
- first_collision: returns the first collision it finds (which is not the closest one to the camera, is faster but not accurate).

```js

this.onMouseDown = function(e)
{
  var cam = LS.Renderer.getCurrentCamera();
  var ray = cam.getRayInPixel( e.canvasx, e.canvasy );
  var collisions = LS.Physics.raycastRenderInstances( ray.origin, ray.direction );
  console.log(collisions);
}

```


## LS.Collision

When testing collisions with a ray you will get an array containing all the collisions stored as ```LS.Collision```.

From there you can check:
- position: the position of the collision.
- node: the node that contained the object
- instance: the component that stored the collision shape (could be a PhysicsInstance or a RenderInstance)
- distance: the distance of the collision from the origin
- normal: the collision normal (perpendicular vector to the surface).
- hit: info of the collision in local space

## Raycast against colliders

Sometimes you do not want to test against all the objects in the scene (that could be slow), only the ones defining a collision volume. For that purpose you can use the raycast method:

```js
var collided = LS.Physics.raycast( ray.origin, ray.direction, { triangle_collision: true} );
```

This will test only with the colliders (components of type ```LS.Component.Collider```) in the scene, which is much faster.


## Picking

Picking is the process of obtaining which object is right below the mouse cursor.

The algorithm used to solve this is by rendering every object to a different color and checking the final color under the pixel, this approach **is quite slow** (it requires to render the whole scene) but is pixel perfect.

To use it you must call the static class ```LS.Picking```:

```js
var node = LS.Picking.getNodeAtCanvasPosition(x,y);
```
