//Global Scope
var trace = window.console ? console.log.bind(console) : function() {};

//better array conversion to string for serializing
var typed_arrays = [ Uint8Array, Int8Array, Uint16Array, Int16Array, Uint32Array, Int32Array, Float32Array, Float64Array ];
typed_arrays.forEach( function(v) { v.prototype.toJSON = function(){ return Array.prototype.slice.call(this); } } );

/**
* LS is the global scope for the global functions and containers of LiteScene
*
* @class  LS
* @namespace  LS
*/

var LS = {

	//vars used for uuid genereration
	_last_uid: 1,
	_uid_prefix: "@", //WARNING: must be one character long

	/**
	* Generates a UUID based in the user-agent, time, random and sequencial number. Used for Nodes and Components.
	* @method generateUId
	* @return {string} uuid
	*/
	generateUId: function ( prefix, suffix ) {
		prefix = prefix || "";
		suffix = suffix || "";
		var str = this._uid_prefix + prefix + (window.navigator.userAgent.hashCode() % 0x1000000).toString(16) + "-"; //user agent
		str += (GL.getTime()|0 % 0x1000000).toString(16) + "-"; //date
		str += Math.floor((1 + Math.random()) * 0x1000000).toString(16) + "-"; //rand
		str += (this._last_uid++).toString(16); //sequence
		str += suffix;
		return str; 
	},

	/**
	* validates name string to ensure there is no forbidden characters
	* valid characters are letters, numbers, spaces, dash, underscore and dot
	* @method validateName
	* @param {string} name
	* @return {boolean} 
	*/
	validateName: function(v)
	{
		var exp = /^[a-z\s0-9-_.]+$/i; //letters digits and dashes
		return v.match(exp);
	},

	catch_errors: false, //used to try/catch all possible callbacks (used mostly during development inside an editor)

	/**
	* Contains all the registered components
	* 
	* @property Components
	* @type {Object}
	* @default {}
	*/
	Components: {},

	/**
	* Register a component (or several) so it is listed when searching for new components to attach
	*
	* @method registerComponent
	* @param {ComponentClass} c component class to register
	*/
	registerComponent: function( c ) { 
		//allows to register several at the same time
		for(var i in arguments)
		{
			var component = arguments[i];
			var name = LS.getClassName( component );

			//register
			this.Components[ name ] = component; 

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

			//checks for errors
			if( !!component.prototype.onAddedToNode != !!component.prototype.onRemovedFromNode ||
				!!component.prototype.onAddedToScene != !!component.prototype.onRemovedFromScene )
				console.warn("Component could have a bug, check events: " + name);

			//add default methods
			LS.extendClass( component, LS.Component );

			//event
			LEvent.trigger(LS, "component_registered", component ); 
		}
	},

	/**
	* Tells you if one class is a registered component class
	*
	* @method isClassComponent
	* @param {ComponentClass} comp component class to evaluate
	* @return {boolean} true if the component class is registered
	*/
	isClassComponent: function( comp_class )
	{
		var name = this.getClassName( comp_class );
		return !!this.Components[name];
	},

	/**
	* Is a wrapper for callbacks that throws an LS "code_error" in case something goes wrong (needed to catch the error from the system)
	* @method safeCall
	* @param {function} callback
	* @param {array} params
	* @param {object} instance
	*/
	safeCall: function(callback, params, instance)
	{
		if(!LS.catch_errors)
			return callback.apply( instance, params );

		try
		{
			return callback.apply( instance, params );
		}
		catch (err)
		{
			LEvent.trigger(LS,"code_error",err);
			//test this
			//throw new Error( err.stack );
			console.error( err.stack );
		}
	},

	/**
	* Is a wrapper for setTimeout that throws an LS "code_error" in case something goes wrong (needed to catch the error from the system)
	* @method setTimeout
	* @param {function} callback
	* @param {number} time in ms
	* @param {number} timer_id
	*/
	setTimeout: function(callback, time)
	{
		if(!LS.catch_errors)
			return setTimeout( callback,time );

		try
		{
			return setTimeout( callback,time );
		}
		catch (err)
		{
			LEvent.trigger(LS,"code_error",err);
		}
	},

	/**
	* Is a wrapper for setInterval that throws an LS "code_error" in case something goes wrong (needed to catch the error from the system)
	* @method setInterval
	* @param {function} callback
	* @param {number} time in ms
	* @param {number} timer_id
	*/
	setInterval: function(callback, time)
	{
		if(!LS.catch_errors)
			return setInterval( callback,time );

		try
		{
			return setInterval( callback,time );
		}
		catch (err)
		{
			LEvent.trigger(LS,"code_error",err);
		}
	},

	/**
	* copy the properties (methods and properties) of origin class into target class
	* @method extendClass
	* @param {Class} target
	* @param {Class} origin
	*/
	extendClass: function( target, origin ) {
		for(var i in origin) //copy class properties
		{
			if(target.hasOwnProperty(i))
				continue;
			target[i] = origin[i];
		}

		if(origin.prototype) //copy prototype properties
			for(var i in origin.prototype) //only enumerables
			{
				if(!origin.prototype.hasOwnProperty(i)) 
					continue;

				if(target.prototype.hasOwnProperty(i)) //avoid overwritting existing ones
					continue;

				//copy getters 
				if(origin.prototype.__lookupGetter__(i))
					target.prototype.__defineGetter__(i, origin.prototype.__lookupGetter__(i));
				else 
					target.prototype[i] = origin.prototype[i];

				//and setters
				if(origin.prototype.__lookupSetter__(i))
					target.prototype.__defineSetter__(i, origin.prototype.__lookupSetter__(i));
			}
	},

	/**
	* Clones an object (no matter where the object came from)
	* - It skip attributes starting with "_" or "jQuery" or functions
	* - to the rest it applies JSON.parse( JSON.stringify ( obj ) )
	* - use it carefully
	* @method cloneObject
	* @param {Object} object the object to clone
	* @param {Object} target=null optional, the destination object
	* @return {Object} returns the cloned object
	*/
	cloneObject: function(object, target, recursive)
	{
		var o = target || {};
		for(var i in object)
		{
			if(i[0] == "_" || i.substr(0,6) == "jQuery") //skip vars with _ (they are private)
				continue;

			var v = object[i];
			if(v == null)
				o[i] = null;			
			else if ( isFunction(v) ) //&& Object.getOwnPropertyDescriptor(object, i) && Object.getOwnPropertyDescriptor(object, i).get )
				continue;//o[i] = v;
			else if (v.constructor === Number || v.constructor === String || v.constructor === Boolean )
				o[i] = v;
			else if( v.constructor == Float32Array ) //typed arrays are ugly when serialized
				o[i] = Array.apply( [], v ); //clone
			else if ( isArray(v) )
			{
				if( o[i] && o[i].set && o[i].length >= v.length ) //reuse old container
					o[i].set(v);
				else
					o[i] = JSON.parse( JSON.stringify(v) ); //v.slice(0); //not safe using slice because it doesnt clone content, only container
			}
			else //object: 
			{
				if(v.toJSON)
					o[i] = v.toJSON();
				else if(recursive)
					o[i] = LS.cloneObject( v, null, true );
				else if(LS.catch_errors)
				{
					try
					{
						//prevent circular recursions //slow but safe
						o[i] = JSON.parse( JSON.stringify(v) );
					}
					catch (err)
					{
						console.error(err);
					}
				}
				else //slow but safe
					o[i] = JSON.parse( JSON.stringify(v) );
			}
		}
		return o;
	},

	/**
	* Clears all the uids inside this object and children (it also works with serialized object)
	* @method clearUIds
	* @param {Object} root could be a node or an object from a node serialization
	*/
	clearUIds: function(root)
	{
		if(root.uid)
			delete root.uid;

		var components = root.components;
		if(!components && root.getComponents)
			components = root.getComponents();

		if(!components)
			return;

		if(components)
		{
			for(var i in components)
			{
				var comp = components[i];
				if(comp[1].uid)
					delete comp[1].uid;
				if(comp[1]._uid)
					delete comp[1]._uid;
			}
		}

		var children = root.children;
		if(!children && root.getChildren)
			children = root.getChildren();

		if(!children)
			return;
		for(var i in children)
			LS.clearUIds(children[i]);
	},


	/**
	* Returns an object class name (uses the constructor toString)
	* @method getObjectClassName
	* @param {Object} the object to see the class name
	* @return {String} returns the string with the name
	*/
	getObjectClassName: function(obj)
	{
		if (!obj)
			return;

		if(obj.constructor.name)
			return obj.constructor.name;

		var arr = obj.constructor.toString().match(
			/function\s*(\w+)/);

		if (arr && arr.length == 2) {
			return arr[1];
		}
	},

	/**
	* Returns an string with the class name
	* @method getClassName
	* @param {Object} class object
	* @return {String} returns the string with the name
	*/
	getClassName: function(obj)
	{
		if (!obj)
			return;

		//from function info, but not standard
		if(obj.name)
			return obj.name;

		//from sourcecode
		if(obj.toString) {
			var arr = obj.toString().match(
				/function\s*(\w+)/);
			if (arr && arr.length == 2) {
				return arr[1];
			}
		}
	},

	/**
	* Returns the public properties of one object and the type
	* @method getObjectProperties
	* @param {Object} object
	* @return {Object} returns object with attribute name and its type
	*/
	//TODO: merge this with the locator stuff
	getObjectProperties: function( object )
	{
		if(object.getProperties)
			return object.getProperties();
		var class_object = object.constructor;
		if(class_object.properties)
			return class_object.properties;

		var o = {};
		for(var i in object)
		{
			//ignore some
			if(i[0] == "_" || i[0] == "@" || i.substr(0,6) == "jQuery") //skip vars with _ (they are private)
				continue;

			if(class_object != Object)
			{
				var hint = class_object["@"+i];
				if(hint && hint.type)
				{
					o[i] = hint.type;
					continue;
				}
			}

			var v = object[i];
			if(v == null)
				o[i] = null;
			else if ( isFunction(v) )//&& Object.getOwnPropertyDescriptor(object, i) && Object.getOwnPropertyDescriptor(object, i).get )
				continue; //o[i] = v;
			else if (  v.constructor === Boolean )
				o[i] = "boolean";
			else if (  v.constructor === Number )
				o[i] = "number";
			else if ( v.constructor === String )
				o[i] = "string";
			else if ( v.buffer && v.buffer.constructor === ArrayBuffer ) //typed array
			{
				if(v.length == 2)
					o[i] = "vec2";
				else if(v.length == 3)
					o[i] = "vec3";
				else if(v.length == 4)
					o[i] = "vec4";
				else if(v.length == 9)
					o[i] = "mat3";
				else if(v.length == 16)
					o[i] = "mat4";
				else
					o[i] = 0;
			}
			else
				o[i] = 0;
		}
		return o;
	},

	//TODO: merge this with the locator stuff
	setObjectProperty: function(obj, name, value)
	{
		if(obj.setProperty)
			return obj.setProperty(name, value);

		//var prev = obj[ name ];
		//if(prev && prev.set)
		//	prev.set( value ); //for typed-arrays
		//else
			obj[ name ] = value; //clone¿?
	},

	//solution from http://stackoverflow.com/questions/979975/how-to-get-the-value-from-the-url-parameter
	queryString: function () {
	  // This function is anonymous, is executed immediately and 
	  // the return value is assigned to QueryString!
	  var query_string = {};
	  var query = window.location.search.substring(1);
	  var vars = query.split("&");
	  for (var i=0;i<vars.length;i++) {
		var pair = vars[i].split("=");
			// If first entry with this name
		if (typeof query_string[pair[0]] === "undefined") {
		  query_string[pair[0]] = decodeURIComponent(pair[1]);
			// If second entry with this name
		} else if (typeof query_string[pair[0]] === "string") {
		  var arr = [ query_string[pair[0]],decodeURIComponent(pair[1]) ];
		  query_string[pair[0]] = arr;
			// If third or later entry with this name
		} else {
		  query_string[pair[0]].push(decodeURIComponent(pair[1]));
		}
	  } 
		return query_string;
	}(),

	/**
	* Contains all the registered material classes
	* 
	* @property MaterialClasses
	* @type {Object}
	* @default {}
	*/
	MaterialClasses: {},

	/**
	* Register a Material class so it is listed when searching for new materials to attach
	*
	* @method registerMaterialClass
	* @param {ComponentClass} comp component class to register
	*/
	registerMaterialClass: function(material_class) { 
		//register
		this.MaterialClasses[ LS.getClassName(material_class) ] = material_class;

		//add extra material methods
		LS.extendClass( material_class, Material );

		//event
		LEvent.trigger(LS,"materialclass_registered",material_class);
		material_class.resource_type = "Material";
	}
}

/**
* LSQ allows to set or get values easily from the global scene, using short strings as identifiers
*
* @class  LSQ
*/
var LSQ = {
	/**
	* Assigns a value to a property of one node in the scene, just by using a string identifier
	* Example:  LSQ.set("mynode|a_child/MeshRenderer/enabled",false);
	*
	* @method set
	* @param {String} locator the locator string identifying the property
	* @param {*} value value to assign to property
	*/
	set: function( locator, value )
	{
		LS.GlobalScene.setPropertyValue( locator, value );
		LS.GlobalScene.refresh();
	},

	/**
	* Retrieves the value of a property of one node in the scene, just by using a string identifier
	* Example: var value = LSQ.get("mynode|a_child/MeshRenderer/enabled");
	*
	* @method get
	* @param {String} locator the locator string identifying the property
	* @return {*} value of the property
	*/
	get: function( locator )
	{
		var info = LS.GlobalScene.getPropertyInfo( locator );
		if(info)
			return info.value;
	},

	/**
	* Shortens a locator that uses unique identifiers to a simpler one, but be careful, because it uses names instead of UIDs it could point to the wrong property
	* Example: "@NODE--a40661-1e8a33-1f05e42-56/@COMP--a40661-1e8a34-1209e28-57/size" -> "node|child/Collider/size"
	*
	* @method shortify
	* @param {String} locator the locator string to shortify
	* @return {String} the locator using names instead of UIDs
	*/
	shortify: function( locator )
	{
		if(!locator)
			return;

		var t = locator.split("/");
		var node = null;

		//already short
		if( t[0][0] != LS._uid_prefix )
			return locator;

		node = LS.GlobalScene._nodes_by_uid[ t[0] ];
		if(!node) //node not found
			return locator;

		t[0] = node.getPathName();
		if(t[1])
		{
			if( t[1][0] == LS._uid_prefix )
			{
				var compo = node.getComponentByUId(t[1]);
				if(compo)
					t[1] = LS.getObjectClassName( compo );
			}
		}
		return t.join("/");
	}
};

