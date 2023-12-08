const express = require("express");
const { ObjectId } = require("mongodb");
const db = require("./db");
const activityLog = require("./activityLog");
const router = express.Router();

router.get("/", (req, res) => {
  res.end(`Account communication server is running!`);
});

router.post("/create_room", (req, res) => {
  const body = req.body;
  const game = body.game;
  const room = {
    roomNo: body.roomNo,
    balance: 0,
    history: [],
  };

  db.insertOne(game, room);

  res.json({ status: "ok" });
});

router.post("/user_leave_game", async (req, res) => {
  const body = req.body;
  const game = body.game;
  const username = body.id;

  db.updateOne("users", { username }, { gameState: null });
  const user = await db.selectOne("users", { username });
  activityLog(username, `Leave from ${game} game`, user.balance);

  res.json({ status: "ok" });
});

router.post("/transfer_to_game", async (req, res) => {
  const body = req.body;
  const game = body.game;
  const roomNo = body.roomNo;
  const username = body.id;
  const amount = body.amount;

  await db.transferToGame(game, roomNo, username, amount);
  const user = await db.selectOne("users", { username });
  if (user.balance < 0) {
    await db.updateOne("users", { username }, { balance: 0 });
    user.balance = 0;
  }
  activityLog(username, `Bet ${amount} in ${game} game`, user.balance);

  res.json({ status: "ok" });
});

router.post("/transfer_from_game", async (req, res) => {
  const body = req.body;
  const game = body.game;
  const roomNo = body.roomNo;
  const username = body.id;
  const amount = body.amount;

  await db.transferToUser(game, roomNo, username, amount);
  const user = await db.selectOne("users", { username });
  if (amount > 0) activityLog(username, `Won ${amount} from ${game} game`, user.balance);

  res.json({ status: "ok" });
});

router.post("/transfer_to_bet_game", async (req, res) => {
  const game = req.body.game;
  const username = req.body.id;
  const amount = req.body.amount;
  await db.transferToBetGame(game, amount, username);
  const user = await db.selectOne("users", { username });
  if (user.balance < 0) {
    await db.updateOne("users", { username }, { balance: 0 });
    user.balance = 0;
  }
  activityLog(username, `Bet ${amount} in ${game} game`, user.balance);
  console.log(`Transfer from ${username} to ${game} : ${amount}`);
  res.json({ status: "ok" });
});

router.post("/transfer_from_bet_game", async (req, res) => {
  const game = req.body.game;
  const username = req.body.id;
  const amount = req.body.amount;
  await db.transferFromBetGame(game, amount, username);
  const user = await db.selectOne("users", { username });
  activityLog(username, `Win ${amount} from ${game} game`, user.balance);
  console.log(`Transfer from ${game} to ${username} : ${amount}`);
  res.json({ status: "ok" });
});

router.post("/transfer_to_commission", async (req, res) => {
  const body = req.body;
  const username = body.id;
  const amount = body.amount;
  const user = await db.selectOne("users", { username });
  const agentCode = user.agentCode;
  const agent = await db.selectOne("agent", { agentCode });
  const agentCommission = (agent.commission / 100) * amount;
  const mainCommisssion = (1 - agent.commission / 100) * amount;

  console.log(
    `Transfer from ${username} to commission - amount ${amount}, 
    main ${mainCommisssion}, agent ${agentCommission}`
  );

  await db.transferToCommission(username, agentCode, agentCommission);
  await db.transferToCommission(username, "main", mainCommisssion);

  res.json({ status: "ok" });
});

router.post("/transfer_to_bot_profit", async (req, res) => {
  const amount = req.body.amount;
  db.insertOne("bot_profit", { amount, time: Date.now() });

  res.json({ status: "ok" });
});

router.post("/transfer_between_user", async (req, res) => {
  const body = req.body;
  const game = body.game;
  const from = body.from;
  const to = body.to;
  const amount = body.amount;
  console.log(`Transfer from ${from} to ${to} - amount ${amount} in game ${game}`);

  await db.transferBetweenUser(from, to, amount);
  if (from != "bot") {
    const loser = await db.selectOne("users", { username: from });
    if (loser.balance < 0) {
      await db.updateOne("users", { username: loser }, { balance: 0 });
      loser.balance = 0;
    }
    activityLog(from, `Lose ${amount} in ${game} game.`, loser.balance);
  }
  if (to != "bot") {
    const winner = await db.selectOne("users", { username: to });
    activityLog(to, `Win ${amount} from ${game} game.`, winner.balance);
  }

  res.json({ status: "ok" });
});

// Also allow cut with minus operator
router.post("/add_user_balance", async (req, res) => {
  const game = req.body.game;
  const username = req.body.id;
  const amount = req.body.amount;
  await db.updateBalance(username, amount);
  const user = await db.selectOne("users", { username });
  if (user.balance < 0) {
    await db.updateOne("users", { username }, { balance: 0 });
  }
  console.log(`Add user balance - username:${username} amount:${amount}, game:${game}`);
  res.json({ status: "ok" });
});

router.post("/play_log", async (req, res) => {
  const user = await db.selectOne("users", { username: req.body.playerId });
  const agent = await db.selectOne("agent", { agentCode: user.agentCode });
  const data = {
    game: req.body.game,
    level: req.body.level ?? "None",
    roomNo: req.body.roomNo ?? "None",
    username: req.body.playerId,
    bet: req.body.bet,
    amount: Math.abs(req.body.amount),
    status: req.body.status,
    agentCode: user.agentCode,
    agentMaster: agent.master,
    balance: user.balance < 0 ? 0 : user.balance,
    time: Date.now(),
  };
  console.log("Play log save - ");
  console.log(data);
  db.insertOne("play_log", data);
  res.json({ status: "ok" });
});


// GON KHAUNG SENG DU's CODE
router.post("/user_balance_update", async (req, res) => {
  const _id = new ObjectId(req.body.id);
  db.updateOne("users", { _id }, { balance: req.body.balance });
  transactionLog(req.body.id, req.body.status, req.body.amount, req.body.type, req.body.totalBetValue)
  res.end("ok");
// }
});
async function transactionLog(id, status, amount, type, totalBetValue = null) {
const _id = new ObjectId(id);
const user = await db.selectOne("users", { _id });
  const data = {
    game: type,
    level: '-',
    roomNo: '-',
    bet: totalBetValue,
    username: user.username,
    amount,
    status,
    agentCode: user.agentCode,
    balance: user.balance,
    time: Date.now(),
  };
  db.insertOne("play_log", data);
}

module.exports = router;
