const express = require("express");
const { ObjectId } = require("mongodb");
const db = require("../db");
const router = express.Router();

router.get("/", async (req, res) => {
  const role = req.session.role;
  if (req.query.delete) {
    const _id = new ObjectId(req.query.delete);
    db.deleteAgent({ _id });
    res.redirect("agent");
  }
  const arr = await db.selectMany("agent", { role: "agent" });

  res.render("agent", { arr, role });
});

router.post("/", async (req, res) => {
  let body = req.body;
  if (body.req == "new") {
    delete body.req;
    body.time = Date.now();
    body.commission = 0;
    body.balance = 0;
    body.role = "agent";
    body.master = "main";
    await db.insertOne("agent", body);
    await db.insertOne("agent_users", {
      username: body.agentCode,
      agentCode: body.agentCode,
      password: body.password,
      role: "agent",
    });
  } else if (body.req == "edit") {
    const agentCode = body.agentCode;
    delete body.agentCode;
    delete body.req;
    await db.updateOne("agent", { agentCode }, body);
    await db.updateOne(
      "agent_users",
      { agentCode, username: agentCode, $or: [{ role: "agent" }, { role: "master" }] },
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
    await db.updateOneAlt("agent", { agentCode }, { $inc: { balance: amount } });
    const agent = await db.selectOne("agent", { agentCode });
    await db.insertOne("agent_transfer_log", {
      from: "main",
      agentCode,
      amount,
      agentBalance: agent.balance,
      time: Date.now(),
    });
    await db.logData(agentCode, { fromParent: amount });
  } else if (body.req == "withdraw") {
    const amount = parseInt(body.amount);
    const agentCode = body.agentCode;
    await db.updateOneAlt("agent", { agentCode }, { $inc: { balance: -amount } });
    const agent = await db.selectOne("agent", { agentCode });
    await db.insertOne("agent_transfer_log", {
      from: "main",
      agentCode,
      amount: -amount,
      agentBalance: agent.balance,
      time: Date.now(),
    });
    await db.logData(agentCode, { toParent: amount });
  } else if (body.req == "ban") {
    const agentCode = body.agentCode;
    console.log(`${agentCode} banned!`);
    await db.updateOne("agent", { agentCode }, { ban: true });
  } else if (body.req == "unban") {
    const agentCode = body.agentCode;
    console.log(`${agentCode} unban!`);
    await db.updateOne("agent", { agentCode }, { ban: false });
  }
  res.redirect("/agent");
});

module.exports = router;
