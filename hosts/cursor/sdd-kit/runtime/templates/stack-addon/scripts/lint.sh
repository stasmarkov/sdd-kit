#!/bin/bash
#
# PostToolUse hook (Write|Edit matcher) - async lint check after edits to {{TITLE}} files.
#
# Receives JSON on stdin with tool_input.file_path.
# A gate runs only when its tool is present: a path command when the file is
# executable, a bare command when `command -v` finds it. Package runners are
# never started from a hook. Always exits 0 (async hooks cannot block).
#

set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [[ -z "$FILE_PATH" ]] || [[ ! -f "$FILE_PATH" ]]; then
    exit 0
fi

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
REL_PATH="${FILE_PATH#"$PROJECT_DIR"/}"

case "$REL_PATH" in
    {{PATH_CASES}}) ;;
    *) exit 0 ;;
esac

{{GATE_CHECKS}}

exit 0
