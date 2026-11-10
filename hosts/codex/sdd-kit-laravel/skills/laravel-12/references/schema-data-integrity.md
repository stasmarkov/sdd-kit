# Data Integrity Patterns

Schema patterns for ownership, append-only records, auditing, and query-driven indexing. Each pattern shows the schema decision first, then the Laravel migration and model that enforce it.

## Contents
- Naming conventions
- Polymorphic ownership
- Immutable ledger
- Audit trail
- Query-driven indexing

## Naming Conventions

| Object | Convention | Example |
|--------|------------|---------|
| Table | `snake_case`, plural, optional domain prefix | `wallet_transactions` |
| Column | `snake_case`; booleans `is_`/`has_`; timestamps `_at` | `is_verified`, `expires_at` |
| Primary key | `id` (UUID for business entities) | `id` |
| Foreign key | `{singular_table}_id` | `merchant_id` |
| Index | `idx_{table}_{columns}` | `idx_wallets_owner` |
| Unique | `uk_{table}_{columns}` | `uk_users_email` |

## Polymorphic Ownership

Use when one entity (a wallet, an address) can belong to several owner types. Prefer a real foreign key when only one owner type exists; polymorphic columns cannot carry FK constraints.

```php
Schema::create('wallets', function (Blueprint $table) {
    $table->uuid('id')->primary();
    $table->uuidMorphs('owner');            // owner_type + owner_id + composite index
    $table->timestamps();

    $table->unique(['owner_type', 'owner_id']); // one wallet per owner
});
```

Register a morph map (`Relation::enforceMorphMap([...])`) so `owner_type` stores stable aliases rather than class names.

## Immutable Ledger

Financial and audit records are append-only: no `updated_at`, no soft deletes, corrections are new compensating rows.

```php
Schema::create('wallet_transactions', function (Blueprint $table) {
    $table->uuid('id')->primary();
    $table->foreignUuid('sender_wallet_id')->nullable()->constrained('wallets')->restrictOnDelete();
    $table->foreignUuid('recipient_wallet_id')->nullable()->constrained('wallets')->restrictOnDelete();
    $table->unsignedBigInteger('amount');   // minor units, never float
    $table->string('type', 20);             // backed enum in the model
    $table->uuid('reference_id')->nullable()->index();
    $table->json('metadata')->nullable();
    $table->timestamp('created_at')->useCurrent();

    $table->index(['sender_wallet_id', 'created_at']);
    $table->index(['recipient_wallet_id', 'created_at']);
});

// MySQL 8.0.16+ / PostgreSQL: enforce invariants in the database, not only in PHP.
DB::statement('ALTER TABLE wallet_transactions ADD CONSTRAINT chk_amount_positive CHECK (amount > 0)');
DB::statement('ALTER TABLE wallet_transactions ADD CONSTRAINT chk_wallet_present
    CHECK (sender_wallet_id IS NOT NULL OR recipient_wallet_id IS NOT NULL)');
```

```php
final class WalletTransaction extends Model
{
    use HasUuids;

    public const UPDATED_AT = null;

    protected $fillable = ['sender_wallet_id', 'recipient_wallet_id', 'amount', 'type', 'reference_id', 'metadata'];

    protected function casts(): array
    {
        return ['type' => TransactionTypeEnum::class, 'metadata' => 'array', 'amount' => 'integer'];
    }

    protected static function booted(): void
    {
        static::updating(fn () => throw new LogicException('Ledger entries are immutable.'));
        static::deleting(fn () => throw new LogicException('Ledger entries cannot be deleted.'));
    }
}
```

Model guards do not stop query-builder writes (`DB::table(...)->update()`); for strict guarantees revoke `UPDATE`/`DELETE` on the table from the application DB user or add a trigger.

Balances are derived (sum of credits minus debits) or kept in a snapshot table updated in the same transaction with a row lock; never stored as a mutable column without a ledger behind it.

## Audit Trail

```php
Schema::create('audit_operations', function (Blueprint $table) {
    $table->uuid('id')->primary();
    $table->string('operation_type', 50);
    $table->uuidMorphs('entity');
    $table->foreignUuid('user_id')->nullable()->constrained()->nullOnDelete();
    $table->json('old_values')->nullable();
    $table->json('new_values')->nullable();
    $table->string('ip_address', 45)->nullable();
    $table->timestamp('created_at')->useCurrent();

    $table->index(['user_id', 'created_at']);
    $table->index(['operation_type', 'created_at']);
});
```

Write audit rows from model observers or domain event listeners inside the same transaction as the change. Exclude secrets and personal data the retention policy does not allow.

## Query-Driven Indexing

Design indexes from the queries the application actually runs, not from columns.

| Query shape | Index |
|-------------|-------|
| `WHERE a = ? ORDER BY created_at` | `(a, created_at)` |
| `WHERE status = ? AND expires_at < ?` | `(status, expires_at)` (equality first, range last) |
| Sum/aggregate over a filtered set | Covering index including the aggregated column, e.g. `(wallet_id, created_at, amount)` |
| `WHERE a = ? OR b = ?` | Separate indexes on `a` and `b`, or rewrite as `UNION ALL` |
| Uniqueness rule | Unique index, never an application-only check |

Rules:
- Every foreign key column is indexed (Laravel's `constrained()` does not add one on PostgreSQL).
- Low-cardinality columns (booleans, small enums) only lead an index when combined with a selective column.
- Verify with `EXPLAIN` before and after; see `laravel-12` → `references/performance-tuning.md` for query analysis.
- Adding an index to a large table is a migration risk; follow `laravel-migration-coordinator` → `references/zero-downtime.md`.
