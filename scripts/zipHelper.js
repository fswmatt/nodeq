/**
 *	zipHelper
 *
 *	zipcode lookups from our mongo zip db
 */


var mongo = require('mongodb')
	, util = require('util');


// mongodb fun
var Server = mongo.Server
	, Db = mongo.Db
	, BSON = mongo.BSONPure;


// function globals
var ZIP_DBNAME = 'zipdb';
var ZIP_COLLECTION_NAME = 'zipcodes';
var DBPORT = 27017;
var DB_CONN_FLAGS = {auto_reconnect: true, safe: true, w: 1};
var DB_HOST = 'localhost';


// set up zipdb
var zipDb = new Db(ZIP_DBNAME, new Server(DB_HOST, DBPORT, DB_CONN_FLAGS));


zipDb.open(function(err, db) {
    if( ! err ) {
        console.log("Connected to '" + ZIP_DBNAME + "' database");
        db.collection(ZIP_DBNAME, {strict:true}, function(err, collection) {});
    } else {
        console.log("Can't connect to '" + ZIP_DBNAME + "'.  Is mongod up?");
    }
});


exports.fillInLatLngParamsFromZip = function(model) {
	var zip = model.params.zip;
	zipDb.collection(ZIP_COLLECTION_NAME, function(err, collection) {
		var q = {'zipcode': parseInt(zip)};
		console.log('query ' + JSON.stringify(q));
		collection.find(q, { _id: 0 }, function(err, cursor) {
			cursor.toArray(function(err, zips) {
				if ( null == model.params.midLat ) {
					model.params["midLat"] = zips[0].latitude;
				}
				if ( null == model.params.midLng ) {
					model.params["midLng"] = zips[0].longitude;
				}
				model.params["zipInfo"] = zips[0];
				model._fc.done();
			});
		});
	});
}
