const express = require("express");
const { ObjectId } = require("mongodb");
const db = require("../db");
const router = express.Router();

router.get("/:username", async (req, res) => {
  const agentCode = req.session.agentCode;
  const session = req.session;
  let page = 0;
  if (req.query.p) page = req.query.p;
  const role = req.session.role;
  const username = req.params.username;
  const [arr, total, lastPage] = await db.selectPagination(
    "user_activity",
    { username },
    page,
    50
  );
  res.render("user_activity", { arr, username, role, agentCode, session });
});

router.post("/", async (req, res) => {});

module.exports = router;
