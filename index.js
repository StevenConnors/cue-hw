'use strict';

const {
    Stitch, 
    ServerApiKeyCredential,
    RemoteMongoClient,
} = require('mongodb-stitch-server-sdk');
const client = Stitch.initializeDefaultAppClient('mongodb-cue-rirpg');
const five = require("johnny-five");
const Tessel = require("tessel-io");

const STITCH_API_KEY = "YO9sx8uAbTsIK0ddHI14bYnQATa61nlr2DwdHisLmESiP81ld8X1OtzkvMyLs0c3";
const TABLE_ID = "nyc1633_38_0";

const board = new five.Board({
  io: new Tessel()
});

const LEFT_BUTTON_PIN = "b2";
const MID_BUTTON_PIN = "b3";
const RIGHT_BUTTON_PIN = "b4";

const LCD_PIN_1 = "a2";
const LCD_PIN_2 = "a3";
const LCD_PIN_3 = "a4";
const LCD_PIN_4 = "a5";
const LCD_PIN_5 = "a6";
const LCD_PIN_6 = "a7";

var lcd;
var lButton;
var mButton;
var rButton;

const NOBODY = "No one";

var matchStarted = false;
var previousNames = [NOBODY, NOBODY];
var currPlayerFirstNames = [NOBODY, NOBODY];

function initializeGPIO() {
	lcd = new five.LCD({
    pins: [LCD_PIN_1, LCD_PIN_2, LCD_PIN_3, LCD_PIN_4, LCD_PIN_5, LCD_PIN_6],
  });

  lButton = new five.Button(LEFT_BUTTON_PIN);
  lButton.on("press", () => console.log("L Pressed!"));
  lButton.on("release", () => edgeButtonHandler(0));

  mButton = new five.Button(MID_BUTTON_PIN);
  mButton.on("press", () => console.log("M Pressed!"));
  mButton.on("release", () => middleButtonHandler());

  rButton = new five.Button(RIGHT_BUTTON_PIN);
  rButton.on("press", () => console.log("R Pressed!"));
  rButton.on("release", () => edgeButtonHandler(1));
}

board.on("ready", function() {
	// Initialize Pins;
  initializeGPIO();

  // Stitch 
	client.auth.loginWithCredential(new ServerApiKeyCredential(STITCH_API_KEY)).then(user => {
		displayTable(board, lcd);
	}).catch(err => {
    console.log(err);
    client.close();
	})
});

async function displayTable(board, lcd) {
	var remoteMongoClient = client.getServiceClient(RemoteMongoClient.factory, "mongodb-atlas");
	var col = remoteMongoClient.db("cue").collection("tables");

  board.loop(5000, async () => {
		let tables = await col.find().asArray();
		let table = tables[0];
		console.log("Got table.");
		let names = await fetchPlayerNames(table.players);

		let refresh = false;
		if (previousNames[0] != names[0]) {
			previousNames[0] = names[0];
			refresh = true
		} 
		if (previousNames[1] != names[1]) {
			previousNames[1] = names[1];
			refresh = true
		}

		if (refresh) {
			clearLCD(lcd);
		}

		if (matchStarted) {
			// Get our users' first names
			let p1F = names[0].split(" ")[0];
			let p2F = names[1].split(" ")[0];
			currPlayerFirstNames = [p1F, p2F];

	    lcd.cursor(0,0).print("< " + p1F + " wins");
	    lcd.cursor(1,0).print(p2F + " wins");
	    lcd.cursor(1,14).print(" >");
		} else {
	    lcd.cursor(0,0).print("< " + names[0]);
	    lcd.cursor(1,0).print(names[1]);
	    lcd.cursor(1,14).print(" >");
		}

  });
}


async function fetchPlayerNames(players) {
	var remoteMongoClient = client.getServiceClient(RemoteMongoClient.factory, "mongodb-atlas");
	var playerCol = remoteMongoClient.db("cue").collection("players");

	if (players.length == 0) {
		return [NOBODY, NOBODY];
	} else if (players.length == 1) {
		let p1 = await playerCol.find({"_id": players[0]}).asArray();
		return [p1[0].name, NOBODY];
	}

	let p1 = await playerCol.find({"_id": players[0]}).asArray();
	let p2 = await playerCol.find({"_id": players[1]}).asArray();

	console.log("Got players");
	return [p1[0].name, p2[0].name]; 
}

function edgeButtonHandler(idx) {
	console.log("Edge button handler off w/ index", idx);
	if (!matchStarted) {
		// popqueue
		client.callFunction("popQueue", [TABLE_ID, idx]);
	} else {
		// End game w/ ind 0 as winner
		client.callFunction("endMatch", [TABLE_ID, idx]).then(() => {
			matchStarted = false;

			clearLCD(lcd);
    	lcd.cursor(0,0).print(currPlayerFirstNames[idx] + " wins!!");
		})
		// Add ending game, so and so won on the screen
	}
}

function middleButtonHandler() {
	if (!matchStarted) {
		// TODO: Un comment
		if (previousNames.includes(NOBODY)) {
			// Start match lcd
			clearLCD(lcd);
    	lcd.cursor(0,0).print("Cant start match");
		} else {		
			client.callFunction("startMatch", [TABLE_ID]).then(() => {
				matchStarted = true;

				// Start match lcd
				clearLCD(lcd);
	    	lcd.cursor(0,0).print("Starting Match");
	    	previousNames = [NOBODY, NOBODY];
			})
		}
	}
}

function clearLCD(lcd) {
  lcd.cursor(0,0).print("                ");
  lcd.cursor(1,0).print("                ");
}



	// If tables.find().asArray().then((tableArr) => {
	// 		let table = tableArr[0];
	// 		table.players // is an array of player_ids
	// })


	// If no match has started, you can press the side buttons to popQueue(table_id, playerIdx) & the player will leave
	// If no match has started, we pass press the Middle Button, call the StartMatch method
	// If a game is in progress, we don't do much. When the game is ready to be over, select the winner
	//    by pressing the side buttons to determine the winner. That should call endMatch method


