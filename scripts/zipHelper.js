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
	;


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
        db.collection(ZIP_DBNAME, {strict:true}, function(err, collection) {
        	if ( err ) {
        		console.log("Initializing zip db");
        		loadZipData();
        	}
        });
    } else {
        console.log("Can't connect to '" + ZIP_DBNAME + "'.  Is mongod up?");
    }
});


// TODO: simplify this
exports.fillInLatLngParamsFromZip = function(model) {
	var zip = model.params.zip;
	if ( null == zip ) {
		// fill in the zip
		zipDb.collection(ZIP_COLLECTION_NAME, function(err, collection) {
			var q = {'loc': {'$near': [model.params.midLng, model.params.midLat]}};
			console.log('query ' + JSON.stringify(q));
			collection.find(q, { limit: 1 }, function(err, cursor) {
				cursor.toArray(function(err, zips) {
					model.params["zip"] = zips[0].zipcode;
					model.params["zipInfo"] = zips[0];
					model._fc.done();
				});
			});
		});
	} else {
		// fill in the lat lng
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
}


var FILENAME = './zipdata/zip2d.csv';
function loadZipData() {
	var csv = require('csv');
	var coll = zipDb.collection(ZIP_COLLECTION_NAME);

	// Read the contents of the postal codes file and pass to our mongo postal db:
	console.log("Reading zip data from " + FILENAME);
	csv()
		.from(FILENAME, { delimiter : ',', columns : true, trim: true })
		.transform(function(data, index) {
			var ret = { city : data.city
				, fips_regions : data.fips_regions
				, lon : parseFloat(data.lon)
				, lat : parseFloat(data.lat)
				, state : data.state
				, zipcode : parseInt(data.zipcode)
				, loc : [ parseFloat(data.lon), parseFloat(data.lat)]
			};
			return ret;
		})
		.on('record', function(data, index) {
//			console.log("Writing zip " + data.zipcode);
			coll.save(data);
		})
		.on('end', function(count) {
			console.log("Number of zip codes processed: " + count);
			coll.ensureIndex({loc: '2d'});
			console.log("Created 2d index on loc");
			coll.ensureIndex({zipcode: 1});
			console.log("Created index on zipcode");
		})
		.on('error', function(error) {
			console.error(error.message);
		});
}
