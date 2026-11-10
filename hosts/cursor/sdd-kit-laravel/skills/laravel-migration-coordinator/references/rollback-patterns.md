# Migration Rollback Patterns

## Goal

Every migration should be designed so that `php artisan migrate:rollback` returns the schema **and the data** to the prior state, or explicitly documents why it cannot.

## Rollback Categories

| Category | Reversible? | Pattern |
|----------|-------------|---------|
| Create table | Yes | `down(): Schema::drop(...)` |
| Drop table | Data-loss | Snapshot first; rollback restores empty |
| Add column nullable | Yes | `down(): Schema::table(...)->dropColumn(...)` |
| Add column not-null + default | Yes (loses data in dropped col) | dropColumn in `down()` |
| Drop column | Data-loss | Two-step deploy; do not rely on rollback |
| Rename column | Yes | `renameColumn` in both directions |
| Change type (widen) | Mostly yes | Explicit reverse change; may truncate |
| Change type (narrow) | Risky | Pre-check max length; refuse if violations |
| Add index | Yes | `dropIndex` in `down()` |
| Add FK | Yes | `dropForeign` then `dropColumn` |
| Backfill data | Hand-write reverse | Store deltas in a temp table |

## Pattern: Reversible Backfill via Shadow Table

```php
public function up(): void
{
    // Snapshot prior state for rollback
    DB::statement('CREATE TABLE orders_currency_backfill_snapshot AS SELECT id, NULL AS prior_currency FROM orders WHERE 1=0');
    DB::statement('INSERT INTO orders_currency_backfill_snapshot SELECT id, currency FROM orders');

    DB::statement("UPDATE orders SET currency = 'USD' WHERE currency IS NULL");
}

public function down(): void
{
    DB::statement('UPDATE orders SET currency = s.prior_currency FROM orders_currency_backfill_snapshot s WHERE orders.id = s.id');
    DB::statement('DROP TABLE orders_currency_backfill_snapshot');
}
```

## Pattern: Irreversible Migration (Explicit)

When data loss is unavoidable, document it loudly and require human confirmation:

```php
public function down(): void
{
    throw new \RuntimeException(
        'Rollback not supported: this migration dropped column orders.legacy_status. '
        . 'To restore, recreate the column and reload from the snapshot at s3://backups/orders-pre-2026-05-18.sql.gz'
    );
}
```

## Verification Loop

```bash
php artisan migrate              # apply
php artisan migrate:rollback     # undo
php artisan migrate              # apply again
php artisan migrate:status       # all three steps green
```

If any step fails, fix the migration — do not ship.

## CI Gate

Add to the test suite a Pest test that runs the full migrate/rollback/migrate cycle:

```php
it('migrations apply and roll back cleanly', function () {
    Artisan::call('migrate:fresh');
    Artisan::call('migrate:rollback', ['--step' => 1]);
    Artisan::call('migrate');
    expect(Artisan::call('migrate:status'))->toBe(0);
});
```

## When NOT to Rollback in Production

- Migration has been live > 24 hours AND new data has accumulated in changed schema.
- Rollback `down()` would orphan FK references created since deploy.

In these cases, **forward-only** with a corrective migration is safer than rollback.
