#!/bin/bash
#
# Behaviour tests for the Drupal add-on hook scripts (drupal-test-first.sh, drupal-lint.sh).
# Run: bash src/plugins/drupal/scripts/test/drupal-hooks.test.sh

set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPTS="$(dirname "$HERE")"
FAILS=0
TMP=$(cd "$(mktemp -d)" && pwd -P)
trap 'rm -rf "$TMP"' EXIT

ok()   { printf '  ok   %s\n' "$1"; }
fail() { printf '  FAIL %s\n' "$1"; FAILS=$((FAILS + 1)); }
check() { if eval "$2"; then ok "$1"; else fail "$1${3:+: $3}"; fi; }

payload() { jq -nc --arg f "$1" '{tool_input: {file_path: $f}}'; }

# A Drupal module: <dir>/<name>.info.yml plus the given files, relative to the module.
module() {
    local dir="$1"; shift
    mkdir -p "$dir"
    touch "$dir/$(basename "$dir").info.yml"
    local f
    for f in "$@"; do
        mkdir -p "$(dirname "$dir/$f")"
        printf '%s\n' "${CONTENT:-<?php}" > "$dir/$f"
    done
}

# Runs drupal-test-first.sh for a file; sets CODE, OUT (stdout) and ERR (stderr).
first() {
    local project="$1" file="$2"; shift 2
    payload "$file" | env CLAUDE_PROJECT_DIR="$project" "$@" "$SCRIPTS/drupal-test-first.sh" >"$TMP/out" 2>"$TMP/err"
    CODE=$?
    OUT=$(cat "$TMP/out"); ERR=$(cat "$TMP/err")
}

echo "drupal-test-first.sh"

P="$TMP/site"
M="$P/web/modules/custom/shop"
module "$M"

first "$P" "$M/src/Controller/CartController.php"
check "controller without a test exits 2" '[[ $CODE -eq 2 ]]' "got $CODE"
check "the deny reason is on stderr, with the test type and the bypass" \
    '[[ "$ERR" == *"web/modules/custom/shop/src/Controller/CartController.php"* && "$ERR" == *"Functional test"* && "$ERR" == *"Fix:"* && "$ERR" == *"CLAUDE_SKIP_TEST_FIRST=1"* ]]' "$ERR"
check "stdout carries the deny JSON" \
    '[[ "$(jq -r .hookSpecificOutput.permissionDecision <<<"$OUT")" == deny && "$(jq -r .hookSpecificOutput.permissionDecisionReason <<<"$OUT")" == "$ERR" ]]' "$OUT"

first "$P" "web/modules/custom/shop/src/Form/CheckoutForm.php"
check "a relative path resolves against CLAUDE_PROJECT_DIR" '[[ $CODE -eq 2 && "$ERR" == *"CheckoutForm"* ]]' "got $CODE"

for case in "Access/CartAccessCheck:Functional" "EventSubscriber/CartSubscriber:Kernel" "Service/CartManager:Unit or Kernel" "Services/PriceCalculator:Unit or Kernel"; do
    first "$P" "$M/src/${case%%:*}.php"
    check "${case%%:*} without a test is blocked and names a ${case#*:} test" '[[ $CODE -eq 2 && "$ERR" == *"${case#*:} test"* ]]' "got $CODE: $ERR"
done

module "$M" tests/src/Functional/Admin/CartControllerTest.php
first "$P" "$M/src/Controller/CartController.php"
check "a test two levels deep under tests/src passes" '[[ $CODE -eq 0 && -z "$OUT$ERR" ]]' "got $CODE"

CONTENT='<?php
use Drupal\shop\Form\CheckoutForm;' module "$M" tests/src/Functional/CheckoutFlowTest.php
first "$P" "$M/src/Form/CheckoutForm.php"
check "a behaviour-named test that names the class passes" '[[ $CODE -eq 0 ]]' "got $CODE"

CONTENT='<?php
// CheckoutFormatter is a different class.' module "$M" tests/src/Unit/FormatTest.php
first "$P" "$M/src/Service/CheckoutFormat.php"
check "a longer class name does not count as naming the class" '[[ $CODE -eq 2 ]]' "got $CODE"

G="$P/web/modules/custom/acme/acme_core"
module "$G"
module "$P/web/modules/custom/acme/acme_other" tests/src/Kernel/OrderServiceTest.php
first "$P" "$G/src/Service/OrderService.php"
check "a grouped module looks only in its own tests/src" '[[ $CODE -eq 2 && "$ERR" == *"acme/acme_core/tests/src"* ]]' "got $CODE: $ERR"
module "$G" tests/src/Kernel/OrderServiceTest.php
first "$P" "$G/src/Service/OrderService.php"
check "a grouped module with its test passes" '[[ $CODE -eq 0 ]]' "got $CODE"

S="$P/web/modules/custom/foo/modules/foo_sub"
module "$P/web/modules/custom/foo" tests/src/Functional/SubControllerTest.php
module "$S"
first "$P" "$S/src/Controller/SubController.php"
check "a submodule resolves to its own tests/src, not the parent's" '[[ $CODE -eq 2 && "$ERR" == *"foo/modules/foo_sub/tests/src"* ]]' "got $CODE: $ERR"

for cls in Plugin/Block/CartBlock Plugin/Field/FieldFormatter/PriceFormatter Entity/Order; do
    first "$P" "$M/src/$cls.php"
    check "$cls without a test only warns" \
        '[[ $CODE -eq 0 && -z "$ERR" && "$(jq -r .systemMessage <<<"$OUT")" == *"Kernel test"* ]]' "got $CODE: $OUT"
done

first "$P" "$M/src/ShopHelper.php"
check "a class directly under src/ is not guarded" '[[ $CODE -eq 0 && -z "$OUT$ERR" ]]' "got $CODE"
first "$P" "$M/src/Hook/ShopHooks.php"
check "src/Hook classes are not guarded" '[[ $CODE -eq 0 && -z "$OUT$ERR" ]]' "got $CODE"
first "$P" "$M/tests/src/Kernel/NewTest.php"
check "edits under tests pass" '[[ $CODE -eq 0 && -z "$OUT$ERR" ]]' "got $CODE"
rm -rf "$M/tests"
first "$P" "$M/src/Controller/CartController.php" CLAUDE_SKIP_TEST_FIRST=1
check "CLAUDE_SKIP_TEST_FIRST=1 bypasses" '[[ $CODE -eq 0 ]]' "got $CODE"
first "$P" "$M/shop.module"
check ".module files pass" '[[ $CODE -eq 0 && -z "$OUT$ERR" ]]' "got $CODE"
first "$P" "$P/app/Http/Controllers/FooController.php"
check "a Laravel controller path is not its concern" '[[ $CODE -eq 0 && -z "$OUT$ERR" ]]' "got $CODE"
first "$P" "$P/components/Button.tsx"
check "a tsx path is not its concern" '[[ $CODE -eq 0 && -z "$OUT$ERR" ]]' "got $CODE"
first "$P" "$P/web/modules/contrib/views_extra/src/Controller/ViewsController.php"
check "contrib modules are not guarded" '[[ $CODE -eq 0 ]]' "got $CODE"
first "$P" "$P/web/modules/custom/draft/src/Controller/DraftController.php"
check "a folder without .info.yml is not a module" '[[ $CODE -eq 0 ]]' "got $CODE"

module "$P/docroot/modules/custom/legacy"
first "$P" "$P/docroot/modules/custom/legacy/src/Form/LegacyForm.php"
check "a docroot/ site resolves" '[[ $CODE -eq 2 && "$ERR" == *"docroot/modules/custom/legacy/tests/src"* ]]' "got $CODE: $ERR"
module "$P/repo/web/modules/custom/inner"
first "$P" "$P/repo/web/modules/custom/inner/src/Controller/InnerController.php"
check "a site nested below the project dir resolves" '[[ $CODE -eq 2 && "$ERR" == *"repo/web/modules/custom/inner/tests/src"* ]]' "got $CODE: $ERR"

echo "drupal-lint.sh"

# PATH for the lint runs: the tools the hook needs, plus stubs, so host php and ddev are controlled.
TOOLS="$TMP/tools"
mkdir -p "$TOOLS"
for t in bash jq find grep head dirname basename cat; do ln -s "$(command -v "$t")" "$TOOLS/$t"; done
LOG="$TMP/calls.log"

stub_php() { printf '#!/bin/bash\nexit 0\n' > "$TOOLS/php"; chmod +x "$TOOLS/php"; }
no_php() { rm -f "$TOOLS/php"; }
# ddev stub: describe -j reports DDEV_STATUS; exec logs cwd and args, then runs the command after --dir <path>.
stub_ddev() {
    cat > "$TOOLS/ddev" <<'SH'
#!/bin/bash
if [[ "$1" == describe ]]; then
    printf '{"raw":{"status":"%s"}}\n' "$DDEV_STATUS"
    exit 0
fi
printf 'ddev %s | %s\n' "$PWD" "$*" >> "$CALL_LOG"
shift
[[ "$1" == --dir ]] && shift 2
exec "$@"
SH
    chmod +x "$TOOLS/ddev"
}

# A repo root with web/modules/custom/shop/src/Cart.php and a phpcs stub that prints PHPCS_OUT and exits PHPCS_CODE.
lint_site() {
    local r="$1"
    mkdir -p "$r/web/modules/custom/shop/src" "$r/vendor/bin" "$r/vendor/drupal/coder" "$r/vendor/squizlabs/php_codesniffer"
    printf '<?php\n' > "$r/web/modules/custom/shop/src/Cart.php"
    touch "$r/vendor/squizlabs/php_codesniffer/CodeSniffer.conf"
    cat > "$r/vendor/bin/phpcs" <<'SH'
#!/bin/bash
printf 'phpcs %s | %s\n' "$PWD" "$*" >> "$CALL_LOG"
printf '%s' "$PHPCS_OUT"
exit "${PHPCS_CODE:-0}"
SH
    chmod +x "$r/vendor/bin/phpcs"
}

REPORT='{"totals":{"errors":2,"warnings":1,"fixable":1},"files":{"web/modules/custom/shop/src/Cart.php":{"errors":2,"warnings":1,"messages":[
{"message":"a","source":"Drupal.Commenting.FileComment.Missing","type":"ERROR"},
{"message":"b","source":"Drupal.Files.LineLength.TooLong","type":"ERROR"},
{"message":"c","source":"DrupalPractice.General.X","type":"WARNING"}]}}}'
INTERNAL='{"totals":{"errors":1,"warnings":0,"fixable":0},"files":{"x.php":{"errors":1,"warnings":0,"messages":[
{"message":"No sniffs were registered","source":"Internal.NoCodeFound","type":"ERROR"}]}}}'

# Runs drupal-lint.sh from an unrelated cwd; sets CODE and OUT.
lint() {
    : > "$LOG"
    OUT=$(cd "$TMP" && payload "$1" | env -i PATH="$TOOLS" HOME="$TMP" CALL_LOG="$LOG" PHPCS_OUT="${PHPCS_OUT-$REPORT}" PHPCS_CODE="${PHPCS_CODE:-1}" \
        DDEV_STATUS="${DDEV_STATUS:-running}" CLAUDE_PROJECT_DIR="${2:-$TMP}" "$TOOLS/bash" "$SCRIPTS/drupal-lint.sh" 2>&1)
    CODE=$?
}

L="$TMP/lint"
mkdir -p "$L/web/modules/custom/shop/src"
printf '<?php\n' > "$L/web/modules/custom/shop/src/Cart.php"
stub_php
lint "$L/web/modules/custom/shop/src/Cart.php"
check "no phpcs is silent" '[[ $CODE -eq 0 && -z "$OUT" ]]' "$OUT"

lint_site "$L"
F="$L/web/modules/custom/shop/src/Cart.php"
lint "$F"
check "a report with findings gives a systemMessage with the counts and the phpcbf fix" \
    '[[ $CODE -eq 0 && "$(jq -r .systemMessage <<<"$OUT")" == "PHPCS: $F has 2 error(s) and 1 warning(s). Fix: run (cd $L && ./vendor/bin/phpcbf --standard=Drupal,DrupalPractice"*"web/modules/custom/shop/src/Cart.php) for the fixable ones, then fix the rest by hand." ]]' "$OUT"
check "host phpcs runs from the repo root with the Drupal standard and a repo-relative path" \
    '[[ "$(cat "$LOG")" == "phpcs $L | --report=json --standard=Drupal,DrupalPractice --extensions=php,module,inc,install,test,profile,theme web/modules/custom/shop/src/Cart.php" ]]' "$(cat "$LOG")"

lint "web/modules/custom/shop/src/Cart.php" "$L"
check "a relative path resolves against CLAUDE_PROJECT_DIR" '[[ "$OUT" == *"2 error(s)"* ]]' "$OUT"

PHPCS_OUT='{"totals":{"errors":0,"warnings":0,"fixable":0},"files":{}}' PHPCS_CODE=0 lint "$F"
check "a clean report is silent" '[[ $CODE -eq 0 && -z "$OUT" ]]' "$OUT"

PHPCS_OUT='ERROR: the "Drupal" coding standard is not installed.' PHPCS_CODE=3 lint "$F"
check "a phpcs setup error (exit 3, no JSON) is silent" '[[ $CODE -eq 0 && -z "$OUT" ]]' "$OUT"

PHPCS_OUT="$INTERNAL" lint "$F"
check "Internal.* processing messages are not reported as findings" '[[ $CODE -eq 0 && -z "$OUT" ]]' "$OUT"

rm "$L/vendor/squizlabs/php_codesniffer/CodeSniffer.conf"
lint "$F"
check "coder without CodeSniffer.conf is silent and runs nothing" '[[ $CODE -eq 0 && -z "$OUT" && ! -s "$LOG" ]]' "$OUT"
touch "$L/phpcs.xml.dist"
lint "$F"
check "a project ruleset runs bare phpcs" \
    '[[ "$OUT" == *"2 error(s)"* && "$(cat "$LOG")" == "phpcs $L | --report=json web/modules/custom/shop/src/Cart.php" ]]' "$(cat "$LOG")"
rm "$L/phpcs.xml.dist"
touch "$L/vendor/squizlabs/php_codesniffer/CodeSniffer.conf"

mkdir -p "$L/app"; printf '<?php\n' > "$L/app/Foo.php"
lint "$L/app/Foo.php"
check "a non-Drupal path is ignored" '[[ $CODE -eq 0 && -z "$OUT" && ! -s "$LOG" ]]' "$OUT"
printf 'x\n' > "$L/web/modules/custom/shop/shop.routing.yml"
lint "$L/web/modules/custom/shop/shop.routing.yml"
check "a YAML file is ignored" '[[ $CODE -eq 0 && -z "$OUT" && ! -s "$LOG" ]]' "$OUT"
lint "$L/web/modules/custom/shop/src/Missing.php"
check "a missing file is silent" '[[ $CODE -eq 0 && -z "$OUT" ]]' "$OUT"

mkdir -p "$L/.ddev"; touch "$L/.ddev/config.yaml"
stub_ddev
no_php
DDEV_STATUS=stopped lint "$F"
check "a stopped DDEV project with no host php is silent and never runs ddev exec" '[[ $CODE -eq 0 && -z "$OUT" && ! -s "$LOG" ]]' "$OUT / $(cat "$LOG")"
stub_php
DDEV_STATUS=stopped lint "$F"
check "a stopped DDEV project falls back to host php" '[[ "$OUT" == *"2 error(s)"* && "$(cat "$LOG")" == "phpcs $L |"* ]]' "$(cat "$LOG")"

no_php
lint "$F"
check "a running DDEV project runs phpcs through ddev exec from the repo root with --dir" \
    '[[ "$(head -1 "$LOG")" == "ddev $L | exec --dir /var/www/html ./vendor/bin/phpcs --report=json --standard=Drupal,DrupalPractice "*" web/modules/custom/shop/src/Cart.php" ]]' "$(cat "$LOG")"
check "the DDEV fix line uses the same runner" '[[ "$OUT" == *"Fix: run (cd $L && ddev exec --dir /var/www/html ./vendor/bin/phpcbf "* ]]' "$OUT"

N="$TMP/nested"
mkdir -p "$N/.ddev"; touch "$N/.ddev/config.yaml"
lint_site "$N/drupal"
lint "$N/drupal/web/modules/custom/shop/src/Cart.php"
check "a repo below the DDEV root runs with --dir /var/www/html/<repo dir>" \
    '[[ "$(head -1 "$LOG")" == "ddev $N/drupal | exec --dir /var/www/html/drupal ./vendor/bin/phpcs "* && "$OUT" == *"2 error(s)"* ]]' "$(cat "$LOG")"

# An ancestor's phpcs or DDEV project is outside the project boundary and never runs.
O="$TMP/outer"
lint_site "$O"
mkdir -p "$O/.ddev"; touch "$O/.ddev/config.yaml"
mkdir -p "$O/proj/web/modules/custom/shop/src"
printf '<?php\n' > "$O/proj/web/modules/custom/shop/src/Cart.php"
stub_php
lint "$O/proj/web/modules/custom/shop/src/Cart.php" "$O/proj"
check "a phpcs above CLAUDE_PROJECT_DIR is never run" '[[ $CODE -eq 0 && -z "$OUT" && ! -s "$LOG" ]]' "$OUT / $(cat "$LOG")"
lint "$O/proj/../proj/web/modules/custom/shop/src/Cart.php" "$O/proj"
check "a .. in the file path does not widen the boundary" '[[ $CODE -eq 0 && -z "$OUT" && ! -s "$LOG" ]]' "$OUT / $(cat "$LOG")"

lint_site "$O/proj"
lint "$O/proj/web/modules/custom/shop/src/Cart.php" "$O/proj"
check "a DDEV project above CLAUDE_PROJECT_DIR is not used: host phpcs runs in the project" \
    '[[ "$OUT" == *"2 error(s)"* && "$(cat "$LOG")" == "phpcs $O/proj | "* ]]' "$(cat "$LOG")"

rm -rf "$O/proj/vendor"
lint "$O/proj/web/modules/custom/shop/src/Cart.php" "$TMP/elsewhere"
check "a file outside CLAUDE_PROJECT_DIR with no git top level runs nothing" '[[ $CODE -eq 0 && -z "$OUT" && ! -s "$LOG" ]]' "$OUT / $(cat "$LOG")"

if command -v git >/dev/null 2>&1; then
    ln -s "$(command -v git)" "$TOOLS/git"
    git init -q "$O/proj"
    check "git finds the top level in the hook's environment" \
        '[[ "$(env -i PATH="$TOOLS" HOME="$TMP" git -C "$O/proj/web" rev-parse --show-toplevel 2>&1)" == "$O/proj" ]]'
    lint "$O/proj/web/modules/custom/shop/src/Cart.php" "$TMP/elsewhere"
    check "outside CLAUDE_PROJECT_DIR the walk stops at the git top level" '[[ $CODE -eq 0 && -z "$OUT" && ! -s "$LOG" ]]' "$OUT / $(cat "$LOG")"
    lint_site "$O/proj"
    lint "$O/proj/web/modules/custom/shop/src/Cart.php" "$TMP/elsewhere"
    check "a phpcs at the git top level runs" '[[ "$OUT" == *"2 error(s)"* && "$(cat "$LOG")" == "phpcs $O/proj | "* ]]' "$(cat "$LOG")"
    rm -f "$TOOLS/git"
fi

if [[ $FAILS -gt 0 ]]; then
    printf '%d failure(s)\n' "$FAILS"
    exit 1
fi
echo "all passed"
