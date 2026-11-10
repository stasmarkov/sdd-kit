#!/bin/bash
# Notification hook: desktop notification with Claude Code's message.
# Claude Code sends the event as JSON on stdin ({"message": ..., "title": ...});
# positional arguments remain as a fallback for manual use.

INPUT=""
[[ -t 0 ]] || INPUT=$(cat)
MSG=$(jq -r '.message // empty' <<<"$INPUT" 2>/dev/null)
TITLE=$(jq -r '.title // empty' <<<"$INPUT" 2>/dev/null)
MSG="${MSG:-${1:-Claude Code needs your attention}}"
TITLE="${TITLE:-${2:-Claude Code}}"

case "$(uname -s)" in
  Darwin)
    # Pass text as arguments so quotes in the message can't break the AppleScript.
    osascript -e 'on run argv' -e 'display notification (item 1 of argv) with title (item 2 of argv)' -e 'end run' \
      "$MSG" "$TITLE" 2>/dev/null
    ;;
  Linux)
    if command -v notify-send &>/dev/null; then
      notify-send "$TITLE" "$MSG" 2>/dev/null
    fi
    ;;
  MINGW*|MSYS*|CYGWIN*)
    MSG="${MSG//\'/\'\'}"; TITLE="${TITLE//\'/\'\'}"
    powershell.exe -Command "[System.Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms'); [System.Windows.Forms.MessageBox]::Show('$MSG', '$TITLE')" 2>/dev/null
    ;;
esac

exit 0
