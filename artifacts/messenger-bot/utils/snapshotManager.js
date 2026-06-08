"use strict";

/**
 * snapshotManager.js — Timestamped Session Snapshot Archive
 *
 * Creates named, timestamped snapshots of appstate in a dedicated
 * `sessions/` directory. Keeps up to MAX_SNAPSHOTS (10) entries,
 * automatically rotating the oldest. Each snapshot has a paired
 * SHA-256 checksum file for integrity verification.
 *
 * Usage:
 *   const { SnapshotManager } = require("./snapshotManager");
 *   const snap = new SnapshotManager(APP_STATE_PATH);
 *   snap.save(state, "pre-restart");
 *   const data = snap.loadBest();   // recovery fallback
 */

const fs     = require("fs");
const path   = require("path");
const crypto = require("crypto");
const logger = require("./logger");

const MAX_SNAPSHOTS = 10;

class SnapshotManager {
  constructor(sessionFilePath) {
    this.sessionFile = path.resolve(sessionFilePath);
    this.dir         = path.join(path.dirname(this.sessionFile), "sessions");
    this._ensureDir();
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  _ensureDir() {
    try {
      if (!fs.existsSync(this.dir)) fs.mkdirSync(this.dir, { recursive: true });
    } catch (e) {
      logger.warn("Snapshot", `Could not create snapshot dir: ${e.message}`);
    }
  }

  _ts() {
    const d = new Date();
    return (
      d.getFullYear() +
      String(d.getMonth() + 1).padStart(2, "0") +
      String(d.getDate()).padStart(2, "0") + "_" +
      String(d.getHours()).padStart(2, "0") +
      String(d.getMinutes()).padStart(2, "0") +
      String(d.getSeconds()).padStart(2, "0")
    );
  }

  _checksum(data) {
    return crypto.createHash("sha256").update(JSON.stringify(data)).digest("hex");
  }

  _validate(data) {
    if (!Array.isArray(data) || data.length === 0) return false;
    if (data[0] && data[0]._README) return false;
    return data.some(c => c && c.key && c.value !== undefined);
  }

  _listFiles() {
    try {
      return fs.readdirSync(this.dir)
        .filter(f => f.startsWith("appstate_") && f.endsWith(".json") && !f.endsWith(".sha256"))
        .map(f => {
          const full = path.join(this.dir, f);
          return { name: f, path: full, mtime: fs.statSync(full).mtimeMs };
        })
        .sort((a, b) => b.mtime - a.mtime);
    } catch { return []; }
  }

  _rotate() {
    const files = this._listFiles();
    files.slice(MAX_SNAPSHOTS).forEach(f => {
      try {
        fs.unlinkSync(f.path);
        const cs = f.path + ".sha256";
        if (fs.existsSync(cs)) fs.unlinkSync(cs);
      } catch {}
    });
  }

  // ── Public ────────────────────────────────────────────────────────────────

  /**
   * Save a named snapshot.
   * @param {Array}  data   — appstate array
   * @param {string} label  — short label (e.g. "pre-restart", "login", "auto")
   * @returns {string|null} snapshot file path, or null on failure
   */
  save(data, label = "auto") {
    if (!this._validate(data)) {
      logger.warn("Snapshot", `Refusing to snapshot invalid state.`);
      return null;
    }
    try {
      this._ensureDir();
      const name = `appstate_${this._ts()}_${label}.json`;
      const file = path.join(this.dir, name);
      const tmp  = file + ".tmp";

      fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
      fs.renameSync(tmp, file);
      fs.writeFileSync(file + ".sha256", this._checksum(data), "utf8");

      logger.success("Snapshot", `Saved → ${name} (${data.length} cookies)`);
      this._rotate();
      return file;
    } catch (e) {
      logger.warn("Snapshot", `Save failed: ${e.message}`);
      return null;
    }
  }

  /**
   * List all stored snapshots, newest first.
   */
  list() {
    return this._listFiles();
  }

  /**
   * Load the most recent valid snapshot (for recovery).
   * Tries each snapshot newest-first until one passes validation.
   * @returns {Array|null} appstate array, or null if none valid
   */
  loadBest() {
    const files = this._listFiles();
    if (files.length === 0) {
      logger.warn("Snapshot", "No snapshots available for recovery.");
      return null;
    }

    logger.info("Snapshot", `Scanning ${files.length} snapshot(s) for recovery...`);
    for (const f of files) {
      try {
        const data = JSON.parse(fs.readFileSync(f.path, "utf8"));
        if (this._validate(data)) {
          logger.success("Snapshot", `Recovery candidate: ${f.name} (${data.length} cookies)`);
          return data;
        }
        logger.warn("Snapshot", `  ${f.name} — invalid`);
      } catch (e) {
        logger.warn("Snapshot", `  ${f.name} — corrupted: ${e.message}`);
      }
    }
    logger.error("Snapshot", "No valid recovery snapshot found.");
    return null;
  }

  /**
   * Status summary for diagnostics.
   */
  status() {
    const files = this._listFiles();
    return {
      count: files.length,
      max:   MAX_SNAPSHOTS,
      dir:   this.dir,
      latest: files[0] ? files[0].name : null,
    };
  }
}

module.exports = { SnapshotManager };
