// ******* LScript  **************************

/**
* LScript allows to compile code during execution time having a clean context
* It adds some syntactic features and controls errors in a safe way
* @class LScript
* @constructor
*/

function LScript()
{
	this.code = "function update(dt) {\n\n}";
	this.exported_callbacks = []; //detects if there is a function with this name and exports it as a property
	this.extracode = "";
	this.extra_methods = null; //add object with methods here to attach methods
}


LScript.onerror = null; //global used to catch errors in scripts

LScript.eval = function(argv_names,code) { return eval("(function("+argv_names+"){\n"+code+"\n})"); }; //not used

LScript.catch_exceptions = false;
LScript.show_errors_in_console = true;

//compiles the string, tryes to keep the current state
LScript.prototype.compile = function( arg_vars, save_context_vars )
{
	var argv_names = [];
	var argv_values = [];
	if(arg_vars)
	{
		for(var i in arg_vars)
		{
			argv_names.push(i);
			argv_values.push( arg_vars[i]);
		}
	}
	argv_names = argv_names.join(",");

	var code = this.code;
	code = LScript.expandCode( code );

	var extra_code = "";
	for(var i in this.exported_callbacks)
	{
		var callback_name = this.exported_callbacks[i];
		extra_code += "	if(typeof("+callback_name+") != 'undefined' && "+callback_name+" != window[\""+callback_name+"\"] ) this."+callback_name + " = "+callback_name+";\n";
	}
	code += extra_code;
	this._last_executed_code = code;

	var old_context = this._context;

	if(!LScript.catch_exceptions)
	{
		this._class = new Function(argv_names, code);//<-- PARSING POINT HERE ***************************************
		var context_function = LScript.applyToConstructor( this._class, argv_values, this.extra_methods ); //bind globals and methods to context
		this._context = new context_function(); //<-- EXECUTION POINT HERE ***************************************
	}
	else
	{
		try
		{
			//LScript.eval(argv_names,code);
			this._class = new Function(argv_names, code);
			var context_function = LScript.applyToConstructor( this._class, argv_values, this.extra_methods ); //bind globals and methods to context
			this._context = new context_function(); //<-- EXECUTION POINT HERE ***************************************
		}
		catch (err)
		{
			if(!this._class)
			{
				console.error("Parsing error in script\n" + err);
			}

			this._class = null;
			this._context = null;
			if(LScript.show_errors_in_console)
			{
				var error_line = LScript.computeLineFromError(err);
				console.error("Error in script\n" + err);
				if( console.groupCollapsed )
				{
					console.groupCollapsed("Error line: " + error_line + " Watch code");
					LScript.showCodeInConsole( this._last_executed_code, error_line );
					console.groupEnd();
				}
				else
					console.error("Error line: " + error_line);
			}
			if(this.onerror)
				this.onerror(err, this._last_executed_code);
			if(LScript.onerror)
				LScript.onerror(err, this._last_executed_code, this);
			return false;
		}
	}

	if(save_context_vars && old_context)
	{
		for(var i in old_context)
			if( this._context[i] !== undefined && old_context[i] && old_context[i].constructor !== Function && (!this._context[i] || this._context[i].constructor !== Function) )
				this._context[i] = old_context[i];
	}

	return true;
}

//does this script contains this method?
LScript.prototype.hasMethod = function(name)
{
	if(!this._context || !this._context[name] || typeof(this._context[name]) != "function") 
		return false;
	return true;
}

//argv must be an array with parameters, unless skip_expand is true
LScript.prototype.callMethod = function( name, argv, expand_parameters, parent_object )
{
	if(!this._context || !this._context[name]) 
		return;

	if(!LScript.catch_exceptions)
	{
		//call expanding parameters
		if(argv && argv.constructor === Array && expand_parameters)
			return this._context[name].apply(this._context, argv);
		//call without expanding parameters
		return this._context[name].call(this._context, argv);
	}

	try
	{
		//call expanding parameters
		if(argv && argv.constructor === Array && expand_parameters)
			return this._context[name].apply(this._context, argv);
		//call without expanding parameters
		return this._context[name].call(this._context, argv);
	}
	catch(err)
	{
		//catch error in script, detect line and show console info
		var error_line = LScript.computeLineFromError(err);
		var parent_info = ""; 
		if (parent_object && parent_object.toInfoString )
			parent_info = " from " + parent_object.toInfoString();
		console.error("Error from function " + name + parent_info + ": ", err.toString());
		if( console.groupCollapsed )
		{
			console.groupCollapsed("Error line: " + error_line + " Watch code");
			LScript.showCodeInConsole( this._last_executed_code, error_line );
			console.groupEnd();
		}
		else
			console.error("Error line: " + error_line);
		if(this.onerror)
			this.onerror({ error: err, msg: err.toString(), line: error_line, lscript: this, code: this._last_executed_code, method_name: name });
	}
}

//Given a constructor, it attaches several global arguments and methods (from kybernetikos in stackoverflow)
LScript.applyToConstructor = function(constructor, argArray, methods) {
    var args = [null].concat(argArray);
	if(methods)
		for(var i in methods)
			Object.defineProperty( constructor.prototype, i, { value: methods[i], enumerable: true });
    var factoryFunction = constructor.bind.apply(constructor, args);
    return factoryFunction;
}

//dumps all the code to the console
LScript.showCodeInConsole = function( code, error_line)
{
	if(!code)
		return;
	var lines = code.split("\n");
	var gutter_style = "display: inline-block; width: 40px; background-color:#999; color: white;";
	for(var i = 0; i < lines.length; i++ )
		if(i == error_line)
			console.log("%c "+i+". " + lines[i], "background-color: #A33; color: #FAA;" );
		else
			console.log("%c "+i+". ", gutter_style, lines[i] );
}

//remove comments and trims empty lines
LScript.cleanCode = function(code)
{
	if(!code)
		return "";

	var rx = /(\/\*([^*]|[\r\n]|(\*+([^*\/]|[\r\n])))*\*+\/)|(\/\/.*)/g;
	var code = code.replace( rx ,"");
	var lines = code.split("\n");
	var result = [];
	for(var i = 0; i < lines.length; ++i)
	{
		var line = lines[i]; 
		var pos = line.indexOf("//");
		if(pos != -1)
			line = lines[i].substr(0,pos);
		line = line.trim();
		if(line.length)
			result.push(line);
	}
	return result.join("\n");
}

// Adds some extra features to JS like:
// - support for multiline strings (this feature was introduced in ES6 but in case is not supported)
// - the use of private or public in variables.
LScript.expandCode = function(code)
{
	if(!code)
		return "";

	//allow support to multiline strings
	if( code.indexOf("'''") != -1 )
	{
		var lines = code.split("'''");
		code = "";
		for(var i = 0; i < lines.length; i++)
		{
			if(i % 2 == 0)
			{
				code += lines[i];
				continue;
			}

			code += '"' + lines[i].split("\n").join("\\n\\\n") + '"';
		}
	}

	//allow to use public var foo = 10;
	var lines = code.split("\n");
	var update = false;
	for(var i = 0; i < lines.length; ++i)
	{
		var line = lines[i].trim();
		var pos = line.indexOf(" ");
		var first_word = line.substr(0,pos);

		//all this horrendous code to parse "public var name : type = value;" and all the possible combinations
		if( first_word == "public" || first_word == "private" || first_word == "hidden" )
		{
			var index = line.indexOf("//");
			if(index != -1)
				line = line.substr(0,index); //remove one-line comments
			var index = line.lastIndexOf(";");
			if(index != -1)
				line = line.substr(0,index); //remove semicolon
			var t = line.split(" ");
			if( t[1] != 'var')
				continue;
			var text = line;
			var type = null;
			var value = "undefined";
			var equal_index = text.indexOf("=");
			if( equal_index != -1 )
			{
				value = text.substr( equal_index + 1 ).trim();
				text = text.substr( 0, equal_index ).trim();
			}

			var colon_index = text.indexOf(":");
			if(colon_index != -1)
			{
				type = text.substr( colon_index + 1 ).trim();
				text = text.substr( 0, colon_index ).trim();
			}
			var keywords = text.split(" ");

			var varname = keywords[2];
			if(!varname)
				continue;
			var type_options = {};
			if(type)
			{
				var array_index = type.indexOf('[]');
				if( array_index != -1 )
				{
					type_options.type = LS.TYPES.ARRAY;
					type_options.data_type = type.substr( 0, array_index );
					if(!value || value === "undefined")
						value = "[]";
				}
				else
				{
					type_options.type = type;
				}

				if( LS.Components[ type ] ) //for components
				{
					type_options.component_class = type;
					type_options.type = LS.TYPES.COMPONENT;
					if(!value)
						value = "null";
				}
				else if( LS.ResourceClasses[ type ] ) //for resources
				{
					type_options.resource_classname = type;
					type_options.type = LS.TYPES.RESOURCE;
					if(!value)
						value = "null";
				}
				else if( type == "int" || type == "integer")
				{
					type_options.step = 1;
					type_options.type = LS.TYPES.NUMBER;
					if(!value)
						value = 0;
				}
			}
			if( keywords[0] == "private" || keywords[0] == "hidden" )
				type_options.widget = "null";
			lines[i] = "this.createProperty('" + varname + "'," + value + ", "+JSON.stringify( type_options )+" );";
			update = true;
		}
	}
	if(update)
		code = lines.join("\n");

	return code;
}

// In case of error inside the scripts, tries to determine the error line (not as easy as it seems)
// Doesnt work in all cases
LScript.computeLineFromError = function( err )
{
	if(err.lineNumber !== undefined)
	{
		return err.lineNumber;
	}
	else if(err.stack)
	{
		var lines = err.stack.split("\n");
		var line = lines[1].trim();
		if(line.indexOf("(native)") != -1)
			return -1;
		var tokens = line.split(" ");
		var pos = line.lastIndexOf(":");
		var pos2 = line.lastIndexOf(":",pos-1);
		var num = parseInt( line.substr(pos2+1,pos-pos2-1) );
		var ch = parseInt( line.substr(pos+1, line.length - 2 - pos) );
		if(tokens[1] == "Object.CodingModule.eval")
			return -1;
		if (line.indexOf("LScript") != -1 || line.indexOf("<anonymous>") != -1 )
			num -= 3; //ignore the header lines of the LScript class
		return num;
	}
	return -1;
}


global.LScript = LScript;

