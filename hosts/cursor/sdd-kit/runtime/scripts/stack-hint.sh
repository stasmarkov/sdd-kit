#!/bin/bash
#
# SessionStart hook - One-line hint to install a stack add-on
#
# Prints one line, once per project, when a first-party stack's markers (globs
# relative to the project root, matching files or directories) are present but
# neither that stack's add-on nor a preset including it is enabled or staged.
# When no marker matches at the root, each subdirectory one level down (vendor,
# node_modules and dot directories skipped) is tested for the markers and for
# the stack's manifest packages, so a site kept in site/ is found.
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

# Prints the hint for add-on <dir> and stack <key>, records the project and exits.
hint() {
    local presets line
    presets=$(presets_for "$1")
    line="SDD Kit: this looks like a $2 project. Install its stack add-on: /plugin install sdd-kit-$1@sdd-kit"
    [[ -n "$presets" ]] && line+=" (or a preset that includes it: $presets)"
    echo "$line, or install.sh --stack=$1."
    mkdir -p "$(dirname "$SHOWN_FILE")" 2>/dev/null
    printf '%s\n' "$PROJECT_HASH" >> "$SHOWN_FILE" 2>/dev/null
    exit 0
}

# True when project file $1 declares package $2 in one of the dependency objects named by $3..
declares() {
    local file="$1" package="$2"; shift 2
    [[ -f "$file" ]] || return 1
    jq -e --arg p "$package" 'objects | [.[$ARGS.positional[]] | objects | keys[]] | index($p) != null' \
        --args "$@" <"$file" >/dev/null 2>&1
}

# One "<dir>\t<key>\t<marker>" line per marker of each first-party stack.
# The marker glob is tested first, so jq runs only for a stack whose marker is present.
ROOT_MATCH=false
while IFS=$'\t' read -r dir key marker; do
    [[ -n "$marker" ]] || continue
    [[ -n "$(compgen -G "$marker" 2>/dev/null)" ]] || continue
    ROOT_MATCH=true
    addon_present "$dir" && continue
    hint "$dir" "$key"
done < <(jq -r '. as $s | ($s.firstPartyFiles // {}) | to_entries[] | .key as $dir | .value[] as $key
    | ($s.entries[$key].markers // [])[] | [$dir, $key, .] | @tsv' "$STACKS_JSON" 2>/dev/null)
$ROOT_MATCH && exit 0

SUBDIRS=()
for sub in */; do
    [[ -d "$sub" ]] || continue
    case "$sub" in vendor/ | node_modules/) continue ;; esac
    SUBDIRS+=("$sub")
done
[[ ${#SUBDIRS[@]} -gt 0 ]] || exit 0

# One "<dir>\t<key>\t<file>\t<value>\t<objects>" line per marker (file and objects "-") and per manifest package of
# each first-party stack, tested in every subdirectory. <file> and the space-separated dependency
# <objects> come from the packageFiles table of stacks.json.
while IFS=$'\t' read -r dir key file value objects; do
    [[ -n "$value" ]] || continue
    for sub in "${SUBDIRS[@]}"; do
        if [[ "$file" == "-" ]]; then
            [[ -n "$(compgen -G "$sub$value" 2>/dev/null)" ]] || continue
        else
            # shellcheck disable=SC2086
            declares "$sub$file" "$value" $objects || continue
        fi
        addon_present "$dir" && continue 2
        hint "$dir" "$key"
    done
done < <(jq -r '. as $s | ($s.firstPartyFiles // {}) | to_entries[] | .key as $dir | .value[] as $key
    | ($s.entries[$key]) as $e
    | (($e.markers // [])[] | [$dir, $key, "-", ., "-"]),
      (($e.packages // {}) | to_entries[] | ($s.packageFiles[.key] // empty) as $f | .value[]
        | [$dir, $key, $f.file, ., ($f.keys | join(" "))])
    | @tsv' "$STACKS_JSON" 2>/dev/null)

exit 0
