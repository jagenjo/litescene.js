# Coroutines

Sometimes you need to freeze the execution of a function for some time, 
or till the next frame, but you do not want to rely on setTimeout or Promises that makes your code harder to read.

Thanks to Javascript ES6 the language supports coroutines using the keyword ```await```.
You just execute an async funtion to start the coroutine, this will returns a Promise that you can use to define what happens when the function finishes.

An async function can freeze execution and resume it once a Promise is resolved.

LiteScene allows to easily create two very common Promises:

- ```LS.sleep( ms )```  waits ```ms``` milliseconds and then resolves the Promise.
- ```LS.nextFrame()```  returns a promise that will be resolved when the next frame ends being rendered

Example of function that will print a message every second till the time expires:

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
