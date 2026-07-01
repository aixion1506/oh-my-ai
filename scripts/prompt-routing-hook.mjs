#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = new Set(process.argv.slice(2));
const format = args.has("--format=claude-json")
  ? "claude-json"
  : args.has("--format=codex-json")
    ? "codex-json"
    : args.has("--format=text")
      ? "text"
      : "codex-json";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const automationCandidatesPath = path.join(repoRoot, ".oh-my-ai", "state", "automation-candidates.log");

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => {
  input += chunk;
});
process.stdin.on("end", () => {
  const event = parseInput(input);
  const prompt = String(event.prompt || event.user_prompt || event.message || input || "");
  const context = buildContext(prompt);

  if (!context) {
    process.exit(0);
  }

  if (format === "claude-json" || format === "codex-json") {
    writeUserPromptSubmitJson(context);
    return;
  }

  process.stdout.write(context);
  process.stdout.write("\n");
});

function writeUserPromptSubmitJson(context) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: context,
    },
  }));
  process.stdout.write("\n");
}

function parseInput(input) {
  if (!input.trim()) return {};
  try {
    return JSON.parse(input);
  } catch {
    return {};
  }
}

function buildContext(prompt) {
  const normalized = prompt.toLowerCase();
  const notes = [];

  if (hasToilSignal(prompt, normalized)) {
    appendAutomationCandidate(prompt);
    notes.push("- Toil signal: check `.oh-my-ai/state/automation-candidates.log` for auto-detected candidates. Promote only user-confirmed items to `automation-backlog.md`; nudge only if the flow is recurring, stable, and worth automating. Do not create automation before user confirmation.");
  }

  const handoff = hasHandoffSignal(prompt, normalized);
  const pr = hasPrSignal(prompt, normalized);
  if (handoff || pr) {
    const prSuffix = pr ? " For PR creation, verify first and also consider whether `project-context` HANDOFF needs updating." : "";
    notes.push(
      "- Handoff/PR signal: consider the `handoff-prompt` skill for a short, confirmed next-session export." + prSuffix
    );
  }

  if (hasProjectContextSignal(prompt, normalized)) {
    notes.push("- Project context signal: consider `project-context` CREATE/UPDATE before proceeding; handoff must include decision background, not only a task list.");
  }

  if (notes.length === 0) return "";

  return [
    "[HARNESS:prompt-routing]",
    "The latest user prompt contains harness routing signals. Apply these checks before continuing:",
    ...notes,
  ].join("\n");
}

function appendAutomationCandidate(prompt) {
  try {
    fs.mkdirSync(path.dirname(automationCandidatesPath), { recursive: true });
    const summary = prompt.replace(/\s+/g, " ").trim().slice(0, 500);
    if (!summary) return;
    const entry = {
      ts: new Date().toISOString(),
      source: "prompt-routing-hook",
      signal: "toil",
      prompt: summary,
    };
    fs.appendFileSync(automationCandidatesPath, JSON.stringify(entry) + "\n", "utf8");
  } catch {
    // Routing context is helpful but must never block prompt submission.
  }
}

function hasToilSignal(prompt, normalized) {
  const directSignals = [
    "매번",
    "맨날",
    "귀찮",
    "자동으로",
    "자동화",
    "반복",
    "스킬로",
    "커맨드로",
  ];
  if (directSignals.some(signal => prompt.includes(signal))) return true;
  if (/\b(automate|automation|repetitive|again and again|every time)\b/.test(normalized)) return true;

  // "또" is common in normal Korean prose, so require nearby toil-like context.
  return /또\s*(해야|하네|하는|같은|반복|수동|놓쳤|까먹|실수|귀찮)/.test(prompt);
}

function hasHandoffSignal(prompt, normalized) {
  if (/(핸드오프|handoff|인수인계|토스|넘겨|넘긴|넘길|새 세션|다른 세션)/i.test(prompt)) return true;
  return /\bcodex\b/.test(normalized) && /(넘겨|넘긴|넘길|토스|핸드오프|새 세션|다른 세션|전환|handoff|continue|resume)/i.test(prompt);
}

function hasPrSignal(prompt, normalized) {
  if (/(pr|pull request|풀리퀘).{0,20}(만들|생성|올려|열어|create|open)/i.test(prompt)) return true;
  if (/(만들|생성|올려|열어|create|open).{0,20}(pr|pull request|풀리퀘)/i.test(prompt)) return true;
  return /\bgh\s+pr\s+create\b/.test(normalized);
}

function hasProjectContextSignal(prompt, normalized) {
  if (/(context 없|컨텍스트 없|맥락 없|이 서비스 처음|새 서비스|새 도메인|처음.{0,10}서비스|처음.{0,10}도메인)/i.test(prompt)) return true;
  return /\b(no|without|missing)\s+(project\s+)?context\b/.test(normalized);
}
