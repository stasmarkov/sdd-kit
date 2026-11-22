#!/bin/bash
#
# PreToolUse hook (Bash matcher) - blocks `find` from the filesystem root,
# which walks the whole disk and floods the context. Search from . or a
# specific subtree instead.
#

set -euo pipefail

INPUT=$(cat)

CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

if echo "$CMD" | grep -qE '(^|[[:space:]|;&])find[[:space:]]+/[[:space:]]'; then
    REASON="Refuse find from filesystem root. Search from . or a specific subtree."
    jq -nc --arg r "$REASON" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
    echo "$REASON" >&2
    exit 2
fi

exit 0
