/**
 *	zipHelper
 *
 *	zipcode lookups from our mongo zip db
 */


var mongoClient = require('mongodb').MongoClient
	, globals = require('../config/globals')
	;


// function globals
var ZIP_COLLECTION_NAME = 'zipcodes';

var zipDb = null;
mongoClient.connect(globals.DB_URL, function(err, db) {
    if( !err ) {
		zipDb = db;
        zipDb.collection(ZIP_COLLECTION_NAME, {strict:true}, function(err, collection) {
	        console.log("Connected to '" + globals.DB_URL + "' database, collection "
    		    	+ ZIP_COLLECTION_NAME);
        	if ( err ) {
        		console.log("Loading zip db data");
        		loadZipData();
        	}
        });
    } else {
        console.log("Can't connect to '" + globals.DB_URL + "'.  Is mongod up?");
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
	var collection = zipDb.collection(ZIP_COLLECTION_NAME);

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
			collection.save(data, function(err, result) {
				if ( null != err ) {
					console.log("Error writing zip: " + err);
				}
			});
		})
		.on('end', function(count) {
			console.log("Number of zip codes processed: " + count);
			collection.ensureIndex({loc: '2d'}, function(err, result) {});
			console.log("Created 2d index on loc");
			collection.ensureIndex({zipcode: 1}, function(err, result) {});
			console.log("Created index on zipcode");
		})
		.on('error', function(error) {
			console.error(error.message);
		});
}
