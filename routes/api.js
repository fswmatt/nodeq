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
	, keys = require('../scripts/keys')
	, mathHelper = require('../scripts/mathHelper')
	, returnJsonHelper = require('../scripts/returnJsonHelper')
	, app = express();


// event management section

// we do this in chunks:
//	1 - jambase (loads jb venues and shows into model)
//	2 - load model with pollstar data, loads pollstar venues
//	3 - load pollstar shows
//	4 - merge shows and respond
//
// each chunk has to finish in order so we don't overwrite each other
//
// TODO: I really want to figure out a way to better wire these together...
//
// TODO: break this file into more manageable chunks, prob around those ops

var JAMBASE_COMPLETION = 'jambaseCompletion';
var POLLSTAR_VENUE_COMPLETION = 'pollstarVenueCompletion';
var POLLSTAR_SHOW_COMPLETION = 'pollstarShowCompletion';

// Sends events
EventSender = function() {
	events.EventEmitter.call(this);
	this.sendJambaseCompletion = function(model) {
		this.emit(JAMBASE_COMPLETION, model);
	}

	this.sendPollstarVenueCompletion = function(model) {
		this.emit(POLLSTAR_VENUE_COMPLETION, model);
	}

	this.sendPollstarShowCompletion = function(model) {
		this.emit(POLLSTAR_SHOW_COMPLETION, model);
	}
};
util.inherits(EventSender, events.EventEmitter);


// calls for after a completion event
CompletionHandler = function() {
 	this.jambaseCompletionHandler = function(model) {
 		fillModelFromPollstar(model);
 	}

 	this.pollstarVenueCompletionHandler = function(model) {
 		fillShowsFromPollstar(model);
 	}

 	this.pollstarShowCompletionHandler = function(model) {
 		mergeShows(model);
		outputModel(model);
 	}
};

var eventSender = new EventSender();
var completionHandler = new CompletionHandler(eventSender);
eventSender.on(JAMBASE_COMPLETION, completionHandler.jambaseCompletionHandler);
eventSender.on(POLLSTAR_VENUE_COMPLETION, completionHandler.pollstarVenueCompletionHandler);
eventSender.on(POLLSTAR_SHOW_COMPLETION, completionHandler.pollstarShowCompletionHandler);


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
	params["miles"] = Math.round(
			mathHelper.distFromLatLngInMi(top, left, bottom, right) * 1.25) + 1;

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
        		delete item._id; // don't want to show our internal ids
				returnJsonHelper.returnSuccess(res, venue, "venue");
        	} else {
				returnJsonHelper.returnFailure(res, "Venue " + venueId + " not found.");
        	}
        });
    });
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
	console.log("Getting jambase show list from " + reqUri);
	request({uri: reqUri}, function(err, response, body) {
		// our model
		var shows = new Array();
		var model = { numLeft: 0
			, req: req
			, res: res
			, shows: shows
		};

		// set up self, hang our model off of self
		var self = this;
		self.model = model;

		// lame error check
		if (err && response.statusCode !== 200) {
			returnJsonHelper.returnFailure(res, "Failed to get JamBase info");
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


// all filled from jambase, now fill it from pollstar
function fillModelFromPollstar(model) {
	var req = model["req"];
	var shows = model["shows"];

	var top = req.params.top;
	var bottom = req.params.bottom;
	var left = req.params.left;
	var right = req.params.right;

	var today = new Date();
	var startDate = (today.getMonth()+1) + "/" + today.getDate() + "/" + today.getFullYear();

	var miles = Math.min(
		Math.round(mathHelper.distFromLatLngInMi(top, left, bottom, right) * 1.25) + 1,
		50);
	var midLat = (parseFloat(top) + parseFloat(bottom))/2;
	var midLng = (parseFloat(left) + parseFloat(right))/2;

	// call pollstar
	// looks like this:
	//  http://data.pollstar.com/api/pollstar.asmx/RegionEvents?lat=45.511862&
	//    lng=-122.623018&radius=10&onlyVenuesWithEvents=1&startDate=4/16/2013&
	//    dayCount=1&apiKey=20922-7515820
	var reqUri = "http://data.pollstar.com/api/pollstar.asmx/RegionEvents"
		+ "?lat=" + midLat
		+ "&lng=" + midLng
		+ "&radius=" + miles
		+ "&startDate=" + startDate
		+ "&dayCount=1&onlyVenuesWithEvents=1"
		+ "&apiKey=" + keys.pollstarKey;
	console.log("Getting jambase show list from " + reqUri);
	request({uri: reqUri}, function(err, response, body) {
		// set up self, hang our model off of self
		var self = this;
		self.model = model;

		// lame error check
		if (err && response.statusCode !== 200) {
			// pollstar failed, keep going
			eventSender.sendFinalCompletion(model);
		} else {
			// parse the xml into json
			xml2js.parseString(body, function (perr, result) {
				if ( null != result && null != result.RegionEventInfo
						&& null != result.RegionEventInfo.Venues
						&& null != result.RegionEventInfo.Venues[0]
						&& null != result.RegionEventInfo.Events
						&& null != result.RegionEventInfo.Events[0] ) {
					// // got a result.  check 'er out
					var venues = result.RegionEventInfo.Venues[0].Venue;
					var events = result.RegionEventInfo.Events[0].Event;
					model["pollstarVenues"] = venues;
					model["pollstarEvents"] = events;

					// loop through the events making 'shows' (which is an event:venue map)
					events.forEach(function(event) {
						var show = new Object();
						show["pollstarEvent"] = event["$"];
						var artists = new Array();
						event.Artists[0].Artist.forEach( function (artist) {
							artists.push(artist["$"]);
						});
						show["pollstarArtists"] = artists;
						show["pollstarVenue"] = venueFromId(venues, event["$"].VenueID);
						getPollstarVenueInfo(model, show);
					}); //forEach
				} else {
					// empty body, move on
					eventSender.sendFinalCompletion(model);
				}
			}); //xml2js
		}
	});
}


// helper
function venueFromId(venues, id) {
	var retval;
	venues.forEach(function (venue) {
		if ( venue["$"].VenueID == id ) {
			retval = venue["$"];
		}
	});
	return retval;
}


// done!  write it out
function outputModel(model) {
	var res = model["res"];
	var shows = new Array();

	model["shows"].forEach(function(show) {
		// TODO: make sure the show is inside the display rectangle before adding

		var shortShow = new Object();
		shows.push(shortShow);

		var venue = show["venue"];
		if ( null != venue ) {
			delete venue._id; // don't show internal ids
			shortShow["venue"] = venue;

			var artistList = new Array();
			shortShow["artists"] = artistList;
			show["jambaseArtists"].forEach(function(artist) {
				var shortArtist = { name: artist["artist_name"].toString() };
				artistList.push(shortArtist);
			});
		}
	});
	returnJsonHelper.returnSuccess(res, shows, "shows");
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
						returnJsonHelper.returnFailure(res, "Google Places request failed.");
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
							eventSender.sendJambaseCompletion(model);
						}
					}
				});
        	} else {
        		// got it!
				show["venue"] = item;
				if ( --model["numLeft"] == 0 ) {
					// all done!
					eventSender.sendJambaseCompletion(model);
				}
        	}
        });
    });
}


// same as above but for pollstar
function getPollstarVenueInfo(model, show) {
// step 1: is there already a pollstar venue?  if so goto 4
	var self = this;
	var venue = show["pollstarVenue"];
	var venueId = venue.VenueID.toString();
	console.log('Looking for venue ' + venueId);
	venueDb.collection(VENUE_DBNAME, function(err, collection) {
		collection.findOne({'pollstarId': venueId}, function(err, item) {
        	if ( null == item ) {
        		// nope.  look it up, add it, then return it
				var venueName = "";
				venue.Name.toString().split(" ").forEach(function(item) {
					venueName += item + "+";
				});
// step 2: get the google venue
				var reqUri = "https://maps.googleapis.com/maps/api/place/textsearch/json"
					+ "?query=" + venueName + venue.Zip
					+ "&sensor=false"
					+ "&key=" + keys.googleKey;
				console.log("Getting uri " + reqUri);
				request({uri: reqUri}, function(err, response, body) {
					if (err && response.statusCode !== 200) {
						returnJsonHelper.returnFailure(res, "Google Places request failed.");
					} else {
						// body's json.  make an object
						var gPlace = JSON.parse(body);

						// i'm relying on google being good and getting it on the first shot.
						var elem = gPlace.results[0];
						if ( null != elem ) {
							// got something.  see if the google place is already there
							var ourVenue = { name: elem.name
								, googleid: elem.id
								, geometry: elem.geometry
								, address: elem.formatted_address
								, pollstarId: venueId
								, zip: venue.Zip.toString()
								, website: venue.Website.toString()
							};
							if ( null != venue.PhoneAreaCode && 0 < venue.PhoneAreaCode.length ) {
								ourVenue["phone"] = "(" + venue.PhoneAreaCode.toString() + ")"
										+ venue.PhoneNumber.toString();
							}

// step 3: add the venue or at least its data
							addPollstarVenue(ourVenue);

							// save it
							show["venue"] = newVenue;
						}
						if ( --model["numLeft"] == 0 ) {
							// all done!
							eventSender.sendJambaseCompletion(model);
						}
					}
				});
        	} else {
        		// got it!
				show["venue"] = item;
				if ( --model["numLeft"] == 0 ) {
					// all done!
					eventSender.sendJambaseCompletion(model);
				}
        	}
		});
	});




	// 4: is the show already in the model?  if it is add pollstar data

	// not here.  add the show

	// but for now just jet.
	eventSender.sendFinalCompletion(model);
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


