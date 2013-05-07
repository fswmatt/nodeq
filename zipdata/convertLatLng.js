/**
 *	convertLatLng.js
 *
 *	convert the zip data to lat/lng for 2d lookup
 */

var mongo = require('mongodb')
	, util = require('util')
	, globals = require('../scripts/config/globals')
	;


// mongodb fun
var Server = mongo.Server
	, Db = mongo.Db
	, BSON = mongo.BSONPure
	;


// function globals
var ZIP_DBNAME = 'zipdb';
var ZIP_COLLECTION_NAME = 'zipcodes';


// set up zipdb
var zipDb = new Db(ZIP_DBNAME, new Server(globals.DB_HOST, globals.DBPORT
		, globals.DB_CONN_FLAGS));


exports.run = function(req, res) {
	zipDb.collection(ZIP_COLLECTION_NAME, function(err, collection) {
		var q = {};
		collection.find(q, function(err, cursor) {
			cursor.toArray(function(err, datas) {
				if ( null != datas ) {
					datas.forEach(function(data) {
						data["loc"] = [data.longitude, data.latitude];
						zipDb.collection(ZIP_COLLECTION_NAME, function(err, collection) {
							collection.update({'zipcode': data.zipcode}, data, function(err, result) {
								console.log("updated location data for zip " + data.zipcode);
							});
						});
					});
				}
			});
		});
	});
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
