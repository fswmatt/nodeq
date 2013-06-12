/**
 *	myloc.js
 *
 *	relies on jquery
 */

// global map
var map;
var markers = new Array();


// use local cache?
var useLocalCache = true;


window.onload = initMap;

function initMap() {
	if ( navigator.geolocation ) {
		$("#datepicker")
			.datepicker()
			.change(dateChanged)
			.val(new Date().toLocaleDateString())
			;
		initCitySelector();
		navigator.geolocation.getCurrentPosition(createMap, locationError);
	} else {
		alert ("No location support");
	}
}


function detectBrowser() {
	var useragent = navigator.userAgent;
	var mapdiv = document.getElementById("map-canvas");

	if (useragent.indexOf('iPhone') != -1 || useragent.indexOf('Android') != -1 ) {
		mapdiv.style.width = '100%';
		mapdiv.style.height = '100%';
	} else {
		mapdiv.style.width = '600px';
		mapdiv.style.height = '800px';
	}
}


// show the location
function createMap(position) {
	var gLatLng = new google.maps.LatLng(position.coords.latitude,
				position.coords.longitude);
	// make a map
	map = new google.maps.Map(document.getElementById("map-canvas"), {
		zoom: 14,
		center: gLatLng,
		mapTypeId: google.maps.MapTypeId.ROADMAP
	});

	// add "You Are Here" marker
	var title = "You Are Here";
	addMarker(map, gLatLng, title, "That's you!", "1", "here");

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

var newCity = null;
var cityList = new Object();
cityList["BOS"] = {name: "Boston", symbol: "BOS", zip:02111
		, radius: 18, zoom:13, lat: 42.36837, lng: -71.0805};
cityList["NY"] = {name: "New York", symbol: "NY", zip:10009
		, radius: 18, zoom:13, lat: 40.74544, lng: -73.976495};
cityList["DC"] = {name: "Washington DC", symbol: "DC", zip:20001
		, radius: 18, zoom:13, lat: 38.89164, lng: -77.05118};
cityList["MIA"] = {name: "Miami", symbol: "MIA", zip:33132
		, radius: 25, zoom:12, lat: 25.7762, lng: -80.1736};
cityList["NO"] = {name: "New Orleans", symbol: "NO", zip:70116
		, radius: 25, zoom:12, lat: 29.9654, lng: -90.063};
cityList["CHI"] = {name: "Chicago", symbol: "CHI", zip:60624
		, radius: 25, zoom:12, lat: 41.9072, lng: -87.66178};
cityList["LAS"] = {name: "Las Vegas", symbol: "LAS", zip:89107
		, radius: 25, zoom:12, lat: 36.13133, lng: -115.197};
cityList["SEA"] = {name: "Seattle", symbol: "SEA", zip:98122
		, radius: 25, zoom:12, lat: 47.6136, lng : -122.29257};
cityList["PDX"] = {name: "Portland", symbol: "PDX", zip: 97214
		, radius: 18, zoom:13, lat: 45.523, lng : -122.644};
cityList["SMF"] = {name: "Sacramento", symbol: "SMF", zip:95819
		, radius: 18, zoom:13, lat: 38.5698, lng: -121.465};
cityList["SF"] = {name: "San Francisco", symbol: "SF", zip:94102
		, radius: 18, zoom:13, lat: 37.7787, lng: -122.421};
cityList["LA"] = {name: "Los Angeles", symbol: "LA", zip:90036
		, radius: 50, zoom:11, lat: 34.09022, lng: -118.334};


function initCitySelector() {
	var theSelect = document.getElementById("citySelector");
	// TODO: add the options from cityList
	theSelect.onchange = cityChanged;

	// just for now...
	newCity = cityList["PDX"];
	$("#left-col").accordion();
}


// selected city changed
function cityChanged(selector) {
	if ( selector && selector.target.value ) {
		newCity = cityList[selector.target.value];
		if ( null != newCity ) {
			var gLatLng = new google.maps.LatLng(newCity.lat, newCity.lng);
			map.setCenter(gLatLng);
			map.setZoom(newCity.zoom);
		}
	}
	return true;
}


var lastDate = new Date().toLocaleDateString();
function dateChanged(dateBox) {
	if ( lastDate != this.value ) {
		// date changed.
		console.log("New date: " + this.value);
		lastDate = this.value;
		clearAllMarkers();
		updateBoundsDisplay(true);
	}
}


var cache = new Array();

// adds a flag to the map
function addMarker(map, latLng, title, content, id, type) {
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


// bounds changed.	update the bounds display
var dataBounds = null;
function updateBoundsDisplay(forceIt) {
	// what's the bounds?
	var mapBounds = map.getBounds();
	var ne = mapBounds.getNorthEast();
	var sw = mapBounds.getSouthWest();
	var bounds = {north: ne.lat()
			, east: ne.lng()
			, south: sw.lat()
			, west: sw.lng()};
	var div = document.getElementById("mapinfo");

	// only update if the bounds expand
	if ( !forceIt && dataBounds ) {
		if ( isRectInsideRect(dataBounds, bounds) ) {
			// zoomed in or moved inside the old last bounds.  don't need to refresh
			div.innerHTML = "No update needed.";
			console.log("No refresh needed.  Max bounds " + JSON.stringify(dataBounds)
					+ ", current: " + JSON.stringify(bounds));
			return;
		}
	}
//	div.innerHTML = "Updating map...";
	$("#left-col").accordion("destroy").empty();
	$("#mapinfo").text("Updating map...");

	// caching?
	var foundIt = false;
	if ( useLocalCache ) {
		// is this in our local cache?
		var pickerDate = new Date($("#datepicker").val());
		foundIt = cache.some(function(elem) {
			var dateDelta = new Date(elem.results.dateRange.start) - pickerDate;
			if ( isRectInsideRect(elem.results.dataBounds, bounds)
					&& ( 0 == dateDelta )
					) {
				// it's in the cache.  just return it
				updateDisplay(elem);
				div.innerHTML = "Map in cache.";
				console.log("Bounds " + JSON.stringify(bounds) + " in local cache.");
				return true;
			}
		});
	}
	if ( foundIt ) {
		return;
	}


	// bounds are updated, get some tasty events
	// calling our api, formatted like this:
	//	http://localhost:8000/api/v0.1/getShowList/45.58/-122.6/45.50/-122.67

	var url;
	if ( null != newCity ) {
		url = "/api/v0.2/getShowList/" + newCity.zip + "/" + newCity.radius
				+ "?city=" + newCity.symbol;
		newCity = null;
	} else {
		url = "/api/v0.2/getShowList/" + bounds.north + "/" + bounds.west + "/" + bounds.south
				+ "/" + bounds.east + "?";
	}
	var d = $("#datepicker").val();
	if ( d ) {
		url += "&startDate=" + d;
	}
	console.log("Geting " + url);
	$.ajax({
		// the URL for the request
		url: url,
		type: "GET",
		dataType : "json",
		success: function(json) {
			cacheAndUpdate(json);
		},

		error: function( xhr, status ) {
			div.innerHTML = "Map update failed.";
		},

		complete: function( xhr, status ) {
			console.log("Bounds: " + JSON.stringify(bounds) + " request completed.");
//			div.innerHTML = "Map updated.";
			$("#mapinfo").text("Map updated.");
		}
	});
}


function isRectInsideRect(outer, inner) {
	return ( outer.north >= inner.north
		&& outer.south <= inner.south
		&& outer.west >= inner.west
		&& outer.east <= inner.east );
}


function isPointInRect(rect, lat, lng) {
	return ( rect.north >= lat
		&& rect.south <= lat
		&& rect.west >= lng
		&& rect.east <= lng );
}


function cacheAndUpdate(data) {
	if ( useLocalCache ) {
		var width = Math.abs(data.results.dataBounds.east - data.results.dataBounds.west)
				* MILES_PER_DEGREE;
		var height = Math.abs(data.results.dataBounds.north - data.results.dataBounds.south)
				* MILES_PER_DEGREE;
		var size = Math.max(width, height);
		// if the size is too big it's not useful.  make sure the radius is small enough
		if ( size < 50 ) {
			// add it to the front of the cache so bigger supplants smaller
			cache.splice(0, 0, data);
		} else {
			console.log("Not caching - size is " + size + ", too wide to cache.");
		}
		// and reset the bounds
	}
	dataBounds = data.results.dataBounds;
	updateDisplay(data);
}


function clearAllMarkers() {
	closeInfoWindow();
	markers.forEach(function(marker) {
		google.maps.event.removeListener(marker.listener);
		marker.marker.setMap(null);
	});
	markers = new Array();
}


function updateDisplay(data) {
	// loop through the markers and remove the ones we don't need
	var savedMarkers = new Array();
	var markerIds = new Array();
	markers.forEach(function(marker) {
		if ( isPointInRect(dataBounds, marker.marker.position.lat(),
				marker.marker.position.lng()) ) {
			// yup in our dataBounds so save it to our new list
			savedMarkers.push(marker);
			markerIds.push(marker.id);
		} else {
			// marker's not in our dataBounds.	delete it.
			google.maps.event.removeListener(marker.listener);
			marker.marker.setMap(null);
		}
	});
	markers = savedMarkers;

	var listStr = "";
	data.results.shows.forEach(function(show) {
		if ( null != show && null != show.venue && null != show.artists
				&& null != show.artists[0]
				&& markerIds.indexOf(show.venue.googleid) == -1 ) {
			var gLatLng = new google.maps.LatLng(show.venue.location.lat
				, show.venue.location.lng);
			var artists = "";
			show.artists.forEach(function(artist, index, array) {
				artists += artist.name;
				if ( index+1 < array.length ) {
					artists += ", ";
				}
			});
			var markerObj = addMarker(map, gLatLng, show.venue.name
				, artists + " at " + show.venue.name
				, show.venue.googleid
				, "concert");
			markers.push(markerObj);
		}
		// add info for ALL the shows to the side list
		listStr += "<h3>" + show.venue.name + "</h3><p>";
		show.artists.forEach(function(artist) {
			listStr += artist.name + "</br>";
		});
		if ( show.venue.phone ) {
			listStr += show.venue.phone + "</br>";
		}
		if ( show.venue.website ) {
			listStr += "<a href='http://" + show.venue.website + "'>" + show.venue.website + "</a></br>";
		}
		listStr += "</p>"
	});

	$("#left-col").append(listStr).accordion({ heightStyle: "content" });
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
	div.innerHTML = "Error getting current location.  Error: " + errorMsg;
	log.console("Location error: " + errorMsg);
}


// math helpers
var MILES_PER_KM = 0.621371;
var EARTH_RADIUS_KM = 6371;
var MILES_PER_DEGREE = 69;
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
	var dLat = deg2rad(lat2-lat1);	// deg2rad below
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
