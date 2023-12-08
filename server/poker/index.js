const express = require("express");
const fs = require("fs");
const http = require("http");
const WebSocket = require("ws");
const log = require("./log");
const Player = require("./player");
const Room = require("./room");

const internalServer = express();
internalServer.use(express.json());

const sysConfig = JSON.parse(fs.readFileSync("config/system.json"));
const levelConfig = JSON.parse(fs.readFileSync("config/level.json"));
let gameConfig = JSON.parse(fs.readFileSync("config/game.json"));

let credentials = [];
let isActive = true;
let botIndex = 0;

// Game Variable
let rooms = [];

// ----- HTTP Server -----

var server = http.createServer(function (request, response) {
  response.end("Poker game server is running!");
});
server.listen(sysConfig.apiPort, function () {
  log(`WebSocket server listening at port ${sysConfig.apiPort}`);
});

// ----- WS Server -----

const wss = new WebSocket.Server({ server });

wss.on("listening", () => {
  log(`WebSocket server listening at port ${sysConfig.apiPort}`);
});

wss.on("connection", (ws) => {
  console.log(`Client connected!`);

  ws.on("message", async (data) => {
    console.log(`From Client : ${data}`);
    const json = JSON.parse(data);

    switch (json.head) {
      case "room info":
        roomInfo(ws);
        console.log(`Room info request`);
        break;
      case "handshake":
        handshake(json.body, ws);
        console.log(ws.user);
        break;
      case "auto sort":
        autoSort(ws);
        break;
      case "eat":
        eat(ws);
        break;
      case "draw":
        draw(ws);
        break;
      case "shoot":
        shoot(ws, json.index);
        break;
      case "exit":
        exit(ws);
        break;
      case "emoji":
        sendByRoomNo(ws.user.roomNo, json, wss);
        break;
      case "message":
        sendByRoomNo(ws.user.roomNo, json, wss);
        break;
      case "anim-chat":
        sendByRoomNo(ws.user.roomNo, json, wss);
        break;
      case "move card":
        moveCard(ws, json.body);
        break;
      case "ping":
        ping(ws);
        break;
    }
  });

  ws.on("close", () => {
    connLost(ws);
  });

  ws.on("error", () => {
    connLost(ws);
  });
});

// ----- Functions -----

function sendByRoomNo(roomNo, respondObj) {
  for (const ws of wss.clients) {
    if (ws?.user?.roomNo) {
      if (ws.user.roomNo == roomNo) {
        ws.send(JSON.stringify(respondObj));
      }
    }
  }
}

function handshake(body, ws) {
  console.log(`Handshake from ${body.id} with passcode ${body.passcode}`);
  const id = body.id;
  const passcode = body.passcode;
  let taxMoney = 0;
  let downMoney = 0;
  for (const [i, credential] of credentials.entries()) {
    if (id == credential.id && passcode == credential.passcode) {
      console.log(`Credential found`);
      for (const room of rooms) {
        if (room.roomNo == credential.roomNo) {
          room.players[credential.index].connState = Player.ConnStates.active;
          taxMoney = room.levelConfig.taxMoney;
          downMoney = room.levelConfig.downMoney;
        }
      }
      ws.user = {
        id,
        roomNo: credential.roomNo,
        index: credential.index,
      };
      console.log(ws.user);
      const data = {
        head: "handshake",
        body: {
          status: "ok",
          index: credential.index,
          taxMoney,
          downMoney,
        },
      };
      ws.send(JSON.stringify(data));
      credentials.splice(i, 1);
      return;
    }
  }
}

function roomInfo(ws) {
  if (!ws?.user) return;
  for (const room of rooms) {
    if (room.roomNo == ws.user.roomNo) {
      const body = room.getInfo();
      ws.send(JSON.stringify({ head: "room info", body }));
      return;
    }
  }
}

function autoSort(ws) {
  for (const room of rooms) {
    if (room.roomNo == ws.user.roomNo) {
      room.autoSort(ws, sendByRoomNo);
      return;
    }
  }
}

function eat(ws) {
  for (const room of rooms) {
    if (room.roomNo == ws.user.roomNo) {
      room.eat(ws, sendByRoomNo);
      return;
    }
  }
}

function draw(ws) {
  for (const room of rooms) {
    if (room.roomNo == ws.user.roomNo) {
      room.draw(ws, sendByRoomNo);
      return;
    }
  }
}

function shoot(ws, index) {
  for (const room of rooms) {
    if (room.roomNo == ws.user.roomNo) {
      room.shoot(ws, index, sendByRoomNo);
      return;
    }
  }
}

function moveCard(ws, body) {
  for (const room of rooms) {
    if (room.roomNo == ws.user.roomNo) {
      room.moveCard(ws, body.from, body.to);
      return;
    }
  }
}

function connLost(ws) {
  console.log(`Connection lost`);
  if (!ws?.user) {
    console.log(`Websocket user information not found`);
    return;
  }
  for (const room of rooms) {
    for (const player of room.players) {
      if (player) {
        if (player.id == ws.user.id) {
          if (room.gameState == Room.GameStates.wait) {
            room.destroy();
          }
          player.connState = Player.ConnStates.lost;
          return;
        }
      }
    }
  }
  console.error(`Connection lost : player not exist!`);
}

function exit(ws) {
  for (const room of rooms) {
    if (room.roomNo == ws.user.roomNo) {
      room.exit(ws.user.id);
    }
  }
}

function ping(ws) {
  for (const room of rooms) {
    if (room.roomNo == ws.user.roomNo) {
      room.ping(ws.user.index);
    }
  }
}

// ----- Internal HTTP Server -----

internalServer.post("/new_user", (req, res) => {
  console.log(`New user request - `);
  console.log(req.body);
  if (!isActive) {
    console.log(`Game engine inactive`);
    res.json({
      status: "not active",
    });
    return;
  }
  const id = req.body.id;
  const balance = req.body.balance;
  const level = req.body.level;
  const info = req.body.info;

  const _level = levelConfig[level];
  if (_level.minAmount > balance) {
    console.error("Not enough balance to enter this level!");
    res.json({ status: "not enough balance" });
    return;
  }
  if (_level.maxAmount < balance) {
    console.error("Too much balance to enter this level!");
    res.json({ status: "too much balance" });
    return;
  }
  if (checkPlayerExist(id)) {
    console.error("Player already exist");
    res.json({ status: "player already exist" });
    return;
  }

  const player = new Player(id, balance, info);
  for (const room of rooms) {
    if (room.level != level) continue;
    if (room.gameState == Room.GameStates.destory) continue;
    const result = room.newPlayer(player);
    if (result) {
      console.log(`Room available for this level`);
      const passcode = makeid(10);
      const data = {
        id,
        index: result.index,
        roomNo: result.roomNo,
        passcode,
        time: Date.now(),
      };
      credentials.push(data);
      console.log(`Add to credentials & respond with passcode : ${passcode}`);
      res.json({ passcode, status: "ok" });
      return;
    }
  }

  // If no room is available
  console.log(`Room not available for this level`);
  const room = new Room(_level, level, gameConfig);
  const result = room.newPlayer(player);

  if (!result) {
    res.json({ status: "error" });
    return;
  }

  rooms.push(room);

  if (gameConfig.autoBot) {
    for (let i = 0; i < gameConfig.botPerRoom; i++) {
      const bot = newBot(level);
      if (bot) {
        room.newPlayer(bot);
      }
    }
  }

  const passcode = makeid(10);
  const data = {
    id,
    index: result.index,
    roomNo: result.roomNo,
    passcode,
    time: Date.now(),
  };
  credentials.push(data);
  console.log(`Add to credentials & respond with passcode : ${passcode}`);
  res.json({ passcode, status: "ok" });
});

internalServer.post("/new_private_room", (req, res) => {
  if (!isActive) {
    res.json({
      status: "not active",
    });
    return;
  }
  console.log(req.body);
  const id = req.body.id;
  const balance = req.body.balance;
  const level = req.body.level;
  const info = req.body.info;

  const _level = levelConfig[level];
  if (_level.minAmount > balance) {
    console.error("Not enough balance to enter this level!");
    res.json({ status: "not enough balance" });
    return;
  }
  if (_level.maxAmount < balance) {
    console.error("Too much balance to enter this level!");
    res.json({ status: "too much balance" });
    return;
  }
  if (checkPlayerExist(id)) {
    console.error("Player already exist");
    res.json({ status: "player already exist" });
    return;
  }

  const player = new Player(id, balance, info);
  const room = new Room(_level, level, gameConfig, true);
  const result = room.newPlayer(player);

  if (!result) {
    res.json({ status: "error" });
    return;
  }

  rooms.push(room);

  const passcode = makeid(10);
  const data = {
    id,
    index: result.index,
    roomNo: result.roomNo,
    passcode,
    time: Date.now(),
  };
  credentials.push(data);
  res.json({ passcode, status: "ok" });
});

internalServer.get("/get_config", (req, res) => {
  log(`Get config request`);
  gameConfig.isActive = isActive;
  res.send(JSON.stringify(gameConfig));
});

internalServer.post("/set_config", (req, res) => {
  log(`Set config - `);
  log(req.body);
  for (const key in gameConfig) {
    if (gameConfig.hasOwnProperty(key)) {
      if (req.body.hasOwnProperty(key)) {
        gameConfig[key] = req.body[key];
      }
    }
  }
  isActive = gameConfig?.isActive ?? true;
  for (const room of rooms) {
    room.setConfig(gameConfig);
  }
  fs.writeFileSync("config/game.json", JSON.stringify(gameConfig));
  res.send("ok");
});

function update() {
  for (const [i, credential] of credentials.entries()) {
    const deltaTime = Date.now() - credential.time;
    console.log(`Handshake wait time for ${credential.id} is ${deltaTime}`);
    if (deltaTime > 10000) {
      for (const room of rooms) {
        if (room.removePlayer(credential.id)) {
          console.log(`${credential.id} removed for no handshake!`);
          break;
        }
      }
      credentials.splice(i, 1);
    }
  }

  for (let i = 0; i < rooms.length; i++) {
    const room = rooms[i];
    if (room.gameState == Room.GameStates.destory) {
      rooms.splice(i, 1);
      continue;
    }
  }

  for (const room of rooms) {
    if (gameConfig.autoBot) {
      if (room.totalBot() < gameConfig.botPerRoom && room.isPrivate == false) {
        const bot = newBot(room.level);
        if (bot) {
          room.newPlayer(bot);
        }
      }
    }

    try {
      room.update(sendByRoomNo);
    } catch (err) {
      room.gameState == Room.GameStates.destory;
      log(err);
    }
  }
}

function checkPlayerExist(id) {
  for (const room of rooms) {
    for (const player of room.players) {
      if (player) {
        if (player.id == id) {
          return true;
        }
      }
    }
  }
  return false;
}

function newBot(level) {
  if (gameConfig.botPool.length > 0) {
    const id = "bot";
    const balance = Math.floor(
      levelConfig[level].minAmount * (Math.random() + 2)
    );
    if (botIndex >= gameConfig.botPool.length) {
      botIndex = 0;
    }
    const info = gameConfig.botPool[botIndex];
    botIndex++;
    const player = new Player(id, balance, info, true);
    return player;
  }

  console.log(`Not enough bot in pool!`);
  return null;
}

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

internalServer.listen(sysConfig.internalPort, () => {
  log(`Internal server is listening at PORT ${sysConfig.internalPort}`);
});

setInterval(update, 2000);
