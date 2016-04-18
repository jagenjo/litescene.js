
/** Script is the component in charge of executing scripts to control the behaviour of the application.
* Script must be coded in Javascript and they have full access to all the engine, so one script could replace the behaviour of any part of the engine.
* Scripts are executed inside their own context, the context is local to the script so any variable defined in the context that is not attached to the context wont be accessible from other parts of the engine.
* To interact with the engine Scripts must bind callback to events so the callbacks will be called when those events are triggered, however, there are some generic methods that will be called
* @class Script
* @constructor
* @param {Object} object to configure from
*/
function Script(o)
{
	this.enabled = true;
	this._name = "Unnamed";
	this.code = "this.update = function(dt)\n{\n\t//node.scene.refresh();\n}";

	this._script = new LScript();

	this._script.extra_methods = {
		getComponent: (function() { return this; }).bind(this),
		getLocator: function() { return this.getComponent().getLocator() + "/context"; },
		createProperty: LS.Component.prototype.createProperty,
		createAction: LS.Component.prototype.createAction,
		bind: LS.Component.prototype.bind,
		unbind: LS.Component.prototype.unbind,
		unbindAll: LS.Component.prototype.unbindAll
	};

	this._script.onerror = this.onError.bind(this);
	this._script.exported_callbacks = [];//this.constructor.exported_callbacks;
	this._last_error = null;

	if(o)
		this.configure(o);
}

Script.secure_module = false; //this module is not secure (it can execute code)
Script.block_execution = false; //avoid executing code
Script.catch_important_exceptions = true; //catch exception during parsing, otherwise configuration could fail

Script.icon = "mini-icon-script.png";

Script["@code"] = {type:'script'};

Script.exported_callbacks = ["start","prefabReady","update","clicked","sceneRender", "render","afterRender","renderGUI","finish","collectRenderInstances"];
Script.node_triggered_events = { "clicked":true, "prefabReady": true };

Script.translate_events = {
	"sceneRender": "beforeRender",
	"beforeRender": "sceneRender",
	"render": "renderInstances", 
	"renderInstances": "render",
	"afterRender":"afterRenderInstances", 
	"afterRenderInstances": "afterRender"};

Script.coding_help = "\n\
Global vars:\n\
 + node : represent the node where this component is attached.\n\
 + component : represent the component.\n\
 + this : represents the script context\n\
\n\
Exported functions:\n\
 + start: when the Scene starts\n\
 + update: when updating\n\
 + clicked : if this node is clicked\n\
 + render : before rendering the node\n\
 + renderGUI : to render something in the GUI using canvas2D\n\
 + getRenderInstances: when collecting instances\n\
 + afterRender : after rendering the node\n\
 + prefabReady: when the prefab has been loaded\n\
 + finish : when the scene finished (mostly used for editor stuff)\n\
\n\
Remember, all basic vars attached to this will be exported as global.\n\
";

Script.active_scripts = {};

Object.defineProperty( Script.prototype, "name", {
	set: function(v){ 
		if( LS.Script.active_scripts[ this._name ] )
			delete LS.Script.active_scripts[ this._name ];
		this._name = v;
		if( this._name && !LS.Script.active_scripts[ this._name ] )
			LS.Script.active_scripts[ this._name ] = this;
	},
	get: function() { return this._name; },
	enumerable: true
});

Object.defineProperty( Script.prototype, "context", {
	set: function(v){ 
		console.error("Script: context cannot be assigned");
	},
	get: function() { 
		if(this._script)
				return this._script._context;
		return null;
	},
	enumerable: false //if it was enumerable it would be serialized
});

Script.prototype.configure = function(o)
{
	if(o.uid)
		this.uid = o.uid;
	if(o.enabled !== undefined)
		this.enabled = o.enabled;
	if(o.name !== undefined)
		this.name = o.name;
	if(o.code !== undefined)
		this.code = o.code;
	if(o.properties)
		 this.setContextProperties( o.properties );
}

Script.prototype.serialize = function()
{
	return {
		uid: this.uid,
		enabled: this.enabled,
		name: this.name,
		code: this.code,
		properties: LS.cloneObject( this.getContextProperties() )
	};
}



Script.prototype.getContext = function()
{
	if(this._script)
		return this._script._context;
	return null;
}

Script.prototype.getCode = function()
{
	return this.code;
}

Script.prototype.setCode = function( code, skip_events )
{
	this.code = code;
	this.processCode( skip_events );
}

/**
* This is the method in charge of compiling the code and executing the constructor, which also creates the context.
* It is called everytime the code is modified, that implies that the context is created when the component is configured.
* @method processCode
*/
Script.prototype.processCode = function( skip_events )
{
	this._script.code = this.code;
	if(this._root && !LS.Script.block_execution )
	{
		//unbind old stuff
		if(this._script && this._script._context)
			this._script._context.unbindAll();

		//save old state
		var old = this._stored_properties || this.getContextProperties();

		//compiles and executes the context
		var ret = this._script.compile({component:this, node: this._root, scene: this._root.scene });
		if(!skip_events)
			this.hookEvents();

		this.setContextProperties( old );
		this._stored_properties = null;

		return ret;
	}
	return true;
}

Script.prototype.getContextProperties = function()
{
	var ctx = this.getContext();
	if(!ctx)
		return;
	return LS.cloneObject( ctx );
}

Script.prototype.setContextProperties = function( properties )
{
	if(!properties)
		return;
	var ctx = this.getContext();
	if(!ctx) //maybe the context hasnt been crated yet
	{
		this._stored_properties = properties;
		return;
	}

	LS.cloneObject( properties, ctx, false, true );
}

//used for graphs
Script.prototype.setProperty = function(name, value)
{
	var ctx = this.getContext();

	if( ctx && ctx[name] !== undefined )
	{
		if(ctx[name].set)
			ctx[name](value);
		else
			ctx[name] = value;
	}
	else if(this[name])
		this[name] = value;
}


Script.prototype.getProperties = function()
{
	var ctx = this.getContext();

	if(!ctx)
		return {enabled:"boolean"};

	var attrs = LS.getObjectProperties( ctx );
	attrs.enabled = "boolean";
	return attrs;
}

/*
Script.prototype.getPropertyValue = function( property )
{
	var ctx = this.getContext();
	if(!ctx)
		return;

	return ctx[ property ];
}

Script.prototype.setPropertyValue = function( property, value )
{
	var context = this.getContext();
	if(!context)
		return;

	if( context[ property ] === undefined )
		return;

	if(context[ property ] && context[ property ].set)
		context[ property ].set( value );
	else
		context[ property ] = value;

	return true;
}
*/

//used for animation tracks
Script.prototype.getPropertyInfoFromPath = function( path )
{
	if(path[0] != "context")
		return;

	var context = this.getContext();

	if(path.length == 1)
		return {
			name:"context",
			node: this._root,
			target: context,
			type: "object"
		};

	var varname = path[1];
	if(!context || context[ varname ] === undefined )
		return;

	var value = context[ varname ];
	var extra_info = context[ "@" + varname ];

	var type = "";
	if(extra_info)
		type = extra_info.type;


	if(!type && value !== null && value !== undefined)
	{
		if(value.constructor === String)
			type = "string";
		else if(value.constructor === Boolean)
			type = "boolean";
		else if(value.length)
			type = "vec" + value.length;
		else if(value.constructor === Number)
			type = "number";
	}

	return {
		node: this._root,
		target: context,
		name: varname,
		value: value,
		type: type
	};
}

Script.prototype.setPropertyValueFromPath = function( path, value, offset )
{
	offset = offset || 0;

	if( path.length < (offset+1) )
		return;

	if(path[offset] != "context" )
		return;

	var context = this.getContext();
	var varname = path[offset+1];
	if(!context || context[ varname ] === undefined )
		return;

	if( context[ varname ] === undefined )
		return;

	if(context[ varname ] && context[ varname ].set)
		context[ varname ].set( value );
	else
		context[ varname ] = value;
}

Script.prototype.hookEvents = function()
{
	var hookable = LS.Script.exported_callbacks;
	var root = this._root;
	var scene = root.scene;
	if(!scene)
		scene = LS.GlobalScene; //hack

	//script context
	var context = this.getContext();
	if(!context)
		return;

	//hook events
	for(var i in hookable)
	{
		var name = hookable[i];
		var event_name = LS.Script.translate_events[ name ] || name;
		var target = Script.node_triggered_events[ event_name ] ? root : scene; //some events are triggered in the scene, others in the node
		if( context[name] && context[name].constructor === Function )
		{
			if( !LEvent.isBind( target, event_name, this.onScriptEvent, this )  )
				LEvent.bind( target, event_name, this.onScriptEvent, this );
		}
		else
			LEvent.unbind( target, event_name, this.onScriptEvent, this );
	}
}

Script.prototype.onAddedToNode = function( node )
{
	if(!node.script)
		node.script = this;
}

Script.prototype.onRemovedFromNode = function( node )
{
	if(node.script == this)
		delete node.script;
}

Script.prototype.onAddedToScene = function( scene )
{
	if( this._name && !LS.Script.active_scripts[ this._name ] )
		LS.Script.active_scripts[ this._name ] = this;

	if( !this.constructor.catch_important_exceptions )
	{
		this.processCode();
		return;
	}

	//catch
	try
	{
		//careful, if the code saved had an error, do not block the flow of the configure or the rest will be lost
		this.processCode();
	}
	catch (err)
	{
		console.error(err);
	}
}

Script.prototype.onRemovedFromScene = function(scene)
{
	if( this._name && LS.Script.active_scripts[ this._name ] )
		delete LS.Script.active_scripts[ this._name ];

	//ensures no binded events
	if(this._context)
		LEvent.unbindAll( scene, this._context, this );

	//unbind evends
	LEvent.unbindAll( scene, this );
}


//TODO stuff ***************************************
Script.prototype.onAddedToProject = function( project )
{
	try
	{
		//just in case the script saved had an error, do not block the flow
		this.processCode();
	}
	catch (err)
	{
		console.error(err);
	}
}

Script.prototype.onRemovedFromProject = function( project )
{
	//ensures no binded events
	if(this._context)
		LEvent.unbindAll( project, this._context, this );

	//unbind evends
	LEvent.unbindAll( project, this );
}
//*******************************



Script.prototype.onScriptEvent = function(event_type, params)
{
	//this.processCode(true); //¿?

	if(!this.enabled)
		return;

	var method_name = LS.Script.translate_events[ event_type ] || event_type;
	this._script.callMethod( method_name, params );
}

Script.prototype.runStep = function(method, args)
{
	this._script.callMethod(method,args);
}

Script.prototype.onError = function(err)
{
	var scene = this._root.scene;
	if(!scene)
		return;

	LEvent.trigger( this, "code_error",err);
	LEvent.trigger( scene, "code_error",[this,err]);
	LEvent.trigger( Script, "code_error",[this,err]);
	console.log("app finishing due to error in script");
	scene.finish();
}

//called from the editor?
Script.prototype.onCodeChange = function(code)
{
	this.processCode();
}

Script.prototype.getResources = function(res)
{
	var ctx = this.getContext();

	if(!ctx || !ctx.getResources )
		return;
	
	ctx.getResources( res );
}

LS.registerComponent( Script );
LS.Script = Script;

//*****************

function ScriptFromFile(o)
{
	this.enabled = true;
	this._filename = "";

	this._script = new LScript();

	this._script.extra_methods = {
		getComponent: (function() { return this; }).bind(this),
		getLocator: function() { return this.getComponent().getLocator() + "/context"; },
		createProperty: LS.Component.prototype.createProperty,
		createAction: LS.Component.prototype.createAction,
		bind: LS.Component.prototype.bind,
		unbind: LS.Component.prototype.unbind,
		unbindAll: LS.Component.prototype.unbindAll
	};

	this._script.onerror = this.onError.bind(this);
	this._script.exported_callbacks = [];//this.constructor.exported_callbacks;
	this._last_error = null;

	if(o)
		this.configure(o);
}

Object.defineProperty( ScriptFromFile.prototype, "filename", {
	set: function(v){ 
		this._filename = v;
		this.processCode();
	},
	get: function() { 
		return this._filename;
	},
	enumerable: true
});

Object.defineProperty( ScriptFromFile.prototype, "context", {
	set: function(v){ 
		console.error("ScriptFromFile: context cannot be assigned");
	},
	get: function() { 
		if(this._script)
				return this._script._context;
		return null;
	},
	enumerable: false //if it was enumerable it would be serialized
});

ScriptFromFile.prototype.onAddedToScene = function( scene )
{
	if( !this.constructor.catch_important_exceptions )
	{
		this.processCode();
		return;
	}

	//catch
	try
	{
		//careful, if the code saved had an error, do not block the flow of the configure or the rest will be lost
		this.processCode();
	}
	catch (err)
	{
		console.error(err);
	}
}

ScriptFromFile.prototype.processCode = function( skip_events )
{
	var that = this;
	if(!this.filename)
		return;

	var script_resource = LS.ResourcesManager.getResource( this.filename );
	if(!script_resource)
	{
		LS.ResourcesManager.load( this.filename, null, function( res, url ){
			if( url != that.filename )
				return;
			that.processCode( skip_events );
		});
		return;
	}

	var code = script_resource.data;
	if( code === undefined || this._script.code == code )
		return;

	if(this._root && !LS.Script.block_execution )
	{
		//assigned inside because otherwise if it gets modified before it is attached to the scene tree then it wont be compiled
		this._script.code = code;

		//unbind old stuff
		if( this._script && this._script._context )
			this._script._context.unbindAll();

		//compiles and executes the context
		var old = this._stored_properties || this.getContextProperties();
		var ret = this._script.compile({component:this, node: this._root, scene: this._root.scene });
		if(!skip_events)
			this.hookEvents();
		this.setContextProperties( old );
		this._stored_properties = null;

		//try to catch up with all the events missed while loading the script
		if( !this._script._context._initialized )
		{
			if( this._root && this._script._context.onAddedToNode )
			{
				this._script._context.onAddedToNode( this._root );
				if( this._root.scene && this._script._context.onAddedToScene )
				{
					this._script._context.onAddedToScene( this._root.scene );
					if( this._root.scene._state === LS.RUNNING && this._script._context.start )
						this._script._context.start();
				}
			}
			this._script._context._initialized = true; //avoid initializing it twice
		}

		return ret;
	}
	return true;
}

ScriptFromFile.prototype.configure = function(o)
{
	if(o.uid)
		this.uid = o.uid;
	if(o.enabled !== undefined)
		this.enabled = o.enabled;
	if(o.filename !== undefined)
		this.filename = o.filename;
	if(o.properties)
		 this.setContextProperties( o.properties );
}

ScriptFromFile.prototype.serialize = function()
{
	return {
		uid: this.uid,
		enabled: this.enabled,
		filename: this.filename,
		properties: LS.cloneObject( this.getContextProperties() )
	};
}


ScriptFromFile.prototype.getResources = function(res)
{
	if(this.filename)
		res[this.filename] = LS.Resource;

	//script resources
	var ctx = this.getContext();
	if(!ctx || !ctx.getResources )
		return;
	ctx.getResources( res );
}

ScriptFromFile.prototype.getCode = function()
{
	var script_resource = LS.ResourcesManager.getResource( this.filename );
	if(!script_resource)
		return "";
	return script_resource.data;
}

ScriptFromFile.prototype.setCode = function( code, skip_events )
{
	var script_resource = LS.ResourcesManager.getResource( this.filename );
	if(!script_resource)
		return "";
	script_resource.data = code;
	this.processCode( skip_events );
}

ScriptFromFile.updateComponents = function( script, skip_events )
{
	if(!script)
		return;
	var filename = script.filename;
	var components = LS.GlobalScene.findNodeComponents( LS.ScriptFromFile );
	for(var i = 0; i < components.length; ++i)
	{
		var compo = components[i];
		var filename = script.fullpath || script.filename;
		if( compo.filename == filename )
			compo.processCode(skip_events);
	}
}

LS.extendClass( ScriptFromFile, Script );

LS.registerComponent( ScriptFromFile );
LS.ScriptFromFile = ScriptFromFile;

