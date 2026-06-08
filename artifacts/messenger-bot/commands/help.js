"use strict";

const config = require("../config.json");

const CATEGORY_NAMES = {
  "إدارة":    "👑 الإدارة",
  "الملاك":   "🪽 الملاك",
  "عام":      "🔮 عام",
};

const DIVIDER  = "═══════════════════";
const LINE     = "─────────────────";

module.exports = {
  name: "help",
  aliases: ["h", "مساعدة", "اوامر"],
  description: "عرض قائمة الأوامر أو تفاصيل أمر معين.",
  usage: "help [اسم الأمر]",
  category: "عام",

  async execute({ api, event, args, commands }) {
    const prefix = config.prefix;
    const botName = config.bot.name;

    if (args[0]) {
      const query = args[0].replace(/^\++/, "");
      const cmd   = commands.get(query.toLowerCase()) ||
        [...new Set(commands.values())].find(c =>
          c.aliases?.map(a => a.toLowerCase()).includes(query.toLowerCase())
        );

      if (!cmd) {
        return api.sendMessage(
          `╔${DIVIDER}\n` +
          `║  ❌  الأمر غير موجود\n` +
          `╚${DIVIDER}\n` +
          `لا يوجد أمر باسم « ${query} »\n` +
          `اكتب ${prefix}help لعرض جميع الأوامر.`,
          event.threadID
        );
      }

      const lines = [
        `╔${DIVIDER}`,
        `║  📖  ${prefix}${cmd.name}`,
        `╠${DIVIDER}`,
        `║  📝  ${cmd.description || "—"}`,
        `║  📌  الاستخدام : ${prefix}${cmd.usage || cmd.name}`,
      ];
      if (cmd.aliases?.length) {
        lines.push(`║  🔁  الاختصارات : ${cmd.aliases.map(a => prefix + a).join("  ")}`);
      }
      if (cmd.adminOnly) lines.push(`║  🔒  يتطلب صلاحية مشرف`);
      if (cmd.groupOnly) lines.push(`║  👥  للمجموعات فقط`);
      lines.push(`╚${DIVIDER}`);
      return api.sendMessage(lines.join("\n"), event.threadID);
    }

    const unique = [...new Set(commands.values())];
    const categories = {};
    for (const cmd of unique) {
      const cat = cmd.category || "عام";
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(cmd);
    }

    const ORDER = ["إدارة", "الملاك", "عام"];
    const sorted = [
      ...ORDER.filter(c => categories[c]),
      ...Object.keys(categories).filter(c => !ORDER.includes(c)),
    ];

    let msg = "";
    msg += `✦ ════ 𝒊𝒗𝒂𝒓 ═══ ✦\n`;
    msg += `   نظام الأوامر الملكي\n`;
    msg += `✦ ${LINE} ✦\n\n`;

    for (const cat of sorted) {
      const label = CATEGORY_NAMES[cat] || `✧ ${cat}`;
      msg += `${label}\n`;
      msg += `┄┄┄┄┄┄┄┄┄┄┄┄┄\n`;
      for (const cmd of categories[cat]) {
        const badge = cmd.adminOnly ? " 🔒" : cmd.groupOnly ? " 👥" : "";
        msg += `  ◈  ${prefix}${cmd.name}${badge}\n`;
        if (cmd.description) {
          msg += `      ↳ ${cmd.description}\n`;
        }
      }
      msg += `\n`;
    }

    msg += `✦ ${LINE} ✦\n`;
    msg += `📜 إجمالي الأوامر : ${unique.length}\n`;
    msg += `✍️  ${prefix}help <أمر> لتفاصيل أي أمر`;

    api.sendMessage(msg, event.threadID);
  },
};
