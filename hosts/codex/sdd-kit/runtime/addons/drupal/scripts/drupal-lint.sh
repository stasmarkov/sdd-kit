#!/bin/bash
#
# PostToolUse hook (Write|Edit matcher) - Async PHPCS check on custom Drupal code (Drupal add-on)
#
# Checks php, module, inc, install, theme and profile files under */modules/custom/ or
# */themes/custom/ with the same standard as the PHPCS gates: the project ruleset
# (phpcs.xml and its variants) when present, otherwise Drupal,DrupalPractice when
# drupal/coder and its CodeSniffer.conf are installed, otherwise nothing.
#
# Runner, as the gates choose it: `ddev exec --dir /var/www/html/<repo dir>` when a
# .ddev/config.yaml sits in the repo or a directory above it and `ddev describe -j`
# reports raw.status "running"; otherwise host php; otherwise nothing. It never
# starts DDEV.
#
# Both searches stop at the project boundary: CLAUDE_PROJECT_DIR when the file is
# inside it, else the file's git top level, else the hook does nothing. A phpcs or a
# DDEV project in a folder above the boundary belongs to someone else and never runs.
#
# Reports only counts read from the JSON report, so a missing standard, a setup
# error or any ddev failure stays silent instead of reading as style violations.
# Always exits 0 (async hooks cannot block).
#

set -uo pipefail

INPUT=$(cat)

FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
if [[ -z "$FILE" ]]; then
    exit 0
fi
[[ "$FILE" == /* ]] || FILE="${CLAUDE_PROJECT_DIR:-$PWD}/$FILE"
[[ -f "$FILE" ]] || exit 0

case "$FILE" in
    */modules/custom/*|*/themes/custom/*) ;;
    *) exit 0 ;;
esac
case "$FILE" in
    *.php|*.module|*.inc|*.install|*.theme|*.profile) ;;
    *) exit 0 ;;
esac

# Physical paths, so the boundary test cannot be dodged through .. or a symlink.
FILE_DIR=$(cd -P "$(dirname "$FILE")" 2>/dev/null && pwd) || exit 0
FILE="$FILE_DIR/$(basename "$FILE")"
BOUNDARY=""
if [[ -n "${CLAUDE_PROJECT_DIR:-}" ]]; then
    PROJECT=$(cd -P "$CLAUDE_PROJECT_DIR" 2>/dev/null && pwd)
    if [[ -n "$PROJECT" && ( "$PROJECT" == / || "$FILE" == "$PROJECT"/* ) ]]; then
        BOUNDARY="$PROJECT"
    fi
fi
if [[ -z "$BOUNDARY" ]] && command -v git >/dev/null 2>&1; then
    BOUNDARY=$(git -C "$FILE_DIR" rev-parse --show-toplevel 2>/dev/null)
    [[ -n "$BOUNDARY" ]] && BOUNDARY=$(cd -P "$BOUNDARY" 2>/dev/null && pwd)
fi
[[ -n "$BOUNDARY" ]] || exit 0

# The repo root is the nearest directory above the file, up to the boundary, that has vendor/bin/phpcs.
ROOT="$FILE_DIR"
until [[ -e "$ROOT/vendor/bin/phpcs" ]]; do
    [[ "$ROOT" == "$BOUNDARY" || "$ROOT" == / ]] && exit 0
    ROOT=$(dirname "$ROOT")
done
REL="${FILE#"$ROOT"/}"

STANDARD=()
if [[ -f "$ROOT/phpcs.xml" || -f "$ROOT/phpcs.xml.dist" || -f "$ROOT/.phpcs.xml" || -f "$ROOT/.phpcs.xml.dist" ]]; then
    :
elif [[ -d "$ROOT/vendor/drupal/coder" && -f "$ROOT/vendor/squizlabs/php_codesniffer/CodeSniffer.conf" ]]; then
    STANDARD=(--standard=Drupal,DrupalPractice --extensions=php,module,inc,install,test,profile,theme)
else
    exit 0
fi

# The DDEV project root is the repo or the nearest directory above it, up to the boundary, with .ddev/config.yaml.
RUNNER=()
DDEV_ROOT="$ROOT"
until [[ -f "$DDEV_ROOT/.ddev/config.yaml" || "$DDEV_ROOT" == "$BOUNDARY" || "$DDEV_ROOT" == / ]]; do
    DDEV_ROOT=$(dirname "$DDEV_ROOT")
done
if [[ -f "$DDEV_ROOT/.ddev/config.yaml" ]] && command -v ddev >/dev/null 2>&1; then
    status=$(cd "$ROOT" && ddev describe -j 2>/dev/null | jq -r '.raw.status // empty' 2>/dev/null)
    if [[ "$status" == running ]]; then
        RUNNER=(ddev exec --dir "/var/www/html${ROOT#"$DDEV_ROOT"}")
    fi
fi
if [[ ${#RUNNER[@]} -eq 0 ]]; then
    command -v php >/dev/null 2>&1 || exit 0
    [[ -x "$ROOT/vendor/bin/phpcs" ]] || exit 0
fi

OUTPUT=$(cd "$ROOT" && ${RUNNER[@]+"${RUNNER[@]}"} ./vendor/bin/phpcs --report=json ${STANDARD[@]+"${STANDARD[@]}"} "$REL" 2>/dev/null)

# Internal.* messages are phpcs processing problems, not findings in the file.
COUNTS=$(jq -r 'select(type == "object" and has("totals"))
    | [.files[]?.messages[]? | select((.source // "") | startswith("Internal.") | not) | .type]
    | "\(map(select(. == "ERROR")) | length) \(map(select(. == "WARNING")) | length)"' <<<"$OUTPUT" 2>/dev/null) || exit 0
read -r ERRORS WARNINGS <<<"$COUNTS"
[[ "${ERRORS:-}" =~ ^[0-9]+$ && "${WARNINGS:-}" =~ ^[0-9]+$ ]] || exit 0
(( ERRORS + WARNINGS > 0 )) || exit 0

PREFIX="${RUNNER[*]+"${RUNNER[*]} "}"
FIX="(cd $ROOT && ${PREFIX}./vendor/bin/phpcbf ${STANDARD[*]+"${STANDARD[*]} "}$REL)"
jq -nc --arg m "PHPCS: $FILE has $ERRORS error(s) and $WARNINGS warning(s). Fix: run $FIX for the fixable ones, then fix the rest by hand." \
    '{systemMessage: $m}'
exit 0
