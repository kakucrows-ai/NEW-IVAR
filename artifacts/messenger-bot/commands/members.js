"use strict";

module.exports = {
  name: "members",
  aliases: ["list", "ml"],
  description: "List all members in this group chat.",
  usage: "members",
  category: "Group",
  groupOnly: true,

  async execute({ api, event }) {
    let info;
    try {
      info = await api.getThreadInfo(event.threadID);
    } catch (e) {
      return api.sendMessage("❌ Could not retrieve group info: " + e.message, event.threadID);
    }
    if (!info) return api.sendMessage("❌ Could not retrieve group info.", event.threadID);

    const adminIDs = (info.adminIDs || []).map(a => a.id || a);
    const ids      = info.participantIDs || [];

    // Batch getUserInfo in chunks of 50 to avoid API limits
    let userInfo = {};
    const CHUNK = 50;
    for (let i = 0; i < ids.length; i += CHUNK) {
      try {
        const chunk = await api.getUserInfo(ids.slice(i, i + CHUNK));
        if (chunk) Object.assign(userInfo, chunk);
      } catch {}
    }

    const lines = ids.map((id, i) => {
      const name    = userInfo[id]?.name || "User " + id;
      const isAdmin = adminIDs.includes(id) ? " 👑" : "";
      return (i + 1) + ". " + name + isAdmin;
    });

    const header =
      "👥 Group: " + (info.name || "Unnamed") + "\n" +
      "📊 Members: " + ids.length + "\n" +
      "─────────────────";

    const MAX = 3800;
    const fullMsg = header + "\n" + lines.join("\n");

    if (fullMsg.length <= MAX) {
      return api.sendMessage(fullMsg, event.threadID);
    }

    // Chunk into multiple messages
    const chunks = [];
    let buf = header;
    for (const line of lines) {
      if ((buf + "\n" + line).length > MAX) {
        chunks.push(buf);
        buf = line;
      } else {
        buf += "\n" + line;
      }
    }
    if (buf) chunks.push(buf);

    for (let i = 0; i < chunks.length; i++) {
      await api.sendMessage("[" + (i + 1) + "/" + chunks.length + "]\n" + chunks[i], event.threadID)
        .catch(() => {});
      if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 500));
    }
  },
};
