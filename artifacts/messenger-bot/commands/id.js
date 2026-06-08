"use strict";

module.exports = {
  name: "id",
  aliases: ["uid", "tid"],
  description: "Get the ID of the current thread and sender, or mentioned users.",
  usage: "id [@mention]",
  category: "Utility",

  async execute({ api, event }) {
    const mentions = event.mentions || {};
    const mentionIDs = Object.keys(mentions);

    if (mentionIDs.length > 0) {
      const lines = mentionIDs.map(id => `• ${mentions[id].replace(/@/, "")}: ${id}`);
      return api.sendMessage(`🆔 Mentioned User IDs:\n${lines.join("\n")}`, event.threadID);
    }

    api.sendMessage(
      `🆔 IDs\n` +
      `• Your ID  : ${event.senderID}\n` +
      `• Thread ID: ${event.threadID}`,
      event.threadID
    );
  },
};
