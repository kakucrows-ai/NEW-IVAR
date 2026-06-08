"use strict";

const config = require("../config.json");
const { lockedNicknames } = require("../utils/nicknameLocks");

function buildNick(template, name, index, id) {
  return template
    .replace(/\{name\}/g,  name)
    .replace(/\{index\}/g, index)
    .replace(/\{id\}/g,    id);
}

function _delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

const USAGE = [
  "-nickall <كنية>              — تغيير كنيات الجميع (يمكن استخدام {name} و{index})",
  "-nickall lock <كنية>         — تغيير + قفل كنيات الجميع",
  "-nickall unlock              — فك قفل جميع الكنيات",
  "-nickall clear               — حذف جميع الكنيات وأقفالها",
  "",
  "متغيرات في الكنية:",
  "  {name}  → اسم العضو الأصلي",
  "  {index} → رقم العضو (1، 2، 3...)",
].join("\n");

module.exports = {
  name: "nickall",
  aliases: ["na", "allnick"],
  description: "تغيير كنيات جميع أعضاء المجموعة دفعةً واحدة مع إمكانية القفل.",
  usage: USAGE,
  category: "Group",
  groupOnly: true,
  adminOnly: true,

  async execute({ api, event, args }) {
    const sub      = (args[0] || "").toLowerCase();
    const threadID = event.threadID;
    const prefix   = config.prefix;

    // ── unlock ────────────────────────────────────────────────────────────
    if (sub === "unlock") {
      lockedNicknames.delete(threadID);
      return api.sendMessage("🔓 تم فك قفل جميع الكنيات في هذه المجموعة.", threadID);
    }

    // ── clear ─────────────────────────────────────────────────────────────
    if (sub === "clear") {
      lockedNicknames.delete(threadID);
      let info;
      try { info = await api.getThreadInfo(threadID); }
      catch (e) { return api.sendMessage("❌ فشل جلب معلومات المجموعة: " + e.message, threadID); }
      const ids = info.participantIDs || [];

      await api.sendMessage("⏳ جارٍ حذف كنيات " + ids.length + " عضو...", threadID);

      let done = 0, failed = 0;
      for (const uid of ids) {
        try { await api.nickname("", threadID, uid); done++; } catch { failed++; }
        await _delay(400);
      }
      return api.sendMessage("✅ تم حذف الكنيات:\n• نجح: " + done + "\n• فشل: " + failed, threadID);
    }

    // ── lock + set / set فقط ──────────────────────────────────────────────
    let doLock   = false;
    let template = "";

    if (sub === "lock") {
      doLock   = true;
      template = args.slice(1).join(" ").trim();
    } else {
      template = args.join(" ").trim();
    }

    if (!template) {
      // Use module-level USAGE constant — avoids `this` context issues
      return api.sendMessage("❌ استخدام:\n" + USAGE, threadID);
    }

    let info;
    try { info = await api.getThreadInfo(threadID); }
    catch (e) { return api.sendMessage("❌ فشل جلب معلومات المجموعة: " + e.message, threadID); }

    const ids = info.participantIDs || [];
    if (ids.length === 0) return api.sendMessage("❌ لا يوجد أعضاء في المجموعة.", threadID);

    // جلب أسماء الأعضاء بدفعات 50
    let userNames = {};
    const CHUNK = 50;
    for (let i = 0; i < ids.length; i += CHUNK) {
      try {
        const chunk = await api.getUserInfo(ids.slice(i, i + CHUNK));
        for (const [uid, u] of Object.entries(chunk || {})) {
          userNames[uid] = u.name || uid;
        }
      } catch {}
    }

    const lockMode = doLock ? " + قفل 🔒" : "";
    await api.sendMessage(
      "⏳ جارٍ تغيير كنيات " + ids.length + " عضو" + lockMode + "...\nالكنية: \"" + template + "\"",
      threadID
    );

    if (doLock && !lockedNicknames.has(threadID)) {
      lockedNicknames.set(threadID, new Map());
    }

    let done = 0, failed = 0;

    for (let i = 0; i < ids.length; i++) {
      const uid  = ids[i];
      const name = userNames[uid] || uid;
      const nick = buildNick(template, name, i + 1, uid);

      try {
        await api.nickname(nick, threadID, uid);
        if (doLock) lockedNicknames.get(threadID).set(uid, nick);
        done++;
      } catch { failed++; }

      await _delay(500);
    }

    const lockNote = doLock
      ? "\n🔒 جميع الكنيات مقفولة — تُطبَّق تلقائياً كل دقيقة."
      : "\nللقفل استخدم: " + prefix + "nickall lock <كنية>";

    api.sendMessage(
      "✅ انتهى تغيير الكنيات:\n• نجح : " + done + "\n• فشل  : " + failed + lockNote,
      threadID
    );
  },
};
