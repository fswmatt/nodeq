/*
 * GET api req
 */

var express = require('express')
	, request = require('request')
	, xml2js = require('xml2js')
	, util = require('util')
	, mongo = require('mongodb')
	, events = require('events')
	, util = util = require('util')
	, keys = require('./keys')
	, app = express();


// event management section
//  we send one event (showCompletion) when we're done getting all the show info

// Sends events
EventSender = function() {
	events.EventEmitter.call(this);
	this.sendShowCompletion = function(model) {
		this.emit('showCompletion', model);
	}
};
util.inherits(EventSender, events.EventEmitter);


// we're done!  write it out.
//  well, we're going to create our mini-object and just send the json
CompletionHandler = function() {
	this.showHandler = function(model) {
		// done!  write it out
		var res = model["res"];
		var shows = new Array();
		
		model["shows"].forEach(function(show) {
			// TODO: make sure the show is inside the display rectangle before adding
			
			var shortShow = new Object();
			shows.push(shortShow);
			
			var venue = show["venue"];
			if ( null != venue ) {
				var shortVenue = { name: venue["name"]
					, googleId: venue["googleid"]
					, geometry: venue["geometry"]
					, address: venue["address"]
					, zip: venue["zip"]
				};
				shortShow["venue"] = shortVenue;
			
				var artistList = new Array();
				shortShow["artists"] = artistList;
				show["jambaseArtists"].forEach(function(artist) {
					var shortArtist = { name: artist["artist_name"].toString() };
					artistList.push(shortArtist);
				});
			}
		});
		returnSuccess(res, shows, "shows");
 	}
};

var eventSender = new EventSender();
var completionHandler = new CompletionHandler(eventSender);
eventSender.on('showCompletion', completionHandler.showHandler);


// showListFromZipDist
//	returns list of shows based on (zipCode, radius)
exports.showListFromZipDist = function(req, res) {
	// get the parameters
	var today = new Date();
	var startDate = (today.getMonth()+1) + "/" + today.getDate() + "/" + today.getFullYear();
	var params = { type: "zipDist"
		, zip: req.params.zip
		, miles: req.params.miles
		, startDate: startDate
		, endDate: startDate };
	
	showsFromParams(req, res, params);
}


// showListFromLatLng
//	returns list of shows based on bounding lat and lng
exports.showListFromLatLng = function(req, res) {
	// get the parameters
	var params = new Object();
	params["type"] = "latLng";
	
	var top = params["top"] = req.params.top;
	var bottom = params["bottom"] = req.params.bottom;
	var left = params["left"] = req.params.left;
	var right = params["right"] = req.params.right;
	
	// and how big a radius?  get the dist, add a little pad, and round it
	params["miles"] = Math.round(distFromLatLngInMi(top, left, bottom, right) * 1.25) + 1;
		
	var today = new Date();
	params["endDate"] = params["startDate"] = (today.getMonth()+1) + "/" + today.getDate() + "/" + today.getFullYear();

	// figure out the zip from the lat and lng
	//  use google reverse geocoding
	//  http://maps.googleapis.com/maps/api/geocode/json?latlng=40.714224,-73.961452&sensor=false
	var midLat = (parseFloat(top) + parseFloat(bottom))/2;
	var midLng = (parseFloat(left) + parseFloat(right))/2;
	var reqUri = "http://maps.googleapis.com/maps/api/geocode/json"
		+ "?latlng=" + midLat + "," + midLng
		+ "&sensor=false";
	console.log("Getting zip code from " + reqUri);
	request({uri: reqUri}, function(err, response, body) {
		params["zip"] = "10005";  // default. and why not ny?  i heart ny.
		if ( null == err ) {
			// no error, got it
			params["zip"] = zipFromPlacesResp(body);
		}
		showsFromParams(req, res, params);
	});
}


// returns our venue info for the google id (NOT the jambase id!!!)
exports.getVenueInfo = function(req, res) {
	var venueId = req.params.venueId;
    venueDb.collection(VENUE_DBNAME, function(err, collection) {
        collection.findOne({'googleid': venueId}, function(err, item) {
        	if ( null != item ) {
				var venue = { name: item["name"]
					, googleId: item["googleid"]
					, geometry: item["geometry"]
					, address: item["address"]
					, zip: item["zip"]
				};
				returnSuccess(res, venue, "venue");
        	} else {
				returnFailure(res, "Venue " + venueId + " not found.");
        	}
        });
    });
}

// nyi
exports.getShowInfo = function(req, res) {
	returnFailure(res, "Not yet implemented.  Sorry.");
}


// privates

// showsFromParams
//
// the main workerbot.  all of the parameters are smooshed into the params object
function showsFromParams(req, res, params) {	
	var reqUri = "http://api.jambase.com/search"
		+ "?zip=" + params.zip
		+ "&radius=" + params.miles
		+ "&startDate=" + params.startDate
		+ "&endDate=" + params.endDate
		+ "&apiKey=" + keys.jambaseKey;
	console.log("Getting show list from " + reqUri);
	request({uri: reqUri}, function(err, response, body) {
		// our model
		var model = new Object();
		model["numLeft"] = 0;
		model["req"] = req;
		model["res"] = res;
		var shows = new Array();
		model["shows"] = shows;

		// set up self, hang our model off of self
		var self = this;
		self.model = model;

		// lame error check
		if (err && response.statusCode !== 200) {
			returnFailure(res, "Failed to get JamBase info");
		} else {
			// parse the xml into json
			xml2js.parseString(body, function (perr, result) {
				if ( null != result && null != result.JamBase_Data
						&& null != result.JamBase_Data.event ) {
					model["numLeft"] = result.JamBase_Data.event.length;
					result.JamBase_Data.event.forEach(function(theEvent) {
						var show = new Object();
						show["jambaseEvent"] = theEvent;
						show["jambaseVenue"] = theEvent.venue[0];
						show["jambaseArtists"] = theEvent.artists[0].artist;
						shows.push(show);
						getOurVenueInfo(model, show);
					});
				}
			});
		}
	});
}


// zip from google places response
function zipFromPlacesResp(body) {
	var zip = "";
	// no error, got it
	var gPlace = JSON.parse(body);
	gPlace["results"][0]["address_components"].forEach(function(component) {
		component["types"].forEach(function(type) {
			if ("postal_code" == type) {
				zip = component["long_name"];
			}
		});
	});
	return zip;
}


/** 
 *  manage this venue.  either get it from our db or look it up with google and add it
 *  the google api call looks like this:
 *  // https://maps.googleapis.com/maps/api/place/textsearch/json?query=Mcmenamins+White
 *     +Eagle+Saloon+Portland+or&sensor=false&key=[yourKey]
 */
function getOurVenueInfo(model, show) {
	var self = this;
	var venue = show["jambaseVenue"];
	var jambaseId = venue.venue_id.toString();
    console.log('Looking for venue ' + jambaseId);
    venueDb.collection(VENUE_DBNAME, function(err, collection) {
        collection.findOne({'jambaseId': jambaseId}, function(err, item) {
        	if ( null == item ) {
        		// nope.  look it up, add it, then return it
				var venueName = "";
				venue.venue_name.toString().split(" ").forEach(function(item) {
					venueName += item + "+";
				});
				var reqUri = "https://maps.googleapis.com/maps/api/place/textsearch/json"
					+ "?query=" + venueName + venue.venue_zip
					+ "&sensor=false"
					+ "&key=" + keys.googleKey;
				console.log("Getting uri " + reqUri);
				request({uri: reqUri}, function(err, response, body) {
					if (err && response.statusCode !== 200) {
						returnFailure(res, "Google Places request failed.");
					} else {
						// body's json.  make an object
						var gPlace = JSON.parse(body);
						
						// i'm relying on google being good and getting it on the first shot.
						var elem = gPlace.results[0];
						if ( null != elem ) {
							var newVenue = { name: elem.name
								, googleid: elem.id
								, geometry: elem.geometry
								, address: elem.formatted_address
								, jambaseId: jambaseId
								, zip: venue.venue_zip.toString()
							};
							
							// write it out
							addVenue(newVenue);
						
							// save it
							show["venue"] = newVenue;
						}
						if ( --model["numLeft"] == 0 ) {
							// all done!
							eventSender.sendShowCompletion(model);
						}
					}
				});
        	} else {
        		// got it!
				show["venue"] = item;
				if ( --model["numLeft"] == 0 ) {
					// all done!
					eventSender.sendShowCompletion(model);
				}
        	}
        });
    });
}


// json return helper.
// s-u-c-c-e-s-s that's the way we spell success
function returnSuccess(res, obj, title) {
	var resp = new Object();
	resp["responseCode"] = {status: "success", code: "200"};
	console.log("Returning success - title: " + title);
	resp[title] = obj;
	res.jsonp(200, resp);
}

// for failure.  like failure needs help...
function returnFailure(res, msg) {
	var resp = new Object();
	console.log("Returning failure - message: " + msg);
	resp["responseCode"] = {status: "failure", code: "404", errorMsg: msg};
	res.jsonp(404, resp);
}


// mongodb fun
var Server = mongo.Server
	, Db = mongo.Db
	, BSON = mongo.BSONPure;


// function globals
var VENUE_DBNAME = 'venuedb';
var DBPORT = 27017;
var DB_CONN_FLAGS = {auto_reconnect: true, safe: true, w: 1};
var DB_HOST = 'localhost';


// set up global venueDb
//  creates it and pre-populates it if it doesn't yet exist
venueDb = new Db(VENUE_DBNAME, new Server(DB_HOST, DBPORT, DB_CONN_FLAGS));
venueDb.open(function(err, db) {
    if(!err) {
        console.log("Connected to '" + VENUE_DBNAME + "' database");
        db.collection(VENUE_DBNAME, {strict:true}, function(err, collection) {
            if (err) {
                console.log(VENUE_DBNAME + " collection doesn't exist. Creating it with sample data.");
                populateDb();
            }
        });
    }
});


// adds venue to VENUE_DBNAME
function addVenue(venue) {
	if ( null != venue ) {
		console.log('Writing venue info for ' + venue.name);
		venueDb.collection(VENUE_DBNAME, function(err, collection) {
			collection.insert(venue, {safe: true}, function(err, result) {
				if ( null == err ) {
					if ( result != null && result[0] != null ) {
						console.log("Wrote " + result[0]["name"]);
					} else {
						console.log("Wrote something...");
					}
				} else {
					console.log("Error: " + err + " writing venue " + venue.name);
				}
			});
		});
	}
}


// pre-populates the db with one record, just to prime the pump
function populateDb() {
    var venues = [{ name: "sample"
		, jambaseId: "0"
		, googleid: "sampleId"
		, geometry: { location: {lat: 0, lng: 0}}
		, address: "sample address"
		, zip: "00001"
    }];

	venueDb.collection(VENUE_DBNAME, function(err, collection) {
		collection.insert(venues, {safe: true}, function(err, result) {});
	});
}


// math helpers
var MILES_PER_KM = 0.621371;
var EARTH_RADIUS_KM = 6371;
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

function distFromLatLngInMi(lat1, lon1, lat2, lon2) {
	return distFromLatLngInKm(lat1, lon1, lat2, lon2) * MILES_PER_KM;
}

function deg2rad(deg) {
	return deg * (Math.PI/180)
}
