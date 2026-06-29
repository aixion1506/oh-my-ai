#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

process.umask(0o077);

function fail(message) {
  console.error(message);
  process.exit(1);
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function git(...args) {
  const result = spawnSync("git", args, {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return result.status === 0 ? result.stdout.trim() : "";
}

function normalizeRemote(remote, root) {
  let host = "";
  let pathname = "";
  const scp = remote.match(/^[^@]+@([^:]+):(.+)$/);

  if (scp) {
    host = scp[1];
    pathname = scp[2];
  } else {
    try {
      const url = new URL(remote);
      host = url.hostname;
      pathname = url.pathname;
    } catch {
      pathname = remote;
    }
  }

  const parts = pathname.replace(/\.git$/, "").split("/").filter(Boolean);
  if (parts.length >= 2) {
    const repo = parts.slice(-2).join("/");
    return host ? `${host}/${repo}` : repo;
  }
  return root ? path.basename(root) : "no-git";
}

function gitContext() {
  const root = git("rev-parse", "--show-toplevel");
  return {
    repo: normalizeRemote(git("config", "--get", "remote.origin.url"), root),
    branch: git("branch", "--show-current") || null,
    commit: git("rev-parse", "--short=12", "HEAD") || null,
  };
}

function globalStatePath() {
  const stateHome =
    process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state");
  return path.join(stateHome, "oh-my-ai", "harness-usage.log");
}

function repoLocalStatePath() {
  const root = git("rev-parse", "--show-toplevel") || process.cwd();
  return path.join(root, ".oh-my-ai", "state", "harness-usage.log");
}

function statePaths() {
  return [...new Set([globalStatePath(), repoLocalStatePath()])];
}

function ensureParent(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
}

function writableStatePath() {
  for (const file of statePaths()) {
    try {
      ensureParent(file);
      return file;
    } catch {
      continue;
    }
  }
  return null;
}

function appendTelemetry(record) {
  for (const file of statePaths()) {
    try {
      ensureParent(file);
      fs.appendFileSync(file, `${JSON.stringify(record)}\n`, {
        encoding: "utf8",
        mode: 0o600,
      });
      return true;
    } catch {
      continue;
    }
  }
  return false;
}

function emit(args) {
  const event = args[0];
  const skill = option(args, "--skill");
  const runtime = option(args, "--runtime");

  if (event !== "skill-start") fail("supported event: skill-start");
  if (!/^[a-z0-9][a-z0-9-]*$/.test(skill || "")) fail("invalid --skill");
  if (!/^[a-z0-9][a-z0-9-]*$/.test(runtime || "")) fail("invalid --runtime");

  const record = {
    v: 1,
    timestamp: new Date().toISOString(),
    event: "skill_start",
    skill,
    runtime,
    ...gitContext(),
  };

  appendTelemetry(record);
}

function report(args) {
  const all = args.includes("--all");
  const repo = all ? null : option(args, "--repo") || gitContext().repo;
  const sinceDays = Number(option(args, "--since-days") || 0);
  const cutoff = sinceDays > 0 ? Date.now() - sinceDays * 86400000 : 0;
  const counts = new Map();

  for (const log of statePaths()) {
    if (!fs.existsSync(log)) continue;
    for (const line of fs.readFileSync(log, "utf8").split("\n")) {
      if (!line) continue;
      let record;
      try {
        record = JSON.parse(line);
      } catch {
        continue;
      }
      if (record.event !== "skill_start") continue;
      if (repo && record.repo !== repo) continue;
      if (cutoff && Date.parse(record.timestamp) < cutoff) continue;
      const key = `${record.repo}\t${record.runtime}\t${record.skill}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }

  console.log("count\trepo\truntime\tskill");
  for (const [key, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`${count}\t${key}`);
  }
}

const [command, ...args] = process.argv.slice(2);
if (command === "emit") emit(args);
else if (command === "report") report(args);
else if (command === "path") console.log(writableStatePath() || globalStatePath());
else fail("usage: harness-event <emit|report|path>");
