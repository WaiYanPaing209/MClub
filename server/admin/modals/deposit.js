const express = require("express");
const { ObjectId } = require("mongodb");
const db = require("../db");
const router = express.Router();

// Configuration
const pageLimit = 100;

router.get("/", async (req, res) => {
  let page = 0;
  if (req.query.p) {
    page = req.query.p;
  }
  const [arr, total, lastPage] = await db.selectPagination("deposit", {}, page, pageLimit);
  const role = req.session.role;
  res.render("deposit", { arr, total, lastPage, role });
});

module.exports = router;
