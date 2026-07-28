import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const SCHEMA_VERSION = 2;
const LEGACY_SCHEMA_VERSION = 1;
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

  const selected = selectStateLocation(scope, options);
  if (selected.kind === "error") return unavailable(selected.reason, scope);
  const state = selected.kind === "missing"
    ? freshState(scope, nowIso(options))
    : selected.state;
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
    const epochIndex = state.unresolved_epochs.findIndex(
      epoch => epoch.runtime === runtime && epoch.session_hash === sessionHash,
    );
    const currentEpoch = epochIndex === -1 ? null : state.unresolved_epochs[epochIndex];
    if (currentEpoch?.seen_event_hashes.includes(eventHash)) {
      return {
        state,
        changed: false,
        focusEpochId: currentEpoch.epoch_id,
      };
    }

    const epoch = currentEpoch
      ? {
          ...currentEpoch,
          activity_signal_kinds: [...new Set([
            ...currentEpoch.activity_signal_kinds,
            signalKind,
          ])].sort(),
          activity_revision: currentEpoch.activity_revision + 1,
          seen_event_hashes: [...currentEpoch.seen_event_hashes, eventHash]
            .slice(-MAX_EVENT_HASHES),
          last_activity_at: timestamp,
        }
      : freshEpoch({
          epochId: state.next_epoch_id,
          runtime,
          sessionHash,
          eventHash,
          signalKind,
          timestamp,
        });
    const unresolvedEpochs = [...state.unresolved_epochs];
    if (epochIndex === -1) unresolvedEpochs.push(epoch);
    else unresolvedEpochs[epochIndex] = epoch;
    return {
      changed: true,
      focusEpochId: epoch.epoch_id,
      state: {
        ...state,
        next_epoch_id: epochIndex === -1 ? crypto.randomUUID() : state.next_epoch_id,
        unresolved_epochs: unresolvedEpochs,
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
    const eligibleEpochs = state.unresolved_epochs.filter(
      epoch => epoch.runtime === runtime && epoch.session_hash !== currentSessionHash,
    );
    if (eligibleEpochs.length === 0) {
      return { state, changed: false, notify: false };
    }

    let notify = false;
    const unresolvedEpochs = state.unresolved_epochs.map((epoch) => {
      if (epoch.runtime !== runtime || epoch.session_hash === currentSessionHash) return epoch;
      const notificationBoundary = hashValue(
        "notification",
        scope.repositoryHash,
        scope.worktreeHash,
        runtime,
        currentSessionHash,
        epoch.epoch_id,
        boundaryKind,
      );
      const existing = epoch.notification_boundaries.find(
        notification => notification.boundary_hash === notificationBoundary,
      );
      if (existing?.activity_revision === epoch.activity_revision) return epoch;
      notify = true;
      const notification = {
        boundary_hash: notificationBoundary,
        activity_revision: epoch.activity_revision,
        notified_at: timestamp,
      };
      return {
        ...epoch,
        notification_boundaries: [
          ...epoch.notification_boundaries.filter(
            candidate => candidate.boundary_hash !== notificationBoundary,
          ),
          notification,
        ],
      };
    });
    return {
      changed: notify,
      notify,
      prior_unresolved_count: eligibleEpochs.length,
      state: {
        ...state,
        unresolved_epochs: unresolvedEpochs,
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
  const epochId = normalizeOptionalEpochId(options.epochId);
  if (!epochId.ok) return unavailable(epochId.reason);

  const scope = resolveScope(options);
  if (!scope.ok) return unavailable(scope.reason);
  const timestamp = nowIso(options);

  return mutateState(scope, options, (state) => {
    if (state.unresolved_epochs.length === 0) {
      if (
        state.last_resolution?.resolution === resolution
        && state.last_resolution?.promotion_source_ref === promotionSourceRef.value
        && (!epochId.value || state.last_resolution?.epoch_id === epochId.value)
      ) {
        return { state, changed: false };
      }
      return {
        error: "no_unresolved_checkpoint",
      };
    }

    if (state.unresolved_epochs.length > 1 && !epochId.value) {
      return { error: "multiple_unresolved_checkpoints" };
    }
    const targetIndex = epochId.value
      ? state.unresolved_epochs.findIndex(epoch => epoch.epoch_id === epochId.value)
      : 0;
    if (targetIndex === -1) return { error: "checkpoint_epoch_not_found" };
    const target = state.unresolved_epochs[targetIndex];
    const unresolvedEpochs = state.unresolved_epochs.filter((_, index) => index !== targetIndex);

    return {
      changed: true,
      resolved_epoch_id: target.epoch_id,
      state: {
        ...state,
        unresolved_epochs: unresolvedEpochs,
        last_resolution: {
          epoch_id: target.epoch_id,
          resolution,
          resolved_at: timestamp,
          promotion_source_ref: promotionSourceRef.value,
        },
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
      unresolved_count: null,
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
      unresolved_count: status.unresolved_count,
      choices: ["checkpoint", "no_update", "continue_unresolved"],
    };
  }
  return {
    availability: "available",
    checkpoint_state: "clean",
    unresolved_count: 0,
    context_checkpoint: "clean",
    allow_handoff: true,
    hard_block: false,
    manual_checkpoint_required: false,
    choices: [],
  };
}

function mutateState(scope, options, transform) {
  const selected = selectStateLocation(scope, options);
  if (selected.kind === "error") return unavailable(selected.reason, scope);
  try {
    const outcome = withStateLock(selected.location, options, () => {
      const current = readStateAt(selected.location, scope, options);
      if (current.kind === "error") return { error: current.reason };
      const state = current.kind === "missing"
        ? freshState(scope, nowIso(options))
        : current.state;
      const transformed = transform(state);
      if (transformed.error) return transformed;
      if (transformed.changed) writeStateAt(selected.location, transformed.state, options);
      return transformed;
    });

    if (outcome.error) return unavailable(outcome.error, scope);
    const {
      state,
      changed,
      focusEpochId,
      ...outcomeExtras
    } = outcome;
    return {
      ...publicState(state, {
        changed: Boolean(changed),
        focusEpochId,
      }),
      ...outcomeExtras,
    };
  } catch (error) {
    return unavailable(reasonForStorageError(error), scope);
  }
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

function selectStateLocation(scope, options) {
  const loaded = loadCurrentState(scope, options);
  if (loaded.kind === "error") return loaded;
  const candidates = loaded.kind === "present"
    ? [loaded.location]
    : stateLocations(scope, options.env || process.env);
  let lastReason = "state_write_failed";
  for (const location of candidates) {
    try {
      probeStateLocation(location, options);
      return loaded.kind === "present"
        ? loaded
        : { kind: "missing", location };
    } catch (error) {
      lastReason = reasonForStorageError(error);
      if (loaded.kind === "present") break;
    }
  }
  return { kind: "error", reason: lastReason };
}

function readStateAt(location, scope, options) {
  try {
    if (options.faults?.read) throw fault("state_read_failed");
    if (!fs.existsSync(location)) return { kind: "missing" };
    ensureSafeLocation(location);
    const parsed = JSON.parse(fs.readFileSync(location, "utf8"));
    const state = normalizeState(parsed, scope);
    if (!state) return { kind: "error", reason: "state_schema_mismatch" };
    return { kind: "present", state };
  } catch (error) {
    if (error.code === "ENOENT") return { kind: "missing" };
    return {
      kind: "error",
      reason: error instanceof SyntaxError ? "state_corrupt" : reasonForStorageError(error),
    };
  }
}

function normalizeState(state, scope) {
  if (validState(state, scope)) return state;
  if (!validLegacyState(state, scope)) return null;
  const migrated = migrateLegacyState(state, scope);
  return validState(migrated, scope) ? migrated : null;
}

function validState(state, scope) {
  return state
    && state.schema_version === SCHEMA_VERSION
    && state.repository_hash === scope.repositoryHash
    && state.worktree_hash === scope.worktreeHash
    && state.availability === "available"
    && isOpaqueEpochId(state.next_epoch_id)
    && Array.isArray(state.unresolved_epochs)
    && state.unresolved_epochs.every(validEpoch)
    && new Set(state.unresolved_epochs.map(epoch => epoch.epoch_id)).size
      === state.unresolved_epochs.length
    && validLastResolution(state.last_resolution);
}

function validLegacyState(state, scope) {
  return state
    && state.schema_version === LEGACY_SCHEMA_VERSION
    && state.repository_hash === scope.repositoryHash
    && state.worktree_hash === scope.worktreeHash
    && ["clean", "review_needed"].includes(state.checkpoint_state)
    && state.availability === "available"
    && isOpaqueEpochId(state.epoch_id)
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

function validEpoch(epoch) {
  return epoch
    && isOpaqueEpochId(epoch.epoch_id)
    && SUPPORTED_RUNTIMES.has(epoch.runtime)
    && isHash(epoch.session_hash)
    && Array.isArray(epoch.activity_signal_kinds)
    && epoch.activity_signal_kinds.every(kind => SUPPORTED_SIGNALS.has(kind))
    && Number.isInteger(epoch.activity_revision)
    && epoch.activity_revision >= 1
    && Array.isArray(epoch.seen_event_hashes)
    && epoch.seen_event_hashes.every(isHash)
    && typeof epoch.first_activity_at === "string"
    && typeof epoch.last_activity_at === "string"
    && Array.isArray(epoch.notification_boundaries)
    && epoch.notification_boundaries.every(validNotificationBoundary);
}

function validNotificationBoundary(notification) {
  return notification
    && isHash(notification.boundary_hash)
    && Number.isInteger(notification.activity_revision)
    && notification.activity_revision >= 1
    && typeof notification.notified_at === "string";
}

function validLastResolution(resolution) {
  return resolution === null || (
    resolution
    && (resolution.epoch_id === null || isOpaqueEpochId(resolution.epoch_id))
    && SUPPORTED_RESOLUTIONS.has(resolution.resolution)
    && typeof resolution.resolved_at === "string"
    && (
      resolution.promotion_source_ref === null
      || isSanitizedReference(resolution.promotion_source_ref)
    )
  );
}

function freshState(scope, timestamp) {
  return {
    schema_version: SCHEMA_VERSION,
    repository_hash: scope.repositoryHash,
    worktree_hash: scope.worktreeHash,
    next_epoch_id: crypto.randomUUID(),
    unresolved_epochs: [],
    last_resolution: null,
    availability: "available",
    created_at: timestamp,
  };
}

function freshEpoch({
  epochId,
  runtime,
  sessionHash,
  eventHash,
  signalKind,
  timestamp,
}) {
  return {
    epoch_id: epochId,
    runtime,
    session_hash: sessionHash,
    activity_signal_kinds: [signalKind],
    activity_revision: 1,
    seen_event_hashes: [eventHash],
    first_activity_at: timestamp,
    last_activity_at: timestamp,
    notification_boundaries: [],
  };
}

function migrateLegacyState(state, scope) {
  const timestamp = state.created_at || state.first_activity_at || nowIso({});
  const migrated = freshState(scope, timestamp);
  if (state.checkpoint_state === "review_needed" && state.runtime && state.session_hash) {
    migrated.unresolved_epochs = [{
      epoch_id: state.epoch_id,
      runtime: state.runtime,
      session_hash: state.session_hash,
      activity_signal_kinds: [...state.activity_signal_kinds],
      activity_revision: state.activity_revision,
      seen_event_hashes: [...state.seen_event_hashes],
      first_activity_at: state.first_activity_at || timestamp,
      last_activity_at: state.last_activity_at || timestamp,
      notification_boundaries: (
        isHash(state.last_notified_boundary)
        && Number.isInteger(state.last_notified_revision)
        && typeof state.last_notified_at === "string"
      )
        ? [{
            boundary_hash: state.last_notified_boundary,
            activity_revision: state.last_notified_revision,
            notified_at: state.last_notified_at,
          }]
        : [],
    }];
  } else {
    migrated.next_epoch_id = state.epoch_id;
  }
  if (state.resolution) {
    migrated.last_resolution = {
      epoch_id: null,
      resolution: state.resolution,
      resolved_at: state.resolved_at || timestamp,
      promotion_source_ref: state.promotion_source_ref,
    };
  }
  return migrated;
}

function probeStateLocation(location, options) {
  fs.mkdirSync(path.dirname(location), { recursive: true, mode: 0o700 });
  ensureSafeLocation(location);
  const suffix = `${process.pid}.${crypto.randomUUID()}`;
  const temporary = path.join(
    path.dirname(location),
    `.${path.basename(location)}.${suffix}.capability-probe.tmp`,
  );
  const renamed = path.join(
    path.dirname(location),
    `.${path.basename(location)}.${suffix}.capability-probe.ready`,
  );
  let descriptor;
  try {
    if (options.faults?.probeWrite) throw fault("state_write_failed");
    descriptor = fs.openSync(temporary, "wx", 0o600);
    fs.writeFileSync(descriptor, "context-checkpoint-capability-probe\n", "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    if (options.faults?.probeRename) throw fault("atomic_rename_failed");
    fs.renameSync(temporary, renamed);
    fs.unlinkSync(renamed);
  } catch (error) {
    if (descriptor !== undefined) {
      try { fs.closeSync(descriptor); } catch { /* already closed */ }
    }
    try { fs.unlinkSync(temporary); } catch { /* no temporary probe */ }
    try { fs.unlinkSync(renamed); } catch { /* no renamed probe */ }
    throw error;
  }
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
  const focusEpoch = extras.focusEpochId
    ? state.unresolved_epochs.find(epoch => epoch.epoch_id === extras.focusEpochId) || null
    : state.unresolved_epochs.length === 1
      ? state.unresolved_epochs[0]
      : null;
  const lastNotification = focusEpoch?.notification_boundaries.at(-1) || null;
  const {
    focusEpochId: _focusEpochId,
    ...publicExtras
  } = extras;
  return {
    schema_version: state.schema_version,
    repository_hash: state.repository_hash,
    worktree_hash: state.worktree_hash,
    runtime: focusEpoch?.runtime || null,
    session_hash: focusEpoch?.session_hash || null,
    epoch_id: focusEpoch?.epoch_id
      || (state.unresolved_epochs.length === 0 ? state.next_epoch_id : null),
    activity_signal_kinds: focusEpoch ? [...focusEpoch.activity_signal_kinds] : [],
    activity_revision: focusEpoch?.activity_revision ?? 0,
    first_activity_at: focusEpoch?.first_activity_at || null,
    last_activity_at: focusEpoch?.last_activity_at || null,
    checkpoint_state: state.unresolved_epochs.length > 0 ? "review_needed" : "clean",
    unresolved_count: state.unresolved_epochs.length,
    unresolved_epochs: state.unresolved_epochs.map(publicEpoch),
    last_notified_boundary: lastNotification?.boundary_hash || null,
    last_notified_at: lastNotification?.notified_at || null,
    resolution: state.last_resolution?.resolution || null,
    resolved_at: state.last_resolution?.resolved_at || null,
    promotion_source_ref: state.last_resolution?.promotion_source_ref || null,
    availability: state.availability,
    manual_checkpoint_required: false,
    ...publicExtras,
  };
}

function publicEpoch(epoch) {
  const lastNotification = epoch.notification_boundaries.at(-1) || null;
  return {
    epoch_id: epoch.epoch_id,
    runtime: epoch.runtime,
    session_hash: epoch.session_hash,
    activity_signal_kinds: [...epoch.activity_signal_kinds],
    activity_revision: epoch.activity_revision,
    first_activity_at: epoch.first_activity_at,
    last_activity_at: epoch.last_activity_at,
    last_notified_boundary: lastNotification?.boundary_hash || null,
    last_notified_at: lastNotification?.notified_at || null,
  };
}

function unavailable(reason, scope = {}) {
  return {
    repository_hash: scope.repositoryHash || null,
    worktree_hash: scope.worktreeHash || null,
    checkpoint_state: null,
    unresolved_count: null,
    unresolved_epochs: [],
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

function normalizeOptionalEpochId(value) {
  if (value === undefined || value === null || value === "") {
    return { ok: true, value: null };
  }
  const epochId = String(value).trim();
  return isOpaqueEpochId(epochId)
    ? { ok: true, value: epochId }
    : { ok: false, reason: "invalid_checkpoint_epoch" };
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

function isOpaqueEpochId(value) {
  return typeof value === "string"
    && value.length <= 160
    && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value);
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
