const express = require("express");
const { ObjectId } = require("mongodb");
const db = require("../db");
const router = express.Router();

router.get("/", async (req, res) => {
  const session = req.session;
  const agentCode = session.agentCode;
  const arr = await db.selectMany("agent_users", { agentCode });
  res.render("role", { arr, session });
});

router.post("/", async (req, res) => {
  const agentCode = req.session.agentCode;
  let body = req.body;
  if (body.req == "new") {
    const admin = {
      username: body.username,
      password: body.password,
      agentCode,
      role: body.role,
    };
    await db.insertOne("agent_users", admin);
  } else if (body.req == "edit") {
    const _id = new ObjectId(body._id);
    delete body._id;
    delete body.req;
    await db.updateOne("agent_users", { _id }, body);
  } else if (body.delete) {
    const _id = new ObjectId(body.delete);
    await db.deleteOne("agent_users", { _id });
  }
  res.redirect("/role");
});

module.exports = router;
