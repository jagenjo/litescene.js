//TODO: a class to remove the tree methods from SceneTree and SceneNode

function CompositePattern()
{
	//WARNING! do not add anything here, it will never be called
}

CompositePattern.prototype.compositeCtor = function()
{
}

CompositePattern.prototype.addChild = function(node, index, options)
{
	//be careful with weird recursions...
	var aux = this;
	while( aux._parentNode )
	{
		if(aux == node)
			throw("addChild: Cannot insert a node as his own child");
		aux = aux._parentNode;
	}

	//has a parent
	if(node._parentNode)
		node._parentNode.removeChild(node);

	//attach to this
	node._parentNode = this;
	if( !this._children )
		this._children = [node];
	else if(index == undefined)
		this._children.push(node);
	else
		this._children.splice(index,0,node);

	//Same tree
	node._on_tree = this._on_tree;

	if(this._onChildAdded)
		this._onChildAdded(node, options);

	LEvent.trigger(this,"nodeAdded", node);
	if(this._on_tree)
		LEvent.trigger(this._on_tree, "nodeAdded", node);
}

CompositePattern.prototype.removeChild = function(node, options)
{
	if(!this._children || node._parentNode != this) return;
	if( node._parentNode != this) return; //not his son
	var pos = this._children.indexOf(node);
	if(pos == -1) return; //not his son ¿?
	this._children.splice(pos,1);

	if(this._onChildRemoved)
		this._onChildRemoved(node, options);

	LEvent.trigger(this,"nodeRemoved", node);
	if(this._on_tree)
		LEvent.trigger(this._on_tree, "nodeRemoved", node);
	this._on_tree = null;
}

CompositePattern.prototype.serializeChildren = function()
{
	var r = [];
	if(this._children)
		for(var i in this._children)
			r.push( this._children[i].serialize() );
	return r;
}

CompositePattern.prototype.configureChildren = function(o)
{
	if(!o.children) return;

	for(var i in o.children)
	{
		//create instance
		var node = new this.constructor(o.children[i].id); //id is hardcoded...
		this.addChild(node);
		node.configure(o.children[i]);
	}
}

CompositePattern.prototype.getParent = function()
{
	return this._parentNode;
}

CompositePattern.prototype.getChildren = function()
{
	return this._children || [];
}

Object.defineProperty( CompositePattern.prototype, "parentNode", {
	enumerable: true,
	get: function() {
		return this._parentNode;
	},
	set: function(v) {
		//TODO
	}
});

CompositePattern.prototype.childNodes = function()
{
	return this._children || [];
}

Object.defineProperty( CompositePattern.prototype, "childNodes", {
	enumerable: true,
	get: function() {
		return this._children || [];
	},
	set: function(v) {
		//TODO
	}
});


