"use strict";

const config = require("../config.json");

module.exports = {
  name: "admin",
  aliases: ["promote", "demote"],
  description: "Promote or demote a group member. (Admin only)",
  usage: "admin <promote|demote> @mention",
  category: "Group",
  groupOnly: true,
  adminOnly: true,

  async execute({ api, event, args }) {
    const action     = (args[0] || "").toLowerCase();
    const mentions   = event.mentions || {};
    const mentionIDs = Object.keys(mentions);

    if (!["promote", "demote"].includes(action) || mentionIDs.length === 0) {
      return api.sendMessage(
        "❌ Usage: " + config.prefix + "admin <promote|demote> @user",
        event.threadID
      );
    }

    const targetID = mentionIDs[0];
    const name     = Object.values(mentions)[0]?.replace(/@/, "") || targetID;
    const verb     = action === "promote" ? "promoted to admin 👑" : "demoted from admin";

    try {
      if (typeof api.gcrule === "function") {
        // nkxfca primary method
        const gcAction = action === "promote" ? "admin" : "unadmin";
        const result   = await api.gcrule(gcAction, targetID, event.threadID);
        if (result && result.type === "error_gc_rule") {
          return api.sendMessage("❌ Failed: " + result.error, event.threadID);
        }
      } else if (typeof api.changeAdminStatus === "function") {
        // Alternative method in some forks
        await api.changeAdminStatus(event.threadID, [targetID], action === "promote");
      } else {
        return api.sendMessage("❌ Admin control is not supported by the current API version.", event.threadID);
      }
      api.sendMessage("✅ " + name + " has been " + verb + ".", event.threadID);
    } catch (e) {
      api.sendMessage("❌ Error: " + e.message, event.threadID);
    }
  },
};
