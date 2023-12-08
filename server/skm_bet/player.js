class Player {
  constructor(id, balance, info) {
    this.id = id;
    this.balance = balance;
    this.info = info;
    this.bet = [0, 0, 0, 0];
  }

  getInfo() {
    return {
      id: this.id,
      balance: this.balance,
      bet: this.bet,
      info: this.info,
    };
  }

  reset() {
    this.bet = [0, 0, 0, 0];
  }
}

module.exports = Player;
