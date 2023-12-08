const fs = require("fs");
const util = require("util");
const Card = require("./card");
const Player = require("./player");

const sysConfig = JSON.parse(fs.readFileSync("config/system.json"));

const levelConfig = JSON.parse(fs.readFileSync("config/level.json"));

const BotBalance = new Array(levelConfig.length).fill(0);

const c0 = new Card(0, 1);
const c1 = new Card(0, 8);
const c2 = new Card(0, 2);
const c3 = new Card(1, 3);
const c4 = new Card(2, 4);
const c5 = new Card(0, 1);
const c6 = new Card(1, 4);
const c7 = new Card(2, 4);
const c8 = new Card(0, 4);
const c9 = new Card(0, 5);

// Debug
const isDebug = false;
const isDebugCard = true;
let debugCardIndex = 0;
const debugCardArray = [
  [c0, c1, c2, c3, c4, c5, c8, c9],
  [c0, c1, c2, c3, c4, c5, c6, c7],
  [c0, c1, c2, c7, c8, c9, c0, c1],
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
  botMode: 0,
  exitMode: 0,
  inactiveWaitTime: 30000,
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
    sustain: 0,
    unfair: 1,
    burst: 2,
  };

  static ExitMode = {
    minBet: 0,
    minBalance: 1,
  };

  constructor(
    betAmount,
    totalPlayer,
    level,
    config = DefaultConfig,
    isPrivate = false
  ) {
    // Room Config
    this.setConfig(config);
    this.isPrivate = isPrivate;

    if (this.isPrivate) {
      this.roomCode = Math.floor(100000 + Math.random() * 900000);
    }

    // Player variables
    this.level = level;
    this.betAmount = betAmount;
    this.totalPlayer = totalPlayer;
    this.players = [];

    // System variables
    this.isActive = true;
    this.gameState = Room.GameStates.wait;
    this.bank = 0;
    this.tick = 0;
    this.wait = 0;
    this.cards = [];
    this.giveUpFlow = [];
    this.firstFlow = [];
    this.secondFlow = [];
    this.thirdFlow = [];
    this.fourthFlow = [];
    this.giveUpBalance = new Array(totalPlayer).fill(0);
    this.firstBalance = new Array(totalPlayer).fill(0);
    this.secondBalance = new Array(totalPlayer).fill(0);
    this.thirdBalance = new Array(totalPlayer).fill(0);
    this.fourthBalance = new Array(totalPlayer).fill(0);

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
    this.playerCommission =
      config.playerCommission ?? DefaultConfig.playerCommission;
    this.waitTime = config.waitTime ?? DefaultConfig.waitTime;
    this.botMode = config.botMode ?? DefaultConfig.botMode;
    this.exitMode = config.exitMode ?? Room.ExitMode.minBet;
    this.inactiveWaitTime =
      config.inactiveWaitTime ?? DefaultConfig.inactiveWaitTime;
    this.isActive = config.isActive;
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

      // this.onGameStateChange(this.getInfo());

      // log room info
      this.log(JSON.stringify(this.getInfo()));
    }
  }

  // State Process

  _start() {
    console.log(`Game Stage - Start`);
    console.log(`Bot balance : ${BotBalance[this.level]}`);

    this.resetAll();

    this.removeUnactivePlayer();

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

    this.gameState = Room.GameStates.start;
    this.wait = this.tick + this.waitTime.start;
  }

  _deliver() {
    console.log(`Game Stage - Deliver`);
    this.deliverCard();
    this.gameState = Room.GameStates.deliver;
    this.wait = this.tick + this.waitTime.deliver;
  }

  _end() {
    for (const player of this.players) {
      if (!player) continue;
      if (player.cards.length < 8) continue;
      if (!player.isBot) continue;
      player.autoOrder();
    }

    this._giveUpCompare();
    this._firstCompare();
    this._secondCompare();
    this._thirdCompare();
    this._fourthCompare();

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
    this.wait = this.tick + this.waitTime.end;
  }

  _wait() {
    if (this.isPrivate) {
      if (this.totalActivePlayer() > 1) {
        this._start();
      }
    } else {
      if (this.totalAllPlayer() > 1) {
        this._start();
      }
    }
  }

  _giveUpCompare() {
    for (let i = 0; i < this.totalPlayer - 1; i++) {
      const p1 = this.players[i];
      if (!p1) continue;
      if (p1.isWaiting) continue;
      for (let j = i + 1; j < this.totalPlayer; j++) {
        const p2 = this.players[j];
        if (!p2) continue;
        if (p2.isWaiting) continue;
        const p1Valid = p1.isValid();
        const p2Valid = p2.isValid();
        const p1CardStatus = p1.cardStatus()[0];
        const p2CardStatus = p2.cardStatus()[0];
        if (p1Valid && p2CardStatus < 0) {
          let amount = p2CardStatus == -1 ? this.betAmount : this.betAmount * 2;
          if (amount > p2.balance) amount = p2.balance;
          this.giveUpFlow.push({
            from: p2.index,
            to: p1.index,
            amount,
            multiplier: 1,
          });
          this.transferBalance(p2.index, p1.index, amount, this.giveUpBalance);
        } else if (p1CardStatus < 0 && p2Valid) {
          let amount = p1CardStatus == -1 ? this.betAmount : this.betAmount * 2;
          if (amount > p1.balance) amount = p1.balance;
          this.giveUpFlow.push({
            from: p1.index,
            to: p2.index,
            amount,
            multiplier: 1,
          });
          this.transferBalance(p1.index, p2.index, amount, this.giveUpBalance);
        }
      }
    }
  }

  _firstCompare() {
    for (let i = 0; i < this.totalPlayer - 1; i++) {
      const p1 = this.players[i];
      if (!p1) continue;
      if (p1.isWaiting) continue;
      if (p1.cardStatus()[0] < 0) continue;
      for (let j = i + 1; j < this.totalPlayer; j++) {
        const p2 = this.players[j];
        if (!p2) continue;
        if (p2.isWaiting) continue;
        if (p2.cardStatus()[0] < 0) continue;
        // Compare cards
        const p1Valid = p1.isValid();
        const p2Valid = p2.isValid();
        if (!p1Valid && p2Valid) {
          let multiplier = 1;
          if (p1.preOrder()) multiplier += 1;
          let amount = this.betAmount * multiplier;
          if (amount > p1.balance) amount = p1.balance;
          this.firstFlow.push({
            from: p1.index,
            to: p2.index,
            amount,
            multiplier,
          });
          this.transferBalance(p1.index, p2.index, amount, this.firstBalance);
        } else if (p1Valid && !p2Valid) {
          let multiplier = 1;
          if (p2.preOrder()) multiplier += 1;
          let amount = this.betAmount * multiplier;
          if (amount > p2.balance) amount = p2.balance;
          this.firstFlow.push({
            from: p2.index,
            to: p1.index,
            amount,
            multiplier,
          });
          this.transferBalance(p2.index, p1.index, amount, this.firstBalance);
        } else if (p1Valid && p2Valid) {
          const compareResult = p1.compare(p2, 0);
          if (compareResult == 1) {
            let multiplier = p1.getMultiply(0);
            let amount = this.betAmount * multiplier;
            if (amount > p2.balance) amount = p2.balance;
            this.firstFlow.push({
              from: p2.index,
              to: p1.index,
              amount,
              multiplier,
            });
            this.transferBalance(p2.index, p1.index, amount, this.firstBalance);
          } else if (compareResult == -1) {
            let multiplier = p2.getMultiply(0);
            let amount = this.betAmount * multiplier;
            if (amount > p1.balance) amount = p1.balance;
            this.firstFlow.push({
              from: p1.index,
              to: p2.index,
              amount,
              multiplier,
            });
            this.transferBalance(p1.index, p2.index, amount, this.firstBalance);
          }
        }
      }
    }
  }

  _secondCompare() {
    for (let i = 0; i < this.totalPlayer - 1; i++) {
      const p1 = this.players[i];
      if (!p1) continue;
      if (p1.isWaiting) continue;
      if (!p1.isValid()) continue;
      for (let j = i + 1; j < this.totalPlayer; j++) {
        const p2 = this.players[j];
        if (!p2) continue;
        if (p2.isWaiting) continue;
        if (!p2.isValid()) continue;
        // Compare cards
        const compareResult = p1.compare(p2, 1);
        if (compareResult == 1) {
          let multiplier = p1.getMultiply(1);
          let amount = this.betAmount * multiplier;
          if (amount > p2.balance) amount = p2.balance;
          this.secondFlow.push({
            from: p2.index,
            to: p1.index,
            amount,
            multiplier,
          });
          this.transferBalance(p2.index, p1.index, amount, this.secondBalance);
        } else if (compareResult == -1) {
          let multiplier = p2.getMultiply(1);
          let amount = this.betAmount * multiplier;
          if (amount > p1.balance) amount = p1.balance;
          this.secondFlow.push({
            from: p1.index,
            to: p2.index,
            amount,
            multiplier,
          });
          this.transferBalance(p1.index, p2.index, amount, this.secondBalance);
        }
      }
    }
  }

  _thirdCompare() {
    for (let i = 0; i < this.totalPlayer - 1; i++) {
      const p1 = this.players[i];
      if (!p1) continue;
      if (p1.isWaiting) continue;
      if (!p1.isValid()) continue;
      for (let j = i + 1; j < this.totalPlayer; j++) {
        const p2 = this.players[j];
        if (!p2) continue;
        if (p2.isWaiting) continue;
        if (!p2.isValid()) continue;
        // Compare cards
        const compareResult = p1.compare(p2, 2);
        if (compareResult == 1) {
          let multiplier = p1.getMultiply(2);
          let amount = this.betAmount * multiplier;
          if (amount > p2.balance) amount = p2.balance;
          this.thirdFlow.push({
            from: p2.index,
            to: p1.index,
            amount,
            multiplier,
          });
          this.transferBalance(p2.index, p1.index, amount, this.thirdBalance);
        } else if (compareResult == -1) {
          let multiplier = p2.getMultiply(2);
          let amount = this.betAmount * multiplier;
          if (amount > p1.balance) amount = p1.balance;
          this.thirdFlow.push({
            from: p1.index,
            to: p2.index,
            amount,
            multiplier,
          });
          this.transferBalance(p1.index, p2.index, amount, this.thirdBalance);
        }
      }
    }
  }

  _fourthCompare() {
    for (let i = 0; i < this.totalPlayer - 1; i++) {
      const p1 = this.players[i];
      if (!p1) continue;
      if (p1.isWaiting) continue;
      if (!p1.isValid()) continue;
      for (let j = i + 1; j < this.totalPlayer; j++) {
        const p2 = this.players[j];
        if (!p2) continue;
        if (p2.isWaiting) continue;
        if (!p2.isValid()) continue;
        if (p1.isAllNine() && !p2.isAllNine()) {
          let amount = this.betAmount * 5;
          if (amount > p2.balance) amount = p2.balance;
          this.fourthFlow.push({
            from: p2.index,
            to: p1.index,
            amount,
            multiplier: 5,
          });
          this.transferBalance(p2.index, p1.index, amount, this.fourthBalance);
        } else if (!p1.isAllNine() && p2.isAllNine()) {
          let amount = this.betAmount * 5;
          if (amount > p1.balance) amount = p1.balance;
          this.fourthFlow.push({
            from: p1.index,
            to: p2.index,
            amount,
            multiplier: 5,
          });
          this.transferBalance(p1.index, p2.index, amount, this.fourthBalance);
        }
      }
    }
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
    let arr = new Array(this.totalPlayer).fill(null);
    for (const player of this.players) {
      if (player) {
        arr[player.index] = player.getInfo();
      }
    }

    const data = {
      tick: this.tick,
      wait: this.wait,
      roomNo: this.roomNo,
      gameState: this.gameState,
      bank: this.bank,
      players: arr,
      betAmount: this.betAmount,
      isPrivate: this.isPrivate,
      giveUpFlow: this.giveUpFlow,
      firstFlow: this.firstFlow,
      secondFlow: this.secondFlow,
      thirdFlow: this.thirdFlow,
      fourthFlow: this.fourthFlow,
      giveUpBalance: this.giveUpBalance,
      firstBalance: this.firstBalance,
      secondBalance: this.secondBalance,
      thirdBalance: this.thirdBalance,
      fourthBalance: this.fourthBalance,
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
    this.ping(index);
  }

  giveUp(index) {
    this.players[index].isGiveUp = true;
    this.ping(index);
  }

  // Utilities

  ping(index) {
    this.players[index].lastActiveTime = Date.now();
    console.log(`Player ping ${this.players[index].info.nickname}`);
  }

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

      const playerNeedToWin = this.checkPlayerNeedToWin(i);
      if (playerNeedToWin == 1) {
        console.log(`Player ${i} need to win!`);
        // First Card
        this.addRandomCard(i);
        // Second Card
        const countNeed_1 = 9 - player.cards[0].count;
        if (!this.addCardByCount(countNeed_1, i)) {
          console.log(`Card needed not found!`);
          this.addRandomCard(i);
        }
        // Third & Fourth Card
        for (let j = 0; j < 2; j++) {
          this.addRandomCard(i);
        }
        // Fifth Card
        const countNeed_2 =
          9 - ((player.cards[2].count + player.cards[3].count) % 10);
        if (!this.addCardByCount(countNeed_2, i)) {
          console.log(`Card needed not found!`);
          this.addRandomCard(i);
        }
        // Six & Seven Card
        for (let j = 0; j < 2; j++) {
          this.addRandomCard(i);
        }
        const countNeed_3 =
          9 - ((player.cards[5].count + player.cards[6].count) % 10);
        if (!this.addCardByCount(countNeed_3, i)) {
          console.log(`Card needed not found!`);
          this.addRandomCard(i);
        }
      } else if (playerNeedToWin == -1) {
        console.log(`Player ${i} need to lose!`);
        for (let j = 0; j < 8; j++) {
          if (!this.addLoseCard(i)) {
            console.log(`Card needed not found!`);
            this.addRandomCard(i);
          }
        }
      } else {
        // Normal Deliver
        for (let j = 0; j < 8; j++) {
          this.addRandomCard(i);
        }
      }
    }
  }

  addLoseCard(playerIndex) {
    for (let k = 0; k < 3; k++) {
      const i = Math.floor(Math.random() * this.cards.length);
      const card = this.cards[i];
      if (card.count == 10 || card.count <= 4) {
        this.players[playerIndex].cards.push(this.cards[i]);
        this.cards.splice(i, 1);
        return true;
      }
    }
    return false;
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
      if (player.balance < player.initBalance) return 1;

      if (this.botMode == Room.BotMode.burst) return 1;
    }

    if (
      BotBalance[this.level] < levelConfig[this.level].betAmount * 10 &&
      !player.isBot
    ) {
      return -1;
    }

    if (player.info?.winRate) {
      const winRate = player.info.winRate;
      console.log(`Player ${player.info.nickname} win rate : ${winRate}%`);
      if (winRate > 0) {
        const rd = Math.floor(Math.random() * 100);
        if (winRate > rd) {
          return 1;
        }
      } else if (winRate < 0) {
        const rd = Math.floor(Math.random() * -100);
        if (winRate < rd) {
          return -1;
        }
      }
    }

    return 0;
  }

  resetAll() {
    // Cut Comission
    for (const player of this.players) {
      if (!player) continue;
      if (player.isBot) continue;
      let data = {
        playerId: player.id,
        game: "shweshan",
        bet: this.betAmount,
        amount: player.winAmount,
        level: this.level,
        roomNo: this.roomNo,
      };
      if (player.winAmount > 0) {
        const commission = this.playerCommission;
        const amount = player.winAmount * (commission / 100);
        this.transferToComission(player.index, amount);
        data.status = "win";
      } else {
        data.status = "lose";
      }
      console.log(`Play log save - `);
      console.log(data);
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

    // Reset player properties
    for (const player of this.players) {
      if (!player) continue;
      player.reset();
    }
    this.giveUpBalance = new Array(this.totalPlayer).fill(0);
    this.firstBalance = new Array(this.totalPlayer).fill(0);
    this.secondBalance = new Array(this.totalPlayer).fill(0);
    this.thirdBalance = new Array(this.totalPlayer).fill(0);
    this.fourthBalance = new Array(this.totalPlayer).fill(0);
    this.giveUpFlow = [];
    this.firstFlow = [];
    this.secondFlow = [];
    this.thirdFlow = [];
    this.fourthFlow = [];
    this.resetCards();
  }

  removeUnactivePlayer() {
    for (const player of this.players) {
      if (!player) continue;

      if (this.playerNeedToExit(player)) {
        if (!player.isBot) this.onPlayerRemove(player.id);
        this.players[player.index] = null;
      }
    }
  }

  playerNeedToExit(player) {
    if (
      player.connState != Player.ConnStates.active ||
      (Date.now() - player.lastActiveTime > this.inactiveWaitTime &&
        !player.isBot)
    ) {
      return true;
    }

    if (
      this.exitMode == Room.ExitMode.minBet &&
      player.balance < this.betAmount
    ) {
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

  // Balance Transfer

  transferBalance(from, to, amount, arr) {
    // Bot balance
    if (this.players[from].isBot) BotBalance[this.level] -= amount;
    if (this.players[to].isBot) BotBalance[this.level] += amount;
    // transfer
    this.players[from].balance -= amount;
    this.players[from].winAmount -= amount;
    this.players[to].balance += amount;
    this.players[to].winAmount += amount;
    arr[from] -= amount;
    arr[to] += amount;
    this.onTransferBalance(this.players[from].id, this.players[to].id, amount);
  }

  transferToComission(playerIndex, amount) {
    if (this.players[playerIndex].isBot) return;
    if (this.players[playerIndex].balance < amount) return;
    const playerId = this.players[playerIndex].id;
    this.players[playerIndex].balance -= amount;
    this.onTransferToComission(playerId, this.roomNo, amount);
    console.log(`Cut commission from ${playerIndex}, amount : ${amount}`);
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
