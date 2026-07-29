#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  checkpointStatus,
  resolveCheckpoint,
} from "./lib/context-checkpoint-state.mjs";

const productRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const publicEntry = path.join(productRoot, "scripts", "oh-my-ai.mjs");
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "oh-my-ai-context-checkpoint-codex."));

try {
  const lifecycleRepo = makeRepository("codex-lifecycle");
  const lifecycleEnv = fixtureEnvironment("lifecycle");

  const readOnly = runHook(lifecycleRepo, lifecycleEnv, "PostToolUse", {
    session_id: "codex-session-a",
    turn_id: "codex-turn-read",
    cwd: lifecycleRepo,
    hook_event_name: "PostToolUse",
    tool_name: "Bash",
    tool_input: { command: "git status --short" },
    tool_response: { stdout: "", stderr: "", exit_code: 0 },
    tool_use_id: "codex-tool-read",
  });
  assert.equal(readOnly.status, 0);
  assert.equal(checkpointStatus({ cwd: lifecycleRepo, env: lifecycleEnv }).checkpoint_state, "clean");
  pass("Codex adapter: read-only Tool은 Activity가 아님");

  const fileMutation = runHook(lifecycleRepo, lifecycleEnv, "PostToolUse", {
    session_id: "codex-session-a",
    turn_id: "codex-turn-write",
    cwd: lifecycleRepo,
    hook_event_name: "PostToolUse",
    tool_name: "apply_patch",
    tool_input: {
      command: "*** Begin Patch\n*** Add File: /private/codex-secret.txt\n+SECRET_PROMPT_MARKER\n*** End Patch\n",
    },
    tool_response: { output: "RAW_CODEX_TOOL_OUTPUT_MARKER" },
    tool_use_id: "codex-tool-write",
  });
  assert.equal(fileMutation.status, 0);
  const reviewNeeded = checkpointStatus({ cwd: lifecycleRepo, env: lifecycleEnv });
  assert.equal(reviewNeeded.availability, "available");
  assert.equal(reviewNeeded.checkpoint_state, "review_needed");
  assert.deepEqual(reviewNeeded.activity_signal_kinds, ["file_mutation"]);
  pass("Codex adapter: apply_patch Activity는 review_needed");

  const sessionEnd = runHook(lifecycleRepo, lifecycleEnv, "SessionEnd", {
    session_id: "codex-session-a",
    cwd: lifecycleRepo,
    hook_event_name: "SessionEnd",
    reason: "other",
  });
  assert.equal(sessionEnd.status, 0);
  assert.equal(sessionEnd.stdout, "");
  assert.equal(checkpointStatus({ cwd: lifecycleRepo, env: lifecycleEnv }).checkpoint_state, "review_needed");
  pass("Codex adapter: SessionEnd는 advisory이고 기존 Activity를 보존");

  const sessionStart = runHook(lifecycleRepo, lifecycleEnv, "SessionStart", {
    session_id: "codex-session-b",
    cwd: lifecycleRepo,
    hook_event_name: "SessionStart",
    source: "startup",
  });
  assert.equal(sessionStart.status, 0);
  const diagnostic = JSON.parse(sessionStart.stdout);
  assert.match(diagnostic.systemMessage, /Project Context 검토가 완료되지 않았습니다/);
  assert.match(diagnostic.hookSpecificOutput.additionalContext, /Context Checkpoint 진행/);
  const repeatedStart = runHook(lifecycleRepo, lifecycleEnv, "SessionStart", {
    session_id: "codex-session-b",
    cwd: lifecycleRepo,
    hook_event_name: "SessionStart",
    source: "startup",
  });
  assert.equal(repeatedStart.status, 0);
  assert.equal(repeatedStart.stdout, "");
  pass("Codex adapter: 다음 Session one-time diagnostic");

  const noUpdate = runEntry(lifecycleRepo, lifecycleEnv, [
    "context-checkpoint",
    "resolve",
    "no-update",
    "--json",
  ]);
  assert.equal(noUpdate.status, 0);
  assert.equal(JSON.parse(noUpdate.stdout).resolution, "no_update");
  assert.equal(checkpointStatus({ cwd: lifecycleRepo, env: lifecycleEnv }).checkpoint_state, "clean");

  const validation = runHook(lifecycleRepo, lifecycleEnv, "PostToolUse", {
    session_id: "codex-session-b",
    turn_id: "codex-turn-validation",
    cwd: lifecycleRepo,
    hook_event_name: "PostToolUse",
    tool_name: "Bash",
    tool_input: { command: "make test-context-checkpoint-fixtures" },
    tool_response: { stdout: "PRIVATE_VALIDATION_OUTPUT_MARKER", stderr: "", exit_code: 0 },
    tool_use_id: "codex-tool-validation",
  });
  assert.equal(validation.status, 0);
  const validationStatus = checkpointStatus({ cwd: lifecycleRepo, env: lifecycleEnv });
  assert.equal(validationStatus.checkpoint_state, "review_needed");
  assert.deepEqual(validationStatus.activity_signal_kinds, ["validation_run"]);
  pass("Codex adapter: validation_run과 no_update 이후 재진입");

  const handoffRepo = makeRepository("codex-explicit-handoff");
  const handoffEnv = fixtureEnvironment("handoff");
  const ordinaryPrompt = runHook(handoffRepo, handoffEnv, "UserPromptSubmit", {
    session_id: "codex-handoff-session",
    turn_id: "codex-ordinary-turn",
    cwd: handoffRepo,
    hook_event_name: "UserPromptSubmit",
    prompt: "현재 상태를 설명해줘",
  });
  assert.equal(ordinaryPrompt.status, 0);
  assert.equal(ordinaryPrompt.stdout, "");
  assert.equal(checkpointStatus({ cwd: handoffRepo, env: handoffEnv }).checkpoint_state, "clean");
  const handoffBoundary = runHook(handoffRepo, handoffEnv, "UserPromptSubmit", {
    session_id: "codex-handoff-session",
    turn_id: "codex-handoff-turn",
    cwd: handoffRepo,
    hook_event_name: "UserPromptSubmit",
    prompt: "$handoff 다음 세션으로 전달",
  });
  assert.equal(handoffBoundary.status, 0);
  const handoffStatus = checkpointStatus({ cwd: handoffRepo, env: handoffEnv });
  assert.equal(handoffStatus.checkpoint_state, "review_needed");
  assert.deepEqual(handoffStatus.activity_signal_kinds, ["explicit_handoff_boundary"]);
  pass("Codex adapter: explicit handoff invocation만 Activity로 기록");

  const scopeRepo = makeRepository("codex-session-scope");
  const scopeEnv = fixtureEnvironment("scope");
  for (const [sessionId, eventId] of [
    ["codex-scope-a", "codex-scope-event-a"],
    ["codex-scope-b", "codex-scope-event-b"],
  ]) {
    const activity = runHook(scopeRepo, scopeEnv, "PostToolUse", {
      session_id: sessionId,
      turn_id: `${eventId}-turn`,
      cwd: scopeRepo,
      hook_event_name: "PostToolUse",
      tool_name: "apply_patch",
      tool_input: { command: `PRIVATE_PATCH_${eventId}` },
      tool_response: { output: `PRIVATE_OUTPUT_${eventId}` },
      tool_use_id: eventId,
    });
    assert.equal(activity.status, 0);
  }
  const scoped = checkpointStatus({ cwd: scopeRepo, env: scopeEnv });
  assert.equal(scoped.unresolved_count, 2);
  assert.notEqual(scoped.unresolved_epochs[0].epoch_id, scoped.unresolved_epochs[1].epoch_id);
  assert.notEqual(scoped.unresolved_epochs[0].session_hash, scoped.unresolved_epochs[1].session_hash);

  const sessionC = runHook(scopeRepo, scopeEnv, "SessionStart", {
    session_id: "codex-scope-c",
    cwd: scopeRepo,
    hook_event_name: "SessionStart",
    source: "startup",
  });
  assert.match(JSON.parse(sessionC.stdout).systemMessage, /미해결 Context Checkpoint: 2개/);
  const sessionA = runHook(scopeRepo, scopeEnv, "SessionStart", {
    session_id: "codex-scope-a",
    cwd: scopeRepo,
    hook_event_name: "SessionStart",
    source: "resume",
  });
  assert.match(JSON.parse(sessionA.stdout).systemMessage, /미해결 Context Checkpoint: 1개/);

  const firstEpoch = scoped.unresolved_epochs[0].epoch_id;
  const secondEpoch = scoped.unresolved_epochs[1].epoch_id;
  const ambiguousResolution = resolveCheckpoint({
    cwd: scopeRepo,
    resolution: "no_update",
    env: scopeEnv,
  });
  assert.equal(ambiguousResolution.reason_code, "multiple_unresolved_checkpoints");
  const targetedResolution = runEntry(scopeRepo, scopeEnv, [
    "context-checkpoint",
    "resolve",
    "checkpointed",
    "--promotion-source",
    "codex-context-checkpoint-fixture",
    "--epoch",
    firstEpoch,
    "--json",
  ]);
  assert.equal(targetedResolution.status, 0);
  const afterTargetedResolution = JSON.parse(targetedResolution.stdout);
  assert.equal(afterTargetedResolution.resolution, "checkpointed");
  assert.equal(afterTargetedResolution.unresolved_count, 1);
  assert.equal(afterTargetedResolution.unresolved_epochs[0].epoch_id, secondEpoch);
  pass("Codex adapter: Session A/B와 명시적 Epoch Resolution 격리");

  const isolatedRepo = makeRepository("codex-isolated-repository");
  assert.equal(checkpointStatus({ cwd: isolatedRepo, env: scopeEnv }).checkpoint_state, "clean");
  const linkedWorktree = makeLinkedWorktree(scopeRepo);
  assert.equal(checkpointStatus({ cwd: linkedWorktree, env: scopeEnv }).checkpoint_state, "clean");
  pass("Codex adapter: Repository와 Worktree 격리");

  const unavailableRepo = makeRepository("codex-unavailable-storage");
  const unavailableXdg = path.join(sandbox, "codex-unavailable-xdg");
  fs.writeFileSync(unavailableXdg, "not a directory\n", "utf8");
  fs.writeFileSync(path.join(unavailableRepo, ".oh-my-ai"), "not a directory\n", "utf8");
  const unavailableEnv = {
    ...fixtureEnvironment("unavailable"),
    HOME: "",
    XDG_STATE_HOME: unavailableXdg,
  };
  const unavailableActivity = runHook(unavailableRepo, unavailableEnv, "PostToolUse", {
    session_id: "codex-unavailable-session",
    turn_id: "codex-unavailable-turn",
    cwd: unavailableRepo,
    hook_event_name: "PostToolUse",
    tool_name: "apply_patch",
    tool_input: { command: "PRIVATE_UNAVAILABLE_PATCH" },
    tool_response: { output: "PRIVATE_UNAVAILABLE_OUTPUT" },
    tool_use_id: "codex-unavailable-tool",
  });
  assert.equal(unavailableActivity.status, 0);
  assert.match(unavailableActivity.stdout, /availability: unavailable/);
  assert.equal(checkpointStatus({ cwd: unavailableRepo, env: unavailableEnv }).availability, "unavailable");
  pass("Codex adapter: Storage와 Hook 실패는 fail-open unavailable");

  const malformed = runEntry(
    lifecycleRepo,
    lifecycleEnv,
    ["hook", "codex", "PostToolUse"],
    "{ malformed",
  );
  assert.equal(malformed.status, 0);
  assert.match(malformed.stdout, /Manual Context Checkpoint/);

  const storedState = allFiles(sandbox)
    .filter(file => file.endsWith("context-checkpoint-state.json"))
    .map(file => fs.readFileSync(file, "utf8"))
    .join("\n");
  for (const forbidden of [
    "SECRET_PROMPT_MARKER",
    "RAW_CODEX_TOOL_OUTPUT_MARKER",
    "PRIVATE_VALIDATION_OUTPUT_MARKER",
    "$handoff 다음 세션으로 전달",
    "/private/codex-secret.txt",
    "codex-session-a",
    "codex-tool-write",
  ]) {
    assert.equal(storedState.includes(forbidden), false, `Codex state leaked ${forbidden}`);
  }
  pass("Codex adapter: Prompt·Tool Input·Output·Identifier 원문 미저장");

  const managedHooks = JSON.parse(fs.readFileSync(path.join(productRoot, "codex", "hooks.json"), "utf8"));
  assert.equal(managedHooks.hooks.SessionStart.length, 1);
  assert.equal(managedHooks.hooks.SessionStart[0].matcher, "startup|resume|clear");
  assert.match(managedHooks.hooks.SessionStart[0].hooks[0].command, /hook codex SessionStart/);
  assert.equal(managedHooks.hooks.PostToolUse.length, 1);
  assert.equal(managedHooks.hooks.PostToolUse[0].matcher, "apply_patch|Bash");
  assert.match(managedHooks.hooks.PostToolUse[0].hooks[0].command, /hook codex PostToolUse/);
  assert.equal(managedHooks.hooks.SessionEnd.length, 1);
  assert.match(managedHooks.hooks.SessionEnd[0].hooks[0].command, /hook codex SessionEnd/);
  pass("Codex adapter: 공식 Hook source shape");
} finally {
  fs.rmSync(sandbox, { recursive: true, force: true });
}

function fixtureEnvironment(name) {
  return {
    ...process.env,
    HOME: path.join(sandbox, `${name}-home`),
    XDG_STATE_HOME: path.join(sandbox, `${name}-state`),
  };
}

function makeRepository(name) {
  const directory = path.join(sandbox, name);
  fs.mkdirSync(directory, { recursive: true });
  runGit(directory, ["init", "-q"]);
  runGit(directory, ["config", "user.email", "fixture@example.invalid"]);
  runGit(directory, ["config", "user.name", "Fixture"]);
  fs.writeFileSync(path.join(directory, "README.md"), `${name}\n`, "utf8");
  runGit(directory, ["add", "README.md"]);
  runGit(directory, ["commit", "-qm", "fixture"]);
  return directory;
}

function makeLinkedWorktree(repository) {
  const directory = path.join(sandbox, "codex-linked-worktree");
  runGit(repository, ["worktree", "add", "-q", "-b", "codex-fixture-linked", directory]);
  return directory;
}

function runHook(cwd, env, eventName, payload) {
  return runEntry(cwd, env, ["hook", "codex", eventName], payload);
}

function runEntry(cwd, env, args, payload) {
  return spawnSync(process.execPath, [publicEntry, ...args], {
    cwd,
    env,
    input: payload === undefined
      ? ""
      : typeof payload === "string"
        ? payload
        : JSON.stringify(payload),
    encoding: "utf8",
  });
}

function runGit(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

function allFiles(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => path.join(entry.parentPath, entry.name));
}

function pass(label) {
  process.stdout.write(`passed: ${label}\n`);
}
