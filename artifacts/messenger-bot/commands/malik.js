"use strict";

if (!global.malakIntervals) global.malakIntervals = {};

const kingMessage = `𐎅𐏍🔴-ⵣ-👹𒉺-𖢣-𝙆-𐎅𐏍🔴-ⵣ-👹𒉺-𝙆-𐎅𐏍🔴-ⵣ-👹𒉺-𖢣-𝘼-𐎅𐏍🔴-ⵣ-👹𒉺-𖢣-𝙎-𐎅𐏍🔴-ⵣ-👹𒉺-𖢣-𝙊-𐎅𐏍🔴-ⵣ-👹𒉺-𖢣-𝙈-𐎅𐏍🔴-ⵣ-👹𒉺-𖢣-𝙊-𐎅𐏍🔴-ⵣ-👹𒉺𖢣-𝙆-𐎅𐏍🔴-ⵣ-👹𒉺-𖢣-𝙐-𐎅𐏍🔴-ⵣ-👹𒉺-𖢣-𝙍-𐎅𐏍🔴-ⵣ-👹𒉺-𖢣-𝘼-𐎅𐏍🔴-ⵣ-👹𒉺-𖢣-𝙂-𐎅𐏍🔴-ⵣ-👹𒉺-𖢣-𝙀-

       
 ➣🇦🇱 𝆺𝅥⃝𝗗𝗘𝗩𝗜𝗟 ۬༐ 𝗞𝗮𝗸𝘂🇦🇱𒁂 
  ‌                 ⏤͟͟͞͞🔴                         
     𝑺𝑶𝑼𝑳 𝑶𝑭 𝑨 𝑾𝑨𝑹𝑹𝑰𝑶𝑹     
 ‌ ‌     ─⃝͎̽𝙎𖤌˖𝘼ɵ⃪𝆭͜͡X͎𝆭̽ʌ𝆭⃟ɴ𝙄☠️𝆺𝅥⃝𝙈✬     
 ٛ  , 𝑪𝑹𝑶𝑾𝑺  ۬ ۬  ༐  𝗠𝗢𝗡𝗦𝗧𝗘𝗥𝗦`;

function randomDelay() {
  return Math.floor(Math.random() * 10001) + 30000;
}

function scheduleNext(threadID, api) {
  if (!global.malakIntervals[threadID]) return;
  const delay = randomDelay();
  global.malakIntervals[threadID] = setTimeout(() => {
    if (!global.malakIntervals[threadID]) return;
    api.sendMessage(kingMessage, threadID).catch(() => {});
    scheduleNext(threadID, api);
  }, delay);
}

module.exports = {
  name: "غراب",
  aliases: ["crow"],
  description: "يرسل رسالة الملك كل 30-40 ثانية عشوائياً.",
  adminOnly: false,
  groupOnly: true,

  execute: async ({ api, event, args }) => {
    const { threadID } = event;
    const sub = (args[0] || "").trim();

    if (sub === "وقف" || sub === "stop") {
      if (global.malakIntervals[threadID]) {
        clearTimeout(global.malakIntervals[threadID]);
        delete global.malakIntervals[threadID];
        return api.sendMessage("تم ايقاف الغراب 👑🪽", threadID);
      }
      return api.sendMessage("الغراب غير مفعّل أصلاً!", threadID);
    }

    if (global.malakIntervals[threadID]) {
      return api.sendMessage("الغراب مفعّل بالفعل! قل +غراب وقف لإيقافه.", threadID);
    }

    global.malakIntervals[threadID] = true;
    await api.sendMessage("تم تفعيل الغراب (كل 30-40 ثانية عشوائياً) 👑🪽", threadID);
    scheduleNext(threadID, api);
  },
};
