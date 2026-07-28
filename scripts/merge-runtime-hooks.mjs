#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function usage() {
  console.error("usage: merge-runtime-hooks.mjs --mode <check|merge|enabled> --runtime <claude|codex> --target <path> [--source <path>] [--config <path>]");
  process.exit(2);
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

const mode = argument("--mode");
const runtime = argument("--runtime");
const sourcePath = argument("--source");
const targetPath = argument("--target");
const configPath = argument("--config");
if (!mode || !runtime || !targetPath || !["claude", "codex"].includes(runtime) || !["check", "merge", "enabled"].includes(mode)) usage();
if (["check", "merge"].includes(mode) && !sourcePath) usage();

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

function normaliseMatcher(matcher) {
  if (matcher === undefined) return "no_matcher";
  if (typeof matcher !== "string") return null;
  const value = matcher.trim();
  if (value === "Skill" || value === "^Skill$") return "Skill";
  return `literal:${value}`;
}

function normaliseCommand(command) {
  if (typeof command !== "string") return null;
  return command
    .trim()
    // Double-quoted and unquoted HOME paths expand to the same executable. A
    // single-quoted $HOME does not, so it is deliberately not normalised.
    .replace(/"\$(?:HOME|\{HOME\})\/\.local\/bin\/oh-my-ai"|\$(?:HOME|\{HOME\})\/\.local\/bin\/oh-my-ai/g, "<oh-my-ai>")
    .replace(/"\$(?:HOME|\{HOME\})\/\.local\/bin\/harness-event"|\$(?:HOME|\{HOME\})\/\.local\/bin\/harness-event/g, "<harness-event>")
    .replace(/\s+/g, " ");
}

function isWrapperOperation(command, expectedRuntime, event) {
  const value = normaliseCommand(command);
  return value === `if [ -x <oh-my-ai> ]; then <oh-my-ai> hook ${expectedRuntime} ${event}; else cat >/dev/null 2>&1 || :; fi`;
}

function isLegacyRoutingOperation(command, expectedRuntime) {
  const value = normaliseCommand(command);
  const format = expectedRuntime === "claude" ? "claude-json" : "text";
  const settingsPath = expectedRuntime === "claude" ? "~/.claude/settings.json" : "~/.codex/hooks.json";
  const repositoryAssignment = `REPO="$(dirname "$(dirname "$(readlink -f ${settingsPath})")")"`;
  const commandPrefix = `${repositoryAssignment}; node "$REPO/scripts/prompt-routing-hook.mjs"`;

  // These are the complete command forms emitted by the pre-wrapper installer.
  // Do not widen this to a prefix match: a command before, after, or inside the
  // legacy operation is user-owned customization and must remain untouched.
  return [
    `${commandPrefix} --format=${format} || true`,
    `${commandPrefix} --format ${format} || true`,
    `${commandPrefix} --format=${format}`,
    `${commandPrefix} --format ${format}`,
  ].includes(value);
}

function looksLikeCustomisedLegacyRoutingOperation(command) {
  const value = normaliseCommand(command) ?? "";
  // An incidental text mention is not evidence of ownership. Require the
  // legacy executable shape before treating a non-canonical command as an
  // ambiguous customization that must be preserved as a conflict.
  return value.includes("node \"$REPO/scripts/prompt-routing-hook.mjs\"")
    && value.includes("REPO=");
}

function isSkillUsageOperation(command) {
  const value = normaliseCommand(command);
  return value === "S=$(jq -r '.tool_input.skill // empty' 2>/dev/null); [ -n \"$S\" ] && <harness-event> emit skill-start --skill \"$S\" --runtime claude; true";
}

function looksLikeCustomisedManagedOperation(operation, command) {
  const value = normaliseCommand(command) ?? "";
  if (operation.id.endsWith("session-start-routing")) {
    return value.includes("<oh-my-ai> hook claude SessionStart");
  }
  if (operation.id.endsWith("user-prompt-routing")) {
    return value.includes(`<oh-my-ai> hook ${operation.runtime} UserPromptSubmit`)
      || looksLikeCustomisedLegacyRoutingOperation(command);
  }
  if (operation.id.endsWith("skill-usage")) {
    return value.includes("<harness-event> emit skill-start");
  }
  if (operation.id.endsWith("context-checkpoint-activity")) {
    return value.includes("<oh-my-ai> hook claude PostToolUse");
  }
  if (operation.id.endsWith("context-checkpoint-session-end")) {
    return value.includes("<oh-my-ai> hook claude SessionEnd");
  }
  return false;
}

const operationSpecs = [
  {
    id: "claude.session-start-routing",
    runtime: "claude",
    event: "SessionStart",
    matcher: "no_matcher",
    matches: (hook) => hook?.type === "command" && isWrapperOperation(hook.command, "claude", "SessionStart"),
  },
  {
    id: "claude.user-prompt-routing",
    runtime: "claude",
    event: "UserPromptSubmit",
    matcher: "no_matcher",
    matches: (hook) => hook?.type === "command" && (
      isWrapperOperation(hook.command, "claude", "UserPromptSubmit")
      || isLegacyRoutingOperation(hook.command, "claude")
    ),
  },
  {
    id: "codex.user-prompt-routing",
    runtime: "codex",
    event: "UserPromptSubmit",
    matcher: "no_matcher",
    matches: (hook) => hook?.type === "command" && (
      isWrapperOperation(hook.command, "codex", "UserPromptSubmit")
      || isLegacyRoutingOperation(hook.command, "codex")
    ),
  },
  {
    id: "claude.skill-usage",
    runtime: "claude",
    event: "PostToolUse",
    matcher: "Skill",
    matches: (hook) => hook?.type === "command" && isSkillUsageOperation(hook.command),
  },
  {
    id: "claude.context-checkpoint-activity",
    runtime: "claude",
    event: "PostToolUse",
    matcher: "literal:Write|Edit|MultiEdit|NotebookEdit|Bash",
    matches: (hook) => hook?.type === "command" && isWrapperOperation(hook.command, "claude", "PostToolUse"),
  },
  {
    id: "claude.context-checkpoint-session-end",
    runtime: "claude",
    event: "SessionEnd",
    matcher: "no_matcher",
    matches: (hook) => hook?.type === "command" && isWrapperOperation(hook.command, "claude", "SessionEnd"),
  },
];

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
        if (!isObject(hook) || typeof hook.type !== "string" || typeof hook.command !== "string") {
          throw new Error(`managed ${event} hook entry must be a command object`);
        }
      }
    }
  }
}

function buildOperations(managed) {
  const operations = [];
  const seenSourceHooks = new Set();
  for (const spec of operationSpecs.filter((candidate) => candidate.runtime === runtime)) {
    const sourceMatches = [];
    for (const [event, groups] of Object.entries(managed.hooks)) {
      if (event !== spec.event) continue;
      for (const group of groups) {
        if (normaliseMatcher(group.matcher) !== spec.matcher) continue;
        for (const hook of group.hooks) {
          if (spec.matches(hook)) sourceMatches.push({ group, hook });
        }
      }
    }
    if (sourceMatches.length !== 1) throw new Error(`managed source must contain exactly one ${spec.id} operation`);
    seenSourceHooks.add(sourceMatches[0].hook);
    operations.push({ ...spec, sourceGroup: sourceMatches[0].group, sourceHook: sourceMatches[0].hook });
  }

  // Source-owned hooks without a behavioural operation (currently the Claude
  // context notice) remain exact-source operations. This is intentionally
  // narrow: it does not claim arbitrary user commands as managed.
  for (const [event, groups] of Object.entries(managed.hooks)) {
    for (const group of groups) {
      for (const hook of group.hooks) {
        if (seenSourceHooks.has(hook)) continue;
        const matcher = normaliseMatcher(group.matcher);
        if (matcher === null) throw new Error(`managed ${event} matcher is unsupported`);
        const sourceCommand = normaliseCommand(hook.command);
        operations.push({
          id: `${runtime}.${event}.${matcher}.source-${operations.length}`,
          runtime,
          event,
          matcher,
          sourceGroup: group,
          sourceHook: hook,
          matches: (candidate) => candidate?.type === hook.type && normaliseCommand(candidate.command) === sourceCommand,
        });
      }
    }
  }
  return operations;
}

function relevantGroups(target, operation) {
  const groups = target.hooks?.[operation.event];
  if (groups === undefined) return [];
  if (!Array.isArray(groups)) throw new Error(`target ${operation.event} hooks must be an array when present`);
  const matching = groups.filter((group) => isObject(group) && normaliseMatcher(group.matcher) === operation.matcher);
  if (matching.some((group) => !Array.isArray(group.hooks))) {
    throw new Error(`target ${operation.event} hook group must contain a hooks array`);
  }
  return matching;
}

function operationState(target, operation) {
  const groups = relevantGroups(target, operation);
  const matches = [];
  let ambiguous = false;
  for (const group of groups) {
    for (const hook of group.hooks) {
      if (operation.matches(hook)) matches.push({ group, hook });
      else if (hook?.type === "command" && looksLikeCustomisedManagedOperation(operation, hook.command)) ambiguous = true;
    }
  }
  return { groups, matches, ambiguous };
}

function statusFor(target, operations) {
  if (!isObject(target)) return "conflict";
  if (!Object.hasOwn(target, "hooks")) return "incomplete";
  if (!isObject(target.hooks)) return "conflict";
  try {
    for (const operation of operations) {
      const state = operationState(target, operation);
      if (state.ambiguous) return "conflict";
      if (state.matches.length !== 1) return "incomplete";
      if (state.matches[0].hook.command !== operation.sourceHook.command) return "incomplete";
    }
  } catch {
    return "conflict";
  }
  return "ready";
}

function mergeManagedHooks(target, operations) {
  const merged = clone(target);
  if (!Object.hasOwn(merged, "hooks")) merged.hooks = {};
  if (!isObject(merged.hooks)) throw new Error("target hooks must be an object when present");

  let changed = false;
  for (const operation of operations) {
    if (!Object.hasOwn(merged.hooks, operation.event)) {
      merged.hooks[operation.event] = [];
      changed = true;
    }
    const state = operationState(merged, operation);
    if (state.ambiguous) {
      throw new Error(`target contains a customised ${operation.id} hook; preserving it without replacement`);
    }

    if (state.matches.length === 0) {
      const destination = state.groups[0];
      if (destination) destination.hooks.push(clone(operation.sourceHook));
      else {
        const group = clone(operation.sourceGroup);
        group.hooks = [clone(operation.sourceHook)];
        merged.hooks[operation.event].push(group);
      }
      changed = true;
      continue;
    }

    const retained = state.matches[0].hook;
    const duplicates = new Set(state.matches.slice(1).map((match) => match.hook));
    for (const group of state.groups) {
      group.hooks = group.hooks.flatMap((hook) => {
        if (hook === retained) return [clone(operation.sourceHook)];
        return duplicates.has(hook) ? [] : [hook];
      });
    }
    // A legacy command or duplicate was normalised to the one canonical
    // source hook. Exact canonical reinstallation remains a byte-stable no-op.
    if (state.matches.length !== 1 || retained.command !== operation.sourceHook.command) changed = true;
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

function stripTomlComment(line) {
  let quote = null;
  let escaped = false;
  let result = "";
  for (const character of line) {
    if (quote === '"' && character === "\\" && !escaped) {
      escaped = true;
      result += character;
      continue;
    }
    if (!escaped && (character === '"' || character === "'")) quote = quote === character ? null : (quote ?? character);
    if (!quote && character === "#") break;
    result += character;
    escaped = false;
  }
  return result;
}

function codexHooksEnabled(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return "enabled";
  let section = "";
  let found = null;
  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = stripTomlComment(rawLine).trim();
    if (!line) continue;
    const header = line.match(/^\[\s*([A-Za-z0-9_.-]+)\s*\]$/);
    if (header) {
      section = header[1];
      continue;
    }
    const assignment = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.*?)\s*$/);
    if (!assignment) continue;
    const isHooksFlag = (section === "features" && assignment[1] === "hooks") || (section === "" && assignment[1] === "features.hooks");
    if (!isHooksFlag) continue;
    if (assignment[2] !== "true" && assignment[2] !== "false") return "unknown";
    if (found !== null && found !== assignment[2]) return "unknown";
    found = assignment[2];
  }
  return found === "false" ? "disabled" : "enabled";
}

function enabledStatus(target, targetExists) {
  if (runtime === "claude") {
    if (!targetExists) return "enabled";
    if (!isObject(target)) return "unknown";
    return target.disableAllHooks === true ? "disabled" : "enabled";
  }
  return codexHooksEnabled(configPath);
}

try {
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

  if (mode === "enabled") {
    console.log(enabledStatus(target, Boolean(targetStat)));
    process.exit(0);
  }

  const managed = readJson(sourcePath, "managed hook source");
  validateManagedHooks(managed);
  const operations = buildOperations(managed);
  const currentStatus = statusFor(target, operations);
  if (mode === "check") {
    console.log(currentStatus);
    process.exit(0);
  }
  if (currentStatus === "ready") {
    console.log("ready");
    process.exit(0);
  }
  if (currentStatus === "conflict") throw new Error("target hook config has an ambiguous or malformed managed hook");

  const { merged, changed } = mergeManagedHooks(target, operations);
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
