import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const SCHEMA_VERSION = 1;
const STATE_FILE = "context-checkpoint-state.json";
const SUPPORTED_RUNTIMES = new Set(["claude"]);
const SUPPORTED_SIGNALS = new Set(["file_mutation", "validation_run", "explicit_handoff_boundary"]);
const SUPPORTED_RESOLUTIONS = new Set(["checkpointed", "no_update"]);
const MAX_EVENT_HASHES = 64;
const LOCK_ATTEMPTS = 20;
const LOCK_WAIT_MS = 5;

export function checkpointStatus(options = {}) {
  const scope = resolveScope(options);
  if (!scope.ok) return unavailable(scope.reason);

  const loaded = loadCurrentState(scope, options);
  if (loaded.kind === "error") return unavailable(loaded.reason, scope);
  const state = loaded.kind === "missing" ? freshState(scope, nowIso(options)) : loaded.state;
  return publicState(state, { changed: false });
}

export function recordCheckpointActivity(options = {}) {
  const runtime = normalizeRuntime(options.runtime);
  if (!runtime) return unavailable("unsupported_runtime");
  const sessionId = normalizeIdentifier(options.sessionId);
  if (!sessionId) return unavailable("session_identity_unavailable");
  const eventId = normalizeIdentifier(options.eventId);
  if (!eventId) return unavailable("event_identity_unavailable");
  const signalKind = String(options.signalKind || "").trim();
  if (!SUPPORTED_SIGNALS.has(signalKind)) return unavailable("unsupported_activity_signal");

  const scope = resolveScope(options);
  if (!scope.ok) return unavailable(scope.reason);
  const timestamp = nowIso(options);
  const eventHash = hashValue("event", runtime, sessionId, eventId, signalKind);
  const sessionHash = hashValue("session", runtime, sessionId);

  return mutateState(scope, options, (state) => {
    if (state.seen_event_hashes.includes(eventHash)) {
      return { state, changed: false };
    }

    const seen = [...state.seen_event_hashes, eventHash].slice(-MAX_EVENT_HASHES);
    const kinds = [...new Set([...state.activity_signal_kinds, signalKind])].sort();
    return {
      changed: true,
      state: {
        ...state,
        runtime,
        session_hash: sessionHash,
        checkpoint_state: "review_needed",
        activity_signal_kinds: kinds,
        activity_revision: state.activity_revision + 1,
        seen_event_hashes: seen,
        first_activity_at: state.first_activity_at || timestamp,
        last_activity_at: timestamp,
        availability: "available",
      },
    };
  });
}

export function notifyUnresolvedCheckpoint(options = {}) {
  const runtime = normalizeRuntime(options.runtime);
  if (!runtime) return unavailableNotification("unsupported_runtime");
  const sessionId = normalizeIdentifier(options.sessionId);
  if (!sessionId) return unavailableNotification("session_identity_unavailable");
  const boundaryKind = normalizeBoundary(options.boundaryKind);
  if (!boundaryKind) return unavailableNotification("boundary_unavailable");

  const scope = resolveScope(options);
  if (!scope.ok) return unavailableNotification(scope.reason);
  const currentSessionHash = hashValue("session", runtime, sessionId);
  const timestamp = nowIso(options);

  const result = mutateState(scope, options, (state) => {
    if (state.checkpoint_state !== "review_needed") {
      return { state, changed: false, notify: false };
    }
    if (!state.session_hash || state.session_hash === currentSessionHash) {
      return { state, changed: false, notify: false };
    }

    const notificationBoundary = hashValue(
      "notification",
      scope.repositoryHash,
      scope.worktreeHash,
      runtime,
      currentSessionHash,
      state.epoch_id,
      boundaryKind,
    );
    if (
      state.last_notified_boundary === notificationBoundary
      && state.last_notified_revision === state.activity_revision
    ) {
      return { state, changed: false, notify: false };
    }

    return {
      changed: true,
      notify: true,
      state: {
        ...state,
        last_notified_boundary: notificationBoundary,
        last_notified_revision: state.activity_revision,
        last_notified_at: timestamp,
      },
    };
  });

  if (result.availability !== "available") {
    return { ...result, notify: true, manual_checkpoint_required: true };
  }
  return { ...result, notify: Boolean(result.notify) };
}

export function resolveCheckpoint(options = {}) {
  const resolution = String(options.resolution || "").trim().replace("-", "_");
  if (!SUPPORTED_RESOLUTIONS.has(resolution)) return unavailable("unsupported_resolution");

  const promotionSourceRef = normalizePromotionSource(
    options.promotionSourceRef,
    resolution,
  );
  if (!promotionSourceRef.ok) return unavailable(promotionSourceRef.reason);

  const scope = resolveScope(options);
  if (!scope.ok) return unavailable(scope.reason);
  const timestamp = nowIso(options);

  return mutateState(scope, options, (state) => {
    if (state.checkpoint_state === "clean") {
      if (
        state.resolution === resolution
        && state.promotion_source_ref === promotionSourceRef.value
      ) {
        return { state, changed: false };
      }
      return {
        error: "no_unresolved_checkpoint",
      };
    }

    return {
      changed: true,
      state: {
        ...freshState(scope, timestamp),
        resolution,
        resolved_at: timestamp,
        promotion_source_ref: promotionSourceRef.value,
      },
    };
  });
}

export function checkpointHandoffPreflight(options = {}) {
  const status = checkpointStatus(options);
  if (status.availability !== "available") {
    return {
      availability: "unavailable",
      checkpoint_state: null,
      context_checkpoint: "unavailable / manual review required",
      allow_handoff: true,
      hard_block: false,
      manual_checkpoint_required: true,
      choices: ["checkpoint", "no_update", "continue_unresolved"],
    };
  }
  if (status.checkpoint_state === "review_needed") {
    return {
      availability: "available",
      checkpoint_state: "review_needed",
      context_checkpoint: "review_needed / unresolved",
      allow_handoff: true,
      hard_block: false,
      manual_checkpoint_required: false,
      choices: ["checkpoint", "no_update", "continue_unresolved"],
    };
  }
  return {
    availability: "available",
    checkpoint_state: "clean",
    context_checkpoint: "clean",
    allow_handoff: true,
    hard_block: false,
    manual_checkpoint_required: false,
    choices: [],
  };
}

function mutateState(scope, options, transform) {
  const loaded = loadCurrentState(scope, options);
  if (loaded.kind === "error") return unavailable(loaded.reason, scope);
  const candidates = loaded.kind === "present"
    ? [loaded.location]
    : stateLocations(scope, options.env || process.env);

  let lastReason = "state_write_failed";
  for (const location of candidates) {
    try {
      const outcome = withStateLock(location, options, () => {
        const current = readStateAt(location, scope, options);
        if (current.kind === "error") return { error: current.reason };
        const state = current.kind === "missing"
          ? freshState(scope, nowIso(options))
          : current.state;
        const transformed = transform(state);
        if (transformed.error) return transformed;
        if (transformed.changed) writeStateAt(location, transformed.state, options);
        return transformed;
      });

      if (outcome.error) return unavailable(outcome.error, scope);
      return {
        ...publicState(outcome.state, { changed: Boolean(outcome.changed) }),
        ...(Object.hasOwn(outcome, "notify") ? { notify: outcome.notify } : {}),
      };
    } catch (error) {
      lastReason = reasonForStorageError(error);
      if (loaded.kind === "present") break;
    }
  }
  return unavailable(lastReason, scope);
}

function resolveScope(options) {
  if (options.faults?.identity) return { ok: false, reason: "repository_identity_unavailable" };
  const cwd = String(options.cwd || process.cwd());
  const worktree = gitPath(cwd, ["rev-parse", "--show-toplevel"]);
  if (!worktree) return { ok: false, reason: "worktree_identity_unavailable" };
  const commonDirRaw = gitPath(cwd, ["rev-parse", "--path-format=absolute", "--git-common-dir"])
    || gitPath(cwd, ["rev-parse", "--git-common-dir"]);
  if (!commonDirRaw) return { ok: false, reason: "repository_identity_unavailable" };

  try {
    const worktreePath = fs.realpathSync(worktree);
    const commonDirPath = fs.realpathSync(
      path.isAbsolute(commonDirRaw) ? commonDirRaw : path.resolve(cwd, commonDirRaw),
    );
    return {
      ok: true,
      repositoryHash: hashValue("repository", commonDirPath),
      worktreeHash: hashValue("worktree", worktreePath),
      worktreePath,
    };
  } catch {
    return { ok: false, reason: "repository_identity_unavailable" };
  }
}

function gitPath(cwd, args) {
  try {
    const result = spawnSync("git", args, {
      cwd,
      encoding: "utf8",
      timeout: 1000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return result.status === 0 ? result.stdout.trim() : "";
  } catch {
    return "";
  }
}

function stateLocations(scope, env) {
  const stateHome = env.XDG_STATE_HOME
    ? String(env.XDG_STATE_HOME)
    : env.HOME
      ? path.join(String(env.HOME), ".local", "state")
      : "";
  const locations = [];
  if (path.isAbsolute(stateHome)) {
    locations.push(path.join(
      stateHome,
      "oh-my-ai",
      "context-checkpoint",
      scope.repositoryHash,
      scope.worktreeHash,
      STATE_FILE,
    ));
  }
  locations.push(path.join(scope.worktreePath, ".oh-my-ai", "state", STATE_FILE));
  return [...new Set(locations)];
}

function loadCurrentState(scope, options) {
  for (const location of stateLocations(scope, options.env || process.env)) {
    let exists;
    try {
      if (options.faults?.read) throw fault("state_read_failed");
      exists = fs.existsSync(location);
    } catch {
      return { kind: "error", reason: "state_read_failed" };
    }
    if (!exists) continue;
    const loaded = readStateAt(location, scope, options);
    return loaded.kind === "present" ? { ...loaded, location } : loaded;
  }
  return { kind: "missing" };
}

function readStateAt(location, scope, options) {
  try {
    if (options.faults?.read) throw fault("state_read_failed");
    if (!fs.existsSync(location)) return { kind: "missing" };
    ensureSafeLocation(location);
    const parsed = JSON.parse(fs.readFileSync(location, "utf8"));
    if (!validState(parsed, scope)) return { kind: "error", reason: "state_schema_mismatch" };
    return { kind: "present", state: parsed };
  } catch (error) {
    if (error.code === "ENOENT") return { kind: "missing" };
    return {
      kind: "error",
      reason: error instanceof SyntaxError ? "state_corrupt" : reasonForStorageError(error),
    };
  }
}

function validState(state, scope) {
  return state
    && state.schema_version === SCHEMA_VERSION
    && state.repository_hash === scope.repositoryHash
    && state.worktree_hash === scope.worktreeHash
    && ["clean", "review_needed"].includes(state.checkpoint_state)
    && state.availability === "available"
    && typeof state.epoch_id === "string"
    && Array.isArray(state.activity_signal_kinds)
    && state.activity_signal_kinds.every(kind => SUPPORTED_SIGNALS.has(kind))
    && Number.isInteger(state.activity_revision)
    && state.activity_revision >= 0
    && Array.isArray(state.seen_event_hashes)
    && state.seen_event_hashes.every(isHash)
    && (state.runtime === null || SUPPORTED_RUNTIMES.has(state.runtime))
    && (state.session_hash === null || isHash(state.session_hash))
    && (state.resolution === null || SUPPORTED_RESOLUTIONS.has(state.resolution))
    && (state.promotion_source_ref === null || isSanitizedReference(state.promotion_source_ref));
}

function freshState(scope, timestamp) {
  return {
    schema_version: SCHEMA_VERSION,
    repository_hash: scope.repositoryHash,
    worktree_hash: scope.worktreeHash,
    runtime: null,
    session_hash: null,
    epoch_id: crypto.randomUUID(),
    activity_signal_kinds: [],
    activity_revision: 0,
    seen_event_hashes: [],
    first_activity_at: null,
    last_activity_at: null,
    checkpoint_state: "clean",
    last_notified_boundary: null,
    last_notified_revision: null,
    last_notified_at: null,
    resolution: null,
    resolved_at: null,
    promotion_source_ref: null,
    availability: "available",
    created_at: timestamp,
  };
}

function withStateLock(location, options, callback) {
  if (options.faults?.lock) throw fault("state_lock_failed");
  fs.mkdirSync(path.dirname(location), { recursive: true, mode: 0o700 });
  ensureSafeLocation(location);
  const lockPath = `${location}.lock`;
  let locked = false;
  for (let attempt = 0; attempt < LOCK_ATTEMPTS; attempt += 1) {
    try {
      fs.mkdirSync(lockPath, { mode: 0o700 });
      locked = true;
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, LOCK_WAIT_MS);
    }
  }
  if (!locked) throw fault("state_lock_failed");
  try {
    return callback();
  } finally {
    try {
      fs.rmdirSync(lockPath);
    } catch {
      // A stale lock makes later updates unavailable rather than unsafe.
    }
  }
}

function writeStateAt(location, state, options) {
  if (options.faults?.write) throw fault("state_write_failed");
  fs.mkdirSync(path.dirname(location), { recursive: true, mode: 0o700 });
  ensureSafeLocation(location);
  const temporary = path.join(
    path.dirname(location),
    `.${path.basename(location)}.${process.pid}.${crypto.randomUUID()}.tmp`,
  );
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, "wx", 0o600);
    fs.writeFileSync(descriptor, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    if (options.faults?.rename) throw fault("atomic_rename_failed");
    fs.renameSync(temporary, location);
    fs.chmodSync(location, 0o600);
    try {
      const directory = fs.openSync(path.dirname(location), "r");
      fs.fsyncSync(directory);
      fs.closeSync(directory);
    } catch {
      // The atomic file replace is complete; directory fsync is best effort.
    }
  } catch (error) {
    if (descriptor !== undefined) {
      try { fs.closeSync(descriptor); } catch { /* already closed */ }
    }
    try { fs.unlinkSync(temporary); } catch { /* no temporary file */ }
    throw error;
  }
}

function ensureSafeLocation(location) {
  for (const candidate of [path.dirname(path.dirname(location)), path.dirname(location), location]) {
    try {
      if (fs.lstatSync(candidate).isSymbolicLink()) throw fault("unsafe_state_path");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
}

function publicState(state, extras = {}) {
  return {
    schema_version: state.schema_version,
    repository_hash: state.repository_hash,
    worktree_hash: state.worktree_hash,
    runtime: state.runtime,
    session_hash: state.session_hash,
    epoch_id: state.epoch_id,
    activity_signal_kinds: [...state.activity_signal_kinds],
    activity_revision: state.activity_revision,
    first_activity_at: state.first_activity_at,
    last_activity_at: state.last_activity_at,
    checkpoint_state: state.checkpoint_state,
    last_notified_boundary: state.last_notified_boundary,
    last_notified_at: state.last_notified_at,
    resolution: state.resolution,
    resolved_at: state.resolved_at,
    promotion_source_ref: state.promotion_source_ref,
    availability: state.availability,
    manual_checkpoint_required: false,
    ...extras,
  };
}

function unavailable(reason, scope = {}) {
  return {
    repository_hash: scope.repositoryHash || null,
    worktree_hash: scope.worktreeHash || null,
    checkpoint_state: null,
    resolution: null,
    availability: "unavailable",
    manual_checkpoint_required: true,
    changed: false,
    reason_code: reason,
  };
}

function unavailableNotification(reason) {
  return { ...unavailable(reason), notify: true };
}

function normalizeRuntime(value) {
  const runtime = String(value || "").trim();
  return SUPPORTED_RUNTIMES.has(runtime) ? runtime : "";
}

function normalizeIdentifier(value) {
  const identifier = String(value || "").trim();
  return identifier.length > 0 && identifier.length <= 512 ? identifier : "";
}

function normalizeBoundary(value) {
  const boundary = String(value || "").trim();
  return /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(boundary) ? boundary : "";
}

function normalizePromotionSource(value, resolution) {
  if (resolution === "no_update") {
    return value ? { ok: false, reason: "promotion_source_not_allowed" } : { ok: true, value: null };
  }
  const reference = String(value || "").trim();
  if (!reference) return { ok: false, reason: "promotion_source_required" };
  if (!isSanitizedReference(reference)) return { ok: false, reason: "unsafe_promotion_source" };
  return { ok: true, value: reference };
}

function isSanitizedReference(value) {
  return typeof value === "string"
    && value.length <= 160
    && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value)
    && !value.startsWith("/")
    && !value.split("/").includes("..")
    && !/secret|token|credential/i.test(value);
}

function isHash(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function hashValue(...parts) {
  return crypto.createHash("sha256").update(parts.join("\0")).digest("hex");
}

function nowIso(options) {
  const value = options.now instanceof Date ? options.now : new Date();
  return value.toISOString();
}

function fault(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function reasonForStorageError(error) {
  if (typeof error?.code === "string" && error.code.startsWith("state_")) return error.code;
  if (error?.code === "atomic_rename_failed") return "atomic_rename_failed";
  if (error?.code === "unsafe_state_path") return "unsafe_state_path";
  return "state_write_failed";
}
