const express = require("express");
const db = require("../db");
const router = express.Router();

router.get("/", (req, res) => {
  const session = req.session;
  res.render("dashboard", { session });
});

router.get("/info", async (req, res) => {
  const agentCode = req.session.agentCode;
  const today = new Date();
  const startDate = new Date(today.getFullYear(), today.getMonth(), 1).getTime();
  const endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0).getTime();

  let respond = {};
  respond.totalUser = await db.selectCount("users", { agentCode });
  respond.newUser = await db.selectCount("users", {
    agentCode,
    time: { $gt: startDate, $lt: endDate },
  });

  const dataAllNew = await db.selectDatasheet({
    time: { $gt: startDate, $lt: endDate },
    agentCode,
  });
  const dataAllTotal = await db.selectDatasheet({ agentCode });

  respond.newDeposit = dataAllNew?.deposit || 0;
  respond.totalDeposit = dataAllTotal?.deposit || 0;

  respond.newWithdraw = dataAllNew?.withdraw || 0;
  respond.totalWithdraw = dataAllTotal?.withdraw || 0;

  res.json(respond);
});

module.exports = router;
