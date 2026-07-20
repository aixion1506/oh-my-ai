#!/usr/bin/env node
//
// Product Notice runtime for Public V1.
//
// Canonical source: docs/contracts/product-notice-contract.md (harness-foundation-docs)
// DEC-054 / DEC-055 / DEC-056 / ADR-0011.
//
// Responsibilities owned here: read_for_display, select_active_notice,
// render_notice, refresh_if_stale (nonblocking one-shot), dismiss, opt-out.
//
// work-start.sh only calls the thin CLI surface below (`render`,
// `refresh-if-stale`). It does not know about manifest URLs, schema, lock,
// or cache file structure.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";

process.umask(0o077);

// --- Release Policy defaults (adjustable; not Contract constants) ---------

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const FETCH_TIMEOUT_MS = 2000; // 2s hard timeout
const DEFAULT_MAX_IMPRESSIONS = 3;
const MAX_DISPLAY_COUNT = 1; // notices shown per Work-start run
const MAX_MESSAGE_LENGTH = 280;
const LOCK_STALE_MS = 30 * 1000; // 30s

const SUPPORTED_SCHEMA_VERSION = 1;

const DEFAULT_MANIFEST_URL =
  "https://raw.githubusercontent.com/aixion1506/oh-my-ai/master/notices/manifest.json";

const FETCH_HOST_ALLOWLIST = new Set(["raw.githubusercontent.com"]);

const ACTION_URL_ALLOWLIST = [
  { host: "github.com", pathPrefix: "/aixion1506/oh-my-ai/releases" },
  { host: "github.com", pathPrefix: "/aixion1506/oh-my-ai/security/advisories" },
];

const NOTICE_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

// --- Paths -----------------------------------------------------------------

function cacheDir() {
  const base = process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache");
  return path.join(base, "oh-my-ai");
}

function configDir() {
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(base, "oh-my-ai");
}

function cachePath() {
  return path.join(cacheDir(), "notice-manifest.json");
}

function statePath() {
  return path.join(configDir(), "notice-state.json");
}

function lockPath() {
  return path.join(cacheDir(), "notice-refresh.lock");
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
}

// --- Atomic read/write -------------------------------------------------------

// Returns { exists, value }. `exists` distinguishes "file absent" (legitimate
// first run) from "file present but unreadable/unparseable" (corruption) so
// callers can fail safe only on genuine corruption, not on absence.
function readJsonSafe(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return { exists: false, value: null };
    return { exists: true, value: null }; // unreadable: treat as corrupted
  }
  try {
    return { exists: true, value: JSON.parse(raw) };
  } catch {
    return { exists: true, value: null }; // unparseable: treat as corrupted
  }
}

function atomicWriteJson(file, data) {
  ensureDir(path.dirname(file));
  const tmp = `${file}.tmp.${process.pid}.${crypto.randomBytes(4).toString("hex")}`;
  const fd = fs.openSync(tmp, "w", 0o600);
  try {
    fs.writeSync(fd, JSON.stringify(data));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
}

// --- SemVer ------------------------------------------------------------------
//
// Minimal MAJOR.MINOR.PATCH[-prerelease][+build] parser and comparator.
// OPEN-009 (Runtime Version Range grammar) is still open at Foundation level;
// this module sidesteps that by using explicit min_version/max_version
// fields instead of a range-string grammar.

const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-.]+))?(?:\+[0-9A-Za-z-.]+)?$/;

function parseSemver(value) {
  if (typeof value !== "string") return null;
  const m = SEMVER_RE.exec(value.trim());
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4] ? m[4].split(".") : [],
  };
}

function comparePrereleaseIdentifier(a, b) {
  const aNum = /^\d+$/.test(a);
  const bNum = /^\d+$/.test(b);
  if (aNum && bNum) return Number(a) - Number(b);
  if (aNum) return -1; // numeric identifiers have lower precedence
  if (bNum) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareSemver(a, b) {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  const aHasPre = a.prerelease.length > 0;
  const bHasPre = b.prerelease.length > 0;
  if (aHasPre && !bHasPre) return -1; // prerelease < release
  if (!aHasPre && bHasPre) return 1;
  if (!aHasPre && !bHasPre) return 0;
  const len = Math.max(a.prerelease.length, b.prerelease.length);
  for (let i = 0; i < len; i += 1) {
    if (a.prerelease[i] === undefined) return -1;
    if (b.prerelease[i] === undefined) return 1;
    const cmp = comparePrereleaseIdentifier(a.prerelease[i], b.prerelease[i]);
    if (cmp !== 0) return cmp;
  }
  return 0;
}

// version in [min, max) ; min/max optional. Unknown/unparseable version never matches.
function versionInRange(versionStr, min, max) {
  const version = parseSemver(versionStr);
  if (!version) return false; // Version Unknown -> Notice 표시 없음
  if (min !== undefined && min !== null) {
    const minV = parseSemver(min);
    if (!minV) return false;
    if (compareSemver(version, minV) < 0) return false;
  }
  if (max !== undefined && max !== null) {
    const maxV = parseSemver(max);
    if (!maxV) return false;
    if (compareSemver(version, maxV) >= 0) return false;
  }
  return true;
}

// --- Manifest fetch + validate ------------------------------------------------

function manifestUrl() {
  return process.env.NOTICE_MANIFEST_URL || DEFAULT_MANIFEST_URL;
}

async function sleepAbortable(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("aborted"));
    };
    if (signal.aborted) return onAbort();
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

// Returns { ok: boolean, text?: string } and never throws. All failure modes
// (network, timeout, redirect, non-2xx, missing file) collapse to ok:false,
// which the caller treats identically: keep the existing cache untouched.
async function fetchManifestRaw(urlStr) {
  let url;
  try {
    url = new URL(urlStr);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }

  if (url.protocol === "file:") {
    // Test-only lane: local fixture manifests, no network involved.
    try {
      const text = fs.readFileSync(fileURLToPath(url), "utf8");
      return { ok: true, text };
    } catch {
      return { ok: false, reason: "file_read_failed" };
    }
  }

  if (url.protocol === "test-delay-file:") {
    // Test-only lane: like file:, but widens the critical section by a
    // configurable delay so a concurrency fixture can force two __do-refresh
    // invocations to genuinely overlap, instead of relying on process
    // scheduling luck to exercise the lock's mutual-exclusion path.
    const delayMs = Number(process.env.NOTICE_TEST_FETCH_DELAY_MS || 300);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    try {
      const text = fs.readFileSync(url.pathname, "utf8");
      return { ok: true, text };
    } catch {
      return { ok: false, reason: "file_read_failed" };
    }
  }

  if (url.protocol === "test-slow-file:") {
    // Test-only lane: exercises the Hard Timeout / AbortController path
    // deterministically without depending on real network latency.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      await sleepAbortable(FETCH_TIMEOUT_MS + 2000, controller.signal);
      return { ok: false, reason: "unreachable" };
    } catch {
      return { ok: false, reason: "timeout" };
    } finally {
      clearTimeout(timer);
    }
  }

  if (url.protocol !== "https:") {
    return { ok: false, reason: "unsupported_protocol" };
  }
  if (!FETCH_HOST_ALLOWLIST.has(url.hostname)) {
    return { ok: false, reason: "host_not_allowlisted" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: "manual", // never follow a redirect, same-host or not
      signal: controller.signal,
    });
    // status 0 / type 'opaqueredirect' happens under redirect:'manual' when
    // the server responds with a 3xx. Treat any redirect as a failure.
    if (res.type === "opaqueredirect" || (res.status >= 300 && res.status < 400)) {
      return { ok: false, reason: "redirect_rejected" };
    }
    if (!res.ok) {
      return { ok: false, reason: `http_${res.status}` };
    }
    const text = await res.text();
    return { ok: true, text };
  } catch {
    return { ok: false, reason: "fetch_failed" };
  } finally {
    clearTimeout(timer);
  }
}

const CONTROL_CHAR_PATTERN = new RegExp(
  "[" +
    Array.from({ length: 32 }, (_, i) => String.fromCharCode(i))
      .filter((c) => c !== "\t" && c !== "\n" && c !== "\r")
      .map((c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`)
      .join("") +
    "\\u007f" +
    "]",
  "g",
);

function stripControlChars(str) {
  return str.replace(CONTROL_CHAR_PATTERN, "");
}

function isAllowedActionUrl(value) {
  try {
    const u = new URL(value);
    if (u.protocol !== "https:") return false;
    return ACTION_URL_ALLOWLIST.some(
      (entry) => u.hostname === entry.host && u.pathname.startsWith(entry.pathPrefix),
    );
  } catch {
    return false;
  }
}

function validateNotice(raw) {
  if (typeof raw !== "object" || raw === null) return null;
  const { notice_id, message } = raw;
  if (typeof notice_id !== "string" || !NOTICE_ID_PATTERN.test(notice_id)) return null;
  if (typeof message !== "string" || message.trim().length === 0) return null;

  const cleanMessage = stripControlChars(message).slice(0, MAX_MESSAGE_LENGTH).trim();
  if (cleanMessage.length === 0) return null;

  const notice = { notice_id, message: cleanMessage };

  if (raw.min_version !== undefined) {
    if (typeof raw.min_version !== "string" || !parseSemver(raw.min_version)) return null;
    notice.min_version = raw.min_version;
  }
  if (raw.max_version !== undefined) {
    if (typeof raw.max_version !== "string" || !parseSemver(raw.max_version)) return null;
    notice.max_version = raw.max_version;
  }
  if (raw.action_url !== undefined) {
    if (typeof raw.action_url !== "string" || !isAllowedActionUrl(raw.action_url)) {
      // Allowlist 밖의 URL을 가진 Notice는 해당 Notice만 무시한다.
      return null;
    }
    notice.action_url = raw.action_url;
  }
  if (raw.max_impressions !== undefined) {
    if (!Number.isInteger(raw.max_impressions) || raw.max_impressions <= 0) return null;
    notice.max_impressions = raw.max_impressions;
  } else {
    notice.max_impressions = DEFAULT_MAX_IMPRESSIONS;
  }

  return notice;
}

// Parses and validates manifest text. Returns null on any schema violation;
// caller must leave the existing cache untouched in that case.
function parseManifest(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null; // Invalid JSON -> Manifest 전체 무시
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  if (parsed.schema_version !== SUPPORTED_SCHEMA_VERSION) return null; // Unsupported schema -> 전체 무시
  if (!Array.isArray(parsed.notices)) return null;

  const notices = [];
  const seen = new Set();
  for (const raw of parsed.notices) {
    const notice = validateNotice(raw);
    if (!notice) continue; // drop only the malformed individual notice
    if (seen.has(notice.notice_id)) continue; // duplicate id -> keep first
    seen.add(notice.notice_id);
    notices.push(notice);
  }
  return { schema_version: SUPPORTED_SCHEMA_VERSION, notices };
}

// --- Lock ----------------------------------------------------------------------

function traceLock(event) {
  const traceFile = process.env.NOTICE_TEST_LOCK_TRACE;
  if (!traceFile) return;
  try {
    fs.appendFileSync(traceFile, `${event} pid=${process.pid}\n`);
  } catch {
    // test-only instrumentation; never let it affect real behavior
  }
}

function acquireLock() {
  ensureDir(cacheDir());
  const file = lockPath();
  try {
    const fd = fs.openSync(file, "wx", 0o600);
    fs.writeSync(fd, JSON.stringify({ pid: process.pid, started_at: Date.now() }));
    fs.closeSync(fd);
    traceLock("acquired");
    return true;
  } catch (err) {
    if (err.code !== "EEXIST") {
      traceLock("skipped-error");
      return false;
    }
  }
  // Lock exists; check staleness once, no waiting.
  const { value: existing } = readJsonSafe(file);
  const age = existing && existing.started_at ? Date.now() - existing.started_at : Infinity;
  if (age <= LOCK_STALE_MS) {
    traceLock("skipped-held");
    return false; // held and fresh: do not wait, abandon this refresh
  }
  try {
    fs.unlinkSync(file);
    const fd = fs.openSync(file, "wx", 0o600);
    fs.writeSync(fd, JSON.stringify({ pid: process.pid, started_at: Date.now() }));
    fs.closeSync(fd);
    traceLock("acquired-after-stale");
    return true;
  } catch {
    traceLock("skipped-race");
    return false;
  }
}

function releaseLock() {
  try {
    fs.unlinkSync(lockPath());
  } catch {
    // best-effort; a stale lock self-heals via the staleness check above
  }
}

// --- State (Dismiss / Opt-out / Impression) -------------------------------------

function loadState() {
  const { exists, value } = readJsonSafe(statePath());
  if (!exists) {
    return { schema_version: 1, opt_out: false, notices: {} }; // legitimate first run
  }
  const valid =
    value &&
    typeof value === "object" &&
    typeof value.opt_out === "boolean" &&
    typeof value.notices === "object" &&
    value.notices !== null;
  if (!valid) {
    // File exists but is unreadable/unparseable/malformed: fail safe. Do not
    // infer opt-out=false or dismissed=false from a broken file; treat as
    // opted-out (no remote check) so a corrupted preference file cannot
    // silently re-enable network checks the user may have turned off.
    return { schema_version: 1, opt_out: true, notices: {}, corrupted: true };
  }
  return value;
}

function saveState(state) {
  const { corrupted, ...clean } = state;
  atomicWriteJson(statePath(), clean);
}

// --- Cache -----------------------------------------------------------------------

function loadCache() {
  // Cache absent and cache corrupted collapse to the same outcome (null):
  // no display this run, and isCacheStale() below will trigger a refresh.
  const { value: cache } = readJsonSafe(cachePath());
  if (!cache || typeof cache !== "object") return null;
  if (cache.schema_version !== SUPPORTED_SCHEMA_VERSION || !Array.isArray(cache.notices)) return null;
  if (typeof cache.fetched_at !== "number") return null;
  return cache;
}

function isCacheStale(cache) {
  if (!cache) return true;
  return Date.now() - cache.fetched_at > CACHE_TTL_MS;
}

// --- Selection + rendering ---------------------------------------------------

function selectActiveNotices(cache, state, currentVersion) {
  if (!cache) return [];
  if (state.opt_out) return [];
  const active = [];
  for (const notice of cache.notices) {
    const choice = state.notices[notice.notice_id];
    if (choice && choice.dismissed) continue;
    const impressions = choice ? choice.impressions : 0;
    if (impressions >= notice.max_impressions) continue;
    if (!versionInRange(currentVersion, notice.min_version, notice.max_version)) continue;
    active.push(notice);
    if (active.length >= MAX_DISPLAY_COUNT) break;
  }
  return active;
}

function renderText(notices) {
  if (notices.length === 0) return "";
  const lines = ["", "oh-my-ai notice:"];
  for (const notice of notices) {
    lines.push(`- ${notice.message}`);
    if (notice.action_url) lines.push(`  ${notice.action_url}`);
  }
  lines.push("(run `node scripts/notice.mjs opt-out` to stop checking for notices)");
  return lines.join("\n");
}

// --- CLI commands --------------------------------------------------------------

function cmdRender(args) {
  try {
    const version = option(args, "--version") || "";
    const cache = loadCache();
    const state = loadState();
    const active = selectActiveNotices(cache, state, version);

    if (active.length > 0) {
      for (const notice of active) {
        const entry = state.notices[notice.notice_id] || { dismissed: false, impressions: 0 };
        entry.impressions = (entry.impressions || 0) + 1;
        state.notices[notice.notice_id] = entry;
      }
      saveState(state);
    }

    process.stdout.write(renderText(active));
  } catch {
    // fail-open: never let a Notice error reach Work-start's exit code
  }
  process.exit(0);
}

function cmdRefreshIfStale(args) {
  try {
    const version = option(args, "--version") || "";
    const state = loadState();
    if (state.opt_out) {
      process.exit(0);
      return;
    }
    const cache = loadCache();
    if (!isCacheStale(cache)) {
      process.exit(0);
      return;
    }
    const child = spawn(
      process.execPath,
      [fileURLToPath(import.meta.url), "__do-refresh", "--version", version],
      { detached: true, stdio: "ignore" },
    );
    child.unref();
  } catch {
    // fail-open
  }
  process.exit(0);
}

async function cmdDoRefresh(args) {
  try {
    if (!acquireLock()) {
      process.exit(0);
      return;
    }
    try {
      const result = await fetchManifestRaw(manifestUrl());
      if (result.ok) {
        const manifest = parseManifest(result.text);
        if (manifest) {
          atomicWriteJson(cachePath(), { ...manifest, fetched_at: Date.now() });
        }
        // Invalid/unsupported manifest: leave existing cache untouched.
      }
      // Fetch failure: leave existing cache untouched.
    } finally {
      releaseLock();
    }
  } catch {
    // fail-open; this process is detached and its output is never surfaced
  }
  process.exit(0);
}

function cmdStatus() {
  const cache = loadCache();
  const state = loadState();
  const out = {
    opt_out: state.opt_out,
    state_corrupted: Boolean(state.corrupted),
    cache_present: Boolean(cache),
    cache_stale: isCacheStale(cache),
    cache_fetched_at: cache ? new Date(cache.fetched_at).toISOString() : null,
    notices: (cache ? cache.notices : []).map((n) => ({
      notice_id: n.notice_id,
      dismissed: Boolean(state.notices[n.notice_id]?.dismissed),
      impressions: state.notices[n.notice_id]?.impressions || 0,
      max_impressions: n.max_impressions,
    })),
  };
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

function cmdDismiss(args) {
  const noticeId = args[0];
  if (!noticeId || !NOTICE_ID_PATTERN.test(noticeId)) {
    console.error("usage: notice.mjs dismiss <notice_id>");
    process.exit(2);
    return;
  }
  const state = loadState();
  const entry = state.notices[noticeId] || { dismissed: false, impressions: 0 };
  entry.dismissed = true;
  state.notices[noticeId] = entry;
  saveState(state);
  console.log(`dismissed: ${noticeId}`);
  process.exit(0);
}

function cmdOptOut() {
  const state = loadState();
  state.opt_out = true;
  saveState(state);
  console.log("opted out: no remote Notice checks will be performed");
  process.exit(0);
}

function cmdOptIn() {
  const state = loadState();
  state.opt_out = false;
  saveState(state);
  console.log("opted in: Notice refresh will resume on the next stale Work-start run");
  process.exit(0);
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

const [command, ...rest] = process.argv.slice(2);

switch (command) {
  case "render":
    cmdRender(rest);
    break;
  case "refresh-if-stale":
    cmdRefreshIfStale(rest);
    break;
  case "__do-refresh":
    cmdDoRefresh(rest);
    break;
  case "status":
    cmdStatus();
    break;
  case "dismiss":
    cmdDismiss(rest);
    break;
  case "opt-out":
    cmdOptOut();
    break;
  case "opt-in":
    cmdOptIn();
    break;
  default:
    console.error(
      "usage: notice.mjs <render|refresh-if-stale|status|dismiss <id>|opt-out|opt-in>",
    );
    process.exit(2);
}

// Re-exported for the fixture suite (unit-level checks without shelling out).
export {
  parseSemver,
  compareSemver,
  versionInRange,
  parseManifest,
  isAllowedActionUrl,
  cachePath,
  statePath,
  lockPath,
  pathToFileURL,
};
