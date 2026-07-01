#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const format = process.argv.includes("--format=yaml") ? "yaml" : "markdown";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const skillIndexPath = path.join(repoRoot, "skills", "skill-index.json");

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => {
  input += chunk;
});
process.stdin.on("end", () => {
  const normalized = input.toLowerCase();
  const { primary, secondary } = matchSkillCandidates(normalized);
  process.stdout.write(format === "yaml" ? renderYaml(primary, secondary) : renderMarkdown(primary, secondary));
});

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

function matchSkillCandidates(normalized) {
  const candidates = [];

  for (const skill of loadSkillIndex()) {
    if (!skill) continue;
    const routing = skill.routing || {};
    if (routing.visibility === "hidden") continue;
    if (routing.risk_level === "high") continue;

    const keywordValues = (routing.triggers || [])
      .filter(trigger => trigger && trigger.kind === "keyword")
      .flatMap(trigger => Array.isArray(trigger.values) ? trigger.values : []);

    const matched = keywordValues.filter(value => normalized.includes(String(value).toLowerCase()));
    if (matched.length > 0) {
      candidates.push({ name: skill.name, path: skill.path, matched, score: matched.length });
    }
  }

  if (candidates.length === 0) return { primary: [], secondary: [] };

  const maxScore = Math.max(...candidates.map(candidate => candidate.score));
  const topTied = candidates
    .filter(candidate => candidate.score === maxScore)
    .sort((a, b) => (a.name === b.name ? a.path.localeCompare(b.path) : a.name.localeCompare(b.name)));

  const [primaryPick, ...restTied] = topTied;
  const secondaryPicks = [...restTied, ...candidates.filter(candidate => candidate.score !== maxScore)];

  const primary = [{ name: primaryPick.name, matched: primaryPick.matched }];
  const secondary = secondaryPicks.map(candidate => ({ name: candidate.name, matched: candidate.matched }));

  return { primary, secondary };
}

function renderMarkdown(primary, secondary) {
  const lines = ["## Skill candidates", ""];
  if (primary.length === 0 && secondary.length === 0) {
    lines.push("- skill gap: no routed skill matched this task; proceed without skill assist.");
  } else {
    lines.push(`- primary: ${renderMarkdownList(primary)}`);
    lines.push(`- secondary: ${renderMarkdownList(secondary)}`);
  }
  lines.push("");
  return lines.join("\n");
}

function renderMarkdownList(candidates) {
  if (candidates.length === 0) return "none";
  return candidates
    .map(candidate => `\`${candidate.name}\` (matched: ${candidate.matched.join(", ")})`)
    .join(", ");
}

function renderYaml(primary, secondary) {
  const lines = ["skill_candidates:"];
  if (primary.length === 0 && secondary.length === 0) {
    lines.push("  status: skill_gap");
    lines.push("  primary: []");
    lines.push("  secondary: []");
  } else {
    lines.push("  status: matched");
    lines.push(renderYamlTier("primary", primary));
    lines.push(renderYamlTier("secondary", secondary));
  }
  return `${lines.join("\n")}\n`;
}

function renderYamlTier(name, candidates) {
  if (candidates.length === 0) return `  ${name}: []`;
  const out = [`  ${name}:`];
  for (const candidate of candidates) {
    out.push(`    - name: '${yamlEscape(candidate.name)}'`);
    out.push("      matched:");
    for (const value of candidate.matched) {
      out.push(`        - '${yamlEscape(value)}'`);
    }
  }
  return out.join("\n");
}

function yamlEscape(value) {
  return String(value).replace(/'/g, "''");
}
