# Laravel Performance Tuning

Patterns for diagnosing and fixing backend performance problems. Measure first; apply a pattern only when profiling shows it addresses the bottleneck.

## Query Analysis

```sql
EXPLAIN ANALYZE
SELECT * FROM transactions
WHERE sender_wallet_id = ? ORDER BY created_at DESC LIMIT 50;
```

Look for full table scans (`type: ALL` / `Seq Scan`), filesort on large sets, and row estimates far above the result size.

```php
// Log slow queries during local profiling
DB::listen(function ($query) {
    if ($query->time > 50) {
        Log::warning('Slow query', ['sql' => $query->sql, 'ms' => $query->time]);
    }
});

// Fail fast on N+1 in non-production environments
Model::preventLazyLoading(! app()->isProduction());
```

## Indexing

```sql
-- Composite index ordered: equality columns first, then range/sort column
CREATE INDEX idx_transactions_sender_created ON transactions (sender_wallet_id, created_at);

-- Partial index for queue-like tables (PostgreSQL)
CREATE INDEX idx_webhook_retry ON webhook_deliveries (next_retry_at)
WHERE status IN ('pending', 'failed');
```

Every foreign key and every column used in `WHERE` / `ORDER BY` on hot paths needs an index; verify with `EXPLAIN` after adding it.

## Caching

```php
public function getBalance(string $walletId): int
{
    return Cache::tags(["wallet:{$walletId}"])
        ->remember("wallet_balance:{$walletId}", 3600, fn () => $this->repository->calculateBalance($walletId));
}

public function invalidateBalance(string $walletId): void
{
    Cache::tags(["wallet:{$walletId}"])->flush();
}
```

- Cache tags require Redis or Memcached.
- Invalidate on write (in the same service method or via a model event), never rely on TTL alone for financial data.
- Target cache hit rate above 90% for cached read paths.

## Queues

```php
// config/queue.php: separate connections per priority
'webhook_high' => ['driver' => 'redis', 'queue' => 'webhook_high', 'retry_after' => 90, 'block_for' => 5],

class DeliverWebhookJob implements ShouldQueue, ShouldBeUnique
{
    use Queueable;

    public int $timeout = 30;
    public int $tries = 5;
    public array $backoff = [60, 300, 900];
}
```

`retry_after` must exceed the job `timeout`, or jobs run twice.

## Memory

```php
// Stream large result sets instead of loading them
Transaction::where('status', 'pending')->lazyById(500)->each(fn ($t) => $this->process($t));

// Batch writes inside chunked transactions
$records->chunk(100)->each(fn ($chunk) => DB::transaction(fn () => $chunk->each->save()));
```

## Batch Validation

Replace per-row lookups with one query, then validate in memory:

```php
$balances = $this->walletRepository->getBalancesForWallets(
    collect($transactions)->pluck('sender_wallet_id')->unique()
);
```

## Rate Limiting

```php
RateLimiter::for('api', function (Request $request) {
    $limit = match ($request->user()?->tier) {
        'enterprise' => 10000,
        'business' => 5000,
        default => 1000,
    };

    return Limit::perMinute($limit)->by($request->user()?->id ?: $request->ip());
});
```

## Read Replicas

```php
'mysql' => [
    'read' => ['host' => [env('DB_READ_HOST_1'), env('DB_READ_HOST_2')]],
    'write' => ['host' => [env('DB_WRITE_HOST')]],
    'sticky' => true, // read-your-writes within a request
    // ...
],
```

## Load Testing

```bash
ab -n 10000 -c 100 https://api.example.com/v1/wallets/balance
wrk -t12 -c400 -d30s https://api.example.com/v1/payment-intents
k6 run load-test.js
```

Run benchmarks against a production-like environment with realistic data volume; local results on an empty database are not meaningful.
