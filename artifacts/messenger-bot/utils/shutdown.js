"use strict";

/**
 * shutdown.js — Pre-exit Cookie Persistence Registry
 *
 * Any module (index.js, api.js) registers the live api + session objects here.
 * Signal handlers (SIGTERM, SIGINT) then call saveBeforeExit() to guarantee
 * cookies are flushed to disk before the process terminates.
 *
 * This module is intentionally side-effect-free on require().
 */

const logger = require("./logger");

let _api     = null;
let _session = null;

/**
 * Register the active bot api and session manager.
 * Call this immediately after a successful login.
 */
function register(api, session) {
  _api     = api;
  _session = session;
  logger.debug("Shutdown", "Pre-exit save hook registered ✅");
}

/**
 * Unregister (called on disconnect / before reconnect attempt).
 */
function unregister() {
  _api     = null;
  _session = null;
  logger.debug("Shutdown", "Pre-exit save hook cleared.");
}

/**
 * Synchronously save the current appstate to disk.
 * Safe to call from SIGTERM / SIGINT handlers — uses saveSync() which is
 * fully synchronous and bypasses the async write-lock.
 *
 * @param {string} label  — context label for log messages
 */
function saveBeforeExit(label = "shutdown") {
  if (!_api || !_session) {
    logger.warn("Shutdown", `[${label}] No active session registered — nothing to save.`);
    return false;
  }

  let state;
  try {
    state = _api.getAppState();
  } catch (e) {
    logger.error("Shutdown", `[${label}] getAppState() failed: ${e.message}`);
    return false;
  }

  if (!Array.isArray(state) || state.length === 0) {
    logger.warn("Shutdown", `[${label}] AppState is empty — skipping save.`);
    return false;
  }

  const ok = _session.saveSync(state);
  if (ok) {
    logger.success("Shutdown", `[${label}] Cookies written to disk before exit ✅`);
  } else {
    logger.warn("Shutdown", `[${label}] Cookie save returned false.`);
  }
  return ok;
}

module.exports = { register, unregister, saveBeforeExit };
