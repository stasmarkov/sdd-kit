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
# Mode (SDD_KIT_TEST_FIRST):
#   new     (default)  deny a Write that creates a guarded class and an edit of a guarded class in a
#                      module that already has tests/src; warn for any other guarded edit
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

HAS_TESTS=0
[[ -d "$MODULE/tests/src" ]] && HAS_TESTS=1

if [[ $HAS_TESTS -eq 1 ]]; then
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

if [[ "$MODE" == deny ]]; then
    case "$TF_MODE" in
        warn) MODE=warn ;;
        new)
            TOOL=$(echo "$INPUT" | jq -r '.tool_name // empty')
            CREATES=0
            [[ "$TOOL" != Edit && ! -e "$FILE" ]] && CREATES=1
            if [[ $CREATES -eq 0 && $HAS_TESTS -eq 0 ]]; then MODE=warn; fi
            ;;
    esac
fi

if [[ "$MODE" == warn ]]; then
    MSG="Test-first: $SUMMARY Consider a $KIND test ($TESTS/$FOLDER/${BASE}Test.php)."
    [[ -n "$NOTE" ]] && MSG="$MSG $NOTE"
    jq -nc --arg m "$MSG" '{systemMessage: $m}'
    exit 0
fi

REASON="Test-first guard: $SUMMARY $FIX"
[[ -n "$NOTE" ]] && REASON="$REASON $NOTE"
echo "$REASON" >&2
jq -nc --arg r "$REASON" --arg n "$NOTE" \
    '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: $r}} + (if $n == "" then {} else {systemMessage: $n} end)'
exit 2
