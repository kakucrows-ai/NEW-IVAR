"use strict";

/**
 * restart.js — Safe Restart Command
 *
 * Uses restartManager.safeRestart() which executes the full
 * PRE-RESTART lifecycle:
 *   freeze → save → snapshot → grace period → process.exit(0)
 *
 * The process manager (node --watch in dev, Railway/PM2 in prod)
 * restarts the process automatically after exit.
 */

const restartManager = require("../utils/restartManager");

module.exports = {
  name: "restart",
  aliases: ["reboot", "rs"],
  description: "حفظ الكوكيز بأمان وإعادة تشغيل البوت.",
  usage: "restart",
  category: "إدارة",
  adminOnly: true,

  async execute({ api, event }) {
    await restartManager.safeRestart(
      api,
      null,   // session + snapshot resolved from registered refs
      null,
      event.threadID,
      (msg, tid) => api.sendMessage(msg, tid)
    );
  },
};
