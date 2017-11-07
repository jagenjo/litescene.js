//work in progress

function VideoPlayer(o)
{
	this._enabled = true;

	this._video = document.createElement("video");
	this._video.muted = false;
	this._video.autoplay = false;
	this.bindVideoEvents( this._video );

	this._autoplay = true;
	this.generate_mipmaps = false;

	this._src = "";
	this._url_loading = null;
	this.texture_name = ":video";
	this.render_mode = true;
	this._playback_rate = 1;

	this._ignore_proxy = false;

	this._texture = null;

	if(o)
		this.configure(o);
}

Object.defineProperty( VideoPlayer.prototype, "enabled", {
	set: function(v){
		this._enabled = v;
		if(!v)
			this._video.pause();
		else
		{
			var scene = this._root ? this._root.scene : null;
			if(scene && scene.state === LS.RUNNING && this._video.autoplay)
			{
				if(this._video.currentTime >= this._video.duration)
					this._video.currentTime = 0;
				this._video.play();
			}
		}
	},
	get: function()
	{
		return this._enabled;
	},
	enumerable: true
});

//in case you are referencing a url with video that allow cors
Object.defineProperty( VideoPlayer.prototype, "ignore_proxy", {
	set: function(v){
		if( v == this._ignore_proxy )
			return;
		this._ignore_proxy = v;
		this.load( this.src );
	},
	get: function()
	{
		return this._ignore_proxy;
	},
	enumerable: true
});

Object.defineProperty( VideoPlayer.prototype, "src", {
	set: function(v){
		if(v == this._src)
			return;
		this._src = v;
		this.load( this._src );
	},
	get: function()
	{
		return this._src;
	},
	enumerable: true
});

Object.defineProperty( VideoPlayer.prototype, "time", {
	set: function(v){
		this._video.currentTime = time;
	},
	get: function()
	{
		return this._video.currentTime;
	},
	enumerable: false
});

Object.defineProperty( VideoPlayer.prototype, "texture", {
	set: function(v){
		throw("videoPlayer texture cannot be set");
	},
	get: function()
	{
		return this._texture;
	},
	enumerable: false
});

Object.defineProperty( VideoPlayer.prototype, "autoplay", {
	set: function(v){
		this._autoplay = v;
		//this._video.autoplay = v;
	},
	get: function()
	{
		return this._autoplay;
	},
	enumerable: true
});

Object.defineProperty( VideoPlayer.prototype, "muted", {
	set: function(v){
		this._video.muted = v;
	},
	get: function()
	{
		return this._video.muted;
	},
	enumerable: true
});

Object.defineProperty( VideoPlayer.prototype, "duration", {
	set: function(v){
		throw("VideoPlayer duration cannot be assigned, is read-only");
	},
	get: function()
	{
		return this._video.duration;
	},
	enumerable: false
});

Object.defineProperty( VideoPlayer.prototype, "playback_rate", {
	set: function(v){
		if(v < 0)
			return;
		this._playback_rate = v;
		this._video.playbackRate = v;
	},
	get: function()
	{
		return this._playback_rate;
	},
	enumerable: true
});


Object.defineProperty( VideoPlayer.prototype, "video", {
	set: function(v){
		if(!v || v.constructor !== HTMLVideoElement)
			throw("Video must a HTMLVideoElement");
		if( v == this._video )
			return;
	
		this._video = v;
		this._video.muted = false;
		this._video.autoplay = false;
		this._video.playbackRate = this._playback_rate;
		this.bindVideoEvents( this._video );
	},
	get: function()
	{
		return this._video;
	},
	enumerable: false
});

VideoPlayer.NONE = 0;
VideoPlayer.PLANE = 1;
VideoPlayer.TO_MATERIAL = 2;
VideoPlayer.BACKGROUND = 5;
VideoPlayer.BACKGROUND_STRETCH = 6;

VideoPlayer["@src"] = { type: "resource" };
VideoPlayer["@render_mode"] = { type: "enum", values: {"NONE":VideoPlayer.NONE, "PLANE": VideoPlayer.PLANE, "TO_MATERIAL": VideoPlayer.TO_MATERIAL, /* "BACKGROUND": VideoPlayer.BACKGROUND,*/ "BACKGROUND_STRETCH": VideoPlayer.BACKGROUND_STRETCH } };

VideoPlayer.prototype.onAddedToScene = function(scene)
{
	LEvent.bind( scene, "start", this.onStart, this);
	LEvent.bind( scene, "pause", this.onPause, this);
	LEvent.bind( scene, "unpause", this.onUnpause, this);
	LEvent.bind( scene, "beforeRender", this.onBeforeRender, this ); //to upload texture
	LEvent.bind( scene, "beforeRenderScene", this.onBeforeRenderScene, this ); //to render background quad
	LEvent.bind( scene, "collectRenderInstances", this.onCollectInstances, this );
	//LEvent.bind( scene, "update", this.onUpdate, this);
	LEvent.bind( scene, "finish", this.onFinish, this);
}

VideoPlayer.prototype.onRemovedFromScene = function(scene)
{
	LEvent.unbindAll( scene, this );
}

VideoPlayer.prototype.onStart = function()
{
	if(this.autoplay)
		this.play();
}

VideoPlayer.prototype.onPause = function()
{
	this.pause();
}

VideoPlayer.prototype.onUnpause = function()
{
	if(this.autoplay)
		this.play();
}

VideoPlayer.prototype.onFinish = function()
{
	this.stop();
}

/*
VideoPlayer.prototype.onUpdate = function( e, dt )
{
	if(!this.enabled || this._video.width == 0)
		return;

	this._time += dt;
	this._video.currentTime = this._time;
	this._video.dirty = true;
}
*/

VideoPlayer.prototype.load = function( url, force )
{
	if(!url)
		return;

	var final_url = LS.RM.getFullURL( url, { ignore_proxy: this.ignore_proxy  } );

	if( this._url_loading == final_url && !force )
		return;

	this._url_loading = url;
	this._video.crossOrigin = "anonymous";
	this._video.src = final_url;
	//this._video.type = "type=video/mp4";
}

VideoPlayer.prototype.bindVideoEvents = function( video )
{
	video._component = this;

	if(video.has_litescene_events)
		return;

	video.has_litescene_events = true;

	this._video.addEventListener("loadedmetadata",function(e) {
		//onload
		console.log("Duration: " + this.duration + " seconds");
		console.log("Size: " + this.videoWidth + "," + this.videoHeight);
		this.width = this.videoWidth;
		this.height = this.videoHeight;
		if(!this._component)
			return;
		var scene = this._component._root ? this._component._root.scene : null;
		if(scene && scene.state === LS.RUNNING && this._component._autoplay)
			this._component.play();
	});

	/*
	this._video.addEventListener("progress",function(e) {
		//onload
	});
	*/

	this._video.addEventListener("error",function(e) {
		console.error("Error loading video: " + this.src);
		if (this.error) {
		 switch (this.error.code) {
		   case this.error.MEDIA_ERR_ABORTED:
			  console.error("You stopped the video.");
			  break;
		   case this.error.MEDIA_ERR_NETWORK:
			  console.error("Network error - please try again later.");
			  break;
		   case this.error.MEDIA_ERR_DECODE:
			  console.error("Video is broken..");
			  break;
		   case this.error.MEDIA_ERR_SRC_NOT_SUPPORTED:
			  console.error("Sorry, your browser can't play this video.");
			  break;
		 }
		}
	});

	this._video.addEventListener("ended",function(e) {
		if(!this._component)
			return;
		console.log("Ended.");
		var scene = this._component._root ? this._component._root.scene : null;
		if(scene && scene.state === LS.RUNNING && this._component._autoplay)
		{
			this.currentTime = 0;
			this._component.play(); //loop
		}
	});
}

VideoPlayer.prototype.play = function()
{
	if(this._video.videoWidth)
		this._video.play();
}

VideoPlayer.prototype.playPause = function()
{
	if(this._video.paused)
		this.play();
	else
		this.pause();
}

VideoPlayer.prototype.stop = function()
{
	this._video.pause();
	this._video.currentTime = 0;
}

VideoPlayer.prototype.pause = function()
{
	this._video.pause();
}

//uploads the video frame to the GPU
VideoPlayer.prototype.onBeforeRender = function(e)
{
	//no video assigned or not loaded yet
	if(!this.enabled || this._video.videoWidth == 0)
		return;

	var video = this._video;

	var must_have_mipmaps = this.generate_mipmaps;
	if( !GL.isPowerOfTwo(video.videoWidth) || !GL.isPowerOfTwo(video.videoHeight) )
		must_have_mipmaps = false;

	//create destination texture
	if(!this._texture || this._texture.width != video.videoWidth || this._texture.has_mipmaps != must_have_mipmaps )
	{
		this._texture = new GL.Texture( video.videoWidth, video.videoHeight, { format: GL.RGB, minFilter: must_have_mipmaps ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR, magFilter: gl.LINEAR });
		this._texture.has_mipmaps = must_have_mipmaps;
	}

	//avoid reuploading the same frame again in case it is paused
	if(this._texture._video_time != video.currentTime )
	{
		this._texture.uploadImage( video );	
		if( must_have_mipmaps )
		{
			this._texture.bind(0);
			gl.generateMipmap( this._texture.texture_type );
			this._texture.unbind(0);
		}

		this._texture._video_time = video.currentTime;
		
	}

	//make texture available to all the system
	if(this.texture_name)
		LS.RM.registerResource( this.texture_name, this._texture );

	//assign to material color texture
	if(this.render_mode == VideoPlayer.TO_MATERIAL)
	{
		var material = this._root.getMaterial();
		if(material)
			material.setTexture( "color", this.texture_name );
	}
}

VideoPlayer.prototype.onBeforeRenderScene = function( e )
{
	if(!this.enabled)
		return;

	if(this.render_mode != VideoPlayer.BACKGROUND && this.render_mode != VideoPlayer.BACKGROUND_STRETCH)
		return;

	if(!this._texture)
		return;

	gl.disable( gl.BLEND );
	gl.disable( gl.CULL_FACE );
	gl.disable( gl.DEPTH_TEST );
	this._texture.toViewport();
}

VideoPlayer.prototype.onCollectInstances = function( e, RIs )
{
	if( !this.enabled || this.render_mode != VideoPlayer.PLANE )
		return;

	if( !this._material )
		this._material = new LS.StandardMaterial({ flags: { ignore_lights: true, two_sided: true }});

	if(!this._plane_ri)
	{
		var RI = this._plane_ri = new LS.RenderInstance();
		var mesh = GL.Mesh.plane();
		RI.setMesh( mesh );
		RI.setMaterial( this._material );
	}

	this._plane_ri.fromNode( this._root ); //update model
	this._material.setTexture("color", this._texture );
	RIs.push( this._plane_ri);
}

LS.registerComponent( VideoPlayer );