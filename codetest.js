/**
 *	zipHelper
 *
 *	zipcode lookups from our mongo zip db
 */


var mongo = require('mongodb')
	, util = require('util')
	, globals = require('./scripts/config/globals')
	;


// mongodb fun
var Server = mongo.Server
	, Db = mongo.Db
	;

// function globals
var ZIP_DBNAME = 'zipdb';
var ZIP_COLLECTION_NAME = 'zipcodetest';


// set up zipdb
var db = new Db(ZIP_DBNAME, new Server(globals.DB_HOST, globals.DBPORT
		, globals.DB_CONN_FLAGS));

var FILENAME = './zipdata/zip2d.csv'

var csv = require('csv');
var fs = require('fs');
var coll = db.collection(ZIP_COLLECTION_NAME);

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
		console.log("Writing zip " + data.zipcode);
		coll.save(data);
	})
	.on('end', function(count) {
		console.log("Number processed: " + count);
		coll.ensureIndex({loc: '2d'}, {background: true});
		coll.ensureIndex({zipcode: 1}, {background: true});
	})
	.on('error', function(error) {
		console.error(error.message);
	});


