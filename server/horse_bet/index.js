const express = require("express");
const fs = require("fs");
const http = require("http");
const WebSocket = require("ws");
const log = require("./log");
const Player = require("./player");

const sysConfig = JSON.parse(fs.readFileSync("config/system.json"));
const gameConfig = JSON.parse(fs.readFileSync("config/game.json"));
let credentials = [];
let tick = 0;
let players = [];
let betArea = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
let multipliers = [2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 30, 40, 50];
let gameState = "end";
let winHistory = [];

// ----- HTTP Server -----

var server = http.createServer(function (request, response) {
  response.end("Horse racing bet game server is running!");
});
server.listen(sysConfig.wsPort, function () {
  log(`WebSocket server listening at port ${sysConfig.wsPort}`);
});

// ----- WS Server -----

const wss = new WebSocket.Server({ server });

wss.on("listening", () => {
  log(`WebSocket server listening at port ${sysConfig.wsPort}`);
  setInterval(async () => {
    update(wss);
  }, 1000);
});

wss.on("connection", (ws) => {
  log(`Client connected!`);

  ws.on("message", async (data) => {
    log(`From Client : ${data}`);
    const json = JSON.parse(data);

    switch (json.head) {
      case "handshake":
        handshake(json.body, ws);
        break;
      case "bet":
        bet(json.body.amount, json.body.index, ws);
        break;
    }
  });

  ws.on("close", () => {
    disconnect(ws);
  });

  ws.on("error", () => {
    disconnect(ws);
  });
});

async function disconnect(ws) {
  log(`Player disconnect : ${ws.user.id}`);
  for (const [i, player] of players.entries()) {
    if (player.id == ws.user.id) {
      const id = player.id;
      players.splice(i, 1);

      const data = { game: "horse_bet", id };

      const respond = await fetch(sysConfig.accountUrl + "user_leave_game", {
        method: "POST",
        body: JSON.stringify(data),
        headers: {
          "Content-type": "application/json; charset=UTF-8",
        },
      }).catch((err) => {
        console.log(`Account api error!`);
      });

      if (respond?.status == "ok") {
        console.log(`Player removed : ${id}`);
      }

      return;
    }
  }
}

function update(wss) {
  tick++;

  if (gameState == "start") {
    if (tick > gameConfig.wait.start) {
      end(wss);
      gameState = "end";
      tick = 0;
    }
  } else if (gameState == "end") {
    if (tick > gameConfig.wait.end) {
      start(wss);
      gameState = "start";
      tick = 0;
    }
  }
}

function getWinIndex() {
  let totalBet = 0;
  for (const bet of betArea) {
    totalBet += bet;
  }
  console.log(`Total bet ${totalBet}`);

  let arr = [14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];
  let shuffled = arr.sort(function () {
    return Math.random() - 0.5;
  });

  for (i of shuffled) {
    if (betArea[i] * multipliers[i] <= totalBet && betArea[i] > 0) {
      return i;
    }
  }

  for (i of shuffled) {
    if (betArea[i] * multipliers[i] <= totalBet) {
      return i;
    }
  }
}

function handshake(body, ws) {
  log(`Handshake from client : ${body}`);
  const id = body.id;
  const passcode = body.passcode;
  for (const [i, credential] of credentials.entries()) {
    if (id == credential.id && passcode == credential.passcode) {
      console.log(`Credential found`);
      ws.user = {
        id,
      };
      const player = getPlayerByID(id);
      const data = {
        head: "handshake",
        body: {
          status: "ok",
          gameState,
          player: player.getInfo(),
        },
      };
      ws.send(JSON.stringify(data));
      credentials.splice(i, 1);
      return;
    }
  }
}

async function bet(amount, index, ws) {
  const id = ws.user.id;
  const player = getPlayerByID(id);

  if (player.balance < amount) return;
  if (gameState != "start") return;

  betArea[index] += amount;
  player.bet[index] += amount;
  player.balance -= amount;

  const data = {
    head: "bet",
    body: {
      amount,
      index,
      player: player.getInfo(),
    },
  };
  ws.send(JSON.stringify(data));

  const commData = {
    game: "horse_bet",
    id,
    amount,
  };

  const respond = await fetch(sysConfig.accountUrl + "transfer_to_bet_game", {
    method: "POST",
    body: JSON.stringify(commData),
    headers: {
      "Content-type": "application/json; charset=UTF-8",
    },
  }).catch((err) => {
    console.log(`Account api error!`);
  });

  if (respond?.status == "ok") {
    console.log(`Transfer from player ${player.id} to bet - amount ${amount}`);
  }
}

function getPlayerByID(id) {
  for (const player of players) {
    if (player.id == id) return player;
  }
}

function start(wss) {
  console.log(`Game State : Start`);
  multipliers = multipliers.sort(function () {
    return Math.random() - 0.5;
  });
  betArea = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

  for (const player of players) {
    player.reset();
  }
  const data = {
    head: "start",
    body: {
      multipliers,
      winHistory,
      timer: gameConfig.wait.start,
    },
  };
  for (const ws of wss.clients) {
    ws.send(JSON.stringify(data));
  }
}

async function end(wss) {
  console.log(`Game State : End`);
  const winIndex = getWinIndex();
  winHistory.unshift({ winIndex, multiply: multipliers[winIndex] });
  if (winHistory.length > 5) winHistory.pop();
  console.log(`Win index : ${winIndex}`);

  for (const player of players) {
    let totalBet = 0;
    for (const bet of player.bet) {
      totalBet += bet;
    }
    player.winAmount = player.bet[winIndex] * multipliers[winIndex];

    let logData = { playerId: player.id, game: "horse bet", bet: totalBet };

    if (player.winAmount > 0) {
      player.balance += player.winAmount;

      const commData = {
        game: "horse_bet",
        id: player.id,
        amount: player.winAmount,
      };

      const respond = await fetch(
        sysConfig.accountUrl + "transfer_from_bet_game",
        {
          method: "POST",
          body: JSON.stringify(commData),
          headers: {
            "Content-type": "application/json; charset=UTF-8",
          },
        }
      ).catch((err) => {
        console.log(`Account api error!`);
      });

      if (respond?.status == "ok") {
        console.log(`Transfer to player ${player.id} - amount ${amount}`);
      }
    }

    if (player.winAmount > totalBet) {
      logData.status = "win";
      logData.amount = player.winAmount - totalBet;
    } else {
      logData.status = "lose";
      logData.amount = -(totalBet - player.winAmount);
    }
    fetch(sysConfig.accountUrl + "play_log", {
      method: "POST",
      body: JSON.stringify(logData),
      headers: {
        "Content-type": "application/json; charset=UTF-8",
      },
    }).catch((err) => {
      console.log(`Account play log api error!`);
    });
  }

  const data = {
    head: "end",
    body: {
      winIndex,
      multiplier: multipliers[winIndex],
    },
  };

  for (const ws of wss.clients) {
    data.body.player = getPlayerByID(ws.user.id).getInfo();
    ws.send(JSON.stringify(data));
  }
}

// ----- Internal HTTP Server -----

const app = express();
app.use(express.json());

app.post("/new_user", (req, res) => {
  const id = req.body.id;
  const balance = req.body.balance;
  const info = req.body.info;

  // Check player exist
  for (const player of players) {
    if (player.id == id) {
      res.json({ status: "player exist" });
      return;
    }
  }

  log(`New player join : ID - ${id}, Balance - ${balance}`);

  const player = new Player(id, balance, info);
  players.push(player);

  const passcode = makeid(10);
  const data = {
    id,
    passcode,
  };
  credentials.push(data);
  res.json({ passcode, status: "ok" });
});

app.listen(sysConfig.httpPort, () => {
  log(`Internal server is listening at PORT ${sysConfig.httpPort}`);
});

function makeid(length) {
  var result = "";
  var characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  var charactersLength = characters.length;
  for (var i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}
