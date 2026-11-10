---
paths:
  - "database/migrations/**"
  - "**/Migrations/**"
  - "docs/schemas/**"
---

# Migrations

## Schema first

- Update the schema doc in `<docs/schemas/>` before you write the migration. The doc says why and the migration says how.
- Each migration does one logical change. Don't mix unrelated tables.

## Safety

- Never edit or delete a migration that has run in any shared environment. Add a new one instead.
- Run `php artisan migrate --pretend` and read the SQL before you call it done.
- Every `up()` needs a working `down()`. If a change truly can't be reversed, throw in `down()` with a clear message.
- Never run `migrate:fresh`, `migrate:reset`, or `db:wipe` outside the local or testing database.

## Large or live tables

Split a NOT NULL column on a populated table into separate releases:

1. Add the column as nullable.
2. Backfill in chunks with a queued job or command, not inside the migration.
3. Add the NOT NULL constraint in a later migration.

- Renaming or dropping a column the running code still reads breaks deploys. Use expand, then migrate, then contract.
- Add indexes for every foreign key and every column used in `where` or `orderBy` on hot paths.

## Conventions

```php
Schema::create('orders', function (Blueprint $table) {
    $table->uuid('id')->primary();
    $table->foreignUuid('user_id')->constrained()->cascadeOnDelete();
    $table->unsignedBigInteger('total_amount');   // minor units, see INV-01
    $table->string('status', 32)->index();
    $table->timestamps();
});
```

- Store money as an unsigned integer in minor units, never `float` or `double`.
- Store enum-like values as strings backed by a PHP enum. Avoid DB `enum` types, since changing them means altering the table.
- Create foreign keys in dependency order. The parent table's migration must run first.

## After the migration

Update the factory, model casts, DTOs, and Resources together (see the change-impact map in AGENTS.md).
For non-trivial changes, use the `laravel-migration-coordinator` skill.
