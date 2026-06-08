"use strict";

const config = require("../config.json");

module.exports = {
  name: "emoji",
  aliases: ["setemoji", "ge"],
  description: "Change the group's emoji. (Admin only)",
  usage: "emoji <emoji>",
  category: "Group",
  groupOnly: true,
  adminOnly: true,

  async execute({ api, event, args }) {
    const emj = args[0];
    if (!emj) {
      return api.sendMessage("❌ Provide an emoji.\nUsage: " + config.prefix + "emoji 🔥", event.threadID);
    }

    if (typeof api.changeThreadEmoji !== "function") {
      return api.sendMessage("❌ Emoji setting is not supported by the current API version.", event.threadID);
    }

    try {
      await api.changeThreadEmoji(emj, event.threadID);
      api.sendMessage("✅ Group emoji changed to " + emj, event.threadID);
    } catch (e) {
      api.sendMessage("❌ Error: " + e.message, event.threadID);
    }
  },
};
