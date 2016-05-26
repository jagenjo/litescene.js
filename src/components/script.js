
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
	this.code = "this.onUpdate = function(dt)\n{\n\t//node.scene.refresh();\n}";

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
	this._script.exported_functions = [];
	this._last_error = null;

	if(o)
		this.configure(o);
}

Script.secure_module = false; //this module is not secure (it can execute code)
Script.block_execution = false; //avoid executing code
Script.catch_important_exceptions = true; //catch exception during parsing, otherwise configuration could fail

Script.icon = "mini-icon-script.png";

Script["@code"] = {type:'script'};

//used to determine to which object to bind
Script.BIND_TO_COMPONENT = 1;
Script.BIND_TO_NODE = 2;
Script.BIND_TO_SCENE = 3;
Script.BIND_TO_RENDERER = 4;

//Here we specify which methods of the script will be automatically binded to events in the system
//This way developing is much more easy as you dont have to bind or unbind anything
Script.API_functions = {};
Script.API_events_to_function = {};

Script.defineAPIFunction = function( func_name, target, event, info ) {
	event = event || func_name;
	target = target || Script.BIND_TO_SCENE;
	var data = { name: func_name, target: target, event: event, info: info };
	Script.API_functions[ func_name ] = data;
	Script.API_events_to_function[ event ] = data;
}

Script.defineAPIFunction( "onStart", Script.BIND_TO_SCENE, "start" );
Script.defineAPIFunction( "onFinish", Script.BIND_TO_SCENE, "finish" );
Script.defineAPIFunction( "onPrefabReady", Script.BIND_TO_NODE, "prefabReady" );
Script.defineAPIFunction( "onUpdate", Script.BIND_TO_SCENE, "update" );
Script.defineAPIFunction( "onClicked", Script.BIND_TO_NODE, "clicked" );
Script.defineAPIFunction( "onSceneRender", Script.BIND_TO_SCENE, "beforeRender" );
Script.defineAPIFunction( "onCollectRenderInstances", Script.BIND_TO_NODE, "collectRenderInstances" );
Script.defineAPIFunction( "onRender", Script.BIND_TO_NODE, "beforeRenderInstances" );
Script.defineAPIFunction( "onAfterRender", Script.BIND_TO_SCENE, "afterRenderInstances" );
Script.defineAPIFunction( "onRenderGUI", Script.BIND_TO_SCENE, "renderGUI" );
Script.defineAPIFunction( "onRenderHelpers", Script.BIND_TO_SCENE, "renderHelpers" );
Script.defineAPIFunction( "onEnableFrameContext", Script.BIND_TO_SCENE, "enableFrameContext" );
Script.defineAPIFunction( "onShowFrameContext", Script.BIND_TO_SCENE, "showFrameContext" );
Script.defineAPIFunction( "onMouseDown", Script.BIND_TO_SCENE, "mousedown" );
Script.defineAPIFunction( "onMouseMove", Script.BIND_TO_SCENE, "mousemove" );
Script.defineAPIFunction( "onMouseUp", Script.BIND_TO_SCENE, "mouseup" );
Script.defineAPIFunction( "onKeyDown", Script.BIND_TO_SCENE, "keydown" );
Script.defineAPIFunction( "onDestroy", Script.BIND_TO_NODE, "destroy" );

Script.coding_help = "\n\
For a complete guide check: <a href='https://github.com/jagenjo/litescene.js/blob/master/guides/scripting.md' target='blank'>Scripting Guide</a>\n\
Global vars:\n\
 + node : represent the node where this component is attached.\n\
 + component : represent the component.\n\
 + this : represents the script context\n\
\n\
Some of the common API functions:\n\
 + onStart: when the Scene starts\n\
 + onUpdate: when updating\n\
 + onClicked : if this node is clicked\n\
 + onRender : before rendering the node\n\
 + onRenderGUI : to render something in the GUI using canvas2D\n\
 + onCollectRenderInstances: when collecting instances\n\
 + onAfterRender : after rendering the node\n\
 + onPrefabReady: when the prefab has been loaded\n\
 + onFinish : when the scene finished (mostly used for editor stuff)\n\
\n\
Remember, all basic vars attached to this will be exported as global.\n\
";

Script.active_scripts = {};

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

Object.defineProperty( Script.prototype, "name", {
	set: function(v){ 
		console.error("Script: name cannot be assigned");
	},
	get: function() { 
		if(!this._script.code)
			return;
		var line = this._script.code.substr(0,32);
		if(line.indexOf("//@") != 0)
			return null;
		var last = line.indexOf("\n");
		if(last == -1)
			last = undefined;
		return line.substr(3,last - 3);
	},
	enumerable: false //if it was enumerable it would be serialized
});

Script.prototype.configure = function(o)
{
	if(o.uid)
		this.uid = o.uid;
	if(o.enabled !== undefined)
		this.enabled = o.enabled;
	if(o.code !== undefined)
		this.code = o.code;

	if(this._root && this._root.scene)
		this.processCode();

	//do this before processing the code if you want the script to overwrite the vars
	if(o.properties)
		 this.setContextProperties( o.properties );
}

Script.prototype.serialize = function()
{
	return {
		uid: this.uid,
		enabled: this.enabled,
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


Script.prototype.getPropertiesInfo = function()
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

/**
* This check if the context has API functions that should be called, if thats the case, it binds events automatically
* This way we dont have to bind manually all the methods.
* @method hookEvents
*/
Script.prototype.hookEvents = function()
{
	var node = this._root;
	if(!node)
		throw("hooking events of a Script without a node");
	var scene = node.scene;
	if(!scene)
		scene = LS.GlobalScene; //hack

	//script context
	var context = this.getContext();
	if(!context)
		return;

	//hook events
	for(var i in LS.Script.API_functions)
	{
		var func_name = i;
		var event_info = LS.Script.API_functions[ func_name ];

		var target = null;
		switch( event_info.target )
		{
			case Script.BIND_TO_COMPONENT: target = this; break;
			case Script.BIND_TO_NODE: target = node; break;
			case Script.BIND_TO_SCENE: target = scene; break;
			case Script.BIND_TO_RENDERER: target = LS.Renderer; break;
		}
		if(!target)
			throw("Script event without target?");

		//check if this function exist
		if( context[ func_name ] && context[ func_name ].constructor === Function )
		{
			if( !LEvent.isBind( target, event_info.event, this.onScriptEvent, this )  )
				LEvent.bind( target, event_info.event, this.onScriptEvent, this );
		}
		else //if it doesnt ensure we are not binding the event
			LEvent.unbind( target, event_info.event, this.onScriptEvent, this );
	}
}

/**
* Called every time an event should be redirected to one function in the script context
* @method onScriptEvent
*/
Script.prototype.onScriptEvent = function(event_type, params)
{
	if(!this.enabled)
		return;
	var event_info = LS.Script.API_events_to_function[ event_type ];
	if(!event_info)
		return; //????
	return this._script.callMethod( event_info.name, params );
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
	LEvent.unbindAll( scene, this );
	if(this._context)
	{
		LEvent.unbindAll( scene, this._context, this );
		if(this._context.onRemovedFromScene)
			this._context.onRemovedFromScene(scene);
	}
}

//used in editor
Script.prototype.getComponentTitle = function()
{
	return this.name; //name is a getter that reads the name from the code comment
}


//TODO stuff ***************************************
/*
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
*/
//*******************************

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
	if(ctx && ctx.onGetResources )
		ctx.onGetResources( res );
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
	this._script.exported_functions = [];//this.constructor.exported_callbacks;
	this._last_error = null;

	if(o)
		this.configure(o);
}

ScriptFromFile.coding_help = Script.coding_help;

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

Object.defineProperty( ScriptFromFile.prototype, "name", {
	set: function(v){ 
		console.error("Script: name cannot be assigned");
	},
	get: function() { 
		if(!this._script.code)
			return;
		var line = this._script.code.substr(0,32);
		if(line.indexOf("//@") != 0)
			return null;
		var last = line.indexOf("\n");
		if(last == -1)
			last = undefined;
		return line.substr(3,last - 3);
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

	if(this._root && this._root.scene)
		this.processCode();
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

