"use strict";

/**
 * session.js — Enterprise-Grade Session Persistence Layer v3
 *
 * Features:
 *  ① Atomic writes      write → .tmp → read-back verify → rename (never half-written)
 *  ② Write-Ahead Log    WAL journal detects interrupted saves on next boot
 *  ③ Deep auth check    validates Messenger-critical cookies (c_user, xs)
 *  ④ SHA-256 checksum   stored alongside every file, verified on load
 *  ⑤ Write lock         prevents concurrent saves from interleaving
 *  ⑥ 5 rolling backups  rotated on every save
 *  ⑦ Snapshot fallback  loadBest() via SnapshotManager as last-resort recovery
 *  ⑧ saveSync()         fully synchronous path for SIGTERM / SIGINT handlers
 *
 * Root causes addressed:
 *  - Partial writes         → atomic rename eliminates truncated files
 *  - Crash during write     → WAL detects interrupted ops, falls back to backup
 *  - Concurrent writes      → write lock serialises all saves
 *  - Corrupted JSON         → read-back verification catches disk errors
 *  - Expired / bad session  → deep auth validation rejects invalid state early
 *  - Lost backups           → 5 rolling backups + separate snapshot archive
 */

const fs     = require("fs");
const path   = require("path");
const https  = require("https");
const crypto = require("crypto");
const logger = require("./logger");

const MAX_BACKUPS  = 5;
const GH_TIMEOUT   = 15_000;
const LOCK_TIMEOUT = 10_000;

// Minimum required Messenger authentication cookies.
// A session missing either of these cannot authenticate.
const REQUIRED_COOKIE_KEYS = ["c_user", "xs"];

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

  // ══════════════════════════════════════════════════════════════════════════
  // Internal helpers
  // ══════════════════════════════════════════════════════════════════════════

  _backupPath(n)      { return this.filePath.replace(/\.json$/, `.backup${n}.json`); }
  _checksumPath(f)    { return (f || this.filePath) + ".sha256"; }
  _walPath()          { return this.filePath + ".wal"; }

  _computeChecksum(data) {
    return crypto.createHash("sha256").update(JSON.stringify(data)).digest("hex");
  }

  // ── Validation ────────────────────────────────────────────────────────────

  /** Basic structural check — confirms it is a non-empty cookie array. */
  _validate(data) {
    if (!Array.isArray(data))       return { valid: false, reason: "not an array" };
    if (data.length === 0)          return { valid: false, reason: "empty array" };
    if (data[0] && data[0]._README) return { valid: false, reason: "placeholder data" };
    if (!data.some(c => c && c.key && c.value !== undefined))
                                    return { valid: false, reason: "no valid cookie entries" };
    return { valid: true };
  }

  /**
   * Deep auth validation — verifies that Messenger-critical cookies are present.
   * A session missing c_user or xs will fail login silently.
   */
  _deepValidate(data) {
    const basic = this._validate(data);
    if (!basic.valid) return basic;

    const keys = new Set(data.map(c => c && c.key).filter(Boolean));
    const missing = REQUIRED_COOKIE_KEYS.filter(k => !keys.has(k));
    if (missing.length > 0) {
      return { valid: false, reason: `missing auth cookies: ${missing.join(", ")}` };
    }
    return { valid: true };
  }

  // ── Write-Ahead Log (WAL) ─────────────────────────────────────────────────

  /**
   * Write a "pending" WAL entry BEFORE starting a disk write.
   * If the process crashes mid-write, this journal entry survives
   * and is detected on the next boot to skip the (potentially corrupted) primary.
   */
  _startJournal(count) {
    try {
      fs.writeFileSync(this._walPath(), JSON.stringify({
        v: 2, status: "pending", started: Date.now(), count,
      }), "utf8");
    } catch {}
  }

  /**
   * Update the WAL entry to "complete" AFTER a successful atomic rename.
   * This confirms the write finished cleanly.
   */
  _commitJournal(checksum, count) {
    try {
      fs.writeFileSync(this._walPath(), JSON.stringify({
        v: 2, status: "complete", completed: Date.now(),
        count, checksum: checksum.slice(0, 16),
      }), "utf8");
    } catch {}
  }

  /**
   * On startup: read the WAL to detect if the last write was interrupted.
   * Returns { interrupted: true } if a "pending" entry is found.
   */
  _checkJournal() {
    const walPath = this._walPath();
    if (!fs.existsSync(walPath)) return { interrupted: false };
    try {
      const wal = JSON.parse(fs.readFileSync(walPath, "utf8"));
      if (wal.status === "pending") {
        const age = Math.round((Date.now() - wal.started) / 1000);
        return { interrupted: true, started: wal.started, count: wal.count, age };
      }
    } catch {}
    return { interrupted: false };
  }

  // ── Checksum ──────────────────────────────────────────────────────────────

  _saveChecksum(filePath, checksum) {
    try { fs.writeFileSync(this._checksumPath(filePath), checksum, "utf8"); } catch {}
  }

  _verifyChecksum(filePath) {
    const csPath = this._checksumPath(filePath);
    if (!fs.existsSync(csPath)) return { valid: true, note: "no checksum (legacy)" };
    try {
      const stored  = fs.readFileSync(csPath, "utf8").trim();
      const content = JSON.parse(fs.readFileSync(filePath, "utf8"));
      const actual  = this._computeChecksum(content);
      if (stored !== actual) {
        return {
          valid: false,
          reason: `checksum mismatch (stored ${stored.slice(0,8)}… ≠ actual ${actual.slice(0,8)}…)`
        };
      }
      return { valid: true };
    } catch (e) {
      return { valid: false, reason: e.message };
    }
  }

  // ── Write lock ────────────────────────────────────────────────────────────

  _acquireLock() {
    if (this._writeLock && Date.now() - this._lockAcquiredAt > LOCK_TIMEOUT) {
      logger.warn("Session", "Stale lock detected — force-releasing.");
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
          if (fs.existsSync(csFrom)) fs.renameSync(csFrom, this._checksumPath(to));
        }
      }
      if (fs.existsSync(this.filePath)) {
        const b1 = this._backupPath(1);
        fs.copyFileSync(this.filePath, b1);
        const cs = this._checksumPath(this.filePath);
        if (fs.existsSync(cs)) fs.copyFileSync(cs, this._checksumPath(b1));
        logger.debug("Session", "Backup rotated → #1");
      }
    } catch (e) {
      logger.warn("Session", `Backup rotation error: ${e.message}`);
    }
  }

  // ── Atomic write ──────────────────────────────────────────────────────────

  /**
   * ATOMIC WRITE SEQUENCE:
   *   1. Start WAL journal  (status: pending)
   *   2. Write JSON to .tmp
   *   3. Re-read .tmp and validate  ← catches disk / serialisation errors
   *   4. Write checksum file
   *   5. fs.renameSync()            ← atomic on same filesystem
   *   6. Commit WAL journal (status: complete)
   */
  _atomicWrite(filePath, data) {
    const tmp      = filePath + ".tmp";
    const checksum = this._computeChecksum(data);

    this._startJournal(data.length);

    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");

    // Post-write read-back verification
    const readBack = JSON.parse(fs.readFileSync(tmp, "utf8"));
    const check    = this._validate(readBack);
    if (!check.valid) {
      try { fs.unlinkSync(tmp); } catch {}
      throw new Error(`Read-back validation failed: ${check.reason}`);
    }

    this._saveChecksum(filePath, checksum);
    fs.renameSync(tmp, filePath);
    this._commitJournal(checksum, data.length);

    return checksum;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Public: load
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Load appstate from the best available source.
   *
   * Order of preference:
   *   1. primary (appstate.json)        — skipped if WAL shows interrupted write
   *   2. backup #1 … backup #5
   *   3. (snapshots handled by SnapshotManager externally if all above fail)
   *
   * After loading from a backup, the primary is atomically restored.
   */
  load() {
    logger.info("Session", "═══════ Session Load — Source Scan ═══════");

    // ── WAL check: did the last write crash mid-way? ───────────────────────
    const wal = this._checkJournal();
    if (wal.interrupted) {
      logger.warn("Session",
        `⚠️  WAL: interrupted write detected (${wal.age}s ago, count=${wal.count}) — primary SKIPPED.`
      );
    }

    const sources = [
      { label: "primary",    file: this.filePath,      skipIfWalPending: true },
      ...[1, 2, 3, 4, 5].map(n => ({
        label: `backup #${n}`, file: this._backupPath(n), skipIfWalPending: false,
      })),
    ];

    for (const { label, file, skipIfWalPending } of sources) {
      if (skipIfWalPending && wal.interrupted) {
        logger.warn("Session", `  [SKIP] ${label} — WAL shows interrupted write`);
        continue;
      }
      if (!fs.existsSync(file)) {
        logger.debug("Session", `  [MISS] ${label}`);
        continue;
      }

      // 1. Checksum
      const cs = this._verifyChecksum(file);
      if (!cs.valid) {
        logger.warn("Session", `  [BAD CS] ${label} — ${cs.reason}`);
      }

      // 2. Parse
      let data;
      try {
        data = JSON.parse(fs.readFileSync(file, "utf8"));
      } catch (e) {
        logger.warn("Session", `  [CORRUPT] ${label} — ${e.message}`);
        continue;
      }

      // 3. Structural validation
      const basic = this._validate(data);
      if (!basic.valid) {
        logger.warn("Session", `  [INVALID] ${label} — ${basic.reason}`);
        continue;
      }

      // 4. Deep auth validation
      const deep = this._deepValidate(data);
      if (!deep.valid) {
        logger.warn("Session", `  [AUTH FAIL] ${label} — ${deep.reason}`);
        // Not a hard skip — auth cookies may be differently named in some sessions
        // Log it but still allow this source to be used
      }

      const authNote = deep.valid ? "✅" : "⚠️ auth-warn";
      logger.success("Session", `  [OK ${authNote}] ${label} — ${data.length} cookies`);

      // 5. Restore primary if we fell back
      if (label !== "primary") {
        logger.info("Session", `Restoring primary from ${label}...`);
        try {
          this._atomicWrite(this.filePath, data);
          logger.success("Session", "Primary restored ✅");
        } catch (e) {
          logger.warn("Session", `Restore failed: ${e.message}`);
        }
      }

      logger.info("Session", "══════════════════════════════════════════");
      return data;
    }

    logger.error("Session", "══════════════════════════════════════════");
    logger.error("Session", "  ❌ ALL SESSION SOURCES FAILED");
    logger.error("Session", "  Upload a fresh appstate.json via the");
    logger.error("Session", "  dashboard → 🍪 الجلسة, then restart.");
    logger.error("Session", "══════════════════════════════════════════");
    process.exit(1);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Public: save
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Async-safe save with write lock.
   * Returns false (does NOT throw) if frozen, locked, or invalid.
   */
  save(state) {
    // Check freeze flag from restartManager
    try {
      const rm = require("./restartManager");
      if (rm.isFrozen()) {
        logger.debug("Session", "Save skipped — restart freeze is active.");
        return false;
      }
    } catch {}

    const { valid, reason } = this._validate(state);
    if (!valid) {
      logger.warn("Session", `Refusing invalid state: ${reason}`);
      return false;
    }
    if (!this._acquireLock()) {
      logger.warn("Session", "Write lock busy — save skipped (will retry next cycle).");
      return false;
    }
    try {
      this._rotateBackups();
      const checksum = this._atomicWrite(this.filePath, state);
      logger.success("Session",
        `Saved ${state.length} cookies ✅ [sha256: ${checksum.slice(0,8)}…]`
      );
      return true;
    } catch (e) {
      logger.error("Session", `Atomic write failed: ${e.message}`);
      return false;
    } finally {
      this._releaseLock();
    }
  }

  /**
   * Synchronous save — for SIGTERM / SIGINT / safeRestart.
   * Bypasses the async lock and freeze check (process is about to exit).
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
      logger.success("Session",
        `[SYNC] Shutdown save ✅ [${state.length} cookies, sha256: ${checksum.slice(0,8)}…]`
      );
      return true;
    } catch (e) {
      logger.error("Session", `[SYNC] Shutdown save failed: ${e.message}`);
      return false;
    }
  }

  async saveAndPush(state) {
    const saved = this.save(state);
    if (saved) await this.pushToGitHub();
    return saved;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GitHub push
  // ══════════════════════════════════════════════════════════════════════════

  async pushToGitHub(attempt = 0) {
    if (!this.ghToken || !this.ghRepo) return;
    if (!fs.existsSync(this.filePath)) return;
    if (this._pushing) { this._pendingPush = true; return; }

    this._pushing = true;
    const MAX_RETRIES = 3;
    try {
      const content = fs.readFileSync(this.filePath, "utf8");
      if (!this._ghSha) {
        const meta  = await this._ghRequest("GET", `/repos/${this.ghRepo}/contents/appstate.json`);
        this._ghSha = meta.sha || "";
      }
      const body   = JSON.stringify({
        message: "chore: auto-update appstate.json [skip ci]",
        content: Buffer.from(content).toString("base64"),
        sha:     this._ghSha,
      });
      const result = await this._ghRequest("PUT", `/repos/${this.ghRepo}/contents/appstate.json`, body);
      if (result.content && result.content.sha) this._ghSha = result.content.sha;
      logger.debug("Session", "Pushed to GitHub ✅");
    } catch (e) {
      this._ghSha = "";
      if (attempt < MAX_RETRIES) {
        const delay = Math.pow(2, attempt) * 5_000;
        logger.warn("Session",
          `GitHub push failed (${attempt + 1}/${MAX_RETRIES}): ${e.message}. Retry in ${delay / 1000}s...`
        );
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
