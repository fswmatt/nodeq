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
	, _ = require('underscore')
	, dbHelper = require('../scripts/dbHelper')
	, venueHelper = require('../scripts/venueHelper')
	, returnJsonHelper = require('../scripts/returnJsonHelper')
	, flowController = require('../scripts/flowController')
	, keys = require('../scripts/config/keys')
	, globals = require('./config/globals')
	;


// loads up the jambase data
exports.loadJambase = function(model) {
	if ( (null == model.params.zip) || ("" == model.params.zip) ) {
		// no zip - we must be in BFE.  jet.
		model._fc.done();
		return;
	}

	var req = model.req;
	var res = model.res;
	var reqUri = "http://api.jambase.com/search"
		+ "?zip=" + model.params.zip
		+ "&radius=" + model.params.miles
		+ "&startDate=" + model.params.startDate
		+ "&endDate=" + model.params.endDate
		+ "&apiKey=" + keys.jambaseKey;
	console.log("Getting jambase show list from " + reqUri);
	request({uri: reqUri, timeout: globals.PRIMARY_TIMEOUT}, function(err, response, body) {
		// lame error check
		if (err || null == response ||  response.statusCode !== 200) {
			console.log("Failed to get JamBase info");
			model._fc.done();
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
					var startDate = new Date(model.params.startDate);
					var endDate = new Date(model.params.endDate);
					result.JamBase_Data.event.forEach(function(theEvent) {
						var eventDate = new Date(theEvent.event_date[0]);
						var startDateDelta = startDate - eventDate;
						var endDateDelta = endDate - eventDate;
						if ( 0 >= startDateDelta && 0 <= endDateDelta) {
							var show = { jambaseEvent: theEvent
								, jambaseVenue: theEvent.venue[0]
								, jambaseArtists: theEvent.artists[0].artist
							}
							shows.push(show);
						}
					});
				}
				model._fc.done();
			});
		}
	});
}


exports.generateShortShows = function(model) {
	if ( null != model.jambaseShows ) {
		var shows = new Array();
		model.jambaseShows.forEach(function(show) {
			var venue = show.venue;
			if ( null != venue ) {
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
				shows.push(shortShow);
			}
		});
	}
	model.shortShows.push(shows);
	model._fc.done();
}


// processes the jambase venues
// built into this whole schmere is that the jambase venues are always the first one
//	processed.  the rest go after.
exports.processJambaseVenues = function(model) {
  	var shows = model["jambaseShows"];
  	var venueList = new Array();

	if ( null == shows || 0 == shows.length ) {
		model._fc.done();
		return;
	}

	shows.forEach(function(show) {
		venueList.push(parseInt(show.jambaseVenue.venue_id.toString()));
	});

	console.log("venues returned by jambase: " + venueList);
	dbHelper.openedVenueDb.collection(dbHelper.VENUE_COLL_NAME, function(err, collection) {
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
	var callbacks = [ [{callback: fillPlacesInfo, paramsArray: venueList, max:4}]
		, [getVenues]
		, [venueHelper.addNewVenues, venueHelper.updateExistingVenues]
		, [finished]
	];
	var fc = new flowController.FlowController({ model: innerModel
		, callbacks: callbacks
		, startNow: true
	});
}

function fillPlacesInfo(model, show) {
	var venueName = "";
	show.jambaseVenue.venue_name.toString().split(" ").forEach(function(item) {
		venueName += item + "+";
	});

	var reqUri = "https://maps.googleapis.com/maps/api/place/textsearch/json"
		+ "?query=" + venueName + show.jambaseVenue.venue_zip[0]
		+ "&sensor=false"
		+ "&key=" + keys.googleKey;
	console.log("Getting uri " + reqUri);
	request({uri: reqUri, timeout: globals.SECONDARY_TIMEOUT}, function(err, response, body) {
		if (null != err || null == response || response.statusCode !== 200 ) {
			console.log("Google Places request for " + venueName + " failed.");
			model._fc.done();
		} else {
			// body's json.  make an object
			var gPlace = JSON.parse(body);

			// i'm relying on google being good and getting it on the first shot.
			var elem = gPlace.results[0];
			if ( null != elem ) {
				var newVenue = { name: elem.name
					, googleid: elem.id
					, location: elem.geometry.location
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


// get the venues
//	some need an update, some are freshy fresh
function getVenues(model) {
	var newVenues = model.newVenues;

	if ( newVenues.length <= 0 ) {
		// no venues to write.  outta here!
		model._fc.done();
	} else {
		console.log("Got " + newVenues.length + " unknown venues from jambase.");
		dbHelper.openedVenueDb.collection(dbHelper.VENUE_COLL_NAME, function(err, collection) {
			// need to check for existing venues with the same google id.
			var gids = new Array();
			newVenues.forEach(function(venue) {
				gids.push(venue.googleid);
			});
			var q = {'googleid': { $in: gids } };
			console.log('query ' + JSON.stringify(q));
			collection.find(q, function(err, cursor) {
				if ( null != err || null == cursor ) {
					console.log("error: " + err);
					model._fc.done();
				} else {
					// got some back.
					//  create two lists:
					//		one to update
					//		one to create
					cursor.toArray(function(err, venues) {
						// venues are an array of venues already in the db
						//	but with no jambase info
						venues.forEach(function(venue) {
							var index = 0;
							newVenues.some(function(newVenue) {
								if ( venue.googleid == newVenue.googleid ) {
									// match!  fill in the extra info in the existing venue
									venue["jambaseId"] = newVenue.jambaseId;
									if ( newVenue.website != null ) {
										venue["website"] = newVenue.website ;
									}
									// and remove this one from newVenues
									newVenues.splice(index, 1);
									return true;
								}
								index++;
							});
						});
						// now we have two arrays:
						//	newVenues are totally new and already in the model
						//	venues are existing but need to be updated

						// add venues to be updated to the model
						model["venuesToUpdate"] = venues;
						model._fc.done();
					});
				}
			});
		});
	}
}


finished = function(model) {
	model._fc.done();
	model.origModel._fc.done();
}
