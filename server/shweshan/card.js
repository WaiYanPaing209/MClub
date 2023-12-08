// Config
const isDebug = false;

function print(msg) {
  if (isDebug) {
    console.log(msg);
  }
}

class Card {
  static Shapes = {
    club: 0,
    diamond: 1,
    heart: 2,
    spade: 3,
  };

  constructor(shape, rank) {
    this.shape = shape;
    this.rank = rank;
    this.count = isNaN(rank) ? 10 : rank;
    print(`Card created - rank : ${rank}, shape : ${shape}, count : ${this.count}`);
  }

  getRank() {
    let result = this.rank;
    switch (this.rank) {
      case "D":
        result = 10;
        break;
      case "J":
        result = 11;
        break;
      case "Q":
        result = 12;
        break;
      case "K":
        result = 13;
        break;
      case 1:
        result = 14;
        break;
    }
    return result;
  }
}

module.exports = Card;
