#!/bin/bash
#
# PreCompact hook - Save session state before context compression
#
# Saves a checkpoint so work can be resumed after compaction.
# Receives JSON on stdin with session context.
#

set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
SESSION_DIR="$PROJECT_DIR/.ai/session"

mkdir -p "$SESSION_DIR"

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
CHECKPOINT_FILE="$SESSION_DIR/pre-compact-$(date +%Y%m%d_%H%M%S).json"

# Find the active spec (most recently modified tasks.md with pending items)
ACTIVE_SPEC=""
if [[ -d "$PROJECT_DIR/.ai/specs" ]]; then
    ACTIVE_SPEC=$(find "$PROJECT_DIR/.ai/specs" -name "tasks.md" -exec grep -l '\- \[ \]' {} \; 2>/dev/null | head -1 || true)
fi

# Count completed vs pending tasks
COMPLETED=0
PENDING=0
if [[ -n "$ACTIVE_SPEC" ]]; then
    COMPLETED=$(grep -c '\- \[x\]' "$ACTIVE_SPEC" 2>/dev/null || echo "0")
    PENDING=$(grep -c '\- \[ \]' "$ACTIVE_SPEC" 2>/dev/null || echo "0")
fi

# Candidate lessons recorded by the Stop hook and not yet turned into guards
PENDING_LESSONS=0
if [[ -f "$SESSION_DIR/lessons.jsonl" ]]; then
    PENDING_LESSONS=$(jq -s '[.[] | select(.status == "pending")] | length' "$SESSION_DIR/lessons.jsonl" 2>/dev/null || echo 0)
fi

ACTIVE_SPEC_JSON="${ACTIVE_SPEC//\"/\\\"}"

# Save checkpoint
cat > "$CHECKPOINT_FILE" << EOF
{
  "timestamp": "$TIMESTAMP",
  "event": "pre_compact",
  "active_spec": "$ACTIVE_SPEC_JSON",
  "tasks_completed": $COMPLETED,
  "tasks_pending": $PENDING,
  "pending_lessons": $PENDING_LESSONS
}
EOF

echo "Session checkpoint saved to $CHECKPOINT_FILE"

exit 0
