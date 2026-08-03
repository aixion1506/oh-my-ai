import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  compareIdentityScope,
  deriveRepositoryIdentity,
  deriveSourceSessionIdentity,
  deriveWorktreeIdentity,
  validateOpaqueIdentity,
} from "./lib/pending-handoff-identity.mjs";
import {
  loadInstallationSecret,
  resolveInstallationSecretPath,
} from "./lib/pending-handoff-secret.mjs";

let tests = 0;

function test(name, operation) {
  operation();
  tests += 1;
  process.stdout.write(`PASS ${name}\n`);
}

async function integrationTest(name, operation) {
  await operation();
  tests += 1;
  process.stdout.write(`PASS ${name}\n`);
}

function fakeDerive({ namespace, canonicalInput }) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  let state = 2_166_136_261;
  for (const value of `${namespace}:${canonicalInput}`) {
    state ^= value.charCodeAt(0);
    state = Math.imul(state, 16_777_619) >>> 0;
  }
  return Array.from({ length: 43 }, () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return alphabet[(state >>> 0) % alphabet.length];
  }).join("");
}

function secretContext(overrides = {}) {
  return {
    algorithm: "hmac-sha256",
    keyId: "key_A-1",
    derive: fakeDerive,
    ...overrides,
  };
}

function observedSecretContext(calls, overrides = {}) {
  return secretContext({
    derive({ namespace, canonicalInput }) {
      calls.push({ namespace, preimage: JSON.parse(canonicalInput) });
      return fakeDerive({ namespace, canonicalInput });
    },
    ...overrides,
  });
}

function safeEqual(left, right) {
  return left === right;
}

function remoteSet(remotes = [{
  host: "github.com",
  port: null,
  path: "aixion1506/oh-my-ai",
}]) {
  return { kind: "remote-set", remotes };
}

function session(overrides = {}) {
  return deriveSourceSessionIdentity({
    runtime_id: " Codex ",
    raw_session_id: "session-001",
    secret_context: secretContext(),
    ...overrides,
  });
}

function repository(overrides = {}) {
  return deriveRepositoryIdentity({
    repository_evidence: remoteSet(),
    secret_context: secretContext(),
    ...overrides,
  });
}

function worktree(overrides = {}) {
  return deriveWorktreeIdentity({
    repository_identity: repository().identity,
    verified_canonical_root: "/workspace/oh-my-ai-rpl-26",
    secret_context: secretContext(),
    ...overrides,
  });
}

function scope(source, current, overrides = {}) {
  return compareIdentityScope({ source, current, safe_equal: safeEqual, ...overrides });
}

test("session derivation preserves raw session bytes and binds the normalized runtime", () => {
  const calls = [];
  const first = session({ secret_context: observedSecretContext(calls) });
  const second = session({ secret_context: observedSecretContext(calls) });
  const otherRuntime = session({
    runtime_id: "claude",
    secret_context: observedSecretContext(calls),
  });
  const otherSession = session({
    raw_session_id: "session-002",
    secret_context: observedSecretContext(calls),
  });

  assert.deepEqual(first, second);
  assert.notEqual(first.identity, otherRuntime.identity);
  assert.notEqual(first.identity, otherSession.identity);
  assert.deepEqual(calls, [
    { namespace: "pending-handoff-session", preimage: ["phr1", "codex", "session-001"] },
    { namespace: "pending-handoff-session", preimage: ["phr1", "codex", "session-001"] },
    { namespace: "pending-handoff-session", preimage: ["phr1", "claude", "session-001"] },
    { namespace: "pending-handoff-session", preimage: ["phr1", "codex", "session-002"] },
  ]);
});

test("repository derivation normalizes only approved typed remote evidence", () => {
  const calls = [];
  const first = repository({
    repository_evidence: remoteSet([
      { host: "GitHub.COM", port: null, path: "/Aixion1506/Oh-My-AI.git/" },
      { host: "git.example.com", port: 2222, path: "Platform/Service.git" },
      { host: "GitHub.COM", port: null, path: "/Aixion1506/Oh-My-AI.git/" },
    ]),
    secret_context: observedSecretContext(calls),
  });
  const equivalent = repository({
    repository_evidence: remoteSet([
      { host: "git.example.com", port: 2222, path: "/Platform/Service/" },
      { host: "github.com", port: null, path: "Aixion1506/Oh-My-AI" },
    ]),
    secret_context: observedSecretContext(calls),
  });
  const removed = repository({
    repository_evidence: remoteSet([
      { host: "github.com", port: null, path: "Aixion1506/Oh-My-AI" },
    ]),
    secret_context: observedSecretContext(calls),
  });
  const caseChangedPath = repository({
    repository_evidence: remoteSet([
      { host: "github.com", port: null, path: "aixion1506/oh-my-ai" },
      { host: "git.example.com", port: 2222, path: "Platform/Service" },
    ]),
  });

  assert.deepEqual(first, equivalent);
  assert.notEqual(first.identity, removed.identity);
  assert.notEqual(first.identity, caseChangedPath.identity);
  assert.deepEqual(calls, [
    {
      namespace: "pending-handoff-repository",
      preimage: ["phr1", "remote-set", [
        ["git.example.com", 2222, "Platform/Service"],
        ["github.com", null, "Aixion1506/Oh-My-AI"],
      ]],
    },
    {
      namespace: "pending-handoff-repository",
      preimage: ["phr1", "remote-set", [
        ["git.example.com", 2222, "Platform/Service"],
        ["github.com", null, "Aixion1506/Oh-My-AI"],
      ]],
    },
    {
      namespace: "pending-handoff-repository",
      preimage: ["phr1", "remote-set", [
        ["github.com", null, "Aixion1506/Oh-My-AI"],
      ]],
    },
  ]);
});

test("repository evidence keeps port separate and supports enterprise and IPv6 hosts", () => {
  const calls = [];
  const enterprise = repository({
    repository_evidence: remoteSet([
      { host: "Git.Corp.Example", port: 8443, path: "Team/Platform" },
    ]),
    secret_context: observedSecretContext(calls),
  });
  const ipv6 = repository({
    repository_evidence: remoteSet([
      { host: "2001:DB8::10", port: 2222, path: "Team/Platform" },
    ]),
    secret_context: observedSecretContext(calls),
  });
  const defaultPort = repository({
    repository_evidence: remoteSet([
      { host: "git.corp.example", port: null, path: "Team/Platform" },
    ]),
  });

  assert.equal(enterprise.ok, true);
  assert.equal(ipv6.ok, true);
  assert.notEqual(enterprise.identity, ipv6.identity);
  assert.notEqual(enterprise.identity, defaultPort.identity);
  assert.deepEqual(calls, [
    {
      namespace: "pending-handoff-repository",
      preimage: ["phr1", "remote-set", [["git.corp.example", 8443, "Team/Platform"]]],
    },
    {
      namespace: "pending-handoff-repository",
      preimage: ["phr1", "remote-set", [["2001:db8::10", 2222, "Team/Platform"]]],
    },
  ]);
});

test("repository evidence rejects open shapes and transport or credential syntax", () => {
  const rawMarkers = [
    "credential-marker",
    "scheme-marker",
    "query-marker",
    "fragment-marker",
    "nul-marker",
  ];
  const invalidEvidence = [
    { ...remoteSet(), extra: true },
    remoteSet([]),
    remoteSet([{ host: "github.com", port: null, path: "owner/repo", extra: true }]),
    remoteSet([{ host: `${rawMarkers[0]}@github.com`, port: null, path: "owner/repo" }]),
    remoteSet([{ host: `https://${rawMarkers[1]}.example`, port: null, path: "owner/repo" }]),
    remoteSet([{ host: "github.com", port: null, path: `owner/repo?${rawMarkers[2]}` }]),
    remoteSet([{ host: "github.com", port: null, path: `owner/repo#${rawMarkers[3]}` }]),
    remoteSet([{ host: `github.com\0${rawMarkers[4]}`, port: null, path: "owner/repo" }]),
    remoteSet([{ host: "github.com", port: 0, path: "owner/repo" }]),
    remoteSet([{ host: "github.com", port: 65_536, path: "owner/repo" }]),
    remoteSet([{ host: "github.com", port: 22.5, path: "owner/repo" }]),
  ];
  const results = invalidEvidence.map(repository_evidence => repository({ repository_evidence }));
  const serialized = JSON.stringify(results);

  assert.ok(results.every(result => result.ok === false));
  assert.ok(results.every(result => result.reason === "identity_input_invalid"));
  assert.ok(rawMarkers.every(marker => !serialized.includes(marker)));
});

test("local-only evidence is deterministic distinct and redacted", () => {
  const calls = [];
  const rawCommonDir = "/git/common/private-marker";
  const first = repository({
    repository_evidence: {
      kind: "local-common-dir",
      verified_canonical_common_dir: rawCommonDir,
    },
    secret_context: observedSecretContext(calls),
  });
  const same = repository({
    repository_evidence: {
      kind: "local-common-dir",
      verified_canonical_common_dir: rawCommonDir,
    },
  });
  const other = repository({
    repository_evidence: {
      kind: "local-common-dir",
      verified_canonical_common_dir: "/git/common/other-marker",
    },
  });
  const remote = repository({
    repository_evidence: remoteSet([
      { host: "local-common-dir", port: null, path: "git/common/private-marker" },
    ]),
  });
  const invalidResults = [
    repository({
      repository_evidence: {
        kind: "local-common-dir",
        verified_canonical_common_dir: "relative/common-dir",
      },
    }),
    repository({
      repository_evidence: {
        kind: "local-common-dir",
        verified_canonical_common_dir: "/git/common\0nul-marker",
      },
    }),
    repository({
      repository_evidence: {
        kind: "local-common-dir",
        verified_canonical_common_dir: ` ${rawCommonDir}`,
      },
    }),
    repository({
      repository_evidence: {
        kind: "local-common-dir",
        verified_canonical_common_dir: rawCommonDir,
        extra: true,
      },
    }),
  ];

  assert.deepEqual(first, same);
  assert.notEqual(first.identity, other.identity);
  assert.notEqual(first.identity, remote.identity);
  assert.ok(invalidResults.every(result => result.ok === false));
  assert.equal(JSON.stringify([first, same, other, remote, invalidResults]).includes(rawCommonDir), false);
  assert.deepEqual(calls, [{
    namespace: "pending-handoff-repository",
    preimage: ["phr1", "local-common-dir", rawCommonDir],
  }]);
});

test("worktree derivation binds the repository opaque identity and preserves root case", () => {
  const repositoryOne = repository().identity;
  const repositoryTwo = repository({
    repository_evidence: remoteSet([
      { host: "github.com", port: null, path: "aixion1506/other" },
    ]),
  }).identity;
  const calls = [];
  const first = worktree({
    repository_identity: repositoryOne,
    secret_context: observedSecretContext(calls),
  });
  const same = worktree({
    repository_identity: repositoryOne,
    secret_context: observedSecretContext(calls),
  });
  const otherRoot = worktree({
    repository_identity: repositoryOne,
    verified_canonical_root: "/workspace/oh-my-ai-rpl-27",
    secret_context: observedSecretContext(calls),
  });
  const otherRepository = worktree({
    repository_identity: repositoryTwo,
    secret_context: observedSecretContext(calls),
  });
  const caseChangedRoot = worktree({
    repository_identity: repositoryOne,
    verified_canonical_root: "/workspace/Oh-My-AI-rpl-26",
    secret_context: observedSecretContext(calls),
  });

  assert.deepEqual(first, same);
  assert.notEqual(first.identity, otherRoot.identity);
  assert.notEqual(first.identity, otherRepository.identity);
  assert.notEqual(first.identity, caseChangedRoot.identity);
  assert.deepEqual(calls.map(call => call.namespace), Array(5).fill("pending-handoff-worktree"));
  assert.deepEqual(calls.map(call => call.preimage), [
    ["phr1", repositoryOne, "/workspace/oh-my-ai-rpl-26"],
    ["phr1", repositoryOne, "/workspace/oh-my-ai-rpl-26"],
    ["phr1", repositoryOne, "/workspace/oh-my-ai-rpl-27"],
    ["phr1", repositoryTwo, "/workspace/oh-my-ai-rpl-26"],
    ["phr1", repositoryOne, "/workspace/Oh-My-AI-rpl-26"],
  ]);
});

test("worktree root and repository key binding fail closed without leaking raw roots", () => {
  const rootMarker = "/workspace/private-root-marker";
  const invalidRoots = [
    "relative/path",
    "./relative",
    "../relative",
    "",
    "   ",
    "/workspace/root\0nul-marker",
    42,
  ];
  const results = invalidRoots.map(verified_canonical_root => worktree({
    verified_canonical_root,
  }));
  const repositoryIdentity = repository().identity;
  results.push(worktree({
    repository_identity: repositoryIdentity,
    secret_context: secretContext({ keyId: "key_B-2" }),
    verified_canonical_root: rootMarker,
  }));
  results.push(worktree({
    repository_identity: session().identity,
    verified_canonical_root: rootMarker,
  }));
  const serialized = JSON.stringify(results);

  assert.ok(results.every(result => result.ok === false));
  assert.deepEqual(results.map(result => result.reason), [
    "identity_input_invalid",
    "identity_input_invalid",
    "identity_input_invalid",
    "identity_input_invalid",
    "identity_input_invalid",
    "identity_input_invalid",
    "identity_input_invalid",
    "identity_namespace_mismatch",
    "identity_format_invalid",
  ]);
  assert.equal(serialized.includes(rootMarker), false);
  assert.equal(serialized.includes("nul-marker"), false);
});

test("blank or credential-bearing inputs produce only redacted errors", () => {
  const rawSessionMarker = "raw-session-marker-should-not-leak";
  const credentialMarker = "credential-marker-should-not-leak";
  const absolutePathMarker = "/absolute-path-marker-should-not-leak";
  const results = [
    session({ runtime_id: "   " }),
    session({ raw_session_id: "" }),
    repository({
      repository_evidence: remoteSet([
        { host: `${credentialMarker}@github.com`, port: null, path: "owner/repo" },
      ]),
    }),
    worktree({ verified_canonical_root: "" }),
    worktree({ verified_canonical_root: absolutePathMarker, repository_identity: "invalid" }),
    session({
      raw_session_id: rawSessionMarker,
      secret_context: secretContext({
        derive() { throw new Error(rawSessionMarker); },
      }),
    }),
  ];
  const serialized = JSON.stringify(results);

  assert.ok(results.every(result => result.ok === false));
  assert.ok(results.every(result => typeof result.reason === "string"));
  assert.equal(serialized.includes(rawSessionMarker), false);
  assert.equal(serialized.includes(credentialMarker), false);
  assert.equal(serialized.includes(absolutePathMarker), false);
  assert.deepEqual(results.map(result => result.reason), [
    "identity_input_invalid",
    "identity_input_invalid",
    "identity_input_invalid",
    "identity_input_invalid",
    "identity_format_invalid",
    "identity_digest_unavailable",
  ]);
});

test("secret context key id digest and opaque identity format are validated", () => {
  const valid = session();
  assert.deepEqual(validateOpaqueIdentity(valid.identity), {
    ok: true,
    version: "phr1",
    kind: "session",
    key_id: "key_A-1",
  });
  assert.deepEqual(session({ secret_context: secretContext({ keyId: "" }) }), {
    ok: false,
    reason: "identity_key_id_invalid",
  });
  assert.deepEqual(session({ secret_context: secretContext({ keyId: "not.allowed" }) }), {
    ok: false,
    reason: "identity_key_id_invalid",
  });
  assert.deepEqual(session({ secret_context: secretContext({ algorithm: "sha256" }) }), {
    ok: false,
    reason: "identity_digest_unavailable",
  });
  assert.deepEqual(session({ secret_context: secretContext({ derive: null }) }), {
    ok: false,
    reason: "identity_digest_unavailable",
  });
  assert.deepEqual(session({ secret_context: secretContext({ derive: () => "short" }) }), {
    ok: false,
    reason: "identity_digest_invalid",
  });
  assert.deepEqual(session({ secret_context: secretContext({ derive: () => "!".repeat(43) }) }), {
    ok: false,
    reason: "identity_digest_invalid",
  });
  assert.deepEqual(validateOpaqueIdentity("phr1.session.key_A-1.short"), {
    ok: false,
    reason: "identity_format_invalid",
  });
  assert.deepEqual(validateOpaqueIdentity(
    "phr1.unknown.key_A-1.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  ), {
    ok: false,
    reason: "identity_format_invalid",
  });
});

test("comparison is fail-closed and distinguishes session repository and worktree outcomes", () => {
  const source = {
    session_identity: session().identity,
    repository_identity: repository().identity,
    worktree_identity: worktree().identity,
  };
  const otherSession = {
    ...source,
    session_identity: session({ raw_session_id: "session-002" }).identity,
  };
  const otherRepository = {
    ...otherSession,
    repository_identity: repository({
      repository_evidence: remoteSet([
        { host: "github.com", port: null, path: "aixion1506/other" },
      ]),
    }).identity,
  };
  const otherWorktree = {
    ...source,
    session_identity: otherSession.session_identity,
    worktree_identity: worktree({
      verified_canonical_root: "/workspace/oh-my-ai-rpl-27",
    }).identity,
  };
  const differentKey = {
    ...source,
    session_identity: session({
      secret_context: secretContext({ keyId: "key_B-2" }),
    }).identity,
  };

  const results = [
    scope(source, source),
    scope(source, otherSession),
    scope(source, otherRepository),
    scope(source, otherWorktree),
    scope(source, differentKey),
    scope({ ...source, session_identity: "invalid" }, otherSession),
    scope(otherSession, { ...source, repository_identity: "invalid" }),
    scope(otherSession, { ...source, worktree_identity: "invalid" }),
    scope(source, otherSession, { safe_equal: undefined }),
    scope(source, otherSession, {
      safe_equal: () => { throw new Error("comparison details must not leak"); },
    }),
    scope(source, otherSession, { safe_equal: () => undefined }),
  ];

  assert.deepEqual(results, [
    {
      gate: "identity_scope",
      allowed: false,
      outcome: "not_eligible",
      reason_code: "same_session",
    },
    { gate: "identity_scope", allowed: true, outcome: "scope_verified" },
    {
      gate: "identity_scope",
      allowed: false,
      outcome: "manual_resume",
      reason_code: "repository_mismatch",
    },
    {
      gate: "identity_scope",
      allowed: false,
      outcome: "manual_resume",
      reason_code: "worktree_mismatch",
    },
    {
      gate: "identity_scope",
      allowed: false,
      outcome: "unavailable",
      reason_code: "identity_namespace_mismatch",
    },
    {
      gate: "identity_scope",
      allowed: false,
      outcome: "unavailable",
      reason_code: "session_identity_unknown",
    },
    {
      gate: "identity_scope",
      allowed: false,
      outcome: "unavailable",
      reason_code: "repository_identity_unknown",
    },
    {
      gate: "identity_scope",
      allowed: false,
      outcome: "unavailable",
      reason_code: "worktree_identity_unknown",
    },
    {
      gate: "identity_scope",
      allowed: false,
      outcome: "unavailable",
      reason_code: "session_identity_unknown",
    },
    {
      gate: "identity_scope",
      allowed: false,
      outcome: "unavailable",
      reason_code: "session_identity_unknown",
    },
    {
      gate: "identity_scope",
      allowed: false,
      outcome: "unavailable",
      reason_code: "session_identity_unknown",
    },
  ]);
  assert.ok(results.every(result => !Object.hasOwn(result, "ok")));
  assert.equal(results.filter(result => result.allowed).length, 1);
});

await integrationTest("real installation secret contexts derive identities without a bridge", async () => {
  const firstHome = await mkdtemp(path.join(tmpdir(), "phr-identity-first-"));
  const secondHome = await mkdtemp(path.join(tmpdir(), "phr-identity-second-"));
  try {
    const firstEnv = { HOME: firstHome, XDG_STATE_HOME: path.join(firstHome, "state") };
    const secondEnv = { HOME: secondHome, XDG_STATE_HOME: path.join(secondHome, "state") };
    const firstSecret = await loadInstallationSecret({ env: firstEnv, purpose: "initialize" });
    const secondSecret = await loadInstallationSecret({ env: secondEnv, purpose: "initialize" });

    assert.equal(firstSecret.ok, true);
    assert.equal(secondSecret.ok, true);
    assert.deepEqual(Object.keys(firstSecret.value).sort(), ["algorithm", "derive", "keyId"]);

    const firstSession = deriveSourceSessionIdentity({
      runtime_id: "codex",
      raw_session_id: "integration-session-marker",
      secret_context: firstSecret.value,
    });
    const firstRepository = deriveRepositoryIdentity({
      repository_evidence: remoteSet(),
      secret_context: firstSecret.value,
    });
    const firstWorktree = deriveWorktreeIdentity({
      repository_identity: firstRepository.identity,
      verified_canonical_root: "/workspace/integration-root-marker",
      secret_context: firstSecret.value,
    });
    const secondSession = deriveSourceSessionIdentity({
      runtime_id: "codex",
      raw_session_id: "integration-session-marker",
      secret_context: secondSecret.value,
    });
    const secondRepository = deriveRepositoryIdentity({
      repository_evidence: remoteSet(),
      secret_context: secondSecret.value,
    });
    const secondWorktree = deriveWorktreeIdentity({
      repository_identity: secondRepository.identity,
      verified_canonical_root: "/workspace/integration-root-marker",
      secret_context: secondSecret.value,
    });

    assert.ok([firstSession, firstRepository, firstWorktree].every(result => result.ok));
    assert.notEqual(firstSession.identity, secondSession.identity);
    assert.notEqual(firstRepository.identity, secondRepository.identity);
    assert.notEqual(firstWorktree.identity, secondWorktree.identity);

    const firstSecretRecord = JSON.parse(await readFile(
      resolveInstallationSecretPath({ env: firstEnv }),
      "utf8",
    ));
    const serializedResults = JSON.stringify({
      firstSecret,
      secondSecret,
      firstSession,
      firstRepository,
      firstWorktree,
      secondSession,
      secondRepository,
      secondWorktree,
    });
    assert.equal(serializedResults.includes(firstSecretRecord.secret_b64url), false);
    assert.equal(serializedResults.includes("integration-session-marker"), false);
    assert.equal(serializedResults.includes("integration-root-marker"), false);
  } finally {
    await Promise.all([
      rm(firstHome, { recursive: true, force: true }),
      rm(secondHome, { recursive: true, force: true }),
    ]);
  }
});

await integrationTest("identity module has no runtime filesystem process network or crypto ownership", async () => {
  const source = await readFile(
    new URL("./lib/pending-handoff-identity.mjs", import.meta.url),
    "utf8",
  );
  assert.equal(
    /from\s+["']node:(?:fs|path|child_process|process|net|http|https|crypto)["']/.test(source),
    false,
  );
  assert.equal(
    /import\s*\(\s*["']node:(?:fs|path|child_process|process|net|http|https|crypto)["']\s*\)/.test(source),
    false,
  );
  assert.equal(/\b(?:createHash|createHmac|keyed_digest)\b/.test(source), false);
});

process.stdout.write(`PASS ${tests} identity fixtures\n`);
