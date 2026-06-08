"use strict";

const config = require("../config.json");

module.exports = {
  name: "rename",
  aliases: ["setname", "groupname"],
  description: "تغيير اسم المجموعة.",
  usage: "rename <new name>",
  category: "إدارة",
  groupOnly: true,
  adminOnly: true,

  async execute({ api, event, args }) {
    const newName = args.join(" ").trim();
    if (!newName) {
      return api.sendMessage(`❌ Provide a new name.\nUsage: ${config.prefix}rename <new name>`, event.threadID);
    }
    try {
      await api.gcname(newName, event.threadID);
      api.sendMessage(`✅ Group renamed to: ${newName}`, event.threadID);
    } catch (e) {
      api.sendMessage(`❌ Error: ${e.message}`, event.threadID);
    }
  },
};
