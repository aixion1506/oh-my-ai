#!/usr/bin/env bash
set -euo pipefail

REPO="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO"

TASK_INPUT="${TASK:-}"
TASK_FILE_INPUT="${TASK_FILE:-}"

if [ -z "$TASK_INPUT" ] && [ -z "$TASK_FILE_INPUT" ]; then
  echo "usage: make work-start TASK=\"...\" or make work-start TASK_FILE=task.md" >&2
  exit 2
fi

is_denied_path() {
  case "$1" in
    .git|.git/*|./.git|./.git/*) return 0 ;;
    .oh-my-ai|.oh-my-ai/*|./.oh-my-ai|./.oh-my-ai/*) return 0 ;;
    .jikji|.jikji/*|./.jikji|./.jikji/*) return 0 ;;
    profiles/local|profiles/local/*|./profiles/local|./profiles/local/*) return 0 ;;
    docs/strategy|docs/strategy/*|./docs/strategy|./docs/strategy/*) return 0 ;;
    docs/internal|docs/internal/*|./docs/internal|./docs/internal/*) return 0 ;;
    docs/roadmap-private|docs/roadmap-private/*|./docs/roadmap-private|./docs/roadmap-private/*) return 0 ;;
    node_modules|node_modules/*|*/node_modules/*) return 0 ;;
    vendor|vendor/*|*/vendor/*) return 0 ;;
    build|build/*|*/build/*) return 0 ;;
    dist|dist/*|*/dist/*) return 0 ;;
    target|target/*|*/target/*) return 0 ;;
    coverage|coverage/*|*/coverage/*) return 0 ;;
    .cache|.cache/*|*/.cache/*|cache|cache/*|*/cache/*) return 0 ;;
    *.env|*.env.*|.env|.env.*|*secret*|*Secret*|*SECRET*) return 0 ;;
  esac
  return 1
}

validate_task_file() {
  local file="$1"
  if [ ! -f "$file" ]; then
    echo "TASK_FILE must be a local markdown/text file: $file" >&2
    exit 2
  fi
  if is_denied_path "$file"; then
    echo "TASK_FILE is under a denied path: $file" >&2
    exit 2
  fi
  case "$file" in
    *.md|*.markdown|*.txt) ;;
    *)
      echo "TASK_FILE must end with .md, .markdown, or .txt: $file" >&2
      exit 2
      ;;
  esac
}

if [ -n "$TASK_FILE_INPUT" ]; then
  validate_task_file "$TASK_FILE_INPUT"
fi

TASK_FILE_TEXT=""
if [ -n "$TASK_FILE_INPUT" ]; then
  TASK_FILE_TEXT="$(sed -n '1,240p' "$TASK_FILE_INPUT")"
fi

TASK_TEXT="$TASK_INPUT"
if [ -n "$TASK_FILE_TEXT" ]; then
  TASK_TEXT="${TASK_TEXT}"$'\n'"${TASK_FILE_TEXT}"
fi

if [ -z "$(printf '%s' "$TASK_TEXT" | tr -d '[:space:]')" ]; then
  echo "TASK/TASK_FILE produced empty task text" >&2
  exit 2
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
slug_source="$TASK_INPUT"
if [ -z "$slug_source" ]; then
  slug_source="$(basename "$TASK_FILE_INPUT")"
fi
slug="$(printf '%s' "$slug_source" \
  | tr '[:upper:]' '[:lower:]' \
  | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//' \
  | cut -c1-48)"
if [ -z "$slug" ]; then
  slug="task"
fi

OUT_DIR=".oh-my-ai/work-start/${timestamp}-${slug}"
mkdir -p "$OUT_DIR"

SOURCES_TMP="$OUT_DIR/.sources.tmp"
DOCS_TMP="$OUT_DIR/.docs.tmp"
CODE_TMP="$OUT_DIR/.code.tmp"
DECISIONS_TMP="$OUT_DIR/.decisions.tmp"
RISKS_TMP="$OUT_DIR/.risks.tmp"
KEYWORDS_TMP="$OUT_DIR/.keywords.tmp"
: > "$SOURCES_TMP"
: > "$DOCS_TMP"
: > "$CODE_TMP"
: > "$DECISIONS_TMP"
: > "$RISKS_TMP"
: > "$KEYWORDS_TMP"

yaml_escape() {
  printf '%s' "$1" | sed "s/'/''/g"
}

branch="$(git branch --show-current 2>/dev/null || true)"
if [ -z "$branch" ]; then
  branch="unknown"
fi

git_status_short="$(git status --short 2>/dev/null || true)"
changed_files="$(printf '%s\n' "$git_status_short" | sed -E 's/^.{3}//' | sed '/^$/d' | head -20 || true)"

extract_keywords() {
  printf '%s\n' "$TASK_TEXT" \
    | tr '[:upper:]' '[:lower:]' \
    | tr -cs '[:alnum:]_./-' '\n' \
    | sed -E 's#^[./-]+##; s#[./-]+$##' \
    | sed '/^$/d' \
    | awk 'length($0) >= 3' \
    | awk '
      BEGIN {
        split("the and for with from into this that your you are was were has have had task file work start basic local cloud api jira slack notion github before after should must can will not does repo code docs doc ai", stop)
        for (i in stop) skip[stop[i]]=1
      }
      !skip[$0] { print }
    ' \
    | awk '!seen[$0]++' \
    | head -12
}

extract_keywords > "$KEYWORDS_TMP"
if [ ! -s "$KEYWORDS_TMP" ]; then
  printf '%s\n' "task" > "$KEYWORDS_TMP"
fi

rg_common_args=(
  --hidden
  --glob '!.git/**'
  --glob '!.oh-my-ai/**'
  --glob '!.jikji/**'
  --glob '!profiles/local/**'
  --glob '!docs/strategy/**'
  --glob '!docs/internal/**'
  --glob '!docs/roadmap-private/**'
  --glob '!node_modules/**'
  --glob '!vendor/**'
  --glob '!build/**'
  --glob '!dist/**'
  --glob '!target/**'
  --glob '!coverage/**'
  --glob '!.cache/**'
  --glob '!cache/**'
  --glob '!*.env'
  --glob '!*.env.*'
  --glob '!**/*secret*'
  --glob '!**/*Secret*'
  --glob '!**/*SECRET*'
)

candidate_kind() {
  case "$1" in
    *.md|*.markdown|*.txt|docs/*|*/docs/*) printf '%s' "docs" ;;
    *) printf '%s' "code" ;;
  esac
}

add_candidate() {
  local path="$1"
  local backend="$2"
  local reason="$3"
  local kind
  path="${path#./}"
  [ -f "$path" ] || return 0
  is_denied_path "$path" && return 0
  kind="$(candidate_kind "$path")"
  line="$path"$'\t'"$backend"$'\t'"$reason"
  if [ "$kind" = "docs" ]; then
    grep -Fqx "$line" "$DOCS_TMP" 2>/dev/null || printf '%s\n' "$line" >> "$DOCS_TMP"
  else
    grep -Fqx "$line" "$CODE_TMP" 2>/dev/null || printf '%s\n' "$line" >> "$CODE_TMP"
  fi
}

while IFS= read -r keyword; do
  [ -n "$keyword" ] || continue
  while IFS= read -r path; do
    add_candidate "$path" "rg" "matched keyword: $keyword"
  done < <(rg -l -i -F "${rg_common_args[@]}" -- "$keyword" . 2>/dev/null | head -20 || true)

  while IFS= read -r path; do
    add_candidate "$path" "find" "path/name matched keyword: $keyword"
  done < <(find . \
    \( -path './.git' -o -path './.oh-my-ai' -o -path './.jikji' -o -path './profiles/local' -o -path './docs/strategy' -o -path './docs/internal' -o -path './docs/roadmap-private' -o -path './node_modules' -o -path './vendor' -o -path './build' -o -path './dist' -o -path './target' -o -path './coverage' -o -path './.cache' -o -path './cache' \) -prune \
    -o -type f -iname "*${keyword}*" -print 2>/dev/null | head -20 || true)
done < "$KEYWORDS_TMP"

sort -u "$DOCS_TMP" -o "$DOCS_TMP"
sort -u "$CODE_TMP" -o "$CODE_TMP"
head -15 "$DOCS_TMP" > "$DOCS_TMP.head"
head -15 "$CODE_TMP" > "$CODE_TMP.head"
mv "$DOCS_TMP.head" "$DOCS_TMP"
mv "$CODE_TMP.head" "$CODE_TMP"

candidate_paths() {
  cut -f1 "$DOCS_TMP" "$CODE_TMP" 2>/dev/null | awk 'NF && !seen[$0]++' | head -30
}

while IFS= read -r path; do
  [ -f "$path" ] || continue
  rg -n -i "${rg_common_args[@]}" 'decision|decided|rationale|trade[- ]?off|constraint|assumption|non-goal|scope' -- "$path" 2>/dev/null \
    | head -3 \
    | sed -E "s#^#${path}:#" >> "$DECISIONS_TMP" || true
  rg -n -i "${rg_common_args[@]}" 'risk|caution|warning|danger|rollback|security|secret|privacy|migration|compat|breaking|failure' -- "$path" 2>/dev/null \
    | head -3 \
    | sed -E "s#^#${path}:#" >> "$RISKS_TMP" || true
done < <(candidate_paths)

head -12 "$DECISIONS_TMP" > "$DECISIONS_TMP.head"
head -12 "$RISKS_TMP" > "$RISKS_TMP.head"
mv "$DECISIONS_TMP.head" "$DECISIONS_TMP"
mv "$RISKS_TMP.head" "$RISKS_TMP"

docs_count="$(wc -l < "$DOCS_TMP" | tr -d ' ')"
code_count="$(wc -l < "$CODE_TMP" | tr -d ' ')"
decision_count="$(wc -l < "$DECISIONS_TMP" | tr -d ' ')"
risk_count="$(wc -l < "$RISKS_TMP" | tr -d ' ')"

write_candidate_md() {
  local title="$1"
  local file="$2"
  echo "## $title"
  echo ""
  if [ -s "$file" ]; then
    awk -F '\t' '{ printf "- `%s` - candidate via `%s`; %s\n", $1, $2, $3 }' "$file"
  else
    echo "- none found"
  fi
  echo ""
}

write_text_candidates_md() {
  local title="$1"
  local file="$2"
  echo "## $title"
  echo ""
  if [ -s "$file" ]; then
    awk '{ printf "- candidate: %s\n", $0 }' "$file"
  else
    echo "- none found"
  fi
  echo ""
}

{
  echo "# Sources"
  echo ""
  echo "Task source type: $([ -n "$TASK_FILE_INPUT" ] && echo "external_doc" || echo "manual_task")"
  if [ -n "$TASK_INPUT" ]; then
    echo ""
    echo "## TASK"
    echo ""
    printf '%s\n' "$TASK_INPUT"
  fi
  if [ -n "$TASK_FILE_INPUT" ]; then
    echo ""
    echo "## TASK_FILE"
    echo ""
    echo "- path: $TASK_FILE_INPUT"
    echo "- type: external_doc"
  fi
  echo ""
  echo "## Search keywords"
  sed 's/^/- /' "$KEYWORDS_TMP"
  echo ""
  echo "## Dirty worktree changed files"
  echo ""
  echo "Reference-only. Do not assume these files define the task intent."
  if [ -n "$changed_files" ]; then
    printf '%s\n' "$changed_files" | sed 's/^/- /'
  else
    echo "- none"
  fi
  echo ""
  write_candidate_md "Relevant document candidates" "$DOCS_TMP"
  write_candidate_md "Relevant code candidates" "$CODE_TMP"
} > "$OUT_DIR/sources.md"

{
  echo "# Context Gap Report"
  echo ""
  if [ "$docs_count" -eq 0 ]; then
    echo "- No document candidates were found for this task."
  fi
  if [ "$code_count" -eq 0 ]; then
    echo "- No code candidates were found for this task."
  fi
  if [ "$decision_count" -eq 0 ]; then
    echo "- No decision candidates were found. Add a TASK_FILE with ticket, meeting note, chat excerpt, or local notes if available."
  fi
  if [ "$risk_count" -eq 0 ]; then
    echo "- No risk candidates were found. Review security, data, migration, and rollback risks manually before editing."
  fi
  if [ "$docs_count" -ne 0 ] && [ "$code_count" -ne 0 ] && [ "$decision_count" -ne 0 ] && [ "$risk_count" -ne 0 ]; then
    echo "- No major context gaps detected by the MVP heuristics."
  fi
  echo ""
  echo "## Bootstrap Questions"
  echo ""
  echo "- Which service, module, or path is in scope?"
  echo "- Are there local notes, meeting notes, ticket text, or chat excerpts to provide as TASK_FILE?"
  echo "- Are there known constraints, non-goals, or forbidden files?"
  echo "- What must be verified before any edit is made?"
} > "$OUT_DIR/context-gap-report.md"

{
  echo "manifest_version: 1"
  echo "workspace:"
  echo "  id: null"
  echo "  name: local"
  echo "project:"
  echo "  id: null"
  echo "  name: current-repo"
  echo "session:"
  echo "  task: '$(yaml_escape "$TASK_INPUT")'"
  echo "  task_file: $([ -n "$TASK_FILE_INPUT" ] && printf "'%s'" "$(yaml_escape "$TASK_FILE_INPUT")" || printf "null")"
  echo "  mode: basic"
  echo "  created_at: '$timestamp'"
  echo "repo:"
  echo "  root: '$(yaml_escape "$REPO")'"
  echo "  branch: '$(yaml_escape "$branch")'"
  if [ -n "$changed_files" ]; then
    echo "  dirty_worktree_reference_only:"
    printf '%s\n' "$changed_files" | sed "s/'/''/g; s/^/    - path: '/; s/$/'/"
  else
    echo "  dirty_worktree_reference_only: []"
  fi
  echo "sources:"
  echo "  task_source_type: $([ -n "$TASK_FILE_INPUT" ] && echo "external_doc" || echo "manual_task")"
  if [ -s "$DOCS_TMP" ]; then
    echo "  docs:"
    awk -F '\t' '{ gsub(/\047/, "\047\047", $1); gsub(/\047/, "\047\047", $2); gsub(/\047/, "\047\047", $3); printf "    - path: '\''%s'\''\n      backend: '\''%s'\''\n      reason: '\''%s'\''\n      confidence: candidate\n", $1, $2, $3 }' "$DOCS_TMP"
  else
    echo "  docs: []"
  fi
  if [ -s "$CODE_TMP" ]; then
    echo "  code:"
    awk -F '\t' '{ gsub(/\047/, "\047\047", $1); gsub(/\047/, "\047\047", $2); gsub(/\047/, "\047\047", $3); printf "    - path: '\''%s'\''\n      backend: '\''%s'\''\n      reason: '\''%s'\''\n      confidence: candidate\n", $1, $2, $3 }' "$CODE_TMP"
  else
    echo "  code: []"
  fi
  if [ -s "$DECISIONS_TMP" ]; then
    echo "decision_candidates:"
    awk '{ gsub(/\047/, "\047\047", $0); printf "  - text: '\''%s'\''\n    confidence: candidate\n", $0 }' "$DECISIONS_TMP"
  else
    echo "decision_candidates: []"
  fi
  if [ -s "$RISKS_TMP" ]; then
    echo "risk_candidates:"
    awk '{ gsub(/\047/, "\047\047", $0); printf "  - text: '\''%s'\''\n    confidence: candidate\n", $0 }' "$RISKS_TMP"
  else
    echo "risk_candidates: []"
  fi
  echo "prompts:"
  echo "  starter: 'starter-prompt.md'"
  echo "context_gaps:"
  echo "  report: 'context-gap-report.md'"
  echo "  bootstrap_questions:"
  echo "    - 'Which service, module, or path is in scope?'"
  echo "    - 'Are there local notes, meeting notes, ticket text, or chat excerpts to provide as TASK_FILE?'"
  echo "    - 'Are there known constraints, non-goals, or forbidden files?'"
  echo "    - 'What must be verified before any edit is made?'"
  echo "artifacts:"
  echo "  path: '$OUT_DIR'"
  echo "  local_only: true"
} > "$OUT_DIR/context-manifest.yaml"

{
  echo "# Starter Prompt"
  echo ""
  echo "You are starting work on this task:"
  echo ""
  if [ -n "$TASK_INPUT" ]; then
    echo "> $TASK_INPUT"
  else
    echo "> See TASK_FILE: $TASK_FILE_INPUT"
  fi
  echo ""
  echo "Before editing code:"
  echo "1. Read the relevant candidates below."
  echo "2. Treat every search result as a candidate, not an answer."
  echo "3. Identify conflicting decisions, missing context, and risks."
  echo "4. Propose a minimal plan before editing."
  echo "5. Do not modify files until the plan is reviewed."
  echo ""
  write_candidate_md "Relevant document candidates" "$DOCS_TMP"
  write_candidate_md "Relevant code candidates" "$CODE_TMP"
  write_text_candidates_md "Decision candidates" "$DECISIONS_TMP"
  write_text_candidates_md "Risk candidates" "$RISKS_TMP"
  echo "## Context gaps and open questions"
  echo ""
  cat "$OUT_DIR/context-gap-report.md"
} > "$OUT_DIR/starter-prompt.md"

rm -f "$SOURCES_TMP" "$DOCS_TMP" "$CODE_TMP" "$DECISIONS_TMP" "$RISKS_TMP" "$KEYWORDS_TMP"

echo "work-start artifact created: $OUT_DIR"
echo "  - context-manifest.yaml"
echo "  - starter-prompt.md"
echo "  - sources.md"
echo "  - context-gap-report.md"
