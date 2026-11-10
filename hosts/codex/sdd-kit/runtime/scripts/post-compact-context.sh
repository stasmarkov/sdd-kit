#!/bin/bash
set -euo pipefail
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"

# Re-inject Golden Triangle summaries after context compaction
for f in business-rules.md architecture.md workflow.md; do
  if [[ -f "$PROJECT_DIR/docs/context/$f" ]]; then
    echo "--- $f ---"
    head -30 "$PROJECT_DIR/docs/context/$f"
    echo ""
  fi
done

# Re-inject active spec status
if [[ -d "$PROJECT_DIR/.ai/specs" ]]; then
  ACTIVE=$(find "$PROJECT_DIR/.ai/specs" -name "tasks.md" -exec grep -l '\- \[ \]' {} \; 2>/dev/null | wc -l | tr -d ' ')
  if [[ "$ACTIVE" -gt 0 ]]; then
    echo "Active specs with pending tasks: $ACTIVE. Use /execute-task --continue"
  fi
fi

# Re-inject session checkpoint
if [[ -d "$PROJECT_DIR/.ai/session" ]]; then
  LATEST=$(find "$PROJECT_DIR/.ai/session" -maxdepth 1 -name "spec-*-state.json" -print0 2>/dev/null | xargs -0 ls -t 2>/dev/null | head -1 || true)
  if [[ -n "$LATEST" ]]; then
    echo "Session checkpoint: $(basename "$LATEST")"
  fi
fi

# Re-surface candidate lessons so they are not lost with the old context
if [[ -f "$PROJECT_DIR/.ai/session/lessons.jsonl" ]]; then
  LESSONS=$(jq -r 'select(.status == "pending") | "- \(.signal)\(if .excerpt != "" then ": " + .excerpt else "" end)"' \
    "$PROJECT_DIR/.ai/session/lessons.jsonl" 2>/dev/null | tail -3)
  if [[ -n "$LESSONS" ]]; then
    echo "Candidate lessons not yet captured (run /learn):"
    echo "$LESSONS"
  fi
fi

exit 0
