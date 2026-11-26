#!/bin/bash
#
# Behaviour tests for the Laravel add-on hook scripts (laravel-lint.sh, laravel-test-first.sh).
# Run: bash src/plugins/laravel/scripts/test/laravel-hooks.test.sh

set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPTS="$(dirname "$HERE")"
FAILS=0
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

ok()   { printf '  ok   %s\n' "$1"; }
fail() { printf '  FAIL %s\n' "$1"; FAILS=$((FAILS + 1)); }

payload() { jq -nc --arg f "$1" '{tool_input: {file_path: $f}}'; }

project() {
    local p="$TMP/$1"
    mkdir -p "$p/app/Http/Controllers" "$p/app/Models" "$p/app/Services" "$p/app/Http/Middleware" "$p/tests/Feature" "$p/tests/Unit"
    printf '%s' "$p"
}

echo "laravel-test-first.sh"

P=$(project blocked)
touch "$P/app/Http/Controllers/FooController.php"
out=$(payload "$P/app/Http/Controllers/FooController.php" | SDD_KIT_TEST_FIRST=strict CLAUDE_PROJECT_DIR="$P" "$SCRIPTS/laravel-test-first.sh"); code=$?
[[ $code -eq 2 ]] && ok "controller without test exits 2" || fail "controller without test exits 2 (got $code)"
[[ "$out" == *"has no corresponding test at 'tests/Feature/FooControllerTest.php'"* && "$out" == *'"permissionDecision":"deny"'* && "$out" == *"CLAUDE_SKIP_TEST_FIRST=1 to bypass"* ]] \
    && ok "blocks with permissionDecision deny" || fail "blocks with permissionDecision deny: $out"

touch "$P/tests/Feature/FooControllerTest.php"
payload "$P/app/Http/Controllers/FooController.php" | CLAUDE_PROJECT_DIR="$P" "$SCRIPTS/laravel-test-first.sh" >/dev/null; code=$?
[[ $code -eq 0 ]] && ok "controller with test passes" || fail "controller with test passes (got $code)"

payload "$P/app/Models/User.php" | CLAUDE_PROJECT_DIR="$P" "$SCRIPTS/laravel-test-first.sh" >/dev/null; code=$?
[[ $code -eq 2 ]] && ok "model without unit test exits 2" || fail "model without unit test exits 2 (got $code)"

payload "$P/app/Services/PayService.php" | CLAUDE_PROJECT_DIR="$P" "$SCRIPTS/laravel-test-first.sh" >/dev/null; code=$?
[[ $code -eq 2 ]] && ok "service without test exits 2" || fail "service without test exits 2 (got $code)"

payload "$P/app/Http/Middleware/Auth.php" | CLAUDE_PROJECT_DIR="$P" "$SCRIPTS/laravel-test-first.sh" >/dev/null; code=$?
[[ $code -eq 2 ]] && ok "middleware without test exits 2" || fail "middleware without test exits 2 (got $code)"

payload "$P/tests/Feature/NewTest.php" | CLAUDE_PROJECT_DIR="$P" "$SCRIPTS/laravel-test-first.sh" >/dev/null; code=$?
[[ $code -eq 0 ]] && ok "writes to tests pass" || fail "writes to tests pass (got $code)"

payload "$P/app/Models/User.php" | CLAUDE_SKIP_TEST_FIRST=1 CLAUDE_PROJECT_DIR="$P" "$SCRIPTS/laravel-test-first.sh" >/dev/null; code=$?
[[ $code -eq 0 ]] && ok "CLAUDE_SKIP_TEST_FIRST=1 bypasses" || fail "CLAUDE_SKIP_TEST_FIRST=1 bypasses (got $code)"

payload "$P/components/Button.tsx" | CLAUDE_PROJECT_DIR="$P" "$SCRIPTS/laravel-test-first.sh" >/dev/null; code=$?
[[ $code -eq 0 ]] && ok "tsx component path is not its concern" || fail "tsx component path is not its concern (got $code)"

P=$(project flat)
mkdir -p "$P/tests/Unit/Services/Moderation"
touch "$P/app/Services/ModerationService.php"
payload "$P/app/Services/ModerationService.php" | SDD_KIT_TEST_FIRST=strict CLAUDE_PROJECT_DIR="$P" "$SCRIPTS/laravel-test-first.sh" >/dev/null 2>&1; code=$?
[[ $code -eq 2 ]] && ok "AC-35: service with no test exits 2" || fail "AC-35: service with no test exits 2 (got $code)"
touch "$P/tests/Feature/ModerationServiceTest.php"
payload "$P/app/Services/ModerationService.php" | CLAUDE_PROJECT_DIR="$P" "$SCRIPTS/laravel-test-first.sh" >/dev/null 2>&1; code=$?
[[ $code -eq 0 ]] && ok "AC-35: flat tests/Feature test is found" || fail "AC-35: flat tests/Feature test is found (got $code)"
rm "$P/tests/Feature/ModerationServiceTest.php"
touch "$P/tests/Unit/Services/Moderation/ModerationServiceTest.php"
payload "$P/app/Services/ModerationService.php" | CLAUDE_PROJECT_DIR="$P" "$SCRIPTS/laravel-test-first.sh" >/dev/null 2>&1; code=$?
[[ $code -eq 0 ]] && ok "AC-35: two-level tests/Unit test is found" || fail "AC-35: two-level tests/Unit test is found (got $code)"
rm "$P/tests/Unit/Services/Moderation/ModerationServiceTest.php"
err=$(payload "$P/app/Services/ModerationService.php" | SDD_KIT_TEST_FIRST=strict CLAUDE_PROJECT_DIR="$P" "$SCRIPTS/laravel-test-first.sh" 2>&1 >/dev/null)
[[ "$err" == *"has no corresponding test"* ]] && ok "AC-35: block reason is on stderr" || fail "AC-35: block reason is on stderr: $err"

echo "laravel-test-first.sh modes"
P=$(project modes)
touch "$P/app/Services/LegacyService.php"
out=$(payload "$P/app/Services/LegacyService.php" | CLAUDE_PROJECT_DIR="$P" "$SCRIPTS/laravel-test-first.sh"); code=$?
[[ $code -eq 0 && "$out" == *'"systemMessage"'* && "$out" == *"tests/Unit/LegacyServiceTest.php"* ]] && ok "new (default): edit of an existing untested file warns" || fail "new: existing file warns (got $code: $out)"
payload "$P/app/Services/BrandNewService.php" | CLAUDE_PROJECT_DIR="$P" "$SCRIPTS/laravel-test-first.sh" >/dev/null 2>&1; code=$?
[[ $code -eq 2 ]] && ok "new (default): creating a guarded file without a test is denied" || fail "new: creation denied (got $code)"
jq -nc --arg f "$P/app/Services/BrandNewService.php" '{tool_name: "Edit", tool_input: {file_path: $f}}' | CLAUDE_PROJECT_DIR="$P" "$SCRIPTS/laravel-test-first.sh" >/dev/null 2>&1; code=$?
[[ $code -eq 0 ]] && ok "new: an Edit is never a creation" || fail "new: Edit warns (got $code)"
payload "$P/app/Services/BrandNewService.php" | SDD_KIT_TEST_FIRST=warn CLAUDE_PROJECT_DIR="$P" "$SCRIPTS/laravel-test-first.sh" >/dev/null 2>&1; code=$?
[[ $code -eq 0 ]] && ok "warn: never denies" || fail "warn: never denies (got $code)"
payload "$P/app/Services/LegacyService.php" | SDD_KIT_TEST_FIRST=strict CLAUDE_PROJECT_DIR="$P" "$SCRIPTS/laravel-test-first.sh" >/dev/null 2>&1; code=$?
[[ $code -eq 2 ]] && ok "strict: existing untested file is denied (old behaviour)" || fail "strict: denies (got $code)"
out=$(payload "$P/app/Services/LegacyService.php" | SDD_KIT_TEST_FIRST=bogus CLAUDE_PROJECT_DIR="$P" "$SCRIPTS/laravel-test-first.sh"); code=$?
[[ $code -eq 0 && "$out" == *"Valid values: strict, new, warn"* ]] && ok "unknown mode behaves as new and names the valid values" || fail "unknown mode note (got $code: $out)"
payload "$P/app/Services/BrandNewService.php" | SDD_KIT_TEST_FIRST=strict CLAUDE_SKIP_TEST_FIRST=1 CLAUDE_PROJECT_DIR="$P" "$SCRIPTS/laravel-test-first.sh" >/dev/null 2>&1; code=$?
[[ $code -eq 0 ]] && ok "CLAUDE_SKIP_TEST_FIRST=1 still bypasses every mode" || fail "skip bypasses (got $code)"

echo "laravel-lint.sh"

P=$(project lint)
touch "$P/app/Foo.php" "$P/app/script.js"
out=$(payload "$P/app/Foo.php" | CLAUDE_PROJECT_DIR="$P" "$SCRIPTS/laravel-lint.sh"); code=$?
[[ $code -eq 0 && -z "$out" ]] && ok "no pint installed is silent" || fail "no pint installed is silent: $out"

mkdir -p "$P/vendor/bin"
printf '#!/bin/bash\necho "FAIL app/Foo.php"\n' > "$P/vendor/bin/pint"; chmod +x "$P/vendor/bin/pint"
out=$(payload "$P/app/Foo.php" | CLAUDE_PROJECT_DIR="$P" "$SCRIPTS/laravel-lint.sh"); code=$?
[[ $code -eq 0 && "$out" == *"Lint: $P/app/Foo.php has code style issues. Run vendor/bin/pint to fix."* ]] \
    && ok "pint FAIL reports a systemMessage" || fail "pint FAIL reports a systemMessage: $out"

out=$(payload "$P/app/script.js" | CLAUDE_PROJECT_DIR="$P" "$SCRIPTS/laravel-lint.sh"); code=$?
[[ $code -eq 0 && -z "$out" ]] && ok "non-php file is ignored" || fail "non-php file is ignored: $out"

out=$(payload "$P/app/missing.php" | CLAUDE_PROJECT_DIR="$P" "$SCRIPTS/laravel-lint.sh"); code=$?
[[ $code -eq 0 && -z "$out" ]] && ok "missing file exits 0" || fail "missing file exits 0"

if [[ $FAILS -gt 0 ]]; then
    printf '%d failure(s)\n' "$FAILS"
    exit 1
fi
echo "all passed"
