#!/usr/bin/env bash
# PreToolUse hook — block escape-hatch suppressions in agent diffs.
# Human suppression path = edit outside the agent loop (no in-band allowlist).
set -euo pipefail

input=$(cat)
tool=$(jq -r '.tool_name // empty' <<<"$input")

block() {
  echo "$1" >&2
  exit 2
}

LINT_MSG="suppression comments are blocked — fix the violation with a --color-* token from web/index.css or ask the human to suppress"
TYPE_MSG="type-suppressions are blocked — fix the underlying type error (npm run typecheck) or ask the human to suppress"
SELF_MSG="the enforcement hook and its settings are human-only — ask the human to change .claude/settings.json or .claude/hooks/"
TEST_MSG="deleting test files is blocked — ask the human to remove tests outside the agent loop"

CODE_EXT='(ts|tsx|js|jsx|css|cjs|mjs)'

if [[ "$tool" == "Edit" || "$tool" == "Write" ]]; then
  file=$(jq -r '.tool_input.file_path // empty' <<<"$input")
  case "$file" in
    */.claude/settings*.json|.claude/settings*.json|*/.claude/hooks/*|.claude/hooks/*) block "$SELF_MSG" ;;
  esac
  case "$file" in
    *.ts|*.tsx|*.js|*.jsx|*.css|*.cjs|*.mjs) ;;
    *) exit 0 ;;
  esac
  content=$(jq -r '.tool_input.new_string // .tool_input.content // empty' <<<"$input")
  if grep -qE 'eslint-disable|stylelint-disable' <<<"$content"; then
    block "$LINT_MSG"
  fi
  if grep -qE '@ts-ignore|@ts-expect-error|\bas any *($|[^a-zA-Z ])' <<<"$content"; then
    block "$TYPE_MSG"
  fi
elif [[ "$tool" == "Bash" ]]; then
  cmd=$(jq -r '.tool_input.command // empty' <<<"$input")
  if grep -qE "\brm [^&|;]*\.(test|spec)\.[jt]sx?|\brm [^&|;]*__tests__" <<<"$cmd"; then
    block "$TEST_MSG"
  fi
  # Bash-mediated suppression writes: a banned token in the command combined
  # with a write into a code file (redirect/tee) or an in-place sed.
  if grep -qE 'eslint-disable|stylelint-disable|@ts-ignore|@ts-expect-error' <<<"$cmd" &&
    grep -qE ">>?[[:space:]]*[^[:space:]]*\.${CODE_EXT}\b|tee [^|]*\.${CODE_EXT}\b|sed .*-i" <<<"$cmd"; then
    block "$LINT_MSG"
  fi
fi

exit 0
