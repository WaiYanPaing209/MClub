const express = require("express");
const db = require("../db");
const router = express.Router();

const pageLimit = 100;

router.get("/", async (req, res) => {
  const session = req.session;
  const agentCode = req.session.agentCode;
  const agent = await db.selectOne("agent", { agentCode });
  let page = 0;
  if (req.query.p) page = parseInt(req.query.p);
  let filter = { agentCode };
  if (agent.role == "senior") {
    filter = {};
  } else if (agent.role == "master") {
    filter = { agentMaster: agentCode };
  }
  if (req.query.username) {
    filter.username = req.query.username;
  }

  let cashIn = 0;
  let cashOut = 0;
  let cashProfit = 0;
  let turnover = 0;

  if (req.query.start && req.query.end) {
    const start = parseInt(req.query.start);
    const end = parseInt(req.query.end);
    filter.time = { $gte: start, $lte: end };

    cashIn = await db.selectTotal(
      "play_log",
      { ...filter, status: { $in: ['deposit', 'lose'] } },
      "$amount"
    );
    cashOut = await db.selectTotal(
      "play_log",
      { ...filter, status: { $in: ['withdraw', 'win'] } },
      "$amount"
    );
    cashProfit = cashIn - cashOut;

    turnover = await db.selectTotal("play_log", filter, "$bet");
  } else {
    filter.amount = { $ne: 0 }
  }

  const [arr, total, lastPage] = await db.selectPagination("play_log", filter, page, pageLimit);
  const [previous, next] = paginationURL(req.query, lastPage);
  console.log(`Prev : ${previous}, Next : ${next}`);
  // const turnover = await db.selectTotal("play_log", filter, "$bet");
  res.render("play_log", { arr, session, agent, page, previous, next, turnover, cashIn, cashOut, cashProfit });
});

function paginationURL(query, lastPage) {
  let page = 0;
  if (query.p) page = parseInt(query.p);
  console.log(`Current page : ${page}, Last page : ${lastPage}`);
  let next,
    previous = null;
  if (page != 0) {
    let obj = { ...query };
    obj.p = page - 1;
    previous = new URLSearchParams(obj).toString();
  }
  if (page < lastPage) {
    let obj = { ...query };
    obj.p = page + 1;
    next = new URLSearchParams(obj).toString();
  }
  return [previous, next];
}

module.exports = router;
