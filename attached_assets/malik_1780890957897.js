const fs = require("fs-extra");
const path = require("path");
const statePath = path.join(__dirname, "data/malakState.json");

function getState() {
  try { return JSON.parse(fs.readFileSync(statePath, "utf-8")); }
  catch { return { locks: {}, botAdmins: {}, awrwa: {} }; }
}

if (!global.malakIntervals) global.malakIntervals = {};

const kingMessage = `𐎅𐏍🔴-ⵣ-👹𒉺-𖢣-𝙆-𐎅𐏍🔴-ⵣ-👹𒉺-𝙆-𐎅𐏍🔴-ⵣ-👹𒉺-𖢣-𝘼-𐎅𐏍🔴-ⵣ-👹𒉺-𖢣-𝙎-𐎅𐏍🔴-ⵣ-👹𒉺-𖢣-𝙊-𐎅𐏍🔴-ⵣ-👹𒉺-𖢣-𝙈-𐎅𐏍🔴-ⵣ-👹𒉺-𖢣-𝙊-𐎅𐏍🔴-ⵣ-👹𒉺𖢣-𝙆-𐎅𐏍🔴-ⵣ-👹𒉺-𖢣-𝙐-𐎅𐏍🔴-ⵣ-👹𒉺-𖢣-𝙍-𐎅𐏍🔴-ⵣ-👹𒉺-𖢣-𝘼-𐎅𐏍🔴-ⵣ-👹𒉺-𖢣-𝙂-𐎅𐏍🔴-ⵣ-👹𒉺-𖢣-𝙀-𐎅𐏍🔴-ⵣ-👹𒉺

       
 ➣🇦🇱 𝆺𝅥⃝𝗗𝗘𝗩𝗜𝗟 ۬༐ 𝗞𝗮𝗸𝘂🇦🇱𒁂 
  ‌                 ⏤͟͟͞͞🔴                         
     𝑺𝑶𝑼𝑳 𝑶𝑭 𝑨 𝑾𝑨𝑹𝑹𝑰𝑶𝑹     
 ‌ ‌     ─⃝͎̽𝙎𖤌˖𝘼ɵ⃪𝆭͜͡X͎𝆭̽ʌ𝆭⃟ɴ𝙄☠️𝆺𝅥⃝𝙈✬     
 ٛ  , 𝑪𝑹𝑶𝑾𝑺  ۬ ۬  ༐  𝗠𝗢𝗡𝗦𝗧𝗘𝗥𝗦`;

module.exports.config = {
  name: "غراب",
  version: "1.0.0",
  hasPermssion: 1,
  credits: "كاڪو",
  description: "أمر الغراب - يرسل رسالة الملك كل 15 ثانية",
  commandCategory: "الملاك",
  usages: "غراب | غراب وقف",
  cooldowns: 0
};

module.exports.run = async function ({ api, event, args }) {
  const { threadID, senderID } = event;
  const sub = args[0];

  if (sub === "وقف") {
    if (global.malakIntervals[threadID]) {
      clearInterval(global.malakIntervals[threadID]);
      delete global.malakIntervals[threadID];
      return api.sendMessage("تم ايقاف الغراب 👑🪽", threadID);
    } else {
      return api.sendMessage("الغراب غير مفعّل أصلاً!", threadID);
    }
  }

  if (global.malakIntervals[threadID]) {
    return api.sendMessage("الغراب مفعّل بالفعل! قل غراب وقف لإيقافه.", threadID);
  }

  await api.sendMessage("تم تفعيل الغراب كل 15 ثانية 👑🪽", threadID);

  global.malakIntervals[threadID] = setInterval(() => {
    api.sendMessage(kingMessage, threadID);
  }, 15000);
};
