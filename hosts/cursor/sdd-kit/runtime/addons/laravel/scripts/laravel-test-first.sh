#!/bin/bash
#
# PreToolUse hook (Write|Edit matcher) - Test-first enforcer (Laravel add-on)
#
# When Claude attempts to write/edit a "core" file (controller, model, service,
# middleware), require that a corresponding test exists. If not,
# block with a suggestion to create the test first.
#
# Mode (SDD_KIT_TEST_FIRST):
#   new     (default)  deny a Write that creates a guarded file without a test; warn for an edit
#                      of an existing guarded file, so code written before the hook stays editable
#   strict             deny every guarded edit that has no test
#   warn               never deny; warn instead
# An unknown value behaves as new and adds a note naming the valid values.
#
# Opt-out: set CLAUDE_SKIP_TEST_FIRST=1 in env.
#

set -euo pipefail

if [[ "${CLAUDE_SKIP_TEST_FIRST:-0}" == "1" ]]; then
    exit 0
fi

INPUT=$(cat)

NOTE=""
case "${SDD_KIT_TEST_FIRST:-new}" in
    strict|new|warn) TF_MODE="${SDD_KIT_TEST_FIRST:-new}" ;;
    *)
        TF_MODE=new
        NOTE="SDD_KIT_TEST_FIRST='${SDD_KIT_TEST_FIRST}' is not valid; using new. Valid values: strict, new, warn."
        ;;
esac

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
    local mode="$TF_MODE"
    if [[ "$mode" == new ]]; then
        local tool
        tool=$(echo "$INPUT" | jq -r '.tool_name // empty')
        # Only a new file is denied; an existing one predates the hook and only gets a warning.
        if [[ "$tool" == Edit || -e "$FILE" ]]; then mode=warn; fi
    fi
    if [[ "$mode" == warn ]]; then
        local msg="Test-first: '$source' has no corresponding test at '$expected_test'. Consider adding it."
        [[ -n "$NOTE" ]] && msg="$msg $NOTE"
        jq -nc --arg m "$msg" '{systemMessage: $m}'
        exit 0
    fi
    local reason="Test-first guard: '$source' has no corresponding test at '$expected_test'. Create or scaffold the test first, then retry the edit. Set CLAUDE_SKIP_TEST_FIRST=1 to bypass."
    [[ -n "$NOTE" ]] && reason="$reason $NOTE"
    jq -nc --arg r "$reason" \
        '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
    echo "$reason" >&2
    exit 2
}

# Succeeds when a file named $2 exists anywhere under tests/$1 (flat or nested).
test_exists() {
    [[ -n "$(find "$PROJECT_DIR/tests/$1" -name "$2" -print -quit 2>/dev/null || true)" ]]
}

# Laravel core file patterns
case "$REL" in
    app/Http/Controllers/*.php)
        BASE=$(basename "$REL" .php)
        if ! test_exists Feature "${BASE}Test.php"; then
            emit_block "$REL" "tests/Feature/${BASE}Test.php"
        fi
        ;;
    app/Models/*.php)
        # Models: require a Unit test
        BASE=$(basename "$REL" .php)
        if ! test_exists Unit "${BASE}Test.php" \
            && ! test_exists Feature "${BASE}Test.php"; then
            emit_block "$REL" "tests/Unit/${BASE}Test.php"
        fi
        ;;
    app/Services/*.php|app/Domain/*/Services/*.php)
        BASE=$(basename "$REL" .php)
        if ! test_exists Unit "${BASE}Test.php" \
            && ! test_exists Feature "${BASE}Test.php"; then
            emit_block "$REL" "tests/Unit/${BASE}Test.php"
        fi
        ;;
    app/Http/Middleware/*.php)
        BASE=$(basename "$REL" .php)
        if ! test_exists Feature/Middleware "${BASE}Test.php" \
            && ! test_exists Unit/Middleware "${BASE}Test.php"; then
            emit_block "$REL" "tests/Feature/Middleware/${BASE}Test.php"
        fi
        ;;
esac

exit 0
