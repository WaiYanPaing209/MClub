const express = require("express");
const { ObjectId } = require("mongodb");
const db = require("../db");
const router = express.Router();

// Configuration
const pageLimit = 100;

router.get("/", async (req, res) => {
  let filter = {};
  let page = 0;
  if (req.query.p) {
    page = parseInt(req.query.p);
  }
  if (req.query.username) {
    filter.username = req.query.username;
  }
  if (req.query.agentCode) {
    filter.agentCode = req.query.agentCode;
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
  const role = req.session.role;
  const [previous, next] = paginationURL(req.query, lastPage);
  res.render("transfer_log", { arr, page, previous, next, role, cashIn, cashOut });
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
