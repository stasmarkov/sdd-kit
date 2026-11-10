# Result Type Pattern

Use when errors are expected outcomes, not exceptional cases.

```php
namespace App\Support;

/**
 * @template T
 * @template E
 */
final readonly class Result
{
    private function __construct(
        private bool $success,
        private mixed $value,
        private mixed $error,
    ) {}

    /** @return Result<V, never> */
    public static function success(mixed $value): self
    {
        return new self(true, $value, null);
    }

    /** @return Result<never, F> */
    public static function failure(mixed $error): self
    {
        return new self(false, null, $error);
    }

    public function isSuccess(): bool { return $this->success; }
    public function isFailure(): bool { return !$this->success; }

    public function value(): mixed
    {
        if (!$this->success) {
            throw new \RuntimeException('Cannot get value from failed result');
        }
        return $this->value;
    }

    public function error(): mixed
    {
        if ($this->success) {
            throw new \RuntimeException('Cannot get error from successful result');
        }
        return $this->error;
    }

    public function map(callable $fn): self
    {
        return $this->success ? self::success($fn($this->value)) : $this;
    }

    public function valueOr(mixed $default): mixed
    {
        return $this->success ? $this->value : $default;
    }
}
```

## Usage in Service

```php
class PaymentService
{
    public function processPayment(PaymentDTO $dto): Result
    {
        $account = $this->accounts->find($dto->accountId);
        if ($account === null) {
            return Result::failure(PaymentError::AccountNotFound);
        }

        if ($account->balance < $dto->amount) {
            return Result::failure(PaymentError::InsufficientFunds);
        }

        try {
            $payment = $this->gateway->charge($dto);
            return Result::success($payment);
        } catch (GatewayException $e) {
            return Result::failure(PaymentError::GatewayError);
        }
    }
}
```

## Usage in Controller

```php
public function __invoke(Request $request): JsonResponse
{
    $result = $this->paymentService->processPayment($dto);

    if ($result->isFailure()) {
        return $this->error(
            message: $result->error()->message(),
            status: $result->error()->httpStatus(),
        );
    }

    return $this->success($result->value());
}
```