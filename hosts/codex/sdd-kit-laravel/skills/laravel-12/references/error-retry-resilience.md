# Retry & Resilience Patterns

## Retry with Exponential Backoff

Use when external services may have transient failures.

```php
namespace App\Support;

final class Retry
{
    public static function withBackoff(
        callable $operation,
        int $maxAttempts = 3,
        int $baseDelayMs = 100,
        array $retryableExceptions = [\Exception::class],
    ): mixed {
        $attempt = 0;
        $lastException = null;

        while ($attempt < $maxAttempts) {
            try {
                return $operation();
            } catch (\Throwable $e) {
                if (!self::isRetryable($e, $retryableExceptions)) {
                    throw $e;
                }

                $lastException = $e;
                $attempt++;

                if ($attempt < $maxAttempts) {
                    $delay = $baseDelayMs * (2 ** ($attempt - 1));
                    $jitter = random_int(0, (int) ($delay * 0.1));
                    usleep(($delay + $jitter) * 1000);
                }
            }
        }

        throw $lastException;
    }

    private static function isRetryable(\Throwable $e, array $retryable): bool
    {
        foreach ($retryable as $class) {
            if ($e instanceof $class) {
                return true;
            }
        }
        return false;
    }
}

// Usage
$result = Retry::withBackoff(
    operation: fn () => $this->stripeClient->charges->create($params),
    maxAttempts: 3,
    baseDelayMs: 200,
    retryableExceptions: [ApiConnectionException::class, RateLimitException::class],
);
```