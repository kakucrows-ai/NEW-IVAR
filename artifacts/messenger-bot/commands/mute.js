"use strict";

const config = require("../config.json");

module.exports = {
  name: "mute",
  aliases: ["unmute"],
  description: "كتم أو تفعيل البوت في هذه المجموعة لفترة محددة. (مشرف فقط)",
  usage: [
    "-mute [دقائق]     — كتم البوت (افتراضي: 60 دقيقة)",
    "-mute 0           — تفعيل البوت فوراً",
    "-unmute           — تفعيل البوت",
  ].join("\n"),
  category: "Group",
  adminOnly: true,

  async execute({ api, event, args, mutedThreads }) {
    const { threadID } = event;
    const sub = (args[0] || "").toLowerCase();

    // ── unmute ────────────────────────────────────────────────────────────────
    const cmdName = (event.body || "").trim().split(/\s+/)[0]
      .toLowerCase().replace(/^-+/, "");
    if (sub === "unmute" || sub === "0" || cmdName === "unmute") {
      mutedThreads.delete(threadID);
      return api.sendMessage("🔊 تم تفعيل البوت في هذه المجموعة.", threadID);
    }

    // ── mute ──────────────────────────────────────────────────────────────────
    const minutes = parseInt(args[0]);
    const duration = (!isNaN(minutes) && minutes > 0) ? minutes : 60;

    if (duration > 1440) {
      return api.sendMessage("❌ الحد الأقصى للكتم 1440 دقيقة (24 ساعة).", threadID);
    }

    const until = Date.now() + duration * 60 * 1000;
    mutedThreads.set(threadID, until);

    const h = Math.floor(duration / 60);
    const m = duration % 60;
    const label = h > 0
      ? `${h} ساعة${m > 0 ? " و" + m + " دقيقة" : ""}`
      : `${m} دقيقة`;

    api.sendMessage(
      `🔇 البوت صامت لمدة ${label}.\n` +
      `لإلغاء الكتم: ${config.prefix}unmute`,
      threadID
    );
  },
};
