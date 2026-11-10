---
name: laravel-migration-coordinator
description: Plan, write, and verify safe Laravel migrations. Use when adding/altering DB schema, splitting NOT-NULL backfills, fixing foreign-key ordering, designing zero-downtime migrations, or auditing an existing migration before merge. Pairs with Pest 3 integration tests and `php artisan migrate --pretend` for evidence-based safety checks.
license: Apache-2.0
allowed-tools: Read, Write, Edit, Grep, Glob, Bash
metadata:
  category: "frameworks"
  framework: "laravel"
  framework-version: "12.x"
---

# Laravel Migration Coordinator

Reduces the chance that a migration breaks production by enforcing a small set of high-leverage checks: reversibility, foreign-key ordering, index coverage, type precision, backfill safety, and rollback verification.

## When to Use This Skill

- Authoring a new `database/migrations/*.php`.
- Reviewing a migration in a PR before merge.
- Splitting a single dangerous migration into safer steps (add-nullable → backfill → enforce).
- Verifying a migration end-to-end against a fresh test DB and rollback.

## Quick Reference

| Task | Pattern |
|------|---------|
| Add NOT NULL column to populated table | Split: add nullable → backfill (chunked) → enforce not null (separate migration) |
| Add foreign key | Index the FK column; ensure referenced table migrated first |
| Money column | Integer minor units (cents) plus a `currency` column — never `float` |
| Boolean flag | `boolean()->default(false)` — always nullable=false with default |
| String of unknown length | `text()`, not `string()` |
| Drop a column on prod-data table | Two-step: deprecate in code → drop in a later release |
| Verify safely | `scripts/check-migration.sh database/migrations/<file>.php` |

## When to Load References

| Task | Load |
|------|------|
| Resolving migration ordering conflicts | `references/conflicts.md` |
| Designing rollback strategy | `references/rollback-patterns.md` |
| Zero-downtime migration playbook | `references/zero-downtime.md` |

---

## Core Procedure

For every migration:

1. **Reversibility.** `down()` must reverse every operation in `up()`. If reverse is impossible (data loss), comment that explicitly and require approval.
2. **Pretend run.** Run `php artisan migrate --pretend` against a copy of production schema; review the SQL.
3. **Indexes.** Index every FK column; index any column used in common `where`/`join` clauses.
4. **Types.** Money → integer minor units plus a currency column (the `schema-first` money rule). IDs → `unsignedBigInteger` or `foreignId`. Timestamps → `timestampsTz`.
5. **Constraints.** Non-nullable columns require `default(...)` OR an in-migration backfill step.
6. **Backfill safety.** For tables > 100k rows, split add-nullable → backfill (chunked) → enforce-not-null into three migrations.
7. **Test cycle.** Fresh DB: `migrate` succeeds, `migrate:rollback` succeeds, `migrate` again succeeds.
8. **Eloquent sync.** Update `fillable`, `casts`, relations on the corresponding model in the same PR.

## Patterns

### Pattern: Add NOT NULL column to a populated table

**Use when:** new required field on a table with rows.

```php
// migration 1: add nullable column
Schema::table('orders', function (Blueprint $t) {
    $t->string('currency', 3)->nullable();
});

// migration 2 (separate file): backfill in chunks
Order::query()->whereNull('currency')->chunkById(500, function ($chunk) {
    $chunk->each(fn ($o) => $o->forceFill(['currency' => 'USD'])->save());
});

// migration 3 (separate file): enforce not null
Schema::table('orders', function (Blueprint $t) {
    $t->string('currency', 3)->nullable(false)->change();
});
```

### Pattern: Indexed foreign key with explicit ordering

```php
Schema::create('orders', function (Blueprint $t) {
    $t->id();
    $t->foreignId('customer_id')
        ->constrained('customers')
        ->cascadeOnUpdate()
        ->restrictOnDelete();
    $t->index('customer_id'); // explicit; foreignId already indexes, but be explicit for review
    $t->timestamps();
});
```

### Pattern: Money column

```php
// Integer minor units plus the currency they are in
$t->unsignedBigInteger('amount');   // cents
$t->char('currency', 3);            // ISO 4217
```

## Verification

Run the bundled script before declaring done:

```bash
bash scripts/check-migration.sh database/migrations/2026_05_18_120000_add_currency_to_orders.php
```

It performs: `migrate --pretend`, fresh-DB `migrate`, `migrate:rollback`, `migrate` again, and reports a summary.

## Common Pitfalls

- **`->dropColumn()` on prod data without backup**: data loss with no `down()` recovery. Two-release pattern.
- **`float` for money**: rounding errors compound. Use integer minor units plus a currency column.
- **Adding NOT NULL with no default on populated table**: fails in production where local dev passes (different row counts).
- **Adding FK before referenced table exists**: rollback re-runs in different order. Verify with `migrate:rollback` + `migrate`.
- **Migration that touches > 100k rows synchronously**: locks the table. Use chunked backfill in a separate migration.

## Related Skills

- **schema-first**: design the schema before writing the migration.
- **dto-first**: keep service-layer DTOs in sync with column changes.
- **pest-3**: write feature tests against the new schema.
