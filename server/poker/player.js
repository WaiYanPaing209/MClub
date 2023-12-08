const CardUtils = require("./cardUtils");

// Config
const isDebug = false;

function print(msg) {
  if (isDebug) {
    console.log(msg);
  }
}

const Comparison = {
  EQUAL: 0,
  WIN: 1,
  LOSE: -1,
};

class Player {
  static ConnStates = {
    wait: 0,
    active: 1,
    lost: 2,
    exit: 3,
  };

  constructor(id, balance, info, isBot = false) {
    this.id = id;
    this.index = null;
    this.initBalance = balance;
    this.balance = balance;
    this.info = info;
    this.isBot = isBot;
    this.cards = [];
    this.showCards = [];
    this.throwCards = [];
    this.lockCards = [];
    this.connState = isBot ? Player.ConnStates.active : Player.ConnStates.wait;
    this.winAmount = 0;
    this.isWaiting = true;
    this.lastActiveTime = Date.now();
    this.hasDraw = false;
    this.hasThrow = false;
    this.templateMoneyCards = [];
    this.playerMoneyCards = [];
    this.moneyPoints = 0;
  }

  autoSort() {
    this.cards = CardUtils.autoSort(this.cards);
  }

  cardNeeded() {
    return CardUtils.cardNeeded(this.cards);
  }

  moveCard(from, to) {
    let tmp = null;
    for (const [i, card] of this.cards.entries()) {
      if (card.id == from) {
        tmp = card;
        this.cards.splice(i, 1);
        break;
      }
    }
    for (const [i, card] of this.cards.entries()) {
      if (card.id == to) {
        this.cards = [...this.cards.slice(0, i), tmp, ...this.cards.slice(i)];
        break;
      }
    }
    return this.cards;
  }

  softReset() {
    this.hasDraw = false;
    this.hasThrow = false;
  }

  removeThrow(cardId) {
    for (let i = 0; i < this.throwCards.length; i++) {
      const card = this.throwCards[i];
      if (card.id == cardId) {
        this.throwCards.splice(i, 1);
        return;
      }
    }
  }

  reset() {
    this.cards = [];
    this.playerMoneyCards = [];
    this.moneyPoints = 0;
    this.showCards = [];
    this.throwCards = [];
    this.winAmount = 0;
    this.isWaiting = false;
    this.templateMoneyCards = [
      { shape: 3, mark: 1 },
      { shape: 1, mark: 7 },
      { shape: 0, mark: "X" },
      { shape: 1, mark: "X" },
      { shape: 2, mark: "X" },
      { shape: 3, mark: "X" },
    ];
  }

  calculateTotalMoneyCard(firstCard, secondCard) {
    [this.moneyPoints, this.playerMoneyCards] = CardUtils.calculateTotalMoneyCard(
      this.cards,
      firstCard,
      secondCard
    );
  }

  calculateDrawMoneyCard(card, firstCard, secondCard) {
    const [point, isMoneyCard] = CardUtils.calculateDrawMoneyCard(card, firstCard, secondCard);
    console.log(`Draw card - isMoneyCard : ${isMoneyCard}, point : ${point}`);
    if (isMoneyCard) {
      this.moneyPoints += point;
      this.playerMoneyCards.push(card);
    }
  }

  unlockAllCards() {
    this.lockCards = [];
  }

  getInfo() {
    let totalMoneyCard = 0;
    let cardInfo = { point: 0, matches: [] };
    if (this.cards.length >= 13) {
      cardInfo = CardUtils.calculatePoint(this.cards);
    }

    let _cards = [];
    for (const card of this.cards) {
      card.lock = false;
      card.match = null;
      card.isMoney = false;
      for (const c of this.lockCards) {
        if (card.id == c.id) {
          card.lock = true;
        }
      }
      for (let i = 0; i < cardInfo.matches.length; i++) {
        const m = cardInfo.matches[i];
        if (m.length <= 2) continue; // remove this line if you want all matches
        for (const c of m) {
          if (card.id == c.id) {
            card.match = i;
            break;
          }
        }
      }
      for (const c of this.templateMoneyCards) {
        if (card.shape == c.shape && card.mark == c.mark) {
          card.isMoney = true;
          totalMoneyCard++;
        }
      }
      _cards.push(card);
    }

    let _throwCards = this.throwCards;
    if (this.throwCards.length >= 5) {
      _throwCards = [];
      for (let i = this.throwCards.length - 5; i < this.throwCards.length; i++) {
        _throwCards.push(this.throwCards[i]);
      }
    }

    const info = {
      id: this.id,
      index: this.index,
      balance: this.balance,
      info: this.info,
      cards: _cards,
      show: this.showCards,
      throw: _throwCards,
      lock: this.lockCards,
      isWaiting: this.isWaiting,
      winAmount: this.winAmount,
      point: cardInfo.point,
      matches: cardInfo.matches,
      moneyPoints: this.moneyPoints,
      moneyCards: this.playerMoneyCards,
    };

    return info;
  }
}

module.exports = Player;
