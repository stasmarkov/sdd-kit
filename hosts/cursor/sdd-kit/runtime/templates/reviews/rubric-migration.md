---
name: rubric-migration
description: Outcomes rubric for database migrations (schema changes, indices, backfill, rollback).
domain: migration
threshold: 80
---

# Migration Rubric

## Critical (any fail → BLOCKED)

- `mig.safety.reversible`: `down()` method exists and reverses every change in `up()`. Evidence: file contents.
- `mig.safety.pretend`: The migration tool's dry-run or SQL-preview mode produces a valid SQL plan with no syntax errors. Evidence: command output.
- `mig.safety.no-destructive`: No `dropColumn` or `dropTable` on tables with production data without an explicit data-preservation step (backup, copy, or comment naming an approved ticket).
- `mig.fk.order`: Foreign keys defined after referenced tables; no ordering deadlocks.

## Important (≥ threshold% pass required)

- `mig.naming.timestamp`: Filename uses `YYYY_MM_DD_HHMMSS_` prefix and descriptive snake_case name.
- `mig.naming.semantic`: Migration name reflects the change (`add_foo_to_bars_table`, not `update_bars`).
- `mig.indexes.fks`: All foreign-key columns indexed.
- `mig.indexes.lookup`: Columns used in common `where`/`join` clauses are indexed.
- `mig.types.precise`: Money uses `decimal(n,2)` or integer cents — never `float`. Strings use bounded `string($limit)` or `text()`, not unbounded varchar.
- `mig.constraints.not-null`: Non-nullable columns have an explicit default OR a backfill step in the same migration.
- `mig.backfill.split-when-large`: When adding NOT NULL on a populated table, the migration either uses a default OR splits into add-nullable → backfill → enforce-not-null (separate migrations).
- `mig.tests.runs`: Running the pending migrations succeeds on a fresh test DB. Evidence: command output.
- `mig.tests.rollback`: Rolling the migration back succeeds and returns DB to prior state.
- `mig.model.updated`: Corresponding ORM model attributes, casts and relations updated to match schema.

## Nice-to-have (informational)

- `mig.perf.batched-backfill`: Large backfills chunked (`chunkById`) to avoid lock contention.
- `mig.zero-downtime`: For production tables >100k rows, migration is designed for zero-downtime (no `ALTER` that rewrites the table).
- `mig.docs.note`: Comment explains non-obvious decisions (precision, index choice).
