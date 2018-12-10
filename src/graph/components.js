///@INFO: GRAPHS
if(typeof(LiteGraph) != "undefined")
{
	//generic for all components that do not define their own node type
	global.LGraphComponent = function()
	{
		this.properties = {
			node_id: "",
			component_id: ""
		};

		//this.addInput("Component", undefined, { locked: true });

		this._component = null;
	}

	LGraphComponent.title = "Component";
	LGraphComponent.desc = "A component from a node";

	LGraphComponent.prototype.onRemoved = function()
	{
		this.bindComponentEvents(null); //remove binding		
	}

	LGraphComponent.prototype.onConnectionsChange = function( side )
	{
		this.bindComponentEvents( this._component );
	}

	LGraphComponent.prototype.onInit = function()
	{
		var compo = this.getComponent();
		if(!compo)
			return;
		this.processOutputs( compo );
	}

	LGraphComponent.prototype.processOutputs = function( compo )
	{
		if(!this.outputs || !this.outputs.length  )
			return;

		//write outputs
		for(var i = 0; i < this.outputs.length; i++)
		{
			var output = this.outputs[i];
			if( !output.links || !output.links.length || output.type == LiteGraph.EVENT )
				continue;

			if(output.name == "Component")
				this.setOutputData(i, compo );
			else
				this.setOutputData(i, compo[ output.name ] );
		}
	}


	LGraphComponent.prototype.onExecute = function()
	{
		var compo = this.getComponent();
		if(!compo)
			return;

		//read inputs (skip 1, is the component)
		if(this.inputs)
		for(var i = 0; i < this.inputs.length; i++)
		{
			var input = this.inputs[i];
			if( input.type === LiteGraph.ACTION )
				continue;
			var v = this.getInputData(i);
			if(v === undefined)
				continue;
			LS.setObjectProperty( compo, input.name, v );
		}

		//write outputs (done in a function so it can be reused by other methods)
		this.processOutputs( compo );
	}

	LGraphComponent.updateOutputData = function( slot )
	{
		if(!this.outputs || slot >= this.outputs.length  )
			return;

		var output = this.outputs[i];
		if( !output.links || !output.links.length || output.type == LiteGraph.EVENT )
			return;

		var compo = this.getComponent();
		if(!compo)
			return;

		if(output.name == "Component")
			this.setOutputData( slot, compo );
		else
			this.setOutputData( slot, compo[ output.name ] );
	}

	LGraphComponent.prototype.onDrawBackground = function()
	{
		var compo = this.getComponent();
		if(compo)
			this.title = LS.getClassName( compo.constructor );
	}

	LGraphComponent.prototype.onConnectionsChange = function( type, slot, created, link_info, slot_info )
	{
		if(type == LiteGraph.INPUT && slot_info && slot_info.name == "Component" )
		{
			var node = this.getInputNode(slot);
			if(node && node.onExecute)
			{
				node.onExecute();
				this.setDirtyCanvas(true,true);
			}
		}
	}

	LGraphComponent.prototype.getComponent = function()
	{
		var scene = this.graph._scene;
		if(!scene) 
			return null;

		var node_id = this.properties.node_id;
		if(!node_id)
		{
			if( this.inputs && this.inputs.length )
			{
				var slot = this.findInputSlot("Component");
				if(slot != -1)
				{
					var component = this.getInputData(slot);
					return component ? component : null;
				}
			}

			return null;
		}

		//find node
		var node = scene.getNode( node_id );
		if(!node)
			return null;

		//find compo
		var compo_id = this.properties.component_id;
		var compo = null;
		if(compo_id.charAt(0) == "@")
			compo = node.getComponentByUId( compo_id );
		else if( LS.Components[ compo_id ] )
			compo = node.getComponent( LS.Components[ compo_id ] );
		else
			return null;

		if(compo && !compo.constructor.is_component)
			return null;

		if(this._component != compo)
			this.bindComponentEvents( compo );

		this._component = compo;
		return compo;
	}

	//bind events attached to this component
	LGraphComponent.prototype.bindComponentEvents = function( component )
	{
		if(this._component)
			LEvent.unbindAll( this._component, this );

		this._component = component;
		if( !this._component )
			return;
		
		//iterate outputs
		if(this.outputs && this.outputs.length)
			for(var i = 0; i < this.outputs.length; ++i )
			{
				var output = this.outputs[i];
				if( output.type !== LiteGraph.EVENT )
					continue;
				var event_name = output.name.substr(3);
				LEvent.bind( this._component, event_name, this.onComponentEvent, this );
			}
	}

	LGraphComponent.prototype.onComponentEvent = function ( e, params )
	{
		this.trigger( "on_" + e, params );
	}

	LGraphComponent.prototype.getComponentProperties = function( get_inputs, result )
	{
		var compo = this.getComponent();
		if(!compo)
			return null;

		var attrs = null;
		if(compo.getPropertiesInfo)
			attrs = compo.getPropertiesInfo( get_inputs );
		else
			attrs = LS.getObjectProperties( compo );

		result = result || [];
		for(var i in attrs)
			result.push( [i, attrs[i]] );
		return result;
	}

	LGraphComponent.prototype.onAction = function( action_name, params ) { 
		if(!action_name)
			return;
		var compo = this.getComponent();
		if(!compo)
			return;
		if(compo.onAction)
			compo.onAction( action_name, params );
		else if( compo[ action_name ] )
			compo[ action_name ](); //params will be mostly MouseEvent, so for now I wont pass it
	}

	//used by the LGraphSetValue node
	LGraphComponent.prototype.onSetValue = function( property_name, value ) { 
		var compo = this.getComponent();
		if(!compo)
			return;

		var current = compo[ property_name ];
		var final_value;

		if( current == null)
		{
			if(value && value.constructor === String)
				final_value = value;
		}
		else
		{
			switch( current.constructor )
			{
				case Number: final_value = Number( value ); break;
				case Boolean: final_value = (value == "true" || value == "1"); break;
				case String: final_value = String( value ); break;
				case Array:
				case Float32Array: 
					if( value != null )
					{
						if( value.constructor === String )
							final_value = JSON.parse("["+value+"]");
						else if( value.constructor === Number )
							final_value = [value];
						else
							final_value = value;
					}
					else
						final_value = value;
					break;
			}
		}

		if(final_value === undefined)
			return;

		if(compo.setPropertyValue)
			compo.setPropertyValue( property_name, final_value );
		else
			compo[ property_name ] = final_value;
	}

	LGraphComponent.prototype.onGetInputs = function()
	{ 
		var inputs = [["Node",0],["Component",0],null];

		this.getComponentProperties("input", inputs);

		var compo = this.getComponent();
		if(compo && compo.getActions)
		{
			var actions = compo.getActions({});
			if(actions)
			{
				if(actions.constructor === Array)
					for(var i = 0; i < actions.length; ++i)
						inputs.push( [ actions[i], LiteGraph.ACTION ] );
				else
					for(var i in actions)
						inputs.push( [i, LiteGraph.ACTION ] );
			}
		}

		return inputs;
	}

	LGraphComponent.prototype.onGetOutputs = function()
	{ 
		var outputs = [];
		outputs.push( ["Component", "Component" ], null ); //compo + separator

		this.getComponentProperties( "output", outputs);

		var compo = this.getComponent();
		if(compo && compo.getEvents)
		{
			var events = compo.getEvents();
			if(events)
			{
				if(events.constructor === Array)
					for(var i = 0; i < events.length; ++i)
						outputs.push( ["on_" + events[i], LiteGraph.EVENT ] );
				else
					for(var i in events)
						outputs.push( ["on_" + i, LiteGraph.EVENT ] );
			}
		}
		return outputs;
	}

	LGraphComponent.prototype.onInspect = function( inspector )
	{ 
		var that = this;

		var component = this.getComponent();
		if(component && component.onInspectNode )
			component.onInspectNode( inspector, this );

		inspector.addButton(null, "Inspect Component", function(){
			var compo = that.getComponent();
			if(!compo)
				return;
			EditorModule.inspect( compo );
		});
	}


	LiteGraph.registerNodeType("scene/component", LGraphComponent );
	
	//********************************************************

	/* LGraphNode representing an object in the Scene */

	global.LGraphTransform = function()
	{
		this.properties = {node_id:""};
		if(LGraphSceneNode._current_node_id)
			this.properties.node_id = LGraphSceneNode._current_node_id;
		this.addInput("Transform", "Transform", { locked: true });
		this.addOutput("Position","vec3");
	}

	LGraphTransform.title = "Transform";
	LGraphTransform.desc = "Transform info of a node";

	LGraphTransform.prototype.onExecute = function()
	{
		var transform = null;

		if(this.inputs && this.inputs[0])
			transform = this.getInputData(0);

		if(!transform)
		{
			var scene = this.graph.getScene();
			if(!scene)
				return;

			var node = this._node;
			if(	this.properties.node_id )
			{
				node = scene.getNode( this.properties.node_id );
				if(!node)
					return;
			}

			if(!node)
				node = this.graph._scenenode;

			transform = node.transform;
		}

		if(!transform)
			return;

		//read inputs
		if(this.inputs)
		for(var i = 1; i < this.inputs.length; ++i)
		{
			var input = this.inputs[i];
			var v = this.getInputData(i);
			if(v === undefined)
				continue;
			switch( input.name )
			{
				case "x": transform.x = v; break;
				case "y": transform.y = v; break;
				case "z": transform.z = v; break;
				case "Position": transform.setPosition(v); break;
				case "Rotation": transform.setRotation(v); break;
				case "Scale": transform.setScale(v); break;
				case "Matrix": transform.fromMatrix(v); break;
				case "Mult.Matrix": transform.applyTransformMatrix(v); break;
				case "Translate": transform.translate(v); break;
				case "Translate Global": transform.translateGlobal(v); break;
				case "Rotate": quat.multiply( transform._rotation, transform._rotation, v ); transform._must_update = true; break;
				case "RotateX": transform.rotateX(v); break;
				case "RotateY": transform.rotateY(v); break;
				case "RotateZ": transform.rotateZ(v); break;
			}
		}

		//write outputs
		if(this.outputs)
		for(var i = 0; i < this.outputs.length; ++i)
		{
			var output = this.outputs[i];
			if(!output.links || !output.links.length)
				continue;

			var value = undefined;
			switch( output.name )
			{
				case "x": value = transform.x; break;
				case "y": value = transform.y; break;
				case "z": value = transform.z; break;
				case "Position": value = transform.position; break;
				case "Global Position": value = transform.getGlobalPosition(); break;
				case "Rotation": value = transform.rotation; break;
				case "Global Rotation": value = transform.getGlobalRotation(); break;
				case "Scale": value = transform.scaling; break;
				case "Matrix": value = transform.getMatrix(); break;
				default:
					break;
			}

			if(value !== undefined)
				this.setOutputData( i, value );
		}
	}

	LGraphTransform.prototype.onGetInputs = function()
	{
		return [["Position","vec3"],["Rotation","quat"],["Scale","number"],["x","number"],["y","number"],["z","number"],["Global Position","vec3"],["Global Rotation","quat"],["Matrix","mat4"],["Mult.Matrix","mat4"],["Translate","vec3"],["Translate Global","vec3"],["Rotate","quat"],["RotateX","number"],["RotateY","number"],["RotateZ","number"]];
	}

	LGraphTransform.prototype.onGetOutputs = function()
	{
		return [["Position","vec3"],["Rotation","quat"],["Scale","number"],["x","number"],["y","number"],["z","number"],["Global Position","vec3"],["Global Rotation","quat"],["Matrix","mat4"]];
	}

	LiteGraph.registerNodeType("scene/transform", LGraphTransform );

};
