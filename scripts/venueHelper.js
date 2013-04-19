/**
 *	venueHelper
 *
 *	all of our venue related helping hands
 */


var dbHelper = require('../scripts/dbHelper')
	, flowController = require('../scripts/flowController')
	;


exports.addNewVenues = function(model) {
	var venues = model.newVenues;

	if ( venues.length <= 0 ) {
		// no venues to write.  outta here!
		model._fc.done();
	} else {
		console.log("Writing venue info for " + venues.length + " venues.");
		dbHelper.openedVenueDb.collection(dbHelper.VENUE_DB_NAME, function(err, collection) {
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

	if ( venues.length <= 0 ) {
		// no venues to write.  outta here!
		model._fc.done();
	} else {
		var callbacks = [ [{callback: updateOne, paramsArray: venues}]
			, [finished]
		];
		var fc = new flowController.FlowController({ callbacks: callbacks
			, model: {origModel: model}
			, startNow: true
		});
	}
}


function updateOne(model, venue) {
	console.log("Updating venue info for " + venue.name);
	dbHelper.openedVenueDb.collection(dbHelper.VENUE_DB_NAME, function(err, collection) {
		collection.update({'googleid': venue.googleid}, venue, function(err, result) {
			if ( null == err ) {
				if ( result != null && result[0] != null ) {
					console.log("Wrote " + result.length + " venue");
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


function finished(model) {
	model._fc.done();
	model.origModel._fc.done();
}

