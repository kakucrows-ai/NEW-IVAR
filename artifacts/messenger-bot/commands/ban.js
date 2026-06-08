"use strict";
const config     = require("../config.json");
const banManager = require("../utils/banManager");

module.exports = {
  name: "ban",
  aliases: ["botban", "unban", "bans"],
  description: "حظر/رفع حظر مستخدم من استخدام البوت بالكامل.",
  usage: [
    "-ban @شخص [سبب]    — حظر مستخدم",
    "-unban @شخص        — رفع الحظر",
    "-ban check @شخص   — التحقق من حالة الحظر",
    "-bans               — قائمة المحظورين",
  ].join("\n"),
  category: "Admin",
  adminOnly: true,

  async execute({ api, event, args }) {
    const { threadID, senderID } = event;
    const botAdmins = config.bot.adminIDs || [];

    // Normalize: "unban" / "bans" called via aliases
    let sub = (args[0] || "").toLowerCase();
    const cmdName = (event.body || "").trim().split(/\s+/)[0].toLowerCase().replace(/^-+/, "");
    if (cmdName === "unban")      sub = "unban";
    else if (cmdName === "bans")  sub = "list";

    const mentions   = event.mentions || {};
    const mentionIDs = Object.keys(mentions);
    const prefix     = config.prefix;

    // ── list ──────────────────────────────────────────────────────────────────
    if (sub === "list" || sub === "bans") {
      const all = banManager.listBans();
      if (!all.length) return api.sendMessage("✅ لا يوجد أي مستخدم محظور.", threadID);
      const lines = all.slice(0, 20).map((b, i) =>
        `${i + 1}. ${b.userID}\n   📝 ${b.reason}\n   🕐 ${new Date(b.bannedAt).toLocaleDateString("ar-SA")}`
      );
      return api.sendMessage(`🚫 المحظورون (${all.length}):\n━━━━━━━━━━━\n${lines.join("\n\n")}`, threadID);
    }

    // ── check ────────────────────────────────────────────────────────────────
    if (sub === "check") {
      const uid = mentionIDs[0] || args[1];
      if (!uid) return api.sendMessage(`❌ اذكر مستخدماً.`, threadID);
      const b = banManager.getBan(uid);
      if (!b) return api.sendMessage(`✅ المستخدم ${uid} غير محظور.`, threadID);
      return api.sendMessage(
        `🚫 المستخدم ${uid} محظور\n📝 السبب: ${b.reason}\n🕐 تاريخ الحظر: ${new Date(b.bannedAt).toLocaleDateString("ar-SA")}`,
        threadID
      );
    }

    // ── unban ────────────────────────────────────────────────────────────────
    if (sub === "unban") {
      const uid = mentionIDs[0] || args[1];
      if (!uid) return api.sendMessage(`❌ اذكر مستخدماً.\nمثال: ${prefix}unban @شخص`, threadID);
      const removed = banManager.unban(uid);
      return api.sendMessage(removed ? `✅ تم رفع حظر ${uid}.` : `ℹ️ ${uid} ليس محظوراً أصلاً.`, threadID);
    }

    // ── ban (default) ────────────────────────────────────────────────────────
    const uid = mentionIDs[0] || args[0];
    if (!uid || uid === sub) {
      return api.sendMessage(`❌ اذكر مستخدماً.\nمثال: ${prefix}ban @شخص سبب الحظر`, threadID);
    }
    if (botAdmins.includes(String(uid))) {
      return api.sendMessage("⛔ لا يمكن حظر مشرف البوت.", threadID);
    }
    const reason = args.slice(mentionIDs.length || 1).join(" ").trim() || "مخالفة متكررة";
    banManager.ban(uid, { reason, bannedBy: senderID, threadID });
    return api.sendMessage(
      `🚫 تم حظر المستخدم ${uid}\n📝 السبب: ${reason}\n\nلرفع الحظر: ${prefix}unban @${uid}`,
      threadID
    );
  },
};
