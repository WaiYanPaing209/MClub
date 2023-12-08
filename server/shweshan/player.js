const { getPauk } = require("./cardUtils");
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
    this.isWaiting = true;
    this.lastActiveTime = Date.now();
    this.isGiveUp = false;
  }

  autoOrder() {
    if (this.isValid()) return;
    let count = 0;
    let orderComplete = false;
    const start = Date.now();
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        if (j == i) continue;
        for (let k = 0; k < 8; k++) {
          if ([i, j].includes(k)) continue;
          for (let l = 0; l < 8; l++) {
            if ([i, j, k].includes(l)) continue;
            for (let m = 0; m < 8; m++) {
              if ([i, j, k, l].includes(m)) continue;
              for (let n = 0; n < 8; n++) {
                if ([i, j, k, l, m].includes(n)) continue;
                for (let o = 0; o < 8; o++) {
                  if ([i, j, k, l, m, n].includes(o)) continue;
                  for (let p = 0; p < 8; p++) {
                    if ([i, j, k, l, m, n, o].includes(p)) continue;
                    count++;
                    if (
                      CardUtils.isValid([
                        this.cards[i],
                        this.cards[j],
                        this.cards[k],
                        this.cards[l],
                        this.cards[m],
                        this.cards[n],
                        this.cards[o],
                        this.cards[p],
                      ])
                    ) {
                      const c1 = this.cards[i];
                      const c2 = this.cards[j];
                      const c3 = this.cards[k];
                      const c4 = this.cards[l];
                      const c5 = this.cards[m];
                      const c6 = this.cards[n];
                      const c7 = this.cards[o];
                      const c8 = this.cards[p];

                      const prevTopCards = [this.cards[0], this.cards[1]];
                      const prevBottomCards = [
                        this.cards[5],
                        this.cards[6],
                        this.cards[7],
                      ];
                      const nextTopCards = [c1, c2];
                      const nextBottomCards = [c6, c7, c8];
                      const topCompare = CardUtils.compareCard(
                        nextTopCards,
                        prevTopCards
                      );
                      if (topCompare == 1) {
                        this.cards = [c1, c2, c3, c4, c5, c6, c7, c8];
                      } else if (topCompare == 0) {
                        const bottomCompare = CardUtils.compareCard(
                          nextBottomCards,
                          prevBottomCards
                        );
                        if (bottomCompare == 1) {
                          this.cards = [c1, c2, c3, c4, c5, c6, c7, c8];
                        }
                      }
                      orderComplete = true;
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    const end = Date.now();
    console.log(`Auto order execution time : ${end - start}, count : ${count}`);
    if (!orderComplete) console.error(`Auto order incomplete`);
  }

  preOrder() {
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        if (j == i) continue;
        for (let k = 0; k < 8; k++) {
          if ([i, j].includes(k)) continue;
          for (let l = 0; l < 8; l++) {
            if ([i, j, k].includes(l)) continue;
            for (let m = 0; m < 8; m++) {
              if ([i, j, k, l].includes(m)) continue;
              for (let n = 0; n < 8; n++) {
                if ([i, j, k, l, m].includes(n)) continue;
                for (let o = 0; o < 8; o++) {
                  if ([i, j, k, l, m, n].includes(o)) continue;
                  for (let p = 0; p < 8; p++) {
                    if ([i, j, k, l, m, n, o].includes(p)) continue;
                    if (
                      CardUtils.isValid([
                        this.cards[i],
                        this.cards[j],
                        this.cards[k],
                        this.cards[l],
                        this.cards[m],
                        this.cards[n],
                        this.cards[o],
                        this.cards[p],
                      ])
                    ) {
                      return true;
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    return false;
  }

  reset() {
    this.cards = [];
    this.bet = 0;
    this.winAmount = 0;
    this.isWaiting = false;
    this.isGiveUp = false;
  }

  getInfo() {
    const info = {
      id: this.id,
      index: this.index,
      balance: this.balance,
      info: this.info,
      cards: this.cards,
      isWaiting: this.isWaiting,
      winAmount: this.winAmount,
      cardStatus: this.cardStatus(),
    };

    return info;
  }

  cardStatus() {
    if (this.cards.length < 8) return null;

    if (this.isGiveUp) return [-2, -2, -2];

    const pauk1 = CardUtils.getPauk([this.cards[0], this.cards[1]]);
    let pauk2 = CardUtils.getPauk([
      this.cards[2],
      this.cards[3],
      this.cards[4],
    ]);
    let pauk3 = CardUtils.getPauk([
      this.cards[5],
      this.cards[6],
      this.cards[7],
    ]);
    if (this.getMultiply(1) == 5) pauk2 = 11;
    if (this.getMultiply(2) == 5) pauk3 = 11;
    const last2CompareResult = CardUtils.compareCard(
      [this.cards[5], this.cards[6], this.cards[7]],
      [this.cards[2], this.cards[3], this.cards[4]]
    );
    if (
      (pauk1 == 8 || pauk1 == 9) &&
      (last2CompareResult == 1 || last2CompareResult == 0)
    ) {
      return [pauk1, pauk2, pauk3];
    } else {
      if (this.preOrder()) {
        return [-2, -2, -2];
      } else {
        return [-1, -1, -1];
      }
    }
  }

  // Step : 0-top, 1-middle, 2-bottom
  compare(other, step) {
    if (step == 0) {
      return CardUtils.compareNormal(
        [this.cards[0], this.cards[1]],
        [other.cards[0], other.cards[1]]
      );
    } else if (step == 1) {
      return CardUtils.compareCard(
        [this.cards[2], this.cards[3], this.cards[4]],
        [other.cards[2], other.cards[3], other.cards[4]]
      );
    } else if (step == 2) {
      return CardUtils.compareCard(
        [this.cards[5], this.cards[6], this.cards[7]],
        [other.cards[5], other.cards[6], other.cards[7]]
      );
    }
  }

  isValid() {
    if (this.isGiveUp) return false;

    if (this.cards.length < 8) {
      console.error("Call isValid method with no cards in player");
      return false;
    }

    return CardUtils.isValid(this.cards);
  }

  isAllNine() {
    if (!this.isValid()) return false;

    const pauk1 = CardUtils.getPauk([this.cards[0], this.cards[1]]);
    const pauk2 = CardUtils.getPauk([
      this.cards[2],
      this.cards[3],
      this.cards[4],
    ]);
    const pauk3 = CardUtils.getPauk([
      this.cards[5],
      this.cards[6],
      this.cards[7],
    ]);

    console.log(`${this.id} all nine check - ${pauk1}, ${pauk2}, ${pauk3}`);

    if (pauk1 == 9 && pauk2 == 9 && pauk3 == 9) {
      console.log(`${this.id} is all nine`);
      return true;
    }

    return false;
  }

  getMultiply(step) {
    if (step == 0) {
      const c1 = this.cards[0];
      const c2 = this.cards[1];
      if (c1.shape == c2.shape) {
        return 2;
      }
    } else if (step == 1) {
      const c1 = this.cards[2];
      const c2 = this.cards[3];
      const c3 = this.cards[4];
      if (c1.rank == c2.rank && c2.rank == c3.rank) {
        return 5;
      }
      if (c1.shape == c2.shape && c2.shape == c3.shape) {
        return 3;
      }
    } else if (step == 2) {
      const c1 = this.cards[5];
      const c2 = this.cards[6];
      const c3 = this.cards[7];
      if (c1.rank == c2.rank && c2.rank == c3.rank) {
        return 5;
      }
      if (c1.shape == c2.shape && c2.shape == c3.shape) {
        return 3;
      }
    }
    return 1;
  }
}

module.exports = Player;
