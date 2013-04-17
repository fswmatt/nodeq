/**
 *
 *
 */
 
// global map
var map;

window.onload = initMap;
 
function initMap() {
 	if ( navigator.geolocation ) {
 		navigator.geolocation.getCurrentPosition(createMap, locationError);
 	} else {
 		alert ("No location support");
 	}
}


// show the location
function createMap(position) {
	var gLatLng = new google.maps.LatLng(position.coords.latitude,
  				position.coords.longitude);
	// make a map
 	map = new google.maps.Map(document.getElementById("map"), {
 		zoom: 14,
 		center: gLatLng,
 		mapTypeId: google.maps.MapTypeId.ROADMAP
 	});
 	
 	// add "You Are Here" marker
 	var title = "You Are Here";
 	var content = "Lat: " + position.coords.latitude + ", Lng: " +
 			position.coords.longitude;
 	addMarker(map, gLatLng, title, content, "1");
 	
 	// add listeners for bounds events
	google.maps.event.addListener(map, "idle", updateBoundsDisplay);
	google.maps.event.addListener(map, "click", closeInfoWindow);
}


// global for existing markers
var markers = new Object();
var openInfoWindow = null;

function closeInfoWindow() {
	if ( null != openInfoWindow ) {
		openInfoWindow.close(map);
		openInfoWindow = null;
	}
}

// adds a flag to the map
function addMarker(map, latLng, title, content, id) {
	if ( null == markers[id] ) {
		// nope, don't have it yet.
		var marker = new google.maps.Marker( { map: map
			, position: latLng
			, title: title
			, clickable: true 
			, animation: google.maps.Animation.DROP
		});
		var infoWindow = new google.maps.InfoWindow( { content: content
			, position: latLng
		});
		markers[id] = { marker: marker
			, info: infoWindow
		};
		console.log("Adding marker for " + title);
		google.maps.event.addListener(marker, "click", function() {
			if ( null != openInfoWindow ) {
				openInfoWindow.close(map);
			}
			infoWindow.open(map);
			openInfoWindow = infoWindow;
		});
	}
}


// bounds changed.  update the bounds display
function updateBoundsDisplay(event) {
 	// what's the bounds?
 	var bounds = map.getBounds();
  	var div = document.getElementById("mapinfo");
  	
  	// bounds are updated, get some tasty events
  	// calling our api, formatted like this:
  	//  http://localhost:8000/api/v0.1/getShowList/45.58/-122.6/45.50/-122.67
	$.ajax({
		// the URL for the request
		url: "/api/v0.1/getShowList/" + bounds.Z.b + "/" + bounds.fa.b + "/" + bounds.Z.d
				+ "/" + bounds.fa.d,
		type: "GET",
		dataType : "json",
 
		success: function( json ) {
			json.shows.forEach(function (show) {
				if ( null != show && null != show.venue && null != show.artists
						&& null != show.artists[0] ) {
					var gLatLng = new google.maps.LatLng(show.venue.geometry.location.lat
						, show.venue.geometry.location.lng);
					addMarker(map, gLatLng, show.venue.name
						, show.artists[0].name + " at " + show.venue.name
						, show.venue.googleId);
				}
			});
		},
 
		error: function( xhr, status ) {
		  	div.innerHTML = "Bounds update failed.";
		},
 
		complete: function( xhr, status ) {
		  	div.innerHTML = "Bounds: " + bounds.toString() + " request completed.";
		}
	});
}


// location error
function locationError(error) {
 	var errType = { 0: "Unknown error"
 		, 1: "Permission denied"
 		, 2: "Position not available"
 		, 3: "Timed out"
 	};
 	var errorMsg = errType[error.code];
 	if ( error.code == 0 || error.code == 2 ) {
 		errorMsg = errorMsg + " " + error.msg;
 	}
  	var div = document.getElementById("mapinfo");
  	div.innerHTML = errorMsg;
}


// math helpers
var MILES_PER_KM = 0.621371;
var EARTH_RADIUS_KM = 6371;
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
	var dLat = deg2rad(lat2-lat1);  // deg2rad below
	var dLon = deg2rad(lon2-lon1); 
	var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
			Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
			Math.sin(dLon/2) * Math.sin(dLon/2); 
	var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
	var d = EARTH_RADIUS_KM * c; // Distance in km
	return d;
}

function getDistanceFromLatLonInMiles(lat1, lon1, lat2, lon2) {
	return getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) * MILES_PER_KM;
}

function deg2rad(deg) {
	return deg * (Math.PI/180)
}