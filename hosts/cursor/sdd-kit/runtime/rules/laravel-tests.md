---
paths:
  - "tests/**"
  - "**/*Test.php"
---

# Tests (Laravel)

## Rules

- Write the failing test first. Run it and watch it fail for the expected reason before you fix anything.
- Run backend tests with `<php artisan test --env=testing>`. Never point tests at the dev or a shared database.
- Each acceptance criterion in a spec maps to at least one test or to a manual-test step in the spec.
- Test behavior through the public surface (HTTP endpoint, service method), not private internals.
- Build data with factories and states. Don't insert rows by hand or depend on seeders.
- Fake external services (`Http::fake()`, `Queue::fake()`, `Event::fake()`, `Mail::fake()`). No live network calls.
- Never delete, skip, or weaken an assertion just to make a test pass. If the test is wrong, say so and explain why.

## Backend (Pest)

- Feature tests live in `tests/Feature/<Module>/`, unit tests in `tests/Unit/<Module>/`.
- Every endpoint gets at least four cases: happy path, validation (422), unauthenticated (401), forbidden (403).
- Assert the response shape with `assertJsonStructure` or `assertJsonPath`, not just the status code.
- Assert side effects in the database (`assertDatabaseHas`) and in fakes (`Event::assertDispatched`).

```php
it('rejects order creation without a product', function () {
    $user = User::factory()->create();

    actingAs($user, 'api')
        ->postJson('/api/v1/orders', [])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['product_id']);
});
```

## Concurrency and money

- A race-condition fix needs a test that fails without the fix. Sequential tests pass both before and after, so they prove nothing.
- Money assertions compare integers in minor units, never floats.
