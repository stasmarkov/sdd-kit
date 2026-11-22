#!/bin/bash
#
# Merge the framework's lifecycle hooks into a Claude Code settings.json.
#
# Usage:
#   install-hooks.sh <settings.template.json> <settings.json> <project|user> [<addon hooks.json>...]
#
# - Add-on hooks.json files (plugin-mode format, "${CLAUDE_PLUGIN_ROOT}"/scripts/<name>.sh)
#   are merged after the template, with the script path swapped for the install's prefix.
# - Missing settings.json: created from the template.
# - Existing settings.json: backed up, then framework hooks are merged in.
#   Everything else (permissions, env, model, user-defined hooks) is preserved.
# - Re-running is idempotent: framework-owned hooks from a previous install are
#   replaced, not duplicated. Ownership = a command pointing at one of the
#   framework's script names under .claude/scripts/ (current or retired), or an
#   identical prompt hook. Retired hooks are removed, not re-added.
#
# In "user" mode, hook commands point at ~/.claude/scripts so they fire in every
# project; "project" mode keeps $CLAUDE_PROJECT_DIR/.claude/scripts.

set -euo pipefail

# Hook scripts removed from the framework; existing installs still reference them.
RETIRED_SCRIPTS='["kg-capture.sh", "lint-check.sh", "test-first-check.sh"]'
# Earlier wordings of framework prompt hooks, replaced rather than duplicated.
RETIRED_PROMPTS='["Before ending, verify: (1) All tasks marked as completed have passing tests, (2) No uncommitted changes are left without explanation, (3) Session state is saved if mid-spec. If this is a re-check after a previous stop attempt, allow stopping. Context: $ARGUMENTS", "Verify the subagent completed its assigned task. If it returned an error or incomplete results, flag the issue and determine if a retry is needed. Context: $ARGUMENTS"]'

TEMPLATE="${1:?template path required}"
SETTINGS="${2:?settings.json path required}"
MODE="${3:?mode required (project|user)}"
shift 3
ADDON_HOOKS=("$@")

if ! command -v jq >/dev/null 2>&1; then
    echo "install-hooks: jq is required (the hook scripts depend on it too)." >&2
    echo "  Install it (brew install jq / apt-get install jq) and re-run the installer." >&2
    exit 1
fi

if [[ ! -f "$TEMPLATE" ]]; then
    echo "install-hooks: template not found: $TEMPLATE" >&2
    exit 1
fi

case "$MODE" in
    project) prefix='"$CLAUDE_PROJECT_DIR"/.claude/scripts/' ;;
    user)    prefix='"$HOME"/.claude/scripts/' ;;
    *) echo "install-hooks: mode must be 'project' or 'user', got '$MODE'" >&2; exit 1 ;;
esac

for src in "${ADDON_HOOKS[@]+"${ADDON_HOOKS[@]}"}"; do
    if [[ ! -f "$src" ]]; then
        echo "install-hooks: add-on hooks not found: $src" >&2
        exit 1
    fi
done

# The template comes first and keeps its non-hook keys; each add-on's hook entries
# are appended per event, so the add-on order decides the order within an event.
framework=$(jq -s --arg prefix "$prefix" '
    def swap:
        walk(if type == "object" and has("command")
             then .command |= (sub("^\"\\$CLAUDE_PROJECT_DIR\"/\\.claude/scripts/"; $prefix)
                               | sub("^\"\\$\\{CLAUDE_PLUGIN_ROOT\\}\"/scripts/"; $prefix))
             else . end);
    map(swap) as $all
    | reduce $all[1:][] as $addon ($all[0];
        reduce (($addon.hooks // {}) | to_entries[]) as $e (.;
            .hooks[$e.key] = ((.hooks[$e.key] // []) + $e.value)))
' "$TEMPLATE" "${ADDON_HOOKS[@]+"${ADDON_HOOKS[@]}"}")

# Hooks of add-ons being removed (--prune): their scripts are retired like the
# framework's own, so the entries pointing at them are dropped, not re-added.
DROPPED=()
for src in ${SDD_KIT_DROPPED_HOOKS:-}; do
    [[ -f "$src" ]] && DROPPED+=("$src")
done
if (( ${#DROPPED[@]} > 0 )); then
    RETIRED_SCRIPTS=$(jq -s --argjson base "$RETIRED_SCRIPTS" '
        $base + [ .[].hooks[]?[].hooks[]? | select(.type == "command") | .command
                  | capture("scripts/(?<n>[A-Za-z0-9_.-]+\\.sh)").n ] | unique' "${DROPPED[@]}")
fi

mkdir -p "$(dirname "$SETTINGS")"

if [[ ! -f "$SETTINGS" ]]; then
    printf '%s\n' "$framework" > "$SETTINGS"
    echo "created"
    exit 0
fi

if ! jq empty "$SETTINGS" 2>/dev/null; then
    echo "install-hooks: $SETTINGS is not valid JSON; left untouched." >&2
    echo "  Fix the file, then re-run the installer to add hooks." >&2
    exit 1
fi

backup="$SETTINGS.backup.$(date +%Y%m%d_%H%M%S)"
cp "$SETTINGS" "$backup"

tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
jq --argjson fw "$framework" --argjson retired "$RETIRED_SCRIPTS" --argjson retiredPrompts "$RETIRED_PROMPTS" '
    def script_names:
        [ $fw.hooks[][].hooks[]
          | select(.type == "command")
          | .command
          | capture("scripts/(?<n>[A-Za-z0-9_.-]+\\.sh)").n ] + $retired | unique;
    def prompts:
        [ $fw.hooks[][].hooks[] | select(.type == "prompt") | .prompt ] + $retiredPrompts;
    def owned($names; $prompts):
        (.type == "command" and ((.command // "") as $c
            | any($names[]; . as $n | $c | contains(".claude/scripts/" + $n))))
        or (.type == "prompt" and (.prompt as $p | any($prompts[]; . == $p)));

    script_names as $names
    | prompts as $prompts
    | .hooks = ((.hooks // {})
        | map_values(map(.hooks |= map(select(owned($names; $prompts) | not)))
                     | map(select(.hooks | length > 0)))
        | with_entries(select(.value | length > 0)))
    | reduce ($fw.hooks | to_entries[]) as $e (.;
        .hooks[$e.key] = ((.hooks[$e.key] // []) + $e.value))
' "$SETTINGS" > "$tmp"

# Write through rather than mv: keeps permissions and any dotfiles symlink.
cat "$tmp" > "$SETTINGS"
echo "merged (backup: $backup)"
