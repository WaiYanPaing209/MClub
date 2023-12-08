const fs = require("fs");
const util = require("util");
const { BotMode } = require("./bugyee");
const Card = require("./card");
const Player = require("./player");

const sysConfig = JSON.parse(fs.readFileSync("config/system.json"));

const levelConfig = JSON.parse(fs.readFileSync("config/level.json"));

const c0 = new Card(0, "K");
const c1 = new Card(0, 6);
const c2 = new Card(0, "Q");
const c3 = new Card(1, "K");
const c4 = new Card(1, "J");
const c5 = new Card(0, "K");
const c6 = new Card(2, 6);
const c7 = new Card(0, 1);
const c8 = new Card(0, 4);
const c9 = new Card(0, 5);

// Debug
const isDebug = false;
const isDebugCard = false;
let debugCardIndex = 0;
const debugCardArray = [
  [c5, c6, c7, c8, c9],
  [c0, c1, c2, c3, c4],
  [c3, c4, c5, c6, c7],
];

// Config
const file_room_no = "./tmp/roomNo.txt";
const file_room_log = "./tmp/rooms/";

const Comparison = {
  EQUAL: 0,
  WIN: 1,
  LOSE: -1,
};

const DefaultConfig = {
  playerCommission: 0,
  dealerCommission: 0,
  botMode: 0,
  exitMode: 0,
  inactiveWaitTime: 100000,
  waitTime: {
    start: 3,
    deliver: 3,
    end: 1, // Multiply by total win players
  },
};

function print(msg) {
  if (isDebug) {
    console.log(msg);
  }
}

function logPlayers(players) {
  if (!isDebug) return;
  for (const player of players) {
    console.log(util.inspect(player));
  }
}

class Room {
  static GameStates = {
    wait: 0,
    start: 1,
    deliver: 2,
    end: 3,
    destory: 4,
  };

  static BotMode = {
    normal: 0,
    sustain: 1,
    unfair: 2,
    burst: 3,
  };

  static ExitMode = {
    minBet: 0,
    minBalance: 1,
  };

  constructor(minBet, totalPlayer, level, config = DefaultConfig, isPrivate = false) {
    // Room Config
    this.setConfig(config);
    this.isPrivate = isPrivate;

    if (this.isPrivate) {
      this.roomCode = Math.floor(100000 + Math.random() * 900000);
    }

    // Player variables
    this.level = level;
    this.minBet = minBet;
    this.totalPlayer = totalPlayer;
    this.players = [];

    // System variables
    this.gameState = Room.GameStates.wait;
    this.bank = 0;
    this.tick = 0;
    this.wait = 0;
    this.dealerIndex = 0;
    this.cards = [];
    this.winners = [];
    this.losers = [];
    this.botBalance = 0;
    this.isActive = true;

    for (let i = 0; i < this.totalPlayer; i++) {
      this.players.push(null);
    }

    if (fs.existsSync(file_room_no)) {
      let roomNo = parseInt(fs.readFileSync(file_room_no));
      this.roomNo = ++roomNo;
      fs.writeFileSync(file_room_no, this.roomNo.toString());
    } else {
      this.roomNo = 0;
      if (!fs.existsSync("./tmp")) fs.mkdirSync("./tmp");
      fs.writeFileSync(file_room_no, this.roomNo.toString());
    }

    // Create file to log room data
    if (!fs.existsSync(file_room_log)) fs.mkdirSync(file_room_log);
    const filepath = file_room_log + this.roomNo.toString() + ".txt";
    fs.writeFileSync(filepath, "");
  }

  setConfig(config) {
    this.playerCommission = config.playerCommission ?? DefaultConfig.playerCommission;
    this.dealerCommission = config.dealerCommission ?? DefaultConfig.dealerCommission;
    this.waitTime = config.waitTime ?? DefaultConfig.waitTime;
    this.botMode = config.botMode ?? DefaultConfig.botMode;
    this.inactiveWaitTime = config.inactiveWaitTime ?? DefaultConfig.inactiveWaitTime;
    this.isActive = config.isActive;
    this.exitMode = config.exitMode ?? DefaultConfig.exitMode;
  }

  on(event, callback) {
    if (event == "transferBalance") {
      this.onTransferBalance = callback;
    } else if (event == "transferToComission") {
      this.onTransferToComission = callback;
    } else if (event == "gameStateChange") {
      this.onGameStateChange = callback;
    } else if (event == "playerRemove") {
      this.onPlayerRemove = callback;
    } else if (event == "refillBot") {
      this.onRefillBot = callback;
    } else if (event == "transferToBotProfit") {
      this.onTransferToBotProfit = callback;
    }
  }

  update() {
    this.tick++;
    if (this.tick > this.wait) {
      switch (this.gameState) {
        case Room.GameStates.wait:
          this._wait();
          break;
        case Room.GameStates.start:
          this._deliver();
          break;
        case Room.GameStates.deliver:
          this._end();
          break;
        case Room.GameStates.end:
          this._start();
          break;
      }

      this.onGameStateChange(this.getInfo());

      // log room info
      this.log(JSON.stringify(this.getInfo()));
    }
  }

  // State Process

  _start() {
    console.log(`Bot total balance : ${this.botBalance}`);

    this.logPlayerData();

    this.resetAll();

    this.removeUnactivePlayer();

    // If private room and no player
    if (this.isPrivate && this.totalAllPlayer() <= 1) {
      console.log(this.totalAllPlayer());
      this.destroy();
      return;
    }

    // If only no left in room
    if (this.totalActivePlayer() == 0) {
      for (const player of this.players) {
        if (!player) continue;
        if (!player?.isBot) continue;
        const profit = player.balance - player.initBalance;
        this.onTransferToBotProfit(profit);
      }
      this.destroy();
      return;
    }

    for (let i = 0; i < this.totalPlayer; i++) {
      this.dealerIndex++;
      if (this.dealerIndex >= this.totalPlayer) this.dealerIndex = 0;
      const player = this.players[this.dealerIndex];
      if (!player) continue;
      if (player.isWaiting) continue;
      break;
    }

    this.gameState = Room.GameStates.start;
    this.wait = this.tick + this.waitTime.start;
  }

  _deliver() {
    this.autoBet();
    this.deliverCard();

    this.gameState = Room.GameStates.deliver;
    this.wait = this.tick + this.waitTime.deliver;
  }

  _end() {
    for (const player of this.players) {
      if (!player) continue;
      if (player.cards.length < 5) continue;
      player.autoOrder();
    }

    const tmpPlayers = [];
    for (const player of this.players) {
      if (!player) continue;
      if (player.isWaiting) continue;
      if (player.index == this.dealerIndex) continue;
      tmpPlayers.push(player);
    }
    sort(tmpPlayers);

    for (const player of tmpPlayers) {
      const dealer = this.players[this.dealerIndex];

      const win = () => {
        this.winners.push(player.index);
        console.log(`${player.info.nickname} multiply ${player.getMultiply()}`);
        let winAmount = player.bet * player.getMultiply();
        if (winAmount > player.balance) winAmount = player.balance;

        if (winAmount <= dealer.balance) {
          this.transferBalance(this.dealerIndex, player.index, winAmount);
        } else {
          this.transferBalance(this.dealerIndex, player.index, dealer.balance);
        }
      };

      const lose = () => {
        this.losers.push(player.index);
        let loseAmount = player.bet * dealer.getMultiply();

        if (loseAmount < player.balance) {
          this.transferBalance(player.index, this.dealerIndex, loseAmount);
        } else {
          this.transferBalance(player.index, this.dealerIndex, player.balance);
        }
      };

      const result = player.compare(dealer);
      if (result == Comparison.WIN) {
        win();
      } else if (result == Comparison.LOSE) {
        lose();
      }
    }

    // Exit bot who exceed profit limit
    for (const player of this.players) {
      if (!player) continue;
      if (!player.isBot) continue;
      if (player.balance > player.initBalance * 2) {
        console.log(`Bot exceed max profit!`);
        player.connState = Player.ConnStates.exit;
        const profit = player.balance - player.initBalance;
        this.onTransferToBotProfit(profit);
      }
    }

    // Exit if not active
    if (!this.isActive) {
      for (const player of this.players) {
        if (!player) continue;
        if (player.isBot) continue;
        player.connState = Player.ConnStates.exit;
      }
    }

    this.gameState = Room.GameStates.end;
    let waitTime = this.waitTime.end * this.totalAllPlayer();
    this.wait = this.tick + waitTime;
  }

  _wait() {
    if (this.isPrivate) {
      if (this.totalActivePlayer() > 1) {
        this._start();
      }
    } else {
      if (this.totalActivePlayer() >= 1) {
        this._start();
      }
    }
  }

  // Main Functions

  bet(playerIndex, amount) {
    if (this.gameState != Room.GameStates.start) return;
    if (playerIndex == this.dealerIndex) return;
    if (amount > this.players[playerIndex].balance) return;

    this.players[playerIndex].bet = amount;
    this.players[playerIndex].lastActiveTime = Date.now();
  }

  newPlayer(player) {
    for (const [i, p] of this.players.entries()) {
      if (!p) {
        player.index = i;
        this.players[i] = player;
        return { roomNo: this.roomNo, index: i };
      }
    }
    return null;
  }

  getInfo() {
    let arr = [];
    for (const player of this.players) {
      if (player) {
        const info = player.getInfo();
        arr.push(info);
      } else {
        arr.push(null);
      }
    }

    const data = {
      tick: this.tick,
      wait: this.wait,
      roomNo: this.roomNo,
      gameState: this.gameState,
      bank: this.bank,
      players: arr,
      dealerIndex: this.dealerIndex,
      minBet: this.minBet,
      winners: this.winners,
      losers: this.losers,
      isPrivate: this.isPrivate,
    };

    if (this.isPrivate) data.roomCode = this.roomCode;

    return data;
  }

  // Request from client to reorder cards
  reorder(cards, index) {
    let arr = [];
    for (const card of cards) {
      const c = new Card(card.shape, card.rank);
      arr.push(c);
    }
    this.players[index].cards = arr;
    this.players[index].lastActiveTime = Date.now();
  }

  // Utilities
  destroy() {
    this.gameState = Room.GameStates.destory;
  }

  deliverCard() {
    for (const [i, player] of this.players.entries()) {
      if (!player) continue;
      if (player.isWaiting) continue;

      if (isDebugCard) {
        this.players[i].cards = debugCardArray[i];
        continue;
      }

      // Unfair Deliver
      const playerNeedToWin = this.checkPlayerNeedToWin(i);
      if (playerNeedToWin) {
        console.log(`${player.info.nickname} need to win`);
        // First Card
        this.addRandomCard(i);
        // Second Card
        const countNeed_1 = 10 - player.cards[0].count;
        if (!this.addCardByCount(countNeed_1, i)) {
          this.addRandomCard(i);
        }
        // Third & Fourth Card
        for (let j = 0; j < 2; j++) {
          this.addRandomCard(i);
        }
        // Fifth Card
        const countNeed_2 = 10 - ((player.cards[2].count + player.cards[3].count) % 10);
        if (!this.addCardByCount(countNeed_2, i)) {
          this.addRandomCard(i);
        }
        console.log(player.cards);
      } else {
        // Normal Deliver
        for (let j = 0; j < 5; j++) {
          this.addRandomCard(i);
        }
      }
    }
  }

  addCardByCount(count, playerIndex) {
    for (let i = 0; i < this.cards.length; i++) {
      const card = this.cards[i];
      if (card.count == count) {
        this.players[playerIndex].cards.push(this.cards[i]);
        this.cards.splice(i, 1);
        return true;
      }
    }
    return false;
  }

  addRandomCard(playerIndex) {
    let r = Math.floor(Math.random() * this.cards.length);
    this.players[playerIndex].cards.push(this.cards[r]);
    this.cards.splice(r, 1);
  }

  checkPlayerNeedToWin(playerIndex) {
    const player = this.players[playerIndex];
    if (player.isBot) {
      if (this.botMode == Room.BotMode.normal) return false;
      if (this.botMode == Room.BotMode.burst) return true;
      if (this.botMode == Room.BotMode.unfair) {
        if (Math.random() > 0.5) return true;
      }
      if (player.balance < player.initBalance) return true;
    } else {
      if (player.info?.winRate) {
        console.log(`Player ${player.info.nickname} have win rate variable`);
        const winRate = player.info.winRate;
        console.log(`Player ${player.info.nickname} win rate : ${winRate}%`);
        if (winRate > 0) {
          const rd = Math.floor(Math.random() * 100);
          console.log(`Player ${player.info.nickname} random rate ${rd}`);
          if (winRate > rd) {
            return true;
          }
        }
      }
    }
    return false;
  }

  resetAll() {
    // Cut Comission
    for (const player of this.players) {
      if (!player) continue;

      if (player.winAmount > 0) {
        const commission = this.playerCommission;
        const amount = player.winAmount * (commission / 100);
        this.transferToComission(player.index, amount);
      }
    }

    // Reset player properties
    for (const player of this.players) {
      if (!player) continue;
      player.reset();
    }

    this.winners = [];
    this.losers = [];
    this.resetCards();
  }

  logPlayerData() {
    for (const player of this.players) {
      if (!player) continue;
      if (player.isBot) continue;
      let data = { playerId: player.id, game: "bugyee", level: this.level, roomNo: this.roomNo };
      if (player.winAmount > 0) {
        data.bet = player.bet;
        data.amount = player.winAmount;
        data.status = "win";
      } else if (player.loseAmount > 0) {
        data.bet = player.bet;
        data.amount = player.loseAmount;
        data.status = "lose";
      } else {
        return;
      }
      fetch(sysConfig.accountUrl + "play_log", {
        method: "POST",
        body: JSON.stringify(data),
        headers: {
          "Content-type": "application/json; charset=UTF-8",
        },
      }).catch((err) => {
        console.log(`Account play log api error!`);
      });
    }
  }

  removeUnactivePlayer() {
    for (const player of this.players) {
      if (!player) continue;
      if (this.playerNeedToExit(player)) {
        if (player.isBot) this.onRefillBot(player.info.nickname, player.info.profile);
        else this.onPlayerRemove(player.id);
        this.players[player.index] = null;
      }
    }
  }

  playerNeedToExit(player) {
    if (
      player.connState != Player.ConnStates.active ||
      (Date.now() - player.lastActiveTime > this.inactiveWaitTime && !player.isBot)
    ) {
      return true;
    }

    if (this.exitMode == Room.ExitMode.minBet && player.balance < this.minBet) {
      return true;
    } else if (
      this.exitMode == Room.ExitMode.minBalance &&
      player.balance < levelConfig[this.level].minAmount
    ) {
      return true;
    }

    return false;
  }

  resetCards() {
    let cards = [];
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
        cards.push(card);
      }
    }
    this.cards = cards;
  }

  autoBet() {
    for (const player of this.players) {
      if (!player) continue;
      if (player.isWaiting) continue;
      if (player.index == this.dealerIndex) continue;
      if (player.bet >= this.minBet) continue;
      player.bet = this.minBet;
    }
  }

  totalAllPlayer() {
    let count = 0;
    for (const player of this.players) {
      if (player) count++;
    }
    return count;
  }

  totalBot() {
    let count = 0;
    for (const player of this.players) {
      if (player) if (player.isBot) count++;
    }
    return count;
  }

  totalActivePlayer() {
    let count = 0;
    for (const player of this.players) {
      if (player) if (!player.isBot) count++;
    }
    return count;
  }

  resetCards() {
    let cards = [];
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
        cards.push(card);
      }
    }
    this.cards = cards;
  }

  // Balance Transfer

  transferBalance(from, to, amount) {
    if (this.players[from].isBot) this.botBalance -= amount;
    if (this.players[to].isBot) this.botBalance += amount;
    this.players[from].balance -= amount;
    this.players[to].balance += amount;
    this.players[from].loseAmount += amount;
    this.players[to].winAmount += amount;
    this.onTransferBalance(this.players[from].id, this.players[to].id, amount);
  }

  transferToComission(playerIndex, amount) {
    if (this.players[playerIndex].isBot) return;
    const playerId = this.players[playerIndex].id;
    this.players[playerIndex].balance -= amount;
    this.onTransferToComission(playerId, this.roomNo, amount);
  }

  log(msg) {
    const time = new Date().toLocaleString();
    const data = `\n\n ${time} :: ${msg}`;
    const filepath = file_room_log + this.roomNo.toString() + ".txt";
    try {
      fs.appendFileSync(filepath, data);
    } catch (err) {
      console.log(err);
    }
  }
}

function sort(players) {
  for (let i = 0; i < players.length - 1; i++) {
    for (let j = i + 1; j < players.length; j++) {
      if (players[i].compare(players[j]) == Comparison.LOSE) {
        let tmpPlayer = players[i];
        players[i] = players[j];
        players[j] = tmpPlayer;
      }
    }
  }
}

module.exports = Room;
