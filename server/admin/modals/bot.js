const fs = require("fs");
const express = require("express");
const { ObjectId } = require("mongodb");
const db = require("../db");
const router = express.Router();
const globalConfig = JSON.parse(fs.readFileSync("../config.json"));

router.get("/", async (req, res) => {
  const role = req.session.role;
  const arr = await db.selectMany("bot", {});
  res.render("bot", { arr, role });
});

router.post("/", async (req, res) => {
  let body = req.body;
  if (body.req == "new") {
    console.log(`New bot ${body.nickname}`);
    const bot = {
      nickname: body.nickname,
      profile: parseInt(body.profile),
    };
    await db.insertOne("bot", bot);
  } else if (body.delete) {
    const arr = await db.selectMany("bot", {});
    console.log(`Delete bot ${body.delete}`);
    const bot = arr[body.delete];
    await db.deleteOne("bot", { nickname: bot.nickname });
  } else if (body.update) {
    const bots = await db.selectMany("bot", {});
    setBot(globalConfig.skm_url, bots);
    setBot(globalConfig.bugyee_url, bots);
    setBot(globalConfig.shweshan_url, bots);
    setBot(globalConfig.poker_13_url, bots);
  }
  res.redirect("/bot");
});

async function setBot(url, bots) {
  try {
    const respond = await fetch(url + "get_config");
    let json = await respond.json();
    json.botPool = bots;
    await fetch(url + "set_config", {
      method: "POST",
      body: JSON.stringify(json),
      headers: {
        "Content-type": "application/json; charset=UTF-8",
      },
    });
  } catch (err) {
    console.log(`Set bot error in ${url}`);
    console.log(err);
  }
}

module.exports = router;
