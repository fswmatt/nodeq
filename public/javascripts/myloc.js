/**
 *
 *
 */

// global map
var map;
var markers = new Array();

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
var openInfoWindow = null;
function closeInfoWindow() {
	if ( null != openInfoWindow ) {
		openInfoWindow.close(map);
		openInfoWindow = null;
	}
}

// adds a flag to the map
function addMarker(map, latLng, title, content, id) {
	var marker = new google.maps.Marker( { map: map
		, position: latLng
		, title: title
		, clickable: true
		, animation: google.maps.Animation.DROP
	});
	var infoWindow = new google.maps.InfoWindow( { content: content
		, position: latLng
	});
	var listener = google.maps.event.addListener(marker, "click", function() {
		if ( null != openInfoWindow ) {
			openInfoWindow.close(map);
		}
		infoWindow.open(map);
		openInfoWindow = infoWindow;
	});
	var markerObj = { id: id
		, marker: marker
		, info: infoWindow
		, listener: listener
	};
	console.log("Adding marker for " + title);
	return markerObj;
}


// bounds changed.  update the bounds display
var lastBounds = null;
function updateBoundsDisplay(event) {
 	// what's the bounds?
	var bounds = map.getBounds();
  	var div = document.getElementById("mapinfo");

	// only update if the bounds expand
	if ( null != lastBounds ) {
		if ( (bounds.Z.b >= lastBounds.Z.b) && (bounds.fa.b >= lastBounds.fa.b) &&
				(lastBounds.Z.d >= bounds.Z.b) && (lastBounds.fa.d >= bounds.fa.d) ) {
			// zoomed in or moved inside the old last bounds.  don't need to refresh
		  	div.innerHTML = "No refresh.  Max bounds " + lastBounds.toString()
		  			+ ", current: " + bounds.toString();
			return;
		}
	}
	lastBounds = bounds;
  	div.innerHTML = "Updating bounds...";

  	// bounds are updated, get some tasty events
  	// calling our api, formatted like this:
  	//  http://localhost:8000/api/v0.1/getShowList/45.58/-122.6/45.50/-122.67
	$.ajax({
		// the URL for the request
		url: "/api/v0.2/getShowList/" + bounds.Z.b + "/" + bounds.fa.b + "/" + bounds.Z.d
				+ "/" + bounds.fa.d,
		type: "GET",
		dataType : "json",

		success: function( json ) {
			// loop through the markers and remove the ones we don't need
			var savedMarkers = new Array();
			var markerIds = new Array();
			markers.forEach(function(marker) {
				if ( (marker.marker.position.jb < lastBounds.Z.b) ||
						(marker.marker.position.kb < lastBounds.fa.b) ||
						(lastBounds.Z.d < marker.marker.position.jb) ||
						(lastBounds.fa.d < marker.marker.position.kb) ) {
					// marker's not in our lastBounds.  delete it.
					google.maps.event.removeListener(marker.listener);
					marker.marker.setMap(null);
				} else {
					// yup in our lastBounds so save it to our new list
					savedMarkers.push(marker);
					markerIds.push(marker.id);
				}
			});
			markers = savedMarkers;

			json.shows.forEach(function (show) {
				if ( null != show && null != show.venue && null != show.artists
						&& null != show.artists[0]
						&& markerIds.indexOf(show.venue.googleid) == -1
						&& (show.venue.location.lat >= lastBounds.Z.b)
						&& (show.venue.location.lng >= lastBounds.fa.b)
						&& (lastBounds.Z.d >= show.venue.location.lat)
						&& (lastBounds.fa.d >= show.venue.location.lng) ) {
					var gLatLng = new google.maps.LatLng(show.venue.location.lat
						, show.venue.location.lng);
					var markerObj = addMarker(map, gLatLng, show.venue.name
						, show.artists[0].name + " at " + show.venue.name
						, show.venue.googleid);
					markers.push(markerObj);
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
