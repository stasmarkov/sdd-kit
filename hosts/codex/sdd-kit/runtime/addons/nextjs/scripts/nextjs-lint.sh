#!/bin/bash
#
# PostToolUse hook (Write|Edit matcher) - Async lint check on changed JS/TS files (Next.js add-on)
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

# TypeScript/JavaScript files: check with ESLint if available
if [[ "$FILE_PATH" == *.ts ]] || [[ "$FILE_PATH" == *.tsx ]] || [[ "$FILE_PATH" == *.js ]] || [[ "$FILE_PATH" == *.jsx ]]; then
    if [[ -x "$PROJECT_DIR/node_modules/.bin/eslint" ]]; then
        lint_output=$("$PROJECT_DIR/node_modules/.bin/eslint" --no-error-on-unmatched-pattern "$FILE_PATH" 2>&1) || true
        if [[ -n "$lint_output" ]] && echo "$lint_output" | grep -qE "(error|warning)"; then
            echo "{\"systemMessage\": \"Lint: $FILE_PATH has ESLint issues.\"}"
        fi
    fi
fi

exit 0
