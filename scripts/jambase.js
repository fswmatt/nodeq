/**
 *	jambase
 *
 *	manages all jambase functions, including
 *		getting the data from their api
 *		populating/updating the venues in our db
 *
 */

var request = require('request')
	, xml2js = require('xml2js')
	, util = require('util')
	, mongo = require('mongodb')
	, events = require('events')
	, util = require('util')
	, _ = require('underscore')
	, dbHelper = require('../scripts/dbHelper')
	, keys = require('../scripts/keys')
	, returnJsonHelper = require('../scripts/returnJsonHelper')
	, flowController = require('../scripts/flowController')
	;


// loads up the jambase data
exports.loadJambase = function(model) {
	var req = model.req;
	var res = model.res;
	var reqUri = "http://api.jambase.com/search"
		+ "?zip=" + model.params.zip
		+ "&radius=" + model.params.miles
		+ "&startDate=" + model.params.startDate
		+ "&endDate=" + model.params.endDate
		+ "&apiKey=" + keys.jambaseKey;
	console.log("Getting jambase show list from " + reqUri);
	request({uri: reqUri}, function(err, response, body) {
		// lame error check
		if (err && response.statusCode !== 200) {
			returnJsonHelper.returnFailure(res, "Failed to get JamBase info");
		} else {
			// parse the xml into json
			xml2js.parseString(body, function (perr, result) {
				if ( null != result && null != result.JamBase_Data
						&& null != result.JamBase_Data.event ) {
					// got it!  process it, add it to the model, move on

					// do we need this if we've got the pre-managed jambaseShows?
					model["jambaseResult"] = result.JamBase_Data.event;

					var shows = new Array();
					model["jambaseShows"] = shows;
					result.JamBase_Data.event.forEach(function(theEvent) {
						var show = { jambaseEvent: theEvent
							, jambaseVenue: theEvent.venue[0]
							, jambaseArtists: theEvent.artists[0].artist
						}
						shows.push(show);
					});
				}
				model._fc.done();
			});
		}
	});
}


// processes the jambase venues
// built into this whole schmere is that the jambase venues are always the first one
//	processed.  the rest go after.
exports.processJambaseVenues = function(model) {
  	var shows = model["jambaseShows"];
  	var venueList = new Array();
	shows.forEach(function(show) {
		venueList.push(parseInt(show.jambaseVenue.venue_id.toString()));
	});

	console.log("venues returned by jambase: " + venueList);
	dbHelper.openedVenueDb.collection(dbHelper.VENUE_DB_NAME, function(err, collection) {
		var arrStr = venueList + "";
		var q = {'jambaseId': { $in: venueList } };
		collection.find(q, function(err, cursor) {
			if ( null != err || null == cursor ) {
				// oops.  bad query!  even if we fail we'll get back an empty result
				//	so this is a pretty bad error
				console.log("error: " + err);
				model._fc.done();
			} else {
				// got a bunch back - walk through 'em
				cursor.toArray(function(err, items) {
					// add the venue - err, item - to each show
					shows.forEach(function(show) {
						items.some(function(item) {
							if ( item.jambaseId == show.jambaseVenue.venue_id) {
								show["venue"] = item;
								return true;
							}
						});
					});

					items.forEach(function(item) {
						venueList = _.without(venueList, item.jambaseId);
					});
					// any left?
					if ( venueList.length >= 1 ) {
						console.log("new venues: " + venueList);
						var venuesToAdd = new Array();
						shows.forEach(function(show) {
							if ( -1 != venueList.indexOf(parseInt(show.jambaseVenue.venue_id[0]))) {
								venuesToAdd.push(show);
							}
						});
						if ( venuesToAdd.length > 0 ) {
							// addVenues will call done for us
							addVenues(venuesToAdd, model);
						} else {
							model._fc.done();
						}
					} else {
						// got 'em all.  done!
						model._fc.done();
					}
				});
			}
		});
	});
}


// add the venues to the db.
// but first gotta get their google info
function addVenues(venueList, model) {
	// all of these venues are new to us.
	var innerModel = { req: model.req
		, res: model.res
		, venueList: venueList
		, origModel: model
		, newVenues: new Array()
	};
	var callbacks = [ [{callback: fillPlacesInfo, paramsArray: venueList}]
		, [addPlacesToDb]
		, [finished]
	];
	var fc = new flowController.FlowController({ model: innerModel
		, callbacks: callbacks
		, startNow: true
	});
}

fillPlacesInfo = function(model, show) {
	var venueName = "";
	show.jambaseVenue.venue_name.toString().split(" ").forEach(function(item) {
		venueName += item + "+";
	});

	var reqUri = "https://maps.googleapis.com/maps/api/place/textsearch/json"
		+ "?query=" + venueName + show.jambaseVenue.venue_zip[0]
		+ "&sensor=false"
		+ "&key=" + keys.googleKey;
	console.log("Getting uri " + reqUri);
	request({uri: reqUri}, function(err, response, body) {
		if (err && response.statusCode !== 200) {
			returnJsonHelper.returnFailure(res, "Google Places request failed.");
			model._fc.done();
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
					, jambaseId: parseInt(show.jambaseVenue.venue_id[0])
					, zip: show.jambaseVenue.venue_zip[0]
				};

				// save it
				show["venue"] = newVenue;
				model.newVenues.push(newVenue);
			}
			model._fc.done();
		}
	});
}


addPlacesToDb = function(model) {
	var newVenues = model.newVenues;

	if ( newVenues.length <= 0 ) {
		// no venues to write.  outta here!
		model._fc.done();
	} else {
		console.log("Writing venue info for " + newVenues.length + " venues.");
		dbHelper.openedVenueDb.collection(dbHelper.VENUE_DB_NAME, function(err, collection) {
			collection.insert(newVenues, {safe: true}, function(err, result) {
				if ( null == err ) {
					if ( result != null && result[0] != null ) {
						console.log("Wrote " + result.length + " venues");
					} else {
						console.log("Wrote something...");
					}
				} else {
					console.log("Error: " + err + " writing venues " );
				}
				model._fc.done();
			});
		});
	}
}


finished = function(model) {
	model._fc.done();
	model.origModel._fc.done();
}
