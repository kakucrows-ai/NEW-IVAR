"use strict";

const config = require("../config.json");
const { lockedNicknames } = require("../utils/nicknameLocks");

module.exports = {
  name: "nickname",
  aliases: ["nick", "nn"],
  description: "تعيين، حذف، قفل أو فك قفل كنية عضو واحد.",
  usage: [
    "-nickname set @شخص <كنية>   — تعيين كنية",
    "-nickname clear @شخص       — حذف الكنية",
    "-nickname lock @شخص <كنية> — قفل الكنية (تُطبَّق تلقائياً)",
    "-nickname unlock @شخص      — فك قفل الكنية",
    "-nickname locks             — عرض الكنيات المقفولة",
    "-nickname clearall          — حذف كل الكنيات وأقفالها",
  ].join("\n"),
  category: "Group",
  groupOnly: true,
  adminOnly: true,

  async execute({ api, event, args }) {
    

    const sub        = (args[0] || "").toLowerCase();
    const mentions   = event.mentions || {};
    const mentionIDs = Object.keys(mentions);
    const threadID   = event.threadID;
    const prefix     = config.prefix;

    // ── locks ─────────────────────────────────────────────────────────────
    if (sub === "locks") {
      const threadLocks = lockedNicknames.get(threadID);
      if (!threadLocks || threadLocks.size === 0)
        return api.sendMessage("🔓 لا توجد كنيات مقفولة في هذه المجموعة.", threadID);
      const lines = [...threadLocks.entries()].map(([uid, nn]) => `• ${uid} ← "${nn}"`);
      return api.sendMessage(`🔒 الكنيات المقفولة (${threadLocks.size}):\n${lines.join("\n")}`, threadID);
    }

    // ── clearall ──────────────────────────────────────────────────────────
    if (sub === "clearall") {
      const info = await api.getThreadInfo(threadID);
      let count = 0;
      for (const uid of (info.participantIDs || [])) {
        try { await api.nickname("", threadID, uid); count++; } catch {}
      }
      lockedNicknames.delete(threadID);
      return api.sendMessage(`✅ تم حذف كنيات ${count} عضو وإزالة جميع الأقفال.`, threadID);
    }

    // ── أوامر تحتاج mention ────────────────────────────────────────────────
    if (!["set", "clear", "lock", "unlock"].includes(sub)) {
      return api.sendMessage(`❌ استخدام:\n${this.usage}`, threadID);
    }

    if (mentionIDs.length === 0) {
      return api.sendMessage(
        `❌ يجب ذكر شخص.\nمثال: ${prefix}nickname ${sub} @شخص${sub !== "clear" && sub !== "unlock" ? " <الكنية>" : ""}`,
        threadID
      );
    }

    const targetID   = mentionIDs[0];
    const targetName = (Object.values(mentions)[0] || "").replace(/@/, "") || targetID;

    // ── set ───────────────────────────────────────────────────────────────
    if (sub === "set") {
      const nick = args.slice(2).join(" ").trim();
      if (!nick) return api.sendMessage(`❌ مثال: ${prefix}nickname set @شخص كنيتي`, threadID);
      try {
        await api.nickname(nick, threadID, targetID);
        api.sendMessage(`✅ تم تعيين كنية "${targetName}" إلى: ${nick}`, threadID);
      } catch (e) { api.sendMessage(`❌ فشل: ${e.message}`, threadID); }
    }

    // ── clear ─────────────────────────────────────────────────────────────
    else if (sub === "clear") {
      lockedNicknames.get(threadID)?.delete(targetID);
      try {
        await api.nickname("", threadID, targetID);
        api.sendMessage(`✅ تم حذف كنية ${targetName}.`, threadID);
      } catch (e) { api.sendMessage(`❌ فشل: ${e.message}`, threadID); }
    }

    // ── lock ──────────────────────────────────────────────────────────────
    else if (sub === "lock") {
      const nick = args.slice(2).join(" ").trim();
      if (!nick) return api.sendMessage(`❌ مثال: ${prefix}nickname lock @شخص كنيتي`, threadID);
      if (!lockedNicknames.has(threadID)) lockedNicknames.set(threadID, new Map());
      lockedNicknames.get(threadID).set(targetID, nick);
      try {
        await api.nickname(nick, threadID, targetID);
        api.sendMessage(`🔒 تم قفل كنية ${targetName} على: "${nick}"\nتُطبَّق تلقائياً كل دقيقة.`, threadID);
      } catch (e) { api.sendMessage(`❌ فشل: ${e.message}`, threadID); }
    }

    // ── unlock ────────────────────────────────────────────────────────────
    else if (sub === "unlock") {
      const threadLocks = lockedNicknames.get(threadID);
      if (!threadLocks || !threadLocks.has(targetID))
        return api.sendMessage(`❌ كنية ${targetName} ليست مقفولة.`, threadID);
      threadLocks.delete(targetID);
      if (threadLocks.size === 0) lockedNicknames.delete(threadID);
      api.sendMessage(`🔓 تم فك قفل كنية ${targetName}.`, threadID);
    }
  },
};
