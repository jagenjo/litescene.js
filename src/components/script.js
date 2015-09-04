function Script(o)
{
	this.enabled = true;
	this.name = "Unnamed";
	this.code = "this.update = function(dt)\n{\n\tnode.scene.refresh();\n}";

	this._script = new LScript();

	this._script.catch_exceptions = false;
	this._script.onerror = this.onError.bind(this);
	this._script.exported_callbacks = [];//this.constructor.exported_callbacks;
	this._last_error = null;

	if(o)
		this.configure(o);

	if(this.code)
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
}

Script.secure_module = false; //this module is not secure (it can execute code)
Script.block_execution = false; //avoid executing code

Script.icon = "mini-icon-script.png";

Script["@code"] = {type:'script'};

Script.exported_callbacks = ["start","update","trigger","sceneRender", "render","afterRender","finish","collectRenderInstances"];
Script.translate_events = {
	"sceneRender": "beforeRender",
	"beforeRender": "sceneRender",
	"render": "renderInstances", 
	"renderInstances": "render",
	"afterRender":"afterRenderInstances", 
	"afterRenderInstances": "afterRender",
	"finish": "stop", 
	"stop":"finish"};

Script.coding_help = "\n\
Global vars:\n\
 + node : represent the node where this component is attached.\n\
 + component : represent the component.\n\
 + this : represents the script context\n\
\n\
Exported functions:\n\
 + start: when the Scene starts\n\
 + update: when updating\n\
 + trigger : if this node is triggered\n\
 + render : before rendering the node\n\
 + getRenderInstances: when collecting instances\n\
 + afterRender : after rendering the node\n\
 + finish : when the scene stops\n\
\n\
Remember, all basic vars attached to this will be exported as global.\n\
";

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

Script.prototype.processCode = function(skip_events)
{
	this._script.code = this.code;
	if(this._root && !Script.block_execution )
	{
		var ret = this._script.compile({component:this, node: this._root, scene: this._root.scene });
		if(	this._script._context )
		{
			this._script._context.__proto__.getComponent = (function() { return this; }).bind(this);
			this._script._context.__proto__.getLocator = function() { return this.getComponent().getLocator() + "/context"; };
		}

		if(!skip_events)
			this.hookEvents();
		return ret;
	}
	return true;
}

//used for graphs
Script.prototype.setAttribute = function(name, value)
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


Script.prototype.getAttributes = function()
{
	var ctx = this.getContext();

	if(!ctx)
		return {enabled:"boolean"};

	var attrs = LS.getObjectAttributes( ctx );
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
	if(path[2] != "context")
		return;

	var context = this.getContext();

	if(path.length == 3)
		return {
			node: this._root,
			target: context,
			type: "object"
		};

	var varname = path[3];
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

Script.prototype.setPropertyValueFromPath = function( path, value )
{
	if(path.length < 4)
		return;

	if(path[2] != "context" )
		return;

	var context = this.getContext();
	var varname = path[3];
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
	var node = this._root;
	var scene = node.scene;
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
		var event_name = LS.Script.translate_events[name] || name;

		if( context[name] && context[name].constructor === Function )
		{
			var target = event_name == "trigger" ? node : scene; //some events are triggered in the scene, others in the node
			if( !LEvent.isBind( target, event_name, this.onScriptEvent, this )  )
				LEvent.bind( target, event_name, this.onScriptEvent, this );
		}
		else
			LEvent.unbind( scene, event_name, this.onScriptEvent, this );
	}
}

Script.prototype.onAddedToScene = function(scene)
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

Script.prototype.onRemovedFromScene = function(scene)
{
	//unbind evends
	LEvent.unbindAll( scene, this );
}

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

	LEvent.trigger(this,"code_error",err);
	LEvent.trigger(scene,"code_error",[this,err]);
	LEvent.trigger(Script,"code_error",[this,err]);
	console.log("app stopping due to error in script");
	scene.stop();
}

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

LS.registerComponent(Script);
LS.Script = Script;

