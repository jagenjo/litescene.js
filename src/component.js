/*
*  Components are elements that attach to Nodes or other objects to add functionality
*  Some important components are Transform, Light or Camera
*
*	*  ctor: must accept an optional parameter with the serialized data
*	*  onAddedToNode: triggered when added to node
*	*  onRemovedFromNode: triggered when removed from node
*	*  onAddedToScene: triggered when the node is added to the scene
*	*  onRemovedFromScene: triggered when the node is removed from the scene
*	*  serialize: returns a serialized version packed in an object
*	*  configure: recieves an object to unserialize and configure this instance
*	*  getResources: adds to the object the resources to load
*	*  _root contains the node where the component is added
*
*	*  use the LEvent system to hook events to the node or the scene
*	*  never share the same component instance between two nodes
*
*/

/**
* This is an example class for a component, should never be instantiated by itself, 
* instead components get all the methods from this class attached when the component is registered.
* Components can overwrite this methods if they want.
*
* @class  Component
* @namespace  LS
*/
function Component(o)
{
	if(o)
		this.configure(o);
}

/**
* Returns the node where this components is attached
* @method getRootNode
**/
Component.prototype.getRootNode = function()
{
	return this._root;
}

/**
* Configures the components based on an object that contains the serialized info
* @method configure
* @param {Object} o object with the serialized info
**/
Component.prototype.configure = function(o)
{ 
	if(!o)
		return;
	if(o.uid) 
		this.uid = o.uid;
	/*
	{
		//special case, uid must never be enumerable to avoid showing it in the editor
		if(this.uid === undefined && !Object.hasOwnProperty(this, "uid"))
		{
			this._uid = o.uid;

			Object.defineProperty(this, "uid", { 
				set: o.uid, 
				enumerable: false,
				writable: true
			});
		}
		else
			this.uid = o.uid;
	}
	*/
	LS.cloneObject(o, this, false, true); 
}

/**
* Returns an object with all the info about this component in an object form
* @method serialize
* @return {Object} object with the serialized info
**/
Component.prototype.serialize = function()
{
	var o = LS.cloneObject(this);
	if(this.uid) //special case, not enumerable
		o.uid = this.uid;
	return o;
}

/**
* Create a clone of this node (the UID is removed to avoid collisions)
* @method clone
* @return {*} component clone
**/
Component.prototype.clone = function()
{
	var data = this.serialize();
	data.uid = null; //remove id when cloning
	var new_component = new this.constructor( data );
	return new_component;
}

/**
* To create a new property for this component adding some extra useful info to help the editor
* @method createProperty
* @param {String} name the name of the property as it will be accessed
* @param {*} value the value to assign by default to this property
* @param {String|Object} type [optional] an string identifying the type of the variable, could be "number","string","Texture","vec3","mat4", or an object with all the info
* @param {Function} setter [optional] setter function, otherwise one will be created
* @param {Function} getter [optional] getter function, otherwise one will be created
**/
Component.prototype.createProperty = function( name, value, type, setter, getter )
{
	if(type)
	{
		//control errors
		if(type == "String" || type == "Number" || type == "Boolean")
		{
			console.warn("createProperty: Basic types must be in lowercase -> " + type );
			type = type.toLowerCase();
		}

		if( typeof(type) == "object" )
			this.constructor[ "@" + name ] = type;
		else
			this.constructor[ "@" + name ] = { type: type };
	}

	//basic type
	if(  (value === null || value === undefined || value.constructor === Number || value.constructor === String || value.constructor === Boolean) && !setter && !getter )
	{
		this[ name ] = value;
		return;
	}

	var private_name = "_" + name;

	//vector type has special type with setters and getters to avoid overwritting
	if(value && value.constructor === Float32Array)
	{
		value = new Float32Array( value ); //clone
		this[ private_name ] = value; //this could be removed...

		//create setter
		Object.defineProperty( this, name, {
			get: getter || function() { return value; },
			set: setter || function(v) { value.set( v ); },
			enumerable: true
		});
	}
	else
	{
		//define private
		Object.defineProperty( this, private_name, { 
			value: value, 
			enumerable: false
		});

		//define public
		Object.defineProperty( this, name, {
			get: getter || function() { return this[ private_name ]; },
			set: setter || function(v) { this[ private_name ] = v; },
			enumerable: true
		});
	}
}

//not finished
Component.prototype.createAction = function( name, callback, options )
{
	this[name] = callback;
	this.constructor["@" + name ] = options || { button_text:"trigger", type:"button", callback: callback };
}


/**
* Returns the locator string of this component
* @method getLocator
* @return {String} the locator string of this component
**/
Component.prototype.getLocator = function()
{
	if(!this._root)
		return "";
	return this._root.uid + "/" + this.uid;
}

/**
* Bind one object event to a method in this component
* @method bind
* @param {*} object the dispatcher of the event you want to react to
* @param {String} event the name of the event to bind to
* @param {Function} callback the callback to call
* @param {String|Object} type [optional] an string identifying the type of the variable, could be "number","string","Texture","vec3","mat4", or an object with all the info
* @param {Function} setter [optional] setter function, otherwise one will be created
* @param {Function} getter [optional] getter function, otherwise one will be created
**/
Component.prototype.bind = function( object, method, callback )
{
	var instance = this;
	if(arguments.length > 3 )
	{
		console.error("Component.bind cannot use a fourth parameter, all callbacks will be binded to the component");
		return;
	}

	if(!object)
	{
		console.error("Cannot bind to null.");
		return;
	}

	if(!callback)
	{
		console.error("You cannot bind a method before defining it.");
		return;
	}

	/*
	var found = false;
	for(var i in this)
	{
		if(this[i] == callback)
		{
			found = true;
			break;
		}
	}
	if(!found)
		console.warn("Callback function not found in this object, this is dangerous, remember to unbind it manually or use LEvent instead.");
	*/

	//store info about which objects have events pointing to this instance
	if(!this.__targeted_instances)
		Object.defineProperty( this,"__targeted_instances", { value: [], enumerable: false, writable: true });
	var index = this.__targeted_instances.indexOf( object );
	if(index == -1)
		this.__targeted_instances.push( object );

	return LEvent.bind( object, method, callback, instance );
}

Component.prototype.unbind = function( object, method, callback )
{
	var instance = this;

	var r = LEvent.unbind( object, method, callback, instance );

	//erase from targeted instances
	if( this.__targeted_instances )
	{
		if( !LEvent.hasBindTo( object, this ) )
			return r;

		var index = this.__targeted_instances.indexOf( object );
		if(index == -1)
			this.__targeted_instances.splice( index, 1 );
		if(this.__targeted_instances.length == 0)
			delete this.__targeted_instances;
	}

	return r;
}

Component.prototype.unbindAll = function()
{
	if( !this.__targeted_instances )
		return;

	for( var i = 0; i < this.__targeted_instances.length; ++i )
		LEvent.unbindAll( this.__targeted_instances[i], this );
	this.__targeted_instances = null; //delete dont work??
}

//called by register component to add setters and getters to registered Component Classes
Component.addExtraMethods = function( component )
{
	//add uid property
	Object.defineProperty( component.prototype, 'uid', {
		set: function( uid )
		{
			if(!uid)
				return;

			if(uid[0] != LS._uid_prefix)
			{
				console.warn("Invalid UID, renaming it to: " + uid );
				uid = LS._uid_prefix + uid;
			}

			if(uid == this._uid)
				return;
			//if( this._root && this._root._components_by_uid[ this.uid ] )
			//	delete this._root && this._root._components_by_uid[ this.uid ];
			this._uid = uid;
			//if( this._root )
			//	this._root && this._root._components_by_uid[ this.uid ] = this;
		},
		get: function(){
			return this._uid;
		},
		enumerable: false //uid better not be enumerable (so it doesnt show in the editor)
	});

	Object.defineProperty( component.prototype, 'root', {
		set: function( uid )
		{
			throw("root cannot be set, call addComponent to the root");
		},
		get: function(){
			return this._root;
		},
		enumerable: false //uid better not be enumerable (so it doesnt show in the editor)
	});
};




LS.Component = Component;