# Application Services (Use Cases)

Detailed implementation of the Application Service / Command Handler pattern.

## Command + Handler Pattern

Commands are simple DTOs representing intent. Handlers orchestrate domain logic.

```php
// Modules/Payment/Application/Commands/CreatePaymentCommand.php
namespace Modules\Payment\Application\Commands;

final readonly class CreatePaymentCommand
{
    public function __construct(
        public string $orderId,
        public int $amountCents,
        public string $currency = 'USD',
    ) {}
}
```

```php
// Modules/Payment/Application/Commands/CreatePaymentHandler.php
namespace Modules\Payment\Application\Commands;

use Modules\Payment\Domain\Contracts\PaymentRepositoryInterface;
use Modules\Payment\Domain\Contracts\PaymentGatewayInterface;
use Modules\Payment\Domain\Entities\Payment;
use Modules\Payment\Domain\ValueObjects\Money;

final readonly class CreatePaymentHandler
{
    public function __construct(
        private PaymentRepositoryInterface $repository,
        private PaymentGatewayInterface $gateway,
    ) {}

    public function handle(CreatePaymentCommand $command): PaymentDTO
    {
        // Create domain entity
        $payment = Payment::create(
            id: $this->repository->nextIdentity(),
            orderId: $command->orderId,
            amount: Money::fromCents($command->amountCents, $command->currency),
        );

        // Process through gateway
        $result = $this->gateway->charge($payment);

        if ($result->successful()) {
            $payment->complete();
        } else {
            $payment->fail($result->failureReason());
        }

        // Persist (also dispatches domain events)
        $this->repository->save($payment);

        // Return DTO - never expose domain entity
        return PaymentDTO::fromEntity($payment);
    }
}
```

### Handler Design Principles

- **One handler per use case** - single responsibility
- **Constructor injection** of ports (interfaces), not concrete implementations
- **`readonly` class** - handlers are stateless
- **Returns DTO, not entity** - domain objects stay within the application boundary
- **Orchestrates, doesn't implement** - delegates business rules to domain layer

## Query Handler Pattern

Queries follow the same structure for read operations.

```php
// Modules/Payment/Application/Queries/GetPaymentHandler.php
namespace Modules\Payment\Application\Queries;

final readonly class GetPaymentHandler
{
    public function __construct(
        private PaymentRepositoryInterface $repository,
    ) {}

    public function handle(GetPaymentQuery $query): ?PaymentDTO
    {
        $payment = $this->repository->findById($query->paymentId);

        if ($payment === null) {
            return null;
        }

        return PaymentDTO::fromEntity($payment);
    }
}
```

### CQRS Considerations

- Separate Command (write) and Query (read) handlers
- Queries can bypass the domain layer for performance (read models)
- Commands always go through domain entities to enforce invariants
- Consider dedicated read models for complex query requirements

## Controller Integration

Controllers are thin HTTP adapters that delegate to handlers.

```php
// Modules/Payment/Application/Http/Controllers/CreatePaymentController.php
namespace Modules\Payment\Application\Http\Controllers;

final class CreatePaymentController
{
    public function __invoke(
        CreatePaymentRequest $request,
        CreatePaymentHandler $handler,
    ): JsonResponse {
        $dto = $handler->handle(new CreatePaymentCommand(
            orderId: $request->validated('order_id'),
            amountCents: $request->validated('amount_cents'),
            currency: $request->validated('currency', 'USD'),
        ));

        return response()->json(
            PaymentResource::fromDTO($dto),
            Response::HTTP_CREATED,
        );
    }
}
```
