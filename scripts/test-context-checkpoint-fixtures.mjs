#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import {
  checkpointHandoffPreflight,
  checkpointStatus,
  notifyUnresolvedCheckpoint,
  recordCheckpointActivity,
  resolveCheckpoint,
} from "./lib/context-checkpoint-state.mjs";

const productRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const publicEntry = path.join(productRoot, "scripts", "oh-my-ai.mjs");
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "oh-my-ai-context-checkpoint."));
const cleanup = [];

try {
  const primary = makeRepository("primary");
  const isolated = makeRepository("isolated");
  const stateHome = path.join(sandbox, "state");
  const fixtureEnv = {
    ...process.env,
    HOME: path.join(sandbox, "home"),
    XDG_STATE_HOME: stateHome,
  };

  const noActivity = checkpointStatus({ cwd: primary, env: fixtureEnv });
  assert.equal(noActivity.availability, "available");
  assert.equal(noActivity.checkpoint_state, "clean");
  pass("FX-CCG-002 activity 없음은 clean");

  const firstActivity = recordCheckpointActivity({
    cwd: primary,
    runtime: "claude",
    sessionId: "session-one",
    eventId: "tool-use-one",
    signalKind: "file_mutation",
    env: fixtureEnv,
  });
  assert.equal(firstActivity.availability, "available");
  assert.equal(firstActivity.checkpoint_state, "review_needed");
  assert.deepEqual(firstActivity.activity_signal_kinds, ["file_mutation"]);
  pass("FX-CCG-001 Work-start 비의존 Activity는 review_needed");

  const firstEpoch = firstActivity.epoch_id;
  const duplicateActivity = recordCheckpointActivity({
    cwd: primary,
    runtime: "claude",
    sessionId: "session-one",
    eventId: "tool-use-one",
    signalKind: "file_mutation",
    env: fixtureEnv,
  });
  assert.equal(duplicateActivity.epoch_id, firstEpoch);
  assert.equal(duplicateActivity.activity_revision, 1);

  const checkpointed = resolveCheckpoint({
    cwd: primary,
    resolution: "checkpointed",
    promotionSourceRef: "context-checkpoint-20260728-a",
    env: fixtureEnv,
  });
  assert.equal(checkpointed.availability, "available");
  assert.equal(checkpointed.checkpoint_state, "clean");
  assert.equal(checkpointed.resolution, "checkpointed");
  assert.notEqual(checkpointed.epoch_id, firstEpoch);
  const repeatedCheckpoint = resolveCheckpoint({
    cwd: primary,
    resolution: "checkpointed",
    promotionSourceRef: "context-checkpoint-20260728-a",
    env: fixtureEnv,
  });
  assert.equal(repeatedCheckpoint.changed, false);
  assert.equal(repeatedCheckpoint.resolution, "checkpointed");
  pass("FX-CCG-003 Human-confirmed checkpoint는 멱등 해결");

  const beforeNoUpdate = recordCheckpointActivity({
    cwd: primary,
    runtime: "claude",
    sessionId: "session-two",
    eventId: "tool-use-two",
    signalKind: "validation_run",
    env: fixtureEnv,
  });
  const noUpdate = resolveCheckpoint({
    cwd: primary,
    resolution: "no_update",
    env: fixtureEnv,
  });
  assert.equal(noUpdate.checkpoint_state, "clean");
  assert.equal(noUpdate.resolution, "no_update");
  const repeatedNoUpdate = resolveCheckpoint({
    cwd: primary,
    resolution: "no_update",
    env: fixtureEnv,
  });
  assert.equal(repeatedNoUpdate.changed, false);
  pass("FX-CCG-004 Human-confirmed no_update는 멱등 해결");

  const afterResolution = recordCheckpointActivity({
    cwd: primary,
    runtime: "claude",
    sessionId: "session-three",
    eventId: "tool-use-three",
    signalKind: "file_mutation",
    env: fixtureEnv,
  });
  assert.equal(afterResolution.checkpoint_state, "review_needed");
  assert.equal(afterResolution.activity_revision, 1);
  assert.notEqual(afterResolution.epoch_id, beforeNoUpdate.epoch_id);
  assert.equal(afterResolution.epoch_id, noUpdate.epoch_id);
  const oneTime = notifyUnresolvedCheckpoint({
    cwd: primary,
    runtime: "claude",
    sessionId: "session-four",
    boundaryKind: "SessionStart",
    env: fixtureEnv,
  });
  assert.equal(oneTime.notify, true);
  const suppressed = notifyUnresolvedCheckpoint({
    cwd: primary,
    runtime: "claude",
    sessionId: "session-four",
    boundaryKind: "SessionStart",
    env: fixtureEnv,
  });
  assert.equal(suppressed.notify, false);
  pass("FX-CCG-005 새 Activity는 새 Epoch로 재진입하고 중복은 억제");

  assert.equal(checkpointStatus({ cwd: isolated, env: fixtureEnv }).checkpoint_state, "clean");
  pass("FX-CCG-010 다른 Repository 상태 격리");

  const linkedWorktree = makeLinkedWorktree(primary);
  assert.equal(checkpointStatus({ cwd: linkedWorktree, env: fixtureEnv }).checkpoint_state, "clean");
  pass("FX-CCG-011 같은 Repository의 다른 Worktree 상태 격리");

  const stateFile = findOnlyStateFile(stateHome);
  fs.writeFileSync(stateFile, "{ corrupt json\n", "utf8");
  const corrupt = checkpointStatus({ cwd: primary, env: fixtureEnv });
  assert.equal(corrupt.availability, "unavailable");
  assert.notEqual(corrupt.checkpoint_state, "clean");
  assert.equal(corrupt.manual_checkpoint_required, true);
  pass("FX-CCG-012 손상 State는 unavailable fail-open");

  const privacyRepo = makeRepository("privacy-secret-repository");
  runGit(privacyRepo, ["remote", "add", "origin", "https://token.example/credential.git"]);
  const privacyActivity = recordCheckpointActivity({
    cwd: privacyRepo,
    runtime: "claude",
    sessionId: "secret-session-value",
    eventId: "raw-tool-output-secret",
    signalKind: "file_mutation",
    env: fixtureEnv,
  });
  assert.equal(privacyActivity.availability, "available");
  const privacyState = fs.readFileSync(findStateFileForHash(stateHome, privacyActivity.repository_hash), "utf8");
  for (const forbidden of [
    privacyRepo,
    "https://token.example/credential.git",
    "secret-session-value",
    "raw-tool-output-secret",
  ]) {
    assert.equal(privacyState.includes(forbidden), false, `state leaked ${forbidden}`);
  }
  const rejectedPromotion = resolveCheckpoint({
    cwd: privacyRepo,
    resolution: "checkpointed",
    promotionSourceRef: "/absolute/private/context.md",
    env: fixtureEnv,
  });
  assert.equal(rejectedPromotion.availability, "unavailable");
  assert.notEqual(rejectedPromotion.resolution, "checkpointed");
  pass("FX-CCG-015 Raw Content와 민감 reference 미저장");

  const lifecycle = makeRepository("claude-lifecycle");
  const lifecycleEnv = {
    ...fixtureEnv,
    XDG_STATE_HOME: path.join(sandbox, "lifecycle-state"),
  };
  const activityPayload = {
    session_id: "claude-session-one",
    transcript_path: "/private/transcript/must-not-be-stored.jsonl",
    cwd: lifecycle,
    hook_event_name: "PostToolUse",
    tool_name: "Write",
    tool_input: {
      file_path: path.join(lifecycle, "src", "secret-file.txt"),
      content: "prompt and file content must not be stored",
    },
    tool_response: {
      filePath: path.join(lifecycle, "src", "secret-file.txt"),
      success: true,
    },
    tool_use_id: "tool-use-lifecycle",
  };
  assert.equal(runEntry(lifecycle, lifecycleEnv, ["hook", "claude", "PostToolUse"], activityPayload).status, 0);
  assert.equal(checkpointStatus({ cwd: lifecycle, env: lifecycleEnv }).checkpoint_state, "review_needed");
  const sessionEnd = runEntry(lifecycle, lifecycleEnv, ["hook", "claude", "SessionEnd"], {
    session_id: "claude-session-one",
    transcript_path: "/private/transcript/must-not-be-stored.jsonl",
    cwd: lifecycle,
    hook_event_name: "SessionEnd",
    reason: "other",
  });
  assert.equal(sessionEnd.status, 0);
  const sessionStart = runEntry(lifecycle, lifecycleEnv, ["hook", "claude", "SessionStart"], {
    session_id: "claude-session-two",
    transcript_path: "/private/transcript/must-not-be-stored.jsonl",
    cwd: lifecycle,
    hook_event_name: "SessionStart",
    source: "startup",
  });
  assert.equal(sessionStart.status, 0);
  const diagnostic = JSON.parse(sessionStart.stdout);
  assert.match(diagnostic.systemMessage, /Project Context 검토가 완료되지 않았습니다/);
  assert.match(diagnostic.systemMessage, /Context Checkpoint 진행/);
  assert.match(diagnostic.systemMessage, /no_update/);
  assert.match(diagnostic.systemMessage, /나중에 검토/);
  const repeatedSessionStart = runEntry(lifecycle, lifecycleEnv, ["hook", "claude", "SessionStart"], {
    session_id: "claude-session-two",
    cwd: lifecycle,
    hook_event_name: "SessionStart",
    source: "startup",
  });
  const repeatedDiagnostic = repeatedSessionStart.stdout.trim()
    ? JSON.parse(repeatedSessionStart.stdout).systemMessage || ""
    : "";
  assert.doesNotMatch(repeatedDiagnostic, /Project Context 검토가 완료되지 않았습니다/);
  pass("FX-CCG-006 Claude lifecycle은 다음 Session에 one-time diagnostic");

  const adapterNoActivity = makeRepository("adapter-no-activity");
  const adapterNoActivityEnv = {
    ...fixtureEnv,
    XDG_STATE_HOME: path.join(sandbox, "adapter-no-activity-state"),
  };
  runEntry(adapterNoActivity, adapterNoActivityEnv, ["hook", "claude", "PostToolUse"], {
    session_id: "read-only-session",
    cwd: adapterNoActivity,
    hook_event_name: "PostToolUse",
    tool_name: "Read",
    tool_input: { file_path: path.join(adapterNoActivity, "README.md") },
    tool_response: { success: true, content: "must not be stored" },
    tool_use_id: "read-only-event",
  });
  runEntry(adapterNoActivity, adapterNoActivityEnv, ["hook", "claude", "PostToolUse"], {
    session_id: "read-only-session",
    cwd: adapterNoActivity,
    hook_event_name: "PostToolUse",
    tool_name: "Bash",
    tool_input: { command: "git status --short" },
    tool_response: { stdout: "", stderr: "" },
    tool_use_id: "generic-bash-event",
  });
  assert.equal(
    checkpointStatus({ cwd: adapterNoActivity, env: adapterNoActivityEnv }).checkpoint_state,
    "clean",
  );
  runEntry(adapterNoActivity, adapterNoActivityEnv, ["hook", "claude", "PostToolUse"], {
    session_id: "read-only-session",
    cwd: adapterNoActivity,
    hook_event_name: "PostToolUse",
    tool_name: "Bash",
    tool_input: { command: "make test-context-checkpoint-fixtures" },
    tool_response: { stdout: "private test output", stderr: "" },
    tool_use_id: "validation-event",
  });
  const validationActivity = checkpointStatus({ cwd: adapterNoActivity, env: adapterNoActivityEnv });
  assert.equal(validationActivity.checkpoint_state, "review_needed");
  assert.deepEqual(validationActivity.activity_signal_kinds, ["validation_run"]);

  const writeFailureRepo = makeRepository("write-failure");
  const writeFailure = recordCheckpointActivity({
    cwd: writeFailureRepo,
    runtime: "claude",
    sessionId: "session-write-failure",
    eventId: "event-write-failure",
    signalKind: "file_mutation",
    env: fixtureEnv,
    faults: { write: true },
  });
  assert.equal(writeFailure.availability, "unavailable");
  assert.notEqual(writeFailure.checkpoint_state, "clean");
  const renameFailureRepo = makeRepository("rename-failure");
  const renameFailure = recordCheckpointActivity({
    cwd: renameFailureRepo,
    runtime: "claude",
    sessionId: "session-rename-failure",
    eventId: "event-rename-failure",
    signalKind: "file_mutation",
    env: fixtureEnv,
    faults: { rename: true },
  });
  assert.equal(renameFailure.availability, "unavailable");
  assert.notEqual(renameFailure.checkpoint_state, "clean");
  const readFailure = checkpointStatus({
    cwd: renameFailureRepo,
    env: fixtureEnv,
    faults: { read: true },
  });
  assert.equal(readFailure.availability, "unavailable");
  assert.notEqual(readFailure.checkpoint_state, "clean");
  const schemaMismatchRepo = makeRepository("schema-mismatch");
  const schemaMismatchActivity = recordCheckpointActivity({
    cwd: schemaMismatchRepo,
    runtime: "claude",
    sessionId: "schema-session",
    eventId: "schema-event",
    signalKind: "file_mutation",
    env: fixtureEnv,
  });
  const schemaStateFile = findStateFileForHash(stateHome, schemaMismatchActivity.repository_hash);
  const schemaState = JSON.parse(fs.readFileSync(schemaStateFile, "utf8"));
  schemaState.schema_version = 999;
  fs.writeFileSync(schemaStateFile, `${JSON.stringify(schemaState)}\n`, "utf8");
  const schemaMismatch = checkpointStatus({ cwd: schemaMismatchRepo, env: fixtureEnv });
  assert.equal(schemaMismatch.availability, "unavailable");
  assert.equal(schemaMismatch.reason_code, "state_schema_mismatch");
  const missingSession = runEntry(lifecycle, lifecycleEnv, ["hook", "claude", "PostToolUse"], {
    cwd: lifecycle,
    hook_event_name: "PostToolUse",
    tool_name: "Write",
    tool_input: { file_path: path.join(lifecycle, "missing-session.txt"), content: "private" },
    tool_response: { success: true },
    tool_use_id: "missing-session-event",
  });
  assert.equal(missingSession.status, 0);
  assert.match(missingSession.stdout, /unavailable|Manual Context Checkpoint/);
  const malformedHook = runEntry(
    lifecycle,
    lifecycleEnv,
    ["hook", "claude", "PostToolUse"],
    "{ malformed",
  );
  assert.equal(malformedHook.status, 0);
  assert.match(malformedHook.stdout, /unavailable|Manual Context Checkpoint/);

  const concurrentRepo = makeRepository("concurrent-events");
  const concurrentEnv = {
    ...fixtureEnv,
    XDG_STATE_HOME: path.join(sandbox, "concurrent-state"),
  };
  const concurrentRuns = Array.from({ length: 8 }, (_, index) => runEntryAsync(
    concurrentRepo,
    concurrentEnv,
    ["hook", "claude", "PostToolUse"],
    {
      session_id: "concurrent-session",
      cwd: concurrentRepo,
      hook_event_name: "PostToolUse",
      tool_name: "Write",
      tool_input: { file_path: path.join(concurrentRepo, `${index}.txt`), content: "private" },
      tool_response: { success: true },
      tool_use_id: `concurrent-${index}`,
    },
  ));
  const concurrentResults = await Promise.all(concurrentRuns);
  assert.ok(concurrentResults.every(result => result.status === 0));
  assert.equal(checkpointStatus({ cwd: concurrentRepo, env: concurrentEnv }).activity_revision, 8);
  pass("FX-CCG-007 실패·동시 Event는 non-blocking unavailable 또는 직렬화");

  const unsupported = recordCheckpointActivity({
    cwd: lifecycle,
    runtime: "codex",
    sessionId: "codex-session",
    eventId: "codex-event",
    signalKind: "file_mutation",
    env: lifecycleEnv,
  });
  assert.equal(unsupported.availability, "unavailable");
  assert.equal(unsupported.manual_checkpoint_required, true);
  pass("FX-CCG-013 미지원 Runtime은 Manual fallback");

  const handoff = checkpointHandoffPreflight({ cwd: lifecycle, env: lifecycleEnv });
  assert.equal(handoff.allow_handoff, true);
  assert.equal(handoff.hard_block, false);
  assert.equal(handoff.context_checkpoint, "review_needed / unresolved");
  const handoffCli = runEntry(
    lifecycle,
    lifecycleEnv,
    ["context-checkpoint", "handoff-preflight", "--json"],
  );
  assert.equal(handoffCli.status, 0);
  assert.deepEqual(JSON.parse(handoffCli.stdout), handoff);
  pass("FX-CCG-014 Manual Handoff는 허용하며 unresolved truth 보존");

  const statusCli = runEntry(lifecycle, lifecycleEnv, ["context-checkpoint", "status", "--json"]);
  assert.equal(statusCli.status, 0);
  assert.equal(JSON.parse(statusCli.stdout).checkpoint_state, "review_needed");
  const resolveCli = runEntry(lifecycle, lifecycleEnv, [
    "context-checkpoint",
    "resolve",
    "checkpointed",
    "--promotion-source",
    "context-checkpoint-fixture",
    "--json",
  ]);
  assert.equal(resolveCli.status, 0);
  assert.equal(JSON.parse(resolveCli.stdout).resolution, "checkpointed");

  const storedLifecycleState = allFiles(lifecycleEnv.XDG_STATE_HOME)
    .filter(file => file.endsWith(".json"))
    .map(file => fs.readFileSync(file, "utf8"))
    .join("\n");
  for (const forbidden of [
    "/private/transcript/must-not-be-stored.jsonl",
    "prompt and file content must not be stored",
    path.join(lifecycle, "src", "secret-file.txt"),
  ]) {
    assert.equal(storedLifecycleState.includes(forbidden), false, `lifecycle state leaked ${forbidden}`);
  }

  const managedSettings = JSON.parse(
    fs.readFileSync(path.join(productRoot, "claude", "settings.json"), "utf8"),
  );
  const activityHooks = managedSettings.hooks.PostToolUse
    .filter(group => group.matcher !== "Skill")
    .flatMap(group => group.hooks);
  assert.equal(activityHooks.length, 1);
  assert.match(activityHooks[0].command, /hook claude PostToolUse/);
  assert.equal(managedSettings.hooks.SessionEnd.length, 1);
  assert.match(managedSettings.hooks.SessionEnd[0].hooks[0].command, /hook claude SessionEnd/);
} finally {
  for (const directory of cleanup.reverse()) {
    try {
      fs.rmSync(directory, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup for isolated fixture directories only.
    }
  }
  fs.rmSync(sandbox, { recursive: true, force: true });
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
  const directory = path.join(sandbox, "linked-worktree");
  runGit(repository, ["worktree", "add", "-q", "-b", "fixture-linked", directory]);
  cleanup.push(directory);
  return directory;
}

function runGit(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
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

function runEntryAsync(cwd, env, args, payload) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [publicEntry, ...args], {
      cwd,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("close", status => resolve({ status, stdout, stderr }));
    child.stdin.end(JSON.stringify(payload));
  });
}

function findOnlyStateFile(root) {
  const files = allFiles(root).filter(file => file.endsWith(".json"));
  assert.ok(files.length >= 1, "expected at least one state file");
  return files[0];
}

function findStateFileForHash(root, repositoryHash) {
  const file = allFiles(root).find(candidate => candidate.includes(repositoryHash) && candidate.endsWith(".json"));
  assert.ok(file, `missing state for ${repositoryHash}`);
  return file;
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
