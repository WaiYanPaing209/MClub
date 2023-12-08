const express = require("express");
const fs = require("fs");
const http = require("http");
const WebSocket = require("ws");
const log = require("./log");
const ShweShan = require("./shweshan");
const Room = require("./room");

const app = express();
app.use(express.json());

const sysConfig = JSON.parse(fs.readFileSync("config/system.json"));

const levelConfig = JSON.parse(fs.readFileSync("config/level.json"));

let gameConfig = JSON.parse(fs.readFileSync("config/game.json"));

const game = new ShweShan(levelConfig, gameConfig);
let credentials = [];
let isActive = true;

game.on("transferBalance", async (from, to, amount) => {
  const data = {
    game: "shweshan",
    from,
    to,
    amount,
  };

  const respond = await fetch(sysConfig.accountUrl + "transfer_between_user", {
    method: "POST",
    body: JSON.stringify(data),
    headers: {
      "Content-type": "application/json; charset=UTF-8",
    },
  }).catch((err) => {
    console.log(`Account api error on - transfer between user`);
  });

  if (respond?.status == "ok") {
    console.log(`Transfer balance from ${from} to ${to} - amount ${amount}`);
  }
});

game.on("transferToCommission", async (id, roomNo, amount) => {
  const data = { id, amount };

  const respond = await fetch(sysConfig.accountUrl + "transfer_to_commission", {
    method: "POST",
    body: JSON.stringify(data),
    headers: {
      "Content-type": "application/json; charset=UTF-8",
    },
  }).catch((err) => {
    console.log(`Account api error on transfer to commission`);
  });

  if (respond?.status == "ok") {
    console.log(
      `Transfer to commission Room No ${roomNo} to player ${id} - amount ${amount}`
    );
  }
});

game.on("createRoom", (room) => {
  console.log(`Room created : RoomNo ${room.roomNo}`);
});

game.on("gameStateChange", (room) => {
  if (room.gameState == Room.GameStates.end) {
    // To implement
  }
});

game.on("playerRemove", async (id) => {
  const data = { game: "BuGyee", id };

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
});

game.on("transferToBotProfit", async (amount) => {
  const respond = await fetch(sysConfig.accountUrl + "transfer_to_bot_profit", {
    method: "POST",
    body: JSON.stringify({ amount }),
    headers: {
      "Content-type": "application/json; charset=UTF-8",
    },
  }).catch((err) => {
    console.log(`Account api error!`);
  });

  if (respond?.status == "ok") {
    console.log(`Transfer to bot profit - amount ${amount}`);
  }
});

// ----- HTTP Server -----

var server = http.createServer(function (request, response) {
  response.end("ShweShan game server is running!");
});
server.listen(sysConfig.wsPort, function () {
  log(`WebSocket server listening at port ${sysConfig.wsPort}`);
});

// ----- WS Server -----

const wss = new WebSocket.Server({ server });

wss.on("listening", () => {
  log(`WebSocket server listening at port ${sysConfig.wsPort}`);
  setInterval(async () => {
    updateGame(wss);
  }, 2000);
});

wss.on("connection", (ws) => {
  console.log(`Client connected!`);

  ws.on("message", async (data) => {
    console.log(`From Client : ${data}`);
    const json = JSON.parse(data);

    switch (json.head) {
      case "room info":
        console.log(`Room info request`);
        break;
      case "handshake":
        handshake(json.body, ws);
        console.log(ws.user);
        break;
      case "reorder":
        reorder(json.body, ws);
        break;
      case "giveup":
        giveUp(ws);
        break;
      case "exit":
        game.requestExit(ws.user.id);
        break;
      case "emoji":
        emoji(ws, wss, json.body.emoji, json.body.senderIndex);
        break;
      case "message":
        message(ws, wss, json.body.message, json.body.senderIndex);
        break;
      case "ping":
        ping(ws);
        break;
    }
  });

  ws.on("close", () => {
    game.connLost(ws.user.id);
  });

  ws.on("error", () => {
    game.connLost(ws.user.id);
  });
});

function sendByRoomNo(roomNo, respondObj, wss) {
  for (const ws of wss.clients) {
    if (ws.user.roomNo == roomNo) {
      ws.send(JSON.stringify(respondObj));
    }
  }
}

function ping(ws) {
  game.ping(ws.user.roomNo, ws.user.index);
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
  sendByRoomNo(roomNo, data, wss);
}

function updateGame(wss) {
  game.update();

  for (const client of wss.clients) {
    if (!client.user) continue;
    const roomInfo = game.roomInfo(client.user.roomNo);
    const data = {
      head: "room info",
      body: roomInfo,
    };
    client.send(JSON.stringify(data));
  }
}

function handshake(body, ws) {
  const id = body.id;
  const passcode = body.passcode;
  for (const credential of credentials) {
    if (id == credential.id && passcode == credential.passcode) {
      console.log(`Credential found`);
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
      return;
    }
  }
}

function bet(amount, ws) {
  game.bet(ws.user.index, ws.user.roomNo, amount);
}

function reorder(cards, ws) {
  game.reorder(cards, ws.user.roomNo, ws.user.index);
}

function giveUp(ws) {
  console.log(
    `Give Up request from room:${ws.user.roomNo}, index:${ws.user.index}`
  );
  game.giveUp(ws.user.roomNo, ws.user.index);
}

// ----- Internal HTTP Server -----

app.post("/new_user", (req, res) => {
  console.log(req.body);
  if (!isActive) {
    console.log(`Server inactive!`);
    res.json({
      status: "not active",
    });
    return;
  }
  const id = req.body.id;
  const balance = req.body.balance;
  const level = req.body.level;
  const info = req.body.info;

  const respond = game.newPlayer(id, balance, level, info);
  if (respond.status == "ok") {
    const passcode = makeid(10);
    const data = {
      id,
      index: respond.index,
      roomNo: respond.roomNo,
      passcode,
    };
    credentials.push(data);
    res.json({ passcode, status: "ok" });
  } else {
    res.json(respond);
  }
});

app.post("/new_private_room", (req, res) => {
  console.log(req.body);
  if (!isActive) {
    console.log(`Server inactive!`);
    res.json({
      status: "not active",
    });
    return;
  }
  const id = req.body.id;
  const balance = req.body.balance;
  const level = req.body.level;
  const info = req.body.info;

  const respond = game.newPrivateRoom(id, balance, level, info);
  if (respond.status == "ok") {
    const passcode = makeid(10);
    const data = {
      id,
      index: respond.index,
      roomNo: respond.roomNo,
      passcode,
    };
    credentials.push(data);
    res.json({ passcode, status: "ok" });
  } else {
    res.json(respond);
  }
});

app.post("/join_private_room", (req, res) => {
  console.log(req.body);
  if (!isActive) {
    console.log(`Server inactive!`);
    res.json({
      status: "not active",
    });
    return;
  }
  const id = req.body.id;
  const balance = req.body.balance;
  const info = req.body.info;
  const roomNo = req.body.roomNo;
  const roomCode = req.body.roomCode;

  const respond = game.joinPrivateRoom(id, balance, info, roomNo, roomCode);
  if (respond.status == "ok") {
    const passcode = makeid(10);
    const data = {
      id,
      index: respond.index,
      roomNo: respond.roomNo,
      passcode,
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
  log(`Set config`);
  gameConfig = req.body;
  isActive = gameConfig.isActive;
  game.setConfig(gameConfig);
  fs.writeFileSync("config/game.json", JSON.stringify(gameConfig));
  res.send("ok");
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
