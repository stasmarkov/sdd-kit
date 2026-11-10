#!/bin/bash
#
# Laravel migration safety checker.
# Usage: bash check-migration.sh database/migrations/<file>.php
#
# Performs: --pretend, migrate, rollback, migrate, status. Reports each step
# pass/fail with summary.
#

set -euo pipefail

MIG_FILE="${1:-}"
if [[ -z "$MIG_FILE" ]] || [[ ! -f "$MIG_FILE" ]]; then
    echo "Usage: $0 database/migrations/<file>.php" >&2
    exit 1
fi

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$PWD}"
cd "$PROJECT_DIR"

if [[ ! -x "./artisan" ]] && ! command -v php >/dev/null 2>&1; then
    echo "artisan not found in $PROJECT_DIR" >&2
    exit 1
fi

run() {
    local label="$1"
    shift
    echo "── $label"
    if "$@" 2>&1 | tail -20; then
        echo "   ✓ $label"
    else
        echo "   ✗ $label" >&2
        exit 2
    fi
    echo
}

echo "Migration safety check: $MIG_FILE"
echo

run "pretend"      php artisan migrate --pretend
run "fresh apply"  php artisan migrate:fresh --force
run "rollback"     php artisan migrate:rollback --force --step=1
run "re-apply"     php artisan migrate --force
run "status"       php artisan migrate:status

# Reversibility heuristic: does down() reference Schema::drop or dropColumn?
if ! grep -qE 'public function down\(\).*Schema::' "$MIG_FILE" <(cat "$MIG_FILE") 2>/dev/null; then
    if ! grep -A50 'function down' "$MIG_FILE" | grep -qE 'Schema::|DB::statement|throw'; then
        echo "WARNING: down() appears empty or trivial. Verify reversibility intentionally." >&2
    fi
fi

# Type heuristics
if grep -qE '\->float\(' "$MIG_FILE"; then
    echo "WARNING: float() detected. Prefer decimal() or integer cents for money." >&2
fi
if grep -qE '\->string\([^)]*,\s*255' "$MIG_FILE"; then
    echo "INFO: default string(255) — confirm 255 is the intended max length." >&2
fi

echo "Migration safety check complete."
