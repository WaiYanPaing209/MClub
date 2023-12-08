const express = require("express");
const { ObjectId } = require("mongodb");
const db = require("../db");
const router = express.Router();

// Configuration
const pageLimit = 20;

router.get("/", async (req, res) => {
  const agentCode = req.session.agentCode;
  const session = req.session;
  const agent = await db.selectOne("agent", { agentCode });
  let filter = { agentCode };
  if (agent.role == "senior") {
    filter = {};
  } else if (agent.role == "master") {
    filter = { agentMaster: agentCode };
  }
  let page = 0;
  if (req.query.p) {
    page = req.query.p;
  }
  if (req.query.username) {
    filter.username = req.query.username;
  }
  if (req.query.start && req.query.end) {
    const start = parseInt(req.query.start);
    const end = parseInt(req.query.end);
    filter.time = { $gte: start, $lte: end };
  }
  const cashIn = await db.selectTotal(
    "user_transfer_log",
    { ...filter, amount: { $gt: 0 } },
    "$amount"
  );
  const cashOut = await db.selectTotal(
    "user_transfer_log",
    { ...filter, amount: { $lt: 0 } },
    "$amount"
  );
  const [arr, total, lastPage] = await db.selectPagination(
    "user_transfer_log",
    filter,
    page,
    pageLimit
  );
  const [previous, next] = paginationURL(req.query, lastPage);
  res.render("transfer_log", { arr, page, previous, next, session, agent, cashIn, cashOut });
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
