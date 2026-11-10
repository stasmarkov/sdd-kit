#!/bin/bash
#
# SessionStart hook - One-line hint to install a stack add-on
#
# Prints one line, once per project, when a first-party stack's markers (globs
# relative to the project root, matching files or directories) are present but
# neither that stack's add-on nor a preset including it is enabled or staged.
# Reads the generated workflows/lib/stacks.json next to the core; it holds no
# stack knowledge of its own.
#
# Opt-out: SDD_KIT_NO_STACK_HINT=1.
# Never blocks the session: any failure exits 0 silently.

set +e

[[ "${SDD_KIT_NO_STACK_HINT:-0}" == "1" ]] && exit 0
command -v jq >/dev/null 2>&1 || exit 0

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACKS_JSON="${CLAUDE_PLUGIN_ROOT:+$CLAUDE_PLUGIN_ROOT/workflows/lib/stacks.json}"
if [[ -z "$STACKS_JSON" || ! -f "$STACKS_JSON" ]]; then
    STACKS_JSON="$SCRIPT_DIR/../workflows/lib/stacks.json"
fi
[[ -f "$STACKS_JSON" ]] || exit 0

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
CONFIG_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
SHOWN_FILE="$CONFIG_DIR/sdd-kit/stack-hint-shown"

cd "$PROJECT_DIR" 2>/dev/null || exit 0

sha256_of_stdin() {
    if command -v shasum >/dev/null 2>&1; then
        shasum -a 256 | cut -d' ' -f1
    else
        sha256sum | cut -d' ' -f1
    fi
}

PROJECT_HASH=$(printf '%s' "$(pwd -P)" | sha256_of_stdin)
[[ -n "$PROJECT_HASH" ]] || exit 0
if [[ -f "$SHOWN_FILE" ]] && grep -qxF "$PROJECT_HASH" "$SHOWN_FILE"; then
    exit 0
fi

# Names of plugins set true in enabledPlugins, without the @marketplace suffix.
enabled_plugins() {
    local file
    for file in "$CONFIG_DIR/settings.json" ".claude/settings.json" ".claude/settings.local.json"; do
        [[ -f "$file" ]] || continue
        jq -r '(.enabledPlugins // {}) | to_entries[] | select(.value == true) | .key | split("@")[0]' "$file" 2>/dev/null
    done
}
ENABLED=$(enabled_plugins)

# Presets that depend on sdd-kit-<dir>, comma separated.
presets_for() {
    jq -r --arg p "sdd-kit-$1" '(.presets // {}) | to_entries | map(select(.value | index($p))) | map(.key) | join(", ")' "$STACKS_JSON"
}

# Preset names whose dependencies include sdd-kit-<dir>, one per line.
preset_names_for() {
    jq -r --arg p "sdd-kit-$1" '(.presets // {}) | to_entries[] | select(.value | index($p)) | .key' "$STACKS_JSON"
}

addon_present() {
    local dir="$1" name
    [[ -f ".claude/stacks/$dir.json" || -f "$CONFIG_DIR/stacks/$dir.json" ]] && return 0
    grep -qxF "sdd-kit-$dir" <<<"$ENABLED" && return 0
    while IFS= read -r name; do
        [[ -n "$name" ]] && grep -qxF "$name" <<<"$ENABLED" && return 0
    done < <(preset_names_for "$dir")
    return 1
}

# One "<dir>\t<key>\t<marker>" line per marker of each first-party stack.
# The marker glob is tested first, so jq runs only for a stack whose marker is present.
while IFS=$'\t' read -r dir key marker; do
    [[ -n "$marker" ]] || continue
    [[ -n "$(compgen -G "$marker" 2>/dev/null)" ]] || continue
    addon_present "$dir" && continue
    presets=$(presets_for "$dir")
    line="SDD Kit: this looks like a $key project. Install its stack add-on: /plugin install sdd-kit-$dir@sdd-kit"
    [[ -n "$presets" ]] && line+=" (or a preset that includes it: $presets)"
    echo "$line, or install.sh --stack=$dir."
    mkdir -p "$(dirname "$SHOWN_FILE")" 2>/dev/null
    printf '%s\n' "$PROJECT_HASH" >> "$SHOWN_FILE" 2>/dev/null
    exit 0
done < <(jq -r '. as $s | ($s.firstPartyFiles // {}) | to_entries[] | .key as $dir | .value[] as $key
    | ($s.entries[$key].markers // [])[] | [$dir, $key, .] | @tsv' "$STACKS_JSON" 2>/dev/null)

exit 0
