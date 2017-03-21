# Scripting #

LiteScene allows to run scripts so users can code the behaviour of the application.

The info about the scripts is stored inside the scene so when a new scene is loaded it loads its scripts too.

There are several ways to interact programmatically with LiteScene, every method is better suited for different purposes.

## Using script components ##

This is the easiest way. You can attach a Script or a ScriptFromFile component to any node. The difference between both is that Script stores the code inside the component while ScriptFromFile references the code from a resource file (better suited when sharing the same behaviour among different nodes or projects).

ScriptFromFile behave as regular Scripts but because its load is asynchromous it means their context will be created later in time after the scene has started, keep that in mind (events like start will me called once the node is loaded).

### The script context ###

Every script has its own execution context usually referred as the script context.

The context is created when the component is configured and the code loaded.

When programming inside a LS.Script, the context is the ```this``` of your code:

```javascript
this.foo = 100; //adds a property foo to the script context
```

To access the context of another script component just access the context property throught the component:

```javascript
var node = scene.getNode("mynode");
var script_component = node.getComponent( LS.Script ); //or LS.ScriptFromFile, depending on the component used
script_component.context.foo = 10;
```

Check the section below to know other ways to access a context of another component.

### Global vars of every script ###

Besides all the objects of the system, every script has three globals vars associated to that script:

- **scene**: the scene where the node of this script component is attached, (usually the same as ```LS.GlobalScene``` )
- **node**: the node where this script component is attached, (equivalent to ```component._root``` )
- **component**: the script component itself

So feel free to access them from inside your script at any time.

### Local vars and functions ###

Every ```var``` (or ```function```) defined in that scope is local to the context so it cannot be accesed from outside of the scope.

Unless we make it public or we make a setter/getter.

### Public vars ###

If the user wants to make local vars or methods accesible from other scripts, graphs or animation tracks  (or the editor), they need to be made public, to do so they must be attached to the context itself:

```javascript
this.number = 1; //this var will be public
```

Sometimes may be helpful to specify the type of the var to the system, this way the var can be properly connected using Graphs, or animated using Animation Tracks.
In that case the user can use:

```javascript
//to create the var
this.createProperty("myvar", [1,1,1], LS.TYPES.VEC3 );

//to access  it
this.myvar = [10,10,10];
```

Specifying types is important when the types are not basic types, and if you are using WebGLStudio the system will create appropiate widgets to interact with them.

Also, when using WebGLStudio, there is also the option to specify widget properties to have a better UI for this script:

```javascript
this.createProperty("myvar", 0, {type: "number", widget:"slider", min:0, max:100, step:1});
```

Or to create even Arrays that can be edited through the editor:

```javascript
this.createProperty( "myarray", [], "array" );
```

### Events ###

To interact with the system, scripts need to attach callbacks to events dispatched by the different elements of the scene, mostly by the scene (but could be the Renderer, the ResourcesManager, etc).
The number of events is too big to list here, check the different components documentation and the examples to see to which events you can bind to.
To bind an event you can call the bind method:

```javascript
this.bind( scene, "update", myfunction );
```

Keep in mind that myfunction must be a public method attached to the context (p.e. this.myfunc), otherwise the system wont be able to remove it automatically.

### Input ###

You can bind events for actions performed by the user (like mousedown, keydown, etc) or read the input system directly (using the LS.Input object).

Check the [Input guide](input.md) to see more information abour reading the input.

### API exported methods ###

However, there are some events that scripts usually want to use, like **start**, **init**, **render**, **update** and **finish**.
You do not need to bind (or unbind) those events, the Script component does it automatically if it detect a method in the context with an specific name (depending on the event):

```javascript
this.onUpdate = function(dt) { ... };
```

Here is a list of the automatically binded events:

- **onStart**: triggered by scene "start" event, remember that if your script is created after the scene starting you wont receive this.
- **onFinish**: triggered by scene "finish" event, used in the editor when the user stops the play mode.
- **onPrefabReady**: triggered by the node "prefabReady", used to access components or node that come from the prefab
- **onUpdate**: triggered by scene "update" event. it receives the delta time in seconds.
- **onClicked**: triggered by the node "clicked" event. Remember that you need an InteractiveController in the scene to dispatch this events.
- **onCollectRenderInstances**: triggered by node "collectRenderInstances" event. To pass RenderInstasnces
- **onSceneRender**: triggered by scene "beforeRender" event. Used to prepare stuff before any rendering is done.
- **onRender**: triggered by the node "beforeRenderInstances" event. Used to direct render stuff before the RenderInstances are rendered.
- **onAfterRender**: triggered by the node "afterRenderInstances" event. Used to direct render stuff after the RenderInstances are rendered.
- **onRenderHelpers**: triggered by scene "renderHelpers" event. To direct render stuff related to the editor.
- **onRenderGUI**: triggered by scene "renderGUI", to render stuff in 2D (using the canvas2D).
- **onEnableFrameContext**: triggered by the scene "enableFrameContext" event. Before rendering the final frame, used to setup a special RenderFrameContext and apply FX to the final image.
- **onShowFrameContext**: triggered by the scene "showFrameContext" event. After the final frame, to show the frame into the viewport.
- **onRemovedFromScene**: called when the node where the script belongs is detached from the scene.
- **onGetResources**: called when the script needs to collect resources. This function receives an object that needs to be filled with the fullpath : type of the resources it uses so they can be automatically loaded when the scene is loaded.

Keep in mind that you are free to bind to any events of the system that you want. Just remember to unbind them from the onRemovedFromScene so no lose binds are left.

### Serialization ###

Any data attached to the context whose name doesn't start with the character underscore "```_```" will be serialized automatically when storing the scene and restored when the context is created. Keep in mind that when serializing any property it is stored as a base type, so avoid setting public variables of special classes, only store properties of the common types like String, Number, Bool, or Arrays of basic types.

If you want to store stuff that shouldn't be serialized remember to use a name starting with underscore.

### Naming Scripts

If you want to add a name to your script (which could be useful from the editor and to access it remotely), you can add the next line at the beginning of your script:

```javascript
//@my_script_name
``` 

### Accessing other scripts from scripts ###

If you want to access data from the context of another script in the scene (or call a method), first you must retrieve that script context.

To do so the best way is to get the node from the scene, get the script component from that node, and get the context from that component.

```javascript
var node = scene.getNode("nodename");
var component = node.getComponent( LS.Components.Script ); //or ScriptFromFile, depending which component was used
var foo = component.context.foo; //read context property
```

Although you are free to register the components in some global container when the context is created so they are easier to retrieve.

```javascript
//from inside the script you want to make accesible to other scripts
LS.Globals.my_special_script_context = this;
```


### Script considerations ###

When coding scripts for LiteScene there are several things you must take into account:
- Remember to unbind every event you bind, otherwise the editor could have erratic behaviour.
- When using LS.Component.Script keep in mind that when the context is created (when your global code is executed) if you try to access to the scene tree to retrieve information (like nodes) it is possible that this info is not yet available because it hasnt been parsed yet.
- Scripts onlu exists if they are attached to a node, when they are detached all the data not serialized will be lost.

## Global Scripts ##

Sometimes we want to create our own Components bypassing the scripts system, this is better because it will have better performance, more control and it will be easier to use by WebGLStudio.

But this scripts must be loaded **before** the scene is loaded. The problem with regular scripts is that they are parsed during the scene construction, this could lead to a ordering problem where a node is created using a component that is not yet defined.

To solve this problem and many others, scenes can include scripts that will be loaded before the scene tree is parsed. This are called global scripts, they are executed in the global context (window) like if they were external scripts, but the files are fetched using the ResourcesManager (so paths are relative to the resources manager root path).

Global scripts are stored in scene.global_scripts array.

## External Scripts ##

When we just want to load some external library to use in our code we can add it by appending the url to the external scripts array of the scene.

External scripts are stored in scene.external_scripts array.

## Editing LiteScene base code ##

The last option is to add new components to LiteScene by manually creating new component files and adding them to litescene.js.

To do that I will recommend to insert the components inside the components folder of the code structure.

You must add also the path to the component in the deploy_files.txt inside the utils, and run the script pack.sh (to create litescene.js) or build.sh (to create litescene.js and litescene.min.js).

### Missing Components ###

If you have created your own component class from within an script and by any reason when loading a scene the system cannot find the component specified in the JSON of the scene (maybe the component changed its name, or the script wasnt loaded), the data wont be lost an it will be stored aside so it stays in the JSON if you serialize that again.

## Documentation ##

To know more about the APIs accessible from LiteScene check the documation websites for [LiteGL](https://github.com/jagenjo/litegl.js), [LiteScene](https://github.com/jagenjo/litescene.js) and [LiteGraph](https://github.com/jagenjo/litegraph.js).

