# ShaderBlocks

The problem when using ShaderMaterials is that the shader defined by the user is static,
which means that nothing from the scene could affect the ShaderCode in this ShaderMaterial.

This is a problem because when rendering objects in a scene different elements from the scene could affect the way it is seen.
For instance lights contribute to the color, but also mesh deformers (blend shapes, skinning) or even atmospheric FX (Fog).

To tackle this problem ShaderCode allows to include ShaderBlocks.

A ShaderBlock its a snippet of code that could be toggled from different elements of the render pipeline.

Depending on if the ShaderBlock is enabled or disabled it will output a different fragment of code.
And because every shaderblock has its own unique number, they can be easily mapped using bit operations in a 32 bits number.

## Creating a ShaderBlock

To create a ShaderBlock you must instatiate the ShaderBlock class and configure it:

First create the ShaderBlock and give it a name (this name will be the one referenced from the shader when including it):
```javascript
var my_shader_block = new LS.ShaderBlock("morphing");
```
The next step is to add the code snippets for the Vertex or Fragment shader. 

### ShaderBlock enabled/disabled codes

When adding a code snippet you have to pass two snippets, one for when the ShaderBlock is enabled and one for when it is disabled. This is because from your shader you will be calling functions contained in this ShaderBlock, and you want the shader to have this functions even if the ShaderBlock is disabled.

```javascript
var enabled_shader_code = "void applyMorphing(inout vec4 vertex, inout vec3 normal) { ... }\n";
var disabled_shader_code = "void applyMorphing(inout vec4 vertex, inout vec3 normal) {}\n";
my_shader_block.addCode( GL.VERTEX_SHADER, enabled_shader_code, disabled_shader_code );
```

### ShaderBlock events

Sometimes several shader blocks want to inject code in the same area of the shader, without knowing if other blocks exist.
For that reason ShaderCodes could contain 'pragma events' where ShaderBlocks can inject code.

This is different from the previous code in that this only gets added if it is enabled and the shader has the corresponding ```#pragma event "event_name"```

```glsl
//inside the vertex or fragment shader
//...
#pragma event "vs_functions"
//...
```

```javascript
my_shader_block.bindEvent( "vs_functions", "float myFunc() { return 1.0; }" );
```

### Registering the ShaderBlock

Register the ```LS.ShaderBlock``` in the system by calling the register function:

```javascript
my_shader_block.register();
```

After doing this you can call it from your shader:

```glsl
#pragma shaderblock "morphing"

void main() {
  //...
  applyMorphing( vertex4, v_normal ); //this function is defined inside the shader block
```

### Enabling the ShaderBlock

To activate the ShaderBlock from your javascript component there are different ways:

Inside the ```LS.RenderInstance```:

```javascript
   var RI = node._instances[0];
   RI.addShaderBlock( morphing_block );
```

Globally for the next frame:

```js
  LS.Renderer.enableFrameShaderBlock( shader_block, uniforms );
```


## Chaining ShaderBlocks

You can chain several ShaderBlocks so one can include another one, just use the same syntaxis using pragmas.
Just be careful of not creating recursive loops.

```cpp
//from my ShaderBlock "morphing"...
#pragma shaderblock "morphing_texture"
```

## Conditional ShaderBlocks

Sometimes you want to have a ShaderBlock that can include optionaly another one based on if that other ShaderBlock is enabled or not.
This may seem strange but it is common when we have a ShaderBlock that can be affected by other ShaderBlocks, for instance lighting is a ShaderBlock but Shadowing is another ShaderBlock and there are different Shadowing techniques.

To solve this a ShaderBlock can include a ShaderBlock but instead of specifying the name, it can specify a dynamic name that will be read from the ShaderBlock context:

```
//the name of the block doesnt have quotes, because it is a dynamic name
#pragma shaderblock morphing_mode
```

This means that the shaderblock name will be extracted from that variable inside the context (in this case ```morphing_mode``` is the variable).

The variable name can be defined from the ShaderBlock and only will be assigned if that ShaderBlock is enabled.

```javascript
var morphing_texture_block = new LS.ShaderBlock("morphing_texture");
morphing_texture_block.defineContextMacros( { "morphing_mode": "morphing_texture"} );
```

This was created so ShaderBlocks could have some level of dynamism.

## Preprocessor macros

Sometimes you want the code to be executed only if a certain shaderblock is enabled, in that case every shaderblock enabled defines the macro with its name in uppercase prefixed with "BLOCK_":

```glsl
  #ifdef BLOCK_MORPHING_TEXTURE
    //...
  #endif
```

## Example of global ShaderBlock 

Here is an example of a ShaderBlock that inject code in the global pipeline (in this case to render using a paraboloid approach):

```
//@paraboloid render
var code = '''
  gl_Position = u_view * vec4(v_pos,1.0);
  // Store the distance
  highp float Distance = -gl_Position.z;
  // Calculate and set the X and Y coordinates
  gl_Position.xyz = normalize(gl_Position.xyz);
  gl_Position.xy /= 1.0 - gl_Position.z;
  // Calculate and set the Z and W coordinates
  gl_Position.z = (Distance / u_camera_planes.y) * 2.0 - 1.0;
  gl_Position.w = 1.0;
''';

var paraboloid_block = new LS.ShaderBlock("paraboloid");
paraboloid_block.bindEvent("vs_final", code);
paraboloid_block.register();

this.onSceneRender = function()
{
  LS.Renderer._current_render_settings.frustum_culling = false;
	LS.Renderer.enableFrameShaderBlock( paraboloid_block );
}
```

## Conclusion

Check the ```LS.ShaderMaterial```, ```LS.ShaderCode```, ```LS.ShaderManager```, ```LS.ShaderBlock``` and ```LS.GLSLCode``` to understand better how it works.

Also check the ```LS.Components.MorphDeformer``` component as a complete use-case.

