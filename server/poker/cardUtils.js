const CardUtils = {};

CardUtils.generateCards = () => {
  let arr = [];
  let id = 0;
  for (let k = 0; k < 2; k++) {
    for (let i = 0; i < 4; i++) {
      for (let j = 1; j <= 13; j++) {
        let count = j;
        if (j > 10) count = 10;
        let mark = j;
        if (mark == 10) {
          mark = "D";
        } else if (mark == 11) {
          mark = "J";
        } else if (mark == 12) {
          mark = "Q";
        } else if (mark == 13) {
          mark = "K";
        }
        let order = j;
        let rank = j - 1;
        if (j == 1) {
          rank = 13;
        }
        let card = {
          shape: i,
          rank,
          order,
          count,
          mark,
          id: id++,
        };
        arr.push(card);
      }
    }
  }
  for (let i = 0; i < 4; i++) {
    arr.push({ shape: i, mark: "X", id: id++ });
  }
  return arr;
};

CardUtils.orderSort = (_cards) => {
  let cards = [..._cards];
  for (let a = 0; a < cards.length - 1; a++) {
    for (let b = a + 1; b < cards.length; b++) {
      if (cards[b].order < cards[a].order) {
        let tmp = cards[a];
        cards[a] = cards[b];
        cards[b] = tmp;
      }
    }
  }
  return cards;
};

CardUtils.separateJokers = (_cards) => {
  let cards = [..._cards];
  let jokers = [];
  for (const [i, card] of cards.entries()) {
    if (!card) {
      console.error(`Card error in separate jokers - `);
      console.log(card);
      continue;
    }
    if (card.mark == "X") {
      jokers.push(card);
      cards.splice(i, 1);
    }
  }
  return { cards, jokers };
};

CardUtils.autoSort = (_cards) => {
  let matches = [];

  let sep = CardUtils.separateJokers(_cards);
  let jokers = sep.jokers;

  let cards = CardUtils.orderSort(sep.cards);
  for (let a = 0; a < cards.length; a++) {
    const selCard = cards[a];
    let series = [a];
    let parallel = [a];
    for (let b = 0; b < cards.length; b++) {
      if (a == b) continue;
      const card = cards[b];
      if (card.rank == selCard.rank) {
        parallel.push(b);
      }
      const lastIndex = series.slice(-1);
      const lastCard = cards[lastIndex];
      if (card.order == lastCard.order + 1 && card.shape == lastCard.shape) {
        series.push(b);
      }
    }
    if (series.length >= 2) matches.push(series);
    if (parallel.length >= 2) matches.push(parallel);
  }

  for (let a = 0; a < matches.length - 1; a++) {
    for (let b = a + 1; b < matches.length; b++) {
      if (matches[b].length > matches[a].length) {
        let tmp = matches[a];
        matches[a] = matches[b];
        matches[b] = tmp;
      }
    }
  }
  /*
  console.log(`-- possible matches --`);
  for (const m of matches) {
    for (const c of m) {
      console.log(cards[c]);
    }
    console.log(`------`);
  }
  */
  let tmpArr = [];
  for (let i = 0; i < cards.length; i++) {
    tmpArr.push(i);
  }
  let addedIndex = [];
  let finalOrder = [];
  let jokerCount = jokers.length;
  for (const m of matches) {
    // Skip if match contain card from added cards
    if (m.some((r) => addedIndex.indexOf(r) >= 0)) continue;
    finalOrder = [...finalOrder, ...m];
    if (m.length == 2 && jokerCount > 0) {
      finalOrder = [...finalOrder, "J"];
      jokerCount--;
    }
    for (const c of m) {
      addedIndex.push(c);
      const index = tmpArr.indexOf(c);
      tmpArr.splice(index, 1);
    }
  }
  if (jokerCount > 0) {
    jArr = [];
    for (let i = 0; i < jokerCount; i++) {
      jArr.push("J");
    }
    finalOrder = [...finalOrder, ...jArr, ...tmpArr];
  } else {
    finalOrder = [...finalOrder, ...tmpArr];
  }
  let final = [];
  let jIndex = 0;
  for (const c of finalOrder) {
    if (c == "J") {
      final.push(jokers[jIndex]);
      jIndex++;
    } else {
      final.push(cards[c]);
    }
  }
  return final;
};

CardUtils.calculatePoint = (cards) => {
  let matches = [];
  let firstCard = cards[0];
  let point = 0;
  let arr = [firstCard];
  let isSeries = false;
  for (let i = 1; i < cards.length; i++) {
    const card = cards[i];
    if (arr.length == 0) {
      arr.push(card);
      continue;
    }

    if (arr.length == 1) {
      let prevCard = arr[0];
      if (card.mark == "X") {
        arr.push(card);
        continue;
      } else if (prevCard.order == card.order) {
        arr.push(card);
        isSeries = false;
        continue;
      } else if (prevCard.order + 1 == card.order && prevCard.shape == card.shape) {
        arr.push(card);
        isSeries = true;
        continue;
      }
    }

    if (arr.length >= 2) {
      let prevCard = arr[arr.length - 1];
      if (prevCard.mark == "X" && arr.length == 2) {
        const firstCard = arr[0];
        if (firstCard.mark == "X") {
          arr.push(card);
          continue;
        } else if (firstCard.order + 2 == card.order && firstCard.shape == card.shape) {
          arr.push(card);
          isSeries = true;
          continue;
        } else if (firstCard.order == card.order) {
          arr.push(card);
          isSeries = false;
          continue;
        } else {
          if (arr.length >= 3) point += arr.length;
          const _arr = [...arr];
          matches.push(_arr);
          arr = [card];
          continue;
        }
      }

      if (isSeries) {
        if (card.mark == "X") {
          arr.push(card);
          continue;
        } else if (prevCard.order + 1 == card.order && prevCard.shape == card.shape) {
          arr.push(card);
          continue;
        } else {
          if (arr.length >= 3) point += arr.length;
          const _arr = [...arr];
          matches.push(_arr);
          arr = [card];
          continue;
        }
      } else {
        if (card.mark == "X") {
          arr.push(card);
          continue;
        } else if (prevCard.order == card.order) {
          arr.push(card);
          continue;
        } else {
          if (arr.length >= 3) point += arr.length;
          const _arr = [...arr];
          matches.push(_arr);
          arr = [card];
          continue;
        }
      }
    }
  }
  if (arr.length >= 2) {
    const _arr = [...arr];
    matches.push(_arr);
  }
  if (arr.length >= 3) {
    point += arr.length;
  }
  return { point, matches };
};

CardUtils.cardNeeded = (cards) => {
  let result = [];
  let firstCard = cards[0];
  let arr = [firstCard];
  let isSeries = false;
  for (let i = 1; i < 13; i++) {
    const card = cards[i];
    if (arr.length == 0) {
      arr.push(card);
      continue;
    }

    if (arr.length == 1) {
      let prevCard = arr[0];
      if (prevCard.order == card.order) {
        arr.push(card);
        isSeries = false;
        continue;
      } else if (prevCard.order + 1 == card.order && prevCard.shape == card.shape) {
        arr.push(card);
        isSeries = true;
        continue;
      }
    }

    if (arr.length >= 2) {
      let prevCard = arr[arr.length - 1];
      let firstCard = arr[0];
      if (isSeries) {
        if (prevCard.order + 1 == card.order && prevCard.shape == card.shape) {
          arr.push(card);
          continue;
        } else {
          if (arr.length == 2) {
            const c1 = { shape: prevCard.shape, order: prevCard.order + 1 };
            const c2 = { shape: prevCard.shape, order: firstCard.order - 1 };
            result.push(c1);
            result.push(c2);
          }
          arr = [card];
          continue;
        }
      } else {
        if (prevCard.order == card.order) {
          arr.push(card);
          continue;
        } else {
          if (arr.length == 2) {
            const c1 = { shape: 0, order: prevCard.order };
            const c2 = { shape: 1, order: prevCard.order };
            const c3 = { shape: 2, order: prevCard.order };
            const c4 = { shape: 3, order: prevCard.order };
            result.push(c1);
            result.push(c2);
            result.push(c3);
            result.push(c4);
          }
          arr = [card];
          continue;
        }
      }
    }
  }
  return result;
};

CardUtils.calculateTotalMoneyCard = (cards, firstCard, secondCard) => {
  let point = 0;
  let resultCards = [];
  let moneyCards = [
    { shape: 3, rank: 13 },
    { shape: 1, rank: 6 },
  ];
  moneyCards.push(firstCard);
  moneyCards.push(secondCard);
  for (const card of cards) {
    for (const m of moneyCards) {
      if (card.mark == "X") {
        resultCards.push(card);
        point++;
        if (firstCard.mark == "X" || secondCard.mark == "X") {
          point++;
        }
        break;
      } else if (m.rank == card.rank && m.shape == card.shape) {
        resultCards.push(card);
        point++;
        break;
      }
    }
  }
  // Check contain two money cards
  let firstCardCheck = false;
  let secondCardCheck = false;
  for (const card of cards) {
    if (card.rank == firstCard.rank && card.shape == firstCard.shape) firstCardCheck = true;
    else if (card.rank == secondCard.rank && card.shape == secondCard.shape) secondCardCheck = true;
  }
  if (firstCardCheck && secondCardCheck) {
    point++;
  }
  //
  return [point, resultCards];
};

CardUtils.calculateDrawMoneyCard = (card, firstCard, secondCard) => {
  console.log(`Calculate Draw Money Card - `);
  console.log(card);
  if (!card) {
    return [0, false];
  }
  let point = 0;
  let isMoneyCard = false;
  let moneyCards = [
    { shape: 3, rank: 13 },
    { shape: 1, rank: 6 },
  ];
  moneyCards.push(firstCard);
  moneyCards.push(secondCard);

  for (const m of moneyCards) {
    if (card.mark == "X") {
      isMoneyCard = true;
      point++;
      if (firstCard.mark == "X" || secondCard.mark == "X") {
        point++;
      }
      break;
    } else if (m.rank == card.rank && m.shape == card.shape) {
      isMoneyCard = true;
      point++;
      break;
    }
  }
  // Check contain two money cards

  return [point, isMoneyCard];
};

module.exports = CardUtils;
