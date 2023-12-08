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
    active: 0,
    lost: 1,
    exit: 2,
  };

  constructor(id, balance, info, isBot = false) {
    this.id = id;
    this.index = null;
    this.initBalance = balance;
    this.balance = balance;
    this.info = info;
    this.isBot = isBot;
    this.cards = [];
    this.connState = Player.ConnStates.active;
    this.winAmount = 0;
    this.loseAmount = 0;
    this.betOrigin = 0;
    this.isWaiting = true;
    this.lastActiveTime = Date.now();
  }

  autoOrder() {
    if (this.isValid()) return;

    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5; j++) {
        if (j == i) continue;
        for (let k = 0; k < 5; k++) {
          if (k == i) continue;
          if (k == j) continue;
          if ((this.cards[i].count + this.cards[j].count + this.cards[k].count) % 10 == 0) {
            let arr = [];
            for (let l = 0; l < 5; l++) {
              if (l != i && l != j && l != k) arr.push(l);
            }
            const c1 = this.cards[arr[0]];
            const c2 = this.cards[arr[1]];
            const c3 = this.cards[i];
            const c4 = this.cards[j];
            const c5 = this.cards[k];

            this.cards = [c1, c2, c3, c4, c5];
            console.log(`${this.info.nickname} auto ordered`);
            return;
          }
        }
      }
    }
  }

  reset() {
    this.cards = [];
    this.bet = 0;
    this.winAmount = 0;
    this.loseAmount = 0;
    this.isWaiting = false;
  }

  getInfo() {
    const info = {
      id: this.id,
      index: this.index,
      balance: this.balance,
      bet: this.bet,
      info: this.info,
      cards: this.cards,
      isWaiting: this.isWaiting,
      winAmount: this.winAmount,
      loseAmount: this.loseAmount,
      cardStatus: this.cardStatus(),
    };

    return info;
  }

  cardStatus() {
    if (this.cards.length < 5) return null;

    if (!this.isValid()) return 0;

    if (CardUtils.CheckBuSmall(this.cards)) return 11;

    if (CardUtils.CheckBuBig(this.cards)) return 10;

    return CardUtils.GetPauk(this.cards);
  }

  compare(other) {
    // other player start with underscroll (_)
    const buSmall = CardUtils.CheckBuSmall(this.cards);
    const _buSmall = CardUtils.CheckBuSmall(other.cards);
    print(`Small Bu Check --- player : ${buSmall}, other : ${_buSmall}`);

    if (buSmall && !_buSmall) {
      return Comparison.WIN;
    } else if (!buSmall && _buSmall) {
      return Comparison.LOSE;
    }

    const valid = CardUtils.CheckBuLastThree(this.cards);
    const _valid = CardUtils.CheckBuLastThree(other.cards);
    print(`Valid Check --- player : ${valid}, other : ${_valid}`);

    if (valid && !_valid) {
      return Comparison.WIN;
    } else if (!valid && _valid) {
      return Comparison.LOSE;
    } else if (!valid && !_valid) {
      const maxCard = CardUtils.MaxRankCardFromAllCards(this.cards);
      const _maxCard = CardUtils.MaxRankCardFromAllCards(other.cards);

      if (maxCard.getRank() > _maxCard.getRank()) {
        return Comparison.WIN;
      } else if (maxCard.getRank() < _maxCard.getRank()) {
        return Comparison.LOSE;
      }

      if (maxCard.shape > _maxCard.shape) {
        return Comparison.WIN;
      } else if (maxCard.shape < _maxCard.shape) {
        return Comparison.LOSE;
      }
    }

    const buBig = CardUtils.CheckBuBig(this.cards);
    const _buBig = CardUtils.CheckBuBig(other.cards);
    print(`Big Bu Check --- player : ${buBig}, other : ${_buBig}`);

    if (buBig && !_buBig) {
      return Comparison.WIN;
    } else if (!buBig && _buBig) {
      return Comparison.LOSE;
    }

    const pauk = CardUtils.GetPauk(this.cards);
    const _pauk = CardUtils.GetPauk(other.cards);
    print(`Pauk Check --- player : ${pauk}, other : ${_pauk}`);

    if (pauk > _pauk) {
      return Comparison.WIN;
    } else if (pauk < _pauk) {
      return Comparison.LOSE;
    }

    const rank = CardUtils.GetMaxRank(this.cards);
    const _rank = CardUtils.GetMaxRank(other.cards);
    print(`Rank Check --- player : ${rank}, other : ${_rank}`);

    if (rank > _rank) {
      return Comparison.WIN;
    } else if (rank < _rank) {
      return Comparison.LOSE;
    }

    const shape = CardUtils.GetMaxShape(this.cards);
    const _shape = CardUtils.GetMaxShape(other.cards);
    print(`Shape Check --- player : ${shape}, other : ${_shape}`);

    if (shape > _shape) {
      return Comparison.WIN;
    } else if (shape < _shape) {
      return Comparison.LOSE;
    }

    print(`Impossible equal`);
    return Comparison.EQUAL;
  }

  isValid() {
    return CardUtils.CheckBuLastThree(this.cards);
  }

  getMultiply() {
    if (CardUtils.Check8x(this.cards)) return 8;

    if (CardUtils.CheckBuLastThree(this.cards)) {
      if (CardUtils.CheckBuSmall(this.cards) || CardUtils.CheckBuBig(this.cards)) return 5;

      const pauk = CardUtils.GetPauk(this.cards);
      if (pauk == 9) return 3;
      if (pauk >= 7) return 2;
    }

    return 1;
  }
}

module.exports = Player;
