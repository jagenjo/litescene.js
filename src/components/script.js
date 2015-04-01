function Script(o)
{
	this.enabled = true;
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

Script.icon = "mini-icon-script.png";

Script["@code"] = {type:'script'};

Script.exported_callbacks = ["start","update","trigger","render","afterRender","finish","collectRenderInstances"];
Script.translate_events = {
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
	if(this._root)
	{
		var ret = this._script.compile({component:this, node: this._root});
		if(!skip_events)
			this.hookEvents();
		return ret;
	}
	return true;
}

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

Script.prototype.hookEvents = function()
{
	var hookable = LS.Script.exported_callbacks;
	var node = this._root;
	var scene = node.scene;

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
			//remove
			if( !LEvent.isBind( scene, event_name, this.onScriptEvent, this )  )
				LEvent.bind( scene, event_name, this.onScriptEvent, this );
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


LS.registerComponent(Script);
LS.Script = Script;

