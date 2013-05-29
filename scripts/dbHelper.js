/**
 *	dbHelper
 *
 *	all of our db related stuff lives here
 */

var mongoClient = require('mongodb').MongoClient
	, globals = require('../config/globals')
	;


// function globals
var VENUE_DBNAME = 'venuedb';
var VENUE_COLLECTION_NAME = 'venuedb';
exports.VENUE_COLL_NAME = VENUE_COLLECTION_NAME;


var venueDb;
mongoClient.connect(globals.DB_URL, function(err, db) {
    if( !err ) {
		venueDb = db;
		exports.openedVenueDb = venueDb;
		console.log("Connected to '" + globals.DB_URL + "' database, collection "
				+ VENUE_COLLECTION_NAME);
		db.collection(VENUE_COLLECTION_NAME, {strict:true}, function(err, collection) {
			if (err) {
				console.log(VENUE_COLLECTION_NAME +
						" collection doesn't exist. Creating it with sample data.");
				populateDb();
			}
		});
	}
});


// pre-populates the db with one record, just to prime the pump
function populateDb() {
    var venues = [{ name: "sample"
		, jambaseId: "0"
		, pollstarId: "0"
		, songkickId: "0"
		, googleid: "sampleId"
		, location: {lat: 0, lng: 0}
		, address: "sample address"
		, zip: "00000"
    }];

	venueDb.collection(VENUE_COLLECTION_NAME, function(err, collection) {
		collection.insert(venues, {safe: true}, function(err, result) {});
		collection.ensureIndex({jambaseId: 1},
				{background: true}, function(err, result) {});
		collection.ensureIndex({pollstarId: 1},
				{background: true}, function(err, result) {});
		collection.ensureIndex({googleid: 1},
				{background: true}, function(err, result) {});
		collection.ensureIndex({songkickId: 1},
				{background: true}, function(err, result) {});
	});
}

