---
name: migrate-db
description: Create, modify, roll back, and inspect Laravel database migrations schema-first — update the schema doc in docs/schemas/ before generating the migration, check it with the laravel-migration-coordinator safety rules, then run and report migration status. Use when adding or altering tables, rolling back a batch, or checking which migrations are pending. Runs migrations, so it is user-invoked only.
argument-hint: "--create=[table] | --modify=[table] | --rollback [--step=N] | --status | --fresh-seed"
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
disable-model-invocation: true
metadata:
  version: "1.2"
  subagents: "database-designer"
  last_verified: "2026-10-19"
  next_review: "2027-01-19"
---

# /migrate-db

Create and run database migrations, schema-first. Two skills own the rules this one applies:
- **`schema-first`**: the `docs/schemas/{table}.md` format (Purpose, Fields, Relationships, Indexes, Constraints, Enums), written before the migration.
- **`laravel-migration-coordinator`**: migration safety (foreign-key ordering, split backfills for NOT NULL columns on existing tables, zero-downtime changes, the `--pretend` review, the rollback cycle).

## Usage

```bash
/migrate-db --create=orders                    # new table
/migrate-db --modify=users --add=phone_number  # alter a table
/migrate-db --status                           # pending vs applied
/migrate-db --rollback                         # last batch
/migrate-db --rollback --step=3
/migrate-db --fresh-seed                       # local and test databases only
```

If the project runs in DDEV (`.ddev/` exists), check that it is running: `ddev describe -j` must report `raw.status` `running`. If it does not, stop and ask the user to run `ddev start`; do not start it yourself. While it is running, prefix artisan commands with `ddev exec`.

The status, run and fresh commands are the `migrations` block of the laravel stack manifest (`migrate:status`, `migrate`, `migrate:fresh --seed`), found with the stack-data recipe in the `verification-gates` skill. A manifest that is not trusted is not used: `not run (untrusted manifest). Fix: run /stack-trust.`

## Workflow

### 1. Schema doc first

Create or update `docs/schemas/{table}.md` in the `schema-first` format. For a new or non-trivial design, use `/design-schema`, which delegates to the `database-designer` agent. The migration implements the doc, never the other way round.

### 2. Create the migration

```bash
php artisan make:migration create_orders_table
php artisan make:migration add_phone_number_to_users_table
```

Naming: `create_[table]_table`, `add_[column]_to_[table]_table`, `modify_[column]_in_[table]_table`, `drop_[column]_from_[table]_table`.

Write the body from the schema doc. Column types, keys, money columns (integer minor units plus a currency column), foreign keys and indexes follow `schema-first` and the project's `.claude/rules/migrations.md`.

### 3. Safety check (before running anything)

Apply the `laravel-migration-coordinator` checklist to every new migration:
- `php artisan migrate --pretend` and read the SQL
- foreign keys reference tables created earlier in the order
- a NOT NULL column on an existing table is split: add nullable → backfill → enforce
- destructive changes (drop, rename, type change) have a rollback path and a data plan
- `down()` reverses `up()`; on a disposable database, run `migrate` → `migrate:rollback` → `migrate` and confirm it is clean

A failing check stops here.

### 4. Run

```bash
php artisan migrate                      # pending migrations
php artisan migrate:status
php artisan migrate:rollback             # last batch
php artisan migrate:rollback --step=3
php artisan migrate:fresh --seed         # destroys data: local or test databases only, confirm first
```

Never run `migrate:fresh` or a rollback against a database that may hold real data without asking the user.

## Output Format

```
Migration status

Pending
  2026_10_19_100000_create_orders_table.php
Applied this run
  2026_10_19_100000_create_orders_table.php   (pretend reviewed, rollback cycle OK)

Schema doc: docs/schemas/orders.md (updated)
Tables: orders (created)
Indexes: orders_user_id_status_index, orders_status_created_at_index
Foreign keys: orders.user_id -> users.id (cascade on delete)
```

**Source Verification**: Follow the `source-verification` skill.
