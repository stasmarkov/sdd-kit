#!/bin/bash
#
# Stop hook - Candidate-lesson nudge
#
# Looks at the recent transcript for signs that something went wrong and
# should become a permanent guard: a user correction, a CHANGES_REQUIRED or
# BLOCKED review verdict, a NOT-RESOLVED fix, or a fix-bug Prevention item.
# Records each new candidate in .ai/session/lessons.jsonl (kept across
# compaction) and shows one line suggesting /learn. Never blocks, never edits
# project files.
#

set -uo pipefail

INPUT=$(cat)
[[ "$(jq -r '.stop_hook_active // false' <<<"$INPUT" 2>/dev/null)" == "true" ]] && exit 0

TRANSCRIPT=$(jq -r '.transcript_path // empty' <<<"$INPUT" 2>/dev/null)
SESSION=$(jq -r '.session_id // "unknown"' <<<"$INPUT" 2>/dev/null)
[[ -n "$TRANSCRIPT" && -f "$TRANSCRIPT" ]] || exit 0

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
LESSONS="$PROJECT_DIR/.ai/session/lessons.jsonl"
RECENT=$(tail -n 200 "$TRANSCRIPT")

# Typed user text only (tool results are also "user" entries; skip them).
USER_TEXT=$(jq -r 'select(.type == "user") | .message.content
    | if type == "string" then . else (map(select(.type == "text") | .text) | join(" ")) end' \
    <<<"$RECENT" 2>/dev/null)
OTHER_TEXT=$(jq -r 'select(.type != "user" or (.message.content | type) != "string")
    | [.. | strings] | join(" ")' <<<"$RECENT" 2>/dev/null)

SIGNAL=""
EXCERPT=""
correction=$(grep -iE "^(no|nope|wrong)\b|that'?s (not|wrong)|you (forgot|missed|broke)|don'?t (do|use|add)|stop (doing|using)|i (told|asked) you" <<<"$USER_TEXT" | tail -1)
if [[ -n "$correction" ]]; then
    SIGNAL="user correction"; EXCERPT="$correction"
elif grep -qE '\b(CHANGES_REQUIRED|BLOCKED)\b' <<<"$OTHER_TEXT"; then
    SIGNAL="review verdict CHANGES_REQUIRED/BLOCKED"
elif grep -qE '\bNOT-RESOLVED\b' <<<"$OTHER_TEXT"; then
    SIGNAL="fix not resolved"
elif grep -qE 'Run /learn with this Prevention item' <<<"$OTHER_TEXT"; then
    SIGNAL="fix-bug Prevention item"
fi
[[ -n "$SIGNAL" ]] || exit 0

mkdir -p "$(dirname "$LESSONS")"
# One nudge per signal per session.
if [[ -f "$LESSONS" ]] && jq -e --arg s "$SESSION" --arg g "$SIGNAL" \
        'select(.session == $s and .signal == $g)' "$LESSONS" >/dev/null 2>&1; then
    exit 0
fi

jq -nc --arg s "$SESSION" --arg g "$SIGNAL" --arg e "${EXCERPT:0:200}" \
    --arg t "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{at: $t, session: $s, signal: $g, excerpt: $e, status: "pending"}' >> "$LESSONS"

jq -n --arg msg "Candidate lesson ($SIGNAL). Run /learn to turn it into a test, rule, gotcha, or hook so it cannot happen again." \
    '{systemMessage: $msg}'
exit 0
