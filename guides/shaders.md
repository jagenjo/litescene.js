# Creating Shaders #

You can create your own shaders for your materials. This way the rendering is much faster (the pipeline doesnt have to guess the best shader for your material) and you have more control.

Shaders are stored in the ```LS.ShaderCode``` class and used by some classes, mainly ```LS.ShaderMaterial``` and some FX components.

Because shaders are usually defined by several parts (vertex shader, fragment shader, definition of external variables) they are written in a text file where every part is defined by the backlash character and the name of the part, like  ```\default.vs```, this blocks are called subfiles.

## Javascript ##

When creating a shader you may want to call some javascript functions to prepare the properties of the material containing the shader, for this purpose you can write a part in the file that contain that JS code, separated from the GLSL code of the shaders.

The subfile should be called ```\js```

```js
\js
  
this.createUniform("Scale","u_tex_scale","number",1);
this.createSampler("Texture","u_texture", { magFilter: GL.NEAREST, missing: "white"} );
this.render_state.depth_test = false;
```

This function will be called once the shader is assigned to the material.

## RenderState ##

Some properties for the rendering cannot be defined inside the GLSL code (like GPU flags) so they are defined in a class called ```LS.RenderState``` that contains all the common flags.

If you want to use an special rendering pass consider changing those, here is a list with the flags and their default types:

```js
	this.front_face = GL.CCW;
	this.cull_face = true;

	//depth buffer
	this.depth_test = true;
	this.depth_mask = true; //write in depth buffer
	this.depth_func = GL.LESS;
	//depth range: never used

	//blend function
	this.blend = false;
	this.blendFunc0 = GL.SRC_ALPHA;
	this.blendFunc1 = GL.ONE_MINUS_SRC_ALPHA;
	//blend equation

	//color mask
	this.colorMask0 = true;
	this.colorMask1 = true;
	this.colorMask2 = true;
	this.colorMask3 = true;
```


## Shader Example ##

```c++

\js
  
this.createUniform("Texture","matcap_texture","texture" );
this.createUniform("Scale","u_tex_scale","number",1);
this.render_state.cull_face = false;

\default.vs

precision mediump float;
attribute vec3 a_vertex;
attribute vec3 a_normal;
attribute vec2 a_coord;

//varyings
varying vec3 v_pos;
varying vec3 v_normal;
varying vec2 v_uvs;

//matrices
uniform mat4 u_model;
uniform mat4 u_normal_model;
uniform mat4 u_view;
uniform mat4 u_viewprojection;

//globals
uniform float u_time;
uniform vec4 u_viewport;
uniform float u_point_size;

//camera
uniform vec3 u_camera_eye;
void main() {
	
	vec4 vertex4 = vec4(a_vertex,1.0);
	v_normal = a_normal;
	v_uvs = a_coord;
	
	//vertex
	v_pos = (u_model * vertex4).xyz;
	//normal
	v_normal = (u_normal_model * vec4(v_normal,1.0)).xyz;
	gl_Position = u_viewprojection * vec4(v_pos,1.0);
}

\default.fs

precision mediump float;
//varyings
varying vec3 v_pos;
varying vec3 v_normal;
varying vec2 v_uvs;
//globals
uniform vec4 u_clipping_plane;
uniform float u_time;
uniform vec3 u_background_color;
uniform vec3 u_ambient_light;

uniform mat4 u_view;
uniform sampler2D matcap_texture;
uniform float u_tex_scale;
uniform vec3 u_camera_eye;

//material
uniform vec4 u_material_color; //color and alpha

void main() {

  vec3 N = normalize(v_normal);
  vec3 E = normalize(u_camera_eye - v_pos);
  N = reflect(N,E);
  vec3 view_normal = (u_view * vec4(N,0.0)).xyz;
  
  vec2 coord = view_normal.xy;

  vec3 matcap_color = texture2D( matcap_texture, coord * 0.48 * u_tex_scale + vec2(0.5) ).xyz;
  
	gl_FragColor = vec4( matcap_color * u_material_color.xyz, 1.0);

}

```
