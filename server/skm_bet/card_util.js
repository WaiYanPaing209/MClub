// Config
const isDebug = false;

const Comparison = {
  EQUAL: 0,
  WIN: 1,
  LOSE: -1,
};

const Shapes = {
  club: 0,
  diamond: 1,
  heart: 2,
  spade: 3,
};

function print(msg) {
  if (isDebug) {
    console.log(msg);
  }
}

function getPauk(cards) {
  let count = 0;
  for (const card of cards) {
    if (!card) continue;
    count += card.count;
  }
  const pauk = count % 10;
  return pauk;
}

function getRank(card) {
  let result = card.rank;
  switch (card.rank) {
    case 1:
      result = 14;
      break;
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
  }
  return result;
}

function getMaxRank(cards) {
  let max = getRank(cards[0]);
  if (max < getRank(cards[1])) max = getRank(cards[1]);
  if (cards[2]) {
    if (max < getRank(cards[2])) max = getRank(cards[2]);
  }
  return max;
}

function getMaxRankCard(cards) {
  let max = cards[0];
  if (getRank(max) < getRank(cards[1])) max = cards[1];
  if (cards[2]) {
    if (getRank(max) < getRank(cards[2])) max = cards[2];
  }
  return max;
}

function getMaxShape(cards) {
  let max = cards[0].shape;
  if (max < cards[1].shape) max = cards[1].shape;
  if (cards[3]) {
    if (max < cards[2].shape) max = cards[2].shape;
  }
  return max;
}

function compareCount(origin, other) {
  if (origin[2] == null && other[2] != null) {
    return Comparison.WIN;
  } else if (origin[2] != null && other[2] == null) {
    return Comparison.LOSE;
  } else {
    return Comparison.EQUAL;
  }
}

function compareRank(origin, other) {
  const originRank = getMaxRank(origin);
  const otherRank = getMaxRank(other);
  if (originRank > otherRank) {
    return Comparison.WIN;
  } else if (originRank < otherRank) {
    return Comparison.LOSE;
  } else {
    return Comparison.EQUAL;
  }
}

function compareShape(origin, other) {
  const originCard = getMaxRankCard(origin);
  const otherCard = getMaxRankCard(other);
  if (originCard.shape > otherCard.shape) {
    return Comparison.WIN;
  } else if (originCard.shape < otherCard.shape) {
    return Comparison.LOSE;
  } else {
    return Comparison.EQUAL;
  }
}

function compareNormal(origin, other) {
  const originPauk = getPauk(origin);
  const otherPauk = getPauk(other);
  print(`Origin Pauk : ${originPauk}, Other Pauk : ${otherPauk}`);
  print(`Origin Max Rank : ${getMaxRank(origin)}, Other Max Rank : ${getMaxRank(other)}`);

  if (originPauk > otherPauk) {
    print("Win coz pauk is larger");
    return Comparison.WIN;
  } else if (originPauk < otherPauk) {
    print("Win coz pauk is smaller");
    return Comparison.LOSE;
  } else {
    const resultCount = compareCount(origin, other);
    if (resultCount != Comparison.EQUAL) {
      print("Result from card count");
      return resultCount;
    }

    const resultRank = compareRank(origin, other);
    if (resultRank != Comparison.EQUAL) {
      print("Result from rank comparison");
      return resultRank;
    }

    const resultShape = compareShape(origin, other);
    if (resultShape != Comparison.EQUAL) {
      print("Result from shape comaparison");
      return resultShape;
    }

    return Comparison.EQUAL;
  }
}

function compareCard(origin, other) {
  const originPauk = getPauk(origin);
  const otherPauk = getPauk(other);

  // Doe Compare
  let isOriginDoe = false;
  if (originPauk >= 8 && origin[2] == null) {
    isOriginDoe = true;
  }

  let isOtherDoe = false;
  if (otherPauk >= 8 && other[2] == null) {
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
    const compareResult = compareNormal(origin, other);
    if (compareResult != Comparison.EQUAL) {
      return compareResult;
    }
  }

  // 5x Compare
  let isOrigin5x = 0;
  if (origin[2]) {
    if (origin[0].rank == origin[1].rank && origin[1].rank == origin[2].rank) {
      isOrigin5x = 1;
    }
  }

  let isOther5x = 0;
  if (other[2]) {
    if (other[0].rank == other[1].rank && other[1].rank == other[2].rank) {
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
  return compareNormal(origin, other);
}

module.exports = { compareCard, getPauk };
