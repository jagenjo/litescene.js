# File Formats and Parsers #

LiteScene supports several file formats to store Meshes, Textures and Data from the Scene.

But the idea of LiteScene is to make it easy to add support to new file formats just by adding the file format parser to the system.

There are some classes in the system in charge of loading and parsing, they are ```LS.ResourcesManager``` (to load, process, and store files), and ```LS.Formats``` (to store information about how to parse a file).

To understand better the file parsing we need to see the steps taken by the LS.ResourcesManager to load a file.

## How the resources loading works ##

- We call ```LS.ResourcesManager.load``` passing the url of the resource we want to load.
- ```load``` will check the file extension info using ```LS.Formats.getFileFormatInfo( extension );``` to see if it has to force a dataType in the request. This will check for the info registered with this file format (the one passed to ```LS.Formats.addSupportedFormat```).
- Once the file is received it will be passed to ```LS.ResourcesManager.processResource``` to be processed.
- If the resource extension has a preprocessor callback it is executed. A preprocessor is a function that takes the data requested and transforms it to make it ready to be used.
  * If the preprocessor returns true it means it has to wait because the processing is async, once finished it will call ```processFinalResource```
- If no preprocessor:
 * If it is a Mesh calls ```processTextMesh``` which will call to the file format ```parse``` function
 * If it is a Scene calls ```processTextSCene```  which will call to the file format ```parse``` function
 * If it is a Texture calls ```processImage```  which will call to the file format ```parse``` function
 * If the format_info has a parse method call it
- If it is neither of those types then it is stored as a plain ```LS.Resource``` asumming it is just data.
- Once processed it calls ```processFinalResource``` which is in charge of storing the resource in the adequate container.
- Then the resource is registered in the system using the ```registerResource``` function
- Which will call to its postprocessor callback if it has any (mostly to store the resource propertly, compute extra data, etc)

All this steps are necesary because different types of resources require different actions, and also because different file types share  the same actions.

## Guide to add new file formats ##

If you have your own Resource class and you want to make it transparent for the system, the easiest way is to define the FORMAT property in the class object and give the engine the basic info:

- **extension**: which file extension is associated with this file format
- **dataType**: if the data is in "text" format (you will recieve an string) or binary format (you will receive a ArrayBuffer).

Also your class must define the fromData method (if you want to parse it) or configure method (if you expect a JSON object).

It is also useful to have the toData method in case you want to be able to update the object once modified.

here is an example of a basic resource class:

```js
MyResourceClass()
{
 //define some data
}

MyResourceClass.FORMAT = { extension:"myext", dataType:"text" };

MyResourceClass.fromData = function(data)
{
  //parse data here
}

MyResourceClass.toData = function()
{
  return "here data";
}

LS.registerResourceClass( MyResourceClass );
```

In this case when the engine loads a file with the extension specified in FORMAT.extension it will instantiate this class, call fromData and pass the data.

But sometimes you want to parse some file format associated with an existing resource class (like to parse a mesh or an image). In that case you must define a parser.

Here is a list of steps you need to do to add a new file format support:

- Create an object with all the info for the file format like:
  * **extension**: a String with the filename extension that is associated with this format (or comma separated extensions)
  * **type**: which type of resource ("image","scene",mesh"), otherwise is assumed "data"
  * **resource**: the classname to instantiate for this resource (p.e. Mesh, Texture, ...)
  * **dataType**: which dataType send with the request when requesting to server ("text","arraybuffer")
  * **skip_conversion**: if true this resource will keep its format when saved (otherwise is converted to default format for that resource type)
  * **parse**: a callback in charge of converting the data in something suitable by the system. If null then the data will be as it is received.
- Registering it to LS.Formats with ```LS.Formats.addSupportedFormat( "extension", MyFormatInfo );```
- If you want a preprocessor you need to call to ```LS.ResourcesManager.registerResourcePreProcessor(extension, callback)```
- If you want a postprocessor you need to call to ```LS.ResourcesManager.registerResourcePostProcessor( resource_classname, callback)``` but that shouldn't be necessary because all resources have already its own postprocessor.

## Example of adding support for a new fileformat

```js
//this will allow to load SRTs as text objects instead of binary objects
LS.Formats.addSupportedFormat( "srt", {
   extension: "srt",
   dataType: "text",
   parse: function(data){
    var res = new MySRT();
    res.parse(data);
    return res
   }
});
```

## Adding a new format for an existing resource

Sometimes you want to parse a file to create a resource of a class that it is already defined in the engine (for instance for a Texture).

In that case you only need to define the parser amd register it so the system knows how to fetch the file and when:

```js
var parserTGA = { 
	extension: 'tga',
	type: 'image',
	dataType:"arraybuffer",
	format: 'binary',
	skip_conversion: true, //if it shouldnt be converted to default extension

	parse: function(data, options)
	{
  //parse data and build a texture
  //return texture
	}
};

LS.Formats.addSupportedFormat( "tga", parserTGA );   
```




