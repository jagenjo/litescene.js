# Guide to develop for LiteScene #
This guide intends to help people understand the Engine so they can take full advantage of it from the WebGLStudio platform.
The most important thing to understand is that the engine is separated in several layers, every one of them is independent, so to better understand everything about LiteScene please first go to LiteGL.js which is the low-level layer in charge of accesing WebGL, and the one LiteScene uses to simplify the GPU calls.
Read the parts of LiteGL related to events (LEvent) to ensure you understand the events system used by LiteScene.

## Guides ##

Here there is a list with the most commont topics to master LiteScene:

- [Scene](scene.md): Understanding the scene tree
- [Components](components.md): How to use the components system
- [Scripting](scripting.md): How to create your own scripts
- [Input](input.md): how to get user input
- [GUI](GUI.md): how to add a GUI to your application
- [Resources](resources.md): How to handle resources (textures, meshes, etc)

Some advanced topics:

- [Post-processing](post-processing.md): How to apply postprocessing effects
- [Render pipeline](render_pipeline.md): How does the render pipeline work
- [Shaders}(shaders.md): How to write your own shaders
- [Tweening](tweening.md): how to interpolate values easily



## Index ##
* Features
* Limitations
* LS Namespace
* SceneTree and SceneNode
* Components
 * Cameras
 * Scripts
 * Graphs
* Renderer
 * RenderInstance
 * Materials
* ResourcesManager
* ShadersManager
* Player
* Network
* Formats
* Physics
* Picking
* Helpers
 * Animation
 * Prefab
* Other
 * LScript
 * WBin
 
## Features ##
LiteScene is an engine meant to work with WebGLStudio although it is not mandatory to do so (you can create full scenes just by accesing the engine directly from code).
The engine is meant to be very modular and easy to extend.

Simple things can be added to the engine (like new modules or materials) without really needing to understand the whole system, but for more complex behaviours you will need to learn the system as a whole.

Because the whole engine is coded in Javascript (without any transpiler) you have full access from within the engine to any part of it, that means that you could create a script that replaces the behaviour of an existint part of the engine without any problem, thanks to the nature of Javascript and the modularity of the system.

The engine also allows different ways to do the same actions to help people, so you can use in-editor scripts, or external scripts loaded on launch, or graphs, or directly replace the source code of the engine.

The engine is also meant to help the editor to understand what is going on in every component, this way users can create new components with personalized interfaces that helps them to setup their scenes, without the need to code them.




 
## LS Namespace ##

The LS namespace is the global namespace where all the classes are contained, some generic methods are also here that could be helpful to control the global system.

Check the documentation for a complete list with all the methods.

Inside LS there are some important object that you should be aware:
- Components
- MaterialClasses
- Formats

Some of the most important components (such as Script, Camera, Light and Transform) are stored also in the LS namespace besides being in LS.Components.


