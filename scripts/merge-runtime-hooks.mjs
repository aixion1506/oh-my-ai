#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function usage() {
  console.error("usage: merge-runtime-hooks.mjs --mode <check|merge> --source <path> --target <path>");
  process.exit(2);
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

const mode = argument("--mode");
const sourcePath = argument("--source");
const targetPath = argument("--target");
if (!mode || !sourcePath || !targetPath || !["check", "merge"].includes(mode)) usage();

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function matcherKey(group) {
  return Object.hasOwn(group, "matcher") ? JSON.stringify(group.matcher) : "__no_matcher__";
}

function hookKey(hook) {
  if (!isObject(hook)) return null;
  return JSON.stringify({ type: hook.type ?? null, command: hook.command ?? null });
}

function validateManagedHooks(settings) {
  if (!isObject(settings) || !isObject(settings.hooks)) {
    throw new Error("managed source must contain a hooks object");
  }
  for (const [event, groups] of Object.entries(settings.hooks)) {
    if (!Array.isArray(groups)) throw new Error(`managed ${event} hooks must be an array`);
    for (const group of groups) {
      if (!isObject(group) || !Array.isArray(group.hooks)) {
        throw new Error(`managed ${event} hook group must contain a hooks array`);
      }
      for (const hook of group.hooks) {
        if (!hookKey(hook)) throw new Error(`managed ${event} hook entry must be an object`);
      }
    }
  }
}

function statusFor(target, managed) {
  if (!isObject(target)) return "conflict";
  if (!Object.hasOwn(target, "hooks")) return "incomplete";
  if (!isObject(target.hooks)) return "conflict";
  for (const [event, sourceGroups] of Object.entries(managed.hooks)) {
    const targetGroups = target.hooks[event];
    if (targetGroups === undefined) return "incomplete";
    if (!Array.isArray(targetGroups)) return "conflict";
    for (const sourceGroup of sourceGroups) {
      const matchingGroups = targetGroups.filter((group) => isObject(group) && matcherKey(group) === matcherKey(sourceGroup));
      if (matchingGroups.some((group) => !Array.isArray(group.hooks))) return "conflict";
      const installedHooks = new Set(
        matchingGroups.flatMap((group) => Array.isArray(group.hooks) ? group.hooks.map(hookKey).filter(Boolean) : []),
      );
      if (sourceGroup.hooks.some((hook) => !installedHooks.has(hookKey(hook)))) return "incomplete";
    }
  }
  return "ready";
}

function mergeManagedHooks(target, managed) {
  const merged = clone(target);
  if (!Object.hasOwn(merged, "hooks")) merged.hooks = {};
  if (!isObject(merged.hooks)) throw new Error("target hooks must be an object when present");

  let changed = false;
  for (const [event, sourceGroups] of Object.entries(managed.hooks)) {
    if (!Object.hasOwn(merged.hooks, event)) {
      merged.hooks[event] = clone(sourceGroups);
      changed = true;
      continue;
    }
    if (!Array.isArray(merged.hooks[event])) throw new Error(`target ${event} hooks must be an array when present`);

    for (const sourceGroup of sourceGroups) {
      const matchingGroups = merged.hooks[event].filter((group) => isObject(group) && matcherKey(group) === matcherKey(sourceGroup));
      if (matchingGroups.some((group) => !Array.isArray(group.hooks))) {
        throw new Error(`target ${event} hook group must contain a hooks array`);
      }
      const existingHooks = new Set(matchingGroups.flatMap((group) => group.hooks.map(hookKey).filter(Boolean)));
      const missingHooks = sourceGroup.hooks.filter((hook) => !existingHooks.has(hookKey(hook)));
      if (missingHooks.length === 0) continue;

      if (matchingGroups.length > 0) {
        matchingGroups[0].hooks.push(...clone(missingHooks));
      } else {
        const group = clone(sourceGroup);
        group.hooks = clone(missingHooks);
        merged.hooks[event].push(group);
      }
      changed = true;
    }
  }
  return { merged, changed };
}

function atomicWrite(filePath, contents, existingMode) {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
  const temporary = path.join(directory, `.${path.basename(filePath)}.oh-my-ai.${process.pid}.${Date.now()}.tmp`);
  try {
    const descriptor = fs.openSync(temporary, "wx", existingMode ?? 0o600);
    try {
      fs.writeFileSync(descriptor, contents);
      fs.fsyncSync(descriptor);
    } finally {
      fs.closeSync(descriptor);
    }
    if (existingMode !== undefined) fs.chmodSync(temporary, existingMode);
    fs.renameSync(temporary, filePath);
  } catch (error) {
    try { fs.unlinkSync(temporary); } catch { /* no temporary file to remove */ }
    throw error;
  }
}

try {
  const managed = readJson(sourcePath, "managed hook source");
  validateManagedHooks(managed);

  let target = {};
  let targetStat = null;
  try {
    targetStat = fs.lstatSync(targetPath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (targetStat) {
    if (!targetStat.isFile() && !targetStat.isSymbolicLink()) throw new Error("target hook config is not a file");
    target = readJson(targetPath, "existing hook config");
  }
  if (!isObject(target)) throw new Error("existing hook config root must be an object");

  const currentStatus = statusFor(target, managed);
  if (mode === "check") {
    console.log(currentStatus);
    process.exit(0);
  }
  if (currentStatus === "ready") {
    console.log("ready");
    process.exit(0);
  }

  const { merged, changed } = mergeManagedHooks(target, managed);
  if (!changed) {
    console.log("ready");
    process.exit(0);
  }
  if (targetStat?.isSymbolicLink()) {
    throw new Error("target hook config is a symlink with missing managed hooks; preserving it without replacement");
  }
  atomicWrite(targetPath, `${JSON.stringify(merged, null, 2)}\n`, targetStat?.mode);
  console.log("updated");
} catch (error) {
  console.error(`hook merge conflict: ${error.message}`);
  console.log("conflict");
  process.exitCode = 1;
}
