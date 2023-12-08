const express = require("express");
const db = require("../db");
const router = express.Router();

router.get("/", (req, res) => {
  const role = req.session.role;
  res.render("dashboard", { role });
});

router.get("/info", async (req, res) => {
  const startDate = parseInt(req.query.start);
  const endDate = parseInt(req.query.end);

  let respond = {};
  respond.totalUser = await db.selectCount("users", {});
  respond.newUser = await db.selectCount("users", { time: { $gt: startDate, $lt: endDate } });

  const dataMainNew = await db.selectDatasheet({
    agentCode: "main",
    time: { $gt: startDate, $lt: endDate },
  });
  const dataMainTotal = await db.selectDatasheet({ agentCode: "main" });

  respond.newMainCommission = dataMainNew?.commission || 0;
  respond.totalMainCommission = dataMainTotal?.commission || 0;

  const _startDate = getDate(startDate);
  let tmp = new Date(endDate);
  tmp.setDate(tmp.getDate() + 1);
  const _endDate = getDate(tmp);
  const dataAllNew = await db.selectDatasheet({ time: { $gt: _startDate, $lt: _endDate } });
  const dataAllTotal = await db.selectDatasheet({});

  respond.newDeposit = dataAllNew?.deposit || 0;
  respond.totalDeposit = dataAllTotal?.deposit || 0;

  respond.newWithdraw = dataAllNew?.withdraw || 0;
  respond.totalWithdraw = dataAllTotal?.withdraw || 0;

  respond.totalAgent = await db.selectCount("agent", {});

  res.json(respond);
});

function getDate(t) {
  var d = new Date(t),
    month = "" + (d.getMonth() + 1),
    day = "" + d.getDate(),
    year = d.getFullYear();

  if (month.length < 2) month = "0" + month;
  if (day.length < 2) day = "0" + day;

  return parseInt([year, month, day].join(""));
}

module.exports = router;
