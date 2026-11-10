# Test-writer patterns: Laravel

Stack detail the `test-writer` agent defers to in a Laravel repo.

## Test patterns

Load `layered-test-patterns.md` when you need full examples of feature, service, repository, or policy tests. In short:

- **Feature test**: `Passport::actingAs()`, hit the endpoint, assert status + `assertJsonStructure`, then `assertDatabaseHas`. Always add unauthenticated (401) and validation (422) cases.
- **Service unit test**: construct the service with a `Mockery` mock of the repository interface; pass DTOs, assert DTOs returned and domain exceptions thrown.
- **Repository test**: `RefreshDatabase`, create from a DTO, assert the returned DTO type and the persisted row; cover the not-found (`null`) case.
- **Policy test**: call policy methods directly for owner, non-owner, and permission-granted users.

## Execution commands

```bash
# Run all tests
php artisan test --env=testing

# Run specific suite
php artisan test --testsuite=Feature --env=testing

# Run with coverage
php artisan test --coverage --min=80 --env=testing

# Run parallel (faster)
php artisan test --parallel --env=testing

# Run specific test file
php artisan test tests/Feature/WalletTransferTest.php --env=testing
```
