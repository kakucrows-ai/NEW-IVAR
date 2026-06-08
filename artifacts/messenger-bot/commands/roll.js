"use strict";

module.exports = {
  name: "roll",
  aliases: ["dice", "d"],
  description: "Roll a dice. Optionally specify sides (default 6).",
  usage: "roll [sides]",
  category: "Fun",

  async execute({ api, event, args }) {
    const sides = Math.max(2, parseInt(args[0]) || 6);
    const result = Math.floor(Math.random() * sides) + 1;
    api.sendMessage(`🎲 Rolled a ${sides}-sided dice: **${result}**`, event.threadID);
  },
};
