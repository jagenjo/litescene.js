# Scripting #

LiteScene allows to run scripts so users can code the behaviour of the application.

There are several ways to interact programmatically with LiteScene, every method is better suited for different purposes.

## Script component ##

This is the easiest way. There is a component called LS.Component.Script that stores the script as an string inside the property code.
The script stored inside the Script component have their own execution context usually referred as the script context.

The context is created when the component is configured and every var of function defined in that scope is local to the context so it cannot be accesed from outside of the scope.

### Public vars ###

If the user wants to make local vars or methods accesible from other scripts, graphs or animation tracks, they need to be attached to the context itself:

```this.number = 1;```

Sometimes may be helpful to specify the type of the var to the system, this way the var can be propertly connected using graphs, or animated using Animation Tracks.
In that case the user can use:

```this.createProperty("myvar", [1,1,1], "vec3");```

Specifying types is important when the types are not basic types, and if you are using WebGLStudio the system will create appropiate widgets to interact with them.

Also, when using WebGLStudio, there is also the option to specify widget properties to have a better ui for this script:

```this.createProperty("myvar", 0, {type: "number", widget:"slider", min:0, max:100, step:1});```

### Events ###

To interact with the system scripts need to attach callbacks to events dispatched by the different elements of the scene, mostly by the scene, but other examples are the Renderer, or the ResourcesManager.
The number of events is too big to list here, check the different components documentation and the examples to see to which events you can bind to.
To bind an event you can call the bind method:

```this.bind( LS.Renderer, "computeVisibility", myfunction );```

Keep in mind that myfunction must be a public method attached to the context (p.e. this.myfunc), otherwise the system wont be able to remove it automatically.

### Default methods ###

However, there are some basic events that all scripts usually want to use, like start, render, update and finish.
You do not need to bind those events, the Script component does it automatically.
You just need to create a public method (attached to the context) with the appropiate name:
```this.update = function(dt) { ... };```


## External Scripts ##

Sometimes you want to create your own Components bypassing the scripts system, this is better because it will have better performance and it will be easier to use by WebGLStudio.

The problem with creating your own components is that the class with the component information must be defined before the scene information is loaded, otherwise during the configuration of the scene some components will be missing,

To solve that problem scenes have an special array called external_scripts, those scripts will be loaded before the scene is configured. You can add any url that you want.

## Editing LiteScene base code ##

The last option is to add new components to LiteScene by manually creating new component files and adding them to litescene.js.

To do that I will recommend to insert the components inside the components folder of the code structure.

You must add also the path to the component in the deploy_files.txt inside the utils, and run the script pack.sh (to create litescene.js) or build.sh (to create litescene.js and litescene.min.js).
