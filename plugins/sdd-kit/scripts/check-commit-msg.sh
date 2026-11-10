#!/bin/bash
#
# PreToolUse hook (Bash matcher) - Conventional Commits validator.
#
# When the tool input is a `git commit -m "..."` (or `--message=...`), verify
# the message follows Conventional Commits: type(scope?): subject
# Allowed types: feat, fix, docs, style, refactor, perf, test, build, ci,
#                chore, revert.
#
# Pass-through for non-commit Bash commands.
# Allows merge/revert auto-messages.
#

set -euo pipefail

INPUT=$(cat)

CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty')
if [[ -z "$CMD" ]]; then
    exit 0
fi

# Only inspect git commit invocations
if ! echo "$CMD" | grep -qE '(^|[[:space:]&|;])git[[:space:]]+commit\b'; then
    exit 0
fi

# Skip if --amend without -m (using $EDITOR) or interactive
if echo "$CMD" | grep -qE '(\-\-amend)([[:space:]]|$)' && ! echo "$CMD" | grep -qE '(\-m|--message)'; then
    exit 0
fi

# Skip merge commits
if echo "$CMD" | grep -qE '(^|[[:space:]])(merge|revert)[[:space:]]'; then
    exit 0
fi

# Extract the first -m / --message value after `git commit`. Later -m values are body paragraphs,
# and a quoted message may span lines; the subject is its first line.
MSG=""
BEST=0
AFTER=$CMD
COMMIT_RE='git[[:space:]]+commit(.*)'
if [[ $CMD =~ $COMMIT_RE ]]; then
    AFTER=${BASH_REMATCH[1]}
fi
DQ_RE='(^|[[:space:]])(-[a-zA-Z]*m|--message)(=|[[:space:]]+)"([^"]*)'
SQ_RE="(^|[[:space:]])(-[a-zA-Z]*m|--message)(=|[[:space:]]+)'([^']*)"
BARE_RE='(^|[[:space:]])(-[a-zA-Z]*m|--message)(=|[[:space:]]+)([^"'"'"'[:space:]][^[:space:]]*)'
for re in "$DQ_RE" "$SQ_RE" "$BARE_RE"; do
    if [[ $AFTER =~ $re ]]; then
        # The leftmost flag wins: keep the match that starts earliest in the command.
        PREFIX=${AFTER%%"${BASH_REMATCH[0]}"*}
        if [[ -z "$MSG" || ${#PREFIX} -lt $BEST ]]; then
            MSG=${BASH_REMATCH[4]}
            BEST=${#PREFIX}
        fi
    fi
done

# HEREDOC pattern: "$(cat <<'EOF' ... EOF )" — read first non-empty line after cat <<
if [[ -z "$MSG" ]] && echo "$CMD" | grep -qE 'cat[[:space:]]+<<'; then
    MSG=$(echo "$CMD" | awk '/cat[[:space:]]+<<.*EOF/{found=1; next} found && NF{print; exit}')
fi

if [[ -z "$MSG" ]]; then
    # Can't extract — let it pass; commit-msg git hook (if any) will catch.
    exit 0
fi

SUBJECT=$(printf '%s\n' "$MSG" | head -1)

# Conventional Commits regex
CC_RE='^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([a-z0-9_./-]+\))?!?:[[:space:]]+.+'

if ! echo "$SUBJECT" | grep -qE "$CC_RE"; then
    echo "Blocked: commit subject does not follow Conventional Commits." >&2
    echo "  Subject: $SUBJECT" >&2
    echo "  Required form: type(scope?): subject" >&2
    echo "  Types: feat | fix | docs | style | refactor | perf | test | build | ci | chore | revert" >&2
    echo "  Example: feat(auth): add OAuth2 callback handler" >&2
    exit 2
fi

# Subject length <= 72
LEN=${#SUBJECT}
if (( LEN > 72 )); then
    echo "Blocked: commit subject is $LEN chars (limit 72). Tighten or move detail to the body." >&2
    exit 2
fi

exit 0
