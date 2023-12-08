const fs = require("fs");
const express = require("express");
const { ObjectId } = require("mongodb");
const db = require("./db");
const sysConfig = JSON.parse(fs.readFileSync("config/system.json"));
const globalConfig = JSON.parse(fs.readFileSync("../config.json"));
const router = express.Router();
const activityLog = require("./activityLog");

router.post("/login", async (req, res) => {
  console.log(`Login request ${req.body.username}`);

  const body = req.body;
  let sessionLogin = false;

  const _user = await db.selectOne("users", {
    username: body.username,
  });

  const resultTmpLock = await checkTmpLock(res, _user);
  if (resultTmpLock) return;

  let user;
  if (body.password) {
    user = await db.selectOne("users", {
      username: body.username,
      password: body.password,
    });
  } else if (body.session) {
    user = await db.selectOne("users", {
      username: body.username,
      session: body.session,
    });
    sessionLogin = true;
  }

  if (user) {
    // Credential correct
    if (user.accountLock) {
      res.json({ status: "account lock" });
      return;
    }

    // Check if device is lock
    if (user.deviceList) {
      for (const device of user.deviceList) {
        if (device.id == body.device.id) {
          if (device.lock) {
            res.json({ status: "device lock" });
            return;
          }
        }
      }
    }

    // Check Rejoin
    let rejoin = false;
    let gameState = null;
    if (user.gameState) {
      if (user.gameState.game == "shankoemee") {
        const respond = await fetch(globalConfig.skm_url + "rejoin", {
          method: "POST",
          body: JSON.stringify({ id: user.username }),
          headers: {
            "Content-type": "application/json; charset=UTF-8",
          },
        }).catch((err) => {
          console.log(`ShanKoeMee api error!`);
        });
        const json = await respond.json();
        if (json.status == "ok") {
          rejoin = true;
          gameState = {
            game: "shankoemee",
            passcode: json.passcode,
            url: globalConfig.skm_api,
          };
        } else {
          db.updateOne("users", { username: user.username }, { gameState: null });
        }
      }
    }

    let session = user.session;
    if (!sessionLogin) {
      session = Math.floor(100000000000000 + Math.random() * 900000000000000);
    }

    res.json({
      status: "ok",
      id: user._id,
      username: user.username,
      rejoin,
      session,
      sessionLogin,
      gameState,
    });

    // Add to user activity
    // ua.log(user.gameId, ua.activity.login, `${user.gameId} login from ${body.device.name}`);

    // Add device to list
    if (user.deviceList) {
      let isExist = false;
      for (const device of user.deviceList) {
        if (device.id == body.device.id) isExist = true;
      }
      if (!isExist) {
        user.deviceList.push(body.device);
        db.updateOne("users", { _id: user._id }, { deviceList: user.deviceList });
      }
    } else {
      const deviceList = [body.device];
      db.updateOne("users", { _id: user._id }, { deviceList });
    }

    if (sessionLogin) {
      db.updateOne("users", { _id: user._id }, { lock: false, tryCount: 0 });
    } else {
      db.updateOne("users", { _id: user._id }, { lock: false, tryCount: 0, session });
    }
  } else {
    const result = await db.incUserTryCount(_user._id);
    res.json({ status: "incorrect password", tryCount: result.tryCount });
    if (result.tryCount >= 10) {
      const lockDelay = new Date().getTime() + sysConfig.lockDelay * 60 * 1000;
      const update = {
        lock: true,
        lockDelay,
      };
      db.updateOne("users", { _id: _user._id }, update);
    }
  }
});

async function checkTmpLock(res, _user) {
  // If credential is wrong
  if (_user) {
    // If username exist

    const currentTime = new Date().getTime();
    if (_user.lock) {
      // If user is lock
      if (_user.lockDelay < currentTime) {
        // If user lock delay is over
        await db.updateOne("users", { _id: _user._id }, { lock: false, tryCount: 0 });
        return false;
      } else {
        // If user is in temporary lock
        const tryAgainIn = Math.round((_user.lockDelay - currentTime) / (60 * 1000)) + 1;
        res.json({ status: "tmp lock", time: tryAgainIn });
        return true;
      }
    }
  } else {
    res.json({ status: "incorrect username" });
    return true;
  }
}

router.get("/check_user_id", async (req, res) => {
  const user = await db.selectOne("users", {username: req.query.username});

  if(user) {
    res.json({user: user});
  } else {
    res.json({error: 1});
  }

});

router.get("/user_info_extra", async (req, res) => {
  const _id = new ObjectId(req.query.id);
  const user = await db.selectOne("users", { _id });

  if(user.session != req.query.session){
    res.json({error: 1, description: 'Session expired!'});
  }
  
  const data = {
    username: user.username,
    nickname: user.nickname,
    profile: user.profile,
    amount: Math.floor(user.balance),
  };
  res.json(data);
});

router.get("/user_info", async (req, res) => {
  const _id = new ObjectId(req.query.id);
  const user = await db.selectOne("users", { _id });
  const data = {
    username: user.username,
    nickname: user.nickname,
    profile: user.profile,
    balance: Math.floor(user.balance),
  };
  res.json(data);
});

router.post("/profile_change", async (req, res) => {
  const credential = {
    username: req.body.username,
    session: req.body.session,
  };
  const user = await db.selectOne("users", credential);

  if (user) {
    const index = req.body.index;
    db.updateOne("users", credential, { profile: index });
    res.end("ok");
  }
});

router.post("/nickname_change", async (req, res) => {
  const credential = {
    username: req.body.username,
    session: req.body.session,
  };
  const user = await db.selectOne("users", credential);

  if (user) {
    const nickname = req.body.nickname;
    db.updateOne("users", credential, { nickname });
    res.end("ok");
  }
});

router.post("/password_change", async (req, res) => {
  const credential = {
    username: req.body.username,
    session: req.body.session,
    password: req.body.oldPassword,
  };
  const user = await db.selectOne("users", credential);

  if (user) {
    const password = req.body.newPassword;
    db.updateOne("users", credential, { password });
    res.end("ok");
  } else {
    res.end("incorrect");
  }
});

router.post("/shankoemee", async (req, res) => {
  console.log(req.body);
  const user = await db.selectOne("users", {
    username: req.body.username,
    session: req.body.session,
  });
  if (user) {
    const data = {
      id: user.username,
      balance: user.balance,
      level: req.body.level,
      info: {
        nickname: user.nickname,
        profile: user.profile,
        winRate: user.winRate ?? 0,
      },
    };

    const respond = await fetch(globalConfig.skm_url + "new_user", {
      method: "POST",
      body: JSON.stringify(data),
      headers: {
        "Content-type": "application/json; charset=UTF-8",
      },
    });
    const obj = await respond.json();
    obj.url = globalConfig.skm_api;
    res.json(obj);
  }
});

router.post("/shankoemee_new_private_room", async (req, res) => {
  console.log(`ShanKoeMee create private room`);
  const user = await db.selectOne("users", {
    username: req.body.username,
    session: req.body.session,
  });
  if (user) {
    if (user.balance < 6000) {
      res.json({ status: "not enough balance" });
      return;
    }

    await db.updateBalance(user.username, -6000);
    await db.insertOne("commission", { agentCode: "main", amount: 6000, time: Date.now() });
    user.balance -= 6000;

    const data = {
      id: user.username,
      balance: user.balance,
      level: req.body.level,
      info: {
        nickname: user.nickname,
        profile: user.profile,
      },
    };

    const respond = await fetch(globalConfig.skm_url + "new_private_room", {
      method: "POST",
      body: JSON.stringify(data),
      headers: {
        "Content-type": "application/json; charset=UTF-8",
      },
    }).catch((err) => {
      console.log(`ShanKoeMee api error!`);
    });

    if (respond) {
      const obj = await respond.json();
      obj.url = globalConfig.skm_api;
      db.updateOne("users", { username: user.username }, { gameState: { game: "shankoemee" } });
      activityLog(user.username, `create private room with balance : ${user.balance}`);
      res.json(obj);
    }
  }
});

router.post("/shankoemee_join_private_room", async (req, res) => {
  console.log(`ShanKoeMee join private room`);
  const user = await db.selectOne("users", {
    username: req.body.username,
    session: req.body.session,
  });
  if (user) {
    if (user.balance < 3000) {
      res.json({ status: "not enough balance" });
      return;
    }

    await db.updateBalance(user.username, -3000);
    await db.insertOne("commission", { agentCode: "main", amount: 3000, time: Date.now() });
    user.balance -= 3000;

    const data = {
      id: user.username,
      balance: user.balance,
      roomNo: req.body.roomNo,
      roomCode: req.body.roomCode,
      info: {
        nickname: user.nickname,
        profile: user.profile,
      },
    };

    const respond = await fetch(globalConfig.skm_url + "join_private_room", {
      method: "POST",
      body: JSON.stringify(data),
      headers: {
        "Content-type": "application/json; charset=UTF-8",
      },
    }).catch((err) => {
      console.log(`ShanKoeMee api error!`);
    });

    if (respond) {
      const obj = await respond.json();
      console.log(obj);
      obj.url = globalConfig.skm_api;
      db.updateOne("users", { username: user.username }, { gameState: { game: "shankoemee" } });
      activityLog(user.username, `join private room with balance : ${user.balance}`);
      res.json(obj);
    } else {
      console.log(`ShanKoeMee api respond error!`);
    }
  }
});

router.post("/bugyee", async (req, res) => {
  const user = await db.selectOne("users", {
    username: req.body.username,
    session: req.body.session,
  });
  if (user) {
    const data = {
      id: user.username,
      balance: user.balance,
      level: req.body.level,
      info: {
        nickname: user.nickname,
        profile: user.profile,
        winRate: user.winRate ?? 0,
      },
    };

    const respond = await fetch(globalConfig.bugyee_url + "new_user", {
      method: "POST",
      body: JSON.stringify(data),
      headers: {
        "Content-type": "application/json; charset=UTF-8",
      },
    });
    const obj = await respond.json();
    obj.url = globalConfig.bugyee_api;
    res.json(obj);
  }
});

router.post("/bugyee_new_private_room", async (req, res) => {
  console.log(`Bugyee create private room`);
  const user = await db.selectOne("users", {
    username: req.body.username,
    session: req.body.session,
  });
  if (user) {
    if (user.balance < 6000) {
      res.json({ status: "not enough balance" });
      return;
    }

    await db.updateBalance(user.username, -6000);
    await db.insertOne("commission", { agentCode: "main", amount: 6000, time: Date.now() });
    user.balance -= 6000;

    const data = {
      id: user.username,
      balance: user.balance,
      level: req.body.level,
      info: {
        nickname: user.nickname,
        profile: user.profile,
      },
    };

    const respond = await fetch(globalConfig.bugyee_url + "new_private_room", {
      method: "POST",
      body: JSON.stringify(data),
      headers: {
        "Content-type": "application/json; charset=UTF-8",
      },
    }).catch((err) => {
      console.log(`Bugyee api error!`);
    });

    if (respond) {
      const obj = await respond.json();
      obj.url = globalConfig.bugyee_api;
      db.updateOne("users", { username: user.username }, { gameState: { game: "bugyee" } });
      activityLog(user.username, `create private room with balance : ${user.balance}`);
      res.json(obj);
    }
  }
});

router.post("/bugyee_join_private_room", async (req, res) => {
  console.log(`Bugyee join private room`);
  const user = await db.selectOne("users", {
    username: req.body.username,
    session: req.body.session,
  });
  if (user) {
    if (user.balance < 3000) {
      res.json({ status: "not enough balance" });
      return;
    }

    await db.updateBalance(user.username, -3000);
    await db.insertOne("commission", { agentCode: "main", amount: 3000, time: Date.now() });
    user.balance -= 3000;

    const data = {
      id: user.username,
      balance: user.balance,
      roomNo: req.body.roomNo,
      roomCode: req.body.roomCode,
      info: {
        nickname: user.nickname,
        profile: user.profile,
      },
    };

    const respond = await fetch(globalConfig.bugyee_url + "join_private_room", {
      method: "POST",
      body: JSON.stringify(data),
      headers: {
        "Content-type": "application/json; charset=UTF-8",
      },
    }).catch((err) => {
      console.log(`Bugyee api error!`);
    });

    if (respond) {
      const obj = await respond.json();
      console.log(obj);
      obj.url = globalConfig.bugyee_api;
      db.updateOne("users", { username: user.username }, { gameState: { game: "bugyee" } });
      activityLog(user.username, `join private room with balance : ${user.balance}`);
      res.json(obj);
    } else {
      console.log(`Bugyee api respond error!`);
    }
  }
});

router.post("/shweshan", async (req, res) => {
  const user = await db.selectOne("users", {
    username: req.body.username,
    session: req.body.session,
  });
  if (user) {
    const data = {
      id: user.username,
      balance: user.balance,
      level: req.body.level,
      info: {
        nickname: user.nickname,
        profile: user.profile,
        winRate: user.winRate ?? 0,
      },
    };

    const respond = await fetch(globalConfig.shweshan_url + "new_user", {
      method: "POST",
      body: JSON.stringify(data),
      headers: {
        "Content-type": "application/json; charset=UTF-8",
      },
    });
    const obj = await respond.json();
    obj.url = globalConfig.shweshan_api;
    res.json(obj);
  }
});

router.post("/shweshan_new_private_room", async (req, res) => {
  console.log(`ShweShan create private room`);
  const user = await db.selectOne("users", {
    username: req.body.username,
    session: req.body.session,
  });
  if (user) {
    if (user.balance < 6000) {
      res.json({ status: "not enough balance" });
      return;
    }

    await db.updateBalance(user.username, -6000);
    await db.insertOne("commission", { agentCode: "main", amount: 6000, time: Date.now() });
    user.balance -= 6000;

    const data = {
      id: user.username,
      balance: user.balance,
      level: req.body.level,
      info: {
        nickname: user.nickname,
        profile: user.profile,
      },
    };

    const respond = await fetch(globalConfig.shweshan_url + "new_private_room", {
      method: "POST",
      body: JSON.stringify(data),
      headers: {
        "Content-type": "application/json; charset=UTF-8",
      },
    }).catch((err) => {
      console.log(`ShweShan api error!`);
    });

    if (respond) {
      const obj = await respond.json();
      obj.url = globalConfig.shweshan_api;
      db.updateOne("users", { username: user.username }, { gameState: { game: "shweshan" } });
      activityLog(user.username, `create private room with balance : ${user.balance}`);
      res.json(obj);
    }
  }
});

router.post("/shweshan_join_private_room", async (req, res) => {
  console.log(`ShweShan join private room`);
  const user = await db.selectOne("users", {
    username: req.body.username,
    session: req.body.session,
  });
  if (user) {
    if (user.balance < 3000) {
      res.json({ status: "not enough balance" });
      return;
    }

    await db.updateBalance(user.username, -3000);
    await db.insertOne("commission", { agentCode: "main", amount: 3000, time: Date.now() });
    user.balance -= 3000;

    const data = {
      id: user.username,
      balance: user.balance,
      roomNo: req.body.roomNo,
      roomCode: req.body.roomCode,
      info: {
        nickname: user.nickname,
        profile: user.profile,
      },
    };

    const respond = await fetch(globalConfig.shweshan_url + "join_private_room", {
      method: "POST",
      body: JSON.stringify(data),
      headers: {
        "Content-type": "application/json; charset=UTF-8",
      },
    }).catch((err) => {
      console.log(`ShweShan api error!`);
    });

    if (respond) {
      const obj = await respond.json();
      console.log(obj);
      obj.url = globalConfig.shweshan_api;
      db.updateOne("users", { username: user.username }, { gameState: { game: "shweshan" } });
      activityLog(user.username, `join private room with balance : ${user.balance}`);
      res.json(obj);
    } else {
      console.log(`ShweShan api respond error!`);
    }
  }
});

router.post("/poker13", async (req, res) => {
  console.log(`Poker new user request - `);
  console.log(req.body);
  try {
    const user = await db.selectOne("users", {
      username: req.body.username,
      session: req.body.session,
    });
    if (user) {
      const data = {
        id: user.username,
        balance: user.balance,
        level: req.body.level,
        info: {
          nickname: user.nickname,
          profile: user.profile,
          winRate: user.winRate ?? 0,
        },
      };

      const respond = await fetch(globalConfig.poker_13_url + "new_user", {
        method: "POST",
        body: JSON.stringify(data),
        headers: {
          "Content-type": "application/json; charset=UTF-8",
        },
      });
      const obj = await respond.json();
      obj.url = globalConfig.poker_13_api;
      res.json(obj);
    }
  } catch (err) {
    res.json({ status: "error" });
  }
});

router.post("/poker_new_private_room", async (req, res) => {
  console.log(`Poker create private room`);
  const user = await db.selectOne("users", {
    username: req.body.username,
    session: req.body.session,
  });
  if (user) {
    if (user.balance < 6000) {
      res.json({ status: "not enough balance" });
      return;
    }

    await db.updateBalance(user.username, -6000);
    await db.insertOne("commission", { agentCode: "main", amount: 6000, time: Date.now() });
    user.balance -= 6000;

    const data = {
      id: user.username,
      balance: user.balance,
      level: req.body.level,
      info: {
        nickname: user.nickname,
        profile: user.profile,
      },
    };

    const respond = await fetch(globalConfig.poker_13_url + "new_private_room", {
      method: "POST",
      body: JSON.stringify(data),
      headers: {
        "Content-type": "application/json; charset=UTF-8",
      },
    }).catch((err) => {
      console.log(`Poker api error!`);
    });
    if (respond) {
      const obj = await respond.json();
      obj.url = globalConfig.poker_13_api;
      db.updateOne("users", { username: user.username }, { gameState: { game: "poker" } });
      activityLog(user.username, `create private room with balance : ${user.balance}`);
      res.json(obj);
    }
  }
});

router.post("/poker_join_private_room", async (req, res) => {
  console.log(`Poker join private room`);
  const user = await db.selectOne("users", {
    username: req.body.username,
    session: req.body.session,
  });
  if (user) {
    if (user.balance < 3000) {
      res.json({ status: "not enough balance" });
      return;
    }

    await db.updateBalance(user.username, -3000);
    await db.insertOne("commission", { agentCode: "main", amount: 3000, time: Date.now() });
    user.balance -= 3000;

    const data = {
      id: user.username,
      balance: user.balance,
      roomNo: req.body.roomNo,
      roomCode: req.body.roomCode,
      info: {
        nickname: user.nickname,
        profile: user.profile,
      },
    };

    const respond = await fetch(globalConfig.poker_13_url + "join_private_room", {
      method: "POST",
      body: JSON.stringify(data),
      headers: {
        "Content-type": "application/json; charset=UTF-8",
      },
    }).catch((err) => {
      console.log(`Poker api error!`);
    });

    if (respond) {
      const obj = await respond.json();
      console.log(obj);
      obj.url = globalConfig.poker_13_api;
      db.updateOne("users", { username: user.username }, { gameState: { game: "poker" } });
      activityLog(user.username, `join private room with balance : ${user.balance}`);
      res.json(obj);
    } else {
      console.log(`Poker api respond error!`);
    }
  }
});

router.post("/skm_bet", async (req, res) => {
  console.log(`ShanKoeMee Bet request`);
  const user = await db.selectOne("users", {
    username: req.body.username,
    session: req.body.session,
  });
  if (!user) return;
  const data = {
    id: user.username,
    balance: user.balance,
    info: {
      nickname: user.nickname,
      profile: user.profile,
    },
  };

  const respond = await fetch(globalConfig.skm_bet_url + "new_user", {
    method: "POST",
    body: JSON.stringify(data),
    headers: {
      "Content-type": "application/json; charset=UTF-8",
    },
  });
  const obj = await respond.json();
  console.log(`Respond from SKM Bet Api : ${obj}`);
  obj.url = globalConfig.skm_bet_api;
  res.json(obj);
});

router.post("/horse_bet", async (req, res) => {
  console.log(`Horse Bet request`);
  const user = await db.selectOne("users", {
    username: req.body.username,
    session: req.body.session,
  });
  if (!user) return;
  const data = {
    id: user.username,
    balance: user.balance,
    info: {
      nickname: user.nickname,
      profile: user.profile,
    },
  };

  const respond = await fetch(globalConfig.horse_bet_url + "new_user", {
    method: "POST",
    body: JSON.stringify(data),
    headers: {
      "Content-type": "application/json; charset=UTF-8",
    },
  });
  const obj = await respond.json();
  console.log(`Respond from Horse Bet Api : ${obj}`);
  obj.url = globalConfig.horse_bet_api;
  res.json(obj);
});

router.post("/dragon_tiger_bet", async (req, res) => {
  console.log(`Dragon Tiger Bet request`);
  const user = await db.selectOne("users", {
    username: req.body.username,
    session: req.body.session,
  });
  if (!user) return;
  const data = {
    id: user.username,
    balance: user.balance,
    info: {
      nickname: user.nickname,
      profile: user.profile,
    },
  };

  const respond = await fetch(globalConfig.dragon_tiger_bet_url + "new_user", {
    method: "POST",
    body: JSON.stringify(data),
    headers: {
      "Content-type": "application/json; charset=UTF-8",
    },
  });
  const obj = await respond.json();
  console.log(`Respond from Dragon Tiger Bet Api : ${obj}`);
  obj.url = globalConfig.dragon_tiger_bet_api;
  res.json(obj);
});

// GON KHAUNG SENG DU's CODE
router.post("/user_balance_update", async (req, res) => {
    const _id = new ObjectId(req.body.id);
    db.updateOne("users", { _id }, { balance: Number(req.body.balance) });
    transactionLog(req.body.id, req.body.status, req.body.amount, req.body.type, req.body.totalBetValue)
    res.end("ok");
  // }
});
async function transactionLog(id, status, amount, type, totalBetValue = null) {
  const _id = new ObjectId(id);
  const user = await db.selectOne("users", { _id });
    const data = {
      game: 'slot',
      level: type,
      roomNo: '-',
      bet: totalBetValue || amount,
      username: user.username,
      amount,
      status,
      agentCode: user.agentCode,
      balance: Number(user.balance),
      time: Date.now(),
    };
    db.insertOne("play_log", data);
}

module.exports = router;
