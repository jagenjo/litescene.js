(function(){

function Script(o)
{
	this.enabled = true;
	this.code = "function update(dt)\n{\n\tScene.refresh();\n}";
	this._component = null;

	this._script = new LScript();
	this._script.onerror = this.onError.bind(this);
	this._script.valid_callbacks = this.constructor.valid_callbacks;
	this._last_error = null;

	this.configure(o);
	if(this.code)
		this.processCode();
}

Script.icon = "mini-icon-script.png";

Script["@code"] = {type:'script'};

Script.valid_callbacks = ["start","update","trigger","render","afterRender","finish"];
Script.translate_events = {
	"render": "renderInstances", "renderInstances": "render",
	"afterRender":"afterRenderInstances", "afterRenderInstances": "afterRender",
	"finish": "stop", "stop":"finish"};

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

Script.prototype.hookEvents = function()
{
	var hookable = Script.valid_callbacks;

	for(var i in hookable)
	{
		var name = hookable[i];
		var event_name = Script.translate_events[name] || name;

		if( this._script._context[name] && this._script._context[name].constructor === Function )
		{
			if( !LEvent.isBind( Scene, event_name, this.onScriptEvent, this )  )
				LEvent.bind( Scene, event_name, this.onScriptEvent, this );
		}
		else
			LEvent.unbind( Scene, event_name, this.onScriptEvent, this );
	}
}

Script.prototype.onAddedToNode = function(node)
{
	this.processCode();
}

Script.prototype.onRemovedFromNode = function(node)
{
	//unbind evends
	var hookable = Script.valid_callbacks;
	for(var i in hookable)
	{
		var name = hookable[i];
		var event_name = Script.translate_events[name] || name;
		LEvent.unbind( Scene, event_name, this.onScriptEvent, this );
	}
}

Script.prototype.onScriptEvent = function(event_type, params)
{
	//this.processCode(true); //¿?

	var method_name = Script.translate_events[ event_type ] || event_type;

	this._script.callMethod( method_name, params );

	//if(this.enabled && this._component && this._component.start)
	//	this._component.start();
}

/*
Script.prototype.on_update = function(e,dt)
{
	this._script.callMethod("update",[dt]);

	//if(this.enabled && this._component && this._component.update)
	//	this._component.update(dt);
}

Script.prototype.on_trigger = function(e,dt)
{
	this._script.callMethod("trigger",[e]);
}
*/

Script.prototype.runStep = function(method, args)
{
	this._script.callMethod(method,args);
}

Script.prototype.onError = function(err)
{
	LEvent.trigger(this,"code_error",err);
	LEvent.trigger(Scene,"code_error",[this,err]);
	LEvent.trigger(Script,"code_error",[this,err]);
	console.log("app stopping due to error in script");
	Scene.stop();
}

Script.prototype.onCodeChange = function(code)
{
	this.processCode();
}


LS.registerComponent(Script);

})();