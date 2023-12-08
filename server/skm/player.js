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
  static PlayStates = {
    waiting: 0,
    uncatch: 1,
    win: 2,
    lose: 3,
  };

  static ConnStates = {
    wait: 0,
    active: 1,
    lost: 2,
    exit: 3,
  };

  constructor(id, balance, info, isBot = false, passcode = null) {
    this.id = id;
    this.index = null;
    this.initBalance = balance;
    this.balance = balance;
    this.info = info;
    this.isBot = isBot;
    this.cards = [];
    this.requestDraw = false;
    this.playState = Player.PlayStates.waiting;
    this.connState = isBot ? Player.ConnStates.active : Player.ConnStates.wait;
    this.winAmount = 0;
    this.loseAmount = 0;
    this.bet = 0;
    this.betOrigin = 0;
    this.lastActiveTime = Date.now();
    this.initTime = Date.now();
    this.passcode = passcode;
    this.history = [];
  }

  reset() {
    this.betOrigin = 0;
    if (this.connState != Player.ConnStates.wait) {
      this.playState = Player.PlayStates.uncatch;
    }
    this.cards = [];
    this.winAmount = 0;
    this.loseAmount = 0;
    this.requestDraw = false;
  }

  getWinPercent() {
    if (this.history.length < 5) return 50;
    let count = 0;
    for (const h of this.history) {
      if (h == Player.PlayStates.win) {
        count++;
      }
    }
    return (count / this.history.length) * 100;
  }

  getMultiply() {
    if (this.cards.length < 2) return 0;

    if (this.cards.length == 2) {
      if (this.cards[0].shape == this.cards[1].shape) {
        return 2;
      }
    }
    if (this.cards.length == 3) {
      if (
        this.cards[0].shape == this.cards[1].shape &&
        this.cards[0].shape == this.cards[2].shape
      ) {
        return 3;
      } else if (
        this.cards[0].rank == this.cards[1].rank &&
        this.cards[0].rank == this.cards[2].rank
      ) {
        return 5;
      }
    }
    return 0;
  }

  getPauk() {
    let count = 0;
    for (const card of this.cards) {
      count += card.count;
    }
    const pauk = count % 10;
    return pauk;
  }

  getMaxRank() {
    let max = this.cards[0].getRank();
    if (max < this.cards[1].getRank()) max = this.cards[1].getRank();
    if (this.cards.length >= 3) {
      if (max < this.cards[2].getRank()) max = this.cards[2].getRank();
    }
    return max;
  }

  getMaxRankCard() {
    let max = this.cards[0];
    if (max.getRank() < this.cards[1].getRank()) max = this.cards[1];
    if (this.cards.length >= 3) {
      if (max.getRank() < this.cards[2].getRank())
        max = this.cards[2].getRank();
    }
    return max;
  }

  compareCount(other) {
    if (this.cards.length < other.cards.length) {
      return Comparison.WIN;
    } else if (this.cards.length > other.cards.length) {
      return Comparison.LOSE;
    } else {
      return Comparison.EQUAL;
    }
  }

  compareRank(other) {
    const originRank = this.getMaxRank();
    const otherRank = other.getMaxRank();
    if (originRank > otherRank) {
      return Comparison.WIN;
    } else if (originRank < otherRank) {
      return Comparison.LOSE;
    } else {
      return Comparison.EQUAL;
    }
  }

  compareShape(other) {
    const originCard = this.getMaxRankCard();
    const otherCard = other.getMaxRankCard();
    if (originCard.shape > otherCard.shape) {
      return Comparison.WIN;
    } else if (originCard.shape < otherCard.shape) {
      return Comparison.LOSE;
    } else {
      return Comparison.EQUAL;
    }
  }

  compareNormal(other) {
    const originPauk = this.getPauk();
    const otherPauk = other.getPauk();
    print(`Origin Pauk : ${originPauk}, Other Pauk : ${otherPauk}`);
    print(
      `Origin Max Rank : ${this.getMaxRank()}, Other Max Rank : ${other.getMaxRank()}`
    );

    if (originPauk > otherPauk) {
      print("Win coz pauk is larger");
      return Comparison.WIN;
    } else if (originPauk < otherPauk) {
      print("Lose coz pauk is smaller");
      return Comparison.LOSE;
    } else {
      const resultCount = this.compareCount(other);
      if (resultCount != Comparison.EQUAL) {
        print("Result from card count");
        return resultCount;
      }

      const resultRank = this.compareRank(other);
      if (resultRank != Comparison.EQUAL) {
        print("Result from rank comparison");
        return resultRank;
      }

      const resultShape = this.compareShape(other);
      if (resultShape != Comparison.EQUAL) {
        print("Result from shape comaparison");
        return resultShape;
      }

      return Comparison.EQUAL;
    }
  }

  compareCard(other) {
    const originPauk = this.getPauk();
    const otherPauk = other.getPauk();

    // Doe Compare
    let isOriginDoe = false;
    if (originPauk >= 8 && this.cards.length == 2) {
      isOriginDoe = true;
    }

    let isOtherDoe = false;
    if (otherPauk >= 8 && other.cards.length == 2) {
      isOtherDoe = true;
    }

    if (isOriginDoe && !isOtherDoe) {
      print("Result from Doe");
      return Comparison.WIN;
    } else if (!isOriginDoe && isOtherDoe) {
      print("Result from Doe");
      return Comparison.LOSE;
    } else if (isOriginDoe && isOtherDoe) {
      print("Both are Doe");
      const compareResult = this.compareNormal(other);
      if (compareResult != Comparison.EQUAL) {
        return compareResult;
      }
    }

    // 5x Compare
    let isOrigin5x = 0;
    if (this.cards.length == 3) {
      if (
        this.cards[0].rank == this.cards[1].rank &&
        this.cards[1].rank == this.cards[2].rank
      ) {
        isOrigin5x = 1;
      }
    }

    let isOther5x = 0;
    if (other.cards.length == 3) {
      if (
        other.cards[0].rank == other.cards[1].rank &&
        other.cards[1].rank == other.cards[2].rank
      ) {
        isOther5x = 1;
      }
    }

    if (isOrigin5x > isOther5x) {
      print("Result from 5x");
      return Comparison.WIN;
    } else if (isOrigin5x < isOther5x) {
      print("Result from 5x");
      return Comparison.LOSE;
    }

    // Result for non doe compare
    return this.compareNormal(other);
  }
}

module.exports = Player;
