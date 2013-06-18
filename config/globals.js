/**
 *	globals.js
 *
 *	all of our global configs
 */


var CONFIG = require('config').DB;
console.log("CONFIG: " + JSON.stringify(CONFIG));

// mongodb
exports.DB_CONN_FLAGS = CONFIG.DB_CONN_FLAGS;
exports.DB_PORT = CONFIG.DB_PORT;
exports.DB_HOST = CONFIG.DB_HOST;
exports.DB_URL = process.env.MONGOLAB_URI ? process.env.MONGOLAB_URI : CONFIG.DB_URL;
console.log("DB_URL: " + this.DB_URL);

//exports.DB_HOST = 'mini-me.local';
//exports.DB_URL = "mongodb://localhost:27017/mdb"

// jquery
exports.JQUERY_LOC = "http://code.jquery.com/jquery-1.9.1.js";

// timeouts
exports.PRIMARY_TIMEOUT = 10000; // 10 sec
exports.SECONDARY_TIMEOUT = 1000; // 1 sec
