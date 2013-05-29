/**
 * Module dependencies.
 */

var express = require('express')
	, http = require('http')
	, path = require('path')
	, api = require('./routes/api')
	, test = require('./tests/test')
	, convert = require('./zipdata/convertLatLng')
	, app = express();

// all environments
app.set('port', process.env.PORT || 8000);
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(app.router);
app.use(express.static(path.join(__dirname, 'public')));

// development only
if ('development' == app.get('env')) {
  app.use(express.errorHandler());
}

app.get('/', function(req, res) {
	res.sendfile("./public/html/location.html");
});

app.get('/api/v0.1/getShowList/:zip/:miles', api.showListFromZipDist);
app.get('/api/v0.1/getShowList/:north/:west/:south/:east', api.showListFromLatLng);
app.get('/api/v0.1/getVenueInfo/:venueId', api.getVenueInfo);

app.get('/api/v0.2/getShowList/:zip/:miles', api.showListFromZipDist);
app.get('/api/v0.2/getShowList/:north/:west/:south/:east', api.showListFromLatLng);
app.get('/api/v0.2/getVenueInfo/:venueId', api.getVenueInfo);

app.get('/test', test.test);
app.get('/convert', convert.run);

http.createServer(app).listen(app.get('port'), function(){
  console.log('Express server listening on port ' + app.get('port'));
});

