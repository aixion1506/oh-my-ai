import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  loadInstallationSecret,
  resolveInstallationSecretPath,
  resolvePendingHandoffStateRoot,
} from "./lib/pending-handoff-secret.mjs";

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const FORBIDDEN_CONTEXT_PROPERTIES = [
  "secret",
  "secretBytes",
  "secret_b64url",
  "key",
  "rawKey",
  "buffer",
];

let tests = 0;
let secretMarkerExposures = 0;

async function test(name, operation) {
  await operation();
  tests += 1;
  process.stdout.write(`PASS ${name}\n`);
}

async function withSandbox(operation) {
  const sandbox = await fs.mkdtemp(path.join(os.tmpdir(), "pending-handoff-secret-"));
  const home = path.join(sandbox, "home");
  const xdg = path.join(sandbox, "xdg-state");
  await fs.mkdir(home, { mode: DIRECTORY_MODE });
  await fs.mkdir(xdg, { mode: DIRECTORY_MODE });
  try {
    return await operation({ sandbox, home, xdg });
  } finally {
    assert.ok(sandbox.startsWith(path.join(os.tmpdir(), "pending-handoff-secret-")));
    await fs.rm(sandbox, { recursive: true, force: true });
  }
}

function xdgEnv({ home, xdg }) {
  return { HOME: home, XDG_STATE_HOME: xdg };
}

function homeEnv({ home }) {
  return { HOME: home };
}

function stateRoot(env) {
  const resolved = resolvePendingHandoffStateRoot({ env });
  assert.notEqual(resolved, null);
  return resolved;
}

function secretPath(env) {
  const resolved = resolveInstallationSecretPath({ env });
  assert.notEqual(resolved, null);
  return resolved;
}

async function createManagedDirectories(env) {
  const root = stateRoot(env);
  const base = env.XDG_STATE_HOME || path.join(env.HOME, ".local", "state");
  const managed = [
    path.join(base, "oh-my-ai"),
    path.join(base, "oh-my-ai", "pending-handoff"),
    root,
    path.join(root, "identity"),
  ];
  for (const directory of managed) {
    await fs.mkdir(directory, { recursive: true, mode: DIRECTORY_MODE });
    await fs.chmod(directory, DIRECTORY_MODE);
  }
}

function validRecord(encoded = crypto.randomBytes(32).toString("base64url")) {
  return {
    format_version: 1,
    algorithm: "hmac-sha256",
    key_id: "v1",
    secret_b64url: encoded,
  };
}

async function writeSecret(env, content, mode = FILE_MODE) {
  await createManagedDirectories(env);
  const serialized = typeof content === "string"
    ? content
    : `${JSON.stringify(content, null, 2)}\n`;
  await fs.writeFile(secretPath(env), serialized, { mode });
  await fs.chmod(secretPath(env), mode);
  return serialized;
}

async function load(env, purpose, overrides = {}) {
  return loadInstallationSecret({
    env,
    purpose,
    fsApi: overrides.fsApi || fs,
    cryptoApi: overrides.cryptoApi || crypto,
  });
}

async function listTemporaryFiles(env) {
  const identityDirectory = path.dirname(secretPath(env));
  try {
    const entries = await fs.readdir(identityDirectory);
    return entries.filter(entry => entry.startsWith(".installation-secret.") && entry.endsWith(".tmp"));
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

function modeOf(stat) {
  return stat.mode & 0o777;
}

function assertFailure(result, reasonCode) {
  assert.deepEqual(result, { ok: false, reason_code: reasonCode, changed: false });
}

function assertNoSecretMarker(value, marker) {
  const serialized = JSON.stringify(value);
  const exposed = serialized.includes(marker);
  if (exposed) secretMarkerExposures += 1;
  assert.equal(exposed, false);
}

function missingError() {
  return Object.assign(new Error("synthetic missing path"), { code: "ENOENT" });
}

function ioError() {
  return Object.assign(new Error("synthetic I/O failure"), { code: "EIO" });
}

await test("state root uses absolute XDG, falls back to HOME, and never uses repository state", async () => {
  await withSandbox(async sandbox => {
    const fromXdg = resolvePendingHandoffStateRoot({ env: xdgEnv(sandbox) });
    assert.equal(fromXdg, path.join(sandbox.xdg, "oh-my-ai", "pending-handoff", "v1"));
    assert.equal(
      resolvePendingHandoffStateRoot({ env: { XDG_STATE_HOME: sandbox.xdg } }),
      fromXdg,
    );
    assert.equal(
      resolveInstallationSecretPath({ env: xdgEnv(sandbox) }),
      path.join(fromXdg, "identity", "installation-secret.json"),
    );

    const fromHome = resolvePendingHandoffStateRoot({ env: homeEnv(sandbox) });
    assert.equal(
      fromHome,
      path.join(sandbox.home, ".local", "state", "oh-my-ai", "pending-handoff", "v1"),
    );
    assert.equal(resolvePendingHandoffStateRoot({
      env: { HOME: sandbox.home, XDG_STATE_HOME: "relative/state" },
    }), null);
    assert.equal(resolvePendingHandoffStateRoot({ env: { HOME: "relative/home" } }), null);
    assert.equal(resolvePendingHandoffStateRoot({ env: {} }), null);
    assert.equal(resolveInstallationSecretPath({ env: {} }), null);
    assert.notEqual(fromHome, path.join(process.cwd(), ".oh-my-ai", "state"));
  });
});

await test("read on a missing secret fails open without creating state", async () => {
  await withSandbox(async sandbox => {
    const env = xdgEnv(sandbox);
    assertFailure(await load(env, "read"), "secret_missing");
    assert.deepEqual(await fs.readdir(sandbox.xdg), []);
  });
});

await test("initialize creates once and every later initialize reuses the same secret", async () => {
  await withSandbox(async sandbox => {
    const env = xdgEnv(sandbox);
    const first = await load(env, "initialize");
    const second = await load(env, "initialize");
    const read = await load(env, "read");
    assert.equal(first.ok, true);
    assert.equal(first.changed, true);
    assert.equal(second.ok, true);
    assert.equal(second.changed, false);
    assert.equal(read.ok, true);
    assert.equal(read.changed, false);
    assert.equal(
      first.value.derive({ namespace: "fixture", canonicalInput: "same-input" }),
      second.value.derive({ namespace: "fixture", canonicalInput: "same-input" }),
    );
    assert.equal(
      first.value.derive({ namespace: "fixture", canonicalInput: "same-input" }),
      read.value.derive({ namespace: "fixture", canonicalInput: "same-input" }),
    );
  });
});

await test("created state has a closed secret format and exact managed permissions", async () => {
  await withSandbox(async sandbox => {
    const env = xdgEnv(sandbox);
    const result = await load(env, "initialize");
    assert.equal(result.ok, true);

    const location = secretPath(env);
    const record = JSON.parse(await fs.readFile(location, "utf8"));
    assert.deepEqual(Object.keys(record), [
      "format_version", "algorithm", "key_id", "secret_b64url",
    ]);
    assert.equal(record.format_version, 1);
    assert.equal(record.algorithm, "hmac-sha256");
    assert.equal(record.key_id, "v1");
    assert.match(record.secret_b64url, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(Buffer.from(record.secret_b64url, "base64url").length, 32);

    const root = stateRoot(env);
    for (const directory of [
      path.join(sandbox.xdg, "oh-my-ai"),
      path.join(sandbox.xdg, "oh-my-ai", "pending-handoff"),
      root,
      path.join(root, "identity"),
    ]) {
      assert.equal(modeOf(await fs.lstat(directory)), DIRECTORY_MODE, directory);
    }
    assert.equal(modeOf(await fs.lstat(location)), FILE_MODE);
  });
});

await test("every corrupt shape fails without replacement or temporary residue", async () => {
  const randomEncoded = crypto.randomBytes(32).toString("base64url");
  const cases = [
    ["invalid JSON", "{not-json\n"],
    ["unknown field", { ...validRecord(randomEncoded), extra: true }],
    ["wrong version", { ...validRecord(randomEncoded), format_version: 2 }],
    ["wrong algorithm", { ...validRecord(randomEncoded), algorithm: "sha256" }],
    ["wrong key id", { ...validRecord(randomEncoded), key_id: "v2" }],
    ["wrong encoded length", validRecord("A".repeat(44))],
    ["invalid base64url", validRecord(`${"A".repeat(42)}+`)],
    ["decoded canonical mismatch", validRecord(`${"A".repeat(42)}B`)],
  ];

  for (const [name, record] of cases) {
    await withSandbox(async sandbox => {
      const env = xdgEnv(sandbox);
      const original = await writeSecret(env, record);
      assertFailure(await load(env, "read"), "secret_corrupt");
      assertFailure(await load(env, "initialize"), "secret_corrupt");
      assert.equal(await fs.readFile(secretPath(env), "utf8"), original, name);
      assert.deepEqual(await listTemporaryFiles(env), [], name);
    });
  }
});

await test("duplicate decoded JSON keys are corrupt and remain byte-for-byte untouched", async () => {
  const validFirst = crypto.randomBytes(32).toString("base64url");
  const validLast = crypto.randomBytes(32).toString("base64url");
  const canonicalTail = `
  "algorithm": "hmac-sha256",
  "key_id": "v1",
  "secret_b64url": "${validLast}"`;
  const cases = [
    [
      "duplicate format_version",
      `{
  "format_version": 2,
  "format_version": 1,${canonicalTail}
}\n`,
    ],
    [
      "duplicate algorithm",
      `{
  "format_version": 1,
  "algorithm": "sha256",
  "algorithm": "hmac-sha256",
  "key_id": "v1",
  "secret_b64url": "${validLast}"
}\n`,
    ],
    [
      "duplicate key_id",
      `{
  "format_version": 1,
  "algorithm": "hmac-sha256",
  "key_id": "v2",
  "key_id": "v1",
  "secret_b64url": "${validLast}"
}\n`,
    ],
    [
      "invalid then valid secret_b64url",
      `{
  "format_version": 1,
  "algorithm": "hmac-sha256",
  "key_id": "v1",
  "secret_b64url": "invalid",
  "secret_b64url": "${validLast}"
}\n`,
    ],
    [
      "valid then different valid secret_b64url",
      `{
  "format_version": 1,
  "algorithm": "hmac-sha256",
  "key_id": "v1",
  "secret_b64url": "${validFirst}",
  "secret_b64url": "${validLast}"
}\n`,
    ],
    [
      "escaped-equivalent secret_b64url",
      `{
  "format_version": 1,
  "algorithm": "hmac-sha256",
  "key_id": "v1",
  "secret_b64url": "${validFirst}",
  "secret_\\u0062\\u0036\\u0034url": "${validLast}"
}\n`,
    ],
    [
      "duplicate unknown key",
      `{
  "format_version": 1,
  "algorithm": "hmac-sha256",
  "key_id": "v1",
  "secret_b64url": "${validLast}",
  "unknown": 1,
  "unknown": 2
}\n`,
    ],
    [
      "different keys sharing a value",
      `{
  "format_version": 1,
  "algorithm": "v1",
  "key_id": "v1",
  "secret_b64url": "${validLast}"
}\n`,
    ],
  ];

  for (const [name, record] of cases) {
    await withSandbox(async sandbox => {
      const env = xdgEnv(sandbox);
      const original = await writeSecret(env, record);
      const before = await fs.lstat(secretPath(env));

      const readResult = await load(env, "read");
      const initializeResult = await load(env, "initialize");

      assertFailure(readResult, "secret_corrupt");
      assertFailure(initializeResult, "secret_corrupt");
      assertNoSecretMarker(readResult, validFirst);
      assertNoSecretMarker(readResult, validLast);
      assertNoSecretMarker(initializeResult, validFirst);
      assertNoSecretMarker(initializeResult, validLast);
      const after = await fs.lstat(secretPath(env));
      assert.equal(after.ino, before.ino, name);
      assert.equal(after.mtimeMs, before.mtimeMs, name);
      assert.equal(await fs.readFile(secretPath(env), "utf8"), original, name);
      assert.deepEqual(await listTemporaryFiles(env), [], name);
    });
  }
});

await test("permission mismatches fail closed without chmod or replacement", async () => {
  await withSandbox(async sandbox => {
    const env = xdgEnv(sandbox);
    const appDirectory = path.join(sandbox.xdg, "oh-my-ai");
    await fs.mkdir(appDirectory, { mode: 0o755 });
    await fs.chmod(appDirectory, 0o755);
    assertFailure(await load(env, "initialize"), "state_permission_invalid");
    assert.equal(modeOf(await fs.lstat(appDirectory)), 0o755);
  });

  await withSandbox(async sandbox => {
    const env = xdgEnv(sandbox);
    const original = await writeSecret(env, validRecord(), 0o644);
    assertFailure(await load(env, "read"), "state_permission_invalid");
    assertFailure(await load(env, "initialize"), "state_permission_invalid");
    assert.equal(modeOf(await fs.lstat(secretPath(env))), 0o644);
    assert.equal(await fs.readFile(secretPath(env), "utf8"), original);
  });
});

await test("a regular file in a directory position is rejected without replacement", async () => {
  await withSandbox(async sandbox => {
    const env = xdgEnv(sandbox);
    const appDirectory = path.join(sandbox.xdg, "oh-my-ai");
    await fs.writeFile(appDirectory, "synthetic non-directory\n", { mode: FILE_MODE });
    assertFailure(await load(env, "initialize"), "state_path_invalid");
    assert.equal(await fs.readFile(appDirectory, "utf8"), "synthetic non-directory\n");
  });
});

await test("root, identity-directory, and secret-file symlinks are rejected without following targets", async () => {
  for (const variant of ["root", "identity", "secret"]) {
    await withSandbox(async sandbox => {
      const env = xdgEnv(sandbox);
      const target = path.join(sandbox.sandbox, `${variant}-target`);
      await fs.mkdir(target, { mode: DIRECTORY_MODE });
      const markerPath = path.join(target, "marker.txt");
      await fs.writeFile(markerPath, "target-unchanged\n", { mode: FILE_MODE });

      if (variant === "root") {
        const pendingDirectory = path.join(sandbox.xdg, "oh-my-ai", "pending-handoff");
        await fs.mkdir(pendingDirectory, { recursive: true, mode: DIRECTORY_MODE });
        await fs.chmod(path.join(sandbox.xdg, "oh-my-ai"), DIRECTORY_MODE);
        await fs.chmod(pendingDirectory, DIRECTORY_MODE);
        await fs.symlink(target, path.join(pendingDirectory, "v1"));
      } else {
        const root = stateRoot(env);
        await fs.mkdir(root, { recursive: true, mode: DIRECTORY_MODE });
        for (const directory of [
          path.join(sandbox.xdg, "oh-my-ai"),
          path.join(sandbox.xdg, "oh-my-ai", "pending-handoff"),
          root,
        ]) await fs.chmod(directory, DIRECTORY_MODE);
        if (variant === "identity") {
          await fs.symlink(target, path.join(root, "identity"));
        } else {
          const identityDirectory = path.join(root, "identity");
          await fs.mkdir(identityDirectory, { mode: DIRECTORY_MODE });
          const targetSecret = path.join(target, "target-secret.json");
          await fs.writeFile(targetSecret, `${JSON.stringify(validRecord())}\n`, { mode: FILE_MODE });
          await fs.symlink(targetSecret, path.join(identityDirectory, "installation-secret.json"));
        }
      }

      assertFailure(await load(env, "initialize"), "state_symlink_rejected");
      assert.equal(await fs.readFile(markerPath, "utf8"), "target-unchanged\n");
    });
  }
});

await test("opaque context is frozen, deterministic, domain separated, and serialization safe", async () => {
  await withSandbox(async sandbox => {
    const env = xdgEnv(sandbox);
    const result = await load(env, "initialize");
    assert.equal(result.ok, true);
    const context = result.value;
    const record = JSON.parse(await fs.readFile(secretPath(env), "utf8"));

    assert.deepEqual(Object.keys(context), ["algorithm", "keyId", "derive"]);
    assert.equal(Object.isFrozen(context), true);
    for (const property of FORBIDDEN_CONTEXT_PROPERTIES) {
      assert.equal(Object.hasOwn(context, property), false, property);
    }
    assertNoSecretMarker(context, record.secret_b64url);

    const first = context.derive({ namespace: "session", canonicalInput: "alpha" });
    const repeated = context.derive({ namespace: "session", canonicalInput: "alpha" });
    assert.equal(first, repeated);
    assert.match(first, /^[A-Za-z0-9_-]{43}$/);
    assert.notEqual(first, context.derive({ namespace: "repository", canonicalInput: "alpha" }));
    assert.notEqual(
      context.derive({ namespace: "ab", canonicalInput: "c" }),
      context.derive({ namespace: "a", canonicalInput: "bc" }),
    );
    assert.notEqual(
      context.derive({ namespace: "session", canonicalInput: "alpha\0beta" }),
      context.derive({ namespace: "session", canonicalInput: "alphabeta" }),
    );
    assert.throws(() => context.derive({ namespace: "session\0nested", canonicalInput: "alpha" }));
  });
});

await test("different installation secrets derive different digests", async () => {
  await withSandbox(async firstSandbox => {
    await withSandbox(async secondSandbox => {
      const first = await load(xdgEnv(firstSandbox), "initialize");
      const second = await load(xdgEnv(secondSandbox), "initialize");
      assert.equal(first.ok, true);
      assert.equal(second.ok, true);
      assert.notEqual(
        first.value.derive({ namespace: "fixture", canonicalInput: "same" }),
        second.value.derive({ namespace: "fixture", canonicalInput: "same" }),
      );
    });
  });
});

await test("derive hides crypto dependency errors that contain secret material", async () => {
  await withSandbox(async sandbox => {
    const env = xdgEnv(sandbox);
    const cryptoApi = Object.create(crypto);
    cryptoApi.createHmac = (_algorithm, key) => {
      throw new Error(Buffer.from(key).toString("base64url"));
    };
    const result = await load(env, "initialize", { cryptoApi });
    assert.equal(result.ok, true);
    const marker = JSON.parse(await fs.readFile(secretPath(env), "utf8")).secret_b64url;

    let derivationError;
    try {
      result.value.derive({ namespace: "fixture", canonicalInput: "error-boundary" });
    } catch (error) {
      derivationError = error;
    }
    assert.ok(derivationError instanceof Error);
    assertNoSecretMarker({ message: derivationError.message }, marker);
  });
});

await test("two concurrent initializers elect exactly one winner and leave no temp files", async () => {
  await withSandbox(async sandbox => {
    const env = xdgEnv(sandbox);
    const results = await Promise.all([
      load(env, "initialize"),
      load(env, "initialize"),
    ]);
    assert.equal(results.every(result => result.ok), true);
    assert.equal(results.filter(result => result.changed === true).length, 1);
    assert.equal(results.filter(result => result.changed === false).length, 1);
    assert.equal(
      results[0].value.derive({ namespace: "fixture", canonicalInput: "race" }),
      results[1].value.derive({ namespace: "fixture", canonicalInput: "race" }),
    );
    assert.deepEqual(await listTemporaryFiles(env), []);
    const entries = await fs.readdir(path.dirname(secretPath(env)));
    assert.deepEqual(entries, ["installation-secret.json"]);
  });
});

await test("failure before temp creation leaves no secret and exposes no error detail", async () => {
  await withSandbox(async sandbox => {
    const env = xdgEnv(sandbox);
    const cryptoApi = Object.create(crypto);
    cryptoApi.randomBytes = () => { throw ioError(); };
    const result = await load(env, "initialize", { cryptoApi });
    assertFailure(result, "secret_unavailable");
    assert.deepEqual(await listTemporaryFiles(env), []);
    await assert.rejects(fs.lstat(secretPath(env)), error => error?.code === "ENOENT");
  });
});

await test("link failure after temp write never falls back to rename and cleans the temp", async () => {
  await withSandbox(async sandbox => {
    const env = xdgEnv(sandbox);
    const markerBytes = crypto.randomBytes(32);
    const marker = markerBytes.toString("base64url");
    const cryptoApi = Object.create(crypto);
    cryptoApi.randomBytes = size => size === 32 ? Buffer.from(markerBytes) : crypto.randomBytes(size);
    const fsApi = Object.create(fs);
    fsApi.link = async () => { throw ioError(); };

    const result = await load(env, "initialize", { fsApi, cryptoApi });
    assertFailure(result, "secret_unavailable");
    assertNoSecretMarker(result, marker);
    assert.deepEqual(await listTemporaryFiles(env), []);
    await assert.rejects(fs.lstat(secretPath(env)), error => error?.code === "ENOENT");
  });
});

await test("an EEXIST loser rereads the winner and reports unchanged", async () => {
  await withSandbox(async sandbox => {
    const env = xdgEnv(sandbox);
    const winner = await load(env, "initialize");
    assert.equal(winner.ok, true);
    const finalPath = secretPath(env);
    const fsApi = Object.create(fs);
    let hideWinner = true;
    fsApi.lstat = async candidate => {
      if (candidate === finalPath && hideWinner) {
        hideWinner = false;
        throw missingError();
      }
      return fs.lstat(candidate);
    };

    const loser = await load(env, "initialize", { fsApi });
    assert.equal(loser.ok, true);
    assert.equal(loser.changed, false);
    assert.equal(
      loser.value.derive({ namespace: "fixture", canonicalInput: "winner" }),
      winner.value.derive({ namespace: "fixture", canonicalInput: "winner" }),
    );
    assert.deepEqual(await listTemporaryFiles(env), []);
  });
});

await test("directory fsync failure preserves the complete winner and cleans the temp", async () => {
  await withSandbox(async sandbox => {
    const env = xdgEnv(sandbox);
    const identityDirectory = path.dirname(secretPath(env));
    const fsApi = Object.create(fs);
    fsApi.open = async (candidate, flags, mode) => {
      const handle = await fs.open(candidate, flags, mode);
      if (candidate !== identityDirectory || flags !== "r") return handle;
      return {
        close: () => handle.close(),
        sync: async () => { throw ioError(); },
      };
    };

    const result = await load(env, "initialize", { fsApi });
    assertFailure(result, "secret_unavailable");
    assert.deepEqual(await listTemporaryFiles(env), []);

    const recordText = await fs.readFile(secretPath(env), "utf8");
    const marker = JSON.parse(recordText).secret_b64url;
    assertNoSecretMarker(result, marker);
    const recovered = await load(env, "read");
    assert.equal(recovered.ok, true);
    assert.equal(recovered.changed, false);
  });
});

process.stdout.write("\n");
process.stdout.write("Duplicate-secret-key rejection sub-assertion: PASS\n");
process.stdout.write("Installation-secret lifecycle sub-assertion: PASS\n");
process.stdout.write("Secret single-winner sub-assertion: PASS\n");
process.stdout.write("Secret symlink/permission fail-open sub-assertion: PASS\n");
process.stdout.write("Opaque secret-context sub-assertion: PASS\n");
process.stdout.write(`Secret lifecycle fixture tests: ${tests} PASS\n`);
process.stdout.write(`Secret marker exposures: ${secretMarkerExposures}\n`);
