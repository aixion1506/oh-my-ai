import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const STATE_FILE = "work-start-execution-state.json";
const SUGGESTION_STATE_FILE = "work-start-suggestions.json";
const EXECUTION_TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 20;
const SUPPORTED_RUNTIMES = new Set(["claude", "codex"]);

export function rememberWorkStartExecution(cwd, runtime, sessionId, task) {
  const root = targetRepositoryRoot(cwd);
  const normalizedRuntime = normalizeRuntime(runtime);
  const normalizedTask = normalizeTask(task);
  const normalizedSession = normalizeSession(sessionId);
  if (!root || !normalizedRuntime || !normalizedTask || !normalizedSession) return;

  const now = Date.now();
  const statePath = repositoryStatePath(root, STATE_FILE);
  if (!statePath) return;
  const state = readState(statePath, now);
  state.executions.unshift({
    runtime: normalizedRuntime,
    task_hash: taskHash(normalizedTask),
    session_hash: sessionHash(normalizedSession),
    executed_at: new Date(now).toISOString(),
  });
  writeState(statePath, trimState(state));
}

export function hasRecentWorkStartExecution(cwd, runtime, sessionId, prompt) {
  const root = targetRepositoryRoot(cwd);
  const normalizedRuntime = normalizeRuntime(runtime);
  const normalizedPrompt = normalizeTask(prompt);
  const normalizedSession = normalizeSession(sessionId);
  if (!root || !normalizedRuntime || !normalizedPrompt || !normalizedSession) return false;

  const statePath = repositoryStatePath(root, STATE_FILE);
  if (!statePath) return false;
  const state = readState(statePath, Date.now());
  const promptHash = taskHash(normalizedPrompt);
  const currentSessionHash = sessionHash(normalizedSession);
  return state.executions.some(entry => (
    entry.runtime === normalizedRuntime
      && entry.task_hash === promptHash
      && entry.session_hash === currentSessionHash
  ));
}

export function workStartSuggestionStatePath(cwd) {
  const root = targetRepositoryRoot(cwd);
  return root ? repositoryStatePath(root, SUGGESTION_STATE_FILE) : "";
}

function targetRepositoryRoot(cwd) {
  try {
    const result = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd, encoding: "utf8" });
    return result.status === 0 ? result.stdout.trim() : "";
  } catch {
    return "";
  }
}

function normalizeTask(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeSession(value) {
  return String(value || "").trim();
}

function normalizeRuntime(value) {
  const runtime = String(value || "").trim();
  return SUPPORTED_RUNTIMES.has(runtime) ? runtime : "";
}

function taskHash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sessionHash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function readState(statePath, now) {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, "utf8"));
    return {
      executions: validEntries(parsed.executions, now),
    };
  } catch {
    return { executions: [] };
  }
}

function validEntries(entries, now) {
  if (!Array.isArray(entries)) return [];
  return entries.filter(entry => {
    const timestamp = Date.parse(entry.executed_at);
    return SUPPORTED_RUNTIMES.has(entry.runtime)
      && typeof entry.task_hash === "string"
      && typeof entry.session_hash === "string"
      && Number.isFinite(timestamp)
      && now - timestamp >= 0
      && now - timestamp <= EXECUTION_TTL_MS;
  });
}

function trimState(state) {
  return {
    version: 3,
    executions: state.executions.slice(0, MAX_ENTRIES),
  };
}

function writeState(statePath, state) {
  try {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    if (!isSafeStatePath(statePath)) return;
    const temporaryPath = `${statePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    fs.renameSync(temporaryPath, statePath);
  } catch {
    // Post-execution suppression is best-effort and must not change Engine success.
  }
}

function repositoryStatePath(root, fileName) {
  const statePath = path.join(root, ".oh-my-ai", "state", fileName);
  return isSafeStatePath(statePath) ? statePath : "";
}

function isSafeStatePath(statePath) {
  const stateDirectory = path.dirname(statePath);
  const harnessDirectory = path.dirname(stateDirectory);
  return !isSymbolicLink(harnessDirectory)
    && !isSymbolicLink(stateDirectory)
    && !isSymbolicLink(statePath);
}

function isSymbolicLink(candidate) {
  try {
    return fs.lstatSync(candidate).isSymbolicLink();
  } catch (error) {
    return error?.code === "ENOENT" ? false : true;
  }
}
