# Zero-Downtime Migrations

For tables > 100k rows in production, every schema change must avoid table-level locks. The rules below assume MySQL 8 or Postgres 14+.

## The Five-Step Pattern for Risky Schema Changes

For renames, type changes, NOT NULL adds, or column splits:

1. **Add new column nullable** — fast, no lock contention.
2. **Backfill in chunks** with `chunkById(500)` and small sleeps between batches. Run as a separate migration or a queued job.
3. **Dual-write in application code** — write to both old and new columns; read from new with fallback to old.
4. **Switch reads to new column** in code (separate deploy).
5. **Drop old column** in a later release after a soak period (≥ 1 week recommended).

## Specific Hazards

### `ALTER TABLE ... ADD COLUMN NOT NULL`

- MySQL: instant if `DEFAULT` is supplied and the table is on InnoDB ≥ 5.6 with `ALGORITHM=INSTANT`. Without default — full table copy.
- Postgres: ≥ 11 is fast if default is a constant; expression defaults rewrite the table.

**Safe pattern:** add nullable, backfill, enforce.

### `ADD INDEX`

- MySQL: `ALGORITHM=INPLACE, LOCK=NONE` is fast.
- Postgres: `CREATE INDEX CONCURRENTLY` — cannot run in a transaction; Laravel `Schema::withoutForeignKeyConstraints` + `DB::statement` is the workaround.

### `DROP COLUMN`

- MySQL: full table copy on InnoDB < 8.0.
- Postgres: instant metadata operation; reclaim space later with `VACUUM FULL` during maintenance.

### Renaming a column

Avoid in production. Use add-new + dual-write + drop-old instead.

## Application-Level Coordination

Schema migrations and application deploys must be ordered so that no version of the code is incompatible with the live schema. The safe ordering for an additive change:

1. Migration deployed (add new column nullable).
2. Code deployed (dual-write to old and new).
3. Backfill job runs.
4. Code deployed (read from new, write to new only).
5. Migration deployed (drop old column).

If steps are out of order, the rolling deploy may serve a request that writes to a column that no longer exists or expects a column not yet present.

## Tooling

- `pt-online-schema-change` (Percona) for MySQL online changes.
- `gh-ost` (GitHub) for triggerless MySQL migrations.
- Postgres: native `CONCURRENTLY` index ops + careful `ALTER TABLE` ordering.

These are not invoked from migrations; they replace the migration's `up()` SQL with an externally-orchestrated equivalent. Document explicitly when you do this so reviewers know the migration file is metadata-only.
