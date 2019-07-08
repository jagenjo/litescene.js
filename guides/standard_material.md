# StandardMaterial

When working with materials, you do now want users having to code their own shaders.

One solution is to give them a pre-made set of shaders already created, but other option is to have a material
that can adapt its shader according to its parameters, this is the StandardMaterial.

The idea is that according to the settings of the material, it will compute the shader code and cache that shader.

This works well for most common cases.


## Inject code in the StandardMaterial shader

If we do not find the StandardMaterial suited for our scene, we can create our own shader using the SurfaceMaterial or the ShaderMaterial.

But sometimes we just want to tweak how StandardMaterial shader behaves in some specific point (how the color is enconded in the framebuffer,
how the vertex is deformed). In those cases we can inject code in the StandardMaterial shader using the next syntax:

```js
  LS.StandardMaterial.onShaderCode = function(code,mat)
  {
  	code.fs_encode = "final_color.x = final_color.y;";
  }
	LS.StandardMaterial.clearShadersCache();
```


