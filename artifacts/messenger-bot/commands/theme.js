"use strict";

const config = require("../config.json");

module.exports = {
  name: "theme",
  aliases: ["settheme"],
  description: "Set the group chat theme. Use 'list' to see themes, or 'ai <prompt>' for AI theme. (Admin only)",
  usage: "theme <list | ai <prompt> | <themeID>>",
  category: "Group",
  groupOnly: true,
  adminOnly: true,

  async execute({ api, event, args }) {
    const sub = (args[0] || "").toLowerCase();

    // ── list ──────────────────────────────────────────────────────────────
    if (sub === "list") {
      if (typeof api.getTheme !== "function") {
        return api.sendMessage("❌ Theme listing is not supported by the current API version.", event.threadID);
      }
      try {
        const themes = await api.getTheme(event.threadID);
        if (!themes || themes.length === 0) {
          return api.sendMessage("❌ No themes available.", event.threadID);
        }
        const lines = themes.slice(0, 20).map((t, i) =>
          (i + 1) + ". ID: " + t.id + " — " + (t.name || "Unnamed")
        );
        return api.sendMessage(
          "🎨 Available Themes (top 20):\n" + lines.join("\n") +
          "\n\nUse: " + config.prefix + "theme <ID>",
          event.threadID
        );
      } catch (e) {
        return api.sendMessage("❌ Error fetching themes: " + e.message, event.threadID);
      }
    }

    // ── ai ────────────────────────────────────────────────────────────────
    if (sub === "ai") {
      const prompt = args.slice(1).join(" ");
      if (!prompt) {
        return api.sendMessage(
          "❌ Provide an AI prompt.\nUsage: " + config.prefix + "theme ai vibrant ocean sunset",
          event.threadID
        );
      }
      if (typeof api.createAITheme !== "function") {
        return api.sendMessage("❌ AI themes are not supported by the current API version.", event.threadID);
      }
      try {
        const aiThemes = await api.createAITheme(prompt);
        if (!aiThemes || aiThemes.length === 0) {
          return api.sendMessage("❌ Could not generate AI theme.", event.threadID);
        }
        if (typeof api.setThreadThemeMqtt === "function") {
          await api.setThreadThemeMqtt(event.threadID, aiThemes[0].id);
        } else if (typeof api.changeThreadColor === "function") {
          await api.changeThreadColor(aiThemes[0].id, event.threadID);
        }
        return api.sendMessage("✅ AI theme applied for: \"" + prompt + "\"", event.threadID);
      } catch (e) {
        return api.sendMessage("❌ Error applying AI theme: " + e.message, event.threadID);
      }
    }

    // ── apply by ID ───────────────────────────────────────────────────────
    const themeID = args[0];
    if (!themeID) {
      return api.sendMessage(
        "❌ Usage: " + config.prefix + "theme <list | ai <prompt> | <themeID>>",
        event.threadID
      );
    }

    try {
      if (typeof api.setThreadThemeMqtt === "function") {
        await api.setThreadThemeMqtt(event.threadID, themeID);
      } else if (typeof api.changeThreadColor === "function") {
        await api.changeThreadColor(themeID, event.threadID);
      } else {
        return api.sendMessage("❌ Theme setting is not supported by the current API version.", event.threadID);
      }
      api.sendMessage("✅ Theme " + themeID + " applied!", event.threadID);
    } catch (e) {
      api.sendMessage("❌ Error: " + e.message, event.threadID);
    }
  },
};
