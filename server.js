// Housekeeping
var express = require('express');
var logfmt = require('logfmt');
var mongo = require('mongodb').MongoClient;
var app = express();
var bobbleDataLoader = require('./BobbleDataLoader.js')

var bobbleCollection;
mongo.connect('mongodb://dima1109:dima1109@ds027759.mongolab.com:27759/bobble', function(err, db) {
  if(!err) {
	  console.log('Connected to database');
	  bobbleCollection = db.collection('BobbleheadData');
  }
});

// Set up the static paths
app.use(logfmt.requestLogger());
app.use('/', express.static(__dirname));

// Set up the verb actions
app.get('/', function(req, res) {
  res.sendfile('calendar.html');
});

app.get('/teams', function(req, res) {
	if (bobbleCollection) {
		bobbleCollection.find({}, {'Promotions': 0}).toArray(function(err, data) {
		  res.send(data);
	  });
	} else {
		// TODO Error handling
	}
});

app.get('/bobbleheads/:team?', function(req, res) {
	if (bobbleCollection) {
		var dbRequest;
		var team = req.params.team;
		if (team) {
			dbRequest = {$or: [{'Abbreviation': team}, {'Name': team}, {'_id': parseInt(team)}]};
		} else {
			dbRequest = {};
		}
		
		bobbleCollection.find(dbRequest).toArray(function(err, data) {
		  	res.send(data);
	  	});
	} else {
		// TODO Error handling
	}
});

app.get('/update/:team?', function(req, res) {
	if (bobbleCollection) {
		console.log('Serving request for "update"');
		bobbleDataLoader.downloadBobbleheadData(req.param('year'), req.param('team'), function(data) { 
			res.send(data);
		});
	} else {
		// TODO Error handling
	}
});

var port = Number(process.env.PORT || 8008);
app.listen(port, function() {
  console.log("Listening on " + port);
});