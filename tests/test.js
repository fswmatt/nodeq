// testing one..two..three

var fc = require('../scripts/flowController');
var rjh = require('../scripts/returnJsonHelper');
var zh = require('../scripts/zipHelper');

exports.test = function(req, res) {
	var model = { req: req
		, res: res
		, testName: 1
		, models: new Array()
		, params: {zip: "10005"}
	};
	var callbacks1 = [ [{callback: cb1, paramsArray: ["hi", "mom"]}]
		, [cb2, cb3]
		, [zh.fillInLatLngParamsFromZip]
		, [finish]
	];
	new fc.FlowController({model: model
		, callbacks: callbacks1
		, startNow: true
	});

	var callbacks2 = [ [cb4]
		, [cb2, {callback: cb3, paramsArray: ["eat", "a", "bag", "of", "dicks"], max: 2}]
		, [{callback: cb1, paramsArray: ["hi", "mom"]}]
		, [finish]
	];
	model.testName = 2;
	new fc.FlowController({model: model
		, callbacks: callbacks2
		, startNow: true
	});

	var callbacks3 = [ [cb4]
		, [{callback: cb3, paramsArray: ["eat", "a", "bag", "of", "dicks"], max: 2}, cb2, {callback: cb1, paramsArray: ["hi", "mom"]}]
		, [cb3, cb1]
		, [finish]
	];
	model.testName = 3;
	new fc.FlowController({model: model
		, callbacks: callbacks3
		, startNow: true
	});

	var callbacks4 = [ [cb2, cb4, cb3, cb1]
		, [finish]
	];
	model.testName = 4;
	new fc.FlowController({model: model
		, callbacks: callbacks4
		, startNow: true
	});

}

function cb1(model, param) {
	setTimeout( function() {
		if ( null == param ) {
			model["cb1"] = "callback 1 " + model.FCE;
		} else {
			model["cb1_" + param] = "callback 1 " + model.FCE;
		}
		model._fc.done();
	}, Math.floor((Math.random()*500)+1));
}

function cb2(model, param) {
	setTimeout( function() {
		if ( null == param ) {
			model["cb2"] = "callback 2 " + model.FCE;
		} else {
			model["cb2_" + param] = "callback 2 " + model.FCE;
		}
		model._fc.done();
	}, Math.floor((Math.random()*500)+1));
}

function cb3(model, param) {
	setTimeout( function() {
		if ( null == param ) {
			model["cb3"] = "callback 3 " + model.FCE;
		} else {
			model["cb3_" + param] = "callback 3 " + model.FCE;
		}
		model._fc.done();
	}, Math.floor((Math.random()*500)+1));
}

function cb4(model, param) {
	setTimeout( function() {
		if ( null == param ) {
			model["cb4"] = "callback 4 " + model.FCE;
		} else {
			model["cb4_" + param] = "callback 4 " + model.FCE;
		}
		model._fc.done();
	}, Math.floor((Math.random()*500)+1));
}

function finish(model) {
	var res = model.res;
	var req = model.req;
	var _fc = model._fc;
	var models = model.models;
	delete model.res;
	delete model.req;
	delete model._fc;
	delete model.models;

	models.push(model);
	_fc.done();
	if ( 4 == models.length ) {
		rjh.returnSuccess(res, models, "models");
	}
}
