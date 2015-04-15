function AnnotationComponent(o)
{
	this.text = "";
	this.notes = [];
	this._screen_pos = vec3.create();
	this._selected = null;
	this.configure(o);
}

AnnotationComponent.editor_color = [0.33,0.874,0.56,0.9];


AnnotationComponent.onShowMainAnnotation = function (node)
{
	if(typeof(AnnotationModule) != "undefined")
		AnnotationModule.editAnnotation(node);
}

AnnotationComponent.onShowPointAnnotation = function (node, note)
{
	var comp = node.getComponent( AnnotationComponent );
	if(!comp) return;

	//in editor...
	if(typeof(AnnotationModule) != "undefined")
	{
		AnnotationModule.showDialog( note.text, { 
			item: note, 
			on_close: inner_update_note.bind(note), 
			on_delete: function(info) { 
				comp.removeAnnotation(info.item);
				LS.GlobalScene.refresh();
			},
			on_focus: function(info) { 
				AnnotationModule.focusInAnnotation(info.item);
				comp._selected = info.item;
			}});
	}


	function inner_update_note(text)
	{
		this.text = text;
	}
}

AnnotationComponent.prototype.addAnnotation = function(item)
{
	this._selected = null;
	this.notes.push(item);
}

AnnotationComponent.prototype.getAnnotation = function(index)
{
	return this.nodes[ index ];
}

AnnotationComponent.prototype.removeAnnotation = function(item)
{
	this._selected = null;
	var pos = this.notes.indexOf(item);
	if(pos != -1)
		this.notes.splice(pos,1);
}

AnnotationComponent.prototype.setStartTransform = function()
{
	this.start_position = this.getObjectCenter();
}

AnnotationComponent.prototype.getObjectCenter = function()
{
	var center = vec3.create();
	var mesh = this._root.getMesh();
	if(mesh && mesh.bounding )
		vec3.copy( center, BBox.getCenter(mesh.bounding) );
	var pos = this._root.transform.transformPointGlobal(center, vec3.create());
	return pos;
}

AnnotationComponent.prototype.serialize = function()
{
	var o = {
		text: this.text,
		notes: [],
		start_position: this.start_position
	};
	
	for(var i in this.notes)
	{
		var note = this.notes[i];
		for(var j in note)
		{
			if(note[j].constructor == Float32Array)
				Array.prototype.slice.call( note[j] );
		}
		o.notes.push(note);
	}
	return o;
}

AnnotationComponent.prototype.onAddedToNode = function(node)
{
	LEvent.bind(node,"mousedown",this.onMouse.bind(this),this);
}

AnnotationComponent.prototype.onRemovedFromNode = function(node)
{
}

AnnotationComponent.prototype.onMouse = function(type, e)
{
	if(e.eventType == "mousedown")
	{
		var node = this._root;
		this._screen_pos[2] = 0;
		var dist = vec3.dist( this._screen_pos, [e.canvasx, gl.canvas.height - e.canvasy, 0] );
		if(dist < 30)
		{
			var that = this;
			AnnotationComponent.onShowMainAnnotation(this._root);
		}

		for(var i in this.notes)
		{
			var note = this.notes[i];
			dist = vec2.dist( note._end_screen, [e.mousex, gl.canvas.height - e.mousey] );
			if(dist < 30)
			{
				this._selected = note;
				AnnotationComponent.onShowPointAnnotation(this._root, note);
				return true;
			}
		}
	}
}

LS.registerComponent(AnnotationComponent);