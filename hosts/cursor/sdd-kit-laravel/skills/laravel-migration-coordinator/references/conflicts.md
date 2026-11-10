# Resolving Migration Conflicts

## Timestamp Collisions on Shared Branches

Two developers land migrations with the same minute-precision timestamp. Last-writer-wins breaks deterministic ordering.

**Detection**
```bash
ls database/migrations | awk -F_ '{print $1"_"$2"_"$3"_"$4}' | sort | uniq -d
```

**Resolution**
1. Identify the migration that landed second on `main`.
2. Bump its timestamp prefix to a later second-precision value.
3. Rename the file; run `php artisan migrate:fresh --seed` locally to confirm ordering.
4. If the migration ran in any environment already, do **not** rename — write a new migration that compensates.

## Foreign-Key Ordering Violations

A new migration references a table that hasn't been created yet in this batch.

**Detection**
```bash
php artisan migrate --pretend 2>&1 | grep -i "errno: 150\|foreign key constraint"
```

**Resolution**
- Move the referenced-table migration earlier in the sort order (rename with earlier timestamp).
- OR add the foreign key in a follow-up migration that runs after the referenced table is in place.

## Duplicate Column / Index

Two PRs each add the same column or index. The second to merge fails on a fresh `migrate`.

**Detection**
```bash
php artisan migrate:fresh --pretend | grep -i "duplicate column\|duplicate key"
```

**Resolution**
- Squash into one migration if not yet shipped.
- If shipped, the later migration must be a no-op or use `Schema::hasColumn(...)` / `hasIndex(...)` guards.

## Data Backfill Conflicts Between Migrations

Migration A creates column with NULL; migration B in the same release tries to backfill, but a third migration C (also in release) modifies the same rows.

**Resolution**
- Sequence in **separate releases** when possible.
- If they must ship together, name them with clearly-ordered timestamps and add a Pest test that runs the full sequence against a representative dataset.

## Soft-Delete Reordering

Adding `deletedAt` to a model with existing queries that don't account for it. Old queries silently return soft-deleted rows.

**Detection**
- `grep -rn "->withoutTrashed\|->onlyTrashed\|->withTrashed" app/`
- Audit every query against the affected model.

**Resolution**
- Add the migration as part of a PR that also updates all affected queries.
- Default-scope the model to exclude soft-deleted rows immediately.

## Index Add on Locked Table

`->index()` on a large table acquires a lock for the duration of the build.

**Resolution**
- For MySQL: use `ALTER TABLE ... ALGORITHM=INPLACE, LOCK=NONE`.
  ```php
  DB::statement('ALTER TABLE orders ADD INDEX idx_orders_customer_id (customer_id), ALGORITHM=INPLACE, LOCK=NONE');
  ```
- For Postgres: use `CREATE INDEX CONCURRENTLY` (Laravel: raw SQL, not in a transaction).
  ```php
  Schema::withoutForeignKeyConstraints(fn () =>
      DB::statement('CREATE INDEX CONCURRENTLY idx_orders_customer_id ON orders (customer_id)')
  );
  ```

## Two Migrations Touching the Same Column

Migration A renames `status` → `state`; migration B in same release adds `default('pending')` to `status`.

**Resolution**
- Rebase B on top of A so B operates on `state`, not `status`.
- Update Eloquent model in one place.
