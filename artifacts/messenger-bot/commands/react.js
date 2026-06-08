"use strict";

const EMOJIS = ["😍", "😆", "😮", "😢", "😠", "👍"];

module.exports = {
  name: "react",
  aliases: ["reaction"],
  description: "React to the last message with an emoji. Available: 😍 😆 😮 😢 😠 👍",
  usage: "react <😍|😆|😮|😢|😠|👍>",
  category: "Fun",

  async execute({ api, event, args }) {
    const emoji = args[0];
    if (!emoji || !EMOJIS.includes(emoji)) {
      return api.sendMessage(
        "❌ Choose a valid emoji: " + EMOJIS.join(" ") + "\nUsage: -react 👍",
        event.threadID
      );
    }

    // nkxfca exposes messageID; some forks use messageId or mid
    const msgID = event.messageID || event.messageId || event.mid;
    if (!msgID) {
      return api.sendMessage("❌ Could not determine message ID to react to.", event.threadID);
    }

    try {
      await api.setMessageReaction(emoji, msgID);
    } catch (e) {
      api.sendMessage("❌ Could not react: " + e.message, event.threadID);
    }
  },
};
