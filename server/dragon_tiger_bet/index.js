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
let betArea = [0, 0, 0,0];
let multipliers = [2, 9, 2];
let gameState = "end";
let winHistory = [];

// ----- HTTP Server -----

var server = http.createServer(function (request, response) {
  response.end("Dragon Tiger server is running!");
});
server.listen(sysConfig.wsPort, function () {
  log(`WebSocket server listening at port ${sysConfig.wsPort}`);
});

// ----- WS Server -----

const wss = new WebSocket.Server({ server });

wss.on("listening", () => {
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

function disconnect(ws) {
  log(`Player disconnect : ${ws.user.id}`);
  for (const [i, player] of players.entries()) {
    if (player.id == ws.user.id) {
      players.splice(i, 1);
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

  let arr = [0, 1, 2,3].sort(function () {
    return Math.random() - 0.5;
  });

  for (i of arr) {
    if (betArea[i] * multipliers[i] <= totalBet && betArea[i] > 0) {
      return i;
    }
  }

  for (i of arr) {
    if (betArea[i] * multipliers[i] <= totalBet) {
      return i;
    }
  }
}

function getRandomWinIndex() {
  const r = Math.floor(Math.random() * 100);
  if (r > 90) {
    return 1;
  } else if (r > 45) {
    return 0;
  } else {
    return 2;
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
    game: "dragon_tiger_bet",
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
    console.log(`Account api error on - transfer to bet game`);
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
  betArea = [0, 0, 0,0];

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

  let totalBet = 0;
  for (const player of players) {
    for (const bet of player.bet) {
      totalBet += bet;
    }
  }

  let winIndex = getWinIndex();
  if (totalBet < 10000) {
    winIndex = getRandomWinIndex();
  }

  for (const player of players) {
    let playerTotalBet = 0;
    for (const bet of player.bet) {
      playerTotalBet += bet;
    }
    player.winAmount = player.bet[winIndex] * multipliers[winIndex];
    let logData = {
      playerId: player.id,
      game: "dragon tiger",
      bet: playerTotalBet,
    };

    if (player.winAmount > 0) {
      player.balance += player.winAmount;

      const commData = {
        game: "dragon_tiger_bet",
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
        console.log(`Account api error on - transfer from bet game`);
      });

      if (respond?.status == "ok") {
        console.log(`Transfer to player ${player.id} - amount ${amount}`);
      }
    }

    if (player.winAmount > playerTotalBet) {
      logData.status = "win";
      logData.amount = player.winAmount - playerTotalBet;
    } else {
      logData.status = "lose";
      logData.amount = -(playerTotalBet - player.winAmount);
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

  winHistory.unshift(winIndex);
  if (winHistory.length > 14) winHistory.pop();
  console.log(`Win index : ${winIndex}`);

  // Generate Card
  const shapes = [0, 1, 2, 3].sort(function () {
    return Math.random() - 0.5;
  });
  const s1 = shapes[0];
  const s2 = shapes[1];
  let r1 = 0;
  let r2 = 0;
  if (winIndex == 1) {
    const rank = Math.floor(Math.random() * 13) + 1;
    r1 = rank;
    r2 = rank;
  } else {
    const large = Math.floor(Math.random() * 6) + 7;
    const small = Math.floor(Math.random() * 7) + 1;
    if (winIndex == 0) {
      r1 = large;
      r2 = small;
    } else {
      r1 = small;
      r2 = large;
    }
  }
  const _r1 = getRank(r1);
  const _r2 = getRank(r2);
  const cards = [
    { shape: s1, rank: _r1 },
    { shape: s2, rank: _r2 },
  ];
  console.log(cards);

  const data = {
    head: "end",
    body: {
      winIndex,
      cards,
    },
  };

  for (const ws of wss.clients) {
    data.body.player = getPlayerByID(ws.user.id).getInfo();
    ws.send(JSON.stringify(data));
  }
}

function getRank(r) {
  switch (r) {
    case 10:
      return "D";
    case 11:
      return "J";
    case 12:
      return "Q";
    case 13:
      return "K";
    default:
      return r;
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
