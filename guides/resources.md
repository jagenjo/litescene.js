# Resources #

When working with LiteScene you will need to retrieve many resources to use during the render or to control the behaviour of the application.

Resources are instances that contain relevant information for the system, and that **could be shared among different elements** of the engine. If something contains data relative to one specific node visualization/behaviour, then that shouldnt be a resource, because that cannot be shared.

All resources are stored in a global container (```LS.ResourcesManager.resources```) so they can be retrieved easily by any element of the engine.


## Classes ##

Resources can be of many types, depending on the info they store:

- **Mesh** to store the geometry of the objects we are going to render on the scene. This class is defined in LiteGL.
- **Texture** to store the images uploaded to the GPU, this class is defined in LiteGL.
- **Prefab** to store fragments of the scene that could be instantiated many times in the scene.
- **Animation** to store tracks containing keyframes over a timeline for a property.
- **ShaderCode** to store and parse GLSL code used by ShaderMaterial.
- **Material** to store the properties of a material of any class.
- **Pack** which contains several resources in one single file (useful for deploy).
- **Resource** Generic class to store text content. Used to store javascript files, data, html, etc.

And you can create your own resource classes in case you have developed your own components that require them.

## Common properties

There is a list of properties that are added automatically to every resource uppon use:

* filename: the local filename
* fullpath: the filename including folder
* remotepath: if the resource was loaded from the server, its path in the server
* \_modified: if the resource has been modified from the server version

## Common methods

Some resource require to have some common methods to help the editor load/store them:

* ```toData```: to serialize to any sort of data
* ```fromData```: to deserialize from any sort of data

Alternative you can define the method configure and serialize if you use JSON objects:

* ```serialize```: convert to JSON object
* ```configure```: reads state from JSON object

There are some special resources (like Mesh,Texture and Prefab/Pack) that do not use this methods as they already have special parsers to deal with this.

## Fullpath ##

Every single resource should have a string to identify it in the system, this string is usually the filename or the url to fetch the file.

In case a resource should **not** be loaded or stored in the server (a local resource) the name should start with the character colon ':'.

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
- ```resourceModified( resource )``` to indicate that a resource has been modified in case it must be saved on the server

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
  //res is the resource after parsing
  //if the res is a simple text file, then res.data contains the data
}

```

# Custom Resource Type

By default LiteScene comes with several Resource types but sometimes when creating a new type of component it could require to use a custom Resource Type.

Every components will store the info inside the scene JSON when the scene is serialized and saved, so you don't needto create a custom Resource for your component, unless that piece of data could be shared among different components of your scene (or in other scenes).

In the case that you want the data to me shared, then you can use a Resource class.

If your resource is just a bunch of data (text or binary) and most of the use of that data is done from the component itself, then you don't need to create your own resource class. Instead you can use just the ```LS.Resource``` which allows to store general data (in string or ArrayBuffer format). 

For instance if your component requires to store large quantities of binary format and you don't want to store that data inside the scene JSON to make it lighter, then you can use a ```LS.Resource``` in your component.

But if you want the resource to store the data in an structured way, (for example if your data requires to be parsed) and you want to have methods to interact with that data, and that data could be shared, then you must create your own class for that resource.

Here are the steps to create your own resource type:

- Create a class for your resource 
- Define the static property FORMAT **in the class** with the next properties:
   - extension: the string with the file extension associated to this resource
   - dataType: the dataType when requesting this file (could be "text" or "binary")
- Register the resource class in the system

The FORMAT is necessary so when the engine loads that file knows how to process it and which class is associated with it.

Here is an example of a custom Resource class:

```js

function MyResourceClass()
{
   //...
}

MyResourceClass.FORMAT = { extension: "myres", dataType: "text" }

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
```

And if your component can have a property (like filename) pointing to a resource of this type, and want to  help the editor to add the according widget then you must tip the editor telling the type of that property:

```js
MyComponent["@filename"] = { widget: "resource", resource_classname:"MyResourceClass" };
```

For more info about File Formats, [check the file format guide](fileformats.md)

## Resources in the editor

Some resources are usually edited from the editor, so you will need to have a proper way to interact with this resource from WebGLStudio.

This implies having probably a widget in charge of creating an editor for that resource (like Timeline for Animations, GraphEditor for graphs, or Codepad for Scripts).

There are examples of widgets in the ```js/widgets/ui/``` folder of webglstudio.

Also if a resource is modified from the editor, you must call ```LS.ResourcesManager.resourceModified( resource )``` function that will mark this resource as *must be saved*, otherwise the editor won't know it must be saved again:

```js
resource.myprop = 10;
LS.ResourcesManager.resourceModified( resource );
```

Also if you want to save a Resource in the server from the editor (it only works in webglstudio), you must call:

```js
DriveModule.saveResource( res, on_complete ); //callback when the resource has been saved
```

# Inspector

By default the editor will create an interface to inspect a resource, but if you want to create your custom editor for your resource you can define the method inspect:

```js
MyResourceClass.prototype.inspect = function( widgets )
{
   var that = this;
   widgets.addString("foo", this.faa, { callback: function(v){
      that.faa = v;
   }});
}
```

For more info about inspecting instances, check [the guide in LiteGUI](https://github.com/jagenjo/litegui.js/blob/master/guides/inspector.md)
