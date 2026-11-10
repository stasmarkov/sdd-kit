#!/bin/bash
#
# UserPromptSubmit hook - Pre-process the user's prompt.
#
# - Detects dangerous verbs (drop production db, force push main, etc.) and
#   injects a guardrail context message (does not block).
# - Detects spec/task references and injects a hint to load relevant spec
#   files before acting.
# - Never blocks. Always exits 0.
#
# Output protocol: JSON on stdout with optional "additionalContext" field.
#

set -euo pipefail

INPUT=$(cat)

PROMPT=$(echo "$INPUT" | jq -r '.prompt // .user_prompt // empty')
if [[ -z "$PROMPT" ]]; then
    exit 0
fi

LOWER=$(echo "$PROMPT" | tr '[:upper:]' '[:lower:]')

CONTEXT_LINES=()

# Dangerous verbs against production
if echo "$LOWER" | grep -qE '(delete|drop|truncate|wipe|destroy)[[:space:]]+.*(production|prod\b|live|main[[:space:]]+db)'; then
    CONTEXT_LINES+=("Guardrail: prompt targets production data. Do NOT execute destructive operations against production. Confirm scope is a local/test environment, or refuse and ask the user to switch contexts.")
fi

if echo "$LOWER" | grep -qE '(force[[:space:]]+push|push[[:space:]]+--?force|push[[:space:]]+-f)[[:space:]]+.*(main|master|production)'; then
    CONTEXT_LINES+=("Guardrail: force-push to main/master/production is blocked by the dangerous-command hook. Use a feature branch and a PR.")
fi

if echo "$LOWER" | grep -qE '(rm[[:space:]]+-rf|rm[[:space:]]+-fr)[[:space:]]+/'; then
    CONTEXT_LINES+=("Guardrail: 'rm -rf /' patterns will be blocked by PreToolUse hook. Specify a precise path.")
fi

if echo "$LOWER" | grep -qE 'skip[[:space:]]+(the[[:space:]]+)?(tests|hooks|verification|review|lint)'; then
    CONTEXT_LINES+=("Guardrail: user asked to skip verification. Confirm explicitly with the user before bypassing tests, hooks, or review steps — and never use --no-verify on commits unless instructed.")
fi

# Spec/task references
if echo "$PROMPT" | grep -qE '\b(TASK|SPEC)-[0-9]{2,}\b'; then
    REFS=$(echo "$PROMPT" | grep -oE '\b(TASK|SPEC)-[0-9]{2,}\b' | sort -u | tr '\n' ' ')
    CONTEXT_LINES+=("Hint: prompt references $REFS. Load the corresponding files under .ai/specs/ or .ai/tasks/ before acting.")
fi

# /caveman, /graphify, /plan invocations: log only
if echo "$PROMPT" | grep -qE '^\s*/(caveman|graphify|grade|deep-review)'; then
    : # no-op; built-in skills handle it
fi

if [[ ${#CONTEXT_LINES[@]} -eq 0 ]]; then
    exit 0
fi

CONTEXT=$(printf '%s\n' "${CONTEXT_LINES[@]}")
jq -nc --arg c "$CONTEXT" '{additionalContext: $c}'
exit 0
