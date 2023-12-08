const fs = require("fs");
const sysConfig = JSON.parse(fs.readFileSync("config/system.json"));

if (!fs.existsSync("./tmp")) {
  fs.mkdir("tmp", (err) => {
    if (err) console.log("Error on creating tmp directory!");
  });
}

function log(msg) {
  console.log(msg);
  const time = new Date().toLocaleString();
  const data = `\n\n ${time} :: ${msg}`;
  try {
    fs.appendFileSync(sysConfig.logFilePath, data);
  } catch (err) {
    console.log(err);
  }
}

module.exports = log;
