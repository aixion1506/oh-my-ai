#!/usr/bin/env bash
set -euo pipefail

REPO="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO"

VALIDATOR="$REPO/scripts/validate-capabilities.mjs"
REAL_FILE="$REPO/capabilities/runtime-capabilities.json"

cleanup_dirs=()
cleanup() {
  for d in "${cleanup_dirs[@]:-}"; do
    case "$d" in
      */oh-my-ai-capability-fixture.*) [ -d "$d" ] && rm -rf -- "$d" ;;
    esac
  done
}
trap cleanup EXIT

fail() {
  echo "fixture failure: $*" >&2
  exit 1
}

require_file() {
  [ -f "$1" ] || fail "missing file: $1"
}

sandbox() {
  local d
  d="$(mktemp -d "${TMPDIR:-/tmp}/oh-my-ai-capability-fixture.XXXXXX")"
  cleanup_dirs+=("$d")
  printf '%s\n' "$d"
}

# mutate REAL_FILE with a jq-free node one-liner and write to a temp file
mutate() {
  local mutator_js="$1"
  local out="$2"
  node -e "
    const fs = require('fs');
    const doc = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
    const mutate = (doc) => { $mutator_js };
    mutate(doc);
    fs.writeFileSync(process.argv[2], JSON.stringify(doc));
  " "$REAL_FILE" "$out"
}

expect_valid() {
  local file="$1"
  local label="$2"
  if ! node "$VALIDATOR" "$file" >/dev/null 2>&1; then
    node "$VALIDATOR" "$file" || true
    fail "$label: expected valid, validator rejected it"
  fi
}

expect_invalid() {
  local file="$1"
  local label="$2"
  local expect_substring="$3"
  local out
  if out="$(node "$VALIDATOR" "$file" 2>&1)"; then
    fail "$label: expected invalid, validator accepted it"
  fi
  case "$out" in
    *"$expect_substring"*) ;;
    *) fail "$label: expected error containing '$expect_substring', got: $out" ;;
  esac
}

# --- FX-CAP-001 Supported Capability (Positive) ---------------------------

fx_cap_001() {
  expect_valid "$REAL_FILE" "FX-CAP-001"
  grep -q '"declared_status": "supported"' "$REAL_FILE" || fail "FX-CAP-001: expected at least one supported capability in the real declaration"
  echo "passed: FX-CAP-001-supported-capability"
}

# --- FX-CAP-002 Conditional Capability (Positive) --------------------------

fx_cap_002() {
  grep -q '"declared_status": "conditional"' "$REAL_FILE" || fail "FX-CAP-002: expected at least one conditional capability in the real declaration"
  echo "passed: FX-CAP-002-conditional-capability"
}

# --- FX-CAP-010 Approval Mixed into Capability (Negative) ------------------

fx_cap_010() {
  local d out
  d="$(sandbox)"; out="$d/mutated.json"
  mutate '
    const cap = doc.runtimes.claude.capabilities.find(c => c.capability_id === "capability.result.structured");
    cap.conditions = ["Human Approval granted for this action"];
  ' "$out"
  expect_invalid "$out" "FX-CAP-010" "must not encode Human Approval"
  echo "passed: FX-CAP-010-approval-mixed-into-capability"
}

# --- FX-CAP-011 Availability Mixed into Capability (Negative) --------------

fx_cap_011() {
  local d out
  d="$(sandbox)"; out="$d/mutated.json"
  mutate '
    const cap = doc.runtimes.claude.capabilities.find(c => c.capability_id === "capability.file.read");
    cap.declared_status = "unsupported";
    cap.effective_status = "unsupported";
    cap.limitations = ["binary not installed"];
    cap.safe_fallback = "n/a";
    cap.source = { type: "manual_fixture", reference: "test" };
    cap.evidence_refs = ["X"];
  ' "$out"
  expect_invalid "$out" "FX-CAP-011" "must not be justified by Availability/Authentication state"
  echo "passed: FX-CAP-011-availability-mixed-into-capability"
}

# --- FX-CAP-012 Unsupported without Evidence (Negative) --------------------

fx_cap_012() {
  local d out
  d="$(sandbox)"; out="$d/mutated.json"
  mutate '
    const cap = doc.runtimes.claude.capabilities.find(c => c.capability_id === "capability.workspace.worktree");
    cap.source = { type: "not_verified", reference: null };
    cap.evidence_refs = [];
  ' "$out"
  expect_invalid "$out" "FX-CAP-012" "requires evidence_refs or an explicit_verification_record"
  echo "passed: FX-CAP-012-unsupported-without-evidence"
}

# --- FX-CAP-013 Unknown Promoted by Manual Step (Negative) -----------------

fx_cap_013() {
  local d out
  d="$(sandbox)"; out="$d/mutated.json"
  mutate '
    const cap = doc.runtimes.codex.capabilities.find(c => c.capability_id === "capability.session.resume");
    cap.required_manual_step = ["Just trust it works"];
  ' "$out"
  expect_invalid "$out" "FX-CAP-013" "would imply a verified manual-step promotion"
  echo "passed: FX-CAP-013-unknown-promoted-by-manual-step"
}

# --- FX-CAP-014 Stale Advertised Support (Negative) -------------------------

fx_cap_014() {
  local d out
  d="$(sandbox)"; out="$d/mutated.json"
  mutate '
    doc.runtimes.claude.drift_status = "stale";
  ' "$out"
  expect_invalid "$out" "FX-CAP-014" "drift_status=stale"
  echo "passed: FX-CAP-014-stale-advertised-support"
}

# --- FX-CAP-015 Structured Result Overclaim (Negative) ----------------------

fx_cap_015() {
  local d out
  d="$(sandbox)"; out="$d/mutated.json"
  mutate '
    const freeform = doc.runtimes.claude.capabilities.find(c => c.capability_id === "capability.result.freeform");
    freeform.declared_status = "unknown";
    freeform.effective_status = "unknown";
    freeform.unknown_reason = "synthetic mutation for FX-CAP-015";
    freeform.verification_needed = "n/a";
    freeform.safe_fallback = "n/a";
    freeform.evidence_refs = [];
    freeform.required_manual_step = [];
    freeform.source = { type: "not_verified", reference: null };
  ' "$out"
  expect_invalid "$out" "FX-CAP-015" "Structured Result Overclaim"
  echo "passed: FX-CAP-015-structured-result-overclaim"
}

# --- FX-CAP-016 Authentication Mixed into Capability (Negative) ------------

fx_cap_016() {
  local d out
  d="$(sandbox)"; out="$d/mutated.json"
  mutate '
    const cap = doc.runtimes.claude.capabilities.find(c => c.capability_id === "capability.shell.execute");
    cap.declared_status = "unsupported";
    cap.effective_status = "unsupported";
    cap.limitations = ["not authenticated"];
    cap.safe_fallback = "n/a";
    cap.source = { type: "manual_fixture", reference: "test" };
    cap.evidence_refs = ["X"];
  ' "$out"
  expect_invalid "$out" "FX-CAP-016" "must not be justified by Availability/Authentication state"
  echo "passed: FX-CAP-016-authentication-mixed-into-capability"
}

# --- Supplementary: duplicate capability_id (Registry Conflict) ------------

fx_supplementary_duplicate_id() {
  local d out
  d="$(sandbox)"; out="$d/mutated.json"
  mutate '
    const first = doc.runtimes.claude.capabilities[0];
    doc.runtimes.claude.capabilities.push({ ...first });
  ' "$out"
  expect_invalid "$out" "duplicate-capability-id" "duplicate capability_id"
  echo "passed: FX-supplementary-duplicate-capability-id"
}

# --- Supplementary: unknown must not carry evidence_refs -------------------

fx_supplementary_unknown_with_evidence() {
  local d out
  d="$(sandbox)"; out="$d/mutated.json"
  mutate '
    const cap = doc.runtimes.codex.capabilities.find(c => c.capability_id === "capability.session.resume");
    cap.evidence_refs = ["should-not-be-here"];
  ' "$out"
  expect_invalid "$out" "unknown-with-evidence" "must not carry evidence_refs"
  echo "passed: FX-supplementary-unknown-with-evidence-refs"
}

# --- Truthfulness: Public Documentation only claims what Metadata claims ---
# (Contract §46: Public Documentation과 Metadata 정합성)

fx_truthfulness_readme_matches_metadata() {
  require_file "README.md"
  node -e '
    const fs = require("fs");
    const doc = JSON.parse(fs.readFileSync("capabilities/runtime-capabilities.json", "utf8"));
    const readme = fs.readFileSync("README.md", "utf8");
    for (const [name, runtime] of Object.entries(doc.runtimes)) {
      if (runtime.advertised_support) {
        if (!readme.includes(name) && !/claude code/i.test(readme)) {
          console.error(`README does not mention advertised runtime: ${name}`);
          process.exit(1);
        }
      }
    }
  ' || fail "truthfulness: README does not mention an advertised_support Runtime"
  # The inverse: a Runtime not advertised must not be claimed "supported" in prose near a Quick Start section.
  if grep -qi "codex.*fully supported\|codex.*verified end-to-end" README.md 2>/dev/null; then
    fail "truthfulness: README overclaims Codex support beyond what capabilities/runtime-capabilities.json declares"
  fi
  echo "passed: FX-truthfulness-readme-matches-metadata"
}

# --- run everything ----------------------------------------------------------

require_file "$VALIDATOR"
require_file "$REAL_FILE"

fx_cap_001
fx_cap_002
fx_cap_010
fx_cap_011
fx_cap_012
fx_cap_013
fx_cap_014
fx_cap_015
fx_cap_016
fx_supplementary_duplicate_id
fx_supplementary_unknown_with_evidence
fx_truthfulness_readme_matches_metadata

echo "all Capability fixtures passed"
