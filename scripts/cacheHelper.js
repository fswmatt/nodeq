/**
 *	cacheHelper
 *
 *	all of our cache related stuff lives here
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
var DBNAME = 'cachedb';
var COLLECTION_NAME = 'citycache';
exports.COLL_NAME = COLLECTION_NAME;


// set up global venueDb
//  creates it and pre-populates it if it doesn't yet exist
var db = new Db(DBNAME, new Server(globals.DB_HOST, globals.DBPORT, globals.DB_CONN_FLAGS));
exports.openedDb = db;
db.open(function(err, openedDb) {
    if(!err) {
        console.log("Connected to '" + DBNAME + "' database");
        openedDb.collection(COLLECTION_NAME, {strict:true}, function(err, collection) {
            if (err) {
                console.log(COLLECTION_NAME + " collection doesn't exist. Creating it with sample data.");
                populateDb();
            }
        });
    }
});


exports.getShows = function(model) {
	var startDate = new Date(model.params.startDate);
	var endDate = new Date(model.params.endDate);
	var city = model.params.city;
	var key = getKey(city, startDate, endDate);
	db.collection(COLLECTION_NAME, function(err, collection) {
		var q = {'key': key};
		console.log('query ' + JSON.stringify(q));
		collection.find(q, function(err, cursor) {
			cursor.toArray(function(err, data) {
				if ( 0 < data.length ) {
					console.log("cache HIT for " + key );
					model["data"] = data[0].data;
				} else {
					console.log("cache MISS for " + key );
				}
				model._fc.done();
			});
		});
	});
}


exports.write = function(city, startDateStr, endDateStr, data) {
	var startDate = new Date(startDateStr);
	var endDate = new Date(endDateStr);
	var key = getKey(city, startDate, endDate);
	var data = { key: key
		, city: city
		, startDate: startDate
		, endDate: endDate
		, data: data
	};
	console.log("Writing cache for " + key);
	db.collection(COLLECTION_NAME, function(err, collection) {
		collection.insert(data, {safe: true}, function(err, result) {
			if ( null == err ) {
				if ( result != null && result[0] != null ) {
					console.log("Wrote cache for " + key);
				} else {
					console.log("Wrote something...");
				}
			} else {
				console.log("Error: " + err + " writing cache" );
			}
		});
	});
}


function getKey(city, startDate, endDate) {
	var key = city + "_" + startDate.getFullYear() + "." + (startDate.getMonth()+1) + "."
			+ startDate.getDate() + "_" + endDate.getFullYear() + "." + (endDate.getMonth() + 1)
			+ "." + endDate.getDate();
	return key;
}


// pre-populates the db with one record, just to prime the pump
function populateDb() {
    var data = [{ key: "sample"
		, startDate: new Date("1/1/2001")
		, endDate: new Date("1/1/2001")
		, city: "NONE"
		, data: {hi: "mom"}
    }];

	db.collection(COLLECTION_NAME, function(err, collection) {
		collection.insert(data, {safe: true}, function(err, result) {});
		collection.ensureIndex({key: 1}, {background: true}, function(err, result) {});
	});
}

