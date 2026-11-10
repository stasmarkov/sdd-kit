#!/bin/bash
#
# PostToolUse hook (Write|Edit matcher) - Gate-weakening guard
#
# Warns, never blocks, when an edit silences a quality gate instead of fixing
# the cause: type/lint suppressions, skipped or focused tests, static-analysis
# baselines, or coverage-threshold edits. The warning reaches Claude as
# additional context so it reverts the suppression or asks the user first.
#

set -uo pipefail

INPUT=$(cat)
FILE=$(jq -r '.tool_input.file_path // empty' <<<"$INPUT" 2>/dev/null)
[[ -n "$FILE" ]] || exit 0

case "$FILE" in
    */node_modules/*|*/vendor/*|*.lock|*.md) exit 0 ;;
esac

# Only text this edit introduced: Write content, Edit new_string, MultiEdit edits.
ADDED=$(jq -r '[.tool_input.content, .tool_input.new_string, (.tool_input.edits // [] | .[].new_string)]
               | map(select(. != null)) | join("\n")' <<<"$INPUT" 2>/dev/null)

FINDINGS=()
add() { FINDINGS+=("$1"); }

case "$(basename "$FILE")" in
    phpstan-baseline.neon|phpstan-baseline.php|psalm-baseline.xml)
        add "static-analysis baseline edited ($(basename "$FILE"))" ;;
esac

if [[ -n "$ADDED" ]]; then
    grep -qE '@ts-(ignore|nocheck)' <<<"$ADDED" && add "@ts-ignore / @ts-nocheck"
    grep -qE '@ts-expect-error' <<<"$ADDED" && add "@ts-expect-error"
    grep -qE 'eslint-disable' <<<"$ADDED" && add "eslint-disable"
    grep -qE '@phpstan-ignore|@psalm-suppress' <<<"$ADDED" && add "@phpstan-ignore / @psalm-suppress"
    grep -qE '(->|\.)skip\(|markTestSkipped|markTestIncomplete|(it|test|describe)\.skip\b|\bx(it|describe)\(' <<<"$ADDED" && add "skipped test"
    grep -qE '(it|test|describe)\.only\b|->only\(\)' <<<"$ADDED" && add "focused test (.only)"
    case "$(basename "$FILE")" in
        phpunit.xml*|vitest.config.*|vite.config.*|jest.config.*|playwright.config.*|.nycrc*|codecov.yml)
            grep -qiE 'threshold|coverage|min(imum)?[_-]?(lines|branches|functions|statements)?' <<<"$ADDED" \
                && add "coverage or threshold setting changed" ;;
    esac
fi

[[ ${#FINDINGS[@]} -gt 0 ]] || exit 0

SUMMARY=$(IFS='; '; echo "${FINDINGS[*]}")
MESSAGE="Gate-weakening change in $FILE: $SUMMARY. The kit's verification-gates and fix-ci rules forbid silencing a gate without the user's consent: fix the underlying problem and revert the suppression, or ask the user to approve it explicitly and say why."

jq -n --arg msg "$MESSAGE" '{hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: $msg}}'
exit 0
