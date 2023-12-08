const fs = require("fs");
const Player = require("./player");
const CardUtils = require("./cardUtils");

const sysConfig = JSON.parse(fs.readFileSync("config/system.json"));

// Config
const file_room_no = "./tmp/roomNo.txt";
const file_room_log = "./tmp/rooms/";

class Room {
  static GameStates = {
    destory: -1,
    wait: 0,
    start: 1,
    taxMoney: 2,
    play: 3,
    end: 4,
  };

  static BotMode = {
    sustain: 0,
    unfair: 1,
    burst: 2,
  };

  constructor(levelConfig, level, gameConfig, isPrivate = false) {
    // Room Config
    this.setConfig(gameConfig);
    this.isPrivate = isPrivate;

    if (this.isPrivate) {
      this.roomCode = Math.floor(100000 + Math.random() * 900000);
    }

    // Player variables
    this.level = level;
    this.levelConfig = levelConfig;
    this.totalPlayer = gameConfig.totalPlayer;
    this.players = [];

    // System variables
    this.gameState = Room.GameStates.wait;
    this.wait = Date.now();
    this.turnIndex = -1;
    this.prevTurn = -1;
    this.cards = [];
    this.taxCard = null;
    this.taxWinner = -1;
    this.taxWinnerCard = null;
    this.finalWinnerIndex = -1;
    this.finalDownAmount = 0;
    this.finalTransactions = [];
    this.secondCard = null;
    this.throwCard = null;
    this.botMode = Room.BotMode.sustain;
    this.botBalance = 0;
    this.isActive = true;

    this.zeroArr = [];
    for (let i = 0; i < this.totalPlayer; i++) {
      this.players.push(null);
      this.zeroArr.push(0);
    }
    this.finalTransactions = this.zeroArr;

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
    this.commission = config.commission;
    this.waitTime = config.waitTime;
    this.botMode = config.botMode;
    this.inactiveWaitTime = config.inactiveWaitTime;
    this.isActive = config.isActive;
  }

  update(sendByRoomNo) {
    const currentTime = Date.now();
    if (currentTime < this.wait) return;
    console.log(`GameState : ${this.gameState}`);
    switch (this.gameState) {
      case Room.GameStates.wait:
        this._wait(sendByRoomNo);
        break;
      case Room.GameStates.start:
        this._taxMoney(sendByRoomNo);
        break;
      case Room.GameStates.taxMoney:
        this._play(sendByRoomNo);
        break;
      case Room.GameStates.play:
        this._play(sendByRoomNo);
        break;
      case Room.GameStates.end:
        this._start(sendByRoomNo);
        break;
    }
    // log room info
    this.log(JSON.stringify(this.getInfo()));
  }

  _wait(sendByRoomNo) {
    console.log(`Game State : Wait`);
    if (this.isPrivate) {
      if (this.totalRealPlayer() > 1) {
        this._start(sendByRoomNo);
        return;
      }
    } else {
      if (this.totalActivePlayer() >= 2 && this.totalRealPlayer() >= 1) {
        this._start(sendByRoomNo);
        return;
      }
    }
    this.wait = Date.now() + this.waitTime.wait * 1000;
    sendByRoomNo(this.roomNo, { head: "room info", body: this.getInfo() });
  }

  _start(sendByRoomNo) {
    console.log(`GameState : Start`);
    for (const player of this.players) {
      if (!player) continue;
      if (!player.isBot) {
        if (player.winAmount > 0) {
          const commission = player.winAmount * (this.commission / 100);
          this.commTransferToCommission(player.id, commission);
          this.players[player.index].winAmount -= commission;
        }
        this.commAddUserBalance(
          player.id,
          this.players[player.index].winAmount
        );
        this.commPlayLog(this.players[player.index]);
      }
      if (
        player.connState == Player.ConnStates.exit ||
        player.connState == Player.ConnStates.lost ||
        (Date.now() - player.lastActiveTime > this.inactiveWaitTime &&
          !player.isBot &&
          player.isWaiting == false) ||
        player.balance < this.levelConfig.minAmount
      ) {
        this.players[player.index] = null;
        if (this.totalRealPlayer() == 0) {
          this.gameState = Room.GameStates.destory;
          sendByRoomNo(this.roomNo, {
            head: "room info",
            body: this.getInfo(),
          });
          return;
        }
      }
      player.reset();
    }

    this.finalTransactions = this.zeroArr;
    this.finalDownAmount = 0;
    this.resetCards();
    this.startDeliver();
    this.gameState = Room.GameStates.start;
    this.wait = Date.now() + this.waitTime.start * 1000;
    console.log(
      `Update game state to start. Delta Time ${this.wait - Date.now()}`
    );
    sendByRoomNo(this.roomNo, { head: "room info", body: this.getInfo() });
  }

  _taxMoney(sendByRoomNo) {
    let r = Math.floor(Math.random() * this.cards.length);
    this.taxCard = this.cards[r];
    this.cards.splice(r, 1);

    const findExactMatch = () => {
      for (const player of this.players) {
        if (!player) continue;
        if (player.isWaiting) continue;
        for (const card of player.cards) {
          if (
            card.shape == this.taxCard.shape &&
            card.rank == this.taxCard.rank
          ) {
            this.taxWinnerCard = card;
            return player.index;
          }
        }
      }
      return null;
    };

    const findBestMatch = () => {
      let maxPlayerIndex = -1;
      let max = null;
      for (const player of this.players) {
        if (!player) continue;
        if (player.isWaiting) continue;
        for (const card of player.cards) {
          if (max == null) {
            max = card;
            maxPlayerIndex = player.index;
            continue;
          }
          if (card.shape == this.taxCard.shape && card.rank > max.rank) {
            max = card;
            maxPlayerIndex = player.index;
          }
        }
      }
      this.taxWinnerCard = max;
      return maxPlayerIndex;
    };

    const showCompareCards = () => {
      for (const player of this.players) {
        if (!player) continue;
        if (player.isWaiting) continue;
        let maxCard = null;
        for (const card of player.cards) {
          if (
            card.shape == this.taxCard.shape &&
            card.rank == this.taxCard.rank
          ) {
            player.showCards.push(card);
            return;
          }
        }
        for (const card of player.cards) {
          if (!maxCard) {
            maxCard = card;
            continue;
          }
          if (card.shape == this.taxCard.shape && card.rank > maxCard.rank) {
            maxCard = card;
          }
        }
        if (maxCard) player.showCards.push(maxCard);
      }
    };

    showCompareCards();

    let winnerIndex = findExactMatch();

    if (winnerIndex != null) {
      this.transferFromLosersToWinner(winnerIndex, this.levelConfig.taxMoney);
    } else {
      winnerIndex = findBestMatch();
      this.transferFromLosersToWinner(winnerIndex, this.levelConfig.taxMoney);
    }
    this.taxWinner = winnerIndex;

    let r2 = Math.floor(Math.random() * this.cards.length);
    this.secondCard = this.cards[r2];
    this.throwCard = this.cards[r2];
    this.cards.splice(r2, 1);

    // Add to player money cards
    for (const p of this.players) {
      if (!p) continue;
      p.templateMoneyCards.push(this.taxCard, this.secondCard);
    }

    // Calculate money cards
    for (const player of this.players) {
      if (!player) continue;
      if (player.isWaiting) continue;
      player.calculateTotalMoneyCard(this.taxCard, this.secondCard);
      console.log(`${player.index} money card : ${player.moneyPoints}`);
    }

    this.gameState = Room.GameStates.taxMoney;
    this.wait = Date.now() + this.waitTime.taxMoney * 1000;
    sendByRoomNo(this.roomNo, { head: "room info", body: this.getInfo() });
  }

  _play(sendByRoomNo) {
    if (this.turnIndex != -1) {
      const player = this.players[this.turnIndex];
      if (!player.hasDraw) {
        if (player.isBot) {
          let shouldEat = false;
          let cardNeeded = player.cardNeeded();
          console.log(`Card need by bot - `);
          console.log(cardNeeded);
          for (const c in cardNeeded) {
            if (
              this.throwCard.shape == c.shape &&
              this.throwCard.order == c.order
            ) {
              shouldEat = true;
            }
          }
          if (shouldEat) {
            console.log(`Bot eat throw card!`);
            const card = this.botEat(player.index, sendByRoomNo);
            sendByRoomNo(this.roomNo, {
              head: "eat",
              body: { index: player.index, card },
            });
          } else {
            console.log(`Bot draw card!`);
            let card = this.drawCardNeeded(this.turnIndex);
            if (!card) card = this.drawRandomCard(this.turnIndex);
            player.calculateDrawMoneyCard(card, this.taxCard, this.secondCard);
            sendByRoomNo(this.roomNo, {
              head: "draw",
              body: { index: player.index, card },
            });
          }
        } else {
          const card = this.drawRandomCard(this.turnIndex);
          sendByRoomNo(this.roomNo, {
            head: "draw",
            body: { index: player.index, card },
          });
          player.calculateDrawMoneyCard(card, this.taxCard, this.secondCard);
        }
      }

      if (this.players[this.turnIndex].isBot)
        this.players[this.turnIndex].autoSort();
      console.log(
        `Player ${player.info.nickname} total cards - ${player.cards.length}`
      );
      if (player.cards.length == 14) {
        console.log(`Check card to throw`);
        let i = 13;
        while (i >= 0) {
          let card = player.cards[i];
          let isLock = false;
          for (const c of player.lockCards) {
            if (card.id == c.id) {
              isLock = true;
            }
          }
          if (card.mark == "X") isLock = true;
          if (!isLock) break;
          i--;
        }
        const card = player.cards[i];
        this.players[this.turnIndex].cards.splice(i, 1);
        this.players[this.turnIndex].throwCards.push(card);
        this.throwCard = card;
      }
      this.players[this.turnIndex].softReset();
    }

    if (this.winCheck()) {
      this._end(sendByRoomNo);
      return;
    }
    this.nextTurn();
    this.gameState = Room.GameStates.play;
    this.wait = Date.now() + this.waitTime.play * 1000;
    sendByRoomNo(this.roomNo, { head: "room info", body: this.getInfo() });
  }

  _end(sendByRoomNo) {
    this.finalWinnerIndex = this.turnIndex;
    this.finalDownAmount =
      this.levelConfig.downMoney +
      this.players[this.finalWinnerIndex].moneyPoints *
        this.levelConfig.taxMoney;
    this.transferFromLosersToWinner(
      this.finalWinnerIndex,
      this.finalDownAmount
    );
    let compareLog = [];
    for (let i = 0; i < this.totalPlayer - 1; i++) {
      if (i == this.finalWinnerIndex) continue;
      const p1 = this.players[i];
      if (!p1) continue;
      if (p1.isWaiting) continue;
      for (let j = i + 1; j < this.totalPlayer; j++) {
        if (j == this.finalWinnerIndex) continue;
        const p2 = this.players[j];
        if (!p2) continue;
        if (p2.isWaiting) continue;
        compareLog.push([i, j]);
        const m1 = p1.moneyPoints;
        const m2 = p2.moneyPoints;

        if (m1 > m2) {
          const amount = (m1 - m2) * this.levelConfig.taxMoney;
          const amt = this.transfer(p2.index, p1.index, amount);
          this.finalTransactions[p1.index] += amt;
          this.finalTransactions[p2.index] -= amt;
        } else if (m2 > m1) {
          const amount = (m2 - m1) * this.levelConfig.taxMoney;
          const amt = this.transfer(p1.index, p2.index, amount);
          this.finalTransactions[p1.index] -= amt;
          this.finalTransactions[p2.index] += amt;
        }
      }
    }
    console.log("Compare Log");
    console.log(compareLog);

    // Exit if not active
    if (!this.isActive) {
      for (const player of this.players) {
        if (!player) continue;
        if (player.isBot) continue;
        player.connState = Player.ConnStates.exit;
      }
    }

    this.gameState = Room.GameStates.end;
    this.wait = Date.now() + this.waitTime.end * 1000;
    sendByRoomNo(this.roomNo, { head: "room info", body: this.getInfo() });
  }

  nextTurn() {
    this.prevTurn = this.turnIndex;
    this.turnIndex++;
    if (this.turnIndex >= this.totalPlayer) this.turnIndex = 0;
    while (true) {
      if (
        this.players[this.turnIndex] == null ||
        this.players[this.turnIndex].isWaiting
      ) {
        this.turnIndex++;
        if (this.turnIndex >= this.totalPlayer) this.turnIndex = 0;
      } else {
        break;
      }
    }
  }

  autoSort(ws, sendByRoomNo) {
    if (this.gameState != Room.GameStates.play) return;
    console.log(`Auto sort request - `);
    console.log(ws.user);
    this.players[ws.user.index].autoSort();
    const body = this.players[ws.user.index].getInfo();
    ws.send(JSON.stringify({ head: "card sorted", body }));
    this.ping(ws.user.index);
  }

  moveCard(ws, from, to) {
    this.players[ws.user.index].moveCard(from, to);
    const body = this.players[ws.user.index].getInfo();
    ws.send(JSON.stringify({ head: "card sorted", body }));
    this.ping(ws.user.index);
  }

  botEat(index, sendByRoomNo) {
    if (this.throwCard == null) return;
    this.players[index].cards.push(this.throwCard);
    this.players[index].showCards.push(this.throwCard);
    this.players[index].lockCards.push(this.throwCard);
    if (this.prevTurn != -1)
      this.players[this.prevTurn].removeThrow(this.throwCard.id);
    this.players[index].hasDraw = true;
    this.throwCard.lock = true;
    sendByRoomNo(this.roomNo, {
      head: "eat",
      body: { index, card: this.throwCard },
    });
    let tmp = this.throwCard;
    this.throwCard = null;
    return tmp;
  }

  eat(ws, sendByRoomNo) {
    if (this.gameState != Room.GameStates.play) return;
    if (this.turnIndex != ws.user.index) return;
    if (this.throwCard == null) return;
    this.players[ws.user.index].cards.push(this.throwCard);
    this.players[ws.user.index].showCards.push(this.throwCard);
    this.players[ws.user.index].lockCards.push(this.throwCard);
    if (this.prevTurn != -1)
      this.players[this.prevTurn].removeThrow(this.throwCard.id);
    this.players[ws.user.index].hasDraw = true;
    this.throwCard.lock = true;
    sendByRoomNo(this.roomNo, {
      head: "eat",
      body: { index: ws.user.index, card: this.throwCard },
    });
    this.throwCard = null;
    this.ping(ws.user.index);
  }

  draw(ws, sendByRoomNo) {
    if (this.gameState != Room.GameStates.play) return;
    if (this.turnIndex != ws.user.index) return;
    let card = this.drawRandomCard(this.turnIndex);
    this.players[ws.user.index].hasDraw = true;
    this.players[ws.user.index].calculateDrawMoneyCard(
      card,
      this.taxCard,
      this.secondCard
    );
    card.lock = false;
    this.ping(ws.user.index);
    sendByRoomNo(this.roomNo, {
      head: "draw",
      body: { index: ws.user.index, card },
    });
  }

  shoot(ws, index, sendByRoomNo) {
    if (this.gameState != Room.GameStates.play) return;
    if (this.turnIndex != ws.user.index) return;
    const player = this.players[ws.user.index];
    if (player.cards.length == 13) return;
    const card = player.cards[index];
    for (const c of player.lockCards) {
      if (c.id == card.id) {
        ws.send(JSON.stringify({ head: "shoot", body: { status: "lock" } }));
        return;
      }
    }
    player.cards.splice(index, 1);
    player.throwCards.push(card);
    this.throwCard = card;

    player.softReset();
    if (this.winCheck(ws)) {
      const body = this.players[ws.user.index].getInfo();
      ws.send(JSON.stringify({ head: "card sorted", body }));
      this._end(sendByRoomNo);
      return;
    }
    this.nextTurn(sendByRoomNo);
    this.gameState = Room.GameStates.play;
    this.wait = Date.now() + this.waitTime.play * 1000;
    sendByRoomNo(this.roomNo, { head: "room info", body: this.getInfo() });
    this.ping(ws.user.index);
  }

  winCheck(ws) {
    if (this.turnIndex == -1) return false;
    const result = this.players[this.turnIndex].getInfo();
    console.log(`Player ${this.turnIndex} point : ${result.point}`);
    if (result.point == 13) {
      return true;
    }
    const _cards = CardUtils.autoSort(this.players[this.turnIndex].cards);
    const _result = CardUtils.calculatePoint(_cards);
    if (_result.point == 13) {
      this.players[this.turnIndex].autoSort();
      const body = this.players[this.turnIndex].getInfo();
      ws.send(JSON.stringify({ head: "card sorted", body }));
      return true;
    }
    return false;
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

  totalBot() {
    let count = 0;
    for (const player of this.players) {
      if (!player) continue;
      if (player.isBot) count++;
    }
    return count;
  }

  resetCards() {
    this.cards = CardUtils.generateCards();
  }

  startDeliver() {
    for (const player of this.players) {
      if (!player) continue;
      if (player.connState == Player.ConnStates.wait) continue;
      player.cards = [];
      for (let i = 0; i < 13; i++) {
        this.drawRandomCard(player.index);
      }
    }
  }

  drawRandomCard(playerIndex) {
    if (this.cards.length <= 0) {
      this.destroy();
      return;
    }
    let r = Math.floor(Math.random() * this.cards.length);
    const card = this.cards[r];
    this.players[playerIndex].cards.push(card);
    this.cards.splice(r, 1);
    console.log(`Draw Random Card - `);
    console.log(card);
    return card;
  }

  drawCardNeeded(playerIndex) {
    if (this.cards.length <= 0) {
      this.destroy();
      return;
    }
    const cardNeeded = this.players[playerIndex].cardNeeded();
    console.log(`Card needed - `);
    console.log(cardNeeded);
    for (const c of cardNeeded) {
      for (const [i, card] of this.cards.entries()) {
        if (card.shape == c.shape && card.order == c.order) {
          this.players[playerIndex].cards.push(card);
          this.cards.splice(i, 1);
          console.log(`Found card needed - `);
          console.log(card);
          return card;
        }
      }
    }
    console.log(`Card needed not found`);
    return null;
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

  removePlayer(id) {
    for (const [i, p] of this.players.entries()) {
      if (p.id == id) {
        this.players[i] = null;
        return true;
      }
    }
    return false;
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
      roomNo: this.roomNo,
      isPrivate: this.isPrivate,
      taxCard: this.taxCard,
      secondCard: this.secondCard,
      throwCard: this.throwCard,
      totalCard: this.cards.length,
      gameState: this.gameState,
      turnIndex: this.turnIndex,
      wait: parseInt((this.wait - Date.now()) / 1000),
      players: arr,
    };

    if (this.isPrivate) data.roomCode = this.roomCode;

    if (this.gameState == Room.GameStates.taxMoney) {
      data.taxWinner = this.taxWinner;
      data.taxWinnerCard = this.taxWinnerCard;
    }

    if (this.gameState == Room.GameStates.end) {
      data.finalWinner = this.finalWinnerIndex;
      data.finalTransactions = this.finalTransactions;
      data.finalDownAmount = this.finalDownAmount;
    }

    return data;
  }

  destroy() {
    this.gameState = Room.GameStates.destory;
  }

  exit(id) {
    for (const player of this.players) {
      if (!player) continue;
      if (player.id == id) {
        player.connState = Player.ConnStates.exit;
        if (player.isWaiting) {
          this.players[player.index] = null;
          if (this.totalRealPlayer() == 0) {
            this.gameState = Room.GameStates.destory;
          }
        }
        return;
      }
    }
  }

  ping(index) {
    for (const player of this.players) {
      if (!player) continue;
      if (player.index == index) {
        player.lastActiveTime = Date.now();
      }
    }
  }

  transferFromLosersToWinner(winnerIndex, amount) {
    for (const player of this.players) {
      if (!player) {
        continue;
      }
      if (player.isWaiting) continue;
      if (player.index == winnerIndex) continue;

      this.transfer(player.index, winnerIndex, amount);
    }
  }

  transfer(from, to, amount) {
    let _amount = amount;
    if (this.players[from].balance < amount) {
      _amount = this.players[from].balance;
    }
    this.players[from].balance -= _amount;
    this.players[to].balance += _amount;
    this.players[from].winAmount -= _amount;
    this.players[to].winAmount += _amount;

    return _amount;
  }

  async commTransferToCommission(id, amount) {
    const data = { id, amount, game: "poker" };

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
      console.log(`Account api error on - transfer to commission`);
    });

    if (respond?.status == "ok") {
      console.log(
        `Transfer to commission from player ${id} - amount ${amount}`
      );
    }
  }

  async commAddUserBalance(id, amount) {
    const data = { id, amount, game: "poker" };

    const respond = await fetch(sysConfig.accountUrl + "add_user_balance", {
      method: "POST",
      body: JSON.stringify(data),
      headers: {
        "Content-type": "application/json; charset=UTF-8",
      },
    }).catch((err) => {
      console.log(`Account api error on - add user balance`);
    });

    if (respond?.status == "ok") {
      console.log(`Add user balance to player ${id} - amount ${amount}`);
    }
  }

  commPlayLog(player) {
    if (player.winAmount == 0) return;
    let data = {
      playerId: player.id,
      game: "poker",
      bet: this.levelConfig.taxMoney,
      amount: player.winAmount,
      status: player.winAmount > 0 ? "win" : "lose",
      level: this.level,
      roomNo: this.roomNo,
    };

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

module.exports = Room;
