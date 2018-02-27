# Coroutines

Sometimes you need to halt the execution of a function for some time, or till the next frame, or till the user clicks the mouse,
and resume it afterwards, but you do not want to rely on setTimeout or Promises that makes your code harder to read.

Thanks to Javascript ES6 the language supports coroutines using the keyword ```await```.
First, you need to define a function as ```async function```. When you call this function, it will be executed till it find the keyword ```await```, then it will halt till the Promise next to await is resolved, meanwhile the function will return another Promise. You can use that promise to control what to do once the async function finalizes.

It sounds tricky but once you get used it helps creating simpler function that have several actions chained.

LiteScene allows to easily create some very common Promises:

- ```LS.sleep( ms )```  waits ```ms``` milliseconds and then resolves the Promise.
- ```LS.nextFrame()```  returns a promise that will be resolved when the next frame ends being rendered
- ```LS.Input.mouseClick()```  returns a promise that will be resolved when the user clicks the screen

Example of function that will print a message every second till the time expires without using any callback:

```js
this.showMessageDuring = async function( time )
{
  var end_time = scene.time + time;
  while( scene.time < end_time )
  {
    console.log( "time", scene.time );
    scene.requestFrame();
    await LS.sleep(1000); //here we wait till the promise is resolved after 1000 ms
  }
}
```

If you want to execute something once the async function has finished, you can use the returned promise:

```js
this.showMessageDuring( 10 ).then( function(){ console.log("done!"} );
```

Another example that changes the color when we click:

```js
this.changeColors = async function()
{
  while( 1 )
  {
    vec3.random( material.color );
    var event = await LS.Input.mouseClick();
    scene.requestFrame();
  }
}
```
