"use strict";

const os = require("os");

function formatBytes(bytes) {
  const gb = bytes / 1024 / 1024 / 1024;
  if (gb >= 1) return gb.toFixed(2) + " GB";
  return (bytes / 1024 / 1024).toFixed(1) + " MB";
}

function getCpuLoad() {
  const cpus = os.cpus();
  let idle = 0, total = 0;
  for (const cpu of cpus) {
    for (const t of Object.values(cpu.times)) total += t;
    idle += cpu.times.idle;
  }
  return ((1 - idle / total) * 100).toFixed(1);
}

module.exports = {
  name: "server",
  aliases: ["serverinfo", "sys", "system"],
  description: "Display detailed server / system information.",
  usage: "server",
  category: "Info",

  async execute({ api, event }) {
    const mem   = os.totalmem();
    const free  = os.freemem();
    const used  = mem - free;
    const pMem  = process.memoryUsage();

    const upSec = Math.floor(os.uptime());
    const d = Math.floor(upSec / 86400);
    const h = Math.floor((upSec % 86400) / 3600);
    const m = Math.floor((upSec % 3600) / 60);

    const cpus    = os.cpus();
    const cpuLoad = getCpuLoad();

    const msg =
      `╔══ 🖥️  Server Information ══╗\n` +
      `║ OS       : ${os.type()} ${os.release()}\n` +
      `║ Arch     : ${os.arch()}\n` +
      `║ Hostname : ${os.hostname()}\n` +
      `╠══ ⚙️  CPU ══╣\n` +
      `║ Model    : ${cpus[0].model.trim()}\n` +
      `║ Cores    : ${cpus.length} logical\n` +
      `║ Load     : ${cpuLoad}%\n` +
      `╠══ 💾 Memory ══╣\n` +
      `║ Total    : ${formatBytes(mem)}\n` +
      `║ Used     : ${formatBytes(used)} (${((used / mem) * 100).toFixed(1)}%)\n` +
      `║ Free     : ${formatBytes(free)}\n` +
      `║ Bot RSS  : ${formatBytes(pMem.rss)}\n` +
      `╠══ ⏱️  Uptime ══╣\n` +
      `║ System   : ${d}d ${h}h ${m}m\n` +
      `║ Bot      : ${Math.floor(process.uptime())}s\n` +
      `║ Node.js  : ${process.version}\n` +
      `╚══════════════════════════╝`;

    api.sendMessage(msg, event.threadID);
  },
};
