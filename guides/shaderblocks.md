# ShaderBlocks

The problem when using ShaderMaterials is that the shader defined by the user is static,
which means that nothing from the scene could affect the ShaderCode in this ShaderMaterial.

This is a problem because when rendering objects in a scene different elements from the scene could affect the way it is seen.
For instance lights contribute to the color, but also mesh deformers (blend shapes, skinning) or even atmospheric FX (Fog).

To tackle this problem ShaderCode allows to include ShaderBlocks.

A ShaderBlock its a snippet of code that could be toggled from different elements of the render pipeline.

Depending on if the ShaderBlock is enabled or disabled it will output a different fragment of code.
And because every shaderblock has its own unique number, they can be easily mapped using bit operations in a 64 bits number.

## Example

Imagine a shader that could be affected by mesh deformers, but also by lights.




## WIP

### MeshDeformer

//...

