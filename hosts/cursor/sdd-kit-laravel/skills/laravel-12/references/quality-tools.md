# Quality tools: Laravel

Commands and tool detail behind the core `/lint`, `/run-tests`, `/security-scan`, `/upgrade-deps`, `verification-gates` and the `code-quality` agent in a Laravel repo. The gate list itself comes from the stack manifest (`stack.json`); this file holds the options and examples.

If the project runs in DDEV (`.ddev/` exists and `ddev describe` succeeds), prefix PHP commands with `ddev exec`.

## Gates

| Gate | Command | Auto-fix |
|------|---------|----------|
| Format (Pint) | `./vendor/bin/pint --test` | yes: `./vendor/bin/pint` (changed files, or `--dirty`) |
| Static analysis (PHPStan) | `./vendor/bin/phpstan analyse --no-progress` | no |
| Refactoring check (Rector) | `./vendor/bin/rector process --dry-run` (when `rector.php` exists) | no: report the suggested diffs |
| Debug calls | grep changed files for `dd(`, `dump(`, `ray(` | no |
| Tests | `php artisan test`, scoped with `--filter` while iterating, full suite before PASS | no |
| Coverage | `php artisan test --coverage --min=80` when business logic changed | no |

Never lower a PHPStan level, add baseline entries, or add `@phpstan-ignore` to get to green.

## Pint

```bash
./vendor/bin/pint --test              # check style
./vendor/bin/pint                     # fix style
./vendor/bin/pint app/Services/       # one path
./vendor/bin/pint --test -v           # show the diff
```

## PHPStan

```bash
./vendor/bin/phpstan analyse
./vendor/bin/phpstan analyse --level=8
./vendor/bin/phpstan analyse --generate-baseline
./vendor/bin/phpstan analyse app/Services/
```

## Rector

```bash
./vendor/bin/rector process --dry-run
./vendor/bin/rector process
./vendor/bin/rector process app/Services/
```

Dead-code mode (report only): a temporary config that enables `->withPreparedSets(deadCode: true)` for `app/`, run with `./vendor/bin/rector process --dry-run --config <tmp>/rector-dead-code.php`. Also `composer unused` when installed.

## Tests

```bash
php artisan test                                        # all tests
php artisan test --filter=UserRegistration              # by name
php artisan test tests/Feature/UserRegistrationTest.php # one file
php artisan test app/Modules/User/Tests/                # one module (modular projects)
php artisan test --testsuite=Unit
php artisan test --testsuite=Feature
php artisan test --coverage --min=80
./vendor/bin/pest --coverage --coverage-html=coverage
php artisan test --parallel --processes=4
```

Common fixes: test database out of date (`php artisan migrate:fresh --env=testing`), missing role or permission seeding, stale cache (`php artisan cache:clear --env=testing`), an N+1 query making a test slow, a policy that denies the factory user.

## Dependencies and security

```bash
composer audit --format=json
composer outdated --direct --format=json
composer unused                       # when icanhazstring/composer-unused is installed
composer update --with-all-dependencies <packages>
```

Code scans:

```bash
grep -rn "DB::raw\|->whereRaw\|->selectRaw" app/          # raw queries: check bindings
grep -rn "{!!\|@php echo" resources/views/                 # unescaped Blade output
grep -rn "Route::" routes/ | grep -v "middleware"          # routes without middleware
grep -rn "->withoutMiddleware\|->skipMiddleware" app/      # auth bypasses
grep -rn "password\|secret\|api_key" .env.example          # hardcoded credentials
```

## Migrations

`/migrate-db` takes its commands from the manifest's `migrations` block (`php artisan migrate:status`, `migrate`, `migrate:fresh --seed`). Use `php artisan migrate --pretend` to review the SQL first.
