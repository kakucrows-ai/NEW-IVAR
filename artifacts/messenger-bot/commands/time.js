"use strict";

module.exports = {
  name: "time",
  aliases: ["date", "clock"],
  description: "Show the current date and time.",
  usage: "time",
  category: "Utility",

  async execute({ api, event }) {
    const now = new Date();
    const options = {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      timeZoneName: "short",
    };
    const formatted = now.toLocaleString("en-US", options);
    api.sendMessage(`🕒 Current Time\n${formatted}`, event.threadID);
  },
};
