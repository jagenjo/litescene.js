function ScriptComponent(o)
{
	this.enabled = true;
	this.code = "function update(dt)\n{\n\tScene.refresh();\n}";
	this._component = null;

	//this.component_name = "";
	//this.register_component = false;
	this.configure(o);
	if(this.code)
		this.processCode();
}

ScriptComponent["@code"] = {type:'script'};

ScriptComponent.valid_callbacks = ["start","update"];

ScriptComponent.prototype.processCode = function()
{
	var name = this.component_name || "__last_component";
	var code = this.code;
	code = "function "+name+"(component, node) {\n" + code + "\n";

	var extra_code = "";
	for(var i in ScriptComponent.valid_callbacks)
		extra_code += "	if(typeof("+ScriptComponent.valid_callbacks[i]+") != 'undefined') this."+ ScriptComponent.valid_callbacks[i] + " = "+ScriptComponent.valid_callbacks[i]+";\n";

	extra_code += "\n}\nwindow."+name+" = "+name+";\n";

	//disabled feature
	var register = false && this.component_name && this.register_component;

	/* this creates a new component on the fly but seems dangerous
	if(register)
	{
		extra_code += name + ".prototype.onStart = function() { if(this.start) this.start(); }\n";
		extra_code += name + ".prototype.onUpdate = function(e,dt) { if(this.update) this.update(dt); }\n";
		extra_code += name + ".prototype.onAddedToNode = function(node) { \
			LEvent.bind(Scene,'start', this.onStart.bind(this) );\n\
			LEvent.bind(Scene,'update', this.onUpdate.bind(this) );\n\
		};\n";
		extra_code += name + ".prototype.onRemovedFromNode = function(node) { \
			LEvent.unbind(Scene,'start', (function() { if(this.start) this.start(); }).bind(this) );\n\
			LEvent.unbind(Scene,'update', (function(e,dt) { if(this.update) this.update(dt); }).bind(this) );\n\
		};\n";
	}
	*/

	code += extra_code;

	try
	{
		this._last_executed_code = code;
		//trace(code);
		eval(code);
		this._component_class = window[name];
		this._component = new this._component_class( this, this._root );
		//if(register) LS.registerComponent(this._component_class);
	}
	catch (err)
	{
		this._component_class = null;
		this._component = null;
		trace("Error in script\n" + err);
		trace(this._last_executed_code );
	}
}


ScriptComponent.prototype.onAddedToNode = function(node)
{
	this._onStart_bind = this.onStart.bind(this);
	this._onUpdate_bind = this.onUpdate.bind(this);
	LEvent.bind(Scene,"start", this._onStart_bind );
	LEvent.bind(Scene,"update", this._onUpdate_bind );
}

ScriptComponent.prototype.onRemovedFromNode = function(node)
{
	LEvent.unbind(Scene,"start", this._onStart_bind );
	LEvent.unbind(Scene,"update", this._onUpdate_bind );
}

ScriptComponent.prototype.onStart = function()
{
	this.processCode();

	if(this.enabled && this._component && this._component.start)
		this._component.start();
}

ScriptComponent.prototype.onUpdate = function(e,dt)
{
	if(this.enabled && this._component && this._component.update)
		this._component.update(dt);
}


LS.registerComponent(ScriptComponent);