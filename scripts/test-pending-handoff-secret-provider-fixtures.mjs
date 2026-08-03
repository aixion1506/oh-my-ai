import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  compareIdentityScope,
  deriveRepositoryIdentity,
  deriveSourceSessionIdentity,
  deriveWorktreeIdentity,
} from "./lib/pending-handoff-identity.mjs";
import { createIdentitySecurityDependencies } from "./lib/pending-handoff-secret-provider.mjs";

const PURPOSE = "pending-handoff-identity";
const RAW_SECRET_MARKER = "RAW_SECRET_MARKER";
const RAW_SESSION_MARKER = "RAW_SESSION_MARKER";
const RAW_REPOSITORY_MARKER = "RAW_REPOSITORY_MARKER";
const RAW_WORKTREE_MARKER = "RAW_WORKTREE_MARKER";
const RAW_EXCEPTION_MARKER = "RAW_EXCEPTION_MARKER";
let tests = 0;

function test(name, operation) {
  operation();
  tests += 1;
  process.stdout.write(`PASS ${name}\n`);
}

function frozen(fn) {
  return Object.freeze(fn);
}

function digestFor({ key_id, purpose, bytes }) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let state = 2_166_136_261;
  for (const part of [key_id, purpose, ...bytes]) {
    for (const character of String(part)) {
      state ^= character.charCodeAt(0);
      state = Math.imul(state, 16_777_619) >>> 0;
    }
  }
  return Array.from({ length: 43 }, () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return alphabet[(state >>> 0) % alphabet.length];
  }).join("");
}

function provider(overrides = {}) {
  const values = {
    version: "phr-secret-provider-v1",
    current_key_id: "current_key",
    verification_key_ids: Object.freeze(["current_key", "previous_key"]),
    keyed_digest: frozen(input => digestFor(input)),
    safe_equal: frozen((left, right) => left === right),
    ...overrides,
  };
  return Object.freeze(values);
}

function build(overrides = {}) {
  return createIdentitySecurityDependencies(provider(overrides));
}

function assertFailure(result, reason) {
  assert.deepEqual(result.ok, false);
  assert.equal(result.reason, reason);
  assertExactOwnKeys(result, ["ok", "reason", "metadata"]);
  assert.ok(Reflect.ownKeys(result.metadata).every(key => [
    "operation",
    "provider_version_present",
    "provider_version_supported",
    "key_id_present",
    "verification_key_count",
  ].includes(key)));
  assert.equal(Object.prototype.hasOwnProperty.call(result.metadata ?? {}, "raw"), false);
}

function assertThrowsCode(operation, code) {
  assert.throws(operation, error => (
    error?.name === "SecretProviderError"
    && error?.code === code
    && Object.isFrozen(error)
    && Object.isFrozen(error.metadata)
    && Object.keys(error).every(key => ["name", "code", "metadata"].includes(key))
  ));
}

function digest(entry, overrides = {}) {
  return entry.keyed_digest({
    key_id: entry.key_id,
    purpose: PURPOSE,
    bytes: new Uint8Array([1, 2, 3]),
    ...overrides,
  });
}

function assertExactOwnKeys(value, expectedKeys) {
  assert.deepEqual(Reflect.ownKeys(value), expectedKeys);
}

function assertBundleShape(result) {
  assert.equal(result.ok, true);
  assertExactOwnKeys(result, ["ok", "value"]);
  assertExactOwnKeys(result.value, ["current", "verification", "safe_equal"]);
  assertExactOwnKeys(result.value.current, ["key_id", "keyed_digest"]);
  for (const entry of result.value.verification) {
    assertExactOwnKeys(entry, ["key_id", "keyed_digest"]);
  }
}

function assertOriginalReferencesHidden(bundle, originalProvider) {
  const forbidden = [
    originalProvider,
    originalProvider.keyed_digest,
    originalProvider.safe_equal,
    originalProvider.verification_key_ids,
  ];
  const seen = new Set();
  const visit = value => {
    if ((typeof value !== "object" && typeof value !== "function") || value === null || seen.has(value)) return;
    assert.equal(forbidden.includes(value), false);
    seen.add(value);
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor && "value" in descriptor) visit(descriptor.value);
    }
  };
  visit(bundle);
}

function assertDigestProviderConformance(bundle) {
  assert.equal(digest(bundle.current), digest(bundle.current));
  assert.notEqual(digest(bundle.current), digest(bundle.current, { bytes: new Uint8Array([1, 2, 4]) }));
  if (bundle.verification.length === 2) {
    assert.notEqual(digest(bundle.current), digest(bundle.verification[1]));
  }
}

function assertConformanceFailure(result) {
  assert.equal(result.ok, true);
  assert.throws(() => assertDigestProviderConformance(result.value), assert.AssertionError);
}

function session(entry, rawSession = "session-001") {
  return deriveSourceSessionIdentity({
    runtime_id: "codex",
    raw_session_id: rawSession,
    key_id: entry.key_id,
    keyed_digest: entry.keyed_digest,
  });
}

function repository(entry) {
  return deriveRepositoryIdentity({
    repository_evidence: { host: "github.com", path: "aixion1506/oh-my-ai" },
    key_id: entry.key_id,
    keyed_digest: entry.keyed_digest,
  });
}

function worktree(entry, repositoryIdentity) {
  return deriveWorktreeIdentity({
    repository_identity: repositoryIdentity,
    verified_canonical_root: "/Users/rani/work/Github/oh-my-ai-rpl-26",
    key_id: entry.key_id,
    keyed_digest: entry.keyed_digest,
  });
}

test("Group 1 provider shape rejects non-exact reflection-safe objects", () => {
  const extra = Object.freeze({ ...provider(), extra: true });
  const symbol = Symbol("unexpected");
  const withSymbol = Object.freeze({ ...provider(), [symbol]: true });
  const missing = Object.freeze({
    version: "phr-secret-provider-v1",
    current_key_id: "current_key",
    verification_key_ids: Object.freeze(["current_key"]),
    keyed_digest: frozen(input => digestFor(input)),
  });
  const getter = {};
  Object.defineProperties(getter, {
    version: { value: "phr-secret-provider-v1", enumerable: true },
    current_key_id: { value: "current_key", enumerable: true },
    verification_key_ids: { value: Object.freeze(["current_key"]), enumerable: true },
    keyed_digest: { value: frozen(input => digestFor(input)), enumerable: true },
    safe_equal: { get: () => frozen((left, right) => left === right), enumerable: true },
  });
  Object.freeze(getter);
  const setter = { ...provider() };
  Object.defineProperty(setter, "safe_equal", { set: () => {}, enumerable: true });
  Object.freeze(setter);
  const nonEnumerable = { ...provider() };
  Object.defineProperty(nonEnumerable, "version", { value: "phr-secret-provider-v1", enumerable: false });
  Object.freeze(nonEnumerable);
  const custom = Object.freeze(Object.assign(Object.create(null), provider()));
  const trapping = new Proxy(provider(), { ownKeys() { throw new Error(RAW_EXCEPTION_MARKER); } });

  for (const value of [extra, withSymbol, missing, getter, setter, nonEnumerable, custom, trapping, null]) {
    assertFailure(createIdentitySecurityDependencies(value), "secret_provider_invalid");
  }
});

test("Group 2 builds a static-only frozen non-alias bundle with exact safe shapes", () => {
  const unfrozenProvider = { ...provider() };
  const unfrozenKeys = provider({ verification_key_ids: ["current_key"] });
  const unfrozenDigest = provider({ keyed_digest: digestFor });
  const unfrozenCompare = provider({ safe_equal: (left, right) => left === right });
  const digestToJson = frozen(Object.assign(input => digestFor(input), { toJSON: () => RAW_SECRET_MARKER }));
  const compareToJson = frozen(Object.assign((left, right) => left === right, { toJSON: () => RAW_SECRET_MARKER }));
  for (const value of [
    unfrozenProvider,
    unfrozenKeys,
    unfrozenDigest,
    unfrozenCompare,
    provider({ keyed_digest: digestToJson }),
    provider({ safe_equal: compareToJson }),
  ]) {
    assertFailure(createIdentitySecurityDependencies(value), "secret_provider_invalid");
  }

  let digestCalls = 0;
  let compareCalls = 0;
  const rawDigest = frozen(input => {
    digestCalls += 1;
    return digestFor(input);
  });
  const rawCompare = frozen((left, right) => {
    compareCalls += 1;
    return left === right;
  });
  const original = provider({ keyed_digest: rawDigest, safe_equal: rawCompare });
  const result = createIdentitySecurityDependencies(original);
  assertBundleShape(result);
  assert.equal(digestCalls, 0);
  assert.equal(compareCalls, 0);
  const bundle = result.value;
  assert.equal(Object.isFrozen(bundle), true);
  assert.equal(Object.isFrozen(bundle.current), true);
  assert.equal(Object.isFrozen(bundle.verification), true);
  assert.ok(bundle.verification.every(Object.isFrozen));
  assert.ok(bundle.verification.every(entry => Object.isFrozen(entry.keyed_digest)));
  assert.equal(Object.isFrozen(bundle.safe_equal), true);
  assert.equal(bundle.verification[0], bundle.current);
  assert.notEqual(bundle, original);
  assert.notEqual(bundle.current.keyed_digest, original.keyed_digest);
  assert.notEqual(bundle.safe_equal, original.safe_equal);
  assertOriginalReferencesHidden(bundle, original);
  assert.equal(JSON.stringify(bundle).includes(RAW_SECRET_MARKER), false);

  const next = createIdentitySecurityDependencies(original);
  assert.notEqual(result, next);
  const firstFailure = build({ version: "unsupported" });
  const nextFailure = build({ version: "unsupported" });
  assert.notEqual(firstFailure, nextFailure);
  assert.notEqual(firstFailure.metadata, nextFailure.metadata);
});

test("Group 3 accepts only the supported provider version without exposing raw versions", () => {
  assert.equal(build().ok, true);
  const unsupported = build({ version: "RAW_VERSION_MARKER" });
  assertFailure(unsupported, "secret_provider_version_unsupported");
  assert.equal(JSON.stringify(unsupported).includes("RAW_VERSION_MARKER"), false);
  const missing = Object.freeze({
    current_key_id: "current_key",
    verification_key_ids: Object.freeze(["current_key"]),
    keyed_digest: frozen(input => digestFor(input)),
    safe_equal: frozen((left, right) => left === right),
  });
  assertFailure(createIdentitySecurityDependencies(missing), "secret_provider_invalid");
});

test("Group 4 validates current-first key lifecycle and fails unknown keys closed", () => {
  assert.equal(build({ current_key_id: "a", verification_key_ids: Object.freeze(["a"]) }).ok, true);
  const longest = "a".repeat(64);
  assert.equal(build({ current_key_id: longest, verification_key_ids: Object.freeze([longest]) }).ok, true);
  for (const value of [
    provider({ current_key_id: "", verification_key_ids: Object.freeze([""]) }),
    provider({ current_key_id: "a".repeat(65), verification_key_ids: Object.freeze(["a".repeat(65)]) }),
    provider({ current_key_id: "bad.key" }),
    provider({ verification_key_ids: Object.freeze([]) }),
    provider({ verification_key_ids: Object.freeze(["previous_key", "current_key"]) }),
    provider({ verification_key_ids: Object.freeze(["current_key", "previous_key", "third_key"]) }),
    provider({ verification_key_ids: Object.freeze(["current_key", "current_key"]) }),
    provider({ verification_key_ids: Object.freeze(["current_key", "bad.key"]) }),
  ]) {
    assert.ok(["secret_key_id_invalid", "secret_verification_keys_invalid"].includes(
      createIdentitySecurityDependencies(value).reason,
    ));
  }
  const bundle = build().value;
  assert.equal(bundle.current.key_id, "current_key");
  assert.deepEqual(bundle.verification.map(entry => entry.key_id), ["current_key", "previous_key"]);
  assertThrowsCode(() => digest(bundle.current, { key_id: "unknown_key" }), "secret_key_not_found");
});

test("Group 5 validates exact digest inputs and copies bytes before provider invocation", () => {
  let observedBytes;
  const bundle = build({
    keyed_digest: frozen(input => {
      observedBytes = input.bytes;
      input.bytes[0] = 99;
      input.extra = RAW_SECRET_MARKER;
      return digestFor(input);
    }),
  }).value;
  const bytes = new Uint8Array([1, 2, 3]);
  const input = { key_id: "current_key", purpose: PURPOSE, bytes };
  digest(bundle.current, input);
  assert.deepEqual([...bytes], [1, 2, 3]);
  assert.notEqual(observedBytes, bytes);
  assertThrowsCode(() => bundle.current.keyed_digest({ ...input, extra: true }), "secret_digest_invalid");
  assertThrowsCode(() => bundle.current.keyed_digest({ key_id: "current_key", purpose: PURPOSE, bytes, [Symbol("x")]: true }), "secret_digest_invalid");
  assertThrowsCode(() => digest(bundle.current, { key_id: "previous_key" }), "secret_key_not_found");
  for (const purpose of [
    " pending-handoff-identity",
    "pending-handoff-identity ",
    "PENDING-HANDOFF-IDENTITY",
    "pending-handoff-identity*",
    "future-purpose",
  ]) {
    assertThrowsCode(() => digest(bundle.current, { purpose }), "secret_purpose_invalid");
  }
  assertThrowsCode(() => digest(bundle.current, { bytes: [1, 2, 3] }), "secret_digest_invalid");
});

test("Group 6 rejects asynchronous malformed and raw-failing digest outputs without leakage", () => {
  const cases = [
    [Promise.resolve("A".repeat(43)), "secret_digest_invalid"],
    [42, "secret_digest_invalid"],
    ["A".repeat(42), "secret_digest_invalid"],
    ["A".repeat(44), "secret_digest_invalid"],
    [`${"A".repeat(42)}=`, "secret_digest_invalid"],
    ["!".repeat(43), "secret_digest_invalid"],
  ];
  for (const [output, code] of cases) {
    const result = build({ keyed_digest: frozen(() => output) });
    assert.equal(result.ok, true);
    assertThrowsCode(() => digest(result.value.current), code);
  }
  let mode = "normal";
  const result = build({ keyed_digest: frozen(input => {
    if (mode === "throw") throw new Error(RAW_EXCEPTION_MARKER);
    return digestFor(input);
  }) });
  mode = "throw";
  assertThrowsCode(() => digest(result.value.current), "secret_digest_failed");
  assert.equal(JSON.stringify(result).includes(RAW_EXCEPTION_MARKER), false);
});

test("Group 7 keeps digest operation conformance in fixture-only wrapper oracles", () => {
  const bundle = build().value;
  assertDigestProviderConformance(bundle);
  assertConformanceFailure(build({ keyed_digest: frozen(() => "A".repeat(43)) }));
  assertConformanceFailure(build({ keyed_digest: frozen(({ purpose, bytes }) => digestFor({ key_id: "fixed", purpose, bytes })) }));
  assertConformanceFailure(build({ keyed_digest: frozen(({ key_id, purpose }) => digestFor({ key_id, purpose, bytes: new Uint8Array([0]) })) }));
});

test("Group 8 rejects post-build broken comparators at wrapper and S01 boundaries", () => {
  const bundle = build().value;
  assert.equal(bundle.safe_equal("same", "same"), true);
  assert.equal(bundle.safe_equal("left", "right"), false);
  assert.equal(bundle.safe_equal("short", "longer"), false);
  assertThrowsCode(() => bundle.safe_equal("same", 1), "secret_compare_invalid");
  let compareMode = "correct";
  const result = build({ safe_equal: frozen((left, right) => {
    if (compareMode === "always_true") return true;
    if (compareMode === "always_false") return false;
    if (compareMode === "prefix") return left.slice(0, 3) === right.slice(0, 3);
    if (compareMode === "non_boolean") return "true";
    if (compareMode === "promise") return Promise.resolve(true);
    if (compareMode === "throw") throw new Error(RAW_EXCEPTION_MARKER);
    return left === right;
  }) });
  assert.equal(result.ok, true);
  const entry = result.value.current;
  const source = {
    session_identity: session(entry, "session-001").identity,
    repository_identity: repository(entry).identity,
    worktree_identity: worktree(entry, repository(entry).identity).identity,
  };
  const otherSession = { ...source, session_identity: session(entry, "session-002").identity };
  for (const [mode, left, right, current, code] of [
    ["always_true", "same", "sane", otherSession, "secret_compare_invalid"],
    ["always_false", "same", "same", source, "secret_compare_invalid"],
    ["prefix", "same", "samx", otherSession, "secret_compare_invalid"],
    ["non_boolean", "same", "same", source, "secret_compare_invalid"],
    ["promise", "same", "same", source, "secret_compare_invalid"],
    ["throw", "same", "same", source, "secret_compare_failed"],
  ]) {
    compareMode = mode;
    assertThrowsCode(() => result.value.safe_equal(left, right), code);
    const scope = compareIdentityScope({ source, current, safe_equal: result.value.safe_equal });
    assert.equal(scope.ok, false);
    assert.notEqual(scope.result, "match");
    assert.notEqual(scope.result, "same_session");
  }
});

test("Group 9 redacts factory digest compare error bundle and result serialization", () => {
  const failure = createIdentitySecurityDependencies({
    version: RAW_SECRET_MARKER,
    current_key_id: RAW_SESSION_MARKER,
    verification_key_ids: Object.freeze([RAW_REPOSITORY_MARKER]),
    keyed_digest: frozen(() => { throw new Error(RAW_WORKTREE_MARKER); }),
    safe_equal: frozen(() => { throw new Error(RAW_EXCEPTION_MARKER); }),
  });
  const rendered = JSON.stringify(failure);
  for (const marker of [RAW_SECRET_MARKER, RAW_SESSION_MARKER, RAW_REPOSITORY_MARKER, RAW_WORKTREE_MARKER, RAW_EXCEPTION_MARKER]) {
    assert.equal(rendered.includes(marker), false);
  }
  let mode = "normal";
  const result = build({
    keyed_digest: frozen(input => {
      if (mode === "digest") throw new Error(RAW_EXCEPTION_MARKER);
      return digestFor(input);
    }),
    safe_equal: frozen((left, right) => {
      if (mode === "compare") throw new Error(RAW_EXCEPTION_MARKER);
      return left === right;
    }),
  });
  mode = "digest";
  let digestError;
  try { digest(result.value.current); } catch (error) { digestError = error; }
  mode = "compare";
  let compareError;
  try { result.value.safe_equal("same", "same"); } catch (error) { compareError = error; }
  const serialized = JSON.stringify([failure, result, result.value, digestError, compareError]);
  for (const marker of [RAW_SECRET_MARKER, RAW_SESSION_MARKER, RAW_REPOSITORY_MARKER, RAW_WORKTREE_MARKER, RAW_EXCEPTION_MARKER]) {
    assert.equal(serialized.includes(marker), false);
  }
});

test("Group 10 integrates only key-bound dependencies with S01 derivation and comparison", () => {
  const bundle = build().value;
  const currentSession = session(bundle.current);
  const currentRepository = repository(bundle.current);
  const currentWorktree = worktree(bundle.current, currentRepository.identity);
  const previousSession = session(bundle.verification[1]);
  assert.equal(currentSession.ok, true);
  assert.equal(currentRepository.ok, true);
  assert.equal(currentWorktree.ok, true);
  assert.equal(previousSession.ok, true);
  assert.notEqual(currentSession.identity, previousSession.identity);
  assertThrowsCode(() => digest(bundle.verification[1], { key_id: "unknown_previous" }), "secret_key_not_found");
  assert.deepEqual(compareIdentityScope({
    source: {
      session_identity: previousSession.identity,
      repository_identity: repository(bundle.verification[1]).identity,
      worktree_identity: worktree(bundle.verification[1], repository(bundle.verification[1]).identity).identity,
    },
    current: {
      session_identity: currentSession.identity,
      repository_identity: currentRepository.identity,
      worktree_identity: currentWorktree.identity,
    },
    safe_equal: bundle.safe_equal,
  }), { ok: false, reason: "identity_namespace_mismatch" });
});

test("Group 11 keeps the production boundary runtime-neutral with one public export", () => {
  const source = readFileSync(new URL("./lib/pending-handoff-secret-provider.mjs", import.meta.url), "utf8");
  assert.equal((source.match(/export\s+(?:function|const|let|var|class)\s+/g) ?? []).length, 1);
  assert.equal(/node:(?:fs|path|process|child_process|crypto|net|http|https|tls|dgram)/.test(source), false);
  assert.equal(/\bfetch\s*\(|process\.env|\b(?:Git|Keychain|Filesystem)\b/.test(source), false);
});

test("Group 12 Makefile runs the bounded target once after Core and Identity only in V1.x", () => {
  const makefile = readFileSync(new URL("../Makefile", import.meta.url), "utf8");
  assert.match(makefile, /^test-pending-handoff-secret-provider-fixtures:\n\tnode \.\/scripts\/test-pending-handoff-secret-provider-fixtures\.mjs$/m);
  assert.equal((makefile.match(/test-pending-handoff-secret-provider-fixtures/g) ?? []).length, 4);
  assert.match(makefile, /^test-v1x-fixtures: .*test-pending-handoff-core-fixtures test-pending-handoff-identity-fixtures test-pending-handoff-secret-provider-fixtures$/m);
  assert.doesNotMatch(makefile.match(/^test-v1-fixtures:.*$/m)?.[0] ?? "", /secret-provider/);
});

process.stdout.write(`PASS ${tests} secret provider fixture groups\n`);
