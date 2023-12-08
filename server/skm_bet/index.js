const express = require("express");
const fs = require("fs");
const http = require("http");
const WebSocket = require("ws");
const log = require("./log");
const Card = require("./card");
const Player = require("./player");
const { compareCard, getPauk } = require("./card_util");

const sysConfig = JSON.parse(fs.readFileSync("config/system.json"));
const gameConfig = JSON.parse(fs.readFileSync("config/game.json"));
let credentials = [];

let gameBalance = 0;
let tick = 0;
let players = [];
let betArea = [0, 0, 0, 0];
let gameState = "end";
let cardPool = [];
let history = [];
let cards = [
  [null, null, null],
  [null, null, null],
  [null, null, null],
  [null, null, null],
  [null, null, null],
];

let isDebug = true;

// ----- HTTP Server -----

var server = http.createServer(function (request, response) {
  response.end("ABCD bet game server is running!");
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

async function disconnect(ws) {
  for (const [i, player] of players.entries()) {
    if (player.id == ws.user.id) {
      const id = player.id;
      players.splice(i, 1);

      const data = { game: "skm_bet", id };

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

function start(wss) {
  resetCards();
  betArea = [0, 0, 0, 0];
  cards = [
    [null, null, null],
    [null, null, null],
    [null, null, null],
    [null, null, null],
    [null, null, null],
  ];
  for (let i = 0; i < 5; i++) {
    let r = Math.floor(Math.random() * cardPool.length);
    cards[i][0] = cardPool[r];
    cardPool.splice(r, 1);
  }
  for (const player of players) {
    player.reset();
  }
  const data = {
    head: "start",
    body: {
      cards,
      history,
      timer: gameConfig.wait.start,
    },
  };
  for (const ws of wss.clients) {
    ws.send(JSON.stringify(data));
  }
}

async function end(wss) {
  console.log(`Game balance : ${gameBalance}`);

  let totalBet = 0;
  for (const player of players) {
    for (const b of player.bet) {
      totalBet += b;
    }
  }

  console.log(`Total Bet : ${totalBet}`);

  if (gameBalance > 0) {
    const profit = gameBalance * 0.1;
    gameBalance -= profit;
    console.log(`Profit cut : ${profit}, Game Balance : ${gameBalance}`);
    // need to implement transfer to bet game profit
  }

  // Deliver second card
  for (let i = 0; i < 5; i++) {
    if (gameBalance < 0 && i == 4 && totalBet > 0) {
      const countNeed = Math.floor(Math.random() * 2) + 8;
      let cardNeeded = findCardByCountNeed(countNeed, cards[i][0]);
      if (cardNeeded) {
        cards[i][1] = cardNeeded;
      } else {
        let r = Math.floor(Math.random() * cardPool.length);
        cards[i][1] = cardPool[r];
        cardPool.splice(r, 1);
      }
    } else {
      let r = Math.floor(Math.random() * cardPool.length);
      cards[i][1] = cardPool[r];
      cardPool.splice(r, 1);
    }
  }

  for (let i = 0; i < 5; i++) {
    const p = getPauk(cards[i]);
    if (p <= 4) {
      let r = Math.floor(Math.random() * cardPool.length);
      cards[i][2] = cardPool[r];
      cardPool.splice(r, 1);
    }
  }

  let winners = [];
  let pauk = [0, 0, 0, 0, 0];

  for (let i = 0; i < 4; i++) {
    if (compareCard(cards[i], cards[4]) == 1) {
      winners.push(i);
    }
    pauk[i] = getPauk(cards[i]);
  }
  pauk[4] = getPauk(cards[4]);

  console.log(`Winners : ${winners}`);

  history.unshift(winners);
  if (history.length > 7) history.pop();

  // refund player win bet
  for (const player of players) {
    let refund = 0;
    let totalPlayerBet = 0;
    for (const [i, bet] of player.bet.entries()) {
      totalPlayerBet += bet;
      if (winners.includes(i)) {
        refund += bet * 2;
      }
    }
    let logData = { playerId: player.id, game: "skm bet", bet: totalPlayerBet };
    if (refund > 0) {
      player.balance += refund;

      const commData = {
        game: "skm_bet",
        id: player.id,
        amount: refund,
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
    const winAmount = refund - totalPlayerBet;
    gameBalance -= winAmount;
    if (winAmount >= 0) {
      logData.status = "win";
    } else {
      logData.status = "lose";
    }
    logData.amount = winAmount;

    if (winAmount != 0) {
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
  }

  const data = {
    head: "end",
    body: {
      cards,
      winners,
      pauk,
    },
  };

  for (const ws of wss.clients) {
    if (!ws?.user) continue;
    data.body.player = getPlayerByID(ws.user.id).getInfo();
    ws.send(JSON.stringify(data));
  }
}

function findCardByCountNeed(countNeed, firstCard) {
  const firstCount = firstCard.count;
  for (let i = 0; i < cardPool.length; i++) {
    const card = cardPool[i];
    if ((firstCount + card.count) % 10 == countNeed) {
      const _card = new Card(card.shape, card.rank);
      cardPool.splice(i, 1);
      return _card;
    }
  }
  return null;
}

function getWinners() {
  let totalBet = 0;
  for (const bet of betArea) {
    totalBet += bet;
  }
  console.log(`Total bet ${totalBet}`);

  let arr = [0, 1, 2, 3];
  let _arr = arr.sort(function () {
    return Math.random() - 0.5;
  });
  console.log(`After shuffle : ${_arr}`);

  if (totalBet == 0) {
    return [_arr[0], _arr[1]];
  }

  let winners = [];
  for (i of _arr) {
    if (betArea[i] == 0) continue;
    if (betArea[i] * 2 < totalBet) {
      winners.push(i);
      let winAmount = betArea[i] * 2;
      console.log(`Win amount : ${winAmount}`);
      totalBet -= winAmount;
      console.log(`Winner ${i} added. Total Bet ${totalBet}`);
    }
  }
  return winners;
}

function handshake(body, ws) {
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
    game: "skm_bet",
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

function resetCards() {
  cardPool = [];
  for (let i = 0; i < 4; i++) {
    for (let j = 1; j <= 13; j++) {
      let c = j;
      switch (j) {
        case 10:
          c = "D";
          break;
        case 11:
          c = "J";
          break;
        case 12:
          c = "Q";
          break;
        case 13:
          c = "K";
          break;
      }
      let card = new Card(i, c);
      cardPool.push(card);
    }
  }
  console.log(`Total cards in pool ${cardPool.length}`);
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
