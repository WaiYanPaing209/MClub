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
  initDefaultData();
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

db.selectPagination = async (collectionName, filter, page, limit, sort = { _id: -1 }) => {
  let result = null;
  const start = page * limit;
  const collection = database.collection(collectionName);
  result = await collection.find(filter).sort(sort).skip(start).limit(limit).toArray();

  const total = await collection.countDocuments(filter);
  const lastPage = Math.floor(total / limit);
  return [result, total, lastPage];
};

db.insertOne = async (collectionName, data) => {
  const collection = database.collection(collectionName);
  await collection.insertOne(data);
};

db.updateOne = async (collectionName, filter, update) => {
  const collection = database.collection(collectionName);
  await collection.updateOne(filter, { $set: update });
};

db.updateOneAlt = async (collectionName, filter, update) => {
  const collection = database.collection(collectionName);
  await collection.updateOne(filter, update);
};

db.updateMany = async (collectionName, filter, update) => {
  const collection = database.collection(collectionName);
  await collection.updateMany(filter, { $set: update });
};

db.deleteOne = async (collectionName, filter) => {
  const collection = database.collection(collectionName);
  await collection.deleteOne(filter);
};

db.deleteMany = async (collectionName, filter) => {
  const collection = database.collection(collectionName);
  await collection.deleteMany(filter);
};

db.selectTotal = async (collectionName, filter, fieldName) => {
  const collection = database.collection(collectionName);
  const result = await collection
    .aggregate([
      {
        $match: filter,
      },
      {
        $addFields: {
          amount: { $toDouble: '$amount' },
        },
      },
      {
        $group: { _id: null, total: { $sum: fieldName } },
      },
    ])
    .toArray();
  if (result[0]?.total) {
    return result[0].total;
  } else {
    return 0;
  }
};

db.selectCount = async (collectionName, filter) => {
  const collection = database.collection(collectionName);
  const result = await collection.countDocuments(filter);
  return result;
};

// --------- Admin ---------

db.incAdminTryCount = async (_id) => {
  const collection = database.collection("admin");
  await collection.updateOne({ _id }, { $inc: { tryCount: 1 } });
  const result = collection.findOne({ _id });
  return result;
};

// --------- User ---------

db.selectUser = async (filter) => {
  let result = null;
  const collection = database.collection("users");
  result = await collection.findOne(filter);

  return result;
};

db.selectUsers = async (filter) => {
  let result = null;
  const collection = database.collection("users");
  const sort = { gameState: -1, _id: -1 };
  result = await collection.find(filter).sort(sort).toArray();

  return result;
};

db.insertUser = async (user) => {
  user.time = new Date().getTime();
  user.balance = 0;
  user.adminCash = 0;
  const collection = database.collection("users");
  const result = await collection.insertOne(user);
};

db.incUserTryCount = async (_id) => {
  const collection = database.collection("users");
  await collection.updateOne({ _id }, { $inc: { tryCount: 1 } });
  const result = collection.findOne({ _id });
  return result;
};

// --------- Game Room ---------

db.selectAllGameHistoryByDate = async (from, to) => {
  let result = null;
  const filter = { time: { $gt: from, $lt: to } };
  const sort = { _id: -1 };
  const collection = database.collection("skm_room");
  result = await collection.find(filter).sort(sort).toArray();

  return result;
};

db.selectGameHistory = async (gameId) => {
  let result = null;
  const filter = {
    players: { $in: [gameId] },
  };
  const options = {
    sort: { _id: -1 },
  };
  const collection = database.collection("game_room");
  result = await collection.find(filter, options).limit(10).toArray();

  return result;
};

// --------- Balance Control ---------

db.updateBalance = async (username, amount) => {
  const collection = database.collection("users");
  await collection.updateOne({ username }, { $inc: { balance: amount } });
};

// --------- Dashboard ---------

db.selectDatasheet = async (filter) => {
  const collection = database.collection("datasheet");
  const result = await collection
    .aggregate([
      {
        $match: filter,
      },
      {
        $group: {
          _id: null,
          commission: { $sum: "$commission" },
          deposit: { $sum: "$deposit" },
          withdraw: { $sum: "$withdraw" },
          newUser: { $sum: "$newUser" },
        },
      },
    ])
    .toArray();
  return result[0];
};

// --------- Datasheet ---------

db.deposit = async (username, amount) => {
  await db.updateBalance(username, amount);
  await db.logData("default", { deposit: amount });
};

db.withdraw = async (username, amount) => {
  await db.updateBalance(username, -amount);
  await db.logData("default", { withdraw: amount });
};

db.newUser = async (user) => {
  db.insertOne("users", user);
  db.logData("default", { newUser: 1 });
};

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
    agentRole: agent.role,
    agentMaster: agent.master,
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
  console.log(`Log data - agent code : ${agentCode}, time : ${time}`);
};

// --------- Make default admin account ---------

async function initDefaultData() {
  const defaultAdmin = {
    username: "admin",
    password: "admin",
    role: "head",
  };

  const adminResult = await db.selectOne("admin", { role: "head" });
  if (!adminResult) {
    db.insertOne("admin", defaultAdmin);
  }

  // Insert default agent
  const agent = {
    name: "Default",
    commission: 0,
    agentCode: "default",
    password: "123456",
    role: "master",
    master: "",
    balance: 0,
    time: new Date().getTime(),
  };

  const agentResult = await db.selectOne("agent", { agentCode: "default" });
  if (!agentResult) {
    db.insertOne("agent", agent);
  }

  // Insert default setting
  const setting = {
    privateCreateFee: 2000,
    privateJoinFee: 1000,
  };

  const settingResult = await db.selectOne("setting", {});
  if (!settingResult) {
    db.insertOne("setting", setting);
  }
}

function getToday() {
  var d = new Date(),
    month = "" + (d.getMonth() + 1),
    day = "" + d.getDate(),
    year = d.getFullYear();

  if (month.length < 2) month = "0" + month;
  if (day.length < 2) day = "0" + day;

  return parseInt([year, month, day].join(""));
}

module.exports = db;
