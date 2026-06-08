"use strict";

const path    = require("path");
const config  = require("../config.json");
const logger  = require("../utils/logger");
const { SessionManager } = require("../utils/session");

const APP_STATE_PATH = path.resolve(__dirname, "..", config.appStatePath);
const GH_TOKEN       = process.env.GITHUB_TOKEN || process.env.GITHUB_PERSONAL_ACCESS_TOKEN || "";
const GH_REPO        = "marwanbou540-gif/messenger-bot";

module.exports = {
  name: "restart",
  aliases: ["reboot", "rs"],
  description: "حفظ الكوكيز بشكل آمن وإعادة تشغيل البوت.",
  usage: "restart",
  category: "إدارة",
  adminOnly: true,

  async execute({ api, event }) {
    const { threadID } = event;

    await api.sendMessage(
      "🔄 جارٍ حفظ الجلسة بأمان وإعادة التشغيل...\n⏳ سيعود البوت خلال ثوانٍ.",
      threadID
    ).catch(() => {});

    // ── Step 1: get current appstate from the live connection ─────────────
    let state;
    try {
      state = api.getAppState();
    } catch (e) {
      logger.warn("Restart", `getAppState() failed: ${e.message}`);
    }

    // ── Step 2: atomic save via SessionManager ────────────────────────────
    if (Array.isArray(state) && state.length > 0) {
      try {
        const sm = new SessionManager(APP_STATE_PATH, GH_TOKEN, GH_REPO);
        const saved = sm.save(state);
        if (saved) {
          logger.success("Restart", `Cookies saved atomically before restart ✅ (${state.length} entries)`);
        } else {
          logger.warn("Restart", "SessionManager.save() returned false — cookies may not be saved.");
        }
      } catch (e) {
        logger.error("Restart", `Atomic save threw: ${e.message}`);
      }
    } else {
      logger.warn("Restart", "AppState is empty or unavailable — skipping pre-restart save.");
    }

    // ── Step 3: exit after a short grace period ───────────────────────────
    // node --watch (dev) and process managers (PM2, Railway) will restart automatically.
    logger.info("Restart", "Exiting in 2s for automatic restart...");
    setTimeout(() => process.exit(0), 2000);
  },
};
