const fs = require("fs");
const express = require("express");
const session = require("express-session");
const captcha = require("trek-captcha");
const url = require("url");
const sysConfig = JSON.parse(fs.readFileSync("config/system.json"));

const LOG_PATH = "error_log.txt";

const app = express();

app.use(
  session({
    secret: "goldennine",
    resave: false,
    saveUninitialized: false,
    expires: new Date(Date.now() + 30 * 86400 * 1000),
  })
);
app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));
app.set("views", "views");
app.set("view engine", "ejs");

const allowUrl = ["/login", "/captcha"];

app.use("/", (req, res, next) => {
  const pathname = url.parse(req.url).pathname;
  if (allowUrl.includes(pathname)) {
    next();
  } else {
    const role = req.session.role;
    if (!role) {
      res.redirect("/login");
      return;
    } else {
      next();
    }
  }
});

app.get("/", (req, res) => {
  res.redirect("/dashboard");
});

app.get("/captcha", async (req, res) => {
  const { token, buffer } = await captcha();
  req.session.captcha = token;
  res.writeHead(200, { "Content-Type": "image/png" });
  res.write(buffer);
  res.end();
});

app.get("/logout", (req, res) => {
  req.session.destroy();
  res.redirect("/");
});

const dashboard = require("./modals/dashboard");
app.use("/dashboard", dashboard);

const deposit = require("./modals/deposit");
app.use("/deposit", deposit);

const withdraw = require("./modals/withdraw");
app.use("/withdraw", withdraw);

const user = require("./modals/user");
app.use("/user", user);

const play_log = require("./modals/play_log");
app.use("/play_log", play_log);

const transfer_log = require("./modals/transfer_log");
app.use("/transfer_log", transfer_log);

const role = require("./modals/role");
app.use("/role", role);

const bot = require("./modals/bot");
app.use("/bot", bot);

const setting = require("./modals/setting");
app.use("/setting", setting);

const slot_report = require("./modals/slot_report");
app.use("/slot_report", slot_report);

const user_activity = require("./modals/user_activity");
app.use("/user_activity", user_activity);

const agent = require("./modals/agent");
app.use("/agent", agent);

const agent_transfer_log = require("./modals/agent_transfer_log");
app.use("/agent_transfer_log", agent_transfer_log);

const agent_daily = require("./modals/agent_daily");
app.use("/agent_daily", agent_daily);

const agent_monthly = require("./modals/agent_monthly");
app.use("/agent_monthly", agent_monthly);

const master = require("./modals/master");
app.use("/master", master);

const master_transfer_log = require("./modals/master_transfer_log");
app.use("/master_transfer_log", master_transfer_log);

const master_daily = require("./modals/master_daily");
app.use("/master_daily", master_daily);

const master_monthly = require("./modals/master_monthly");
app.use("/master_monthly", master_monthly);

const senior = require("./modals/senior");
app.use("/senior", senior);

const senior_transfer_log = require("./modals/senior_transfer_log");
app.use("/senior_transfer_log", senior_transfer_log);

const senior_daily = require("./modals/senior_daily");
app.use("/senior_daily", senior_daily);

const senior_monthly = require("./modals/senior_monthly");
app.use("/senior_monthly", senior_monthly);

const login = require("./modals/login");
app.use("/login", login);

const server = app.listen(sysConfig.PORT, () => {
  console.log(`Admin server is running at PORT ${sysConfig.PORT}`);
});
