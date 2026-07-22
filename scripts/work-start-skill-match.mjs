#!/usr/bin/env node

import { matchSkillCandidatesWithStatus } from "./lib/routing-status.mjs";

const format = process.argv.includes("--format=yaml")
  ? "yaml"
  : process.argv.includes("--format=json")
    ? "json"
    : "markdown";

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", chunk => {
  input += chunk;
});
process.stdin.on("end", () => {
  const result = matchSkillCandidatesWithStatus(input.toLowerCase());
  const { primary, secondary } = tierCandidates(result.candidates);

  if (format === "json") {
    process.stdout.write(`${JSON.stringify(renderJson(result), null, 2)}\n`);
  } else if (format === "yaml") {
    process.stdout.write(renderYaml(result, primary, secondary));
  } else {
    process.stdout.write(renderMarkdown(result, primary, secondary));
  }
});

function tierCandidates(candidates) {
  if (candidates.length === 0) return { primary: [], secondary: [] };
  const [primaryPick, ...secondaryPicks] = candidates;
  return {
    primary: [candidateSummary(primaryPick)],
    secondary: secondaryPicks.map(candidateSummary),
  };
}

function candidateSummary(candidate) {
  return { name: candidate.name, matched: candidate.matched };
}

function renderJson(result) {
  return {
    routing_status: result.status,
    routing_error_code: result.errorCode,
    skill_candidates: result.candidates.map(candidateSummary),
    warnings: result.warnings,
  };
}

function renderMarkdown(result, primary, secondary) {
  const lines = ["## Skill candidates", ""];
  lines.push(`- routing_status: ${result.status}`);
  lines.push(`- routing_error_code: ${result.errorCode || "none"}`);
  if (result.status === "unavailable") {
    lines.push("- primary: none");
    lines.push("- secondary: none");
  } else if (primary.length === 0 && secondary.length === 0) {
    lines.push("- skill gap: no routed skill matched this task; proceed without skill assist.");
  } else {
    lines.push(`- primary: ${renderMarkdownList(primary)}`);
    lines.push(`- secondary: ${renderMarkdownList(secondary)}`);
  }
  for (const warning of result.warnings) lines.push(`- warning: ${warning}`);
  lines.push("");
  return lines.join("\n");
}

function renderMarkdownList(candidates) {
  if (candidates.length === 0) return "none";
  return candidates
    .map(candidate => `\`${candidate.name}\` (matched: ${candidate.matched.join(", ")})`)
    .join(", ");
}

function renderYaml(result, primary, secondary) {
  const lines = [
    `routing_status: ${result.status}`,
    `routing_error_code: ${result.errorCode || "null"}`,
    "routing_warnings:",
  ];
  if (result.warnings.length === 0) {
    lines[lines.length - 1] += " []";
  } else {
    for (const warning of result.warnings) lines.push(`  - '${yamlEscape(warning)}'`);
  }
  lines.push("skill_candidates:");
  if (result.status === "unavailable") {
    lines.push("  status: unavailable");
    lines.push("  primary: []");
    lines.push("  secondary: []");
  } else if (primary.length === 0 && secondary.length === 0) {
    lines.push("  status: skill_gap");
    lines.push("  primary: []");
    lines.push("  secondary: []");
  } else {
    lines.push(`  status: ${result.status}`);
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
