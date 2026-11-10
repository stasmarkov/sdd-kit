#!/bin/bash
#
# PreToolUse hook (Write|Edit matcher) - Test-first enforcer (Next.js add-on)
#
# When Claude attempts to write/edit a component, require that a corresponding
# test exists. If not, block with a suggestion to create the test first.
#
# Opt-out: set CLAUDE_SKIP_TEST_FIRST=1 in env.
#

set -euo pipefail

if [[ "${CLAUDE_SKIP_TEST_FIRST:-0}" == "1" ]]; then
    exit 0
fi

INPUT=$(cat)

FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
if [[ -z "$FILE" ]]; then
    exit 0
fi

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
REL="${FILE#"$PROJECT_DIR"/}"

# Skip writes to tests themselves and to non-core paths
case "$REL" in
    tests/*|*/tests/*|*/__tests__/*|*.test.*|*.spec.*) exit 0 ;;
esac

emit_block() {
    local source="$1"
    local expected_test="$2"
    jq -nc --arg r "Test-first guard: '$source' has no corresponding test at '$expected_test'. Create or scaffold the test first, then retry the edit. Set CLAUDE_SKIP_TEST_FIRST=1 to bypass." \
        '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
    exit 2
}

test_exists() {
    local pattern="$1"
    [[ -n "$(compgen -G "$PROJECT_DIR/$pattern" 2>/dev/null || true)" ]]
}

# Next.js components
case "$REL" in
    src/components/**/*.tsx|app/components/**/*.tsx|components/**/*.tsx)
        DIR=$(dirname "$REL")
        BASE=$(basename "$REL" .tsx)
        if ! test_exists "${DIR}/${BASE}.test.tsx" \
            && ! test_exists "${DIR}/__tests__/${BASE}.test.tsx" \
            && ! test_exists "tests/**/${BASE}.test.tsx"; then
            emit_block "$REL" "${DIR}/${BASE}.test.tsx"
        fi
        ;;
esac

exit 0
