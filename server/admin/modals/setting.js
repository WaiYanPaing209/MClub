const fs = require("fs");
const express = require("express");
const { ObjectId } = require("mongodb");
const db = require("../db");
const router = express.Router();
const globalConfig = JSON.parse(fs.readFileSync("../config.json"));

router.get("/", async (req, res) => {
  let skm = null;
  try {
    const skm_respond = await fetch(globalConfig.skm_url + "get_config");
    skm = await skm_respond.json();
  } catch (e) {
    console.error("ShanKoeMee Server Error!");
  }

  let bugyee = null;
  try {
    const bugyee_respond = await fetch(globalConfig.bugyee_url + "get_config");
    bugyee = await bugyee_respond.json();
  } catch (e) {
    console.error("Bugyee Server Error!");
  }

  let shweshan = null;
  try {
    const shweshan_respond = await fetch(
      globalConfig.shweshan_url + "get_config"
    );
    shweshan = await shweshan_respond.json();
  } catch (e) {
    console.error("ShweShan Server Error!");
  }

  let poker = null;
  try {
    const poker_respond = await fetch(globalConfig.poker_13_url + "get_config");
    poker = await poker_respond.json();
  } catch (e) {
    console.error("Poker Server Error!");
  }

  const setting = await db.selectOne("setting", {});

  const role = req.session.role;
  res.render("setting", { role, skm, bugyee, shweshan, poker, setting });
});

router.post("/", async (req, res) => {
  const body = req.body;
  if (body.head == "skm") {
    const skm_respond = await fetch(globalConfig.skm_url + "get_config").catch(
      (err) => console.log(`ShanKoeMee game engine not respond!`)
    );
    let skm = await skm_respond.json();
    delete skm.botPool;
    skm.isActive = body.isActive == 1;
    skm.autoBot = body.autoBot == 1;
    skm.botPerRoom = parseInt(body.botPerRoom);
    skm.dealerLimit = parseInt(body.dealerLimit);
    skm.playerComission = parseInt(body.playerComission);
    skm.dealerComission = parseInt(body.dealerComission);
    skm.botMode = parseInt(body.botMode);
    const respond = await fetch(globalConfig.skm_url + "set_config", {
      method: "POST",
      body: JSON.stringify(skm),
      headers: {
        "Content-type": "application/json; charset=UTF-8",
      },
    });
  } else if (body.head == "bugyee") {
    const bugyee_respond = await fetch(
      globalConfig.bugyee_url + "get_config"
    ).catch((err) => console.log(`ShanKoeMee game engine not respond!`));
    let bugyee = await bugyee_respond.json();
    delete bugyee.botPool;
    bugyee.isActive = body.isActive == 1;
    bugyee.autoBot = body.autoBot == 1;
    bugyee.botPerRoom = parseInt(body.botPerRoom);
    bugyee.room.playerCommission = parseInt(body.playerCommission);
    bugyee.room.dealerCommission = parseInt(body.playerCommission);
    bugyee.room.botMode = parseInt(body.botMode);
    const respond = await fetch(globalConfig.bugyee_url + "set_config", {
      method: "POST",
      body: JSON.stringify(bugyee),
      headers: {
        "Content-type": "application/json; charset=UTF-8",
      },
    });
  } else if (body.head == "shweshan") {
    const respond = await fetch(globalConfig.shweshan_url + "get_config").catch(
      (err) => console.log(`ShweShan game engine not respond!`)
    );
    let json = await respond.json();
    delete json.botPool;
    json.isActive = body.isActive == 1;
    json.autoBot = body.autoBot == 1;
    json.botPerRoom = parseInt(body.botPerRoom);
    json.room.playerCommission = parseInt(body.playerCommission);
    json.room.botMode = parseInt(body.botMode);
    await fetch(globalConfig.shweshan_url + "set_config", {
      method: "POST",
      body: JSON.stringify(json),
      headers: {
        "Content-type": "application/json; charset=UTF-8",
      },
    });
  } else if (body.head == "poker") {
    const respond = await fetch(globalConfig.poker_13_url + "get_config").catch(
      (err) => console.log(`Poker game engine not respond!`)
    );
    let json = await respond.json();
    delete json.botPool;
    json.isActive = body.isActive == 1;
    json.autoBot = body.autoBot == 1;
    json.botPerRoom = parseInt(body.botPerRoom);
    json.commission = parseInt(body.commission);
    json.botMode = parseInt(body.botMode);
    await fetch(globalConfig.poker_13_url + "set_config", {
      method: "POST",
      body: JSON.stringify(json),
      headers: {
        "Content-type": "application/json; charset=UTF-8",
      },
    });
  } else if (body.head == "private") {
    const privateCreateFee = parseInt(body.createFee);
    const privateJoinFee = parseInt(body.joinFee);
    await db.updateOne("setting", {}, { privateCreateFee, privateJoinFee });
  } else if (body.head == "reset") {
    const admin = await db.selectOne("admin", {
      username: "admin",
      password: body.password,
    });
    if (admin) {
      db.updateMany("users", {}, { balance: 0 });
      db.updateMany("agent", {}, { balance: 0 });
      db.deleteMany("agent_transfer_log", {});
      db.deleteMany("master_transfer_log", {});
      db.deleteMany("user_transfer_log", {});
      db.deleteMany("play_log", {});
      db.deleteMany("bot_profit", {});
      db.deleteMany("user_activity", {});
      db.deleteMany("datasheet", {});
      db.deleteMany("datasheet_monthly", {});
    }
  }
  res.redirect("/setting");
});

module.exports = router;
