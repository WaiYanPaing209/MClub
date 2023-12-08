// Config
const isDebug = true;

function print(msg) {
  if (isDebug) {
    console.log(msg);
  }
}

const CardUtils = {};

CardUtils.Check8x = (cards) => {
  for (const card of cards) {
    if (card.getRank() < 11) {
      return false;
    }
  }
  return true;
};

CardUtils.CheckBuSmall = (cards) => {
  let total = 0;
  for (const card of cards) {
    total += card.count;
  }
  return total <= 10;
};

CardUtils.CheckBuBig = (cards) => {
  let total = 0;
  for (const card of cards) {
    total += card.count;
  }

  return total % 10 == 0;
};

CardUtils.GetPauk = (cards) => {
  return (cards[0].count + cards[1].count) % 10;
};

CardUtils.GetMaxRank = (cards) => {
  const r1 = cards[0].getRank();
  const r2 = cards[1].getRank();

  if (r1 > r2) {
    return r1;
  } else {
    return r2;
  }
};

CardUtils.GetMaxShape = (cards) => {
  const c1 = cards[0].shape;
  const c2 = cards[1].shape;

  if (c1 > c2) {
    return c1;
  } else {
    return c2;
  }
};

CardUtils.CheckBuLastThree = (cards) => {
  return (cards[2].count + cards[3].count + cards[4].count) % 10 == 0;
};

CardUtils.MaxRankCardFromAllCards = (cards) => {
  let maxRankCard = cards[0];
  for (let i = 1; i < cards.length; i++) {
    if (maxRankCard.getRank() < cards[i].getRank()) {
      maxRankCard = cards[i];
    }
  }
  return maxRankCard;
};

module.exports = CardUtils;
