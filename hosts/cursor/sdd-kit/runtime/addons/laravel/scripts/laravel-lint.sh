#!/bin/bash
#
# PostToolUse hook (Write|Edit matcher) - Async lint check on changed PHP files (Laravel add-on)
#
# Receives JSON on stdin with tool_input.file_path.
# Runs as async hook - outputs systemMessage JSON for Claude context.
# Always exits 0 (async hooks cannot block).
#

set -euo pipefail

INPUT=$(cat)

# Extract file path from tool_input
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [[ -z "$FILE_PATH" ]] || [[ ! -f "$FILE_PATH" ]]; then
    exit 0
fi

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"

# PHP files: check with Pint if available
if [[ "$FILE_PATH" == *.php ]]; then
    if [[ -x "$PROJECT_DIR/vendor/bin/pint" ]]; then
        lint_output=$("$PROJECT_DIR/vendor/bin/pint" --test "$FILE_PATH" 2>&1) || true
        if [[ -n "$lint_output" ]] && echo "$lint_output" | grep -q "FAIL"; then
            echo "{\"systemMessage\": \"Lint: $FILE_PATH has code style issues. Run vendor/bin/pint to fix.\"}"
        fi
    fi
fi

exit 0
