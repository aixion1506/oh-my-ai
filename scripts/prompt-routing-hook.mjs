#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
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
const workStartSuggestionStatePath = path.join(repoRoot, ".oh-my-ai", "state", "work-start-suggestions.json");
const skillIndexPath = path.join(repoRoot, "skills", "skill-index.json");
const SKILL_CANDIDATE_LIMIT = 2;

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => {
  input += chunk;
});
process.stdin.on("end", () => {
  const event = parseInput(input);
  const prompt = String(event.prompt || event.user_prompt || event.message || input || "");
  const runtime = format === "claude-json" ? "claude" : format === "codex-json" ? "codex" : "text";
  const context = buildContext(prompt, { runtime });

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

function buildContext(prompt, options = {}) {
  const normalized = prompt.toLowerCase();
  const notes = [];

  if (hasToilSignal(prompt, normalized)) {
    appendAutomationCandidate(prompt);
    notes.push("- Toil signal: check `.oh-my-ai/state/automation-candidates.log` for auto-detected candidates. Promote only user-confirmed items to `automation-backlog.md`; nudge only if the flow is recurring, stable, and worth automating. Do not create automation before user confirmation.");
  }

  const handoff = hasHandoffSignal(prompt, normalized);
  const pr = hasPrSignal(prompt, normalized);
  const legacyHandoffNudged = handoff || pr;
  if (legacyHandoffNudged) {
    const prSuffix = pr ? " For PR creation, verify first and also consider whether `project-context` HANDOFF needs updating." : "";
    notes.push(
      "- Handoff/PR signal: consider the `handoff-prompt` skill for a short, confirmed next-session export." + prSuffix
    );
  }

  if (hasProjectContextSignal(prompt, normalized)) {
    notes.push("- Project context signal: consider `project-context` CREATE/UPDATE before proceeding; handoff must include decision background, not only a task list.");
  }

  if (options.runtime === "claude" && hasWorkStartIntentSignal(prompt, normalized)) {
    const suggestion = buildWorkStartSuggestion(prompt);
    if (suggestion) {
      notes.push(suggestion);
    }
  }

  const excludeSkillNames = legacyHandoffNudged ? ["handoff-prompt"] : [];
  const skillCandidates = matchSkillCandidates(normalized, excludeSkillNames);
  if (skillCandidates.length > 0) {
    const rendered = skillCandidates
      .map(candidate => `\`${candidate.name}\` (matched: ${candidate.matched.join(", ")})`)
      .join(", ");
    notes.push(
      `- Skill routing candidates: ${rendered}. Do not auto-execute skills; inspect fit before applying.`
    );
  }

  if (notes.length === 0) return "";

  return [
    "[HARNESS:prompt-routing]",
    "The latest user prompt contains harness routing signals. Apply these checks before continuing:",
    ...notes,
  ].join("\n");
}

function buildWorkStartSuggestion(prompt) {
  const normalizedPrompt = prompt.replace(/\s+/g, " ").trim();
  if (!normalizedPrompt) return "";

  const promptHash = crypto.createHash("sha256").update(normalizedPrompt).digest("hex");
  if (hasSuggestedWorkStart(promptHash)) {
    return "";
  }

  rememberSuggestedWorkStart(promptHash);
  const command = `/work-start ${normalizedPrompt}`;

  return [
    "- Suggested by oh-my-ai: Work-start",
    "",
    "  This request appears to fit pre-implementation scope and context collection.",
    "",
    "  Work-start can:",
    "  - find related Skill and local Repository Context candidates",
    "  - summarize scope, cautions, and context gaps",
    "  - generate a Structured Handoff Candidate",
    "",
    "  Consent boundary:",
    "  - state: SUGGESTED",
    "  - no Work-start Engine has run",
    "  - no local Artifact has been created",
    "  - Intent Match is not User Consent",
    "",
    "  To run Work-start explicitly, ask the user to invoke:",
    `  ${command}`,
    "",
    "  To skip Work-start, continue with the current request. Do not suggest Work-start again for this same user request.",
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

function hasSuggestedWorkStart(promptHash) {
  try {
    const parsed = JSON.parse(fs.readFileSync(workStartSuggestionStatePath, "utf8"));
    return Array.isArray(parsed.suggested_prompt_hashes)
      && parsed.suggested_prompt_hashes.includes(promptHash);
  } catch {
    return false;
  }
}

function rememberSuggestedWorkStart(promptHash) {
  try {
    let hashes = [];
    try {
      const parsed = JSON.parse(fs.readFileSync(workStartSuggestionStatePath, "utf8"));
      if (Array.isArray(parsed.suggested_prompt_hashes)) hashes = parsed.suggested_prompt_hashes;
    } catch {
      hashes = [];
    }
    hashes = [promptHash, ...hashes.filter(hash => hash !== promptHash)].slice(0, 100);
    fs.mkdirSync(path.dirname(workStartSuggestionStatePath), { recursive: true });
    fs.writeFileSync(workStartSuggestionStatePath, JSON.stringify({
      updated_at: new Date().toISOString(),
      suggested_prompt_hashes: hashes,
    }, null, 2) + "\n", "utf8");
  } catch {
    // Suggestion suppression is helpful but must never block prompt submission.
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
  if (/(하네스\s*(context|컨텍스트)|(context|컨텍스트)\s*기능|docs\/context|project-context)/i.test(prompt)) return true;
  if (/(설계|결정|맥락|컨텍스트).{0,24}(파일|문서|저장|정리|남겨|기록)/i.test(prompt)) return true;
  if (/(파일|문서|저장|정리|남겨|기록).{0,24}(설계|결정|맥락|컨텍스트)/i.test(prompt)) return true;
  return /\b(no|without|missing)\s+(project\s+)?context\b/.test(normalized);
}

function hasWorkStartIntentSignal(prompt, normalized) {
  if (/(다른\s*세션에\s*넘길\s*수\s*있게\s*정리|작업\s*지시문으로\s*만들|관련\s*(문서|코드|범위).{0,20}먼저\s*모아|handoff\s*(prep|prepare|packet|candidate)|prepare\s*(a\s*)?handoff|turn\s*this\s*into\s*a\s*work\s*instruction)/i.test(prompt)) {
    return true;
  }

  const hasPreparationIntent = /(시작하기\s*전에|구현\s*전에|수정\s*전에|먼저|착수\s*전에|넘기기\s*전에|before\s*(implementing|coding|editing|starting)|prior\s*to\s*(implementation|coding)|first\b)/i.test(prompt);
  const hasWorkStartObject = /(범위|영향\s*범위|관련\s*코드|관련\s*문서|결정\s*문서|컨텍스트|context|handoff|핸드오프|다른\s*세션|scope|impact|related\s*(code|docs|documents)|decision\s*(doc|record)|work-start)/i.test(prompt);

  if (!hasPreparationIntent || !hasWorkStartObject) return false;

  if (/(이\s*버그\s*고쳐|이\s*함수\s*설명|테스트\s*하나\s*추가|이\s*에러가\s*뭐야|코드\s*리뷰|fix\s*this\s*bug|explain\s*this\s*function|add\s*a\s*test|what\s*is\s*this\s*error|review\s*this\s*code)/i.test(prompt)) {
    return false;
  }

  return true;
}

function loadSkillIndex() {
  try {
    const raw = fs.readFileSync(skillIndexPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.skills)) return [];
    return parsed.skills;
  } catch {
    return [];
  }
}

function matchSkillCandidates(normalized, excludeSkillNames) {
  const excluded = new Set(excludeSkillNames);
  const candidates = [];

  for (const skill of loadSkillIndex()) {
    if (!skill || excluded.has(skill.name)) continue;
    const routing = skill.routing || {};
    if (routing.visibility === "hidden") continue;
    if (routing.risk_level === "high") continue;

    const keywordValues = (routing.triggers || [])
      .filter(trigger => trigger && trigger.kind === "keyword")
      .flatMap(trigger => Array.isArray(trigger.values) ? trigger.values : []);

    const matched = keywordValues.filter(value => normalized.includes(String(value).toLowerCase()));
    if (matched.length > 0) {
      candidates.push({ name: skill.name, matched });
    }
  }

  candidates.sort((a, b) => b.matched.length - a.matched.length);
  return candidates.slice(0, SKILL_CANDIDATE_LIMIT);
}
