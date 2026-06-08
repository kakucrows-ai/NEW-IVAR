"use strict";

/**
 * restartManager.js — Safe Restart Lifecycle Controller
 *
 * Implements the full PRE-RESTART → RESTART → POST-RESTART lifecycle:
 *
 *   PRE-RESTART:
 *     1. Freeze session writes (prevents concurrent saves during shutdown)
 *     2. Capture live appstate via api.getAppState()
 *     3. Atomic save to disk via SessionManager.saveSync()
 *     4. Create timestamped recovery snapshot
 *     5. Grace period for OS disk flush (fsync equivalent)
 *     6. process.exit(0)  ← process manager restarts automatically
 *
 *   POST-RESTART (handled by session.js load()):
 *     - WAL journal checked for interrupted writes
 *     - Primary or best backup loaded + validated
 *     - Primary auto-restored from backup if corrupted
 *
 * Usage:
 *   restartManager.register(api, session, snapshot);   // called after login
 *   restartManager.safeRestart(...);                   // called by +restart command
 */

const logger = require("./logger");

// ── State ──────────────────────────────────────────────────────────────────

let _frozen     = false;
let _restarting = false;
let _api        = null;
let _session    = null;
let _snapshot   = null;

// ── Registration ───────────────────────────────────────────────────────────

function register(api, session, snapshot) {
  _api      = api;
  _session  = session;
  _snapshot = snapshot;
  logger.debug("RestartMgr", "Registered api + session + snapshot ✅");
}

function unregister() {
  _api      = null;
  _session  = null;
  _snapshot = null;
  _frozen   = false;
  logger.debug("RestartMgr", "Unregistered — reconnect in progress.");
}

// ── Freeze ─────────────────────────────────────────────────────────────────

/** Block new cookie saves. Called at the start of the restart sequence. */
function freeze() {
  _frozen = true;
  logger.info("RestartMgr", "⛔ Session writes FROZEN — restart imminent.");
}

/** Allow cookie saves again. Called if restart is aborted (error path). */
function unfreeze() {
  _frozen = false;
  logger.info("RestartMgr", "✅ Session writes UNFROZEN.");
}

/** Returns true when writes are frozen. Checked by cookieRefresher. */
function isFrozen() {
  return _frozen;
}

// ── Safe Restart ───────────────────────────────────────────────────────────

/**
 * Execute the full safe-restart lifecycle.
 *
 * @param {object}   apiRef     — nkxfca api instance (or falls back to registered)
 * @param {object}   sessRef    — SessionManager instance (or falls back)
 * @param {object}   snapRef    — SnapshotManager instance (or falls back)
 * @param {string}   threadID   — chat thread to send status messages
 * @param {Function} sendMsg    — api.sendMessage-compatible function
 */
async function safeRestart(apiRef, sessRef, snapRef, threadID, sendMsg) {
  if (_restarting) {
    logger.warn("RestartMgr", "Restart already in progress — duplicate request ignored.");
    return;
  }
  _restarting = true;

  const api  = apiRef  || _api;
  const sess = sessRef || _session;
  const snap = snapRef || _snapshot;

  logger.info("RestartMgr", "");
  logger.info("RestartMgr", "══════════════════════════════════════");
  logger.info("RestartMgr", "   SAFE RESTART SEQUENCE — BEGIN     ");
  logger.info("RestartMgr", "══════════════════════════════════════");

  // ── Step 1: Freeze writes ──────────────────────────────────────────────
  logger.info("RestartMgr", "[1/6] Freezing session writes...");
  freeze();

  // ── Step 2: Notify group ──────────────────────────────────────────────
  if (sendMsg && threadID) {
    try {
      await sendMsg(
        "🔄 جارٍ حفظ الجلسة وإعادة التشغيل بأمان...\n" +
        "⏳ سيعود البوت خلال ثوانٍ قليلة.",
        threadID
      );
    } catch {}
  }

  // ── Step 3: Capture appstate ──────────────────────────────────────────
  logger.info("RestartMgr", "[2/6] Capturing live appstate...");
  let state = null;
  if (api) {
    try {
      state = api.getAppState();
      if (Array.isArray(state) && state.length > 0) {
        logger.success("RestartMgr", `[2/6] Captured ${state.length} cookies ✅`);
      } else {
        logger.warn("RestartMgr", "[2/6] AppState is empty — cannot save.");
        state = null;
      }
    } catch (e) {
      logger.warn("RestartMgr", `[2/6] getAppState() failed: ${e.message}`);
    }
  }

  // ── Step 4: Atomic save to disk ───────────────────────────────────────
  if (state) {
    logger.info("RestartMgr", "[3/6] Atomic save to disk...");
    if (sess) {
      const saved = sess.saveSync(state);
      if (saved) {
        logger.success("RestartMgr", "[3/6] Disk save ✅");
      } else {
        logger.warn("RestartMgr", "[3/6] Disk save returned false.");
      }
    } else {
      logger.warn("RestartMgr", "[3/6] No session ref — skipping disk save.");
    }

    // ── Step 5: Create recovery snapshot ─────────────────────────────────
    logger.info("RestartMgr", "[4/6] Creating recovery snapshot...");
    if (snap) {
      const snapFile = snap.save(state, "pre-restart");
      if (snapFile) {
        logger.success("RestartMgr", "[4/6] Snapshot created ✅");
      } else {
        logger.warn("RestartMgr", "[4/6] Snapshot creation failed.");
      }
    } else {
      logger.warn("RestartMgr", "[4/6] No snapshot ref — skipping.");
    }
  } else {
    logger.warn("RestartMgr", "[3-4/6] No state to save — skipping disk save and snapshot.");
  }

  // ── Step 6: Grace period + exit ──────────────────────────────────────
  logger.info("RestartMgr", "[5/6] Waiting for disk flush (1.5s)...");
  await new Promise(r => setTimeout(r, 1500));

  logger.info("RestartMgr", "[6/6] Exiting — process manager will restart.");
  logger.info("RestartMgr", "══════════════════════════════════════");
  process.exit(0);
}

module.exports = { register, unregister, freeze, unfreeze, isFrozen, safeRestart };
