#!/bin/bash
#
# Behaviour tests for the Next.js add-on hook scripts (nextjs-lint.sh, nextjs-test-first.sh).
# Run: bash src/plugins/nextjs/scripts/test/nextjs-hooks.test.sh

set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPTS="$(dirname "$HERE")"
FAILS=0
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

ok()   { printf '  ok   %s\n' "$1"; }
fail() { printf '  FAIL %s\n' "$1"; FAILS=$((FAILS + 1)); }

payload() { jq -nc --arg f "$1" '{tool_input: {file_path: $f}}'; }

P="$TMP/app"
mkdir -p "$P/src/components/ui" "$P/app/Http/Controllers"

echo "nextjs-test-first.sh"

touch "$P/src/components/ui/Button.tsx"
out=$(payload "$P/src/components/ui/Button.tsx" | CLAUDE_PROJECT_DIR="$P" "$SCRIPTS/nextjs-test-first.sh"); code=$?
[[ $code -eq 2 ]] && ok "component without test exits 2" || fail "component without test exits 2 (got $code)"
[[ "$out" == *"has no corresponding test at 'src/components/ui/Button.test.tsx'"* && "$out" == *'"permissionDecision":"deny"'* ]] \
    && ok "blocks with permissionDecision deny" || fail "blocks with permissionDecision deny: $out"

touch "$P/src/components/ui/Button.test.tsx"
payload "$P/src/components/ui/Button.tsx" | CLAUDE_PROJECT_DIR="$P" "$SCRIPTS/nextjs-test-first.sh" >/dev/null; code=$?
[[ $code -eq 0 ]] && ok "component with test passes" || fail "component with test passes (got $code)"

rm "$P/src/components/ui/Button.test.tsx"
mkdir -p "$P/src/components/ui/__tests__"; touch "$P/src/components/ui/__tests__/Button.test.tsx"
payload "$P/src/components/ui/Button.tsx" | CLAUDE_PROJECT_DIR="$P" "$SCRIPTS/nextjs-test-first.sh" >/dev/null; code=$?
[[ $code -eq 0 ]] && ok "__tests__ sibling counts" || fail "__tests__ sibling counts (got $code)"

payload "$P/src/components/ui/Button.test.tsx" | CLAUDE_PROJECT_DIR="$P" "$SCRIPTS/nextjs-test-first.sh" >/dev/null; code=$?
[[ $code -eq 0 ]] && ok "writes to tests pass" || fail "writes to tests pass (got $code)"

touch "$P/src/components/ui/Card.tsx"
payload "$P/src/components/ui/Card.tsx" | CLAUDE_SKIP_TEST_FIRST=1 CLAUDE_PROJECT_DIR="$P" "$SCRIPTS/nextjs-test-first.sh" >/dev/null; code=$?
[[ $code -eq 0 ]] && ok "CLAUDE_SKIP_TEST_FIRST=1 bypasses" || fail "CLAUDE_SKIP_TEST_FIRST=1 bypasses (got $code)"

touch "$P/app/Http/Controllers/FooController.php"
payload "$P/app/Http/Controllers/FooController.php" | CLAUDE_PROJECT_DIR="$P" "$SCRIPTS/nextjs-test-first.sh" >/dev/null; code=$?
[[ $code -eq 0 ]] && ok "a .php path exits 0" || fail "a .php path exits 0 (got $code)"

echo "nextjs-lint.sh"

touch "$P/src/a.ts" "$P/src/b.php"
out=$(payload "$P/src/a.ts" | CLAUDE_PROJECT_DIR="$P" "$SCRIPTS/nextjs-lint.sh"); code=$?
[[ $code -eq 0 && -z "$out" ]] && ok "no eslint installed is silent" || fail "no eslint installed is silent: $out"

mkdir -p "$P/node_modules/.bin"
printf '#!/bin/bash\necho "1 error found"\n' > "$P/node_modules/.bin/eslint"; chmod +x "$P/node_modules/.bin/eslint"
out=$(payload "$P/src/a.ts" | CLAUDE_PROJECT_DIR="$P" "$SCRIPTS/nextjs-lint.sh"); code=$?
[[ $code -eq 0 && "$out" == *"Lint: $P/src/a.ts has ESLint issues."* ]] \
    && ok "eslint error reports a systemMessage" || fail "eslint error reports a systemMessage: $out"

out=$(payload "$P/src/b.php" | CLAUDE_PROJECT_DIR="$P" "$SCRIPTS/nextjs-lint.sh"); code=$?
[[ $code -eq 0 && -z "$out" ]] && ok "a .php path exits 0 silently" || fail "a .php path exits 0 silently: $out"

if [[ $FAILS -gt 0 ]]; then
    printf '%d failure(s)\n' "$FAILS"
    exit 1
fi
echo "all passed"
