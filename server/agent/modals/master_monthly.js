const express = require("express");
const { ObjectId } = require("mongodb");
const db = require("../db");
const router = express.Router();

// Configuration
const pageLimit = 100;

router.get("/", async (req, res) => {
  const session = req.session;
  let filter = { agentMaster: req.session.agentCode };
  let page = 0;
  if (req.query.p) {
    page = req.query.p;
  }
  if (req.query.username) {
    filter.agentCode = req.query.username;
  }
  if (req.query.start && req.query.end) {
    const start = parseInt(req.query.start);
    const end = parseInt(req.query.end);
    filter.time = { $gte: start, $lte: end };
  }
  const [arr, total, lastPage] = await db.selectPagination(
    "datasheet_monthly",
    filter,
    page,
    pageLimit
  );
  const [previous, next] = paginationURL(req.query, lastPage);
  res.render("agent_monthly", { arr, session, page, previous, next });
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
