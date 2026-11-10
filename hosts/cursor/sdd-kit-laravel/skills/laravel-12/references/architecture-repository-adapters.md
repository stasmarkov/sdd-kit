# Repository Pattern and Adapters

Detailed implementation of the Repository Port/Adapter pattern in Laravel.

## Repository Interface (Port)

Defined in the Domain layer. No framework dependencies.

```php
// Modules/Payment/Domain/Contracts/PaymentRepositoryInterface.php
namespace Modules\Payment\Domain\Contracts;

use Modules\Payment\Domain\Entities\Payment;

interface PaymentRepositoryInterface
{
    public function findById(string $id): ?Payment;

    public function findByOrderId(string $orderId): ?Payment;

    public function save(Payment $payment): void;

    public function nextIdentity(): string;
}
```

### Interface Design Guidelines

- Methods accept and return **domain objects only** (entities, value objects)
- No Eloquent models, no query builders in the signature
- `nextIdentity()` generates IDs before persistence (supports UUID strategies)
- Keep interfaces focused - one per aggregate root

## Eloquent Repository (Adapter)

Lives in Infrastructure layer. Translates between domain entities and Eloquent models.

```php
// Modules/Payment/Infrastructure/Persistence/EloquentPaymentRepository.php
namespace Modules\Payment\Infrastructure\Persistence;

use Modules\Payment\Domain\Contracts\PaymentRepositoryInterface;
use Modules\Payment\Domain\Entities\Payment;
use Illuminate\Support\Str;

final class EloquentPaymentRepository implements PaymentRepositoryInterface
{
    public function findById(string $id): ?Payment
    {
        $model = PaymentModel::find($id);

        if ($model === null) {
            return null;
        }

        return $this->toDomain($model);
    }

    public function save(Payment $payment): void
    {
        $model = PaymentModel::find($payment->id()) ?? new PaymentModel();

        $model->id = $payment->id();
        $model->order_id = $payment->orderId();
        $model->amount_cents = $payment->amount()->cents();
        $model->currency = $payment->amount()->currency();
        $model->status = $payment->status()->value;
        $model->completed_at = $payment->completedAt();

        $model->save();

        // Dispatch domain events after successful persistence
        foreach ($payment->pullDomainEvents() as $event) {
            event($event);
        }
    }

    public function nextIdentity(): string
    {
        return (string) Str::uuid();
    }

    private function toDomain(PaymentModel $model): Payment
    {
        return Payment::reconstitute(
            id: $model->id,
            orderId: $model->order_id,
            amount: Money::fromCents($model->amount_cents, $model->currency),
            status: PaymentStatus::from($model->status),
            createdAt: $model->created_at->toImmutable(),
            completedAt: $model->completed_at?->toImmutable(),
        );
    }
}
```

### Key Implementation Details

- **`toDomain()` mapper** reconstructs entity from persistence model
- **Domain events dispatched after `save()`** - ensures persistence succeeded first
- **Eloquent model is internal** - never exposed outside the repository
- **`final` class** - prevent inheritance; compose instead
- **Upsert pattern** in `save()` handles both create and update

## Service Container Binding

Wire ports to adapters via Laravel's service provider.

```php
// Modules/Payment/Providers/PaymentServiceProvider.php
namespace Modules\Payment\Providers;

use Illuminate\Support\ServiceProvider;

class PaymentServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->bind(
            PaymentRepositoryInterface::class,
            EloquentPaymentRepository::class
        );

        $this->app->bind(
            PaymentGatewayInterface::class,
            fn () => match (config('payment.gateway')) {
                'stripe' => new StripePaymentGateway(config('payment.stripe')),
                'paypal' => new PayPalPaymentGateway(config('payment.paypal')),
                default => throw new \InvalidArgumentException('Unknown payment gateway'),
            }
        );
    }
}
```

### Binding Strategies

- **Simple bind** for single-implementation ports (e.g., repository)
- **Factory with `match`** for multiple adapters selected by config
- **One provider per module** keeps bindings organized
- **Test overrides** via `$this->app->bind()` in test setup
