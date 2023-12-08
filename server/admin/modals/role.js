const express = require("express");
const { ObjectId } = require("mongodb");
const db = require("../db");
const router = express.Router();

router.get("/", async (req, res) => {
  const arr = await db.selectMany("admin", {});
  const role = req.session.role;
  res.render("role", { arr, role });
});

router.post("/", async (req, res) => {
  let body = req.body;
  if (body.req == "new") {
    const admin = {
      username: body.username,
      password: body.password,
      role: body.role,
    };
    await db.insertOne("admin", admin);
  } else if (body.req == "edit") {
    const _id = new ObjectId(body._id);
    delete body._id;
    delete body.req;
    await db.updateOne("admin", { _id }, body);
  } else if (body.delete) {
    const _id = new ObjectId(body.delete);
    await db.deleteOne("admin", { _id });
  }
  res.redirect("/role");
});

module.exports = router;
