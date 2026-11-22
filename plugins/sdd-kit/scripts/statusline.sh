#!/usr/bin/env bash
# Claude Code status line: active spec and task progress, plus the model.
#
#   spec-PROJ-123 · task 3/7 · Opus
#
# Reads the status-line JSON from stdin (uses .workspace.project_dir,
# .workspace.current_dir, .cwd, .model.display_name when present) and the newest
# .ai/session/spec-*-state.json written by /execute-task. Must stay fast and
# silent: any failure prints nothing and exits 0.

input=$(cat 2>/dev/null) || input=""

command -v jq >/dev/null 2>&1 || exit 0

# Non-empty stdin that is not valid JSON means the host sent something unexpected: stay silent.
if [[ -n "${input//[[:space:]]/}" ]] && ! printf '%s' "$input" | jq -e . >/dev/null 2>&1; then
  exit 0
fi

field() {
  printf '%s' "$input" | jq -r "$1 // empty" 2>/dev/null
}

project_dir=$(field '.workspace.project_dir')
[[ -n "$project_dir" ]] || project_dir=$(field '.workspace.current_dir')
[[ -n "$project_dir" ]] || project_dir=$(field '.cwd')
[[ -n "$project_dir" ]] || project_dir="${CLAUDE_PROJECT_DIR:-$PWD}"
model=$(field '.model.display_name')

parts=()

session_dir="${project_dir}/.ai/session"
if [[ -d "$session_dir" ]]; then
  # shellcheck disable=SC2012  # file names are generated (spec-<id>-state.json), no odd characters
  state_file=$(ls -t "$session_dir"/spec-*-state.json 2>/dev/null | head -n 1)
  if [[ -n "$state_file" && -r "$state_file" ]]; then
    spec_line=$(jq -r '
      def num: if type == "number" then . elif type == "string" then (tonumber? // null) else null end;
      [
        (.spec_id // "" | tostring),
        ((.current_task | num) // ""),
        ((.total_tasks | num) // ""),
        ((.completed_tasks // []) | if type == "array" then length else 0 end)
      ] | map(tostring) | join("|")' "$state_file" 2>/dev/null)

    if [[ -n "$spec_line" ]]; then
      IFS='|' read -r spec_id current total done_count <<<"$spec_line"
      if [[ -z "$spec_id" ]]; then
        spec_id=$(basename "$state_file")
        spec_id=${spec_id#spec-}
        spec_id=${spec_id%-state.json}
      fi
      if [[ -n "$spec_id" ]]; then
        [[ "$spec_id" == spec-* ]] || spec_id="spec-${spec_id}"
        parts+=("$spec_id")
        if [[ -n "$total" ]]; then
          if [[ -n "$current" ]]; then
            parts+=("task ${current}/${total}")
          else
            parts+=("${done_count}/${total} done")
          fi
        fi
      fi
    fi
  fi
fi

# No session state: fall back to the in-progress spec whose tasks.md changed last.
if [[ ${#parts[@]} -eq 0 && -d "${project_dir}/.ai/specs" ]]; then
  best=""
  lites=()
  for lite in "${project_dir}"/.ai/specs/*/spec-lite.md; do
    [[ -f "$lite" ]] && lites+=("$lite")
  done
  # One awk over every spec-lite.md prints the in-progress ones. Frontmatter only; tolerate quotes
  # and the template's trailing "# draft | ..." comment.
  in_progress=""
  if [[ ${#lites[@]} -gt 0 ]]; then
    in_progress=$(awk 'FILENAME != cur {cur = FILENAME; infm = ($0 == "---"); stop = 0; next}
      stop || !infm {next}
      $0 == "---" {stop = 1; next}
      /^status:/ {s = $0; sub(/^status:[ \t]*/, "", s); sub(/[ \t]*#.*$/, "", s); gsub(/["\x27 \t]/, "", s); if (s == "in-progress") print FILENAME; stop = 1}' "${lites[@]}" 2>/dev/null)
  fi
  while IFS= read -r lite; do
    [[ -n "$lite" ]] || continue
    tasks="${lite%/spec-lite.md}/tasks.md"
    [[ -f "$tasks" ]] || continue
    if [[ -z "$best" || "$tasks" -nt "$best" ]]; then
      best="$tasks"
    fi
  done <<<"$in_progress"
  if [[ -n "$best" ]]; then
    counts=$(awk '/^- \[[ xX]\] [0-9]+\./ {t++} /^- \[[xX]\] [0-9]+\./ {d++} END {printf "%d %d", t, d}' "$best" 2>/dev/null)
    read -r total done_count <<<"$counts"
    if [[ "${total:-0}" -gt 0 ]]; then
      spec_dir=${best%/tasks.md}
      parts+=("${spec_dir##*/}" "${done_count:-0}/${total} done")
    fi
  fi
fi

[[ -n "$model" ]] && parts+=("$model")

if [[ ${#parts[@]} -gt 0 ]]; then
  out="${parts[0]}"
  for part in "${parts[@]:1}"; do
    out+=" · ${part}"
  done
  printf '%s\n' "$out"
fi

exit 0
