#!/bin/bash
#
# Stop hook - Candidate-lesson nudge
#
# Looks at the recent transcript for signs that something went wrong and
# should become a permanent guard: a user correction, a workflow verdict
# (FIX-FIRST, BLOCKED, NOT-RESOLVED) returned with its saved report, a
# deep-review verdict (CHANGES_REQUIRED, BLOCKED) printed with its review
# report, or a fix-bug Prevention item. Records each new candidate in
# .ai/session/lessons.jsonl (kept across compaction) and shows one line
# suggesting /learn. Never blocks, never edits project files.
#
# A verdict counts only when the same transcript entry also names its report,
# so skill and doc text that merely mention a verdict word never fire. The
# excerpt is "<verdict> <report path>", deduped per session per excerpt.
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

# A background task's result (a Workflow run) reaches the transcript as a "user"
# entry whose string content is a <task-notification> block.
NOTIFICATION_DEF='def notification: .origin.kind? == "task-notification"
    or ((.message.content | type) == "string" and (.message.content | test("^\\s*<task-notification>")));'

# Typed user text only (tool results and task notifications are also "user" entries; skip them).
USER_TEXT=$(jq -r "$NOTIFICATION_DEF"' select(.type == "user" and (notification | not)) | .message.content
    | if type == "string" then . else (map(select(.type == "text") | .text) | join(" ")) end' \
    <<<"$RECENT" 2>/dev/null)
OTHER_TEXT=$(jq -r 'select(.type != "user" or (.message.content | type) != "string")
    | [.. | strings] | join(" ")' <<<"$RECENT" 2>/dev/null)

# One line per transcript entry: the text of its tool results (and the
# structured toolUseResult) or of its task notification, and the text blocks
# of each assistant message.
TOOL_RESULTS=$(jq -rR "$NOTIFICATION_DEF"' fromjson? | select(.type == "user")
    | if (.message.content | type) == "array" then
        [.message.content[] | select(.type == "tool_result") | .content
          | if type == "string" then . elif type == "array" then (map(select(.type == "text") | .text) | join(" ")) else "" end]
        + [(.toolUseResult // empty) | if type == "string" then . else tojson end]
      elif notification and (.message.content | type) == "string" then [.message.content]
      else empty end
    | join(" ") | gsub("[\r\n]+"; " ") | select(length > 0)' <<<"$RECENT" 2>/dev/null)
ASSISTANT_TEXT=$(jq -rR 'fromjson? | select(.type == "assistant") | .message.content
    | if type == "string" then . else ([.[]? | select(.type == "text") | .text] | join(" ")) end
    | gsub("[\r\n]+"; " ") | select(length > 0)' <<<"$RECENT" 2>/dev/null)

WORKFLOW_VERDICT_RE='"recommendation"[[:space:]]*:[[:space:]]*"(FIX-FIRST|BLOCKED|NOT-RESOLVED)"'
WORKFLOW_REPORT_RE='"reportPath"[[:space:]]*:[[:space:]]*"([^"]*\.ai/reports/[^"]+\.md)"'
REVIEW_VERDICT_RE='(^|[^A-Za-z0-9_])(CHANGES_REQUIRED|BLOCKED)([^A-Za-z0-9_]|$)'
REVIEW_REPORT_RE='\.ai/reviews/REVIEW-[A-Za-z0-9][^ )`"]*\.md'

SIGNALS=()
EXCERPTS=()
add_candidate() {
    SIGNALS+=("$1")
    EXCERPTS+=("$2")
}

correction=$(grep -iE "^(no|nope|wrong)\b|that'?s (not|wrong)|you (forgot|missed|broke)|don'?t (do|use|add)|stop (doing|using)|i (told|asked) you" <<<"$USER_TEXT" | tail -1)
[[ -n "$correction" ]] && add_candidate "user correction" "${correction:0:200}"

while IFS= read -r entry; do
    [[ "$entry" =~ $WORKFLOW_VERDICT_RE ]] || continue
    verdict="${BASH_REMATCH[1]}"
    [[ "$entry" =~ $WORKFLOW_REPORT_RE ]] || continue
    add_candidate "workflow verdict $verdict" "$verdict ${BASH_REMATCH[1]}"
done <<<"$TOOL_RESULTS"

while IFS= read -r entry; do
    [[ "$entry" =~ $REVIEW_VERDICT_RE ]] || continue
    verdict="${BASH_REMATCH[2]}"
    [[ "$entry" =~ $REVIEW_REPORT_RE ]] || continue
    add_candidate "review verdict $verdict" "$verdict ${BASH_REMATCH[0]}"
done <<<"$ASSISTANT_TEXT"

grep -qE 'Run /learn with this Prevention item' <<<"$OTHER_TEXT" && add_candidate "fix-bug Prevention item" ""

[[ ${#SIGNALS[@]} -gt 0 ]] || exit 0

mkdir -p "$(dirname "$LESSONS")"
RECORDED=()
for i in "${!SIGNALS[@]}"; do
    signal="${SIGNALS[$i]}"
    excerpt="${EXCERPTS[$i]}"
    # Verdicts: one lesson per report per session. Other signals: one per signal per session.
    case "$signal" in
        "workflow verdict "*|"review verdict "*)
            filter='select(.session == $s and .excerpt == $e)' ;;
        *)
            filter='select(.session == $s and .signal == $g)' ;;
    esac
    if [[ -f "$LESSONS" ]] && jq -e --arg s "$SESSION" --arg g "$signal" --arg e "$excerpt" \
            "$filter" "$LESSONS" >/dev/null 2>&1; then
        continue
    fi
    jq -nc --arg s "$SESSION" --arg g "$signal" --arg e "$excerpt" \
        --arg t "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        '{at: $t, session: $s, signal: $g, excerpt: $e, status: "pending"}' >> "$LESSONS"
    RECORDED+=("$signal")
done

[[ ${#RECORDED[@]} -gt 0 ]] || exit 0

if [[ ${#RECORDED[@]} -eq 1 ]]; then
    label="Candidate lesson (${RECORDED[0]})."
else
    joined=$(printf '%s; ' "${RECORDED[@]}")
    label="${#RECORDED[@]} candidate lessons (${joined%; })."
fi
jq -n --arg msg "$label Run /learn to turn it into a test, rule, gotcha, or hook so it cannot happen again." \
    '{systemMessage: $msg}'
exit 0
