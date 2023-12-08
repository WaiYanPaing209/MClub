const express = require("express");
const db = require("../db");
const router = express.Router();

router.get("/", (req, res) => {
  res.render("login");
});

router.post("/", async (req, res) => {
  const username = req.body.agentCode;
  const password = req.body.password;
  const captcha = req.body.captcha;

  // Check captcha is correct
  if (req.session.captcha != captcha) {
    res.render("login", { err: "Incorrect Captcha", username: username });
    return;
  }

  const _agent = await db.selectOne("agent_users", { username });

  if (await checkTmpLock(res, _agent)) return;

  const agent = await db.selectOne("agent_users", { username, password });

  if (agent) {
    // If username and password correct

    // Check already login

    if (agent?.lastActiveTime) {
      const deltaTime = Date.now() - agent.lastActiveTime;
      if (deltaTime < 60000) {
        res.render("login", { err: "Already login from other device.", username });
        return;
      }
    }

    const mainAgent = await db.selectOne("agent", { agentCode: agent.agentCode });

    if (mainAgent?.ban) {
      res.render("login", { err: "This account has banned!", username });
      return;
    }

    // Add session key
    const sessionKey = Math.floor(Math.random() * 50000 + 10000);
    db.updateOne("agent_users", { username }, { sessionKey, lastActiveTime: Date.now() });

    // Add session data
    req.session.agentCode = agent.agentCode;
    req.session.username = agent.username;
    req.session.role = agent.role;
    req.session.key = sessionKey;

    res.redirect("/dashboard");
  } else {
    if (_agent) {
      const result = await db.incAgentTryCount(_agent._id);
      res.render("login", {
        err: `Password incorrect. Try again ${result.tryCount}/5`,
        agentCode: _agent.agentCode,
      });
      if (result.tryCount >= 5) {
        const lockDelay = new Date().getTime() + 3 * 60 * 1000;
        const update = {
          lock: true,
          lockDelay,
        };
        db.update("agent_users", { _id: _agent._id }, update);
      }
    } else {
      res.render("login", { err: `Agent code or Password incorrect!` });
    }
  }
});

async function checkTmpLock(res, _agent) {
  if (_agent) {
    // But username exist
    const currentTime = new Date().getTime();
    if (_agent.lock) {
      // If user is lock
      if (_agent.lockDelay < currentTime) {
        // If user lock delay is over
        await db.update("agent_users", { _id: _agent._id }, { lock: false, tryCount: 0 });
        return false;
      } else {
        // If user is in temporary lock
        const tryAgainIn = Math.round((_agent.lockDelay - currentTime) / (60 * 1000)) + 1;
        res.render("login", {
          err: `Account is temporary lock! Try again in ${tryAgainIn} minutes`,
        });
        return true;
      }
    } else {
      return false;
    }
  } else {
    res.render("login", { err: `Agent code incorrect!` });
    return true;
  }
}

module.exports = router;
