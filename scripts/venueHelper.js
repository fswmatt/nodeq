/**
 *	venueHelper
 *
 *	all of our venue related helping hands
 */


var request = require('request')
	, _ = require('underscore')
	, dbHelper = require('../scripts/dbHelper')
	, flowController = require('../scripts/flowController')
	, keys = require('../config/keys')
	, globals = require('../config/globals')
	;


exports.addNewVenues = function(model) {
	var venues = model.newVenues;

	if ( venues.length <= 0 ) {
		// no venues to write.  outta here!
		model._fc.done();
	} else {
		console.log("Writing venue info for " + venues.length + " venues.");
		dbHelper.openedVenueDb.collection(dbHelper.VENUE_COLL_NAME, function(err, collection) {
			collection.insert(venues, {safe: true}, function(err, result) {
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


exports.updateExistingVenues = function(model) {
	var venues = model.venuesToUpdate;

	if ( null == venues || venues.length == 0 ) {
		// no venues to update.  outta here!
		model._fc.done();
	} else {
		var callbacks = [ [{callback: updateOne, paramsArray: venues, max: 4}]
			, [flowController.finished]
		];
		var fc = new flowController.FlowController({ callbacks: callbacks
			, model: {origModel: model}
			, startNow: true
		});
	}
}


function updateOne(model, venue) {
	console.log("Updating venue info for " + venue.name);
	dbHelper.openedVenueDb.collection(dbHelper.VENUE_COLL_NAME, function(err, collection) {
		collection.update({'googleid': venue.googleid}, venue, function(err, result) {
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


exports.processVenues = function(model, shows, idName, venueAdder, idFinderFn) {
  	var venueList = new Array();

	if ( null == shows || 0 == shows.length ) {
		model._fc.done();
		return;
	}

	shows.forEach(function(show) {
		venueList.push(parseInt(show.venueId));
	});

	console.log("venues returned by songkick: " + venueList);
	dbHelper.openedVenueDb.collection(dbHelper.VENUE_COLL_NAME, function(err, collection) {
		var arrStr = venueList + "";
		var q = new Object();
		q[idName] = { $in: venueList };
		console.log("venue query " + JSON.stringify(q));
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
							if ( item[idName] == idFinderFn(show) ) {
								show["venue"] = item;
								return true;
							}
						});
					});

					items.forEach(function(item) {
						venueList = _.without(venueList, item.songkickId);
					});
					// any left?
					if ( venueList.length >= 1 ) {
						console.log("new venues: " + venueList);
						var venuesToAdd = new Array();
						shows.forEach(function(show) {
							if ( -1 != venueList.indexOf(parseInt(idFinderFn(show)))) {
								venuesToAdd.push(show);
							}
						});
						if ( venuesToAdd.length > 0 ) {
							// addVenues will call done for us
							venueAdder(venuesToAdd, model);
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


// get the venues
//	some need an update, some are freshy fresh
exports.getVenues = function(model, propName, idFinderFn) {
	var newVenues = model.newVenues;

	if ( newVenues.length <= 0 ) {
		// no venues to write.  outta here!
		model._fc.done();
	} else {
		console.log("Got " + newVenues.length + " unknown venues, adding prop " + propName);
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
						//	but with no id info
						venues.forEach(function(venue) {
							var index = 0;
							newVenues.some(function(newVenue) {
								if ( venue.googleid == newVenue.googleid ) {
									// match!  fill in the extra info in the existing venue
									venue[propName] = idFinderFn(newVenue);
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


exports.fillPlacesInfo = function(model, show, venueSearchString, venueBuilder) {
	var reqUri = "https://maps.googleapis.com/maps/api/place/textsearch/json"
		+ "?query=" + venueSearchString
		+ "&sensor=false"
		+ "&key=" + keys.googleKey;
	console.log("Getting uri " + reqUri);
	request({uri: reqUri, timeout: globals.SECONDARY_TIMEOUT}, function(err, response, body) {
		if (err && ((null == response) || (response.statusCode !== 200))) {
			console.log("Google Places request failed.");
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
				};
				venueBuilder(model, show, newVenue);

				// save it
				show["venue"] = newVenue;
				model.newVenues.push(newVenue);
			}
			model._fc.done();
		}
	});
}



