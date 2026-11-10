#!/bin/bash
#
# SessionStart hook - Load framework context at session beginning
#
# Reads JSON from stdin with session info.
# Outputs context hints to stdout (displayed to Claude).
#

set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"

output=""

# Check for active specs
if [[ -d "$PROJECT_DIR/.ai/specs" ]]; then
    active_specs=$(find "$PROJECT_DIR/.ai/specs" -name "tasks.md" -exec grep -l '\- \[ \]' {} \; 2>/dev/null | wc -l | tr -d ' ')
    if [[ "$active_specs" -gt 0 ]]; then
        output+="Active specs with pending tasks: $active_specs. "
        output+="Use /execute-task --continue to resume. "
    fi
fi

# Check for session state files
if [[ -d "$PROJECT_DIR/.ai/session" ]]; then
    latest_state=$(find "$PROJECT_DIR/.ai/session" -maxdepth 1 -name "spec-*-state.json" -print0 2>/dev/null | xargs -0 ls -t 2>/dev/null | head -1)
    if [[ -n "$latest_state" ]]; then
        output+="Session state found: $(basename "$latest_state"). "
    fi
fi

if [[ -n "$output" ]]; then
    echo "$output"
fi

exit 0
