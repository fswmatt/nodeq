/*
 * GET api req
 */

var express = require('express')
	, request = require('request')
	, util = require('util')
	, jambase = require('../scripts/jambase')
	, pollstar = require('../scripts/pollstar')
	, mathHelper = require('../scripts/mathHelper')
	, returnJsonHelper = require('../scripts/returnJsonHelper')
	, placesHelper = require('../scripts/placesHelper')
	, zipHelper = require('../scripts/zipHelper')
	, cacheHelper = require('../scripts/cacheHelper')
	, flowController = require('../scripts/flowController')
	, app = express();


// showListFromZipDist
//	returns list of shows based on (zipCode, radius)
exports.showListFromZipDist = function(req, res) {
	// get the parameters
	var today = new Date();
	var startDate = (today.getMonth()+1) + "/" + today.getDate() + "/" + today.getFullYear();
	var params = { req: req
		, res: res
		, type: "zipDist"
		, startDate: startDate
		, endDate: startDate
		, zip: req.params.zip
		, miles: req.params.miles
		};

	var city = req.query.city;
	if ( null != city ) {
		// it's our city.  see if it's in the cache db
		params["city"] = city;
		showsFromCache(params);
	} else {
		showsFromParams(params);
	}
}


// showListFromLatLng
//	returns list of shows based on bounding lat and lng
exports.showListFromLatLng = function(req, res) {
	// get the parameters
	var today = new Date();
	var top = req.params.top;
	var bottom = req.params.bottom;
	var left = req.params.left;
	var right = req.params.right;
	var startDate = (today.getMonth()+1) + "/" + today.getDate() + "/" + today.getFullYear();

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
		var zip = "10005";  // default. and why not ny?  i <3 ny.
		if ( null == err ) {
			// no error, got it
			zip = placesHelper.zipFromPlacesResp(body);
		}
		var params = { req: req
			, res: res
			, type: "latLng"
			, startDate: startDate
			, endDate: startDate
			, zip: zip
			, miles: Math.round(mathHelper.distFromLatLngInMi(top, left, bottom, right) * 1.25) + 1
			, midLat: midLat
			, midLng: midLng
		}

		showsFromParams(params);
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


function showsFromCache(params) {
	var model = { req: params.req
		, res: params.res
		, params: params
	};
	var callbacks = [ [cacheHelper.getShows]
		, [testOutput]
	];
	new flowController.FlowController({ model: model
		, callbacks: callbacks
		, startNow: true
	});
}


function testOutput(model) {
	if ( null != model.allShows ) {
		// cache hit
		writeOutput(model);
	} else {
		// cache miss
		showsFromParams(model.params);
		model._fc.done();
	}
}


// load up the flow controller and let 'er rip!
function showsFromParams(params) {
	var model = { req: params.req
		, res: params.res
		, params: params
	};
	var callbacks = [ [zipHelper.fillInLatLngParamsFromZip]
		, [jambase.loadJambase, pollstar.loadPollstar]
		, [jambase.processJambaseVenues]
		, [pollstar.processPollstarVenues]
		, [mergeAllShows]
		, [writeOutput]
	];
	new flowController.FlowController({ model: model
		, callbacks: callbacks
		, startNow: true
	});
}


function mergeAllShows(model) {
	// got all of the shows in multiple places.  now merge them all together
	//	use the google places id as the key

	// work backwards from the order we processed
	var psShows = new Array();
	if ( null != model.pollstarShows ) {
		model.pollstarShows.forEach(function(show) {
			// TODO: make sure the show is inside the display rectangle before adding
			var venue = show.venue;
			if ( null != venue ) {
				if ( null != venue._id ) {
					delete venue._id; // don't show internal ids
				}
				var artistList = new Array();
				show.pollstarArtists.forEach(function(artist) {
					var shortArtist = { name: artist.ArtistName };
					artistList.push(shortArtist);
				});
				var shortShow = { venue: venue
					, artists: artistList
					, date: show.pollstarEvent.PlayDate
				};
				psShows.push(shortShow);
			}
		});
	}

	if ( null != model.jambaseShows ) {
		var jbShows = new Array();
		model.jambaseShows.forEach(function(show) {
			var venue = show.venue;
			if ( null != venue ) {
				// if the show's already in the previous shows list don't worry
				var newShow = true;
				psShows.some(function(show) {
					if ( show.venue.googleid == venue.googleid ) {
						newShow = false;
						return true;
					}
				});
				if ( newShow ) {
					if ( null != venue._id ) {
						delete venue._id; // don't show internal ids
					}
					var artistList = new Array();
					show.jambaseArtists.forEach(function(artist) {
						var shortArtist = { name: artist.artist_name.toString() };
						artistList.push(shortArtist);
					});
					var shortShow = { venue: venue
						, artists: artistList
						, date: show.jambaseEvent.event_date[0]
					};
					jbShows.push(shortShow);
				}
			}
		});

		// now we've got two show lists.  merge 'em and put 'em on the model
		var allShows = psShows.concat(jbShows);
		if ( model.params.city != null ) {
			// got a city, write it to the cache
			cacheHelper.write(model.params.city, model.params.startDate
					, model.params.endDate, allShows);
		}
		model["allShows"] = allShows;
	} else {
		model["allShows"] = psShows;
	}
	model._fc.done();
}


function writeOutput(model) {
	if ( null != model.allShows ) {
		returnJsonHelper.returnSuccess(model.res, model.allShows, "shows");
	} else {
		returnJsonHelper.returnFailure(model.res, "Error.  Terribly sorry.");
	}
	model._fc.done();
}
