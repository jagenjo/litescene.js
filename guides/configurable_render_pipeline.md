# Configurable Render Pipeline (WIP)

//WORK IN PROGRESS, NOT FINISHED

Sometimes you want to experiment with a different rendering pipeline composed of different steps.

In these cases it is helpful to have your own rendering pipeline. But programming a rendering pipeline could be complex,
this is why LiteScene comes with its own configurable rendering pipeline system based in graphs.


## Base Nodes

### Render Trigger

This is the node that triggers the event to render the frame, it exports the camera and the screen size.

### RenderFrameContext

This representes a rendering context that contains one (or several) color textures, a depth buffer (or texture) and a stencil buffer.

### SceneRenderer

This node renders an scene to a given RenderFrameContext.

It allows to control which layers are rendered, or to overwrite the material.

It can be used also to render shadowmaps or planar reflections.

### Viewport

This node takes a texture and displays it on the screen.

## Helper nodes

- Deferred render
- Downsample
- Upsample
- Split
- Join
- SSAO
- SSR

