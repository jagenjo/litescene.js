# Locators

One of the nice features of LiteScene is that any property of **any component of the scene can be referenced using a unique string**.

This allows to animate properties easily from the timeline editor or connect them using graphs.

This strings are called **locators** and they have the next structure:

```"node_identifier/component_identifier/property_name"```

Where **node_identifier** could be the ```node.name``` or the ```node.uid```, and **component_identifier** could be the ```component.uid``` or the component class name (if there are two components of the same type then it will reference the first one).

Also, you can specify as node_identifier a child node from a parent node, like this ```"parent_name|child_name/..."```

Locators could point to sub properties of the object, like:

```"node_identifier/component_identifier/property_name/subproperty_name"```

But in that case the component must handle the set/get properties to work propertly.

To get the locator of a property you can call the method ```getLocator``` of the container (the component) passing the name of the property as a parameter:

```javascript
node.transform.getLocator("x"); //returns "@NODE_uid/@COMP-uid/x"
```

# Paths

Because tokenizing the string constantly is slow and generates garbage, the functions processing the locators usually do not receive the string itself but an array of string containing every token called paths:

```["node_id","component_id","property_name"]```

In some cases this functions could receive also an offset (a number) that indicates with element of the array should be used in this function (for instance, if a component method is called, then it will be 2 because 0 was the node, and 1 the component).

# LSQ

Because any variable can be accesed through a string, there is a global object called LSQ that allows to get or set using just the locator:

```js
//set
LSQ.set("mynode/Transform/x",10);

//get
var x = LSQ.get("mynode/Transform/x");
```

But keep in mind that this way is slower than using the regular object access.

# Component that support special locators

Sometimes your component may support some sort of locator property that has subproperties, in that case the component must define the next methods to process them:

- ```getPropertyInfoFromPath( path )```: must return an object telling all the required info to the system about this property
- ```setPropertyValueFromPath( path, value, offset )```: must assign the value to the given property defiend by the path

```js

MyComponent.prototype.getPropertyInfoFromPath = function( path )
{
  if(path[0] == "myproperty")
  {
    if(path.length == 1)
      return {
        name:"myproperty",
        node: this._root,
        target: this,
        type: "object",
        value: this.myproperty
  		};
    else
      return {
        name: path[1], //an string to show on the editor
        node: this._root, //to which node belongs this data
        target: this.myproperty, //to which container belongs this data
        type: "number", //the data type
        value: this.myproperty[ path[1] ], //the value
  		};    
    }
}    

MyComponent.prototype.setPropertyValueFromPath = function( path, value, offset )
{
  offset = offset||0;
  if(path[offset] == "myproperty" && path.length > offset + 1 ) //check there is a subproperty
  {
    this.myproperty[ path[offset+1] ] = value;
  }

}
```
