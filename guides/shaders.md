# Creating Shaders #

You can create your own shaders for your materials.

## Example ##

```c++

\js
  
this.createUniform("Texture","matcap_texture","texture" );
this.createUniform("Scale","u_tex_scale","number",1);


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
