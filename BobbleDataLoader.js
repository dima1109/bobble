var mongo = require('mongodb').MongoClient;
var req = require('request');
var util = require('util');

var promoDataURL = "http://mlb.mlb.com/ticketing-client/json/GameTicketPromotion.tiksrv?home_team_id=%d&display_in=Promotions&sport_id=1&leave_empty_games=true&year=%d"

var bobbleCollection;
mongo.connect(process.env.MONGOLAB_URI, function(err, db) {
  if(!err) {
	  console.log('Connected to database');
	  bobbleCollection = db.collection('BobbleheadData');
  }
});

// The team IDs are 2- or 3-digit numbers. I could not find a place where the team IDs are mapped to team names,
// so this function scrapes a JSON document that contains some game schedule and score information for names and
// IDs. As a hack, let's get the schedule for the first sunday in May, since all teams play on Sunday.
var downloadTeamNameData = function(onComplete) {
    var firstSundayInMay = new Date(year, 4, 1, 0, 0, 0, 0);
    firstSundayInMay.setDate(firstSundayInMay.getDate() + 7 - firstSundayInMay.getDay());

    var requestURL = util.format('http://gdx.mlb.com/components/game/mlb/year_2014/month_05/day_0%d/master_scoreboard.json', firstSundayInMay.getDate());

	var responseStr = '';

    var parseResponse = function(err, response, body) {

        var scheduleData = JSON.parse(body);

        var games = scheduleData['data']['games']['game']
        var teamData = [];

        games.forEach(function(game) {
            teamData.push({'Abbreviation': game['home_name_abbrev'],
                           'Name': game['home_team_name'],
                           'TeamID': parseInt(game['home_team_id']),
                           'City': game['home_team_city']});

            teamData.push({'Abbreviation': game['away_name_abbrev'],
                           'Name': game['away_team_name'],
                           'TeamID': parseInt(game['away_team_id']),
                           'City': game['away_team_city']});
        });

        onComplete(teamData);
    }

    req(requestURL, parseResponse);
}

var downloadBobbleheadData = function(year, team, onComplete) {
	
    if (!year) {
        year = (new Date()).getFullYear();
    }
	
	var dbRequest;
	if (team) {
		dbRequest = {$or: [{'Abbreviation': team}, {'Name': team}, {'_id': parseInt(team)}]};
	} else {
		dbRequest = {};
	}
    
	var allPromoData = [];
	var numTeamsProcessed = 0;
	
	// Retrieve the team name mapping from the DB. If it doesn't exist, retrieve it from MLB
	bobbleCollection.find(dbRequest, {_id: 1, Abbreviation: 1, Name: 1}).toArray(function(err, dataFromDB) {
		if (dataFromDB) {
			// There is some information in the database. Update the team records one by one.
			// TODO Deal with potential cases where the number of teams in the database is smaller than the number of teams in the JSON schedule
			dataFromDB.forEach(function(team) {
				getPromoData(team);
			});
		} else {
			// TODO - this is the case when no data for a team is available. So far, this is only the Padres ...
		}
	
		// For a specified team, get the promotion data from the MLB JSON data
		function getPromoData(team) {

			teamID = team._id;

			var teamData = {_id: teamID, Name: team.Name, Abbreviation: team.Abbreviation, Promotions: []};

			requestURL = util.format(promoDataURL, teamID, year);

			var parsePromoData = function(err, response, body) {
				data = JSON.parse(body);

				scheduleData = data.events.game;

				// The MLB data contains the full schedule for each team. Promotions are properties of individual game days, 
				// and not all days have them (I wish ...). This loop filters the data to isolate the promotions and puts
				// them together in one array.
				scheduleData.forEach(function(event) {
					if ('promotion' in event) {
						var currPromotions = event.promotion.length ? event.promotion : [event.promotion];
						currPromotions.forEach(function(promo) {
							if (promo['offer_name'].match(/bobble/i)) {
								var gameTime = event['game_time_local'],
									opponent = event['away_team_id'],
									description = promo['offer_name'],
									id = parseInt(promo['offer_id']),
									distribution = promo['distribution'],
									imgURL = promo['image_url'];

								var newPromo = {ID: id, 
												Time: gameTime, 
												Opponent: opponent, 
												Description: description, 
												Distribution: distribution, 
												ImageURL: imgURL
											   };

								teamData.Promotions.push(newPromo);
							}
						});
					}
				});

				allPromoData.push(teamData);
				numTeamsProcessed++;
				updateDB(teamID, teamData.Promotions);

				if (numTeamsProcessed >= dataFromDB.length) {
					onComplete(allPromoData);
				}
			}

			var updateDB = function(teamID, newPromoData) {
				if (newPromoData.length > 0) {
					bobbleCollection.find({'_id': teamID}, {'Promotions': 1}).toArray(function (err, existingPromoData) {
						// Compare the new promo data with the existing and update, if necessary
						if (existingPromoData) {
							// TODO This needs to be _very_ smart about what to put in the DB to make sure nothing already 
							// existing is lost or overwritten, since there's no telling if MLB or any single team will 
							// decide to purge their promo records from the past. Until I have robust logic to do this, 
							// this is stubbed out. The DB already has data for 2014, which is good enough for now.
						}
					});
				}
			}

			req(requestURL, parsePromoData);
		}
	});
}

// Attach function to exports
exports.downloadTeamNameData = downloadTeamNameData;
exports.downloadBobbleheadData = downloadBobbleheadData;