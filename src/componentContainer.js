/*
	A component container is someone who could have components attached to it.
	Mostly used for SceneNodes but it could be used for other classes (like SceneTree or Project).
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
	this._missing_components = null; //here we store info about components with missing info
	//this._components_by_uid = {}; //TODO
}


/**
* Adds a component to this node.
* @method configureComponents
* @param {Object} info object containing all the info from a previous serialization
*/

ComponentContainer.prototype.configureComponents = function( info )
{
	if(!info.components)
		return;

	for(var i = 0, l = info.components.length; i < l; ++i)
	{
		var comp_info = info.components[i];
		var comp_class = comp_info[0];
		var comp = null;

		//special case: this is the only component that comes by default
		if(comp_class == "Transform" && i == 0 && this.transform) 
		{
			comp = this.transform;
		}
		else
		{
			//search for the class
			var classObject = LS.Components[comp_class];
			if(!classObject){
				console.error("Unknown component found: " + comp_class);
				if(!this._missing_components)
					this._missing_components = [];
				this._missing_components.push( comp_info );
				continue;
			}
			//create component
			comp = new classObject(); //comp_info[1]
			//attach to node
			this.addComponent(comp);
		}

		//what about configure the comp after adding it? 
		comp.configure( comp_info[1] );

		//editor stuff
		if( comp_info[1].editor )
			comp._editor = comp_info[1].editor;

		//ensure the component uid is stored, some components may forgot about it
		if( comp_info[1].uid && comp_info[1].uid !== comp.uid )
			comp.uid = comp_info[1].uid;
	}
}

/**
* Adds a component to this node.
* @method serializeComponents
* @param {Object} o container where the components will be stored
*/

ComponentContainer.prototype.serializeComponents = function( o )
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

		if(comp._editor)
			obj.editor = comp._editor;

		//enforce uid storage
		if(comp.hasOwnProperty("_uid") && !obj.uid)
			obj.uid = comp.uid;

		o.components.push([LS.getObjectClassName(comp), obj]);
	}

	if(this._missing_components && this._missing_components.length)
		o.components = o.components.concat( this._missing_components );
}

/**
* returns an array with all the components
* @method getComponents
* @return {Array} all the components
*/
ComponentContainer.prototype.getComponents = function( class_type )
{
	if(class_type)
	{
		var result = [];
		if(class_type.constructor === String)
			class_type = LS.Components[class_type];
		for(var i = 0, l = this._components.length; i < l; ++i)
		{
			var compo = this._components[i];
			if( compo.constructor === class_type )
				result.push( compo );
		}
		return result;
	}

	return this._components;
}

/**
* Adds a component to this node. (maybe attach would been a better name)
* @method addComponent
* @param {Object} component
* @return {Object} component added
*/
ComponentContainer.prototype.addComponent = function( component, index )
{
	if(!component)
		throw("addComponent cannot receive null");

	//link component with container
	component._root = this;

	//must have uid
	if( !component.uid )
		component.uid = LS.generateUId("COMP-");

	//not very clean, ComponetContainer shouldnt know about LS.SceneNode, but this is more simple
	if( component.onAddedToNode)
		component.onAddedToNode(this);

	if( this._in_tree )
	{
		if( component.uid )
			this._in_tree._components_by_uid[ component.uid ] = component;
		else
			console.warn("component without uid?", component);
		if(	component.onAddedToScene )
			component.onAddedToScene( this.constructor == LS.SceneTree ? this : this._in_tree );
	}

	//link node with component
	if(!this._components) 
		Object.defineProperty( this, "_components", { value: [], enumerable: false });
	if(this._components.indexOf(component) != -1)
		throw("inserting the same component twice");

	if(index !== undefined && index <= this._components.length )
		this._components.splice(index,0,component);
	else
		this._components.push( component );

	LEvent.trigger( this, "componentAdded", component );

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
		throw("removeComponent cannot receive null");

	//unlink component with container
	component._root = null;

	//not very clean, ComponetContainer shouldnt know about LS.SceneNode, but this is more simple
	if( component.onRemovedFromNode )
		component.onRemovedFromNode(this);

	if( this._in_tree )
	{
		delete this._in_tree._components_by_uid[ component.uid ];
		if(component.onRemovedFromScene)
			component.onRemovedFromScene( this._in_tree );
	}

	//remove all events
	LEvent.unbindAll(this,component);

	//remove from components list
	var pos = this._components.indexOf(component);
	if(pos != -1)
		this._components.splice(pos,1);
	else
		console.warn("removeComponent: Component not found in node");

	LEvent.trigger( this, "componentRemoved", component );
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
	this._missing_components = null;
}


/**
* Returns if the container has a component of this class
* @method hasComponent
* @param {String|Class} component_class the component to search for, could be a string or the class itself
* @param {Boolean} search_missing [optional] true if you want to search in the missing components too
*/
ComponentContainer.prototype.hasComponent = function( component_class, search_missing )
{
	if(!this._components && !this._missing_components)
		return false;

	//search in missing components
	if(search_missing && this._missing_components && this._missing_components.length)
	{
		if(component_class.constructor !== String) //weird case
			component_class = LS.getClassName( component_class );
		for(var i = 0, l = this._missing_components.length; i < l; ++i)
			if( this._missing_components[i][0] == component_class )
				return true;
	}

	//string
	if( component_class.constructor === String )
	{
		component_class = LS.Components[ component_class ];
		if(!component_class)
			return false;
	}

	//search in components
	for(var i = 0, l = this._components.length; i < l; ++i)
		if( this._components[i].constructor === component_class )
			return true;
	
	return false;
}


/**
* Returns the first component of this container that is of the same class
* @method getComponent
* @param {Object|String} component_class the class to search a component from (could be the class or the name)
* @param {Number} index [optional] if you want the Nth component of this class
*/
ComponentContainer.prototype.getComponent = function( component_class, index )
{
	if(!this._components || !component_class)
		return null;

	//convert string to class
	if( component_class.constructor === String )
	{
		component_class = LS.Components[ component_class ];
		if(!component_class)
			return;
	}

	//search components
	for(var i = 0, l = this._components.length; i < l; ++i)
	{
		if( this._components[i].constructor === component_class )
		{
			if(index !== undefined && index > 0)
			{
				index--;
				continue;
			}
			return this._components[i];
		}
	}

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
	return this._components.indexOf( component );
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
* Changes the order of a component
* @method setComponentIndex
* @param {Object} component
*/
ComponentContainer.prototype.setComponentIndex = function( component, index )
{
	if(!this._components)
		return null;
	if(index < 0)
		index = 0;
	var old_index = this._components.indexOf( component );
	if (old_index == -1)
		return;

	this._components.splice( old_index, 1 );

	/*
	if(index >= old_index)
		index--; 
	*/
	if(index >= this._components.length)
		this._components.push( component );
	else
		this._components.splice( index, 0, component );

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

