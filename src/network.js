var Network = {
	/**
	* A front-end for XMLHttpRequest so it is simpler and more cross-platform
	*
	* @method request
	* @param {Object} request object with the fields for the request: 
    *			dataType: result type {text,xml,json,binary,arraybuffer,image}, data: object with form fields, callbacks supported: {success, error, progress}
	* @return {XMLHttpRequest} the XMLHttpRequest of the petition
	*/
	request: function(request)
	{
		if(typeof(request) === "string")
			throw("LS.Network.request expects object, not string. Use LS.Network.requestText or LS.Network.requestJSON");
		var dataType = request.dataType || "text";
		if(dataType == "json") //parse it locally
			dataType = "text";
		else if(dataType == "xml") //parse it locally
			dataType = "text";
		else if (dataType == "binary")
		{
			//request.mimeType = "text/plain; charset=x-user-defined";
			dataType = "arraybuffer";
			request.mimeType = "application/octet-stream";
		}	
		else if(dataType == "image") //special case: images are loaded using regular images request
		{
			var img = new Image();
			img.onload = function() {
				if(request.success)
					request.success.call(this);
			};
			img.onerror = request.error;
			img.src = request.url;
			return img;
		}

		//regular case, use AJAX call
        var xhr = new XMLHttpRequest();
        xhr.open(request.data ? 'POST' : 'GET', request.url, true);
		xhr.withCredentials = true;
        if(dataType)
            xhr.responseType = dataType;
        if (request.mimeType)
            xhr.overrideMimeType( request.mimeType );
        xhr.onload = function(load)
		{
			var response = this.response;
			if(this.status != 200)
			{
				var err = "Error " + this.status;
				if(request.error)
					request.error(err);
				return;
			}

			if(request.dataType == "json") //chrome doesnt support json format
			{
				try
				{
					response = JSON.parse(response);
				}
				catch (err)
				{
					if(request.error)
						request.error(err);
				}
			}
			else if(request.dataType == "xml")
			{
				try
				{
					var xmlparser = new DOMParser();
					response = xmlparser.parseFromString(response,"text/xml");
				}
				catch (err)
				{
					if(request.error)
						request.error(err);
				}
			}

			if(LS.catch_errors)
			{
				try
				{
					if(request.success)
						request.success.call(this, response);
					LEvent.trigger(xhr,"done",response);
				}
				catch (err)
				{
					LEvent.trigger(LS,"code_error",err);
				}
			}
			else
			{
				if(request.success)
					request.success.call(this, response);
				LEvent.trigger(xhr,"done",response);
			}
		};
        xhr.onerror = function(err) {
			if(request.error)
				request.error(err);
			LEvent.trigger(this,"fail", err);
		}

		if( request.progress )
			xhr.addEventListener( "progress", request.progress );

        xhr.send(request.data);

		return xhr;
	},

	/**
	* retrieve a file from url (you can bind LEvents to done and fail)
	* @method requestFile
	* @param {string} url
	* @param {object} params form params
	* @param {function} callback
	*/
	requestFile: function(url, data, callback, callback_error)
	{
		if(typeof(data) == "function")
		{
			data = null;
			callback = data;
		}
		return LS.Network.request({url:url, data:data, success: callback, error: callback_error });
	},

	/**
	* retrieve a JSON file from url (you can bind LEvents to done and fail)
	* @method requestJSON
	* @param {string} url
	* @param {object} params form params
	* @param {function} callback
	*/
	requestJSON: function(url, data, callback, callback_error)
	{
		if(typeof(data) == "function")
		{
			data = null;
			callback = data;
		}
		return LS.Network.request({url:url, data:data, dataType:"json", success: callback, error: callback_error });
	},

	/**
	* retrieve a text file from url (you can bind LEvents to done and fail)
	* @method requestText
	* @param {string} url
	* @param {object} params form params
	* @param {function} callback
	*/
	requestText: function(url, data, callback, callback_error)
	{
		if(typeof(data) == "function")
		{
			data = null;
			callback = data;
		}
		return LS.Network.request({url:url, dataType:"txt", success: callback, success: callback, error: callback_error});
	}
};

LS.Network = Network;