const express = require("express");
const { ObjectId } = require("mongodb");
const db = require("../db");
const router = express.Router();

// Configuration
const pageLimit = 10000;

router.get("/", async (req, res) => {
  let filter = { agentRole: "agent" };
  let page = 0;
  if (req.query.p) {
    page = req.query.p;
  }
  if (req.query.username) {
    filter.agentCode = req.query.username;
  }
  if (req.query.agentMaster) {
    filter.agentMaster = req.query.agentMaster;
  }
  if (req.query.start && req.query.end) {
    const start = parseInt(req.query.start + "01");
    const end = parseInt(req.query.end + "31");
    filter.time = { $gte: start, $lte: end };
  }

  const [arr, total, lastPage] = await db.selectPagination(
    "datasheet",
    filter,
    page,
    pageLimit
  );

  const groupedData = {};

  arr.forEach((item) => {
    // const date = new Date(item.time);
    const year = item.time.toString().slice(0, 4);
    const month = item.time.toString().slice(4, 6);
  
    // Create a unique key for each month and agent_code combination
    const key = `${year}-${month}-${item.agentCode}`;
  
    if (!groupedData[key]) {
      groupedData[key] = { time: year + month, agent_code: item.agentCode, commission: 0, newUser: 0, activeUser: 0, deposit: 0, withdraw: 0, fromParent: 0, toParent: 0 };
    }
  
    groupedData[key].commission += item.commission;
    groupedData[key].newUser += item.newUser;
    groupedData[key].activeUser += item.activeUser;
    groupedData[key].deposit += item.deposit;
    groupedData[key].withdraw += item.withdraw;
    groupedData[key].fromParent += item.fromParent;
    groupedData[key].toParent += item.toParent;
    groupedData[key].agentCode = item.agentCode;
    groupedData[key].agentRole = item.agentRole;
    groupedData[key].agentMaster = item.agentMaster;
  });
  
  // Convert the grouped data object to an array of objects
  const resultArray = Object.values(groupedData);
  
  const role = req.session.role;
  const [previous, next] = paginationURL(req.query, lastPage);
  res.render("agent_monthly", { arr: resultArray, role, page, previous, next, req });
});

function paginationURL(query, lastPage) {
  let page = 0;
  if (query.p) page = parseInt(query.p);
  console.log(`Current page : ${page}, Last page : ${lastPage}`);
  let next,
    previous = null;
  if (page != 0) {
    let obj = { ...query };
    obj.p = page - 1;
    previous = new URLSearchParams(obj).toString();
  }
  if (page < lastPage) {
    let obj = { ...query };
    obj.p = page + 1;
    next = new URLSearchParams(obj).toString();
  }
  return [previous, next];
}

module.exports = router;
