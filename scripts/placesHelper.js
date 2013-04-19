/**
 *	placesHelper
 *
 *	helper functions for google places responses
 */


// zip from google places response
exports.zipFromPlacesResp = function(body) {
	var zip;
	// no error, got it
	var gPlace = JSON.parse(body);
	gPlace["results"][0]["address_components"].forEach(function(component) {
		component["types"].some(function(type) {
			if ("postal_code" == type) {
				zip = component["long_name"];
				return true;
			}
		});
	});
	if ( null == zip ) {
		// we're in BFE.  only doing this so i can set a breakpoint
		zip = null;
	}
	return zip;
}


