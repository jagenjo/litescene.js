# Components #

Every node could host several components.

A component is a element that adds behaviour and visual representation to a node. There are lots of different components that can be attached to any node to add behaviour.

All the component classes are stored in ```LS.Components```.

## Creating and attaching components ##

To create a component you just instatiate the class:

```Javascript
var my_component = new Ls.Components.Camera();
node.addComponent( my_component );
```

To access the component:
```Javascript
var my_component = node.getComponent( LS.Components.Camera );
```

or to remove it
```Javascript
node.removeComponent( my_component );
```

Check the documentation for more info.

## Important Components ##

There are several components that are very important for any scene, they are:

- **Transform**: to handle the position, rotation and scaling of every object in the scene.
- **Camera**: to choose from where to render the scene and how.
- **MeshRenderer**: to render something in the scene.
- **Light**: to iluminate the scene.

### Transform ##
### Camera ##
### MeshRenderer ##
### Light ##
### Script and ScriptFromFile ##
