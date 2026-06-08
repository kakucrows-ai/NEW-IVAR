"use strict";

const fs     = require("fs");
const engine = require("../utils/musicEngine");

module.exports = {
  name: "music",
  aliases: ["song", "اغنية", "أغنية", "mp3"],
  description: "البحث عن أغنية وإرسالها (YouTube أو iTunes كاحتياط).",
  usage: "music [اسم الأغنية أو الفنان]",
  category: "Entertainment",

  async execute({ api, event, args }) {
    const { threadID, senderID } = event;
    const query = args.join(" ").trim();

    // ── مساعد التشخيص (للمطور فقط) ─────────────────────────────────────────
    if (query === "diag") {
      const d = engine.diagnostics();
      return api.sendMessage(
        "🔧 تشخيص محرك الموسيقى:\n" +
        "• yt-dlp   : " + d.ytdlpPath + "\n" +
        "• محدَّث   : " + (d.autoUpdated ? "نعم" : "لا") + "\n" +
        "• يعمل الآن: " + d.concurrent + "\n" +
        "• ينتظر   : " + d.queued + "\n" +
        "• ملفات مؤقتة: " + d.tmpFiles,
        threadID
      );
    }

    // ── تحقق من الطلب ───────────────────────────────────────────────────────
    if (!query) {
      return api.sendMessage(
        "🎵 الاستخدام: -music [اسم الأغنية]\n" +
        "أمثلة:\n" +
        "  -music GMFU\n" +
        "  -music محمد عبده\n" +
        "  -music Blinding Lights The Weeknd",
        threadID
      );
    }

    // ── cooldown ─────────────────────────────────────────────────────────────
    const remaining = engine.userCooldown(senderID);
    if (remaining > 0) {
      return api.sendMessage("⏳ انتظر " + remaining + " ثانية قبل طلب أغنية أخرى.", threadID);
    }
    engine.markUser(senderID);

    // ── بحث ─────────────────────────────────────────────────────────────────
    await api.sendMessage("🔍 جاري البحث عن: " + query + " ...", threadID).catch(() => {});

    let track;
    try {
      track = await engine.search(query);
    } catch (e) {
      return api.sendMessage("😕 " + e.message, threadID).catch(() => {});
    }

    // ── إبلاغ المستخدم ───────────────────────────────────────────────────────
    const sourceLabel = track.provider === "itunes"
      ? "\n📦 المصدر: iTunes (معاينة 30 ثانية)"
      : "\n📦 المصدر: YouTube";
    await api.sendMessage(
      "🎵 " + track.title +
      (track.artist   ? "\n🎤 " + track.artist   : "") +
      (track.duration ? "\n⏱ "  + track.duration : "") +
      sourceLabel +
      "\n⬇️ جاري التحميل...",
      threadID
    ).catch(() => {});

    // ── تحميل ───────────────────────────────────────────────────────────────
    let audioPath;
    try {
      audioPath = await engine.download(track);
    } catch (e) {
      return api.sendMessage("❌ فشل التحميل:\n" + e.message.slice(0, 300), threadID).catch(() => {});
    }

    // ── تجميع النص النهائي بعد التحميل (قد يتغير provider إلى itunes كاحتياط) ──
    const isPreview = !!track.preview;
    const caption =
      "🎵 " + track.title +
      (track.artist   ? "\n🎤 "  + track.artist   : "") +
      (track.duration ? "\n⏱  "  + track.duration : "") +
      (isPreview      ? "\n⚠️ معاينة 30 ثانية (iTunes)" : "");

    // ── إرسال ────────────────────────────────────────────────────────────────
    try {
      await Promise.race([
        api.sendMessage({ body: caption, attachment: fs.createReadStream(audioPath) }, threadID),
        new Promise((_, rej) => setTimeout(() => rej(new Error("send_timeout")), 90_000)),
      ]);
    } catch (e) {
      const msg = e.message === "send_timeout"
        ? "❌ انتهت مهلة الإرسال. جرّب أغنية أقصر."
        : "❌ تعذّر إرسال الملف:\n" + e.message.slice(0, 200);
      await api.sendMessage(msg, threadID).catch(() => {});
    } finally {
      engine.safeDelete(audioPath);
    }
  },
};
