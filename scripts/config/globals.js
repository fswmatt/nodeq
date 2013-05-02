/**
 *	globals.js
 *
 *	all of our global configs
 */


// mongodb
exports.DBPORT = 27017;
exports.DB_CONN_FLAGS = {auto_reconnect: true, safe: true, w: 1};
//exports.DB_HOST = 'localhost';
exports.DB_HOST = 'mini-me.local';

// jquery
exports.JQUERY_LOC = "http://code.jquery.com/jquery-1.9.1.js";

// timeouts
exports.PRIMARY_TIMEOUT = 10000; // 10 sec
exports.SECONDARY_TIMEOUT = 1000; // 1 sec
