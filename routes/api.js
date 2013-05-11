/*
 * GET api req
 */

var express = require('express')
	, request = require('request')
	, util = require('util')
	, _ = require('underscore')
	, jambase = require('../scripts/jambase')
	, pollstar = require('../scripts/pollstar')
	, songkick = require('../scripts/songkick')
	, mathHelper = require('../scripts/mathHelper')
	, returnJsonHelper = require('../scripts/returnJsonHelper')
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
		, zip: parseInt(req.params.zip)
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
	var midLat = (parseFloat(top) + parseFloat(bottom))/2;
	var midLng = (parseFloat(left) + parseFloat(right))/2;
	var params = { req: req
		, res: res
		, type: "latLng"
		, startDate: startDate
		, endDate: startDate
		, zip: null
		, miles: Math.round(mathHelper.distFromLatLngInMi(top, left, bottom, right) * 1.25) + 1
		, midLat: midLat
		, midLng: midLng
	}

	showsFromParams(params);
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
	if ( null != model.data ) {
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
		, shortShows: new Array()
	};
	var callbacks = [ [zipHelper.fillInLatLngParamsFromZip]
		, [jambase.loadJambase, pollstar.loadPollstar, songkick.load]
		, [jambase.processJambaseVenues]
		, [pollstar.processPollstarVenues]
		, [songkick.processVenues]
		, [songkick.generateShortShows, pollstar.generateShortShows, jambase.generateShortShows]
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
	var allShows = _.flatten(model.shortShows);
	var uniqueShows = _.uniq(allShows, false, function(show) {
		if ( show && show.venue ) {
			return show.venue.googleid;
		} else {
			return null;
		}
	});

	var data = { dataBounds: boundsFromModel(model)
		, dateRange: {start: model.params.startDate, end: model.params.endDate}
		, locale: model.params.city
		, shows: uniqueShows
		};
	model["data"] = data;
	if ( model.params.city != null ) {
		cacheHelper.write(model.params.city, model.params.startDate
				, model.params.endDate, data);
	}

	model._fc.done();
}


function writeOutput(model) {
	if ( null != model.data ) {
		returnJsonHelper.returnSuccess(model.res, model.data, "results");
	} else {
		returnJsonHelper.returnFailure(model.res, "Error.  Terribly sorry.");
	}
	model._fc.done();
}


// miles per degree lat/long
var MILES_PER_DEGREE = 69;

// get the bounding lat lng for this data set
function boundsFromModel(model) {
	var dist = model.params.miles / MILES_PER_DEGREE;
	var bounds = {ia: {b: model.params.midLng - dist,
			d: model.params.midLng + dist}
		, fa: {b: model.params.midLat - dist,
			d: model.params.midLat + dist}
		};

	return bounds;
}
