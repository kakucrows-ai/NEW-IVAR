"use strict";

module.exports = {
  name: "profile",
  aliases: ["userinfo", "whois"],
  description: "Get information about a user by mention or ID.",
  usage: "profile [@mention | userID]",
  category: "Utility",

  async execute({ api, event, args }) {
    const mentions  = event.mentions || {};
    const mentionID = Object.keys(mentions)[0];
    const targetID  = mentionID || args[0] || event.senderID;

    if (args[0] && !/^\d+$/.test(args[0]) && !mentionID) {
      return api.sendMessage("❌ Provide a valid user ID or mention someone.", event.threadID);
    }

    try {
      let info = null;

      // Try getUserInfoV2 first (richer data), fall back to getUserInfo
      if (typeof api.getUserInfoV2 === "function") {
        try { info = await api.getUserInfoV2(targetID); } catch {}
      }
      if (!info && typeof api.getUserInfo === "function") {
        const bulk = await api.getUserInfo([targetID]);
        info = bulk ? bulk[targetID] : null;
      }

      if (!info) return api.sendMessage("❌ User not found.", event.threadID);

      const name     = info.name || "Unknown";
      const gender   = info.gender === 2 ? "Male" : info.gender === 1 ? "Female" : "N/A";
      const friends  = info.friendCount   ?? "N/A";
      const mutuals  = info.mutualFriends ?? "N/A";
      const verified = info.isVerified    ? "✅ Yes" : "❌ No";
      const isFriend = info.isFriend      ? "👥 Yes" : "No";

      const msg =
        "👤 User Profile\n" +
        "─────────────\n" +
        "• Name     : " + name    + "\n" +
        "• ID       : " + targetID + "\n" +
        "• Gender   : " + gender   + "\n" +
        "• Friends  : " + friends  + "\n" +
        "• Mutuals  : " + mutuals  + "\n" +
        "• Verified : " + verified + "\n" +
        "• Friend   : " + isFriend;

      api.sendMessage(msg, event.threadID);
    } catch (e) {
      api.sendMessage("❌ Error: " + e.message, event.threadID);
    }
  },
};
