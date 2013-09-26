# litescene.js

Litescene is a scene graph library for WebGL with a component based hierarchical node system.
It comes with a realistic rendering pipeline and some interesting components to make it easier to build and share scenes.

 * Component based node system.
 * Realistic rendering pipeline, it supports shadows, reflections, textures for all properties, etc
 * Material system that automatically computes the best shader, making it easy to control properties.
 * Resources Manager to load and store any kind of resource ( textures, meshes, etc)
 * Serializing methods to convert any Scene to JSON
 * Parser for most common file formats
 * Easy to embed.

 It uses its own low-level library called [https://github.com/jagenjo/litegl.js](litegl)

### WebGLStudio ###

Litescene has been created to work together with WebGLStudio, an open source online 3D editor.
From WebGLStudio you can export the JSON file containing all the info and use it in your LiteScene.

### Usage ###

Include the library and dependencies
```html
<script src="external/gl-matrix-min.js"></script>
<script src="external/litegl.min.js"></script>
<script src="js/litescene.js"></script>
```

Create the context
```js
var context = new LS.Context({width:800, height:600});
```

Attach to DOM
```js
document.getElementById("mycontainer").appendChild( context.canvas )
```

Set path to resources
```js
ResourcesManager.path = "assets/";
Shaders.init("data/shaders.xml");
```

Load the scene
```js
Scene.loadScene("scene.json");
```


Documentation
-------------
The doc folder contains the documentation. 
For info about [https://github.com/jagenjo/litegl.js](litegl) check the documentation in its repository.
For info about [http://glmatrix.com](glMatrix) check the documentation in its website.

Utils
-----

It includes several commands in the utils folder to generate doc, check errors and build minifyed version.


Feedback
--------

You can write any feedback to javi.agenjo@gmail.com




