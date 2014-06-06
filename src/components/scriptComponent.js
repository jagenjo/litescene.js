function ScriptComponent(o)
{
	this.enabled = true;
	this.code = "function update(dt)\n{\n\tScene.refresh();\n}";
	this._component = null;

	this._script = new LScript();
	this._script.valid_callbacks = ScriptComponent.valid_callbacks;
	this._last_error = null;
	this._script.onerror = (function(err) { this.onError(err); }).bind(this);

	this.configure(o);
	if(this.code)
		this.processCode();
}

ScriptComponent.icon = "mini-icon-script.png";

ScriptComponent["@code"] = {type:'script'};

ScriptComponent.valid_callbacks = ["start","update","trigger"];

ScriptComponent.prototype.getContext = function()
{
	if(this._script)
			return this._script._context;
	return null;
}

ScriptComponent.prototype.getCode = function()
{
	return this.code;
}

ScriptComponent.prototype.processCode = function()
{
	this._script.code = this.code;
	this._script.compile({component:this, node: this._root});
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

	this._script.callMethod("start");

	//if(this.enabled && this._component && this._component.start)
	//	this._component.start();
}

ScriptComponent.prototype.onUpdate = function(e,dt)
{
	this._script.callMethod("update",[dt]);

	//if(this.enabled && this._component && this._component.update)
	//	this._component.update(dt);
}

ScriptComponent.prototype.runStep = function(method, args)
{
	this._script.callMethod(method,args);
}

ScriptComponent.prototype.onError = function(err)
{
	console.log("app stopping due to error in script");
	Scene.stop();
}

ScriptComponent.prototype.onCodeChange = function(code)
{
	this.processCode();
}


LS.registerComponent(ScriptComponent);