/**
 *	dbHelper
 *
 *	all of our db related stuff lives here
 */

var mongo = require('mongodb')
	, util = util = require('util')
	;


// mongodb fun
var Server = mongo.Server
	, Db = mongo.Db
	, BSON = mongo.BSONPure;


// function globals
var VENUE_DBNAME = 'venuedb';
var DBPORT = 27017;
var DB_CONN_FLAGS = {auto_reconnect: true, safe: true, w: 1};
var DB_HOST = 'localhost';
exports.VENUE_DB_NAME = VENUE_DBNAME;


// set up global venueDb
//  creates it and pre-populates it if it doesn't yet exist
var venueDb = new Db(VENUE_DBNAME, new Server(DB_HOST, DBPORT, DB_CONN_FLAGS));
exports.openedVenueDb = venueDb;

venueDb.open(function(err, db) {
    if(!err) {
        console.log("Connected to '" + VENUE_DBNAME + "' database");
        db.collection(VENUE_DBNAME, {strict:true}, function(err, collection) {
            if (err) {
                console.log(VENUE_DBNAME + " collection doesn't exist. Creating it with sample data.");
                populateDb();
            }
        });
    }
});


// pre-populates the db with one record, just to prime the pump
function populateDb() {
    var venues = [{ name: "sample"
		, jambaseId: "0"
		, googleid: "sampleId"
		, geometry: { location: {lat: 0, lng: 0}}
		, address: "sample address"
		, zip: "00001"
    }];

	venueDb.collection(VENUE_DBNAME, function(err, collection) {
		collection.insert(venues, {safe: true}, function(err, result) {});
	});
}

