//Global Scope
var trace = window.console ? console.log.bind(console) : function() {};

function toArray(v) { return Array.apply( [], v ); }
Object.defineProperty(Object.prototype, "merge", { 
    value: function(v) {
        for(var i in v)
			this[i] = v[i];
		return this;
    },
    configurable: true,
    writable: false,
	enumerable: false  // uncomment to be explicit, though not necessary
});

/**
* LS is the global scope for the global functions and containers of LiteScene
*
* @class  LS
* @namespace  LS
*/

var LS = {
	_last_uid: 0,
	generateUId: function () { return this._last_uid++; },
	catch_errors: false, //used to try/catch all possible callbacks 

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
			this.Components[ getClassName(arguments[i]) ] = arguments[i]; 
			//default methods
			if(!comp.prototype.serialize) comp.prototype.serialize = LS._serialize;
			if(!comp.prototype.configure) comp.prototype.configure = LS._configure;
			//event
			LEvent.trigger(LS,"component_registered",arguments[i]); 
		}
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
	* Register a component so it is listed when searching for new components to attach
	*
	* @method registerMaterialClass
	* @param {ComponentClass} comp component class to register
	*/
	registerMaterialClass: function(material_class) { 
		//register
		this.MaterialClasses[ getClassName(material_class) ] = material_class;

		//add extra material methods
		LS.extendClass( material_class, Material );

		//event
		LEvent.trigger(LS,"materialclass_registered",material_class);
		material_class.resource_type = "Material";
	},	

	_configure: function(o) { LS.cloneObject(o, this); },
	_serialize: function() { return LS.cloneObject(this); },

	/**
	* A front-end for XMLHttpRequest so it is simpler and more cross-platform
	*
	* @method request
	* @param {Object} request object with the fields for the request: 
    *			dataType: result type {text,xml,json,binary,arraybuffer,image}, data: object with form fields, callbacks supported: {success, error, progress}
	* @return {XMLHttpRequest} the XMLHttpRequest of the petition
	*/
	request: function(request)
	{
		if(typeof(request) === "string")
			throw("LS.request expects object, not string. Use LS.get or LS.getJSON");
		var dataType = request.dataType || "text";
		if(dataType == "json") //parse it locally
			dataType = "text";
		else if(dataType == "xml") //parse it locally
			dataType = "text";
		else if (dataType == "binary")
		{
			//request.mimeType = "text/plain; charset=x-user-defined";
			dataType = "arraybuffer";
			request.mimeType = "application/octet-stream";
		}	
		else if(dataType == "image") //special case: images are loaded using regular images request
		{
			var img = new Image();
			img.onload = function() {
				if(request.success)
					request.success.call(this);
			};
			img.onerror = request.error;
			img.src = request.url;
			return img;
		}

		//regular case, use AJAX call
        var xhr = new XMLHttpRequest();
        xhr.open(request.data ? 'POST' : 'GET', request.url, true);
		xhr.withCredentials = true;
        if(dataType)
            xhr.responseType = dataType;
        if (request.mimeType)
            xhr.overrideMimeType( request.mimeType );
        xhr.onload = function(load)
		{
			var response = this.response;
			if(this.status != 200)
			{
				var err = "Error " + this.status;
				if(request.error)
					request.error(err);
				return;
			}

			if(request.dataType == "json") //chrome doesnt support json format
			{
				try
				{
					response = JSON.parse(response);
				}
				catch (err)
				{
					if(request.error)
						request.error(err);
				}
			}
			else if(request.dataType == "xml")
			{
				try
				{
					var xmlparser = new DOMParser();
					response = xmlparser.parseFromString(response,"text/xml");
				}
				catch (err)
				{
					if(request.error)
						request.error(err);
				}
			}

			if(LS.catch_errors)
			{
				try
				{
					if(request.success)
						request.success.call(this, response);
					LEvent.trigger(xhr,"done",response);
				}
				catch (err)
				{
					LEvent.trigger(LS,"code_error",err);
				}
			}
			else
			{
				if(request.success)
					request.success.call(this, response);
				LEvent.trigger(xhr,"done",response);
			}
		};
        xhr.onerror = function(err) {
			if(request.error)
				request.error(err);
			LEvent.trigger(this,"fail", err);
		}
        xhr.send(request.data);

		return xhr;

		//return $.ajax(request);
	},

	/**
	* retrieve a file from url (you can bind LEvents to done and fail)
	* @method get
	* @param {string} url
	* @param {object} params form params
	* @param {function} callback
	*/
	get: function(url, data, callback)
	{
		if(typeof(data) == "function")
		{
			data = null;
			callback = data;
		}
		return LS.request({url:url, data:data, success: callback});
	},

	/**
	* retrieve a JSON file from url (you can bind LEvents to done and fail)
	* @method getJSON
	* @param {string} url
	* @param {object} params form params
	* @param {function} callback
	*/
	getJSON: function(url, data, callback)
	{
		if(typeof(data) == "function")
		{
			data = null;
			callback = data;
		}
		return LS.request({url:url, data:data, dataType:"json", success: callback});
	},

	/**
	* retrieve a text file from url (you can bind LEvents to done and fail)
	* @method getText
	* @param {string} url
	* @param {object} params form params
	* @param {function} callback
	*/
	getText: function(url, data, callback)
	{
		if(typeof(data) == "function")
		{
			data = null;
			callback = data;
		}
		return LS.request({url:url, dataType:"txt", success: callback});
	}

};



/**
* copy the properties (methods and attributes) of origin class into target class
* @method extendClass
* @param {Class} target
* @param {Class} origin
*/

LS.extendClass = function extendClass( target, origin ) {
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
}

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
function cloneObject(object, target)
{
	var o = target || {};
	for(var i in object)
	{
		if(i[0] == "_" || i.substr(0,6) == "jQuery") //skip vars with _ (they are private)
			continue;

		var v = object[i];
		if(v == null)
			o[i] = null;			
		else if ( isFunction(v) )
			continue;
		else if (typeof(v) == "number" || typeof(v) == "string")
			o[i] = v;
		else if( v.constructor == Float32Array ) //typed arrays are ugly when serialized
			o[i] = Array.apply( [], v ); //clone
		else if ( isArray(v) )
		{
			if( o[i] && o[i].constructor == Float32Array ) //reuse old container
				o[i].set(v);
			else
				o[i] = JSON.parse( JSON.stringify(v) ); //v.slice(0); //not safe using slice because it doesnt clone content, only container
		}
		else //slow but safe
			o[i] = JSON.parse( JSON.stringify(v) );
	}
	return o;
}
LS.cloneObject = cloneObject;

/**
* Returns an object class name (uses the constructor toString)
* @method getObjectClassName
* @param {Object} the object to see the class name
* @return {String} returns the string with the name
*/
function getObjectClassName(obj) {
    if (obj && obj.constructor && obj.constructor.toString) {
        var arr = obj.constructor.toString().match(
            /function\s*(\w+)/);

        if (arr && arr.length == 2) {
            return arr[1];
        }
    }
    return undefined;
}
LS.getObjectClassName = getObjectClassName;


/**
* Returns an string with the class name
* @method getClassName
* @param {Object} class object
* @return {String} returns the string with the name
*/
function getClassName(obj) {
    if (obj && obj.toString) {
        var arr = obj.toString().match(
            /function\s*(\w+)/);

        if (arr && arr.length == 2) {
            return arr[1];
        }
    }
    return undefined;
}
LS.getClassName = getClassName;

/**
* Returns the attributes of one object and the type
* @method getObjectAttributes
* @param {Object} object
* @return {Object} returns object with attribute name and its type
*/

function getObjectAttributes(object)
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
		if(i[0] == "_" || i.substr(0,6) == "jQuery") //skip vars with _ (they are private)
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
		else if ( isFunction(v) )
			continue;
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
				o[i] = "*";
		}
		else
			o[i] = "*";
	}
	return o;
}
LS.getObjectAttributes = getObjectAttributes;

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



