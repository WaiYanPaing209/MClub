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

db.selectPagination = async (
  collectionName,
  filter,
  page,
  limit,
  sort = { _id: -1 }
) => {
  let result = null;
  const start = page * limit;
  const collection = database.collection(collectionName);
  result = await collection
    .find(filter)
    .sort(sort)
    .skip(start)
    .limit(limit)
    .toArray();

  const total = await collection.countDocuments(filter);
  const lastPage = Math.floor(total / limit);
  return [result, total, lastPage];
};

db.selectTotal = async (collectionName, filter, fieldName) => {
  const collection = database.collection(collectionName);
  const result = await collection
    .aggregate([
      {
        $match: filter,
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

db.deleteOne = async (collectionName, filter) => {
  const collection = database.collection(collectionName);
  await collection.deleteOne(filter);
};

db.deleteMany = async (collectionName, filter) => {
  const collection = database.collection(collectionName);
  await collection.deleteMany(filter);
};

// --------- Agent ---------

db.incAgentTryCount = async (_id) => {
  const collection = database.collection("agent_users");
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

db.updateUser = async (filter, update) => {
  const collection = database.collection("users");
  await collection.updateOne(filter, { $set: update });
};

db.updateUserBalance = async (filter, amount) => {
  try {
    const collection = database.collection("users");
    await collection.updateOne(filter, {
      $inc: { adminCash: amount, balance: amount },
    });
  } catch (err) {}
};

db.incUserTryCount = async (_id) => {
  const collection = database.collection("users");
  await collection.updateOne({ _id }, { $inc: { tryCount: 1 } });
  const result = collection.findOne({ _id });
  return result;
};

// --------- User Activity ---------

db.insertUserActivity = async (activity) => {
  activity.time = new Date().getTime();
  const collection = database.collection("user_activity");
  const result = await collection.insertOne(activity);
  console.log(`User Activity inserted with the _id: ${result.insertedId}`);
};

db.selectUserActivity = async (filter = {}) => {
  let result = null;
  const collection = database.collection("user_activity");
  const options = {
    sort: { _id: -1 },
  };
  result = await collection.find(filter, options).toArray();
  return result;
};

// --------- Agent ---------

db.totalAgentComission = async (agentCode) => {
  let result = null;
  const collection = database.collection("agent_comission");
  result = await collection
    .aggregate([
      {
        $match: { agentCode },
      },
      {
        $group: { _id: null, total: { $sum: "$amount" } },
      },
    ])
    .toArray();
  if (result[0]?.total) {
    return result[0].total;
  } else {
    return 0;
  }
};

// --------- Admin Activity ---------

db.insertAdminActivity = async (activity) => {
  activity.time = new Date().getTime();
  const collection = database.collection("admin_activity");
  const result = await collection.insertOne(activity);
  console.log(`Admin activity inserted with the _id: ${result.insertedId}`);
};

db.selectAdminActivity = async (filter = {}) => {
  let result = null;
  const collection = database.collection("admin_activity");
  const options = {
    sort: { _id: -1 },
  };
  result = await collection.find(filter, options).toArray();
  return result;
};

// --------- Message ---------

db.insertMessage = async (message) => {
  const collection = database.collection("message");
  const result = await collection.insertOne(message);
  console.log(`Message inserted with the _id: ${result.insertedId}`);
};

db.selectAllMessage = async (filter = {}) => {
  let result = null;
  const collection = database.collection("message");
  const sort = { _id: -1 };
  result = await collection.find(filter).sort(sort).toArray();
  return result;
};

db.updateMessage = async (filter, update) => {
  const collection = database.collection("message");
  await collection.updateOne(filter, { $set: update });
};

db.deleteMessage = async (filter) => {
  const collection = database.collection("message");
  await collection.deleteOne(filter);
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

// --------- Main Comission ---------

db.totalMainComission = async (filter = {}) => {
  let result = null;
  const collection = database.collection("main_comission");
  result = await collection
    .aggregate([
      {
        $group: { _id: null, total: { $sum: "$amount" } },
      },
    ])
    .toArray();
  if (result[0]?.total) {
    return result[0].total;
  } else {
    return null;
  }
};

// --------- Datasheet ---------

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

db.deposit = async (username, amount, agentCode) => {
  await db.updateBalance(username, amount);
  await db.updateOneAlt("agent", { agentCode }, { $inc: { balance: -amount } });
  db.logData(agentCode, { deposit: amount });
};

db.withdraw = async (username, amount, agentCode) => {
  await db.updateBalance(username, -amount);
  await db.updateOneAlt("agent", { agentCode }, { $inc: { balance: amount } });
  db.logData(agentCode, { withdraw: amount });
};

db.newUser = async (user, agentCode) => {
  db.insertOne("users", user);
  db.logData(agentCode, { newUser: 1 });
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

  // Log to master
  if (agent?.role && agent?.master) {
    if (
      (agent.role == "agent" || agent.role == "master") &&
      (field?.deposit || field?.withdraw || field?.newUser)
    ) {
      db.logData(agent.master, field);
    }
  }
};

function getToday() {
  var d = new Date(),
    month = "" + (d.getMonth() + 1),
    day = "" + d.getDate(),
    year = d.getFullYear();

  if (month.length < 2) month = "0" + month;
  if (day.length < 2) day = "0" + day;

  return parseInt([year, month, day].join(""));
}

// --------- Make default admin account ---------

async function initDefaultData() {}

module.exports = db;
