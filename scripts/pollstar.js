/**
 *	pollstar
 *
 *	more data.  joy!
 *	two big pieces:
 *		get data
 *		add venues and shows
 *
 *	get data happens in parallel with getting the other data providers
 *	add venues and shows happens after jambase has added theirs
 *
 */

var request = require('request')
	, xml2js = require('xml2js')
	, util = require('util')
	, mongo = require('mongodb')
	, events = require('events')
	, _ = require('underscore')
	, dbHelper = require('../scripts/dbHelper')
	, keys = require('../scripts/config/keys')
	, venueHelper = require('../scripts/venueHelper')
	, returnJsonHelper = require('../scripts/returnJsonHelper')
	, flowController = require('../scripts/flowController')
	, globals = require('./config/globals')
	;


// loads up the pollstar data
exports.loadPollstar = function(model) {
	// call pollstar
	// looks like this:
	//  http://data.pollstar.com/api/pollstar.asmx/RegionEvents?lat=45.511862&
	//    lng=-122.623018&radius=10&onlyVenuesWithEvents=1&startDate=4/16/2013&
	//    dayCount=1&apiKey=20922-7515820
	var reqUri = "http://data.pollstar.com/api/pollstar.asmx/RegionEvents"
		+ "?lat=" + model.params.midLat
		+ "&lng=" + model.params.midLng
		+ "&radius=" + model.params.miles
		+ "&startDate=" + model.params.startDate
		+ "&dayCount=1&onlyVenuesWithEvents=1"
		+ "&apiKey=" + keys.pollstarKey;
	console.log("Getting pollstar show list from " + reqUri);
	request({uri: reqUri, timeout: globals.PRIMARY_TIMEOUT}, function(err, response, body) {
		// set up self, hang our model off of self
		// lame error check
		if (err || null == response || response.statusCode !== 200) {
			// pollstar failed, keep going
			console.log("Pollstar request failed.");
			model._fc.done();
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
					var pollstarShows = new Array();
					model["pollstarShows"] = pollstarShows;
					if ( null != events ) {
						events.forEach(function(event) {
							var show = new Object();
							pollstarShows.push(show);
							show["pollstarEvent"] = event["$"];
							var artists = new Array();
							event.Artists[0].Artist.forEach( function (artist) {
								artists.push(artist["$"]);
							});
							show["pollstarArtists"] = artists;
							show["pollstarVenue"] = venueFromId(venues, event["$"].VenueID);
						}); //forEach
					}
				}
				model._fc.done();
			}); //xml2js
		}
	});
}


exports.processPollstarVenues = function(model) {
	var shows = model.pollstarShows;
	var psVenues = model.pollstarVenues;

	if ( null == psVenues ) {
		model._fc.done();
		return;
	}

	// from the shows get the venues
	var venueList = new Array();
	psVenues.forEach(function(psVenue) {
		venueList.push(parseInt(psVenue["$"].VenueID));
	});

	console.log("venues returned by pollstar: " + venueList);
	dbHelper.openedVenueDb.collection(dbHelper.VENUE_COLL_NAME, function(err, collection) {
		var arrStr = venueList + "";
		var q = {'pollstarId': { $in: venueList } };
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
							if ( item.pollstarId == show.pollstarVenue.VenueID) {
								show["venue"] = item;
								return true;
							}
						});
					});

					items.forEach(function(item) {
						venueList = _.without(venueList, item.pollstarId);
					});
					// any left?
					if ( venueList.length >= 1 ) {
						console.log("new venues: " + venueList);
						var venuesToAdd = new Array();
						shows.forEach(function(show) {
							if ( -1 != venueList.indexOf(parseInt(show.pollstarVenue.VenueID))) {
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


exports.generateShortShows = function (model) {
	var psShows = new Array();
	if ( null != model.pollstarShows ) {
		model.pollstarShows.forEach(function(show) {
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
	model.shortShows.push(psShows);
	model._fc.done();
}


// helper
function venueFromId(venues, id) {
	var retval;
	venues.some(function (venue) {
		if ( venue["$"].VenueID == id ) {
			retval = venue["$"];
			return true;
		}
	});
	return retval;
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
	show.pollstarVenue.Name.split(" ").forEach(function(item) {
		venueName += item + "+";
	});

	var reqUri = "https://maps.googleapis.com/maps/api/place/textsearch/json"
		+ "?query=" + venueName + show.pollstarVenue.Zip
		+ "&sensor=false"
		+ "&key=" + keys.googleKey;
	console.log("Getting uri " + reqUri);
	request({uri: reqUri, timeout: globals.SECONDARY_TIMEOUT}, function(err, response, body) {
		if ( null != err || null == response || response.statusCode !== 200) {
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
					, pollstarId: parseInt(show.pollstarVenue.VenueID)
					, zip: show.pollstarVenue.Zip
				};
				if ( show.pollstarVenue.Website != null &&
						show.pollstarVenue.Website.length > 0 ) {
					newVenue["website"] = show.pollstarVenue.Website;
				}
				if ( show.pollstarVenue.PhoneNumber != null &&
						show.pollstarVenue.PhoneNumber.length > 0 ) {
					newVenue["phone"] = '(' + show.pollstarVenue.PhoneAreaCode + ')' +
							show.pollstarVenue.PhoneNumber;
				}
				if ( show.pollstarVenue.Email != null &&
						show.pollstarVenue.Email.length > 0 ) {
					newVenue["email"] = show.pollstarVenue.Email;
				}

				// save it
				show["venue"] = newVenue;
				model.newVenues.push(newVenue);
			}
			model._fc.done();
		}
	});
}


function getVenues(model) {
	var newVenues = model.newVenues;

	if ( newVenues.length <= 0 ) {
		// no venues to write.  outta here!
		model._fc.done();
	} else {
		console.log("Got " + newVenues.length + " unknown venues from pollstar.");
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
						//	but with no pollstar info
						venues.forEach(function(venue) {
							var index = 0;
							newVenues.some(function(newVenue) {
								if ( venue.googleid == newVenue.googleid ) {
									// match!  fill in the extra info in the existing venue
									venue["pollstarId"] = newVenue.pollstarId;
									if ( newVenue.website != null ) {
										venue["website"] = newVenue.website ;
									}
									if ( newVenue.phone != null ) {
										venue["phone"] = newVenue.phone;
									}
									if ( newVenue.email != null ) {
										venue["email"] = newVenue.email;
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


function finished(model) {
	model._fc.done();
	model.origModel._fc.done();
}
