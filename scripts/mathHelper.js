/**
 *	math helpers
 */

var MILES_PER_KM = 0.621371;
var EARTH_RADIUS_KM = 6371;


// public - distFromLatLngInMi
exports.distFromLatLngInMi = function(lat1, lon1, lat2, lon2) {
	return distFromLatLngInKm(lat1, lon1, lat2, lon2) * MILES_PER_KM;
}

function distFromLatLngInKm(lat1, lon1, lat2, lon2) {
	var dLat = deg2rad(lat2-lat1);  // deg2rad below
	var dLon = deg2rad(lon2-lon1);
	var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
		Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
		Math.sin(dLon/2) * Math.sin(dLon/2);
	var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
	var d = EARTH_RADIUS_KM * c; // Distance in km
	return d;
}

function deg2rad(deg) {
	return deg * (Math.PI/180)
}
