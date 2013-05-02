/**
 *	dbHelper
 *
 *	all of our db related stuff lives here
 */

var mongo = require('mongodb')
	, util = util = require('util')
	, globals = require('./config/globals')
	;

// mongodb fun
var Server = mongo.Server
	, Db = mongo.Db
	, BSON = mongo.BSONPure;


// function globals
var VENUE_DBNAME = 'venuedb';
var VENUE_COLLECTION_NAME = 'venuedb';
exports.VENUE_COLL_NAME = VENUE_COLLECTION_NAME;


// set up global venueDb
//  creates it and pre-populates it if it doesn't yet exist
var venueDb = new Db(VENUE_DBNAME, new Server(globals.DB_HOST, globals.DBPORT
		, globals.DB_CONN_FLAGS));
exports.openedVenueDb = venueDb;

venueDb.open(function(err, db) {
    if(!err) {
        console.log("Connected to '" + VENUE_DBNAME + "' database");
        db.collection(VENUE_COLLECTION_NAME, {strict:true}, function(err, collection) {
            if (err) {
                console.log(VENUE_COLLECTION_NAME + " collection doesn't exist. Creating it with sample data.");
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
		, googleid: "sampleId"
		, location: {lat: 0, lng: 0}
		, address: "sample address"
		, zip: "00000"
    }];

	venueDb.collection(VENUE_COLLECTION_NAME, function(err, collection) {
		collection.insert(venues, {safe: true}, function(err, result) {});
		collection.ensureIndex({jambaseId: 1, pollstarId: 1, googleid: 1},
				{background: true}, function(err, result) {});
	});
}

