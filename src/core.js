//Global Scope
var trace = window.console ? console.log.bind(console) : function() {};
function toArray(v) { return Array.apply( [], v ); }
Object.defineProperty(Object.prototype, "merge", { 
    value: function(v) {
        for(var i in v)
			this[i] = v[i];
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
        if(dataType)
            xhr.responseType = dataType;
        if (request.mimeType)
            xhr.overrideMimeType( request.mimeType );
        xhr.onload = function(load)
		{
			var response = this.response;
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
			if(request.success)
				request.success.call(this, response);
		};
        xhr.onerror = request.error;
        xhr.send(request.data);
		return xhr;

		//return $.ajax(request);
	}
};

/**
* copy the properties of one class into another class
* @method extendClass
* @param {Class} origin
* @param {Class} target
*/

function extendClass( origin, target ) {
	for(var i in origin) //copy class properties
		target[i] = origin[i];
	if(origin.prototype) //copy prototype properties
		for(var i in origin.prototype) //only enumerables
		{
			if(!origin.prototype.hasOwnProperty(i))
				continue;

			if(origin.prototype.__lookupGetter__(i))
				target.prototype.__defineGetter__(i, origin.prototype.__lookupGetter__(i));
			else 
				target.prototype[i] = origin.prototype[i];

			if(origin.prototype.__lookupSetter__(i))
				target.prototype.__defineSetter__(i, origin.prototype.__lookupSetter__(i));
		}
}
LS.extendClass = extendClass;

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
				o[i] = v.slice(0); //clone array
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




//used to generate resources that doesnt come from files (procedural textures, meshes, etc)
//right now is not finished at all
var Generators = {
	generators: {},
	addGenerator: function(name,generator) { this.generators[name] = generator; },
	executeGenerator: function(data) {
		var generator = this.generators[data.action];
		if(!generator || typeof(generator) != "function") return null;
		try
		{
			var generated = generator(data);
			generated.generator = generator;
			return generated;
		}
		catch (err)
		{
			trace("Error in generator: " + err);
		}
		return null;
	}
};

LS.Generators = Generators;

/* MATH FUNCTIONS ************************************/

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
