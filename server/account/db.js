const fs = require("fs");
const mongodb = require("mongodb");
const MongoClient = mongodb.MongoClient;
const globalConfig = JSON.parse(fs.readFileSync("../config.json"));

const db = {};
let database = null;

MongoClient.connect(globalConfig.dburl, function (err, db) {
  if (err) throw err;
  console.log("Database connected!");
  database = db.db(globalConfig.dbname);
  initDB();
});

// --------- Common ---------

db.selectOne = async (collectionName, filter) => {
  let result = null;
  const collection = database.collection(collectionName);
  result = await collection.findOne(filter);
  return result;
};

db.selectMany = async (collectionName, filter, sort = { _id: -1 }) => {
  let result = null;
  const collection = database.collection(collectionName);
  result = await collection.find(filter).sort(sort).toArray();
  return result;
};

db.insertOne = async (collectionName, data) => {
  const collection = database.collection(collectionName);
  await collection.insertOne(data);
};

db.updateOne = async (collectionName, filter, update) => {
  const collection = database.collection(collectionName);
  await collection.updateOne(filter, { $set: update });
};

db.updateMany = async (collectionName, filter, update) => {
  const collection = database.collection(collectionName);
  await collection.updateMany(filter, { $set: update });
};

// --------- User ---------

db.incUserTryCount = async (_id) => {
  const collection = database.collection("users");
  await collection.updateOne({ _id }, { $inc: { tryCount: 1 } });
  const result = collection.findOne({ _id });
  return result;
};

// --------- Balance Control ---------

db.updateBalance = async (username, amount) => {
  const collection = database.collection("users");
  await collection.updateOne({ username }, { $inc: { balance: amount } });
};

db.transferToGame = async (game, roomNo, username, amount) => {
  console.log(`Transfer from ${game} to ${username}, amount : ${amount} (Room No : ${roomNo})`);

  const collection1 = database.collection("users");
  await collection1.updateOne({ username }, { $inc: { balance: -amount } });

  const collection2 = database.collection(game);
  await collection2.updateOne({ roomNo }, { $inc: { balance: amount } });
};

db.transferToUser = async (game, roomNo, username, amount) => {
  console.log(`Transfer from ${username} to ${game}, amount : ${amount} (Room No : ${roomNo})`);

  const collection1 = database.collection("users");
  await collection1.updateOne({ username }, { $inc: { balance: amount } });

  const collection2 = database.collection(game);
  await collection2.updateOne({ roomNo }, { $inc: { balance: -amount } });
};

db.transferBetweenUser = async (from, to, amount) => {
  const collection = database.collection("users");
  if (from != "bot") await collection.updateOne({ username: from }, { $inc: { balance: -amount } });
  if (to != "bot") await collection.updateOne({ username: to }, { $inc: { balance: amount } });
};

db.transferToCommission = async (username, agentCode, amount) => {
  const collection1 = database.collection("users");
  await collection1.updateOne({ username }, { $inc: { balance: -amount } });
  db.logData(agentCode, { commission: amount });
};

db.transferToBetGame = async (game, amount, username) => {
  const chk = await db.selectOne("bet", { game });
  if (!chk) await db.insertOne("bet", { game, balance: 0 });
  const collection1 = database.collection("users");
  await collection1.updateOne({ username }, { $inc: { balance: -amount } });
  const collection2 = database.collection("bet");
  await collection2.updateOne({ game }, { $inc: { balance: amount } });
};

db.transferFromBetGame = async (game, amount, username) => {
  const collection1 = database.collection("users");
  await collection1.updateOne({ username }, { $inc: { balance: amount } });
  const collection2 = database.collection("bet");
  await collection2.updateOne({ game }, { $inc: { balance: -amount } });
};

// --------- Datasheet ---------

db.logData = async (agentCode, field) => {
  let time = getToday();
  const agent = await db.selectOne("agent", { agentCode });
  const init_data = {
    commission: 0,
    newUser: 0,
    activeUser: 0,
    deposit: 0,
    withdraw: 0,
    fromParent: 0,
    toParent: 0,
    fromChildren: 0,
    toChildren: 0,
    time,
    agentCode,
    agentRole: agent?.role ?? null,
    agentMaster: agent?.master ?? null,
  };
  // Add daily
  const collection_day = database.collection("datasheet");
  const data_daily = await collection_day.findOne({ time, agentCode });
  if (!data_daily) {
    await collection_day.insertOne(init_data);
  }
  await collection_day.updateOne({ time, agentCode }, { $inc: field });

  // Add monthly
  const collection_month = database.collection("datasheet_monthly");
  let str = time.toString();
  time = parseInt(str.slice(0, 6));
  const data_monthly = await collection_month.findOne({ time, agentCode });
  if (!data_monthly) {
    init_data.time = time;
    await collection_month.insertOne(init_data);
  }
  await collection_month.updateOne({ time, agentCode }, { $inc: field });
};

// --------- Utilities ---------

function getToday() {
  var d = new Date(),
    month = "" + (d.getMonth() + 1),
    day = "" + d.getDate(),
    year = d.getFullYear();

  if (month.length < 2) month = "0" + month;
  if (day.length < 2) day = "0" + day;

  return parseInt([year, month, day].join(""));
}

// --------- Init Data ---------

async function initDB() {
  db.updateMany("users", {}, { gameState: null });
}

module.exports = db;
