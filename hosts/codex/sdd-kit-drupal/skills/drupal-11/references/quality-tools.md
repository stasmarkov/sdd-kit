# Quality tools: Drupal

Commands and tool detail behind the core `/lint`, `/run-tests`, `/security-scan`, `/upgrade-deps`, `verification-gates` and the `code-quality` agent in a Drupal repo. The gate list itself comes from the stack manifest (`stack.json`); this file holds the options and examples. `<docroot>` is `docroot` in `.ddev/config.yaml`, else `extra.drupal-scaffold.locations.web-root` in `composer.json`.

If the project runs in DDEV (`.ddev/` exists), check that it is running: `ddev describe -j` must report `raw.status` `running`. If it does not, stop and ask the user to run `ddev start`; do not start it yourself. While it is running, prefix each command below with `ddev exec` (Composer and Drush as `ddev composer` and `ddev drush`).

## Gates

| Gate | Check | Auto-fix |
|------|-------|----------|
| PHPCS | `./vendor/bin/phpcs --standard=Drupal,DrupalPractice --extensions=php,module,inc,install,test,profile,theme,info,yml <docroot>/modules/custom` | yes: `./vendor/bin/phpcbf` with the same arguments |
| PHPStan | `./vendor/bin/phpstan analyse --no-progress` | no |
| Twig CS Fixer | `./vendor/bin/twig-cs-fixer lint --no-cache` | yes: `./vendor/bin/twig-cs-fixer lint --fix --no-cache` |
| PHPUnit | `./vendor/bin/phpunit -c <docroot>/core --fail-on-empty-test-suite <docroot>/modules/custom` | no |
| Dependency audit | `composer audit --locked` | no |

Never lower a PHPStan level, add baseline entries, or add `@phpstan-ignore` to get to green.

## PHPCS and PHPCBF

```bash
./vendor/bin/phpcs --standard=Drupal,DrupalPractice --extensions=php,module,inc,install,test,profile,theme,info,yml <docroot>/modules/custom
./vendor/bin/phpcbf --standard=Drupal,DrupalPractice --extensions=php,module,inc,install,test,profile,theme,info,yml <docroot>/modules/custom
./vendor/bin/phpcs --standard=Drupal,DrupalPractice <docroot>/modules/custom/my_module/src/Foo.php   # one file
```

## PHPStan

```bash
./vendor/bin/phpstan analyse --no-progress
./vendor/bin/phpstan analyse --no-progress --memory-limit=1G        # out-of-memory on a large codebase
./vendor/bin/phpstan analyse --no-progress <docroot>/modules/custom/my_module
```

## Twig CS Fixer

```bash
./vendor/bin/twig-cs-fixer lint --no-cache                  # check
./vendor/bin/twig-cs-fixer lint --fix --no-cache            # fix (formatter-class gate)
./vendor/bin/twig-cs-fixer lint --no-cache <docroot>/themes/custom/my_theme/templates
```

The gate and the fix form pass no path, so the project's Twig CS Fixer config decides what is linted and rewritten. Without a finder the tool takes every `*.twig` under the repo root except `vendor/` and `node_modules/`, which includes core and contrib templates. Limit it to custom code in `.twig-cs-fixer.php` with `(new TwigCsFixer\File\Finder())->in(['<docroot>/modules/custom', '<docroot>/themes/custom'])` passed to `$config->setFinder(...)`. Never run `--fix` without that finder: it would rewrite core and contrib.

Drupal's `{% trans %}` block is not standard Twig. Register `TwigTransTokenParser` (from the project's Twig CS Fixer config, `.twig-cs-fixer.php`) so the parser accepts `{% trans %}`; without it every template that uses the tag reports a syntax error instead of a style problem.

## PHPUnit

```bash
./vendor/bin/phpunit -c <docroot>/core --fail-on-empty-test-suite <docroot>/modules/custom
./vendor/bin/phpunit -c <docroot>/core <docroot>/modules/custom/my_module/tests/src/Unit
./vendor/bin/phpunit -c <docroot>/core --testsuite unit,kernel
./vendor/bin/phpunit -c <docroot>/core --filter testSomething <docroot>/modules/custom/my_module
```

Kernel and Functional tests need `SIMPLETEST_DB` and `SIMPLETEST_BASE_URL` (see the Gate setup section of the skill). Base classes and run commands: `testing-patterns.md`.

## Dependencies and security

```bash
composer audit --locked
composer audit --locked --format=json
composer outdated --direct --format=json
composer update --with-all-dependencies <packages>
drush pm:security                  # Drupal security advisories, when available
```

An abandoned package fails `composer audit --locked` by default (Composer 2.7+), and the kit keeps that. A project that only wants abandoned packages reported sets `config.audit.abandoned` to `report` in `composer.json`; the kit does not override it. Either way, list each abandoned package in the report with its suggested replacement, and do not swap a dependency without the user's approval.

Code scans (run from the repo root over the changed and custom code):

```bash
grep -rn -e '->query(' -e 'db_query(' -e '->condition([^)]*\. ' <docroot>/modules/custom  # string-built SQL: check placeholders
grep -rn "|raw" <docroot>/modules/custom <docroot>/themes/custom                   # unescaped Twig output
grep -rn "#markup" <docroot>/modules/custom <docroot>/themes/custom                   # raw markup: is any input in it
grep -rnE "_access:[[:space:]]*['\"]?TRUE['\"]?" --include='*.routing.yml' <docroot>/modules/custom  # public routes: intended?
grep -rLn "_csrf_token" <docroot>/modules/custom --include='*.routing.yml'           # routing files without CSRF protection
grep -rn "dpm(\|dd(\|kint(\|var_dump(" <docroot>/modules/custom                    # debug calls
```

A route that changes state through GET needs `_csrf_token: 'TRUE'` in its requirements.
