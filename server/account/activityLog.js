const db = require("./db");

function activityLog(username, message, balance) {
  const time = Date.now();
  db.insertOne("user_activity", { username, message, balance, time });
}

module.exports = activityLog;
