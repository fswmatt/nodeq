/**
 *	zipHelper
 *
 *	zipcode lookups from our mongo zip db
 */


var mongo = require('mongodb')
	, util = require('util')
	, globals = require('./config/globals')
	;


// mongodb fun
var Server = mongo.Server
	, Db = mongo.Db
	, BSON = mongo.BSONPure;


// function globals
var ZIP_DBNAME = 'zipdb';
var ZIP_COLLECTION_NAME = 'zipcodes';


// set up zipdb
var zipDb = new Db(ZIP_DBNAME, new Server(globals.DB_HOST, globals.DBPORT
		, globals.DB_CONN_FLAGS));


// TODO: if the db is empty import the data and set up the indexes
// mongoimport -d zipdb -c zipcodes --type csv --headerline zip2d.csv
// mongoimport -d zipdb -c fips --type csv --headerline fips_regions.csv
// collection.ensureIndex({zipcode:1}, {background: true}, function(err, result) {});
// collection.ensureIndex({loc: "2d"}, {background: true}, function(err, result) {});
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
					model.params["midLat"] = zips[0].loc[1];
				}
				if ( null == model.params.midLng ) {
					model.params["midLng"] = zips[0].loc[0];
				}
				model.params["zipInfo"] = zips[0];
				model._fc.done();
			});
		});
	});
}
