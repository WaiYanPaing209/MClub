/*
    levelConfig contains array of level information
    example - [ {betAmount : 100, minAmount:1000, maxAmount:10000} ]
*/

const Room = require("./room");
const Player = require("./player");

const defaultConfig = {
  autoBot: true,
  botPerRoom: 2,
  totalPlayer: 5,
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

class BuGyee {
  static BotMode = {
    sustain: 0,
    unfair: 1,
    burst: 2,
  };

  constructor(levelConfig, config = null) {
    this.levelConfig = levelConfig;
    this.botMode = BuGyee.BotMode.sustain;
    this.botIndex = 0;
    this.rooms = [];
    this.setConfig(config);
    this.onTransferBalance = (from, to, amount) => {
      console.warn("Transfer balance not implement yet!");
    };
    this.onTransferToComission = (id, roomNo, amount, isDealer) => {
      console.warn("Transfer to commission not implement yet!");
    };
    this.onGameStateChange = (room) => {
      console.warn("Game state change not implement yet!");
    };
    this.onCreateRoom = (room) => {
      console.warn("Create room not implement yet!");
    };
    this.onPlayerRemove = (id) => {
      console.warn("Player remove not implement yet!");
    };
    this.onTransferToBotProfit = (amount) => {
      console.warn("Transfer to bot not implement yet!");
    };

    this.onRefillBot = (nickname, profile) => {
      for (const bot in this.botPool) {
        if (bot.nickname == nickname) {
          return;
        }
      }
      this.botPool.push({ nickname, profile });
      console.log(`Refill to bot pool : ${nickname}`);
    };
  }

  setConfig(config) {
    this.totalPlayer = config?.totalPlayer ?? defaultConfig.totalPlayer;
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
    if (event == "transferBalance") {
      this.onTransferBalance = callback;
    } else if (event == "transferToCommission") {
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

  requestExit(id) {
    for (const room of this.rooms) {
      for (const player of room.players) {
        if (player) {
          if (player.id == id) {
            player.connState = Player.ConnStates.exit;
            return true;
          }
        }
      }
    }
    return false;
  }

  bet(playerIndex, roomNo, amount) {
    for (const room of this.rooms) {
      if (room.roomNo == roomNo) {
        room.bet(playerIndex, amount);
      }
    }
  }

  newPlayer(id, balance, level, info) {
    if (this.levelConfig.length <= level) {
      console.error("Level not exist!");
      return;
    }

    const _level = this.levelConfig[level];
    if (_level.minAmount > balance) {
      console.error("Not enough balance to enter this level!");
      return { status: "not enough balance" };
    }

    if (_level.maxAmount < balance) {
      console.error("Too much balance to enter this level!");
      return { status: "too much balance" };
    }

    if (this.checkPlayerExist(id)) {
      console.error("Player already exist");
      return { status: "player already exist" };
    }

    const player = new Player(id, balance, info);
    for (const room of this.rooms) {
      if (room.level != level) continue;
      if (room.gameState == Room.GameStates.destory) continue;
      const result = room.newPlayer(player);
      if (result) {
        result.status = "ok";
        return result;
      }
    }

    // If no room is available
    const room = new Room(_level.minBet, this.totalPlayer, level, this.roomConfig);
    this.onCreateRoom(room);
    room.on("transferBalance", this.onTransferBalance);
    room.on("gameStateChange", this.onGameStateChange);
    room.on("playerRemove", this.onPlayerRemove);
    room.on("transferToComission", this.onTransferToComission);
    room.on("transferToBotProfit", this.onTransferToBotProfit);
    room.on("refillBot", this.onRefillBot);
    this.rooms.push(room);
    const result = room.newPlayer(player);
    result.status = "ok";

    // Add Bot
    if (this.autoBot) {
      for (let i = 0; i < this.botPerRoom; i++) {
        const bot = this.newBot(level);
        if (bot) {
          room.newPlayer(bot);
        }
      }
    }

    return result;
  }

  newPrivateRoom(id, balance, level, info) {
    if (this.levelConfig.length <= level) {
      console.error("Level not exist!");
      return;
    }

    const _level = this.levelConfig[level];
    if (_level.minAmount > balance) {
      console.error("Not enough balance to enter this level!");
      return { status: "not enough balance" };
    }

    if (_level.maxAmount < balance) {
      console.error("Too much balance to enter this level!");
      return { status: "too much balance" };
    }

    if (this.checkPlayerExist(id)) {
      console.error("Player already exist");
      return { status: "player already exist" };
    }

    const player = new Player(id, balance, info);

    const room = new Room(_level.minBet, this.totalPlayer, level, this.roomConfig, true);
    this.onCreateRoom(room);
    room.on("transferBalance", this.onTransferBalance);
    room.on("gameStateChange", this.onGameStateChange);
    room.on("playerRemove", this.onPlayerRemove);
    room.on("transferToComission", this.onTransferToComission);
    room.on("transferToBotProfit", this.onTransferToBotProfit);
    room.on("refillBot", this.onRefillBot);
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
    if (_level.minAmount > balance) {
      console.error("Not enough balance to enter this level!");
      return { status: "not enough balance" };
    }

    if (_level.maxAmount < balance) {
      console.error("Too much balance to enter this level!");
      return { status: "too much balance" };
    }

    if (this.checkPlayerExist(id)) {
      console.error("Player already exist");
      return { status: "player already exist" };
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
      const balance = Math.floor(this.levelConfig[level].minAmount * (Math.random() + 2));
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

  update() {
    for (let i = 0; i < this.rooms.length; i++) {
      const room = this.rooms[i];
      if (room.gameState == Room.GameStates.destory) {
        for (const player of room.players) {
          if (player?.isBot) {
            this.botPool.push({
              nickname: player.info.nickname,
              profile: player.info.profile,
            });
          }
        }
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

  // Request from client to reorder cards
  reorder(cards, roomNo, index) {
    for (const room of this.rooms) {
      if (room.roomNo == roomNo) {
        room.reorder(cards, index);
        return;
      }
    }
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
}

module.exports = BuGyee;
