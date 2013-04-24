/**
 *	FlowController
 *
 *	Manages flows of parallel and serial execution
 */

var util = require('util')
	, events = require('events');


var flowCount = 0;

this.FlowController = function(params) {
	flowCount++;

// constructor/initiation
	// where we store everything
	var theModel = new Object();
	// event array
	var theEvents;
	// # of processes currently executing
	var theExecCount = 0;

	theModel["_fc"] = this;


// public methods

	// registers a new callback
	// 	this adds to the end of the callback list
	//  if you passed in callbacks init params you shouldn't need to use this
	this.register = function(callbacks) {
		if ( callbacks instanceof Array ) {
			theEvents.push(callbacks);
		} else {
			var arr = [callbacks];
			theEvents.push(arr);
		}
	}

	// callbacks call this when they're done
	this.done = function() {
		if ( 0 < theEvents.length ) {
			if ( --theExecCount == 0 ) {
				// done!  fire event to exec next one
				eventSender.fireEvent();
			}
		} else {
			// all done!  turn off event listener
			console.log("Killing event listener " + FCE);
			eventSender.removeListener(FCE, completionHandler.eventHandler);
		}
	}

	// call this to start it all up
	this.start = function() {
		eventSender.fireEvent();
	}



// private

	// fire off the next ones
	function exec() {
		var events;
		do {
			events = theEvents.shift();
			if ( null == events ) {
				// empty param.  loser.
				console.log("Empty array item in events.  Fix yer data!");
			}
		} while ( events == null );
		theExecCount = getExecCount(events);
		events.forEach(function(item) {
			if ( item instanceof Function ) {
				// simple item, send it on
				setTimeout( function() {
					item(theModel);
				}, 0);
			} else {
				// complex item - the 'callback' param should be a function
				//	and the 'paramsArray' should be parameters.
				//	fire up one callback for each elem in paramsArray
				item.paramsArray.forEach(function(paramItem) {
					setTimeout( function() {
						item.callback(theModel, paramItem);
					}, 0);
				});
			}
		});
	}

	function getExecCount(events) {
		var count = 0;
		events.forEach(function(item) {
			if ( item instanceof Function ) {
				count++;
			} else {
				count+= item.paramsArray.length;
			}
		});
		return count;
	}


// helpers - event management

	// create a unique event name
	var FCE = 'FCE_' + flowCount;
	theModel["FCE"] = FCE;

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
	console.log("Creating event listener " + FCE);
	eventSender.on(FCE, completionHandler.eventHandler);


// and the rest of our constructor/initialization
// 	do this at the end so everything else is set up before we go if we have to start
	if ( null != params ) {
		// copy the callback list
		if ( null != params.callbacks ) {
			theEvents = params.callbacks;
		} else {
			theEvents = new Array();
		}

		// copy initial data to theModel
		if ( null != params.model ) {
			for (var attr in params.model) {
				if (params.model.hasOwnProperty(attr)) {
					theModel[attr] = params.model[attr];
				}
			}
		}

		// should we start now?
		if ( null != params.startNow && params.startNow ) {
			this.start();
		}
	}
};


// we do this a lot!
exports.finished = function(model) {
	model._fc.done();
	model.origModel._fc.done();
}
