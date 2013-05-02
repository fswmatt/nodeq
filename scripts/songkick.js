/**
 *	songkick
 *
 *	songkick.com scraper
 */


var request = require('request')
	, util = require('util')
	, events = require('events')
	, jsdom = require('jsdom')
	, _ = require('underscore')
	, dbHelper = require('../scripts/dbHelper')
	, venueHelper = require('../scripts/venueHelper')
	, flowController = require('../scripts/flowController')
	, keys = require('../scripts/config/keys')
	, globals = require('./config/globals')
	;


var LOCALE_TO_SK = { BOS: "18842-us-boston-cambridge"
	, NY: "7644-us-new-york"
	, DC: "1409-us-washington"
	, MIA: "9776-us-miami"
	, NO: "11772-us-new-orleans"
	, CHI: "9426-us-chicago"
	, LAS: "8396-us-las-vegas"
	, SEA: "2846-us-seattle"
	, PDX: "12283-us-portland"
	, SMF: "14039-us-sacramento"
	, SF: "26330-us-san-francisco"
	, LOS: "17835-us-los-angeles"
};


// base url looks like this:
//	http://www.songkick.com/metro_areas/12283-us-portland?page=1

var VENUE_SEARCH = "/venues/";
var SPLIT_REGEX = "\n";
exports.load = function(model) {
	var u = LOCALE_TO_SK[model.params.city];
	if ( null == u ) {
		model._fc.done();
		return;
	}

	var startDate = new Date(model.params.startDate);
	var endDate = new Date(model.params.endDate);
// TODO: multi-page.  probably by spawning off more of these pups in parallel
	var uri = "http://www.songkick.com/metro_areas/" + u;
	console.log("Getting songkick show list from " + uri);
	model["songkickShows"] = new Array();
	request({uri: uri, timeout: 10000}, function(err, response, body) {
		// error check
		if ( null != err || response == null || response.statusCode !== 200 ) {
			console.log("Request for " + uri + " failed.");
			model._fc.done();
			return;
		}

		// jsdom's our own dom, and tell it to use jquery
		jsdom.env({ html: body
				, scripts: [globals.JQUERY_LOC] }
				, function(err, window) {
			//Use jQuery just as in a regular HTML page
			var $ = window.jQuery;
			var $body = $('body');
			var $events = $body.find('#event-listings .event-listings li');
			 // for each event...
			var date;
			var addVenues = true;
			$events.each(function (i, item) {
				if ( 1 == $(item).children('h3').length ) {
					date = new Date($(item).text().trim());
					addVenues = ( (date >= startDate) && (date <= endDate) );
				} else if (addVenues) {
					var venueName, venueLocation, venueId;
					var artistArray = new Array();
					$(item).children().each(function(index) {
						if ( 1 == index ) {
							var artists = $(this).text().trim();
							var splits = artists.split(SPLIT_REGEX);
							splits.forEach(function(artist) {
								artist = artist.trim();
								if ( 0 < artist.length ) {
									artistArray.push(artist);
								}
							});
						} else if ( 2 == index ) {
						// TODO: clean this up, use the tool properly
							locationName = $(this).text().trim();
							$(this).find('p').children().each(function(x) {
								if ( 0 == x ) {
									venueName = $(this).text().trim();
									var venueStr = $(this).html().trim();
									var cp = venueStr.indexOf(VENUE_SEARCH);
									var str2 = venueStr.substr(cp + VENUE_SEARCH.length, 15);
									venueId = str2.substr(0, str2.indexOf('-'));
								} else if ( 1 == x ) {
									venueLocation = $(this).text().trim();
								}
							});
						}
					});
					// only good venues please
					if ( null != venueLocation && null != venueId ) {
						model.songkickShows.push({ artists: artistArray
							, venueName: venueName
							, venueLocation: venueLocation
							, venueId: venueId
							, date: date
						});
					}
				}
			});
		// remove any dupes
		var newArray = _.uniq(model.songkickShows, false, function(elem, a, b) {
			return elem.venueId;
		});
		model["songkickShows"] = newArray;
		model._fc.done();
		});
	});
}


exports.generateShortShows = function(model) {
	var shows = new Array();
	if ( null != model.songkickShows ) {
		model.songkickShows.forEach(function(show) {
			var venue = show.venue;
			if ( null != venue ) {
				if ( null != venue._id ) {
					delete venue._id; // don't show internal ids
				}
				var artistList = new Array();
				show.artists.forEach(function(artist) {
					var shortArtist = { name: artist.toString() };
					artistList.push(shortArtist);
				});
				var shortShow = { venue: venue
					, artists: artistList
					, date: show.date
				};
				shows.push(shortShow);
			}
		});
	}
	model.shortShows.push(shows);
	model._fc.done();
}


exports.processVenues = function(model) {
	venueHelper.processVenues(model, model.songkickShows, "songkickId", addVenues,
			function(show) {
		return show.venueId;
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
		, [getVenues]
		, [venueHelper.addNewVenues, venueHelper.updateExistingVenues]
		, [updateShowsWithVenues]
		, [flowController.finished]
	];
	var fc = new flowController.FlowController({ model: innerModel
		, callbacks: callbacks
		, startNow: true
	});
}


function updateShowsWithVenues(model) {
	var shows = _.filter(model.origModel.songkickShows, function(elem) {
		return (null != elem.venue);
	});
	model.origModel.songkickShows = shows;
	var venues = model.venuesToUpdate;

	if ( null != venues ) {
		shows.forEach(function(show) {
			venues.some(function(venue) {
				if ( show.venueId == venue.songkickId ) {
					show["venue"] = venue;
					return true;
				}
			});
		});
	}
	model._fc.done();
}


function fillPlacesInfo(model, show) {
	var venueName = "";
	show.venueName.split(" ").forEach(function(item) {
		venueName += item + "+";
	});
	show.venueLocation.split(" ").forEach(function(item) {
		venueName += item + "+";
	});
	venueHelper.fillPlacesInfo(model, show, venueName, function(model, show, newVenue) {
		newVenue["songkickId"] = parseInt(show.venueId);
// no zip so far	show["zip" = show.jambaseVenue.venue_zip[0]
	});
}


function getVenues(model) {
	venueHelper.getVenues(model, "songkickId", function(venue) {
		return venue.songkickId;
	});
}
