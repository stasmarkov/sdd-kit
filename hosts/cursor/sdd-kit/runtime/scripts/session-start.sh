#!/bin/bash
#
# SessionStart hook - Load framework context at session beginning
#
# Reads JSON from stdin with session info.
# Outputs context hints to stdout (displayed to Claude).
#

set -euo pipefail

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"

output=""

# Check for active specs
if [[ -d "$PROJECT_DIR/.ai/specs" ]]; then
    active_specs=$(find "$PROJECT_DIR/.ai/specs" -name "tasks.md" -exec grep -l '\- \[ \]' {} \; 2>/dev/null | wc -l | tr -d ' ')
    if [[ "$active_specs" -gt 0 ]]; then
        output+="Active specs with pending tasks: $active_specs. "
        output+="Use /execute-task --continue to resume. "
    fi
fi

# Check for session state files
if [[ -d "$PROJECT_DIR/.ai/session" ]]; then
    latest_state=$(find "$PROJECT_DIR/.ai/session" -maxdepth 1 -name "spec-*-state.json" -print0 2>/dev/null | xargs -0 ls -t 2>/dev/null | head -1)
    if [[ -n "$latest_state" ]]; then
        output+="Session state found: $(basename "$latest_state"). "
    fi
fi

# Stale session: the plugin cache on disk is newer than the version this session loaded
if [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]] && command -v jq >/dev/null 2>&1; then
    installed_file="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/plugins/installed_plugins.json"
    manifest="$CLAUDE_PLUGIN_ROOT/.claude-plugin/plugin.json"
    if [[ -f "$installed_file" && -f "$manifest" ]]; then
        loaded_version=$(jq -r '.version // empty' "$manifest" 2>/dev/null || true)
        # The installed record to compare is the one whose installPath sits beside CLAUDE_PLUGIN_ROOT
        # (<cache>/<marketplace>/<plugin>/<version>). A --plugin-dir checkout matches none and stays silent,
        # and so does a session that loaded a recorded install: another scope may pin a different version.
        root_parent=$(dirname "$CLAUDE_PLUGIN_ROOT")
        installed_version=$(jq -r --arg root "${CLAUDE_PLUGIN_ROOT%/}" --arg parent "$root_parent" '
            [(.plugins // {}) | to_entries[]
             | select(.key | startswith("sdd-kit@"))
             | .value[]?
             | select((.installPath // "") != "")
             | . + { path: (.installPath | sub("/+$"; "")) }] as $records
            | if any($records[]; .path == $root) then empty
              else [$records[]
                    | select((.path | split("/") | .[:-1] | join("/")) == $parent)
                    | (.resolvedVersion // .version // empty)][0] // empty
              end' "$installed_file" 2>/dev/null | head -1 || true)
        if [[ -n "$loaded_version" && -n "$installed_version" && "$loaded_version" != "$installed_version" ]]; then
            output+="SDD Kit $installed_version is installed; this session runs $loaded_version. Fix: restart Claude Code to load it."$'\n'
        fi
    fi
fi

if [[ -n "$output" ]]; then
    printf '%s\n' "$output"
fi

exit 0
