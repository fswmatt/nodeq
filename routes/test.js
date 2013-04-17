// testing one..two..three

var fc = require('../scripts/flowController');
var rjh = require('../scripts/returnJsonHelper');


exports.test = function(req, res) {
	var model = { req: req
		, res: res
	};
	fc.setModel(model);
	fc.register(cb1);
	fc.register([cb2, cb3]);
	fc.register([cb4]);
	fc.register(finish);
	fc.start();
}

function cb1(model) {
	setTimeout( function() {
		model["cb1"] = "callback 1";
		fc.done();
	}, Math.floor((Math.random()*1000)+1));
}

function cb2(model) {
	setTimeout( function() {
		model["cb2"] = "callback 2";
		fc.done();
	}, Math.floor((Math.random()*1000)+100));
}

function cb3(model) {
	setTimeout( function() {
		model["cb3"] = "callback 3";
		fc.done();
	}, 10);
}

function cb4(model) {
	setTimeout( function() {
		model["cb4"] = "callback 4";
		fc.done();
	}, Math.floor((Math.random()*1000)+1));
}

function finish(model) {
	var res = model.res;
	var req = model.req;
	delete model.res;
	delete model.req;

	rjh.returnSuccess(res, model, "model");
	fc.done();
}
