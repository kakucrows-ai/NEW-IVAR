"use strict";

const https = require("https");

// ── HTTP GET helper (JSON) ────────────────────────────────────────────────────
function getJson(hostname, path) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      { hostname, path, headers: { "User-Agent": "Mozilla/5.0" }, timeout: 10000 },
      res => {
        let d = "";
        res.on("data", c => d += c);
        res.on("end", () => {
          try { resolve(JSON.parse(d)); }
          catch { reject(new Error("Bad JSON from " + hostname)); }
        });
      }
    );
    req.on("error",   reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Request timed out")); });
  });
}

// ── Primary: lrclib.net ───────────────────────────────────────────────────────
async function fetchFromLrclib(query) {
  const q   = encodeURIComponent(query);
  const res = await getJson("lrclib.net", "/api/search?q=" + q);
  if (!Array.isArray(res) || res.length === 0) return null;
  const hit = res.find(r => r.plainLyrics) || res[0];
  if (!hit || !hit.plainLyrics) return null;
  return {
    lyrics:   hit.plainLyrics.trim(),
    track:    hit.trackName  || query,
    artist:   hit.artistName || "",
    album:    hit.albumName  || "",
    duration: hit.duration   || 0,
  };
}

// ── Fallback: lyrics.ovh (needs "artist - title" format) ─────────────────────
async function fetchFromLyricsOvh(query) {
  // Split on " - " or use whole query as title with empty artist
  const parts  = query.split(/\s+-\s+/);
  const artist = parts.length > 1 ? parts[0].trim() : "unknown";
  const title  = parts.length > 1 ? parts.slice(1).join(" - ").trim() : query;
  const res    = await getJson(
    "api.lyrics.ovh",
    "/v1/" + encodeURIComponent(artist) + "/" + encodeURIComponent(title)
  );
  if (!res || !res.lyrics) return null;
  return { lyrics: res.lyrics.trim(), track: title, artist, album: "", duration: 0 };
}

// ── Format duration mm:ss ─────────────────────────────────────────────────────
function fmtDur(sec) {
  if (!sec) return "";
  return " \u2022 \u23F1 " + Math.floor(sec / 60) + ":" + String(Math.floor(sec % 60)).padStart(2, "0");
}

// ── Split long lyrics into ≤1800-char chunks at line boundaries ───────────────
function chunkLyrics(text, maxLen = 1800) {
  const lines  = text.split("\n");
  const chunks = [];
  let   buf    = "";
  for (const line of lines) {
    if ((buf + "\n" + line).length > maxLen) {
      if (buf) chunks.push(buf.trim());
      buf = line;
    } else {
      buf = buf ? buf + "\n" + line : line;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());
  return chunks;
}

// ── Command ───────────────────────────────────────────────────────────────────
module.exports = {
  name: "lyrics",
  aliases: ["كلمات", "lyric", "lrc"],
  description: "\u062c\u0644\u0628 \u0643\u0644\u0645\u0627\u062a \u0623\u064a \u0623\u063a\u0646\u064a\u0629.",
  usage: "lyrics [\u0627\u0633\u0645 \u0627\u0644\u0623\u063a\u0646\u064a\u0629] \u0623\u0648 [\u0627\u0644\u0641\u0646\u0627\u0646 - \u0627\u0644\u0623\u063a\u0646\u064a\u0629]",
  category: "Entertainment",

  async execute({ api, event, args }) {
    const { threadID } = event;
    const query = args.join(" ").trim();

    if (!query) {
      return api.sendMessage(
        "\uD83C\uDFB6 \u0627\u0644\u0627\u0633\u062a\u062e\u062f\u0627\u0645: -lyrics [\u0627\u0633\u0645 \u0627\u0644\u0623\u063a\u0646\u064a\u0629]\n\u0623\u0645\u062b\u0644\u0629:\n  -lyrics Blinding Lights\n  -lyrics The Weeknd - Blinding Lights\n  -lyrics \u0644\u064a\u0643\u064a \u0645\u0648\u062a\u062d\u0634\u064a",
        threadID
      );
    }

    await api.sendMessage("\uD83D\uDD0D \u062c\u0627\u0631\u064d \u0627\u0644\u0628\u062d\u062b \u0639\u0646 \u0643\u0644\u0645\u0627\u062a: " + query + " ...", threadID);

    // Try primary then fallback
    let result = null;
    try { result = await fetchFromLrclib(query); }   catch { /* ignore, try fallback */ }
    if (!result) {
      try { result = await fetchFromLyricsOvh(query); } catch { /* ignore */ }
    }

    if (!result) {
      return api.sendMessage(
        "\uD83D\uDE15 \u0644\u0645 \u064a\u064f\u0639\u062b\u0631 \u0639\u0644\u0649 \u0643\u0644\u0645\u0627\u062a \u0647\u0630\u0647 \u0627\u0644\u0623\u063a\u0646\u064a\u0629.\n\u062c\u0631\u0651\u0628: -lyrics [\u0627\u0644\u0641\u0646\u0627\u0646] - [\u0627\u0633\u0645 \u0627\u0644\u0623\u063a\u0646\u064a\u0629]",
        threadID
      );
    }

    // Build header
    const header =
      "\uD83C\uDFB5 " + result.track +
      (result.artist   ? "\n\uD83C\uDFA4 " + result.artist : "") +
      (result.album    ? "\n\uD83D\uDCC0 " + result.album  : "") +
      fmtDur(result.duration) +
      "\n\n\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n";

    const chunks = chunkLyrics(result.lyrics);

    // Send header + first chunk together, then remaining chunks
    const firstMsg = header + chunks[0];
    await api.sendMessage(firstMsg, threadID);

    for (let i = 1; i < chunks.length; i++) {
      // small delay between messages to preserve order
      await new Promise(r => setTimeout(r, 600));
      await api.sendMessage(chunks[i], threadID);
    }
  },
};
