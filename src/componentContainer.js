/*
	A component container is someone who could have components attached to it.
	Mostly used for SceneNodes but it could be used for other classes too.
*/

/**
* ComponentContainer class allows to add component based properties to any other class
* @class ComponentContainer
* @constructor
*/
function ComponentContainer()
{
	//this function never will be called (because only the methods are attached to other classes)
	//unless you instantiate this class directly, something that would be weird
	this._components = [];
}


/**
* Adds a component to this node.
* @method configureComponents
* @param {Object} info object containing all the info from a previous serialization
*/

ComponentContainer.prototype.configureComponents = function(info)
{
	if(!info.components)
		return;

	for(var i = 0, l = info.components.length; i < l; ++i)
	{
		var comp_info = info.components[i];
		var comp_class = comp_info[0];
		if(comp_class == "Transform" && i == 0) //special case: this is the only component that comes by default
		{
			this.transform.configure(comp_info[1]);
			continue;
		}
		if(!LS.Components[comp_class]){
			console.error("Unknown component found: " + comp_class);
			continue;
		}
		var comp = new LS.Components[comp_class]( comp_info[1] );
		this.addComponent(comp);
	}
}

/**
* Adds a component to this node.
* @method serializeComponents
* @param {Object} o container where the components will be stored
*/

ComponentContainer.prototype.serializeComponents = function(o)
{
	if(!this._components)
		return;

	o.components = [];
	for(var i = 0, l = this._components.length; i < l; ++i)
	{
		var comp = this._components[i];
		if( !comp.serialize )
			continue;
		var obj = comp.serialize();

		//enforce uid storage
		if(comp.hasOwnProperty("uid") && !obj.uid)
			obj.uid = comp.uid;

		o.components.push([LS.getObjectClassName(comp), obj]);
	}
}

/**
* returns an array with all the components
* @method getComponents
* @return {Array} all the components
*/
ComponentContainer.prototype.getComponents = function()
{
	return this._components;
}

/**
* Adds a component to this node. (maybe attach would been a better name)
* @method addComponent
* @param {Object} component
* @return {Object} component added
*/
ComponentContainer.prototype.addComponent = function(component)
{
	if(!component)
		return console.error("addComponent cannot receive null");

	//link component with container
	component._root = this;
	if(component.onAddedToNode)
		component.onAddedToNode(this);

	if(this._in_tree && component.onAddedToScene)
		component.onAddedToScene(this._in_tree);

	//link node with component
	if(!this._components) 
		Object.defineProperty( this, "_components", { value: [], enumerable: false });
	if(this._components.indexOf(component) != -1)
		throw("inserting the same component twice");
	this._components.push(component);
	if( !component.hasOwnProperty("uid") )
		Object.defineProperty( component, "uid", { value: LS.generateUId("COMP-"), enumerable: false, writable: true});
		//component.uid = LS.generateUId("COMP-");
	return component;
}

/**
* Removes a component from this node.
* @method removeComponent
* @param {Object} component
*/
ComponentContainer.prototype.removeComponent = function(component)
{
	if(!component)
		return console.error("removeComponent cannot receive null");

	//unlink component with container
	component._root = null;
	if(component.onRemovedFromNode)
		component.onRemovedFromNode(this);

	if(this._in_tree && component.onRemovedFromScene)
		component.onRemovedFromScene(this._in_tree);

	//remove all events
	LEvent.unbindAll(this,component);

	//remove from components list
	var pos = this._components.indexOf(component);
	if(pos != -1)
		this._components.splice(pos,1);
}

/**
* Removes all components from this node.
* @method removeAllComponents
* @param {Object} component
*/
ComponentContainer.prototype.removeAllComponents = function()
{
	while(this._components.length)
		this.removeComponent( this._components[0] );
}


/**
* Returns if the class has an instance of this component
* @method hasComponent
* @param {bool}
*/
ComponentContainer.prototype.hasComponent = function(component_class) //class, not string with the name of the class
{
	if(!this._components)
		return false;

	//string
	if( component_class.constructor === String)
	{
		for(var i = 0, l = this._components.length; i < l; ++i)
			if( this._components[i].constructor.name == component_class )
			return true;
		return false;
	}

	//class
	for(var i = 0, l = this._components.length; i < l; ++i)
		if( this._components[i].constructor === component_class )
		return true;
	return false;
}


/**
* Returns the first component of this container that is of the same class
* @method getComponent
* @param {Object} component_class the class to search a component from (not the name of the class)
*/
ComponentContainer.prototype.getComponent = function(component_class)
{
	if(!this._components)
		return null;

	//string
	if( component_class.constructor === String )
	{
		for(var i = 0, l = this._components.length; i < l; ++i)
			if( this._components[i].constructor.name == component_class )
				return this._components[i];
		return null;
	}

	//class
	for(var i = 0, l = this._components.length; i < l; ++i)
		if( this._components[i].constructor == component_class )
		return this._components[i];
	return null;
}

/**
* Returns the component with the given uid
* @method getComponentByUId
* @param {string} uid the uid to search 
*/
ComponentContainer.prototype.getComponentByUId = function(uid)
{
	if(!this._components)
		return null;
	for(var i = 0, l = this._components.length; i < l; ++i)
		if( this._components[i].uid == uid )
			return this._components[i];
	return null;
}

/**
* Returns the position in the components array of this component
* @method getIndexOfComponent
* @param {Number} position in the array, -1 if not found
*/
ComponentContainer.prototype.getIndexOfComponent = function(component)
{
	if(!this._components)
		return -1;
	return this._components.indexOf(component);
}

/**
* Returns the component at index position
* @method getComponentByIndex
* @param {Object} component
*/
ComponentContainer.prototype.getComponentByIndex = function(index)
{
	if(!this._components)
		return null;
	return this._components[index];
}

/**
* executes the method with a given name in all the components
* @method processActionInComponents
* @param {String} action_name the name of the function to execute in all components (in string format)
* @param {Array} params array with every parameter that the function may need
*/
ComponentContainer.prototype.processActionInComponents = function(action_name,params)
{
	if(!this._components)
		return;
	for(var i = 0, l = this._components.length; i < l; ++i)
	{
		var comp = this._components[i];
		if( !comp[action_name] || comp[action_name].constructor !== Function )
			continue;

		if(!params || params.constructor !== Array)
			comp[action_name].call(comp, params);
		else
			comp[action_name].apply(comp, params);
	}
}

