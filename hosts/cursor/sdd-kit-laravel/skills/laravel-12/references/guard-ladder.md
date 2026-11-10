# Guard ladder: Laravel

Stack patterns for `/learn` Step 3 in a Laravel 12 + Pest 3 repo. The generic ladder is in the core `learn` skill; match the target project's existing files and style over these examples.

## Rung 1: regression or architecture test

### Pest `arch()` (structural rules in PHP)

Append to the project's existing arch file (Grep `arch(` under `tests/`). If there is none, create `tests/Unit/ArchTest.php`: the Unit suite runs by default, while a new `tests/Arch/` folder is skipped unless `phpunit.xml` declares it as a test suite.

```php
arch('controllers do not query')
    ->expect('Illuminate\Support\Facades\DB')
    ->not->toBeUsedIn('App\Http\Controllers');

arch('no debugging statements')
    ->expect(['dd', 'dump', 'ray', 'var_dump'])
    ->not->toBeUsed();

arch('services are final')
    ->expect('App\Services')
    ->toBeFinal();

arch('domain stays framework-free')
    ->expect('App\Domain')
    ->not->toUse('Illuminate\Support\Facades')
    ->ignoring('App\Domain\Legacy');   // only with approval, listing the known violations
```

- Name the test after the rule, not the incident: `controllers do not query`, not `fix export bug`.
- `ignoring()` keeps the guard green while known violations are fixed. List each ignored path in the diff so the user approves it explicitly.
- More expectations (`toOnlyDependOn`, `toHaveMethod`, `toExtend`, `toUseStrictTypes`): `pest-3/references/advanced-testing.md`.

### Pest feature or unit test (behavior rules)

Use when the class is a behavior, not a structure: "every money endpoint returns minor units", "a refund never exceeds the captured amount". Guard the rule across inputs with a dataset rather than re-asserting the one fixed case.

```php
use Laravel\Passport\Passport;

it('returns money as integer minor units', function (string $routeName) {
    $order = Order::factory()->create();
    Passport::actingAs($order->user, [], 'api');

    $this->getJson(route($routeName, $order))
        ->assertOk()
        ->assertJsonPath('data.total', fn ($total) => is_int($total));
})->with(['orders.show', 'orders.receipt']);
```

Place it where the project keeps tests for that area (`tests/Feature/<Module>/`). Use factories, not seeded data.

## Rung 2: static analysis rule

### PHPStan / Larastan (`phpstan.neon` or `phpstan.neon.dist`)

Options in order of cost:

1. Raise `level` one step for a path that keeps producing the class (via a separate config or `paths:`), if the rest stays green.
2. Turn on a parameter the installed extension already offers, for example Larastan's `checkModelProperties: true` when the mistake was a typo'd model attribute.
3. A custom rule class implementing `PHPStan\Rules\Rule`. This is real code to maintain, so propose it only when an `arch()` test cannot express the class.

Never use `ignoreErrors` or the baseline to make a new guard green.

```neon
parameters:
    level: 8
    checkModelProperties: true
```

More expectations (`toOnlyDependOn`, `toHaveMethod`, `toExtend`, `toUseStrictTypes`): `pest-3/references/advanced-testing.md`.

A queued-listener trap example for rung 4: `Queued listeners see stale model data, because the job serializes the model before the transaction commits. Dispatch with afterCommit().`
