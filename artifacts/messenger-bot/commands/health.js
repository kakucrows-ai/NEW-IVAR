"use strict";
const os         = require("os");
const diagnostics = require("../utils/diagnostics");
const health     = require("../utils/health");
const cookieRefresher = require("../utils/cookieRefresher");

module.exports = {
  name: "health",
  aliases: ["status", "healthcheck"],
  description: "Show bot MQTT connection, memory, and system health.",
  usage: "health [errors|snap]",
  category: "Info",

  async execute({ api, event, args }) {
    const { threadID } = event;
    const sub = (args[0] || "").toLowerCase();

    // ── errors sub-command ───────────────────────────────────────────────────
    if (sub === "errors") {
      const top = diagnostics.topErrors(8);
      if (!top.length) return api.sendMessage("✅ لا توجد أخطاء مُسجَّلة.", threadID);
      const lines = top.map((e, i) =>
        `${i + 1}. [${e.tag}] ${e.message.slice(0, 60)} (×${e.count})`
      );
      return api.sendMessage(`🔴 أكثر الأخطاء تكراراً:\n━━━━━━━━━━━\n${lines.join("\n")}`, threadID);
    }

    // ── snap sub-command ─────────────────────────────────────────────────────
    if (sub === "snap") {
      await diagnostics.createSnapshot("manual_command");
      return api.sendMessage("📸 تم إنشاء لقطة تشخيص وحفظها في data/snapshots.", threadID);
    }

    // ── main health report ────────────────────────────────────────────────────
    const mem       = process.memoryUsage();
    const heapMB    = (mem.heapUsed  / 1048576).toFixed(1);
    const rssMB     = (mem.rss       / 1048576).toFixed(1);
    const heapTotMB = (mem.heapTotal / 1048576).toFixed(1);
    const freeMB    = (os.freemem()  / 1048576).toFixed(0);
    const totMB     = (os.totalmem() / 1048576).toFixed(0);
    const load      = os.loadavg().map(l => l.toFixed(2)).join(" / ");

    const uptimeSec = Math.floor(process.uptime());
    const h = Math.floor(uptimeSec / 3600);
    const m = Math.floor((uptimeSec % 3600) / 60);
    const s = uptimeSec % 60;
    const uptime = `${h}h ${m}m ${s}s`;

    // Health module state
    const hStatus  = health.getStatus ? health.getStatus() : {};
    const mqttOk   = hStatus.mqttOk   !== false ? "🟢 متصل"   : "🔴 منقطع";
    const loginOk  = hStatus.loginOk  !== false ? "🟢 نشط"    : "🔴 تعذّر";

    // Diagnostics counters
    const topErr = diagnostics.topErrors(1);
    const errCount = topErr.reduce((sum, e) => sum + e.count, 0);

    // Cookie refresher
    const cr = cookieRefresher.status();
    const crLine = cr.active
      ? `🟢 نشط | دفعات: ${cr.pushCount} | أخطاء: ${cr.errorCount}`
      : "🔴 متوقف";

    // Current bot ID
    let botID = "N/A";
    try { botID = api.getCurrentUserID(); } catch {}

    const msg =
      `╔══ 💊 حالة البوت ══╗\n` +
      `║ MQTT     : ${mqttOk}\n` +
      `║ تسجيل   : ${loginOk}\n` +
      `║ Uptime  : ${uptime}\n` +
      `║ Bot ID  : ${botID}\n` +
      `╠══ 🖥️ النظام ══╣\n` +
      `║ RAM     : ${rssMB} MB (heap ${heapMB}/${heapTotMB} MB)\n` +
      `║ حر      : ${freeMB}/${totMB} MB\n` +
      `║ Load    : ${load}\n` +
      `╠══ 🍪 الكوكيز ══╣\n` +
      `║ ${crLine}\n` +
      `╠══ ⚠️ الأخطاء ══╣\n` +
      `║ إجمالي  : ${errCount}\n` +
      `║ تفاصيل : -health errors\n` +
      `╚═══════════════════════╝`;

    api.sendMessage(msg, threadID);
  },
};
