"use strict";

module.exports = {
  name: "coinflip",
  aliases: ["flip", "coin"],
  description: "Flip a coin.",
  usage: "coinflip",
  category: "Fun",

  async execute({ api, event }) {
    const result = Math.random() < 0.5 ? "🪙 Heads!" : "🪙 Tails!";
    api.sendMessage(result, event.threadID);
  },
};
