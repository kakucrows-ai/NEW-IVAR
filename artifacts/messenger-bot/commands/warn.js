"use strict";
const config      = require("../config.json");
const warnManager = require("../utils/warnManager");

const MAX_WARNS = 3;  // auto-kick threshold

module.exports = {
  name: "warn",
  aliases: ["w", "تحذير"],
  description: "إصدار تحذير لعضو. عند بلوغ الحد الأقصى يُطرد تلقائياً.",
  usage: [
    "-warn @شخص [سبب]      — إصدار تحذير",
    "-warn check @شخص      — عرض تحذيرات عضو",
    "-warn clear @شخص      — مسح تحذيرات عضو",
    "-warn clearall         — مسح جميع تحذيرات المجموعة",
    "-warn list             — قائمة جميع التحذيرات",
  ].join("\n"),
  category: "Admin",
  groupOnly: true,
  adminOnly: true,

  async execute({ api, event, args }) {
    const { threadID, senderID } = event;
    const sub        = (args[0] || "").toLowerCase();
    const mentions   = event.mentions || {};
    const mentionIDs = Object.keys(mentions);
    const prefix     = config.prefix;

    // ── check ────────────────────────────────────────────────────────────────
    if (sub === "check") {
      if (!mentionIDs.length) return api.sendMessage(`❌ اذكر عضواً.\nمثال: ${prefix}warn check @شخص`, threadID);
      const uid = mentionIDs[0];
      const w   = warnManager.getWarns(threadID, uid);
      const name = (Object.values(mentions)[0] || "").replace(/@/, "") || uid;
      if (w.count === 0) return api.sendMessage(`✅ لا توجد تحذيرات لـ ${name}.`, threadID);
      const lines = w.reasons.slice(-5).map((r, i) => `${i + 1}. ${r.reason} (${new Date(r.at).toLocaleDateString("ar-SA")})`);
      return api.sendMessage(
        `⚠️ تحذيرات ${name}: ${w.count}/${MAX_WARNS}\n━━━━━━━━━━━\n${lines.join("\n")}`,
        threadID
      );
    }

    // ── clear ────────────────────────────────────────────────────────────────
    if (sub === "clear") {
      if (!mentionIDs.length) return api.sendMessage(`❌ اذكر عضواً.\nمثال: ${prefix}warn clear @شخص`, threadID);
      const uid  = mentionIDs[0];
      const name = (Object.values(mentions)[0] || "").replace(/@/, "") || uid;
      warnManager.clearWarns(threadID, uid);
      return api.sendMessage(`✅ تم مسح تحذيرات ${name}.`, threadID);
    }

    // ── clearall ──────────────────────────────────────────────────────────────
    if (sub === "clearall") {
      warnManager.clearWarns(threadID, null);
      return api.sendMessage("✅ تم مسح جميع التحذيرات في هذه المجموعة.", threadID);
    }

    // ── list ──────────────────────────────────────────────────────────────────
    if (sub === "list") {
      const all = warnManager.listWarns(threadID);
      if (!all.length) return api.sendMessage("✅ لا توجد تحذيرات في هذه المجموعة.", threadID);
      const lines = all
        .sort((a, b) => b.count - a.count)
        .map(w => `• ${w.userID}: ${w.count}/${MAX_WARNS} تحذير`);
      return api.sendMessage(`⚠️ التحذيرات النشطة (${all.length}):\n━━━━━━━━━━━\n${lines.join("\n")}`, threadID);
    }

    // ── issue warn (default) ──────────────────────────────────────────────────
    if (!mentionIDs.length) {
      return api.sendMessage(`❌ اذكر عضواً.\nمثال: ${prefix}warn @شخص سبب التحذير`, threadID);
    }

    const uid    = mentionIDs[0];
    const name   = (Object.values(mentions)[0] || "").replace(/@/, "") || uid;
    const reason = args.slice(1).filter(a => !Object.values(mentions).includes(a)).join(" ").trim()
      || "مخالفة قوانين المجموعة";

    // Don't warn bot admins
    const botAdmins = config.bot.adminIDs || [];
    if (botAdmins.includes(String(uid))) {
      return api.sendMessage("⛔ لا يمكن تحذير مشرف البوت.", threadID);
    }

    const w = warnManager.addWarn(threadID, uid, reason);

    if (w.count >= MAX_WARNS) {
      // Auto-kick
      try {
        await api.gcmember("remove", uid, threadID);
        warnManager.clearWarns(threadID, uid);
        return api.sendMessage(
          `🚫 تم طرد ${name} تلقائياً بعد ${MAX_WARNS} تحذيرات.\n` +
          `📝 السبب الأخير: ${reason}`,
          threadID
        );
      } catch (e) {
        return api.sendMessage(
          `⚠️ ${name} بلغ الحد الأقصى (${MAX_WARNS}/${MAX_WARNS}) لكن الطرد فشل:\n${e.message}\n` +
          `يُرجى طرده يدوياً.`,
          threadID
        );
      }
    }

    const remaining = MAX_WARNS - w.count;
    api.sendMessage(
      `⚠️ تحذير لـ ${name}\n` +
      `📝 السبب: ${reason}\n` +
      `⚡ التحذيرات: ${w.count}/${MAX_WARNS}` +
      (remaining === 1 ? "\n🚨 تحذير واحد متبقٍ قبل الطرد!" : ""),
      threadID
    );
  },
};
