const express = require("express");
const { ObjectId } = require("mongodb");
const db = require("../db");
const router = express.Router();

// Configuration
const pageLimit = 100;

router.get("/:username", async (req, res) => {
  let page = 0;
  if (req.query.p) page = parseInt(req.query.p);
  const role = req.session.role;
  const username = req.params.username;
  const user = await db.selectOne("users", { username });
  const [arr, total, lastPage] = await db.selectPagination(
    "user_activity",
    { username },
    page,
    pageLimit
  );
  res.render("user_activity", { arr, total, page, lastPage, user, role });
});

router.post("/", async (req, res) => {});

module.exports = router;
