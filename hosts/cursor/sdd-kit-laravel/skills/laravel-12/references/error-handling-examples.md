# Error Handling Examples

Framework code examples moved out of the core skill.

### Pattern 1: Domain Exception Hierarchy

```php
namespace App\Exceptions\Domain;

abstract class DomainException extends \Exception
{
    abstract public function errorCode(): string;

    public function context(): array
    {
        return [];
    }
}

// Specific domain exception
final class InsufficientFundsException extends DomainException
{
    public function __construct(
        private readonly string $accountId,
        private readonly int $required,
        private readonly int $available,
    ) {
        parent::__construct("Insufficient funds in account {$accountId}");
    }

    public function errorCode(): string
    {
        return 'PAYMENT.INSUFFICIENT_FUNDS';
    }

    public function context(): array
    {
        return [
            'account_id' => $this->accountId,
            'required_cents' => $this->required,
            'available_cents' => $this->available,
            'shortfall_cents' => $this->required - $this->available,
        ];
    }
}
```

### Pattern 2: Exception Handler with Consistent Responses

```php
namespace App\Exceptions;

use App\Exceptions\Domain\DomainException;

class Handler extends ExceptionHandler
{
    public function render($request, \Throwable $e)
    {
        if ($request->expectsJson()) {
            return $this->renderJsonError($e);
        }
        return parent::render($request, $e);
    }

    private function renderJsonError(\Throwable $e): JsonResponse
    {
        return match (true) {
            $e instanceof ValidationException => $this->validationError($e),
            $e instanceof DomainException => $this->domainError($e),
            $e instanceof AuthenticationException => $this->authError($e),
            $e instanceof ModelNotFoundException => $this->notFoundError($e),
            default => $this->internalError($e),
        };
    }

    private function domainError(DomainException $e): JsonResponse
    {
        $status = match (true) {
            str_contains($e->errorCode(), 'NOT_FOUND') => 404,
            str_contains($e->errorCode(), 'ALREADY_') => 409,
            str_contains($e->errorCode(), 'UNAUTHORIZED') => 401,
            default => 422,
        };

        return response()->json([
            'success' => false,
            'status' => $status,
            'error_code' => $e->errorCode(),
            'message' => $e->getMessage(),
            'context' => $e->context(),
        ], $status);
    }

    private function internalError(\Throwable $e): JsonResponse
    {
        Log::error('Internal error', [
            'exception' => get_class($e),
            'message' => $e->getMessage(),
            'trace' => $e->getTraceAsString(),
        ]);

        $response = [
            'success' => false,
            'status' => 500,
            'error_code' => 'INTERNAL_ERROR',
            'message' => 'An unexpected error occurred.',
        ];

        if (config('app.debug')) {
            $response['debug'] = [
                'exception' => get_class($e),
                'message' => $e->getMessage(),
                'file' => $e->getFile(),
                'line' => $e->getLine(),
            ];
        }

        return response()->json($response, 500);
    }
}
```
