const fs = require("fs");
const express = require("express");
const cors = require("cors");
const db = require("./db");
const sysConfig = JSON.parse(fs.readFileSync("config/system.json"));

const LOG_PATH = "error_log.txt";

const app = express();

app.use(
  cors({
    origin: "*",
  })
);
app.use(express.static("public"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.end("Server is running ok!");
});

const api = require("./api");
app.use("/api", api);

const server = app.listen(sysConfig.apiPort, () => {
  console.log(`Account api server is running at PORT ${sysConfig.apiPort}`);
});

// ----- Communication Server ------

const commApp = new express();
commApp.use(express.json());

const comm = require("./comm");
commApp.use("/", comm);

commApp.listen(sysConfig.commPort, () => {
  console.log(
    `Account communication server is running at PORT ${sysConfig.commPort}`
  );
});
