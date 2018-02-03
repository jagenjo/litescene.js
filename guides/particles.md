# Particles

When rendering objects with a non-solid surface using regular triangles doesnt work.

To solve this LiteScene comes with a simple Particles engine. You just create a ```LS.Component.Particles``` and attach it to a node.

# Particles properties

Here are all the properties that every particle have:

- **id**: a different constant number for every particle
- **pos**: the position in vec3 format (to access directly you can use _pos)
-	**vel**: the velocity in vec3 format (to access directly you can use _pos)
-	**life**: remaining life in seconds
-	**angle**: angular velocity in degrees per second
- **size**: size in world units
- **rot**: current rotation in degrees


## Custom Emissor and Custom Update

If you do not want to use the default particle emissor volumes or the default update function, you can create your own functions.
You assign them to the component using the onCreateParticle and onUpdateParticle property:

```js
var particles = null;

this.onStart = function()
{
  particles = node.getComponent("ParticleEmissor");
  particles.onCreateParticle = this.onCreateParticle;
  particles.onUpdateParticle = this.onUpdateParticle;
}

this.onCreateParticle = function(p)
{
  p.pos = [Math.random()*10-5, 0, 0];
}

this.onUpdateParticle = function(p,dt)
{
  p._pos[0] = (Math.sin(p.life) - 0.5) * 10.1;
  p._pos[2] = (Math.cos(p.life) - 0.5) * 10.1;
}


this.onUpdate = function(dt)
{
	//node.scene.refresh();
}
```
