# Animation #

LiteScene allows to animate any property of any component or node in the scene.

This is used for the skeletal animation but it can be used to animate other properties like camera position, material properties or any field that the user wants.

The animation system works by storing tracks with keyframes that contain the time and the values to apply.

When we want to apply an animation we use the PlayAnimation component.

You can use the WebGLStudio timeline editor to edit any animation in the scene.

## The LS.Animation and LS.Animation.Take ##

Animations are stored in a big container called ```js LS.Animation``` that behaves like a Resource.

Instead of storing the tracks per animation, we store them in another container called ```LS.Animation.Take```, this way one animation could contain several subanimations (takes).

By default we usually use the take named 'default'.

Every ```LS.Animation.Take``` contains a list of ```LS.Animation.Track```, and the total duration of the take.

Because every scene usually needs to have an animation track, to make it easier, you can have one global animation track stored in the scene itself (it is referenced as ```"@scene"``` animation).

To create it you can call ```LS.GlobalScene.createAnimation()``` and this track will be saved with the scene.

## LS.Animation.Track

Every track contains all the info to modify one property of the scene as time goes.

They contain a locator, a list of keyframes, and information about the interpolation method.

There are two types of track:
- Property tracks: every keyframe represents a value to assign to the property specified in the track locator.
- Event tracks: every keyframe contain info about an event or a function call that should be performed 

## Locators

Every track has a string called the locator which identifies the property in the scene affected by the animation track.

Some examples: ```root/transform/x```,```mynode/MeshRenderer/enabled``` or ```@NODE-f7cac-865-1ecf644-5\@COMP-f7cac-865-1ecf644-3\size```.

The locator is usually (but not always) divided in three parts:
 * **node**: could be the UID or the name of the node
 * **component**: to specify which component, could be the UID or the class name of the component (in case of multiple only the first found is used)
 * **property**: to specify the name of the property

Some components handle the locators by themselves (like script components) because they allow more parts in the locator.

To get the locator of a property you can call the method ```getLocator``` of the container (the component) passing the name of the property as a parameter:

```javascript
node.transform.getLocator("x"); //returns "@NODE_uid/@COMP-uid/x"
```

## Applying animations

There are two ways to play an animation track, through the ```LS.Components.PlayAnimation``` component, or programatically calling the ```applyTracks``` methods in the ```LS.Animation.Take```.

Use the PlayAnimation if you just want to launch an animation. If you want to play several an interpolate then we recommend calling the applyTracks manually.

## PlayAnimation

This component is in charge or loading and playing an animation.

It allows to select the animation (container with the data), choose the take, the playback speed, and different play modes (once, loop, pingpong).

If you want to use the global scene animation leave the animation field blank (or use "@scene").

This component also triggers events when the animation starts or ends.

Also to avoid sudden changes when switching from one animation to another, it allows to blend the outter animation with the incomming one.

## applyTracks

The ```LS.Animation.Take``` contains a method called ```applyTracks```. This method receives several parameters:

```js
var animation = LS.ResourcesManager.getResource("myanim.wbin"); //assuming is already loaded
var mytake = animation.getTake("default");
mytake.applyTracks( current_time, last_time, ignore_interpolation, root_node, scene, weight )
```

Where:
- **current_time**: is the time in the animation to sample all the tracks.
- **last_time**: the last current_time played. Used in event tracks to determine if there was an event between time intervals. You can pass the current_time as last_time if you don't care about event tracks.
- **ignore_interpolation**: to ignore interpolation.
- **root_node**: the node where the locators will start searching, if null the scene root node is used.
- **scene**: the scene where you want to apply the tracks.
- **weight**: how much do you want to interpolate this tracks with the current state of the scene, 1 means no interpolation.

Remember that if you use applyTracks you must keep track manually of the current_time using the update event (or onUpdate method if you are in a script).
