//Global Scope
var trace = window.console ? console.log.bind(console) : function() {};

function toArray(v) { return Array.apply( [], v ); }

Object.defineProperty(Object.prototype, "merge", { 
    value: function(v) {
        for(var i in v)
			this[i] = v[i];
		return this;
    },
    configurable: false,
    writable: false,
	enumerable: false  // uncomment to be explicit, though not necessary
});

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
	* @method validateName
	* @param {string} name
	* @return {boolean} 
	*/
	validateName: function(v)
	{
		var exp = /^[a-z\s0-9-_]+$/i; //letters digits and dashes
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
	* Register a component so it is listed when searching for new components to attach
	*
	* @method registerComponent
	* @param {ComponentClass} comp component class to register
	*/
	registerComponent: function(comp) { 
		for(var i in arguments)
		{
			//register
			this.Components[ LS.getClassName(arguments[i]) ] = arguments[i]; 
			//add default methods
			LS.extendClass(comp, LS.Component );

			//event
			LEvent.trigger(LS,"component_registered",arguments[i]); 
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
			else if (typeof(v) == "number" || typeof(v) == "string")
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
	* Returns the attributes of one object and the type
	* @method getObjectAttributes
	* @param {Object} object
	* @return {Object} returns object with attribute name and its type
	*/
	//TODO: merge this with the locator stuff
	getObjectAttributes: function(object)
	{
		if(object.getAttributes)
			return object.getAttributes();
		var class_object = object.constructor;
		if(class_object.attributes)
			return class_object.attributes;

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
	setObjectAttribute: function(obj, name, value)
	{
		if(obj.setAttribute)
			return obj.setAttribute(name, value);

		var prev = obj[ name ];
		if(prev && prev.set)
			prev.set( value ); //for typed-arrays
		else
			obj[ name ] = value; //clone¿?
	}
}

/**
* Samples a curve and returns the resulting value 
*
* @class LS
* @method getCurveValueAt
* @param {Array} values 
* @param {number} minx min x value
* @param {number} maxx max x value
* @param {number} defaulty default y value
* @param {number} x the position in the curve to sample
* @return {number}
*/
LS.getCurveValueAt = function(values,minx,maxx,defaulty, x)
{
	if(x < minx || x > maxx)
		return defaulty;

	var last = [ minx, defaulty ];
	var f = 0;
	for(var i = 0; i < values.length; i += 1)
	{
		var v = values[i];
		if(x == v[0]) return v[1];
		if(x < v[0])
		{
			f = (x - last[0]) / (v[0] - last[0]);
			return last[1] * (1-f) + v[1] * f;
		}
		last = v;
	}

	v = [ maxx, defaulty ];
	f = (x - last[0]) / (v[0] - last[0]);
	return last[1] * (1-f) + v[1] * f;
}

/**
* Resamples a full curve in values (useful to upload to GPU array)
*
* @method resampleCurve
* @param {Array} values 
* @param {number} minx min x value
* @param {number} maxx max x value
* @param {number} defaulty default y value
* @param {number} numsamples
* @return {Array}
*/

LS.resampleCurve = function(values,minx,maxx,defaulty, samples)
{
	var result = [];
	result.length = samples;
	var delta = (maxx - minx) / samples;
	for(var i = 0; i < samples; i++)
		result[i] = LS.getCurveValueAt(values,minx,maxx,defaulty, minx + delta * i);
	return result;
}

//work in progress to create a new kind of property called attribute which comes with extra info
//valid options are { type: "number"|"string"|"vec2"|"vec3"|"color"|"Texture"...  , min, max, step }
if( !Object.prototype.hasOwnProperty("defineAttribute") )
{
	Object.defineProperty( Object.prototype, "defineAttribute", {
		value: function( name, value, options ) {
			if(options && typeof(options) == "string")
				options = { type: options };

			var root = this;
			if(typeof(this) != "function")
			{
				this[name] = value;
				root = this.constructor;
			}
			Object.defineProperty( root, "@" + name, {
				value: options || {},
				enumerable: false
			});
		},
		enumerable: false
	});

	Object.defineProperty( Object.prototype, "getAttribute", {
		value: function( name ) {
			var v = "@" + name;
			if(this.hasOwnProperty(v))
				return this[v];
			if(this.constructor && this.constructor.hasOwnProperty(v))
				return this.constructor[v];
			return null;
		},
		enumerable: false
	});
}

//used for hashing keys:TODO move from here somewhere else
String.prototype.hashCode = function(){
    var hash = 0, i, c, l;
    if (this.length == 0) return hash;
    for (i = 0, l = this.length; i < l; ++i) {
        c  = this.charCodeAt(i);
        hash  = ((hash<<5)-hash)+c;
        hash |= 0; // Convert to 32bit integer
    }
    return hash;
};

