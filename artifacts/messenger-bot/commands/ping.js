"use strict";

module.exports = {
  name: "ping",
  aliases: ["pong"],
  description: "Check if the bot is alive and measure response latency.",
  usage: "ping",
  category: "General",

  async execute({ api, event }) {
    // Measure actual latency from when the user sent the message
    const latency = event.timestamp ? Date.now() - event.timestamp : null;
    const latencyText = latency !== null ? `${latency}ms` : "N/A";
    api.sendMessage(`🏓 Pong! Latency: ${latencyText}`, event.threadID);
  },
};
