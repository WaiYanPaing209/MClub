const express = require("express");
const { ObjectId } = require("mongodb");
const db = require("../db");
const router = express.Router();

router.get("/", async (req, res) => {
  const session = req.session;
  const agent = await db.selectOne("agent", { agentCode: session.agentCode });
  const arr = await db.selectMany("agent", { master: req.session.agentCode });

  res.render("agent", { arr, session, agent });
});

router.post("/", async (req, res) => {
  let body = req.body;
  if (body.req == "new") {
    delete body.req;
    body.time = Date.now();
    body.commission = 0;
    body.balance = 0;
    body.master = req.session.agentCode;
    body.role = "agent";
    await db.insertOne("agent", body);
    await db.insertOne("agent_users", {
      username: body.agentCode,
      agentCode: body.agentCode,
      password: body.password,
      role: body.role,
    });
  } else if (body.req == "edit") {
    const agentCode = body.agentCode;
    delete body.agentCode;
    delete body.req;
    await db.updateOne("agent", { agentCode }, body);
    await db.updateOne(
      "agent_users",
      { agentCode, username: agentCode, role: "agent" },
      { password: body.password }
    );
  } else if (body.req == "delete") {
    const agentCode = body.agentCode;
    await db.updateMany("users", { agentCode }, { agentCode: "default" });
    await db.deleteOne("agent", { agentCode });
    await db.deleteMany("agent_users", { agentCode });
  } else if (body.req == "deposit") {
    const amount = parseInt(body.amount);
    const agentCode = body.agentCode;
    const agent = await db.selectOne("agent", { agentCode: req.session.agentCode });
    if (agent.balance >= amount) {
      await db.updateOneAlt("agent", { agentCode }, { $inc: { balance: amount } });
      await db.updateOneAlt(
        "agent",
        { agentCode: req.session.agentCode },
        { $inc: { balance: -amount } }
      );
      const _toAgent = await db.selectOne("agent", { agentCode });
      await db.insertOne("agent_transfer_log", {
        from: req.session.agentCode,
        agentCode,
        amount,
        agentBalance: _toAgent.balance,
        time: Date.now(),
      });
      db.logData(agentCode, { fromParent: amount });
      db.logData(req.session.agentCode, { toChildren: amount });
    }
  } else if (body.req == "withdraw") {
    const amount = parseInt(body.amount);
    const agentCode = body.agentCode;
    const toAgent = await db.selectOne("agent", { agentCode });
    if (amount > toAgent.balance) {
      res.redirect("/agent");
      return;
    }
    await db.updateOneAlt("agent", { agentCode }, { $inc: { balance: -amount } });
    await db.updateOneAlt(
      "agent",
      { agentCode: req.session.agentCode },
      { $inc: { balance: amount } }
    );
    const _toAgent = await db.selectOne("agent", { agentCode });

    await db.insertOne("agent_transfer_log", {
      from: req.session.agentCode,
      agentCode,
      amount: -amount,
      agentBalance: _toAgent.balance,
      time: Date.now(),
    });
    db.logData(agentCode, { toParent: amount });
    db.logData(req.session.agentCode, { fromChildren: amount });
  }
  res.redirect("/agent");
  // const _arr = await db.selectMany("agent", {});
  // let arr = [];
  // for (const agent of _arr) {
  //   agent.balance = await db.selectTotal("datasheet", { agentCode: agent.agentCode }, "$commission");
  //   arr.push(agent);
  // }
  // res.render("agent", { arr, role });
});

module.exports = router;
