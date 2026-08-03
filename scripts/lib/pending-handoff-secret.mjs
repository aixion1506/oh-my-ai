import crypto from "node:crypto";
import { constants as fsConstants, promises as fs } from "node:fs";
import path from "node:path";

const FORMAT_VERSION = 1;
const ALGORITHM = "hmac-sha256";
const KEY_ID = "v1";
const SECRET_BYTES = 32;
const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const MAX_SECRET_FILE_BYTES = 1024;
const RECORD_FIELDS = Object.freeze([
  "format_version",
  "algorithm",
  "key_id",
  "secret_b64url",
]);
const VALID_PURPOSES = new Set(["read", "initialize"]);

class SecretLifecycleFault extends Error {
  constructor(reasonCode) {
    super("Pending handoff installation secret is unavailable.");
    this.name = "SecretLifecycleFault";
    this.reasonCode = reasonCode;
  }
}

export function resolvePendingHandoffStateRoot({ env } = {}) {
  const base = resolveStateBase(env);
  return base === null
    ? null
    : path.join(base, "oh-my-ai", "pending-handoff", "v1");
}

export function resolveInstallationSecretPath({ env } = {}) {
  const root = resolvePendingHandoffStateRoot({ env });
  return root === null
    ? null
    : path.join(root, "identity", "installation-secret.json");
}

export async function loadInstallationSecret({
  env,
  purpose,
  fsApi = fs,
  cryptoApi = crypto,
} = {}) {
  if (!VALID_PURPOSES.has(purpose)) return failure("secret_unavailable");

  const resolution = resolveLocations(env);
  if (resolution === null) return failure("state_path_invalid");

  try {
    await prepareDirectoryChain({
      fsApi,
      purpose,
      baseDirectories: resolution.baseDirectories,
      managedDirectories: resolution.managedDirectories,
    });

    try {
      const context = await readSecretContext({
        fsApi,
        cryptoApi,
        secretPath: resolution.secretPath,
      });
      return success(context, false);
    } catch (error) {
      if (!isFault(error, "secret_missing")) throw error;
      if (purpose === "read") return failure("secret_missing");
    }

    return await initializeSecret({ fsApi, cryptoApi, resolution });
  } catch (error) {
    return failure(reasonCodeFor(error));
  }
}

function resolveStateBase(env) {
  if (!isPlainObject(env)) return null;

  const xdg = env.XDG_STATE_HOME;
  if (typeof xdg === "string" && xdg.length > 0) {
    return safeAbsolutePath(xdg);
  }
  if (xdg !== undefined && xdg !== "") return null;

  const home = safeAbsolutePath(env.HOME);
  return home === null ? null : path.join(home, ".local", "state");
}

function safeAbsolutePath(value) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) return null;
  return path.isAbsolute(value) ? path.normalize(value) : null;
}

function resolveLocations(env) {
  const stateRoot = resolvePendingHandoffStateRoot({ env });
  const secretPath = resolveInstallationSecretPath({ env });
  const base = resolveStateBase(env);
  if (stateRoot === null || secretPath === null || base === null) return null;

  const usingXdg = typeof env.XDG_STATE_HOME === "string" && env.XDG_STATE_HOME.length > 0;
  const baseDirectories = usingXdg
    ? [base]
    : [safeAbsolutePath(env.HOME), path.dirname(base), base];
  if (baseDirectories.some(directory => directory === null)) return null;

  return {
    secretPath,
    baseDirectories,
    managedDirectories: [
      path.join(base, "oh-my-ai"),
      path.join(base, "oh-my-ai", "pending-handoff"),
      stateRoot,
      path.join(stateRoot, "identity"),
    ],
  };
}

async function prepareDirectoryChain({ fsApi, purpose, baseDirectories, managedDirectories }) {
  const create = purpose === "initialize";
  for (const directory of baseDirectories) {
    await ensureDirectory({ fsApi, directory, create, managed: false });
  }
  for (const directory of managedDirectories) {
    await ensureDirectory({ fsApi, directory, create, managed: true });
  }
}

async function ensureDirectory({ fsApi, directory, create, managed }) {
  let stat;
  try {
    stat = await fsApi.lstat(directory);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    if (!create) throw fault("secret_missing");
    try {
      await fsApi.mkdir(directory, { mode: DIRECTORY_MODE });
    } catch (mkdirError) {
      if (mkdirError?.code !== "EEXIST") throw mkdirError;
    }
    try {
      stat = await fsApi.lstat(directory);
    } catch (lstatError) {
      if (lstatError?.code === "ENOENT") throw fault("secret_unavailable");
      throw lstatError;
    }
  }

  if (stat.isSymbolicLink()) throw fault("state_symlink_rejected");
  if (!stat.isDirectory()) throw fault("state_path_invalid");
  if (managed && permissionBits(stat) !== DIRECTORY_MODE) {
    throw fault("state_permission_invalid");
  }
}

async function readSecretContext({ fsApi, cryptoApi, secretPath }) {
  let beforeOpen;
  try {
    beforeOpen = await fsApi.lstat(secretPath);
  } catch (error) {
    if (error?.code === "ENOENT") throw fault("secret_missing");
    throw error;
  }

  validateSecretFileStat(beforeOpen);

  const noFollow = fsConstants.O_NOFOLLOW || 0;
  let handle;
  let operationError;
  try {
    handle = await fsApi.open(secretPath, fsConstants.O_RDONLY | noFollow);
    const opened = await handle.stat();
    validateSecretFileStat(opened);
    if (!sameFile(beforeOpen, opened)) throw fault("secret_unavailable");
    if (opened.size > MAX_SECRET_FILE_BYTES) throw fault("secret_corrupt");
    const content = await handle.readFile("utf8");
    const secretBytes = parseSecretRecord(content);
    return createOpaqueContext(secretBytes, cryptoApi);
  } catch (error) {
    operationError = error;
    if (error?.code === "ELOOP") throw fault("state_symlink_rejected");
    throw error;
  } finally {
    if (handle !== undefined) {
      try {
        await handle.close();
      } catch (closeError) {
        if (operationError === undefined) throw closeError;
      }
    }
  }
}

function validateSecretFileStat(stat) {
  if (stat.isSymbolicLink()) throw fault("state_symlink_rejected");
  if (!stat.isFile()) throw fault("secret_corrupt");
  if (permissionBits(stat) !== FILE_MODE) throw fault("state_permission_invalid");
}

function sameFile(first, second) {
  return first.dev === second.dev && first.ino === second.ino;
}

function parseSecretRecord(content) {
  let record;
  try {
    record = parseStrictSecretRecordJson(content);
  } catch {
    throw fault("secret_corrupt");
  }
  if (!isPlainObject(record) || !hasExactFields(record, RECORD_FIELDS)) {
    throw fault("secret_corrupt");
  }
  if (
    record.format_version !== FORMAT_VERSION
    || record.algorithm !== ALGORITHM
    || record.key_id !== KEY_ID
    || typeof record.secret_b64url !== "string"
    || !/^[A-Za-z0-9_-]+$/.test(record.secret_b64url)
    || record.secret_b64url.length !== 43
  ) {
    throw fault("secret_corrupt");
  }

  let secretBytes;
  try {
    secretBytes = Buffer.from(record.secret_b64url, "base64url");
  } catch {
    throw fault("secret_corrupt");
  }
  if (
    secretBytes.length !== SECRET_BYTES
    || secretBytes.toString("base64url") !== record.secret_b64url
  ) {
    secretBytes.fill(0);
    throw fault("secret_corrupt");
  }
  return secretBytes;
}

function parseStrictSecretRecordJson(text) {
  if (typeof text !== "string" || text.charCodeAt(0) === 0xfeff) {
    throw strictJsonFault();
  }

  let index = skipJsonWhitespace(text, 0);
  if (text[index] !== "{") throw strictJsonFault();
  index = skipJsonWhitespace(text, index + 1);

  const decodedKeys = new Set();
  if (text[index] === "}") {
    index = skipJsonWhitespace(text, index + 1);
    if (index !== text.length) throw strictJsonFault();
    return JSON.parse(text);
  }

  while (index < text.length) {
    const key = scanJsonString(text, index);
    if (decodedKeys.has(key.decoded)) throw strictJsonFault();
    decodedKeys.add(key.decoded);

    index = skipJsonWhitespace(text, key.nextIndex);
    if (text[index] !== ":") throw strictJsonFault();
    index = skipJsonWhitespace(text, index + 1);
    index = scanFlatJsonValue(text, index);
    index = skipJsonWhitespace(text, index);

    if (text[index] === "}") {
      index = skipJsonWhitespace(text, index + 1);
      if (index !== text.length) throw strictJsonFault();
      return JSON.parse(text);
    }
    if (text[index] !== ",") throw strictJsonFault();
    index = skipJsonWhitespace(text, index + 1);
  }

  throw strictJsonFault();
}

function scanFlatJsonValue(text, index) {
  const current = text[index];
  if (current === "\"") return scanJsonString(text, index).nextIndex;
  if (current === "-" || isAsciiDigit(current)) return scanJsonNumber(text, index);
  throw strictJsonFault();
}

function scanJsonString(text, startIndex) {
  if (text[startIndex] !== "\"") throw strictJsonFault();
  let index = startIndex + 1;
  while (index < text.length) {
    const current = text[index];
    if (current === "\"") {
      const nextIndex = index + 1;
      return {
        decoded: JSON.parse(text.slice(startIndex, nextIndex)),
        nextIndex,
      };
    }
    if (current.charCodeAt(0) <= 0x1f) throw strictJsonFault();
    if (current !== "\\") {
      index += 1;
      continue;
    }

    const escaped = text[index + 1];
    if (["\"", "\\", "/", "b", "f", "n", "r", "t"].includes(escaped)) {
      index += 2;
      continue;
    }
    if (escaped !== "u" || !hasFourHexDigits(text, index + 2)) {
      throw strictJsonFault();
    }
    index += 6;
  }
  throw strictJsonFault();
}

function scanJsonNumber(text, startIndex) {
  let index = startIndex;
  if (text[index] === "-") index += 1;

  if (text[index] === "0") {
    index += 1;
  } else {
    if (!isNonZeroAsciiDigit(text[index])) throw strictJsonFault();
    while (isAsciiDigit(text[index])) index += 1;
  }

  if (text[index] === ".") {
    index += 1;
    if (!isAsciiDigit(text[index])) throw strictJsonFault();
    while (isAsciiDigit(text[index])) index += 1;
  }

  if (text[index] === "e" || text[index] === "E") {
    index += 1;
    if (text[index] === "+" || text[index] === "-") index += 1;
    if (!isAsciiDigit(text[index])) throw strictJsonFault();
    while (isAsciiDigit(text[index])) index += 1;
  }
  return index;
}

function skipJsonWhitespace(text, startIndex) {
  let index = startIndex;
  while ([" ", "\t", "\n", "\r"].includes(text[index])) index += 1;
  return index;
}

function hasFourHexDigits(text, startIndex) {
  if (startIndex + 4 > text.length) return false;
  for (let index = startIndex; index < startIndex + 4; index += 1) {
    if (!/[0-9a-f]/i.test(text[index])) return false;
  }
  return true;
}

function isAsciiDigit(value) {
  return value >= "0" && value <= "9";
}

function isNonZeroAsciiDigit(value) {
  return value >= "1" && value <= "9";
}

function strictJsonFault() {
  return new SyntaxError("Invalid secret record JSON.");
}

function createOpaqueContext(secretBytes, cryptoApi) {
  if (!(secretBytes instanceof Uint8Array) || secretBytes.length !== SECRET_BYTES) {
    throw fault("secret_unavailable");
  }
  if (typeof cryptoApi?.createHmac !== "function") throw fault("secret_unavailable");

  const localSecret = Buffer.from(secretBytes);
  secretBytes.fill(0);
  const createHmac = cryptoApi.createHmac.bind(cryptoApi);
  return Object.freeze({
    algorithm: ALGORITHM,
    keyId: KEY_ID,
    derive({ namespace, canonicalInput } = {}) {
      if (
        typeof namespace !== "string"
        || namespace.length === 0
        || namespace.includes("\0")
        || typeof canonicalInput !== "string"
      ) {
        throw new TypeError("Invalid opaque secret derivation input.");
      }
      try {
        return createHmac("sha256", localSecret)
          .update(namespace, "utf8")
          .update("\0", "utf8")
          .update(canonicalInput, "utf8")
          .digest("base64url");
      } catch {
        throw new Error("Opaque secret derivation is unavailable.");
      }
    },
  });
}

async function initializeSecret({ fsApi, cryptoApi, resolution }) {
  let generatedBytes;
  let temporaryPath;
  let temporaryHandle;
  let temporaryMayExist = false;
  try {
    generatedBytes = randomSecretBytes(cryptoApi);
    const encoded = generatedBytes.toString("base64url");
    const serialized = `${JSON.stringify({
      format_version: FORMAT_VERSION,
      algorithm: ALGORITHM,
      key_id: KEY_ID,
      secret_b64url: encoded,
    }, null, 2)}\n`;
    temporaryPath = path.join(
      path.dirname(resolution.secretPath),
      `.installation-secret.${randomIdentifier(cryptoApi)}.tmp`,
    );

    temporaryHandle = await fsApi.open(temporaryPath, "wx", FILE_MODE);
    temporaryMayExist = true;
    const temporaryStat = await temporaryHandle.stat();
    validateSecretFileStat(temporaryStat);
    await temporaryHandle.writeFile(serialized, "utf8");
    await temporaryHandle.sync();
    await temporaryHandle.close();
    temporaryHandle = undefined;

    try {
      await fsApi.link(temporaryPath, resolution.secretPath);
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      await unlinkTemporary(fsApi, temporaryPath);
      temporaryMayExist = false;
      const winner = await readSecretContext({
        fsApi,
        cryptoApi,
        secretPath: resolution.secretPath,
      });
      return success(winner, false);
    }

    await fsyncDirectory(fsApi, path.dirname(resolution.secretPath));
    await unlinkTemporary(fsApi, temporaryPath);
    temporaryMayExist = false;

    const winner = await readSecretContext({
      fsApi,
      cryptoApi,
      secretPath: resolution.secretPath,
    });
    return success(winner, true);
  } catch (error) {
    if (temporaryHandle !== undefined) {
      try { await temporaryHandle.close(); } catch { /* preserve the primary failure */ }
    }
    if (temporaryMayExist && temporaryPath !== undefined) {
      try {
        await unlinkTemporary(fsApi, temporaryPath);
      } catch {
        return failure("secret_unavailable");
      }
    }
    return failure(reasonCodeFor(error));
  } finally {
    if (generatedBytes !== undefined) generatedBytes.fill(0);
  }
}

function randomSecretBytes(cryptoApi) {
  if (typeof cryptoApi?.randomBytes !== "function") throw fault("secret_unavailable");
  const generated = cryptoApi.randomBytes(SECRET_BYTES);
  if (!(generated instanceof Uint8Array) || generated.length !== SECRET_BYTES) {
    throw fault("secret_unavailable");
  }
  const localCopy = Buffer.from(generated);
  generated.fill(0);
  return localCopy;
}

function randomIdentifier(cryptoApi) {
  if (typeof cryptoApi?.randomUUID !== "function") throw fault("secret_unavailable");
  const identifier = cryptoApi.randomUUID();
  if (typeof identifier !== "string" || !/^[0-9a-f-]{36}$/i.test(identifier)) {
    throw fault("secret_unavailable");
  }
  return identifier;
}

async function fsyncDirectory(fsApi, directory) {
  let handle;
  let operationError;
  try {
    handle = await fsApi.open(directory, "r");
    await handle.sync();
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    if (handle !== undefined) {
      try {
        await handle.close();
      } catch (closeError) {
        if (operationError === undefined) throw closeError;
      }
    }
  }
}

async function unlinkTemporary(fsApi, temporaryPath) {
  try {
    await fsApi.unlink(temporaryPath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

function hasExactFields(value, fields) {
  const keys = Object.keys(value);
  return keys.length === fields.length && fields.every(field => Object.hasOwn(value, field));
}

function permissionBits(stat) {
  return stat.mode & 0o777;
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function fault(reasonCode) {
  return new SecretLifecycleFault(reasonCode);
}

function isFault(error, reasonCode) {
  return error instanceof SecretLifecycleFault && error.reasonCode === reasonCode;
}

function reasonCodeFor(error) {
  return error instanceof SecretLifecycleFault
    ? error.reasonCode
    : "secret_unavailable";
}

function success(value, changed) {
  return { ok: true, value, changed };
}

function failure(reasonCode) {
  return { ok: false, reason_code: reasonCode, changed: false };
}
