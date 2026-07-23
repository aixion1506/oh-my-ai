import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const STATE_FILE = path.join(".oh-my-ai", "state", "work-start-executions.json");
const EXECUTION_TTL_MS = 5 * 60 * 1000;
const MAX_ENTRIES = 20;

export function rememberExplicitWorkStartInvocation(cwd, sessionId, task) {
  const root = targetRepositoryRoot(cwd);
  const normalizedTask = normalizeTask(task);
  const normalizedSession = normalizeSession(sessionId);
  if (!root || !normalizedTask || !normalizedSession) return;

  const now = Date.now();
  const statePath = path.join(root, STATE_FILE);
  const state = readState(statePath, now);
  state.invocations.unshift({
    task_hash: taskHash(normalizedTask),
    session_hash: sessionHash(normalizedSession),
    invoked_at: new Date(now).toISOString(),
  });
  writeState(statePath, trimState(state));
}

export function rememberWorkStartExecution(cwd, task, sessionId) {
  const root = targetRepositoryRoot(cwd);
  const normalizedTask = normalizeTask(task);
  if (!root || !normalizedTask) return;

  const now = Date.now();
  const statePath = path.join(root, STATE_FILE);
  const state = readState(statePath, now);
  const taskHashValue = taskHash(normalizedTask);
  const resolvedSessionHash = normalizeSession(sessionId)
    ? sessionHash(normalizeSession(sessionId))
    : state.invocations.find(entry => entry.task_hash === taskHashValue)?.session_hash;
  if (!resolvedSessionHash) return;

  state.executions.unshift({
    task_hash: taskHashValue,
    session_hash: resolvedSessionHash,
    executed_at: new Date(now).toISOString(),
  });
  writeState(statePath, trimState(state));
}

export function hasRecentWorkStartExecution(cwd, sessionId, prompt) {
  const root = targetRepositoryRoot(cwd);
  const normalizedPrompt = normalizeTask(prompt);
  const normalizedSession = normalizeSession(sessionId);
  if (!root || !normalizedPrompt || !normalizedSession) return false;

  const state = readState(path.join(root, STATE_FILE), Date.now());
  const promptHash = taskHash(normalizedPrompt);
  const currentSessionHash = sessionHash(normalizedSession);
  return state.executions.some(entry => (
    entry.task_hash === promptHash && entry.session_hash === currentSessionHash
  ));
}

export function workStartSuggestionStatePath(cwd) {
  const root = targetRepositoryRoot(cwd);
  return root ? path.join(root, ".oh-my-ai", "state", "work-start-suggestions.json") : "";
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
      executions: validEntries(parsed.executions, "executed_at", now),
      invocations: validEntries(parsed.invocations, "invoked_at", now),
    };
  } catch {
    return { executions: [], invocations: [] };
  }
}

function validEntries(entries, timestampField, now) {
  if (!Array.isArray(entries)) return [];
  return entries.filter(entry => {
    const timestamp = Date.parse(entry[timestampField]);
    return typeof entry.task_hash === "string"
      && typeof entry.session_hash === "string"
      && Number.isFinite(timestamp)
      && now - timestamp >= 0
      && now - timestamp <= EXECUTION_TTL_MS;
  });
}

function trimState(state) {
  return {
    version: 2,
    executions: state.executions.slice(0, MAX_ENTRIES),
    invocations: state.invocations.slice(0, MAX_ENTRIES),
  };
}

function writeState(statePath, state) {
  try {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    const temporaryPath = `${statePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
    fs.renameSync(temporaryPath, statePath);
  } catch {
    // Post-execution suppression is best-effort and must not change Engine success.
  }
}
