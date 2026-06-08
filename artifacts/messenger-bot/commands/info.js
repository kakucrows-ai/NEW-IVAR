"use strict";

const os = require("os");
const config = require("../config.json");

module.exports = {
  name: "info",
  aliases: ["about", "botinfo"],
  description: "Show detailed information about the bot.",
  usage: "info",
  category: "General",

  async execute({ api, event }) {
    const uptimeSeconds = Math.floor(process.uptime());
    const h = Math.floor(uptimeSeconds / 3600);
    const m = Math.floor((uptimeSeconds % 3600) / 60);
    const s = uptimeSeconds % 60;
    const uptime = `${h}h ${m}m ${s}s`;

    const mem = process.memoryUsage();
    const memMB = (mem.rss / 1024 / 1024).toFixed(1);

    const botID = api.getCurrentUserID();

    const msg =
      `╔══ 🤖 Bot Information ══╗\n` +
      `║ Name     : ${config.bot.name}\n` +
      `║ Version  : ${config.bot.version}\n` +
      `║ Bot ID   : ${botID}\n` +
      `║ Prefix   : ${config.prefix}\n` +
      `╠══ 🖥️ Server Info ══╣\n` +
      `║ Platform : ${os.platform()} (${os.arch()})\n` +
      `║ Node.js  : ${process.version}\n` +
      `║ Uptime   : ${uptime}\n` +
      `║ Memory   : ${memMB} MB\n` +
      `║ CPU      : ${os.cpus()[0].model.trim()}\n` +
      `║ Cores    : ${os.cpus().length}\n` +
      `╚════════════════════════╝`;

    api.sendMessage(msg, event.threadID);
  },
};
