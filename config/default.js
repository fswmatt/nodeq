// mongodb
module.exports = {
	DB: {
		DB_CONN_FLAGS: {auto_reconnect: true, safe: true, w: 1}
		, DB_PORT: 27017
		, DB_HOST:'localhost'
		, DB_URL: "mongodb://localhost:27017/venuedb"
		}
	};
