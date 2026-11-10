# Deployment: Laravel

Detail the `devops-engineer` agent defers to for a Laravel app.

## Deployment sequence
A zero-surprise deploy follows this order:
1. `php artisan down --retry=60` (skip for zero-downtime release-directory strategies)
2. Pull code or switch release symlink
3. `composer install --no-dev --optimize-autoloader --no-interaction`
4. `php artisan migrate --force`
5. `php artisan optimize` (config, route, view, event caches)
6. `php artisan queue:restart`
7. Reload PHP-FPM to clear opcache
8. `php artisan up`, then hit the health endpoint

## Containers

Production images run as a non-root user, contain no dev dependencies, and cache config, routes, views, and events at build time (`php artisan optimize`).

## CI

Pipelines run Pint and PHPStan and the tests before any deploy job; cache Composer dependencies keyed on `composer.lock`.

## Health check

`GET /up` (Laravel 11+) or a custom `/health` that verifies database, cache and queue connectivity.
