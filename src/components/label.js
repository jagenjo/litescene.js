(function(){

function Label(o)
{
	this.text = "";
	this.className = "";
	this._world_pos = vec3.create();
	this._screen_pos = vec3.create();
	this.configure(o);
}

Label.icon = "mini-icon-text.png";
Label.CSS_classname = "LS3D_label";

Label.prototype.onAddedToNode = function(node)
{
	//events
	LEvent.bind(Scene,"beforeRender",this.render,this);

	//create html
	var elem = document.createElement("div");
	elem.innerHTML = this.text;
	var style = elem.style;
	style.className = this.constructor.CSS_classname;
	style.position = "absolute";
	style.top = 0;
	style.left = 0;
	style.fontSize = "20px";
	style.padding = "10px";
	style.color = "white";
	style.pointerEvents = "none";
	style.backgroundColor = "rgba(0,0,0,0.5)";
	style.borderRadius = "2px";

	if(gl && gl.canvas && gl.canvas.parentNode)
		gl.canvas.parentNode.appendChild( elem );

	this._element = elem;
}

Label.prototype.onRemovedFromNode = function(node)
{
	LEvent.unbind(Scene,"beforeRender",this.render, this);

	if(this._element)
	{
		if(this._element.parentNode)
			this._element.parentNode.removeChild( this._element );
		this._element = null;
	}
}


Label.prototype.render = function(e, render_options)
{
	if(!this._element)
		return;

	var node = this._root;


	if(this._element.innerHTML != this.text)
		this._element.innerHTML = this.text;

	this._element.style.display = node.flags.visible === false ? "none" : "block";
	if(!this.text)
	{
		this._element.style.display = "none";
		return;
	}

	var classname = this.constructor.CSS_classname + " " + this.className;
	if(this._element.className != classname)
		this._element.className = classname;

	var camera = render_options.main_camera;
	node.transform.getGlobalPosition(this._world_pos);
	camera.project(this._world_pos, null, this._screen_pos );

	this._element.style.left = this._screen_pos[0].toFixed(0) + "px";
	this._element.style.top = (gl.canvas.height - (this._screen_pos[1]|0) - 10) + "px";
}



LS.registerComponent(Label);

})();