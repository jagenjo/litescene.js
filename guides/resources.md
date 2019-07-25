# Resources #

When working with LiteScene you will need to retrieve many resources to use during the render or to control the behaviour of the application.

## Classes ##

Resources can be of many types, depending on the info they store:

- **Mesh** to store the geometry of the objects we are going to render on the scene. This class is defined in LiteGL.
- **Texture** to store the images uploaded to the GPU, this class is defined in LiteGL.
- **Prefab** to store fragments of the scene that could be instantiated many times in the scene.
- **Animation** to store tracks containing keyframes over a timeline for a property.
- **ShaderCode** to store and parse GLSL code used by ShaderMaterial.
- **Resource** Generic class to store text content. Used to store javascript files, data, html, etc.
- **Material** to store the properties of a material of any class.
- **Pack** which contains several resources in one single file (useful for deploy).

## Fullpath ##

Every single resource should have a string to identify it in the system, this string is usually the filename or the url to fetch the file.

In case a resource should not be loaded or stored in the server (a local resource) the name should start with the character colon ':'.

To access the fullpath of any resource you can get if using the property fullpath.

Although some resources could have also the property filename (a file without a folder yet) or remotepath (the name in the server), the important thing to take into account is that all should have a fullpath.


## ResourcesManager ##

There is a global class called the ```LS.ResourcesManager``` (also abreviated as ```LS.RM```) which is in charge of loading, processing and storing all resources available by the system.

This way we can ensure that we are not loading a resource twice, or bind events when new resources are loaded.

There are many methods in the ```LS.ResourcesManager``` class, so check the documentation carefully to understand all its features.

Here is a list of the common methods:

- ```load( fullpath, options, on_complete)``` used to ask the ResourcesManager to load a resource, you can pass a list of options of how the file should be processed once is loaded, and a final callback( resource, url ) to call once the file has been loaded. If the file is already loaded it wont load it again.
- ```getResource( fullpath )``` to retrieve a resource, if not found null is returned.
- ```registerResource( filename, resource )``` to make a resource available to the system
- ```unregisterResource( resource )``` to remove a resource from the system

Resources are stored in a container called ```LS.ResourcesManager.resources``` but also there are independent containers for textures and meshes to speed up fetching.

## Paths ##

When loading resources we could need to fetch the files using a root folder as a base path, this way resources do not need to have absolute paths.

The paths where the resources will be loaded is specified using the ```LS.ResourcesManager.setPath``` and stored in the ```path``` property.

To avoid cross-site origin scripting problems, the ResourcesManager allows to specify a path that will be used as a root path when fetching remote files, it is stored in the ```proxy``` property.

## Formats ##

Every resource must be loaded and parsed, and depending on the type this process could differ (like if it is a text file or a binary file).

All that information is controlled by the LS.Formats class, that contains information about every fileformat supported by the system.

To know more about File Formats check the [File Formats guide](fileformats.md)

## Example to retrieve a Resource

```js
this.onStart = function()
{
   var that = this;
   LS.ResourcesManager.load("data/myfile.txt", function(res) {
      that.processData( res );
   });
}

this.processData = function( res )
{
  res.data //contains all the data
}

```

# Creating your own Resource Type

By default LiteScene comes with several Resource types (like Texture, Mesh, Animation, Graph, Script, ...).

But sometimes your components require to allow the developer to select some resource that is stored in the server (like the Animation from a PlayAnimation).

If your resource is just a bunch of data (text or binary) and most of the use of that data is done from the component itself, then you can use just the ```LS.Resource``` which allows to store general data (in string or ArrayBuffer format).

But if you want the resource to store the data in an structured way, (for example if your data requires to be parsed) and you want to have methods to interact with that data, then you must create your own class for that resource.

Here are the steps to create your own resource type:

- Create a class that contains your resource
- Define some important properties in that class
- Register the resource class
- Register the data parser for that class

```js

function MyResourceClass()
{
   //...
}

MyResourceClass.prototype.fromData = function(data)
{
   //parse and fill the instance
}

MyResourceClass.prototype.toData = function()
{
   //generate data
   return data;
}

//register in the system
LS.registerResourceClass( MyResourceClass );

//register the parser
var parserMYFORMAT = {
	extension: 'myextension',
	type: 'formatName',
	resource: 'MyResourceClass',
	format: 'text', //could be arrayBuffer
	dataType:'text',

	parse: function(data, options)
	{
      //create your own class
		var myres = new MyResourceClass();
      
      //parse it
		myres.fromData(data);
      
      //return the resource instance
		return myres;
	}
}

LS.Formats.addSupportedFormat( "myextension", parserMYFORMAT );

```

And if your component can have a property (like filename) pointing to a resource of this type, and want to  help the editor to add the according widget then you must tip the editor telling the type of that property:

```js
MyComponent["@filename"] = { widget: "resource", resource_classname:"MyResourceClass" };
```


