const express = require("express");
const { ObjectId } = require("mongodb");
const db = require("../db");
const router = express.Router();

// Configuration
const pageLimit = 100;

router.get("/", async (req, res) => {
  let page = 0;
  let filter = {};
  let sort = { _id: -1 };
  if (req.query.p) {
    page = parseInt(req.query.p);
  }
  if (req.query.search) {
    filter.username = req.query.search;
  }
  if (req.query.sort) {
    if (req.query.sort == "user_asc") {
      sort = { _id: 1 };
    } else if (req.query.sort == "balance_asc") {
      sort = { balance: 1 };
    } else if (req.query.sort == "balance_desc") {
      sort = { balance: -1 };
    }
  }
  let err = null;
  if (req.session.err) {
    err = req.session.err;
    req.session.err = null;
  }
  const [arr, total, lastPage] = await db.selectPagination("users", filter, page, pageLimit, sort);
  const role = req.session.role;
  res.render("user", { arr, page, total, pageLimit, lastPage, role, err });
});

router.post("/", async (req, res) => {
  if (req.body?.create) {
    if (req.body.username.length < 3) {
      req.session.err = "Username must have at least 3 characters!";
      res.redirect("back");
      return;
    }
    const u = await db.selectOne("users", { username: req.body.username });
    if (u) {
      req.session.err = "Username already exist!";
      res.redirect("back");
      return;
    }

    const user = {
      nickname: req.body.username,
      username: req.body.username,
      agentCode: "default",
      password: makeid(6),
      balance: 0,
      profile: 0,
      time: Date.now(),
    };

    await db.newUser(user);
  }

  if (req.body?.edit) {
    const _id = new ObjectId(req.body.edit);
    delete req.body.edit;
    await db.updateOne("users", { _id }, req.body);
  }

  if (req.body?.remove) {
    const username = req.body.remove;
    await db.deleteOne("users", { username });
  }

  if (req.body?.deposit) {
    const amount = parseInt(req.body.amount);
    const username = req.body.username;

    const user = await db.selectOne("users", { username });
    await db.updateOne("users", { username }, { balance: Number(user.balance) });


    await db.deposit(username, amount);
    logTransfer(username, "default", req.session.username, amount);
    transactionLog(username, "deposit", amount)
  }

  if (req.body?.withdraw) {
    const amount = parseInt(req.body.amount);
    const username = req.body.username;

    let user = await db.selectOne("users", { username });
    await db.updateOne("users", { username }, { balance: Number(user.balance) });

    if (amount <= Number(user.balance)) {
      await db.withdraw(username, amount);
      logTransfer(username, "default", req.session.username, -amount);
      transactionLog(username, "withdraw", amount)
    }
  }

  if (req.body?.winRate) {
    const username = req.body.username;
    const winRate = parseInt(req.body.winRate);
    await db.updateOne("users", { username }, { winRate });
  }

  if (req.body?.lock) {
    const username = req.body.username;
    await db.updateOne("users", { username }, { accountLock: true });
  } else if (req.body?.unlock) {
    const username = req.body.username;
    await db.updateOne("users", { username }, { accountLock: false });
  }

  res.redirect(`back`);
});

async function logTransfer(username, agentCode, agentUser, amount) {
  const agent = await db.selectOne("agent", { agentCode });
  const user = await db.selectOne("users", { username });
  await db.insertOne("user_transfer_log", {
    time: Date.now(),
    username,
    amount,
    agentUser,
    agentCode,
    agentBalance: agent.balance,
    userBalance: user.balance,
  });
}

async function transactionLog(username, type, amount) {
  const user = await db.selectOne("users", { username });
    const data = {
      game: '-',
      level: '-',
      roomNo: '-',
      bet: '-',
      username: username,
      amount,
      status: type,
      agentCode: user.agentCode,
      balance: user.balance,
      time: Date.now(),
    };
    db.insertOne("play_log", data);
}

function makeid(length) {
  var result = "";
  var characters = "abcdefghijklmnopqrstuvwxyz0123456789";
  var charactersLength = characters.length;
  for (var i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

module.exports = router;
