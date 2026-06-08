"use strict";

const config = require("../config.json");

module.exports = {
  name: "add",
  aliases: ["invite"],
  description: "Add a user to the group by their Facebook ID. (Admin only)",
  usage: "add <userID>",
  category: "Group",
  groupOnly: true,
  adminOnly: true,

  async execute({ api, event, args }) {
    if (!args[0]) {
      return api.sendMessage(`❌ Provide a user ID.\nUsage: ${config.prefix}add <userID>`, event.threadID);
    }

    const targetID = args[0].trim();
    if (!/^\d+$/.test(targetID)) {
      return api.sendMessage("❌ Invalid user ID. Must be numeric.", event.threadID);
    }

    try {
      const result = await api.gcmember("add", targetID, event.threadID);
      if (result.type === "error_gc") {
        return api.sendMessage(`❌ Failed: ${result.error}`, event.threadID);
      }
      const info = await api.getUserInfo([targetID]);
      const name = info[targetID]?.name || targetID;
      api.sendMessage(`✅ ${name} has been added to the group!`, event.threadID);
    } catch (e) {
      api.sendMessage(`❌ Error: ${e.message}`, event.threadID);
    }
  },
};
