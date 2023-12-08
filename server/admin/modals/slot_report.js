const express = require("express");
const db = require("../db");
const router = express.Router();

router.get("/", (req, res) => {
  const role = req.session.role;
  res.render("slot_report", { role });
});

router.get("/info", async (req, res) => {
  const startDate = parseInt(req.query.start);
  const endDate = parseInt(req.query.end);

  let respond = {};
  let filter = {};
  filter.time = { $gte: startDate, $lte: endDate };
  filter.$or = [
    { game: 'slot' }, // Documents with 'game' set to 'slot'
    { game: { $exists: false } }, // Documents without a 'game' field
  ],

  respond.totalBet = await db.selectTotal(
    "play_log",
    { ...filter, status: 'lose' },
    "$amount"
  );

  respond.totalWon = await db.selectTotal(
    "play_log",
    { ...filter, status: 'win' },
    "$amount"
  );

  respond.totalProfit = respond.totalBet - respond.totalWon;
  respond.percentProfit = (4 / 100) * respond.totalProfit;

  if(respond.percentProfit < 0) respond.percentProfit = 0

  res.json(respond);
});


module.exports = router;
