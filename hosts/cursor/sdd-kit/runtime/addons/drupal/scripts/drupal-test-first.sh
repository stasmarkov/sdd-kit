#!/bin/bash
#
# PreToolUse hook (Write|Edit matcher) - Test-first enforcer (Drupal add-on)
#
# Guards PHP classes of custom modules (<...>/modules/custom/<...>/src/<Dir>/...):
#   Controller, Form, Service, Services, Access, EventSubscriber  blocked until a test exists
#   Plugin/**, Entity                                             warned only
# Classes directly under src/, .module/.install files, YAML and Twig are not guarded.
#
# A test counts when the module's tests/src holds <Class>Test.php at any depth, or any
# *Test.php there that names the class, so tests named after behaviour also count.
#
# On a block the reason goes to stderr (the only stream Claude Code and the Codex and
# Cursor dispatcher read on exit 2); the deny JSON is also printed on stdout.
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

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
[[ "$FILE" == /* ]] || FILE="$PROJECT_DIR/$FILE"

case "$FILE" in
    */modules/custom/*/src/*.php) ;;
    *) exit 0 ;;
esac
case "${FILE##*/modules/custom/}" in
    */tests/*|*Test.php) exit 0 ;;
esac

# The module root is the path before the last /src/ segment, and must hold the module's .info.yml.
MODULE="${FILE%/src/*}"
INNER="${FILE#"$MODULE"/src/}"
[[ "$MODULE" == */modules/custom/?* ]] || exit 0
[[ -n "$(find "$MODULE" -maxdepth 1 -name '*.info.yml' -print -quit 2>/dev/null)" ]] || exit 0

BASE=$(basename "$FILE" .php)
REL="${FILE#"$PROJECT_DIR"/}"
TESTS="${MODULE#"$PROJECT_DIR"/}/tests/src"

case "$INNER" in
    Controller/*|Form/*|Access/*) MODE=deny; KIND=Functional ;;
    EventSubscriber/*)            MODE=deny; KIND=Kernel ;;
    Service/*|Services/*)         MODE=deny; KIND="Unit or Kernel" ;;
    Plugin/*|Entity/*)            MODE=warn; KIND=Kernel ;;
    *) exit 0 ;;
esac

if [[ -d "$MODULE/tests/src" ]]; then
    if [[ -n "$(find "$MODULE/tests/src" -name "${BASE}Test.php" -print -quit 2>/dev/null)" ]]; then
        exit 0
    fi
    if [[ -n "$(grep -rlwF --include='*Test.php' -- "$BASE" "$MODULE/tests/src" 2>/dev/null | head -1)" ]]; then
        exit 0
    fi
fi

FOLDER="${KIND%% *}"
SUMMARY="'$REL' has no test under '$TESTS' named ${BASE}Test.php or naming $BASE."
FIX="Fix: add a $KIND test first (for example $TESTS/$FOLDER/${BASE}Test.php), then retry the edit. Set CLAUDE_SKIP_TEST_FIRST=1 to bypass."

if [[ "$MODE" == warn ]]; then
    jq -nc --arg m "Test-first: $SUMMARY Consider a $KIND test ($TESTS/$FOLDER/${BASE}Test.php)." '{systemMessage: $m}'
    exit 0
fi

REASON="Test-first guard: $SUMMARY $FIX"
echo "$REASON" >&2
jq -nc --arg r "$REASON" \
    '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}}'
exit 2
