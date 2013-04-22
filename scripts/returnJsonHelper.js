/**
 *	json return helpers
 */

// s-u-c-c-e-s-s that's the way we spell success
exports.returnSuccess = function(res, obj, title) {
	var resp = new Object();
	resp["responseCode"] = {status: "success", code: "200", count: obj.length};
	var extraInfo = "";
	if ( null != obj.shows ) {
		extraInfo = ", showCount: " + obj.shows.length
	}
	console.log("Returning success - title: " + title + extraInfo);
	resp[title] = obj;
	res.jsonp(200, resp);
}

// for failure.  like failure needs help...
exports.returnFailure = function(res, msg) {
	var resp = new Object();
	console.log("Returning failure - message: " + msg);
	resp["responseCode"] = {status: "failure", code: "404", errorMsg: msg};
	res.jsonp(404, resp);
}


