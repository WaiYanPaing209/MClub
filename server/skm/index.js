const fs = require("fs");
const express = require("express");
const util = require("util");
const http = require("http");
const WebSocket = require("ws");
const log = require("./log");
const Room = require("./room");
const Player = require("./player");

const BotMode = {
  sustain: 0,
  unfair: 1,
  burst: 2,
};

const CatchMode = {
  loserAtOnce: 0,
  oneByOne: 1,
  AllAtOne: 2,
};

const DealerMode = {
  normal: 0,
  fixedLimit: 1,
};

const DealerOrderMode = {
  seat: 0, // order by seat
  token: 1, // order by token that enter the room
};

const CredentialMode = {
  temporary: 0,
  permanent: 1,
};

const sysConfig = JSON.parse(fs.readFileSync("config/system.json"));

const levelConfig = JSON.parse(fs.readFileSync("config/level.json"));

let gameConfig = JSON.parse(fs.readFileSync("config/game.json"));

let credentials = [];
let isActive = true;
let isPause = false;
let botIndex = 0;

// Game Variable
let rooms = [];

async function logCreateRoom(room) {
  const data = {
    game: "shankoemee",
    roomNo: room.roomNo,
  };

  const respond = await fetch(sysConfig.accountUrl + "create_room", {
    method: "POST",
    body: JSON.stringify(data),
    headers: {
      "Content-type": "application/json; charset=UTF-8",
    },
  }).catch((err) => {
    console.log(`Account api error!`);
  });

  if (respond?.status == "ok") {
    console.log(`ShanKoeMee new game room created - ${room.roomNo} `);
  }
}

// ----- HTTP Server -----

var server = http.createServer(function (request, response) {
  response.end("ShanKoeMee game server is running!");
});

server.listen(sysConfig.wsPort, function () {
  log(`WebSocket server listening at port ${sysConfig.wsPort}`);
});

// ----- WS Server -----

const wss = new WebSocket.Server({ server });

wss.on("listening", () => {
  log(`ShanKoeMee ws server listening at port ${sysConfig.wsPort}`);
  setInterval(async () => {
    update(wss);
  }, 2000);
});

wss.on("connection", (ws) => {
  console.log(`Client connected!`);

  ws.on("message", async (data) => {
    console.log(`From Client : ${data}`);
    const json = JSON.parse(data);
    const body = json.body;
    switch (json.head) {
      case "handshake":
        handshake(json.body, ws);
        console.log(ws.user);
        break;
      case "room info":
        roomInfo(ws);
        break;
      case "exit":
        requestExit(ws);
        break;
      case "exit cancel":
        exitCancel(ws);
        break;
      case "bet":
        bet(ws, body.amount);
        break;
      case "draw":
        draw(ws, body.isDraw);
        break;
      case "catch":
        catchPlayer(ws, body.index);
        break;
      case "catch all draw":
        catchAllDraw(ws);
        break;
      case "emoji":
        emoji(ws, wss, body.emoji, body.senderIndex);
        break;
      case "message":
        message(ws, wss, body.message, body.senderIndex);
        break;
      case "anim-chat":
        animChat(ws, wss, json);
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

function handshake(body, ws) {
  if (!body?.id || !body?.passcode) {
    console.log(`Handshake credential invalid!`);
    return;
  }
  console.log(`Handshake from ${body.id}`);
  const id = body.id;
  const passcode = body.passcode;

  if (gameConfig.credentialMode == CredentialMode.permanent) {
    for (const room of rooms) {
      for (const player of room.players) {
        if (!player) continue;
        if (player.id == id && player.passcode == passcode) {
          console.log(`Credential found!`);
          player.connState = Player.ConnStates.active;
          ws.user = {
            id,
            roomNo: room.roomNo,
            index: player.index,
          };
          const data = {
            head: "handshake",
            body: {
              status: "ok",
              index: player.index,
            },
          };
          ws.send(JSON.stringify(data));
          return;
        }
      }
    }
  } else {
    for (const [i, credential] of credentials.entries()) {
      console.log(`Check credential : ${util.inspect(credential)}`);
      if (id == credential.id && passcode == credential.passcode) {
        console.log(`Credential found`);
        for (const room of rooms) {
          if (room.roomNo == credential.roomNo) {
            room.players[credential.index].connState = Player.ConnStates.active;
          }
        }
        ws.user = {
          id,
          roomNo: credential.roomNo,
          index: credential.index,
        };
        const data = {
          head: "handshake",
          body: {
            status: "ok",
            index: credential.index,
          },
        };
        ws.send(JSON.stringify(data));
        credentials.splice(i, 1);
        return;
      }
    }
    console.log(`Credential not found!`);
  }
}

function sendByRoomNo(roomNo, respondObj, wss) {
  console.log(`Send By Room : ${util.inspect(respondObj)}`);
  for (const ws of wss.clients) {
    if (ws.user.roomNo == roomNo) {
      ws.send(JSON.stringify(respondObj));
    }
  }
}

function update(wss) {
  for (const [i, credential] of credentials.entries()) {
    const deltaTime = Date.now() - credential.time;
    console.log(`Handshake wait time for ${credential.id} is ${deltaTime}`);
    if (deltaTime > 120000) {
      removePlayer(credential.id);
      credentials.splice(i, 1);
    }
  }

  if (isPause) {
    return;
  }

  for (let i = 0; i < rooms.length; i++) {
    const room = rooms[i];
    if (room.gameState == Room.GameStates.destory) {
      console.log(`Room No ${room.roomNo} destroyed!`);
      rooms.splice(i, 1);
      continue;
    }
  }

  for (const room of rooms) {
    if (gameConfig.autoBot) {
      if (!room.isPrivate) {
        if (gameConfig.autoBotReduce) {
          if (room.totalAllPlayer() < gameConfig.botPerRoom + 1) {
            const bot = newBot(room.level);
            if (bot) {
              room.newPlayer(bot);
            }
          } else if (room.totalAllPlayer() > gameConfig.botPerRoom + 1) {
            room.reduceBot();
          }
        } else {
          if (room.totalBot() < gameConfig.botPerRoom) {
            const bot = newBot(room.level);
            if (bot) {
              room.newPlayer(bot);
            }
          }
        }
      }
    }
    room.update();
  }

  for (const ws of wss.clients) {
    roomInfo(ws);
  }
}

function newBot(level) {
  if (gameConfig.botPool.length > 0) {
    const id = "bot";
    const balance = Math.floor(
      levelConfig[level].dealerAmount * (Math.random() + 2)
    );
    if (botIndex >= gameConfig.botPool.length) {
      botIndex = 0;
    }
    const info = gameConfig.botPool[botIndex];
    const player = new Player(id, balance, info, true);

    botIndex++;
    return player;
  }

  console.log(`Not enough bot in pool!`);
  return null;
}

function removePlayer(id) {
  for (const room of rooms) {
    if (room.removePlayer(id)) {
      console.log(`${id} removed for no handshake!`);
      break;
    }
  }
}

function catchPlayer(ws, index) {
  console.log(`Catch index : ${index}`);
  const roomNo = ws?.user?.roomNo;
  if (roomNo) {
    for (const room of rooms) {
      if (room.roomNo == roomNo) {
        return room.catch(index);
      }
    }
  }
  console.error(`Cannot find roomNo in Ws`);
  return false;
}

function catchAllDraw(ws) {
  const roomNo = ws?.user?.roomNo;
  if (roomNo) {
    for (const room of rooms) {
      if (room.roomNo == roomNo) {
        room.catchAllDraw();
        return true;
      }
    }
  }
  console.error(`Cannot find roomNo in Ws`);
  return false;
}

function emoji(ws, wss, emoji, senderIndex) {
  const roomNo = ws.user.roomNo;
  const msg = {
    head: "emoji",
    body: {
      senderIndex,
      emoji,
    },
  };
  console.log(`Msg : ${util.inspect(msg)}`);
  sendByRoomNo(roomNo, msg, wss);
}

function message(ws, wss, msg, senderIndex) {
  const roomNo = ws.user.roomNo;
  const data = {
    head: "message",
    body: {
      senderIndex,
      message: msg,
    },
  };
  console.log(`Msg : ${util.inspect(msg)}`);
  sendByRoomNo(roomNo, data, wss);
}

function animChat(ws, wss, json) {
  sendByRoomNo(ws.user.roomNo, json, wss);
}

function checkPlayerExist(id) {
  for (const room of rooms) {
    for (const player of room.players) {
      if (!player) continue;
      if (player.id == id) {
        return true;
      }
    }
  }
  return false;
}

function rejoin(id) {
  for (const room of rooms) {
    for (const player of room.players) {
      if (player) {
        if (player.id == id) {
          player.connState = Player.ConnStates.active;
          return { index: player.index, roomNo: room.roomNo };
        }
      }
    }
  }
  return null;
}

function draw(ws, isDraw) {
  for (const room of rooms) {
    for (const player of room.players) {
      if (player) {
        if (player.id == ws.user.id) {
          return room.draw(ws.user.id, isDraw);
        }
      }
    }
  }
  return false;
}

function bet(ws, amount) {
  for (const room of rooms) {
    for (const player of room.players) {
      if (player) {
        if (player.id == ws.user.id) {
          return room.bet(ws.user.id, amount);
        }
      }
    }
  }
  return false;
}

function ping(ws) {
  for (const room of rooms) {
    if (room.roomNo == ws.user.roomNo) {
      room.ping(ws.user.index);
      return;
    }
  }
}

function roomInfo(ws) {
  if (!ws?.user) return;
  for (const room of rooms) {
    if (room.roomNo == ws.user.roomNo) {
      const room_info = room.getInfo();
      const respond = {
        head: "room info",
        body: {
          room: room_info,
        },
      };
      ws.send(JSON.stringify(respond));
      return;
    }
  }
}

function requestExit(ws) {
  for (const room of rooms) {
    for (const player of room.players) {
      if (player) {
        if (player.id == ws.user.id) {
          if (player.index == room.dealerIndex) {
            if (room.gameState == Room.GameStates.wait) {
              room.destroy();
              const respond = {
                head: "exit",
                body: {
                  status: "allow",
                },
              };
              ws.send(JSON.stringify(respond));
              return;
            }
            const respond = {
              head: "exit",
              body: {
                status: "not allow",
              },
            };
            ws.send(JSON.stringify(respond));
            return;
          } else {
            if (room.gameState == Room.GameStates.wait) {
              room.destroy();
              const respond = {
                head: "exit",
                body: {
                  status: "allow",
                },
              };
              ws.send(JSON.stringify(respond));
              return;
            }
            player.connState = Player.ConnStates.exit;
            const respond = {
              head: "exit",
              body: {
                status: "allow",
              },
            };
            ws.send(JSON.stringify(respond));
            return;
          }
        }
      }
    }
  }
}

function exitCancel(ws) {
  for (const room of rooms) {
    for (const player of room.players) {
      if (player) {
        if (player.id == ws.user.id) {
          player.connState = Player.ConnStates.active;
          const respond = {
            head: "exit cancel",
            body: {
              status: "ok",
            },
          };
          ws.send(JSON.stringify(respond));
          return;
        }
      }
    }
  }

  const respond = {
    head: "exit cancel",
    body: {
      status: "not found",
    },
  };
  ws.send(JSON.stringify(respond));
}

function connLost(ws) {
  if (ws?.user?.id) {
    for (const room of rooms) {
      for (const player of room.players) {
        if (player) {
          if (player.id == ws.user.id) {
            if (room.gameState == Room.GameStates.wait) {
              room.destroy();
            }
            player.connState = Player.ConnStates.lost;
          }
        }
      }
    }
  }
}

function newPlayer(id, balance, level, info, passcode = null) {
  if (levelConfig.length <= level) {
    console.error("Level not exist!");
    return;
  }

  const _level = levelConfig[level];
  if (_level.dealerAmount > balance) {
    console.error("Not enough balance to enter this level!");
    return { status: "not enough balance" };
  }

  if (_level.maxAmount < balance) {
    console.error("Too much balance to enter this level!");
    return { status: "too much balance" };
  }

  if (checkPlayerExist(id)) {
    console.error("Player already exist");
    return { status: "id already exist" };
  }

  const player = new Player(id, balance, info, false, passcode);
  for (const room of rooms) {
    if (room.level != level) continue;
    if (room.gameState == Room.GameStates.destory) continue;
    if (room.isPrivate) continue;
    const result = room.newPlayer(player);
    if (result) {
      result.status = "ok";
      return result;
    }
  }

  // If no room is available
  const room = new Room(_level.dealerAmount, _level.minBet, gameConfig, level);
  logCreateRoom(room);
  rooms.push(room);

  // Add Player
  const result = room.newPlayer(player);

  // Add Bot
  if (this.autoBot) {
    for (let i = 0; i < this.botPerRoom; i++) {
      const bot = this.newBot(level);
      if (bot) room.newPlayer(bot);
    }
  }

  result.status = "ok";
  return result;
}

function newPrivateRoom(id, balance, level, info) {
  if (levelConfig.length <= level) {
    console.error("Level not exist!");
    return;
  }

  const _level = levelConfig[level];
  if (_level.dealerAmount > balance) {
    console.error("Not enough balance to enter this level!");
    return { status: "not enough balance" };
  }

  if (_level.maxAmount < balance) {
    console.error("Too much balance to enter this level!");
    return { status: "too much balance" };
  }

  if (checkPlayerExist(id)) {
    console.error("Player already exist");
    return { status: "id already exist" };
  }

  const player = new Player(id, balance, info);

  const room = new Room(
    _level.dealerAmount,
    _level.minBet,
    gameConfig,
    level,
    true
  );
  logCreateRoom(room);
  rooms.push(room);
  const result = room.newPlayer(player);

  result.status = "ok";
  return result;
}

function joinPrivateRoom(id, balance, info, roomNo, roomCode) {
  let isCredentialCorrect = false;
  let selectedRoom = null;
  for (const room of rooms) {
    if (room.roomNo == roomNo && room.roomCode == roomCode) {
      isCredentialCorrect = true;
      selectedRoom = room;
    }
  }
  if (!isCredentialCorrect) {
    return { status: "credential incorrect" };
  }

  const level = selectedRoom.level;

  if (levelConfig.length <= level) {
    console.error("Level not exist!");
    return;
  }

  const _level = levelConfig[level];
  if (_level.dealerAmount > balance) {
    console.error("Not enough balance to enter this level!");
    return { status: "not enough balance" };
  }

  if (_level.maxAmount < balance) {
    console.error("Too much balance to enter this level!");
    return { status: "too much balance" };
  }

  if (checkPlayerExist(id)) {
    console.error("Player already exist");
    return { status: "id already exist" };
  }

  const player = new Player(id, balance, info);
  const result = selectedRoom.newPlayer(player);
  if (result) {
    result.status = "ok";
    return result;
  } else {
    return { status: "room full" };
  }
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

// ----- Internal HTTP Server -----

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.end(`Internal server is listening at PORT ${sysConfig.httpPort}`);
});

app.post("/new_user", (req, res) => {
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
  const passcode = makeid(10);
  const respond = newPlayer(id, balance, level, info, passcode);
  if (respond.status == "ok") {
    if (gameConfig.credentialMode == CredentialMode.temporary) {
      const data = {
        id,
        index: respond.index,
        roomNo: respond.roomNo,
        passcode,
        time: Date.now(),
      };
      credentials.push(data);
      console.log(`Credentials : ${util.inspect(credentials)}`);
    }
    res.json({
      index: respond.index,
      roomNo: respond.roomNo,
      passcode,
      status: "ok",
    });
  } else {
    res.json(respond);
  }
});

app.post("/rejoin", (req, res) => {
  if (!isActive) {
    res.json({
      status: "not active",
    });
    return;
  }
  console.log(req.body);
  const id = req.body.id;
  for (const room of rooms) {
    for (const player of room.players) {
      if (player) {
        if (player.id == id) {
          player.connState = Player.ConnStates.active;
          const passcode = makeid(10);
          const data = {
            id,
            index: player.index,
            roomNo: room.roomNo,
            passcode,
            time: Date.now(),
          };
          credentials.push(data);
          console.log(`Credentials : ${util.inspect(credentials)}`);
          res.json({ passcode, status: "ok" });
          return;
        }
      }
    }
  }
  // Player not exists
  res.json({ status: "not exists" });
});

app.post("/new_private_room", (req, res) => {
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

  const respond = newPrivateRoom(id, balance, level, info);
  if (respond.status == "ok") {
    const passcode = makeid(10);
    const data = {
      id,
      index: respond.index,
      roomNo: respond.roomNo,
      passcode,
      time: Date.now(),
    };
    credentials.push(data);
    res.json({ passcode, status: "ok" });
  } else {
    res.json(respond);
  }
});

app.post("/join_private_room", (req, res) => {
  if (!isActive) {
    res.json({
      status: "not active",
    });
    return;
  }
  console.log(req.body);
  const id = req.body.id;
  const balance = req.body.balance;
  const info = req.body.info;
  const roomNo = req.body.roomNo;
  const roomCode = req.body.roomCode;

  const respond = joinPrivateRoom(id, balance, info, roomNo, roomCode);
  if (respond.status == "ok") {
    const passcode = makeid(10);
    const data = {
      id,
      index: respond.index,
      roomNo: respond.roomNo,
      passcode,
      time: Date.now(),
    };
    credentials.push(data);
    res.json({ passcode, status: "ok" });
  } else {
    res.json(respond);
  }
});

app.get("/get_config", (req, res) => {
  log(`Get config request`);
  gameConfig.isActive = isActive;
  res.send(JSON.stringify(gameConfig));
});

app.post("/set_config", (req, res) => {
  log(`Set config : ${req.body}`);
  for (const key in gameConfig) {
    if (gameConfig.hasOwnProperty(key)) {
      if (req.body.hasOwnProperty(key)) {
        gameConfig[key] = req.body[key];
      }
    }
  }
  if (rooms.length > 0) {
    for (const room of rooms) {
      room.setConfig(gameConfig);
    }
  }
  fs.writeFileSync("config/game.json", JSON.stringify(gameConfig));
  res.send("ok");
});

app.post("/send_all", (req, res) => {
  console.log(`Send all request from account server`);
  console.log(req.body);
  for (const ws of wss.clients) {
    ws.send(JSON.stringify(req.body));
  }
});

app.get("/pause", (req, res) => (isPause = true));

app.get("/resume", (req, res) => (isPause = false));

app.listen(sysConfig.httpPort, () => {
  log(`Internal server is listening at PORT ${sysConfig.httpPort}`);
});
