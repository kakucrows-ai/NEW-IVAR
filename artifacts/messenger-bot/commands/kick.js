"use strict";

const config = require("../config.json");

module.exports = {
  name: "kick",
  aliases: ["remove", "rm"],
  description: "Remove a member from the group. (Admin only)",
  usage: "kick @mention [reason]",
  category: "Group",
  groupOnly: true,
  adminOnly: true,

  async execute({ api, event, args }) {
    const mentions   = event.mentions || {};
    const mentionIDs = Object.keys(mentions);

    if (mentionIDs.length === 0) {
      return api.sendMessage(
        "❌ Please mention who to kick.\nUsage: " + config.prefix + "kick @user [reason]",
        event.threadID
      );
    }

    const botID    = api.getCurrentUserID();
    const targetID = mentionIDs[0];

    if (targetID === botID) {
      return api.sendMessage("❌ I can't kick myself.", event.threadID);
    }

    // Check if target is a group admin — guarded so a failed getThreadInfo
    // doesn't prevent the kick attempt entirely.
    let adminIDs = [];
    try {
      const threadInfo = await api.getThreadInfo(event.threadID);
      adminIDs = (threadInfo.adminIDs || []).map(a => a.id || a);
    } catch {
      // Cannot determine admin status — proceed anyway (best-effort)
    }

    if (adminIDs.includes(targetID)) {
      return api.sendMessage("❌ Cannot kick a group admin.", event.threadID);
    }

    const reason = args.slice(mentionIDs.length).join(" ") || "No reason provided.";

    try {
      const result = await api.gcmember("remove", targetID, event.threadID);
      if (result && result.type === "error_gc") {
        return api.sendMessage("❌ Failed: " + result.error, event.threadID);
      }
      const name = Object.values(mentions)[0]?.replace(/@/, "") || targetID;
      api.sendMessage("✅ " + name + " has been removed.\n📝 Reason: " + reason, event.threadID);
    } catch (e) {
      api.sendMessage("❌ Error: " + e.message, event.threadID);
    }
  },
};
