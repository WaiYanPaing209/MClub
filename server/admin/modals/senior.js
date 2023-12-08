const express = require("express");
const { ObjectId } = require("mongodb");
const db = require("../db");
const router = express.Router();

router.get("/", async (req, res) => {
  const role = req.session.role;
  if (req.query.delete) {
    const _id = new ObjectId(req.query.delete);
    db.deleteAgent({ _id });
    res.redirect("senior");
  }
  const arr = await db.selectMany("agent", { role: "senior" });

  res.render("senior", { arr, role });
});

router.post("/", async (req, res) => {
  let body = req.body;
  if (body.req == "new") {
    delete body.req;
    body.time = Date.now();
    body.commission = 0;
    body.balance = 0;
    body.role = "senior";
    await db.insertOne("agent", body);
    await db.insertOne("agent_users", {
      username: body.agentCode,
      agentCode: body.agentCode,
      password: body.password,
      role: "senior",
    });
  } else if (body.req == "edit") {
    const agentCode = body.agentCode;
    delete body.agentCode;
    delete body.req;
    await db.updateOne("agent", { agentCode }, body);
    await db.updateOne(
      "agent_users",
      { agentCode, username: agentCode, role: "senior" },
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
    await db.insertOne("senior_transfer_log", {
      agentCode,
      amount,
      agentBalance: agent.balance,
      time: Date.now(),
    });
    db.logData(agentCode, { fromParent: amount });
  } else if (body.req == "withdraw") {
    const amount = parseInt(body.amount);
    const agentCode = body.agentCode;
    await db.updateOneAlt("agent", { agentCode }, { $inc: { balance: -amount } });
    const agent = await db.selectOne("agent", { agentCode });
    await db.insertOne("senior_transfer_log", {
      agentCode,
      amount: -amount,
      agentBalance: agent.balance,
      time: Date.now(),
    });
    db.logData(agentCode, { toParent: amount });
  }
  res.redirect("/senior");
});

module.exports = router;
