# CI failure map: Laravel

Root causes seen most often per gate in a Laravel repo, with the honest fix. Load from `/fix-ci` Step 2 once the failing step is classified. Every "Do not" here is on the protected list in the core SKILL.md and needs explicit user confirmation.

## Cross-cutting rows

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Class "App\Data\UserDto" not found` only in CI | PSR-4 class name and filename casing differ (`UserDTO.php` vs `UserDto`); Linux is case-sensitive | Rename the file or class so they match exactly, then `composer dump-autoload` |
| `composer install` fails: lock file not up to date | `composer.json` changed without updating the lock | `composer update <vendor/package> --with-dependencies`, commit `composer.lock` |
| `composer install` fails: lock does not contain a compatible set of packages | Lock was resolved for a different PHP | Set `config.platform.php` to the production PHP version and re-resolve, or align the CI PHP version |
| `APP_KEY` missing in CI | `.env` not created for the job | Generate it in the job (`php artisan key:generate --env=testing`) or set it from the secret store |
| Audit: `composer audit` failing on a new advisory | Vulnerable version in the lock | `composer update vendor/package` within the constraint; a major bump goes to `/upgrade-deps` |

## Pint

- Unformatted files after a merge or a hand edit → `./vendor/bin/pint <files>`. Commit formatting separately from logic when the diff is large.
- CI and local disagree → different Pint versions or a missing `pint.json` preset. Pin Pint in `composer.json` `require-dev` and use the project's `pint.json`.
- Do not: add `exclude` paths or disable rules to get green.

## PHPStan / Larastan

| Error | Usual cause | Fix |
|-------|-------------|-----|
| `Access to an undefined property App\Models\X::$foo` | Missing `@property` PHPDoc or Larastan not loaded | Add the model PHPDoc or include `larastan/larastan` in `phpstan.neon` |
| `... return type has no value type specified in iterable type array` | Untyped arrays at a higher level | Add generics (`@return array<int, OrderData>`, `Collection<int, Order>`) |
| `Parameter #1 ... expects X, X\|null given` | A nullable value reaches a non-null parameter | Handle the null case at the boundary (guard, `firstOrFail()`, DTO validation) |
| Out of memory | Default memory limit too low in CI | Keep the CI flag (`--memory-limit=1G`) when reproducing. Raising the limit in CI is not a weakening |
| New errors after `composer update` | Stricter stubs in a Larastan or PHPStan release | Fix the code. If the release is the problem, pin the previous version and say why |

Do not: run `--generate-baseline`, add `@phpstan-ignore`, add `ignoreErrors`, or lower `level`.

## Pest

| Symptom | Cause | Fix |
|---------|-------|-----|
| `No application encryption key has been specified` | CI has no APP_KEY | Set `APP_KEY` in `phpunit.xml` `<env>` or `.env.testing`, or run `php artisan key:generate --env=testing` in the CI setup step |
| `could not find driver` / `SQLSTATE[HY000] [2002]` | Missing PDO extension or DB service not ready | Add the extension or a service health check in the workflow (devops-engineer) |
| Passes on SQLite, fails on MySQL/Postgres in CI | Engine differences: JSON columns, strict mode, case-sensitive `LIKE`, FK enforcement | Make the query or migration engine-correct; prefer running tests on the production engine |
| Fails only with `--parallel` | Shared state: fixed IDs, files on disk, static caches, the same Redis DB | Use factories, `Storage::fake()`, per-process tokens (`ParallelTesting::token()`) |
| Fails around midnight, month-end, or in another TZ | Real clock in a test | Freeze time with `$this->travelTo()` or `Carbon::setTestNow()` |
| Assertion on product behavior, code changed on this branch | Real defect | Hand off to `/sdd` bug |

Coverage below `--min`: add tests for the uncovered lines the change introduced (`pest-3` skill). Do not lower `--min` or add coverage excludes.
