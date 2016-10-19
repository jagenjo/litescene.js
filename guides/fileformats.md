# File Formats and Parsers #

LiteScene supports several file formats to store Meshes, Textures and Data from the Scene.

But the idea of LiteScene is to make it easy to add support to new file formats just by adding the file format parser to the system.

There are some classes in the system in charge of loading and parsing, they are ```LS.ResourcesManager``` (to load, process, and store files), and ```LS.Formats``` (to store information about how to parse a file).

To understand better the file parsing we need to see the steps taken by the LS.ResourcesManager to load a file.

## How the resources loading works ##

- We call ```LS.ResourcesManager.load``` passing the url of the resource we want to load.
- ```load``` will check the file extension info using ```LS.Formats.getFileFormatInfo( extension );``` to see if it has to force a dataType in the request. This will check for the info registered with this file format (the one passed to ```LS.Formats.addSupportedFormat```).
- Once the file is received it will be passed to ```LS.ResourcesManager.processResource```
- If the resource extension has a preprocessor callback it is executed. A preprocessor must return the data ready.
  * If the preprocessor returns true it means it has to wait because it is async, once finished it will call ```processFinalResource```
- If no preprocessor:
 * If if is a Mesh calls ```processASCIIMesh```
 * If it is a Scene calls ```processASCIISCene```
 * If it is a Texture calls ```processImage```
 * If the format_info has a parse method call it
- It it is neither of those types then it is stored as a plain ```LS.Resource``` asumming it is just data.
- Once processed it calls ```processFinalResource``` which is in charge of storing the resource in the adequate container.
- then the resource is registered in the system using the ```registerResource``` function
- Which will call to its postprocessor callback if it has any (mostly to store the resource propertly, compute extra data, etc)

All this steps are necesary because different types of resources require different actions, and also because different file types require the same actions.

## Guide to add new file formats ##

Adding new file formats requires several steps:

- Creating an object with all the info for the file format like:
  * **extension**: a String with the filename extension that is associated with this format
  * **type**: which type of resource
  * **resource**: the classname to instantiate for this resource
  * **format**: it is "text" or "binary"
  * **dataType**: which dataType to request when requesting to server
  * **parse**: the callback in charge of converting the data in something suitable by the system.
- Registering it to LS.Formats with ```LS.Formats.addSupportedFormat( "extension", MyFormatInfo );```
- If you want a preprocessor you need to call to ```LS.ResourcesManager.registerResourcePreProcessor( extension, callback )```
- If you want a postprocessor you need to call to ```LS.ResourcesManager.registerResourcePostProcessor( resource_classname, callback```



