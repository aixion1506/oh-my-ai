#!/usr/bin/env node
//
// Validates a filled-in Result Basic Markdown instance (templates/result-basic.md
// convention) against the structural and cross-field rules in
// docs/contracts/result-basic-contract.md (harness-foundation-docs), scoped to
// what a Markdown Manual Copy/Paste Artifact can actually express (V1 is
// Markdown, not the Contract's illustrative YAML).
//
// This does not implement Managed Result Return, Import, or automatic
// completion detection -- Result Basic remains a self-report Evidence
// Candidate; this validator only checks that the self-report is internally
// well-formed and does not contradict itself.

import fs from "node:fs";

const REQUIRED_HEADINGS = [
  "Contract Metadata",
  "Title",
  "Summary",
  "Work Performed",
  "Findings",
  "Evidence",
  "Files Read",
  "Files Changed",
  "Commands Executed",
  "Side Effects",
  "Validation Performed",
  "Validation Not Performed",
  "Validation Results",
  "Completion Criteria Results",
  "Assumptions",
  "Open Issues",
  "Scope Deviations",
  "Remaining Risks",
  "Blocked Reasons",
  "Recommended Next Action",
  "Runtime Context",
  "Truthfulness Checklist",
  "Human Review Boundary",
];

const EXECUTION_STATUS_VALUES = new Set(["complete", "partial", "failed", "blocked"]);

function splitSections(markdown) {
  const lines = markdown.split("\n");
  const sections = {};
  let current = null;
  let buf = [];
  for (const line of lines) {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (m) {
      if (current) sections[current] = buf.join("\n").trim();
      current = m[1];
      buf = [];
    } else if (current) {
      buf.push(line);
    }
  }
  if (current) sections[current] = buf.join("\n").trim();
  return sections;
}

function isNone(body) {
  const trimmed = body.trim();
  if (trimmed.length === 0) return true;
  const lines = trimmed.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return true;
  // Every remaining line is a "None" bullet (allowing surrounding backticks).
  return lines.every((l) => /^-?\s*`?none`?\.?$/i.test(l));
}

function field(metadataBody, name) {
  const re = new RegExp(`^-\\s*\`${name}\`:\\s*\`?([^\`\\n]*)\`?\\s*$`, "m");
  const m = re.exec(metadataBody);
  return m ? m[1].trim() : null;
}

function validate(markdown) {
  const errors = [];
  const sections = splitSections(markdown);

  for (const heading of REQUIRED_HEADINGS) {
    if (!(heading in sections)) errors.push(`missing required heading: ## ${heading}`);
  }
  if (errors.length > 0) return errors; // structural failure; stop here

  const meta = sections["Contract Metadata"];
  const executionStatus = field(meta, "execution_status");
  if (!EXECUTION_STATUS_VALUES.has(executionStatus)) {
    errors.push(`execution_status must be one of complete/partial/failed/blocked, got: ${executionStatus}`);
  }

  const blockedReasonsEmpty = isNone(sections["Blocked Reasons"]);
  const validationPerformedEmpty = isNone(sections["Validation Performed"]);
  const validationNotPerformedEmpty = isNone(sections["Validation Not Performed"]);
  const openIssuesEmpty = isNone(sections["Open Issues"]);
  const scopeDeviationsEmpty = isNone(sections["Scope Deviations"]);
  const filesReadEmpty = isNone(sections["Files Read"]);
  const filesChangedEmpty = isNone(sections["Files Changed"]);

  // "Files Read / Changed 분리" is a structural requirement: the two must
  // exist as independently headed sections (checked above via
  // REQUIRED_HEADINGS), each individually listed. It is not a requirement
  // that their contents differ -- reading a file and then changing it is the
  // normal case, and both sections should legitimately list it.

  if (executionStatus === "blocked") {
    if (blockedReasonsEmpty) {
      errors.push("execution_status=blocked requires at least one entry under Blocked Reasons");
    }
  } else if (!blockedReasonsEmpty) {
    errors.push(`execution_status=${executionStatus} but Blocked Reasons is non-empty (Blocked Reasons is for status=blocked only)`);
  }

  if (executionStatus === "complete") {
    if (validationPerformedEmpty) {
      errors.push("execution_status=complete requires at least one entry under Validation Performed (cannot claim complete with zero validation performed)");
    }
    if (!scopeDeviationsEmpty) {
      errors.push("execution_status=complete but Scope Deviations is non-empty (Contract §23: complete requires no Material Scope Deviation)");
    }
  }

  if (executionStatus === "partial") {
    if (validationNotPerformedEmpty && openIssuesEmpty) {
      errors.push("execution_status=partial requires evidence of incompleteness under Validation Not Performed or Open Issues");
    }
  }

  if (executionStatus === "failed") {
    if (filesChangedEmpty && filesReadEmpty && validationPerformedEmpty) {
      // Not a hard requirement, but a failed Result with literally nothing
      // attempted/observed is suspicious; flag it as a truthfulness concern.
      errors.push("execution_status=failed but no Files Read, Files Changed, or Validation Performed is recorded; nothing observable was actually attempted");
    }
  }

  // Truthfulness: never allow "Validation Not Performed" to be silently
  // absent from consideration -- it must be present as a heading (checked
  // above) and, if execution_status is not complete, having it fully empty
  // AND Open Issues fully empty AND execution_status=partial is already
  // caught. For complete/blocked/failed we do not force it non-empty, since
  // a complete run legitimately can have performed every validation it needed.

  const createdBy = field(meta, "created_by");
  if (!createdBy) errors.push("Contract Metadata missing created_by");

  const receiptStatus = field(meta, "receipt_status");
  if (receiptStatus !== "received") {
    errors.push(`receipt_status must be 'received' for a Result Basic that was actually returned, got: ${receiptStatus}`);
  }

  return errors;
}

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: validate-result-basic.mjs <path-to-result-basic.md>");
    process.exit(2);
  }
  if (!fs.existsSync(file)) {
    // Missing Result is a distinct, valid state (Contract §40), not a
    // validator crash -- report it as such on stderr and a distinct exit code.
    console.error("missing_result: no Result Basic file was returned (receipt_status: missing, execution_status: unknown)");
    process.exit(3);
  }
  const markdown = fs.readFileSync(file, "utf8");
  const errors = validate(markdown);
  if (errors.length > 0) {
    for (const e of errors) console.error(`invalid: ${e}`);
    process.exit(1);
  }
  console.log(`valid: ${file}`);
  process.exit(0);
}

main();

export { validate, splitSections, isNone, field };
