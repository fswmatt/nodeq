/**
 *	FlowController
 *
 *	Manages flows of parallel and serial execution
 */

var util = require('util');
var events = require('events');


// globals
// the model initially passed in
var theModel;
// event array
var theEvents = new Array();
// # of processes currently executing
var theExecCount = 0;

exports.register = function(callbacks) {
	self = this;
 	if ( callbacks instanceof Array ) {
		theEvents.push(callbacks);
	} else {
		var arr = [callbacks];
		theEvents.push(arr);
	}
}

exports.setModel = function(model) {
	theModel = model;
}

exports.done = function() {
	if ( 0 < theEvents.length ) {
		if ( --theExecCount == 0 ) {
			// done!  fire event to exec next one
			eventSender.fireEvent();
		}
	} else {
		// all done!  turn off event listener
		eventSender.removeListener(FCE, completionHandler.eventHandler);
	}
}

exports.start = function() {
	eventSender.fireEvent();
}


// fire off the next ones
function exec() {
	self = this;
	var events = theEvents.shift();
	theExecCount = events.length;
	events.forEach(function(callback) {
		callback(theModel);
	});
}


// and our event managers
var FCE = 'flowControllerEvent';

// Sends events
EventSender = function() {
	events.EventEmitter.call(this);
	this.fireEvent = function() {
		this.emit(FCE);
	}
};
util.inherits(EventSender, events.EventEmitter);


// calls for after a completion event
CompletionHandler = function() {
 	this.eventHandler = function() {
 		exec();
 	}
};

var eventSender = new EventSender();
var completionHandler = new CompletionHandler(eventSender);
eventSender.on(FCE, completionHandler.eventHandler);
