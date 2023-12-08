const fs = require("fs");
const util = require("util");
const Card = require("./card");
const Player = require("./player");
const { compareCard, getPauk } = require("./card_util");

const sysConfig = JSON.parse(fs.readFileSync("config/system.json"));

// Debug
const isDebug = false;
const isDebugCard = false;
let debugCardIndex = 0;
const debugCardArray = [0, 1, 3, 2, 4];

// Config
const file_room_no = "./tmp/roomNo.txt";
const file_room_log = "./tmp/rooms/";

const Comparison = {
  EQUAL: 0,
  WIN: 1,
  LOSE: -1,
};

const DefaultConfig = {
  dealerLimit: 3,
  playerComission: 0,
  dealerComission: 0,
  dealerMode: 0,
  dealerOrderMode: 0,
  catchMode: 0,
  botMode: 0,
  inactiveWaitTime: 30000,
  autoDrawPauk: 3,
  exitMode: 0,
  waitTime: {
    wait: 5,
    start: 3,
    firstDeliver: 3,
    secondDeliver: 3,
    dealerDraw: 4,
    end: 1, // Multiply by total win players
    cardCheck: 2,
    catch: 2,
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
    firstDeliver: 2,
    secondDeliver: 3,
    dealerDraw: 4,
    end: 5,
    destory: 6,
  };

  static ExitMode = {
    minBet: 0,
    minBalance: 1,
  };

  static DealerMode = {
    normal: 0,
    fixedLimit: 1,
  };

  static DealerOrderMode = {
    seat: 0, // order by seat
    token: 1, // order by token that enter the room
  };

  static CatchMode = {
    loserAtOnce: 0,
    oneByOne: 1,
    AllAtOne: 2,
  };

  static BotMode = {
    normal: 0,
    sustain: 1,
    unfair: 2,
    burst: 3,
  };

  constructor(dealerAmount, minBet, gameConfig, level, isPrivate = false) {
    // Room Config
    this.setConfig(gameConfig);
    this.isPrivate = isPrivate;

    if (this.isPrivate) {
      this.roomCode = Math.floor(100000 + Math.random() * 900000);
    }

    // Player variables
    this.level = level;
    this.dealerAmount = dealerAmount;
    this.minBet = minBet;
    this.totalPlayer = gameConfig.totalPlayer;
    this.players = [];
    this.tokens = [];

    // System variables
    this.gameState = Room.GameStates.wait;
    this.tick = 0;
    this.wait = 0;
    this.dealerIndex = 1;
    this.dealerCount = 0;
    this.dealerBet = 0;
    this.cards = [];
    this.firstTime = true;
    this.catchInfo = null;
    this.warning = false;
    this.botBalance = 0;
    this.isActive = true;
    this.needToDestroy = false;
    this.startTime = Date.now();

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
    this.dealerLimit = config.dealerLimit || DefaultConfig.dealerLimit;
    this.playerComission =
      config.playerComission || DefaultConfig.playerComission;
    this.dealerComission =
      config.dealerComission || DefaultConfig.dealerComission;
    this.waitTime = config.waitTime || DefaultConfig.waitTime;
    this.dealerMode = config.dealerMode || DefaultConfig.dealerMode;
    this.catchMode = config.catchMode || DefaultConfig.catchMode;
    this.dealerOrderMode =
      config.dealerOrderMode || DefaultConfig.dealerOrderMode;
    this.botMode = config.botMode || DefaultConfig.botMode;
    this.inactiveWaitTime =
      config.inactiveWaitTime || DefaultConfig.inactiveWaitTime;
    this.isActive = config.isActive;
    this.autoDrawPauk = config.autoDrawPauk || DefaultConfig.autoDrawPauk;
    this.exitMode = config.exitMode ?? DefaultConfig.exitMode;
    console.log(`Exit Mode : ${this.exitMode}`);
  }

  logTransferToGameRoom = async (id, roomNo, amount) => {
    const data = {
      game: "shankoemee",
      roomNo,
      id,
      amount,
    };

    const respond = await fetch(sysConfig.accountUrl + "transfer_to_game", {
      method: "POST",
      body: JSON.stringify(data),
      headers: {
        "Content-type": "application/json; charset=UTF-8",
      },
    }).catch((err) => {
      console.log(`Account api error on - transfer to game`);
    });

    if (respond?.status == "ok") {
      console.log(
        `Transfer from player ${id} to Game Room ${roomNo} - amount ${amount}`
      );
    }
  };

  logTransferFromGameRoom = async (id, roomNo, amount) => {
    const data = {
      game: "shankoemee",
      roomNo,
      id,
      amount,
    };

    const respond = await fetch(sysConfig.accountUrl + "transfer_from_game", {
      method: "POST",
      body: JSON.stringify(data),
      headers: {
        "Content-type": "application/json; charset=UTF-8",
      },
    }).catch((err) => {
      console.log(`Account api error on - transfer from game`);
    });

    if (respond?.status == "ok") {
      console.log(
        `Transfer from player ${id} to Game Room ${roomNo} - amount ${amount}`
      );
    }
  };

  logTransferToCommission = async (id, roomNo, amount, isDealer) => {
    const data = { id, amount, game: "shankoemee", isDealer };

    const respond = await fetch(
      sysConfig.accountUrl + "transfer_to_commission",
      {
        method: "POST",
        body: JSON.stringify(data),
        headers: {
          "Content-type": "application/json; charset=UTF-8",
        },
      }
    ).catch((err) => {
      console.log(`Account api error!`);
    });

    if (respond?.status == "ok") {
      console.log(
        `Transfer from Game Room ${roomNo} to player ${id} - amount ${amount}`
      );
    }
  };

  logPlayerRemove = async (id) => {
    const data = { game: "ShanKoeMee", id };

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
  };

  logTransferToBotProfit = async (amount) => {
    const respond = await fetch(
      sysConfig.accountUrl + "transfer_to_bot_profit",
      {
        method: "POST",
        body: JSON.stringify({ amount }),
        headers: {
          "Content-type": "application/json; charset=UTF-8",
        },
      }
    ).catch((err) => {
      console.log(`Account api error!`);
    });

    if (respond?.status == "ok") {
      console.log(`Transfer to bot profit - amount ${amount}`);
    }
  };

  update() {
    this.tick++;
    if (this.tick > this.wait) {
      switch (this.gameState) {
        case Room.GameStates.wait:
          this._wait();
          break;
        case Room.GameStates.start:
          this._firstDeliver();
          break;
        case Room.GameStates.firstDeliver:
          this._secondDeliver();
          break;
        case Room.GameStates.secondDeliver:
          this._dealerDraw();
          break;
        case Room.GameStates.dealerDraw:
          this._end();
          break;
        case Room.GameStates.end:
          this._start();
          break;
      }

      // log room info
      this.log(JSON.stringify(this.getInfo()));
    }
  }

  // State Process

  _start() {
    this.logPlayerData();

    this.resetAll();

    this.removeUnactivePlayer();

    this.dealerProcess();

    this.removeUnactivePlayer();

    if (this.totalRealPlayer() > 0) this.needToDestroy = false;

    if (this.needToDestroy) {
      for (const player of this.players) {
        if (!player) continue;
        if (!player?.isBot) continue;

        const profit =
          player.index == this.dealerIndex
            ? player.balance + this.dealerBet - player.initBalance
            : player.balance - player.initBalance;
        this.logTransferToBotProfit(profit);
      }
      this.destroy();
      return;
    }

    // If only bot left in room
    if (this.totalActivePlayer() == 0) this.needToDestroy = true;

    // If only one left in room
    if (this.totalAllPlayer() <= 1 || this.totalRealPlayer() == 0) {
      if (!this.players[this.dealerIndex].isBot) {
        this.transferFromDealerBetToPlayerBalance(this.dealerIndex);
        this.logPlayerRemove(this.players[this.dealerIndex].id);
      }
      this.destroy();
      return;
    }

    this.gameState = Room.GameStates.start;
    this.wait = this.tick + this.waitTime.start;
  }

  _firstDeliver() {
    this.botBet();
    this.cutMinimalBet();
    this.deliverCard();
    this.deliverCard();
    this.autoDraw();

    this.gameState = Room.GameStates.firstDeliver;
    this.wait = this.tick + this.waitTime.firstDeliver;
    this.logGame("Start");
  }

  _secondDeliver() {
    if (this.players[this.dealerIndex].getPauk() >= 8) {
      this._end();
      return;
    }

    // If no request draw skip to dealer draw
    let totalDraw = 0;
    for (const player of this.players) {
      if (!player) continue;
      if (player.requestDraw) totalDraw++;
    }
    if (totalDraw == 0) {
      this._dealerDraw();
      return;
    }

    this.deliverCard(true);

    this.gameState = Room.GameStates.secondDeliver;

    if (this.players[this.dealerIndex].cards.length == 3)
      this.wait = this.tick + this.waitTime.cardCheck;
    else this.wait = this.tick + this.waitTime.secondDeliver;
  }

  _dealerDraw() {
    if (this.players[this.dealerIndex].cards.length == 3) {
      this._end();
      return;
    }

    this.gameState = Room.GameStates.dealerDraw;
    this.wait = this.tick + this.waitTime.dealerDraw;
  }

  _end() {
    const [order, winners, losers] = this.catchOrder();
    this.catchInfo = { winners, losers };
    for (const i of order) {
      this.catchPlayer(i);
    }

    this.gameState = Room.GameStates.end;
    let waitTime = this.waitTime.end * winners.length;
    if (this.dealerCount >= this.dealerLimit || this.dealerBet <= 0)
      waitTime += 2;
    if (this.catchMode == Room.CatchMode.loserAtOnce) {
      if (losers.length > 0) waitTime += 2;
    } else if (this.catchMode == Room.CatchMode.oneByOne) {
      if (losers.length > 0) waitTime += losers.length * this.waitTime.end;
    }

    // Exit bot who exceed profit limit
    for (const player of this.players) {
      if (!player) continue;
      if (!player.isBot) continue;
      if (player.balance > player.initBalance * 2 || !this.isActive) {
        console.log(`Bot exceed max profit!`);
        player.connState = Player.ConnStates.exit;
        const profit = player.balance - player.initBalance;
        this.logTransferToBotProfit(profit);
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

    this.logGame("End");
    this.wait = this.tick + waitTime;
  }

  _wait() {
    const wait = Date.now() - this.startTime;
    console.log(`GameState : Wait, WaitTime : ${wait}`);
    if (wait > 120000) {
      for (const player of this.players) {
        if (!player) continue;
        this.players[player.index] = null;
      }
      this.destroy();
    }
    if (this.totalActivePlayer() > 1 && this.totalRealPlayer() >= 1) {
      this._start();
    }
  }

  // Main Functions

  newPlayer(player) {
    for (const [i, p] of this.players.entries()) {
      if (!p) {
        console.log(`Seat for new player found!`);
        player.index = i;
        this.players[i] = player;
        const tokenIndex = this.tokens.indexOf(this.dealerIndex);
        if (tokenIndex == -1) {
          this.tokens.push(i);
        } else {
          this.tokens.splice(tokenIndex, 0, i);
        }
        return { roomNo: this.roomNo, index: i };
      }
    }
    console.log(`Seat for new player not found!`);
    return null;
  }

  removePlayer(id) {
    for (const [i, p] of this.players.entries()) {
      if (!p) continue;
      if (p.id == id) {
        this.players[i] = null;
        return true;
      }
    }
    return false;
  }

  getInfo() {
    const data = {
      tick: this.tick,
      wait: this.wait,
      roomNo: this.roomNo,
      dealerIndex: this.dealerIndex,
      dealerCount: this.dealerCount,
      dealerLimit: this.dealerLimit,
      dealerAmount: this.dealerAmount,
      warning: this.warning,
      gameState: this.gameState,
      dealerBet: this.dealerBet,
      minBet: this.minBet,
      players: this.players,
      isPrivate: this.isPrivate,
    };

    if (this.isPrivate) data.roomCode = this.roomCode;

    if (this.gameState == Room.GameStates.end) data.catchInfo = this.catchInfo;

    return data;
  }

  bet(id, amount) {
    if (this.gameState != Room.GameStates.start) return false;

    for (const [i, player] of this.players.entries()) {
      if (!player) continue;
      if (player.id == id) {
        if (i == this.dealerIndex) return false;
        if (player.bet > 0) return false;
        if (player.balance < amount) return false;
        if (amount < this.minBet || amount > this.dealerBet) return false;

        this.transferToPlayerBet(i, amount);
        this.ping(i);
        return true;
      }
    }
  }

  draw(id, isDraw) {
    for (const [i, player] of this.players.entries()) {
      if (!player) continue;
      if (player.id != id) continue;
      this.ping(i);
      if (player.getPauk() >= 8) return;
      if (
        i == this.dealerIndex &&
        this.gameState == Room.GameStates.dealerDraw
      ) {
        // Dealer Draw
        if (player.cards.length != 2) return;
        if (isDraw) {
          const r = Math.floor(Math.random() * this.cards.length);
          this.players[i].cards.push(this.cards[r]);
          this.cards.splice(r, 1);
          this.wait = this.tick + 2;
        } else {
          this._end();
        }
      } else if (this.gameState == Room.GameStates.firstDeliver && isDraw) {
        // Player Draw
        player.requestDraw = true;
        return true;
      }
    }
    return false;
  }

  catch(index) {
    for (const [i, player] of this.players.entries()) {
      if (!player) continue;
      if (i != index) continue;
      if (i == this.dealerIndex) continue;
      if (player.playState != Player.PlayStates.uncatch) continue;
      if (this.players[this.dealerIndex].cards.length == 3) continue; // cannot catch with dealer 3 cards

      this.catchPlayer(i, true);
      this.wait = this.tick + this.waitTime.catch;
      return true;
    }
    return false;
  }

  catchAllDraw() {
    for (const [i, player] of this.players.entries()) {
      if (!player) continue;
      console.log(`Seat ${i} - total cards ${player.cards.length}`);
      if (player.cards.length < 3) continue;
      if (i == this.dealerIndex) continue;
      if (player.playState != Player.PlayStates.uncatch) continue;
      if (this.players[this.dealerIndex].cards.length == 3) continue; // cannot catch with dealer 3 cards

      this.catchPlayer(i, true);
      this.wait = this.tick + this.waitTime.catch;
    }
  }

  // Utilities

  ping(index) {
    this.players[index].lastActiveTime = Date.now();
    console.log(`Player ping ${this.players[index].info.nickname}`);
  }

  botBet() {
    for (const [i, player] of this.players.entries()) {
      if (!player) continue;
      if (i == this.dealerIndex) continue;
      if (player.playState == Player.PlayStates.waiting) continue;
      if (!player.isBot) continue;

      const r = Math.floor(Math.random() * 4) + 1;
      let bet = this.minBet;
      const _bet = r * this.minBet;
      if (_bet <= this.dealerBet && _bet <= player.balance) {
        bet = _bet;
      }
      this.transferToPlayerBet(i, bet);
    }
  }

  dealerProcess() {
    if (this.dealerMode == Room.DealerMode.normal) {
      if (this.warning) {
        this.dealerCount++;
      } else {
        if (this.dealerBet >= this.dealerAmount * 3) {
          this.warning = true;
        }
      }
    } else if (this.dealerMode == Room.DealerMode.fixedLimit) {
      this.dealerCount++;
    }
    if (this.firstTime) {
      this.firstTime = false;
      this.transferToDealerBet(this.dealerIndex, this.dealerAmount);
    } else if (this.dealerCount >= this.dealerLimit || this.dealerBet <= 0) {
      // ----- Need to change dealer -----

      this.dealerCount = 0;
      this.warning = false;

      // Transfer back dealer bet to player
      const dealerWinAmount = this.dealerBet - this.dealerAmount;
      this.transferFromDealerBetToPlayerBalance(this.dealerIndex);
      if (dealerWinAmount > 0) {
        const commission = dealerWinAmount * (this.dealerComission / 100);
        console.log(`Cut dealer commission : ${commission}`);
        this.transferFromPlayerBalanceToComission(
          this.dealerIndex,
          commission,
          true
        );
      }

      // Find next dealer
      let index = this.dealerIndex;
      let tokenIndex = this.tokens.indexOf(index);
      let isDealerFound = false;
      console.log(`Token Array : ${this.tokens}`);
      if (this.dealerOrderMode == Room.DealerOrderMode.seat) {
        for (let i = 0; i < this.totalPlayer; i++) {
          // Player index increment
          index++;
          if (index >= this.totalPlayer) {
            index = 0;
          }

          const player = this.players[index];

          // Check Player have enough money to be dealer & Connection is active
          if (player) {
            if (
              player.balance > this.dealerAmount &&
              player.connState == Player.ConnStates.active
            ) {
              isDealerFound = true;
              break;
            }
          }
        }
      } else if (this.dealerOrderMode == Room.DealerOrderMode.token) {
        console.log(`Dealer find by token`);
        for (let i = 0; i < this.tokens.length; i++) {
          // Player index increment
          tokenIndex++;
          if (tokenIndex >= this.tokens.length) {
            tokenIndex = 0;
          }

          const token = this.tokens[tokenIndex];
          console.log(`Token : ${token}`);
          const player = this.players[token];

          // Check Player have enough money to be dealer & Connection is active
          if (player) {
            if (
              player.balance > this.dealerAmount &&
              player.connState == Player.ConnStates.active
            ) {
              isDealerFound = true;
              index = token;
              break;
            }
          }
        }
      }

      if (isDealerFound) {
        // Dealer found
        console.log(`Dealer change to - ${index}`);
        this.dealerIndex = index;
        this.transferToDealerBet(this.dealerIndex, this.dealerAmount);
      } else {
        // Dealer not found
        console.log(`Dealer not found`);
        this.destroy();
      }
    }
  }

  destroy() {
    this.gameState = Room.GameStates.destory;
  }

  catchPlayer(playerIndex, catchOnly = false) {
    console.log(`Player index ${playerIndex} catch`);
    const _player = this.players[playerIndex];
    const _dealer = this.players[this.dealerIndex];

    const win = () => {
      console.log(`Player index ${playerIndex} win`);
      // ------ Player Win ------
      _player.playState = Player.PlayStates.win;
      let playerWinAmount = _player.bet;
      const multiply = _player.getMultiply();

      if (multiply > 0) {
        playerWinAmount += (multiply - 1) * _player.bet;
      }

      if (playerWinAmount <= this.dealerBet) {
        _player.winAmount = playerWinAmount;
        if (!catchOnly) {
          if (_dealer.isBot) this.botBalance -= playerWinAmount;
          if (_player.isBot) this.botBalance += playerWinAmount;
          this.transferFromDealerToPlayerBet(playerIndex, playerWinAmount);
        }
      } else {
        _player.winAmount = this.dealerBet;
        if (!catchOnly) {
          if (_dealer.isBot) this.botBalance -= this.dealerBet;
          if (_player.isBot) this.botBalance += this.dealerBet;
          this.transferFromDealerToPlayerBet(playerIndex, this.dealerBet);
        }
      }
    };

    const lose = () => {
      console.log(`Player index ${playerIndex} lose`);
      // ------ Player Lose ------
      _player.playState = Player.PlayStates.lose;
      const playerBet = _player.bet;
      let dealerWinAmount = playerBet;
      if (!catchOnly) {
        this.transferFromPlayerToDealerBet(playerIndex, dealerWinAmount);
      }

      const multiply = _dealer.getMultiply();
      console.log(`Dealer Multiply : ${multiply}`);

      if (multiply > 0) {
        const extra = (multiply - 1) * playerBet;
        console.log(`Extra money to cut from player balance : ${extra}`);
        if (extra <= _player.balance) {
          if (!catchOnly) {
            this.transferToDealerBet(playerIndex, extra);
          }
          dealerWinAmount += extra;
        } else {
          if (!catchOnly) {
            this.transferToDealerBet(playerIndex, _player.balance);
          }
          dealerWinAmount += _player.balance;
        }
      }

      if (!catchOnly) {
        if (_dealer.isBot) this.botBalance += dealerWinAmount;
        if (_player.isBot) this.botBalance -= dealerWinAmount;
      }
      _player.loseAmount = dealerWinAmount;
      console.log(
        `${_player.id} lose amount : ${this.players[playerIndex].loseAmount}`
      );
    };

    if (_player.playState == Player.PlayStates.uncatch) {
      if (_player.compareCard(_dealer) == Comparison.WIN) {
        win();
      } else if (_player.compareCard(_dealer) == Comparison.LOSE) {
        lose();
      }
    } else if (_player.playState == Player.PlayStates.win) {
      // Win with already catch
      if (_player.winAmount <= this.dealerBet) {
        this.transferFromDealerToPlayerBet(_player.index, _player.winAmount);
      } else {
        this.transferFromDealerToPlayerBet(_player.index, this.dealerBet);
        _player.winAmount = this.dealerBet;
      }
    } else if (_player.playState == Player.PlayStates.lose) {
      // Lose with already catch
      const extra = _player.loseAmount - _player.bet;
      this.transferFromPlayerToDealerBet(_player.index, _player.bet);
      if (extra <= 0) return;
      if (extra <= _player.balance) {
        this.transferToDealerBet(_player.index, extra);
      } else {
        this.transferToDealerBet(_player.index, _player.balance);
      }
    }
  }

  autoDraw() {
    for (const player of this.players) {
      if (!player) continue;

      const pauk = player.getPauk();

      if (pauk == this.autoDrawPauk && player.getMultiply() == 2) continue;

      if (pauk <= this.autoDrawPauk) {
        player.requestDraw = true;
      }
    }
  }

  getCountNeed(firstCard, count) {
    const firstCardCount = firstCard.count >= 9 ? 19 : firstCard.count;
    const r = count - firstCardCount;
    return r;
  }

  NeedToWin(player) {
    const playerBalance =
      player.index == this.dealerIndex
        ? player.balance + this.dealerBet
        : player.balance;
    if (player.isBot) {
      console.log(`${player.info.nickname} bote mode : ${this.botMode}`);
      if (this.botMode == Room.BotMode.normal) return 0;
      if (this.botMode == Room.BotMode.burst) return 1;
      if (
        this.botMode == Room.BotMode.unfair &&
        player.index == this.dealerIndex &&
        this.dealerCount % 2 == 0
      )
        return 1;
      if (playerBalance < player.initBalance) return 1;
    } else {
      if (player.info?.winRate) {
        const winRate = player.info.winRate;
        const rd = Math.floor(Math.random() * 100);
        if (winRate > 0) {
          if (winRate > rd) return 1;
        } else if (winRate < 0) {
          if (winRate < -rd) return -1;
        }
      }
      const p = player.getWinPercent();
      console.log(`Win percent of ${player.id} : ${p}`);
      if (p > 60) {
        return -1;
      } else if (p < 40) {
        return 1;
      }
    }
    return 0;
  }

  deliverCard(drawOnly = false) {
    for (const [i, player] of this.players.entries()) {
      if (!player) continue;
      if (player.playState == Player.PlayStates.waiting) continue;

      let r = Math.floor(Math.random() * this.cards.length);
      if (
        debugCardArray.length > 0 &&
        debugCardIndex < debugCardArray.length &&
        isDebugCard
      ) {
        r = debugCardArray[debugCardIndex];
        debugCardIndex++;
      }

      // Unfair process
      const needToWin = this.NeedToWin(player);
      if (player.cards.length == 1 && needToWin != 0) {
        const firstCard = player.cards[0];
        let count = Math.floor(Math.random() * 4);
        if (needToWin == 1) {
          console.log(`${player.id} force to win!`);
          count = Math.floor(Math.random() * 3) + 7;
        }
        let countNeeded = this.getCountNeed(firstCard, count);
        for (const [j, card] of this.cards.entries()) {
          if (card.count == countNeeded) {
            r = j;
            break;
          }
        }
      }

      if (drawOnly) {
        if (this.players[i].requestDraw) {
          this.players[i].cards.push(this.cards[r]);
          if (!isDebugCard) this.cards.splice(r, 1);
        }
      } else {
        this.players[i].cards.push(this.cards[r]);
        if (!isDebugCard) this.cards.splice(r, 1);
      }
    }
  }

  resetAll() {
    // Pay back player bet
    for (const player of this.players) {
      if (!player) continue;
      if (player.index != this.dealerIndex)
        this.transferFromPlayerBetToBalance(player.index);
    }

    // Cut Comission
    for (const player of this.players) {
      if (!player) continue;
      if (player.index == this.dealerIndex) continue;
      if (player.isBot) continue;
      if (player.winAmount <= 0) continue;
      const amount = player.winAmount * (this.playerComission / 100);
      this.transferFromPlayerBalanceToComission(player.index, amount);
    }

    // Reset player properties
    for (const player of this.players) {
      if (!player) continue;
      if (player.index != this.dealerIndex && !player.isBot)
        player.history.push(player.playState);
      player.reset();
    }

    this.resetCards();
  }

  logPlayerData() {
    for (const player of this.players) {
      if (!player) continue;
      if (player.index == this.dealerIndex) continue;
      if (player.isBot) continue;
      let data = {
        playerId: player.id,
        game: "shankoemee",
        level: this.level,
        roomNo: this.roomNo,
      };
      if (player.winAmount > 0) {
        data.bet = player.betOrigin;
        data.amount = player.winAmount;
        data.status = "win";
      } else if (player.loseAmount > 0) {
        data.bet = player.betOrigin;
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

  logGame(title) {
    const data = {
      title,
      game: "shankoemee",
      data: this.getInfo(),
    };
    fetch(sysConfig.accountUrl + "game_log", {
      method: "POST",
      body: JSON.stringify(data),
      headers: {
        "Content-type": "application/json; charset=UTF-8",
      },
    }).catch((err) => {
      console.log(`Account game log api error!`);
    });
  }

  removeUnactivePlayer() {
    for (const player of this.players) {
      if (!player) continue;
      if (this.playerNeedToExit(player)) {
        if (!player.isBot) this.logPlayerRemove(player.id);
        const tokenIndex = this.tokens.indexOf(player.index);
        console.log(`Index to remove from tokens : ${tokenIndex}`);
        this.tokens.splice(tokenIndex, 1);
        this.players[player.index] = null;
      }
    }
  }

  playerNeedToExit(player) {
    console.log(`Exit mode : ${this.exitMode}`);
    if (player.index == this.dealerIndex) return false;

    if (Date.now() - player.initTime < 60000)
      player.lastActiveTime = Date.now();

    if (
      player.connState == Player.ConnStates.lost ||
      player.connState == Player.ConnStates.exit ||
      (Date.now() - player.lastActiveTime > this.inactiveWaitTime &&
        !player.isBot)
    ) {
      return true;
    } else if (player.connState == Player.ConnStates.wait) {
      if (Date.now() - player.initTime > 120000) return true;
    } else if (
      this.exitMode == Room.ExitMode.minBet &&
      player.balance < this.minBet
    ) {
      return true;
    } else if (
      this.exitMode == Room.ExitMode.minBalance &&
      player.balance < this.dealerAmount
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

  cutMinimalBet() {
    for (const [i, player] of this.players.entries()) {
      if (!player) continue;
      if (i == this.dealerIndex) continue;
      if (player.playState == Player.PlayStates.waiting) continue;
      if (player.isBot) continue;

      if (player.bet < this.minBet) {
        this.transferToPlayerBet(i, this.minBet);
      }
    }
  }

  totalRealPlayer() {
    let count = 0;
    for (const player of this.players) {
      if (!player) continue;
      if (player.isBot) continue;
      if (player.connState != Player.ConnStates.active) continue;
      count++;
    }
    console.log(`total real player ${count}`);
    return count;
  }

  totalActivePlayer() {
    let count = 0;
    for (const player of this.players) {
      if (!player) continue;
      if (player.connState != Player.ConnStates.active) continue;
      count++;
    }
    return count;
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

  reduceBot() {
    for (const player of this.players) {
      if (player)
        if (player.isBot && this.dealerIndex != player.index) {
          player.connState = Player.ConnStates.exit;
          console.log(`Bot reduce : ${player.info.nickname}`);
          return;
        }
    }
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

  catchOrder() {
    let winners = [];
    let losers = [];
    let equalers = [];

    const dealer = this.players[this.dealerIndex];

    for (const [i, player] of this.players.entries()) {
      if (!player) continue;
      if (!player.cards) continue;
      if (player.cards.length < 2) continue;
      if (player.playState == Player.PlayStates.waiting) continue;
      if (i == this.dealerIndex) continue;

      let result = Comparison.EQUAL;
      if (player.playState == Player.PlayStates.win) result = Comparison.WIN;
      else if (player.playState == Player.PlayStates.lose)
        result = Comparison.LOSE;
      else result = player.compareCard(dealer);

      const _player = {
        index: i,
        cards: player.cards,
        playState: player.playState,
      };

      if (result == Comparison.WIN) {
        winners.push(_player);
      } else if (result == Comparison.LOSE) {
        losers.push(_player);
      } else {
        // EQUAL
        equalers.push(_player);
      }
    }
    print("---------Before sort---------");
    print("::: Dealer :::");
    logPlayers([dealer]);
    print("::: Winners :::");
    logPlayers(winners);
    print("::: Losers :::");
    logPlayers(losers);
    print("::: Equalers :::");
    logPlayers(equalers);

    let doe = [];
    let caught = [];
    let normal = [];

    for (const player of winners) {
      if (getPauk(player.cards) >= 8) {
        doe.push(player);
      } else if (
        player.playState == Player.PlayStates.win ||
        player.playState == Player.PlayStates.lose
      ) {
        // Already catch players
        caught.push(player);
      } else {
        normal.push(player);
      }
    }

    sort(doe);
    sort(caught);
    sort(normal);

    const final = [...losers, ...doe, ...caught, ...normal, ...equalers];
    const finalWinners = [...doe, ...caught, ...normal, ...equalers];

    print("---------After sort---------");
    logPlayers(final);

    let _final = [];
    for (const p of final) {
      _final.push(p.index);
    }
    let _winners = [];
    for (const p of finalWinners) {
      _winners.push(p.index);
    }
    let _losers = [];
    for (const p of losers) {
      _losers.push(p.index);
    }
    return [_final, _winners, _losers];
  }

  // Balance Transfer

  transferToDealerBet(playerIndex, amount) {
    this.players[playerIndex].balance -= amount;
    this.dealerBet += amount;
    if (!this.players[playerIndex].isBot)
      this.logTransferToGameRoom(
        this.players[playerIndex].id,
        this.roomNo,
        amount
      );
  }

  transferToPlayerBet(playerIndex, amount) {
    this.players[playerIndex].balance -= amount;
    this.players[playerIndex].bet += amount;
    this.players[playerIndex].betOrigin = amount;
    if (!this.players[playerIndex].isBot)
      this.logTransferToGameRoom(
        this.players[playerIndex].id,
        this.roomNo,
        amount
      );
  }

  transferFromDealerToPlayerBet(playerIndex, amount) {
    this.dealerBet -= amount;
    this.players[playerIndex].bet += amount;
  }

  transferFromPlayerToDealerBet(playerIndex, amount) {
    this.dealerBet += amount;
    this.players[playerIndex].bet -= amount;
  }

  transferFromDealerBetToPlayerBalance(playerIndex) {
    console.log(`Transfer back dealer bet`);
    this.players[playerIndex].balance += this.dealerBet;
    if (!this.players[playerIndex].isBot)
      this.logTransferFromGameRoom(
        this.players[playerIndex].id,
        this.roomNo,
        this.dealerBet
      );
    this.dealerBet = 0;
  }

  transferFromPlayerBetToBalance(playerIndex) {
    this.players[playerIndex].balance += this.players[playerIndex].bet;
    if (!this.players[playerIndex].isBot)
      this.logTransferFromGameRoom(
        this.players[playerIndex].id,
        this.roomNo,
        this.players[playerIndex].bet
      );
    this.players[playerIndex].bet = 0;
  }

  transferFromPlayerBalanceToComission(playerIndex, amount, isDealer = false) {
    const playerId = this.players[playerIndex].id;
    if (playerId == "bot") return;
    this.players[playerIndex].balance -= amount;
    this.logTransferToCommission(playerId, this.roomNo, amount, isDealer);
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
      if (compareCard(players[i].cards, players[j].cards) == Comparison.LOSE) {
        let tmpPlayer = players[i];
        players[i] = players[j];
        players[j] = tmpPlayer;
      }
    }
  }
}

function getKeyByValue(object, value) {
  return Object.keys(object).find((key) => object[key] === value);
}

module.exports = Room;
