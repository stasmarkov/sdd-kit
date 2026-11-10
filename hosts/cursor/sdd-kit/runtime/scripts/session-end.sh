#!/bin/bash
#
# SessionEnd hook - Flush session state.
#
# - Writes a session summary to .ai/session/<timestamp>.md (project-local).
# - Touches a session-end marker so the next SessionStart can detect a fresh
#   session vs a compact-resume.
# - Best-effort: never errors out the session end.
#

set -euo pipefail

INPUT=$(cat 2>/dev/null || echo '{}')

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
SESSION_DIR="$PROJECT_DIR/.ai/session"
mkdir -p "$SESSION_DIR"

TS=$(date -u +%Y%m%dT%H%M%SZ)
FILE="$SESSION_DIR/$TS.md"

REASON=$(echo "$INPUT" | jq -r '.reason // empty' 2>/dev/null || echo "")
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty' 2>/dev/null || echo "")

{
    echo "# Session $TS"
    echo
    [[ -n "$SESSION_ID" ]] && echo "- session_id: $SESSION_ID"
    [[ -n "$REASON" ]] && echo "- reason: $REASON"
    echo "- cwd: $PROJECT_DIR"

    if git -C "$PROJECT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
        BRANCH=$(git -C "$PROJECT_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "?")
        echo "- branch: $BRANCH"

        DIRTY=$(git -C "$PROJECT_DIR" status --porcelain 2>/dev/null | head -50)
        if [[ -n "$DIRTY" ]]; then
            echo
            echo "## Uncommitted changes at session end"
            echo '```'
            echo "$DIRTY"
            echo '```'
        fi

        RECENT=$(git -C "$PROJECT_DIR" log --oneline -n 5 2>/dev/null || true)
        if [[ -n "$RECENT" ]]; then
            echo
            echo "## Recent commits"
            echo '```'
            echo "$RECENT"
            echo '```'
        fi
    fi
} > "$FILE"

# Prune older than 30 days
find "$SESSION_DIR" -type f -name '*.md' -mtime +30 -delete 2>/dev/null || true

# Marker
touch "$SESSION_DIR/.last-end" 2>/dev/null || true

exit 0
