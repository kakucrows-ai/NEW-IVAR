"use strict";

/**
 * session.js — Enhanced Session Persistence Layer
 *
 * Improvements over the original:
 *  - Atomic writes  : write → .tmp → verify → rename (never half-written)
 *  - SHA-256 checksum: stored alongside the file, verified on every load
 *  - Write lock     : prevents concurrent saves from interleaving
 *  - 5 rotating backups (up from 3)
 *  - saveSync()     : synchronous path for SIGTERM / SIGINT handlers
 *  - Detailed load diagnostics: every source is logged pass/fail
 *  - Auto-restore   : if primary is corrupted, the best backup is atomically
 *                     promoted to primary before returning
 */

const fs     = require("fs");
const path   = require("path");
const https  = require("https");
const crypto = require("crypto");
const logger = require("./logger");

const MAX_BACKUPS  = 5;
const GH_TIMEOUT   = 15_000;
const LOCK_TIMEOUT = 10_000;

class SessionManager {
  constructor(filePath, ghToken, ghRepo) {
    this.filePath        = path.resolve(filePath);
    this.dir             = path.dirname(this.filePath);
    this.ghToken         = ghToken || "";
    this.ghRepo          = ghRepo  || "";
    this._ghSha          = "";
    this._pushing        = false;
    this._pendingPush    = false;
    this._writeLock      = false;
    this._lockAcquiredAt = 0;
  }

  // ── Internal helpers ──────────────────────────────────────────────────────

  _backupPath(n) {
    return this.filePath.replace(/\.json$/, `.backup${n}.json`);
  }

  _checksumPath(filePath) {
    return (filePath || this.filePath) + ".sha256";
  }

  _computeChecksum(data) {
    return crypto
      .createHash("sha256")
      .update(JSON.stringify(data))
      .digest("hex");
  }

  _saveChecksum(filePath, checksum) {
    try { fs.writeFileSync(this._checksumPath(filePath), checksum, "utf8"); } catch {}
  }

  _verifyChecksum(filePath) {
    const csPath = this._checksumPath(filePath);
    if (!fs.existsSync(csPath)) return { valid: true, note: "no checksum (legacy)" };
    try {
      const stored  = fs.readFileSync(csPath, "utf8").trim();
      const raw     = fs.readFileSync(filePath, "utf8");
      const content = JSON.parse(raw);
      const actual  = this._computeChecksum(content);
      if (stored !== actual) {
        return { valid: false, reason: `checksum mismatch (stored ${stored.slice(0,8)}… ≠ actual ${actual.slice(0,8)}…)` };
      }
      return { valid: true };
    } catch (e) {
      return { valid: false, reason: e.message };
    }
  }

  _validate(data) {
    if (!Array.isArray(data))       return { valid: false, reason: "not an array" };
    if (data.length === 0)          return { valid: false, reason: "empty array" };
    if (data[0] && data[0]._README) return { valid: false, reason: "placeholder / README data" };
    if (!data.some(c => c && c.key && c.value !== undefined))
                                    return { valid: false, reason: "no valid cookie entries" };
    return { valid: true };
  }

  // ── Write lock ────────────────────────────────────────────────────────────

  _acquireLock() {
    if (this._writeLock && Date.now() - this._lockAcquiredAt > LOCK_TIMEOUT) {
      logger.warn("Session", "Stale write lock detected — force-releasing.");
      this._writeLock = false;
    }
    if (this._writeLock) return false;
    this._writeLock      = true;
    this._lockAcquiredAt = Date.now();
    return true;
  }

  _releaseLock() {
    this._writeLock      = false;
    this._lockAcquiredAt = 0;
  }

  // ── Backup rotation ───────────────────────────────────────────────────────

  _rotateBackups() {
    try {
      for (let i = MAX_BACKUPS; i > 1; i--) {
        const from = this._backupPath(i - 1);
        const to   = this._backupPath(i);
        if (fs.existsSync(from)) {
          fs.renameSync(from, to);
          const csFrom = this._checksumPath(from);
          const csTo   = this._checksumPath(to);
          if (fs.existsSync(csFrom)) fs.renameSync(csFrom, csTo);
        }
      }
      if (fs.existsSync(this.filePath)) {
        const b1   = this._backupPath(1);
        fs.copyFileSync(this.filePath, b1);
        const cs   = this._checksumPath(this.filePath);
        if (fs.existsSync(cs)) fs.copyFileSync(cs, this._checksumPath(b1));
        logger.debug("Session", `Backup rotated → backup #1`);
      }
    } catch (e) {
      logger.warn("Session", `Backup rotation error: ${e.message}`);
    }
  }

  // ── Atomic write ──────────────────────────────────────────────────────────

  /**
   * Write data safely:
   *   1. Serialise to JSON
   *   2. Write to <file>.tmp
   *   3. Re-read the .tmp and validate (catches partial-write / disk errors)
   *   4. Write checksum file
   *   5. fs.renameSync — atomic on the same filesystem
   */
  _atomicWrite(filePath, data) {
    const tmp      = filePath + ".tmp";
    const json     = JSON.stringify(data, null, 2);
    const checksum = this._computeChecksum(data);

    fs.writeFileSync(tmp, json, "utf8");

    // Post-write read-back verification
    const readBack = JSON.parse(fs.readFileSync(tmp, "utf8"));
    const check    = this._validate(readBack);
    if (!check.valid) {
      try { fs.unlinkSync(tmp); } catch {}
      throw new Error(`Post-write validation failed: ${check.reason}`);
    }

    this._saveChecksum(filePath, checksum);
    fs.renameSync(tmp, filePath);
    return checksum;
  }

  // ── Load ──────────────────────────────────────────────────────────────────

  load() {
    const sources = [
      { label: "primary",    file: this.filePath },
      ...[1, 2, 3, 4, 5].map(n => ({ label: `backup #${n}`, file: this._backupPath(n) })),
    ];

    logger.info("Session", "═══ Session load — scanning sources ═══");

    for (const { label, file } of sources) {
      if (!fs.existsSync(file)) {
        logger.debug("Session", `  [MISS] ${label}`);
        continue;
      }

      // 1. Checksum verification
      const cs = this._verifyChecksum(file);
      if (!cs.valid) {
        logger.warn("Session", `  [BAD CS] ${label} — ${cs.reason}`);
      } else {
        logger.debug("Session", `  [CS OK] ${label}${cs.note ? " (" + cs.note + ")" : ""}`);
      }

      // 2. Parse + schema validation
      let data;
      try {
        data = JSON.parse(fs.readFileSync(file, "utf8"));
      } catch (e) {
        logger.warn("Session", `  [CORRUPT] ${label} — JSON parse error: ${e.message}`);
        continue;
      }

      const { valid, reason } = this._validate(data);
      if (!valid) {
        logger.warn("Session", `  [INVALID] ${label} — ${reason}`);
        continue;
      }

      logger.success("Session", `  [OK ✅] ${label} — ${data.length} cookies loaded`);

      // 3. If we fell back to a backup, atomically promote it to primary
      if (label !== "primary") {
        logger.info("Session", `Auto-restoring primary from ${label}...`);
        try {
          this._atomicWrite(this.filePath, data);
          logger.success("Session", "Primary restored ✅");
        } catch (e) {
          logger.warn("Session", `Could not restore primary from ${label}: ${e.message}`);
        }
      }

      logger.info("Session", "═══════════════════════════════════════");
      return data;
    }

    logger.error("Session", "═══════════════════════════════════════");
    logger.error("Session", "  ALL SESSION SOURCES ARE INVALID ❌");
    logger.error("Session", "  Export fresh Facebook cookies and");
    logger.error("Session", "  upload as appstate.json via the dashboard,");
    logger.error("Session", "  then restart the bot.");
    logger.error("Session", "═══════════════════════════════════════");
    process.exit(1);
  }

  // ── save (async-safe, with lock) ──────────────────────────────────────────

  save(state) {
    const { valid, reason } = this._validate(state);
    if (!valid) {
      logger.warn("Session", `Refusing to save invalid state: ${reason}`);
      return false;
    }

    if (!this._acquireLock()) {
      logger.warn("Session", "Write lock busy — skipping this save cycle.");
      return false;
    }

    try {
      this._rotateBackups();
      const checksum = this._atomicWrite(this.filePath, state);
      logger.success("Session", `Saved ${state.length} cookies ✅ [sha256: ${checksum.slice(0, 8)}…]`);
      return true;
    } catch (e) {
      logger.error("Session", `Atomic write failed: ${e.message}`);
      return false;
    } finally {
      this._releaseLock();
    }
  }

  /**
   * Synchronous save — safe to call from SIGTERM / SIGINT signal handlers.
   * Bypasses the async lock; suitable only when the process is about to exit.
   */
  saveSync(state) {
    const { valid, reason } = this._validate(state);
    if (!valid) {
      logger.warn("Session", `[SYNC] Refusing invalid state: ${reason}`);
      return false;
    }
    try {
      this._rotateBackups();
      const checksum = this._atomicWrite(this.filePath, state);
      logger.success("Session", `[SYNC] Shutdown save ✅ [${state.length} cookies, sha256: ${checksum.slice(0, 8)}…]`);
      return true;
    } catch (e) {
      logger.error("Session", `[SYNC] Shutdown save failed: ${e.message}`);
      return false;
    }
  }

  // ── saveAndPush ───────────────────────────────────────────────────────────

  async saveAndPush(state) {
    const saved = this.save(state);
    if (saved) await this.pushToGitHub();
    return saved;
  }

  // ── GitHub push ───────────────────────────────────────────────────────────

  async pushToGitHub(attempt = 0) {
    if (!this.ghToken || !this.ghRepo) return;
    if (!fs.existsSync(this.filePath)) return;

    if (this._pushing) { this._pendingPush = true; return; }
    this._pushing = true;

    const MAX_RETRIES = 3;
    try {
      const content = fs.readFileSync(this.filePath, "utf8");
      if (!this._ghSha) {
        const meta   = await this._ghRequest("GET", `/repos/${this.ghRepo}/contents/appstate.json`);
        this._ghSha  = meta.sha || "";
      }
      const body   = JSON.stringify({
        message: "chore: auto-update appstate.json [skip ci]",
        content: Buffer.from(content).toString("base64"),
        sha:     this._ghSha,
      });
      const result = await this._ghRequest("PUT", `/repos/${this.ghRepo}/contents/appstate.json`, body);
      if (result.content && result.content.sha) this._ghSha = result.content.sha;
      logger.debug("Session", "Cookies pushed to GitHub ✅");
    } catch (e) {
      this._ghSha = "";
      if (attempt < MAX_RETRIES) {
        const delay = Math.pow(2, attempt) * 5_000;
        logger.warn("Session", `GitHub push failed (${attempt + 1}/${MAX_RETRIES}): ${e.message}. Retry in ${delay / 1000}s...`);
        this._pushing = false;
        await new Promise(r => setTimeout(r, delay));
        return this.pushToGitHub(attempt + 1);
      }
      logger.warn("Session", `GitHub push permanently failed: ${e.message}`);
    } finally {
      this._pushing = false;
      if (this._pendingPush) {
        this._pendingPush = false;
        setTimeout(() => this.pushToGitHub(), 2_000);
      }
    }
  }

  _ghRequest(method, apiPath, body) {
    return new Promise((resolve, reject) => {
      const bodyBuf = body ? Buffer.from(body, "utf8") : null;
      const req = https.request({
        hostname: "api.github.com",
        path:     apiPath,
        method,
        headers: {
          "Authorization": `token ${this.ghToken}`,
          "Accept":        "application/vnd.github.v3+json",
          "User-Agent":    "ivar-bot-session/3",
          "Content-Type":  "application/json",
          ...(bodyBuf ? { "Content-Length": bodyBuf.length } : {}),
        },
      }, res => {
        let d = "";
        res.on("data", c => d += c);
        res.on("end",  () => { try { resolve(JSON.parse(d)); } catch { resolve({}); } });
      });
      req.setTimeout(GH_TIMEOUT, () => req.destroy(new Error("GitHub request timeout")));
      req.on("error", reject);
      if (bodyBuf) req.write(bodyBuf);
      req.end();
    });
  }
}

module.exports = { SessionManager };
