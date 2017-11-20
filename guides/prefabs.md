# Prefabs

It is common when creating scenes to reuse the same objects in the same scene or between different scenes.

To avoid having to create the object again LiteScene allow to create Prefabs.

A prefab is a description of a SceneNode (its properties, components and children).

By creating a Prefab you can store that node info as a resource and invoke it whenever you need it.

## Creating Prefabs

You can create prefabs by code or using the WebGLStudio editor.

From code:

```js
var prefab = new LS.Prefab();
prefab.updateFromNode( mynode );
``` 

Or using the editor rightclicking in the root node and selection Create Prefab.

## Using prefabs

If you want to assign a prefab to a node, you can do it by code or using the editor:

```js
node.prefab = "folder/name.json";
```

Or in the editor by rick clicking in a node and selecting - Assign prefab -

## Content

A prefab contains two things:
- The node info: which contains all the components and children info.
- The resources: similar to a Pack, a number of resources in case the prefab wants to include them.


