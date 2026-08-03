const VERSION = "phr1";
const SECRET_ALGORITHM = "hmac-sha256";
const KINDS = new Set(["session", "repository", "worktree"]);
const KEY_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const DIGEST_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const NAMESPACES = Object.freeze({
  session: "pending-handoff-session",
  repository: "pending-handoff-repository",
  worktree: "pending-handoff-worktree",
});
const REMOTE_SET_FIELDS = Object.freeze(["kind", "remotes"]);
const REMOTE_FIELDS = Object.freeze(["host", "port", "path"]);
const LOCAL_COMMON_DIR_FIELDS = Object.freeze([
  "kind",
  "verified_canonical_common_dir",
]);

export function deriveSourceSessionIdentity(input) {
  if (!isPlainObject(input)) return failure("identity_input_invalid");
  const context = validateSecretContext(input.secret_context);
  if (!context.ok) return failure(context.reason);

  const runtimeId = normalizeRuntimeId(input.runtime_id);
  if (!runtimeId || !isNonEmptyString(input.raw_session_id)) {
    return failure("identity_input_invalid");
  }

  return deriveIdentity({
    kind: "session",
    keyId: context.keyId,
    secretContext: input.secret_context,
    preimage: [VERSION, runtimeId, input.raw_session_id],
  });
}

export function deriveRepositoryIdentity(input) {
  if (!isPlainObject(input)) return failure("identity_input_invalid");
  const context = validateSecretContext(input.secret_context);
  if (!context.ok) return failure(context.reason);

  const evidence = normalizeRepositoryEvidence(input.repository_evidence);
  if (!evidence) return failure("identity_input_invalid");

  return deriveIdentity({
    kind: "repository",
    keyId: context.keyId,
    secretContext: input.secret_context,
    preimage: [VERSION, ...evidence],
  });
}

export function deriveWorktreeIdentity(input) {
  if (!isPlainObject(input)) return failure("identity_input_invalid");
  const context = validateSecretContext(input.secret_context);
  if (!context.ok) return failure(context.reason);

  const repository = validateOpaqueIdentity(input.repository_identity);
  if (!repository.ok || repository.kind !== "repository") {
    return failure("identity_format_invalid");
  }
  if (repository.key_id !== context.keyId) {
    return failure("identity_namespace_mismatch");
  }
  if (!isSafeAbsolutePath(input.verified_canonical_root)) {
    return failure("identity_input_invalid");
  }

  return deriveIdentity({
    kind: "worktree",
    keyId: context.keyId,
    secretContext: input.secret_context,
    preimage: [VERSION, input.repository_identity, input.verified_canonical_root],
  });
}

export function validateOpaqueIdentity(opaqueIdentity) {
  if (typeof opaqueIdentity !== "string") return failure("identity_format_invalid");
  const parts = opaqueIdentity.split(".");
  if (parts.length !== 4) return failure("identity_format_invalid");
  const [version, kind, keyId, digest] = parts;
  if (
    version !== VERSION
    || !KINDS.has(kind)
    || !validKeyId(keyId)
    || !DIGEST_PATTERN.test(digest)
  ) {
    return failure("identity_format_invalid");
  }
  return { ok: true, version, kind, key_id: keyId };
}

export function compareIdentityScope(input) {
  if (!isPlainObject(input) || !isPlainObject(input.source) || !isPlainObject(input.current)) {
    return scopeUnavailable("session_identity_unknown");
  }

  const sourceSession = validateKind(input.source.session_identity, "session");
  const currentSession = validateKind(input.current.session_identity, "session");
  if (!sourceSession || !currentSession) return scopeUnavailable("session_identity_unknown");
  if (!sameNamespace(sourceSession, currentSession)) {
    return scopeUnavailable("identity_namespace_mismatch");
  }
  const sessionEqual = safeEqual(
    input.safe_equal,
    input.source.session_identity,
    input.current.session_identity,
  );
  if (sessionEqual === null) return scopeUnavailable("session_identity_unknown");
  if (sessionEqual) return scopeDenied("not_eligible", "same_session");

  const sourceRepository = validateKind(input.source.repository_identity, "repository");
  const currentRepository = validateKind(input.current.repository_identity, "repository");
  if (!sourceRepository || !currentRepository) {
    return scopeUnavailable("repository_identity_unknown");
  }
  if (
    !sameNamespace(sourceRepository, currentRepository)
    || !sameKeyId(sourceSession, sourceRepository)
    || !sameKeyId(currentSession, currentRepository)
  ) {
    return scopeUnavailable("identity_namespace_mismatch");
  }
  const repositoryEqual = safeEqual(
    input.safe_equal,
    input.source.repository_identity,
    input.current.repository_identity,
  );
  if (repositoryEqual === null) return scopeUnavailable("repository_identity_unknown");
  if (!repositoryEqual) return scopeDenied("manual_resume", "repository_mismatch");

  const sourceWorktree = validateKind(input.source.worktree_identity, "worktree");
  const currentWorktree = validateKind(input.current.worktree_identity, "worktree");
  if (!sourceWorktree || !currentWorktree) {
    return scopeUnavailable("worktree_identity_unknown");
  }
  if (
    !sameNamespace(sourceWorktree, currentWorktree)
    || !sameKeyId(sourceRepository, sourceWorktree)
    || !sameKeyId(currentRepository, currentWorktree)
  ) {
    return scopeUnavailable("identity_namespace_mismatch");
  }
  const worktreeEqual = safeEqual(
    input.safe_equal,
    input.source.worktree_identity,
    input.current.worktree_identity,
  );
  if (worktreeEqual === null) return scopeUnavailable("worktree_identity_unknown");
  if (!worktreeEqual) return scopeDenied("manual_resume", "worktree_mismatch");

  return {
    gate: "identity_scope",
    allowed: true,
    outcome: "scope_verified",
  };
}

function validateSecretContext(value) {
  if (
    !isPlainObject(value)
    || value.algorithm !== SECRET_ALGORITHM
    || typeof value.derive !== "function"
  ) {
    return failure("identity_digest_unavailable");
  }
  const keyId = validKeyId(value.keyId);
  return keyId
    ? { ok: true, keyId }
    : failure("identity_key_id_invalid");
}

function deriveIdentity({ kind, keyId, secretContext, preimage }) {
  let digest;
  try {
    digest = secretContext.derive({
      namespace: NAMESPACES[kind],
      canonicalInput: JSON.stringify(preimage),
    });
  } catch {
    return failure("identity_digest_unavailable");
  }
  if (typeof digest !== "string" || !DIGEST_PATTERN.test(digest)) {
    return failure("identity_digest_invalid");
  }
  return { ok: true, identity: `${VERSION}.${kind}.${keyId}.${digest}` };
}

function normalizeRuntimeId(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.replace(/[A-Z]/g, character => character.toLowerCase());
}

function normalizeRepositoryEvidence(value) {
  if (!isPlainObject(value)) return null;
  if (value.kind === "remote-set") return normalizeRemoteSet(value);
  if (value.kind === "local-common-dir") return normalizeLocalCommonDir(value);
  return null;
}

function normalizeRemoteSet(value) {
  if (
    !hasExactFields(value, REMOTE_SET_FIELDS)
    || !Array.isArray(value.remotes)
    || value.remotes.length === 0
  ) {
    return null;
  }

  const unique = new Map();
  for (const remote of value.remotes) {
    const normalized = normalizeRemote(remote);
    if (!normalized) return null;
    const serialized = JSON.stringify(normalized);
    unique.set(serialized, normalized);
  }
  const remotes = [...unique.entries()]
    .sort(([left], [right]) => lexicalCompare(left, right))
    .map(([, remote]) => remote);
  return ["remote-set", remotes];
}

function normalizeRemote(value) {
  if (!isPlainObject(value) || !hasExactFields(value, REMOTE_FIELDS)) return null;
  if (!isSafeRemoteField(value.host) || !isSafeRemoteField(value.path)) return null;
  if (value.host.includes("/") || value.host.includes("\\")) return null;
  if (value.path.includes("\\")) return null;
  if (
    value.port !== null
    && (!Number.isInteger(value.port) || value.port < 1 || value.port > 65_535)
  ) {
    return null;
  }

  const host = value.host.toLowerCase();
  let remotePath = value.path.replace(/^\/+|\/+$/g, "");
  if (remotePath.endsWith(".git")) remotePath = remotePath.slice(0, -4);
  if (host.length === 0 || remotePath.length === 0) return null;
  return [host, value.port, remotePath];
}

function normalizeLocalCommonDir(value) {
  if (!hasExactFields(value, LOCAL_COMMON_DIR_FIELDS)) return null;
  return isSafeAbsolutePath(value.verified_canonical_common_dir)
    ? ["local-common-dir", value.verified_canonical_common_dir]
    : null;
}

function isSafeRemoteField(value) {
  return (
    typeof value === "string"
    && value.length > 0
    && value === value.trim()
    && !value.includes("\0")
    && !value.includes("@")
    && !value.includes("://")
    && !/[?#]/.test(value)
  );
}

function isSafeAbsolutePath(value) {
  return (
    typeof value === "string"
    && value.length > 0
    && value === value.trim()
    && value.startsWith("/")
    && !value.includes("\0")
  );
}

function validateKind(value, expectedKind) {
  const validated = validateOpaqueIdentity(value);
  return validated.ok && validated.kind === expectedKind ? validated : null;
}

function sameNamespace(left, right) {
  return left.version === right.version && left.kind === right.kind && sameKeyId(left, right);
}

function sameKeyId(left, right) {
  return left.key_id === right.key_id;
}

function safeEqual(safeEqualDependency, left, right) {
  if (typeof safeEqualDependency !== "function") return null;
  try {
    const result = safeEqualDependency(left, right);
    return typeof result === "boolean" ? result : null;
  } catch {
    return null;
  }
}

function validKeyId(value) {
  return typeof value === "string" && KEY_ID_PATTERN.test(value) ? value : null;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function hasExactFields(value, fields) {
  const keys = Object.keys(value);
  return keys.length === fields.length && fields.every(field => Object.hasOwn(value, field));
}

function lexicalCompare(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
}

function scopeDenied(outcome, reasonCode) {
  return {
    gate: "identity_scope",
    allowed: false,
    outcome,
    reason_code: reasonCode,
  };
}

function scopeUnavailable(reasonCode) {
  return scopeDenied("unavailable", reasonCode);
}

function failure(reason) {
  return { ok: false, reason };
}
