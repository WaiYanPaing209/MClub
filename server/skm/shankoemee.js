/*
    levelConfig contains array of level information
    example - [ {dealerAmount : 1000, minBet : 100, maxAmount : 10000} ]
*/

const Room = require("./room");
const Player = require("./player");

const defaultConfig = {
  autoBot: true,
  botPerRoom: 2,
  botPool: [
    { nickname: "Mg Mg", profile: 1 },
    { nickname: "Min Min", profile: 2 },
    { nickname: "Thaw Thaw", profile: 3 },
    { nickname: "Kyaw Gyi", profile: 4 },
    { nickname: "Thar Wa", profile: 5 },
    { nickname: "Aye Aye", profile: 7 },
    { nickname: "Maw Maw", profile: 8 },
    { nickname: "Su Su", profile: 9 },
    { nickname: "Mi Sandy", profile: 10 },
    { nickname: "Ja Pu Ma", profile: 11 },
  ],
  room: null,
};

class ShanKoeMee {
  static BotMode = {
    sustain: 0,
    unfair: 1,
    burst: 2,
  };

  static CatchMode = {
    loserAtOnce: 0,
    oneByOne: 1,
    AllAtOne: 2,
  };

  static DealerMode = {
    normal: 0,
    fixedLimit: 1,
  };

  static DealerOrderMode = {
    seat: 0, // order by seat
    token: 1, // order by token that enter the room
  };

  constructor(totalPlayer, levelConfig, config = null) {
    this.totalPlayer = totalPlayer;
    this.levelConfig = levelConfig;
    this.botMode = ShanKoeMee.BotMode.sustain;
    this.isPause = false;
    this.rooms = [];
    this.botIndex = 0;
    this.setConfig(config);
    this.onTransferToGameRoom = (id, roomNo, amount) => {};
    this.onTransferFromGameRoom = (id, roomNo, amount) => {};
    this.onTransferToComission = (id, roomNo, amount, isDealer) => {};
    this.onTransferToBotProfit = (amount) => {};
    this.onGameStateChange = (room) => {};
    this.onCreateRoom = (room) => {};
    this.onPlayerRemove = (id) => {};
  }

  setConfig(config) {
    console.log(`Set config : ${config}`);
    this.autoBot = config?.autoBot ?? defaultConfig.autoBot;
    this.botPool = config?.botPool ?? defaultConfig.botPool;
    this.botPerRoom = config?.botPerRoom ?? defaultConfig.botPerRoom;
    this.roomConfig = config?.room;
    this.roomConfig.isActive = config?.isActive ?? true;

    if (this.rooms.length > 0) {
      for (const room of this.rooms) {
        room.setConfig(this.roomConfig);
      }
    }
  }

  on(event, callback) {
    if (event == "transferToGameRoom") {
      this.onTransferToGameRoom = callback;
    } else if (event == "transferFromGameRoom") {
      this.onTransferFromGameRoom = callback;
    } else if (event == "transferToComission") {
      this.onTransferToComission = callback;
    } else if (event == "gameStateChange") {
      this.onGameStateChange = callback;
    } else if (event == "createRoom") {
      this.onCreateRoom = callback;
    } else if (event == "playerRemove") {
      this.onPlayerRemove = callback;
    } else if (event == "transferToBotProfit") {
      this.onTransferToBotProfit = callback;
    }
  }

  roomInfo(roomNo) {
    for (const room of this.rooms) {
      if (room.roomNo == roomNo) {
        return room.getInfo();
      }
    }
    return null;
  }

  ping(roomNo, index) {
    for (const room of this.rooms) {
      if (room.roomNo == roomNo) {
        room.ping(index);
        return;
      }
    }
  }

  handshake(roomNo, index) {
    for (const room of this.rooms) {
      if (room.roomNo == roomNo) {
        room.players[index].connState = Player.ConnStates.active;
      }
    }
  }

  bet(id, amount) {
    for (const room of this.rooms) {
      for (const player of room.players) {
        if (player) {
          if (player.id == id) {
            return room.bet(id, amount);
          }
        }
      }
    }
    return false;
  }

  removePlayer(id) {
    for (const room of this.rooms) {
      if (room.removePlayer(id)) {
        console.log(`${id} removed for no handshake!`);
        break;
      }
    }
  }

  draw(id, isDraw) {
    for (const room of this.rooms) {
      for (const player of room.players) {
        if (player) {
          if (player.id == id) {
            return room.draw(id, isDraw);
          }
        }
      }
    }
    return false;
  }

  catch(index, roomNo) {
    for (const room of this.rooms) {
      if (room.roomNo == roomNo) {
        return room.catch(index);
      }
    }
    return false;
  }

  catchAllDraw(roomNo) {
    for (const room of this.rooms) {
      if (room.roomNo == roomNo) {
        room.catchAllDraw();
      }
    }
  }

  requestExit(id) {
    for (const room of this.rooms) {
      for (const player of room.players) {
        if (player) {
          if (player.id == id) {
            if (player.index == room.dealerIndex) {
              if (room.gameState == Room.GameStates.wait) {
                room.destroy();
                return "allow";
              }
              return "not allow";
            } else {
              if (room.gameState == Room.GameStates.wait) {
                room.destroy();
                return "allow";
              }
              player.connState = Player.ConnStates.exit;
              return "allow";
            }
          }
        }
      }
    }
    return "not exist";
  }

  exitCancel(id) {
    for (const room of this.rooms) {
      for (const player of room.players) {
        if (player) {
          if (player.id == id) {
            player.connState = Player.ConnStates.active;
            return "ok";
          }
        }
      }
    }
    return "not found";
  }

  connLost(id) {
    for (const room of this.rooms) {
      for (const player of room.players) {
        if (player) {
          if (player.id == id) {
            if (room.gameState == Room.GameStates.wait) {
              room.destroy();
            }
            player.connState = Player.ConnStates.lost;
            return "connstate updated";
          }
        }
      }
    }
    return "not exist";
  }

  rejoin(id) {
    for (const room of this.rooms) {
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

  newPlayer(id, balance, level, info) {
    if (this.levelConfig.length <= level) {
      console.error("Level not exist!");
      return;
    }

    const _level = this.levelConfig[level];
    if (_level.dealerAmount > balance) {
      console.error("Not enough balance to enter this level!");
      return { status: "not enough balance" };
    }

    if (_level.maxAmount < balance) {
      console.error("Too much balance to enter this level!");
      return { status: "too much balance" };
    }

    if (this.checkPlayerExist(id)) {
      console.error("Player already exist");
      return { status: "id already exist" };
    }

    const player = new Player(id, balance, info);
    for (const room of this.rooms) {
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
    const room = new Room(
      _level.dealerAmount,
      _level.minBet,
      this.totalPlayer,
      level,
      this.roomConfig
    );
    this.onCreateRoom(room);
    room.on("transferToGameRoom", this.onTransferToGameRoom);
    room.on("transferFromGameRoom", this.onTransferFromGameRoom);
    room.on("gameStateChange", this.onGameStateChange);
    room.on("playerRemove", this.onPlayerRemove);
    room.on("transferToComission", this.onTransferToComission);
    room.on("transferToBotProfit", this.onTransferToBotProfit);
    this.rooms.push(room);

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

  newPrivateRoom(id, balance, level, info) {
    if (this.levelConfig.length <= level) {
      console.error("Level not exist!");
      return;
    }

    const _level = this.levelConfig[level];
    if (_level.dealerAmount > balance) {
      console.error("Not enough balance to enter this level!");
      return { status: "not enough balance" };
    }

    if (_level.maxAmount < balance) {
      console.error("Too much balance to enter this level!");
      return { status: "too much balance" };
    }

    if (this.checkPlayerExist(id)) {
      console.error("Player already exist");
      return { status: "id already exist" };
    }

    const player = new Player(id, balance, info);

    const room = new Room(
      _level.dealerAmount,
      _level.minBet,
      this.totalPlayer,
      level,
      this.roomConfig,
      true
    );
    this.onCreateRoom(room);
    room.on("transferToGameRoom", this.onTransferToGameRoom);
    room.on("transferFromGameRoom", this.onTransferFromGameRoom);
    room.on("gameStateChange", this.onGameStateChange);
    room.on("playerRemove", this.onPlayerRemove);
    room.on("transferToComission", this.onTransferToComission);
    room.on("transferToBotProfit", this.onTransferToBotProfit);
    this.rooms.push(room);
    const result = room.newPlayer(player);

    result.status = "ok";
    return result;
  }

  joinPrivateRoom(id, balance, info, roomNo, roomCode) {
    let isCredentialCorrect = false;
    let selectedRoom = null;
    for (const room of this.rooms) {
      if (room.roomNo == roomNo && room.roomCode == roomCode) {
        isCredentialCorrect = true;
        selectedRoom = room;
      }
    }
    if (!isCredentialCorrect) {
      return { status: "credential incorrect" };
    }

    const level = selectedRoom.level;

    if (this.levelConfig.length <= level) {
      console.error("Level not exist!");
      return;
    }

    const _level = this.levelConfig[level];
    if (_level.dealerAmount > balance) {
      console.error("Not enough balance to enter this level!");
      return { status: "not enough balance" };
    }

    if (_level.maxAmount < balance) {
      console.error("Too much balance to enter this level!");
      return { status: "too much balance" };
    }

    if (this.checkPlayerExist(id)) {
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

  newBot(level) {
    if (this.botPool.length > 0) {
      const id = "bot";
      const balance = Math.floor(
        this.levelConfig[level].dealerAmount * (Math.random() + 2)
      );
      if (this.botIndex >= this.botPool.length) {
        this.botIndex = 0;
      }
      const info = this.botPool[this.botIndex];
      const player = new Player(id, balance, info, true);

      this.botIndex++;
      return player;
    }

    console.log(`Not enough bot in pool!`);
    return null;
  }

  setBot(bots) {
    this.botPool = bots;
  }

  checkPlayerExist(id) {
    for (const room of this.rooms) {
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

  pause() {
    this.isPause = true;
  }

  resume() {
    this.isPause = false;
  }

  update() {
    if (this.isPause) {
      return;
    }

    for (let i = 0; i < this.rooms.length; i++) {
      const room = this.rooms[i];
      if (room.gameState == Room.GameStates.destory) {
        console.log(`Room No ${room.roomNo} destroyed!`);
        this.rooms.splice(i, 1);
        continue;
      }
    }

    for (const room of this.rooms) {
      if (this.autoBot) {
        if (room.totalBot() < this.botPerRoom && room.isPrivate == false) {
          const bot = this.newBot(room.level);
          if (bot) {
            room.newPlayer(bot);
          }
        }
      }

      room.update();
    }
  }
}

module.exports = ShanKoeMee;
