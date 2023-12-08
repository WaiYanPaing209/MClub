const fs = require("fs");
const express = require("express");
const { ObjectId } = require("mongodb");
const db = require("../db");
const router = express.Router();
const globalConfig = JSON.parse(fs.readFileSync("../config.json"));

router.get("/", async (req, res) => {
  const session = req.session;
  const agentCode = req.session.agentCode;
  const agent = await db.selectOne("agent", { agentCode });
  let msg = null;
  if (req.query.msg) {
    if (req.query.msg == "success") {
      msg = `Change password success!`;
    } else if (req.query.msg == "fail") {
      msg = `Old password incorrect!`;
    }
  }
  res.render("setting", { session, agent, msg });
});

router.post("/", async (req, res) => {
  const body = req.body;
  if (body.head == "change password") {
    const usr = await db.selectOne("agent_users", {
      username: req.session.username,
      password: body.old,
    });
    if (usr) {
      await db.updateOne("agent_users", { username: req.session.username }, { password: body.new });
      res.redirect("/setting?msg=success");
      return;
    } else {
      res.redirect("/setting?msg=fail");
      return;
    }
  }
  res.redirect("/setting");
});

module.exports = router;
