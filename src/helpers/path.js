///@INFO: UNCOMMON
/** Path
* Used to store splines
* types defined in defines.js: LINEAR, HERMITE, BEZIER
* @class Path
*/
function Path()
{
	this.points = [];
	this.closed = false;
	this.type = LS.LINEAR;
}

Path.prototype.clear = function()
{
	this.points.length = 0;
}

//points stored are cloned
Path.prototype.addPoint = function(p)
{
	var pos = vec3.create();
	pos[0] = p[0];
	pos[1] = p[1];
	if(p.length > 2)
		pos[2] = p[2];
	this.points.push( pos );
}

Path.prototype.getSegments = function()
{
	var l = this.points.length;

	switch(this.type)
	{
		case LS.LINEAR: 
			if(l < 2) 
				return 0;
			return l - 1 + (this.closed ? 1 : 0); 
			break;
		case LS.HERMITE:
			if(l < 2) 
				return 0;
			return l - 1 + (this.closed ? 1 : 0); 
		case LS.BEZIER:
			if(l < 3) 
				return 0;
			return (((l-1)/3)|0) + (this.closed ? 1 : 0);
			break;
	}
	return 0;
}

Path.prototype.movePoint = function( index, pos, preserve_tangents )
{
	if(index < 0 && index >= this.points.length)
		return;

	var p = this.points[ index ];
	var total_diff = vec3.sub( vec3.create(), pos, p );
	vec3.copy(p, pos);

	if( !preserve_tangents || this.type != LS.BEZIER )
		return;

	if(index % 3 == 2 && this.points.length > index + 2 )
	{
		var middle_pos = this.points[index + 1];
		var next_pos = this.points[index + 2];
		var diff = vec3.sub( vec3.create(), middle_pos, p );
		vec3.add( next_pos, middle_pos, diff );
	}
	else if(index % 3 == 1 && index > 3 )
	{
		var middle_pos = this.points[index - 1];
		var prev_pos = this.points[index - 2];
		var diff = vec3.sub( vec3.create(), middle_pos, p );
		vec3.add( prev_pos, middle_pos, diff );
	}
	else if( index % 3 == 0 )
	{
		if( index > 1 )
		{
			var prev_pos = this.points[index - 1];
			vec3.add( prev_pos, prev_pos, total_diff );
		}
		if( index < this.points.length - 1 )
		{
			var next_pos = this.points[index + 1];
			vec3.add( next_pos, next_pos, total_diff );
		}
	}
}

Path.prototype.computePoint = function(f, out)
{
	switch(this.type)
	{
		case LS.HERMITE: return this.getHermitePoint(f,out); break;
		case LS.BEZIER: return this.getBezierPoint(f,out); break;
		case LS.LINEAR: 
		default:
			return this.getLinearPoint(f,out);
			break;
	}
	//throw("Impossible path type");
}


Path.prototype.getLinearPoint = function(f, out)
{
	out = out || vec3.create();
	var num = this.points.length;
	var l = num;
	if(l < 2)
		return out;

	if(f <= 0)
		return vec3.copy(out, this.points[0]);
	if(f >= 1)
	{
		if(this.closed)
			return vec3.copy(out, this.points[0]);
		return vec3.copy(out, this.points[l-1]);
	}

	if( this.closed )
		l += 1;

	var v = ((l-1) * f);
	var i = v|0;
	var fract = v-i;
	var p = this.points[ i % num ];
	var p2 = this.points[ (i+1) % num ];
	return vec3.lerp(out, p, p2, fract);
}

Path.temp_vec3a = vec3.create();
Path.temp_vec3b = vec3.create();
Path.temp_vec3c = vec3.create();

Path.prototype.getBezierPoint = function(f, out)
{
	out = out || vec3.create();
	var l = this.points.length;
	if(l < 4)
		return out;
	l = (((l-1)/3)|0) * 3 + 1; //take only useful points

	if(f <= 0)
		return vec3.copy(out, this.points[0]);
	if(f >= 1)
		return vec3.copy(out, this.points[ this.closed ? 0 : l-1 ]);

	var num = (l-1)/3 + (this.closed ? 1 : 0); //num segment
	var v = num*f; //id.weight
	var i = (v|0); //id
	var t = v-i;//weight

	var i1 = (i*3);
	var i2 = (i*3+1);
	var i3 = (i*3+2);
	var i4 = (i*3+3);

	var p,p1,p2,p3;

	if( this.closed && i == num-1 )
	{
		p = this.points[l-1];
		p3 = this.points[0];
		var diff = vec3.sub( Path.temp_vec3c, p, this.points[l-2] );
		p1 = vec3.add( Path.temp_vec3a, p, diff );
		diff = vec3.sub( Path.temp_vec3c, p3, this.points[1] );
		p2 = vec3.add( Path.temp_vec3b, p3, diff );
	}
	else
	{
		p = this.points[ i1 ];
		p1 = this.points[ i2 ];
		p2 = this.points[ i3 ];
		p3 = this.points[ i4 ];
	}

	var b1 = (1-t)*(1-t)*(1-t);
	var b2 = 3*t*(1-t)*(1-t);
	var b3 = 3*t*t*(1-t);
	var b4 = t*t*t;

	out[0] = p[0] * b1 + p1[0] * b2 + p2[0] * b3 + p3[0] * b4;
	out[1] = p[1] * b1 + p1[1] * b2 + p2[1] * b3 + p3[1] * b4;
	out[2] = p[2] * b1 + p1[2] * b2 + p2[2] * b3 + p3[2] * b4;
	return out;
}

Path.prototype.getHermitePoint = function(f, out)
{
	out = out || vec3.create();
	var l = this.points.length;
	if(l < 2)
		return out;
	if(f <= 0)
		return vec3.copy(out, this.points[0]);
	if(f >= 1)
		return vec3.copy(out, this.points[ this.closed ? 0 : l-1]);

	var num = (l-1) + (this.closed ? 1 : 0); //num segments
	var v = num*f; //id.weight
	var i = (v|0); //id
	var t = v-i;//weight

	var pre_p0 = this.points[i - 1];
	var p0 = this.points[ i ];
	var p1 = this.points[ i+1 ];
	var post_p1 = this.points[ i+2 ];

	if(!pre_p0)
		pre_p0 = this.closed ? this.points[l - 1] : p0;
	if(!p1)
		p1 = this.points[ (i+1) % l ];
	if(!post_p1)
		post_p1 = this.closed ? this.points[ (i+2) % l ] : p1;

	Animation.EvaluateHermiteSplineVector( p0, p1, pre_p0, post_p1, t, out );
	return out;
}


/*
Path.prototype.getCatmullPoint = function(f, out)
{
	out = out || vec3.create();
	var l = this.points.length;
	if(l < 4)
		return out;
	l = (((l-1)/3)|0) * 3 + 1; //take only useful points
	if(f <= 0)
		return vec3.copy(out, this.points[0]);
	if(f >= 1)
		return vec3.copy(out, this.points[l-1]);

	var v = ((l-1)/3*f); 
	var i = v|0;//spline number
	var fract = v-i;//weight
	var p = this.points[ i ];
	var p1 = this.points[ i+1 ];
	var p2 = this.points[ i+2 ];
	var p3 = this.points[ i+3 ];
	var w = fract;
	var w2 = w*w;
	var w3 = w2*w;
	out[0] = Path.interpolate( p[0], p1[0], p2[0], p3[0], w,w2,w3 );
	out[1] = Path.interpolate( p[1], p1[1], p2[1], p3[1], w,w2,w3 );
	out[2] = Path.interpolate( p[2], p1[2], p2[2], p3[2], w,w2,w3 );
	return out;
}

//catmull-rom
Path.interpolate = function ( p0, p1, p2, p3, t, t2, t3 ) {
	var v0 = ( p2 - p0 ) * 0.5;
	var v1 = ( p3 - p1 ) * 0.5;
	return ( 2 * ( p1 - p2 ) + v0 + v1 ) * t3 + ( - 3 * ( p1 - p2 ) - 2 * v0 - v1 ) * t2 + v0 * t + p1;
};
*/

Path.prototype.samplePoints = function( n, out )
{
	if(n <= 0)
	{
		var segments = this.getSegments();
		if(this.type == LS.LINEAR)
			n = segments + 1;
		else
			n = segments * 20;
	}

	out = out || Array(n);
	out.length = n;

	for(var i = 0; i < n; i++)
		out[i] = this.computePoint(i/(n-1));
	return out;
}

Path.prototype.samplePointsTyped = function( n, out )
{
	if(out && out.length < (n * 3))
		n = Math.floor(out.length / 3);

	if(n <= 0)
	{
		var segments = this.getSegments();
		if(this.type == LS.LINEAR)
			n = segments + 1;
		else
			n = segments * 20;
	}

	out = out || new Float32Array( n * 3 );
	for(var i = 0; i < n; i++)
		this.computePoint(i/(n-1),out.subarray(i*3,i*3+3));
	return out;
}


Path.prototype.serialize = function()
{
	var o = {};
	var points = Array( this.points.length * 3 );
	for(var i = 0; i < this.points.length; i++)
	{
		var p = this.points[i];
		points[i*3] = p[0];
		points[i*3+1] = p[1];
		points[i*3+2] = p[2];
	}

	o.points = points;
	o.type = this.type;
	o.closed = this.closed;
	return o;
}

Path.prototype.configure = function(o)
{
	this.type = o.type;
	this.closed = o.closed;

	if(o.points)
	{
		this.points.length = o.points.length / 3;
		var points = o.points;
		for(var i = 0; i < this.points.length; i++)
			this.points[i] = vec3.fromValues( points[i*3], points[i*3+1], points[i*3+2] );
	}
}


LS.Path = Path;