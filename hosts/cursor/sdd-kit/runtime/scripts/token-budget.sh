#!/bin/bash
#
# PreToolUse hook (Read|Grep|Glob|Bash matcher) - Token budget warden
#
# Blocks expensive reads/searches when the session is near the context limit
# or when the operation is intrinsically expensive (root-wide find, unbounded
# Read of huge files, recursive grep with no path scope).
#
# Threshold (default 75%) read from CLAUDE_BUDGET_THRESHOLD env var.
# Current usage hinted via CLAUDE_CONTEXT_USAGE (0-100), otherwise unknown.
#

set -euo pipefail

INPUT=$(cat)

TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty')
THRESHOLD="${CLAUDE_BUDGET_THRESHOLD:-75}"
USAGE="${CLAUDE_CONTEXT_USAGE:-0}"

is_over_budget() {
    [[ "$USAGE" =~ ^[0-9]+$ ]] && (( USAGE >= THRESHOLD ))
}

emit_block() {
    local reason="$1"
    jq -nc --arg r "$reason" '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
    exit 2
}

case "$TOOL" in
    Read)
        FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
        OFFSET=$(echo "$INPUT" | jq -r '.tool_input.offset // empty')
        LIMIT=$(echo "$INPUT" | jq -r '.tool_input.limit // empty')
        if [[ -n "$FILE" ]] && [[ -f "$FILE" ]]; then
            LINES=$(wc -l < "$FILE" 2>/dev/null || echo 0)
            if (( LINES > 5000 )) && [[ -z "$OFFSET" ]] && [[ -z "$LIMIT" ]]; then
                if is_over_budget; then
                    emit_block "Context $USAGE% used; refuse unbounded Read of $LINES-line file. Use offset+limit or grep first."
                fi
            fi
        fi
        ;;
    Grep)
        GLOB=$(echo "$INPUT" | jq -r '.tool_input.glob // empty')
        PATH_ARG=$(echo "$INPUT" | jq -r '.tool_input.path // empty')
        OUTMODE=$(echo "$INPUT" | jq -r '.tool_input.output_mode // empty')
        if [[ -z "$GLOB" ]] && [[ -z "$PATH_ARG" ]] && [[ "$OUTMODE" == "content" ]]; then
            if is_over_budget; then
                emit_block "Context $USAGE% used; refuse repo-wide content grep. Scope with path or glob, or use output_mode=files_with_matches."
            fi
        fi
        ;;
    Glob)
        PATTERN=$(echo "$INPUT" | jq -r '.tool_input.pattern // empty')
        if [[ "$PATTERN" == "**/*" ]] || [[ "$PATTERN" == "**" ]]; then
            if is_over_budget; then
                emit_block "Context $USAGE% used; refuse open-ended glob '$PATTERN'. Narrow the pattern."
            fi
        fi
        ;;
    Bash)
        CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
        # find from / is always expensive
        if echo "$CMD" | grep -qE '(^|[[:space:]|;&])find[[:space:]]+/[[:space:]]'; then
            emit_block "Refuse find from filesystem root. Search from . or a specific subtree."
        fi
        # recursive ripgrep/grep with no path argument when over budget
        if is_over_budget && echo "$CMD" | grep -qE '^[[:space:]]*(rg|grep[[:space:]]+-r)[[:space:]]+[^|]*$'; then
            if ! echo "$CMD" | grep -qE '[[:space:]](\./|src/|app/|lib/|tests?/|/[^[:space:]]+)'; then
                emit_block "Context $USAGE% used; refuse recursive grep with no path scope."
            fi
        fi
        # Cat/head/tail of very large logs
        if is_over_budget && echo "$CMD" | grep -qE '(^|[[:space:]|;&])(cat|less|more)[[:space:]]+[^|]*\.log([[:space:]]|$)'; then
            emit_block "Context $USAGE% used; refuse to dump full log. Use tail -n or grep."
        fi
        ;;
esac

exit 0
