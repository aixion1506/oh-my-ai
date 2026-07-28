#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.dirname(scriptDir);
const harnessEvent = path.join(scriptDir, "harness-event.mjs");
const fixturePath = path.join(
  repo,
  "fixtures",
  "harness-event",
  "skill-name-validation.json",
);
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
const tempRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "oh-my-ai-harness-event-fixtures."),
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function emit(skill, stateHome) {
  return spawnSync(
    process.execPath,
    [
      harnessEvent,
      "emit",
      "skill-start",
      "--skill",
      skill,
      "--runtime",
      "codex",
    ],
    {
      cwd: repo,
      encoding: "utf8",
      env: { ...process.env, XDG_STATE_HOME: stateHome },
    },
  );
}

try {
  const stateHome = path.join(tempRoot, "state");
  const accepted = [
    ...fixture.valid,
    ...fixture.continuousSeparators.values,
  ];

  for (const skill of accepted) {
    const result = emit(skill, stateHome);
    assert(
      result.status === 0,
      `expected valid skill name '${skill}', got: ${result.stderr.trim()}`,
    );
  }

  for (const { label, value } of fixture.invalid) {
    const result = emit(value, stateHome);
    assert(result.status === 1, `expected ${label} to be rejected`);
    assert(
      result.stderr.includes("invalid --skill"),
      `expected validation error for ${label}`,
    );
  }

  const logPath = path.join(stateHome, "oh-my-ai", "harness-usage.log");
  const records = fs
    .readFileSync(logPath, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert(records.length === accepted.length, "unexpected telemetry record count");
  assert(
    records.every((record, index) => record.skill === accepted[index]),
    "telemetry did not preserve an accepted skill name",
  );

  const hookHome = path.join(tempRoot, "hook-home");
  const localBin = path.join(hookHome, ".local", "bin");
  const fakeBin = path.join(tempRoot, "fake-bin");
  fs.mkdirSync(localBin, { recursive: true });
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.symlinkSync(harnessEvent, path.join(localBin, "harness-event"));
  const fakeJq = path.join(fakeBin, "jq");
  fs.writeFileSync(
    fakeJq,
    "#!/bin/sh\ncat >/dev/null\nprintf '%s\\n' 'Plugin:skill'\n",
    { mode: 0o755 },
  );

  const settings = JSON.parse(
    fs.readFileSync(path.join(repo, "claude", "settings.json"), "utf8"),
  );
  const hook = settings.hooks.PostToolUse
    .flatMap((group) => group.hooks)
    .find((candidate) => candidate.command.includes("harness-event"));
  assert(hook, "missing harness-event fail-open hook");

  const failOpen = spawnSync("bash", ["-c", hook.command], {
    cwd: repo,
    encoding: "utf8",
    input: "{}\n",
    env: {
      ...process.env,
      HOME: hookHome,
      PATH: `${fakeBin}:${process.env.PATH || ""}`,
      XDG_STATE_HOME: path.join(tempRoot, "fail-open-state"),
    },
  });
  assert(failOpen.status === 0, "validation failure escaped the fail-open hook");
  assert(
    failOpen.stderr.includes("invalid --skill"),
    "fail-open fixture did not exercise skill-name validation",
  );

  console.log(
    `harness-event fixtures passed: ${accepted.length} accepted, `
      + `${fixture.invalid.length} rejected, fail-open preserved`,
  );
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
