#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const command = args[0];

if (command === "hook") {
  runHook(args.slice(1));
} else if (command === "work-start") {
  runWorkStart(args.slice(1));
} else {
  usage(command ? `unknown command: ${command}` : "");
}

function runWorkStart(args) {
  const taskArgs = args[0] === "--" ? args.slice(1) : args;
  const task = taskArgs.length > 0 ? taskArgs.join(" ") : (process.env.TASK || "");
  if (!task.trim()) {
    process.stderr.write("usage: oh-my-ai work-start -- <task>\n");
    process.exit(2);
  }

  const repoRoot = findRepoRoot();
  const engine = path.join(repoRoot, "scripts", "work-start.sh");
  try {
    fs.accessSync(engine, fs.constants.X_OK);
  } catch {
    process.stderr.write(`work-start engine is unavailable: ${engine}\n`);
    process.exit(1);
  }

  // Keep the caller's cwd: work-start resolves the target repository from it.
  const result = spawnSync(engine, [], {
    cwd: process.cwd(),
    env: { ...process.env, TASK: task },
    stdio: "inherit",
  });
  if (result.error) {
    process.stderr.write(`work-start engine failed to start: ${result.error.message}\n`);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

function runHook(args) {
  const runtime = args[0] || "";
  const eventName = args[1] || "";
  const input = readStdin();

  if (eventName === "SessionStart") {
    runSessionStart(runtime);
    process.exit(0);
  }

  if (eventName !== "UserPromptSubmit") {
    process.exit(0);
  }

  const format =
    runtime === "claude"
      ? "claude-json"
      : runtime === "codex"
        ? "codex-json"
        : "";

  if (!format) {
    logHookFailure({ runtime, eventName, reason: "unsupported runtime" });
    process.exit(0);
  }

  const repoRoot = findRepoRoot();
  const hookScript = path.join(repoRoot, "scripts", "prompt-routing-hook.mjs");
  if (!fs.existsSync(hookScript)) {
    logHookFailure({ runtime, eventName, reason: "missing prompt-routing-hook.mjs", repoRoot });
    process.exit(0);
  }

  const result = spawnSync(process.execPath, [hookScript, `--format=${format}`], {
    input,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.status !== 0 || result.error) {
    logHookFailure({
      runtime,
      eventName,
      reason: result.error ? result.error.message : `exit ${result.status}`,
      stderr: result.stderr,
    });
  }

  process.exit(0);
}

function runSessionStart(runtime) {
  if (runtime !== "claude") return;

  const repoRoot = findRepoRoot();
  const backlog = path.join(repoRoot, "automation-backlog.md");
  try {
    if (fs.existsSync(backlog)) {
      process.stdout.write(fs.readFileSync(backlog, "utf8"));
    }
  } catch (error) {
    logHookFailure({ runtime, eventName: "SessionStart", reason: error.message });
  }
}

function readStdin() {
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function findRepoRoot() {
  if (process.env.OH_MY_AI_HOME) return process.env.OH_MY_AI_HOME;

  const entrypoint = fs.realpathSync(process.argv[1] || fileURLToPath(import.meta.url));
  return path.resolve(path.dirname(entrypoint), "..");
}

function logHookFailure(details) {
  const repoRoot = safeRepoRoot();
  const entry = {
    ts: new Date().toISOString(),
    source: "oh-my-ai",
    ...details,
  };

  for (const file of hookFailureLogCandidates(repoRoot)) {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.appendFileSync(file, JSON.stringify(entry) + "\n", "utf8");
      return;
    } catch {
      // Hook diagnostics must never block prompt submission.
    }
  }
}

function hookFailureLogCandidates(repoRoot) {
  const stateHome = process.env.XDG_STATE_HOME || path.join(process.env.HOME || "", ".local", "state");
  return [
    path.join(stateHome, "oh-my-ai", "hook-failures.log"),
    path.join(repoRoot, ".oh-my-ai", "state", "hook-failures.log"),
  ];
}

function safeRepoRoot() {
  try {
    return findRepoRoot();
  } catch {
    return process.cwd();
  }
}

function usage(error) {
  if (error) process.stderr.write(`${error}\n`);
  process.stderr.write("usage: oh-my-ai hook <codex|claude> <UserPromptSubmit>\n");
  process.stderr.write("       oh-my-ai work-start -- <task>\n");
  process.exit(error ? 2 : 0);
}
