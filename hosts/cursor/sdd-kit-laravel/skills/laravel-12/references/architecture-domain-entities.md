# Domain Entities and Value Objects

Detailed implementation examples for DDD building blocks in Laravel.

## Domain Entity

Entities have identity, encapsulate behavior, and record domain events.

```php
// Modules/Payment/Domain/Entities/Payment.php
namespace Modules\Payment\Domain\Entities;

use Modules\Payment\Domain\ValueObjects\Money;
use Modules\Payment\Domain\ValueObjects\PaymentStatus;
use Modules\Payment\Domain\Events\PaymentCompleted;
use Modules\Payment\Domain\Exceptions\PaymentAlreadyCompletedException;

final class Payment
{
    private array $domainEvents = [];

    private function __construct(
        private readonly string $id,
        private readonly string $orderId,
        private Money $amount,
        private PaymentStatus $status,
        private readonly \DateTimeImmutable $createdAt,
        private ?\DateTimeImmutable $completedAt = null,
    ) {}

    public static function create(
        string $id,
        string $orderId,
        Money $amount,
    ): self {
        return new self(
            id: $id,
            orderId: $orderId,
            amount: $amount,
            status: PaymentStatus::Pending,
            createdAt: new \DateTimeImmutable(),
        );
    }

    public function complete(): void
    {
        if ($this->status->isCompleted()) {
            throw new PaymentAlreadyCompletedException($this->id);
        }

        $this->status = PaymentStatus::Completed;
        $this->completedAt = new \DateTimeImmutable();

        $this->recordEvent(new PaymentCompleted(
            paymentId: $this->id,
            orderId: $this->orderId,
            amount: $this->amount,
            completedAt: $this->completedAt,
        ));
    }

    public function fail(string $reason): void
    {
        $this->status = PaymentStatus::Failed;
        $this->recordEvent(new PaymentFailed($this->id, $reason));
    }

    private function recordEvent(object $event): void
    {
        $this->domainEvents[] = $event;
    }

    public function pullDomainEvents(): array
    {
        $events = $this->domainEvents;
        $this->domainEvents = [];
        return $events;
    }

    public function id(): string { return $this->id; }
    public function amount(): Money { return $this->amount; }
    public function status(): PaymentStatus { return $this->status; }
}
```

### Key Entity Principles

- **Private constructor** with named static factory (`create`, `reconstitute`)
- **Behavior methods** (`complete`, `fail`) enforce invariants before state change
- **Domain events** recorded internally via `recordEvent()`, flushed by infrastructure
- **No framework dependencies** - pure PHP, no Eloquent traits
- **Immutable identity** - `$id` is `readonly`

## Value Object

Value Objects are immutable, compared by value, and self-validating.

```php
// Modules/Payment/Domain/ValueObjects/Money.php
namespace Modules\Payment\Domain\ValueObjects;

final readonly class Money
{
    private function __construct(
        private int $amountInCents,
        private string $currency,
    ) {
        if ($amountInCents < 0) {
            throw new \InvalidArgumentException('Amount cannot be negative');
        }
    }

    public static function fromCents(int $cents, string $currency = 'USD'): self
    {
        return new self($cents, strtoupper($currency));
    }

    public static function fromDollars(float $dollars, string $currency = 'USD'): self
    {
        return new self((int) round($dollars * 100), strtoupper($currency));
    }

    public function add(self $other): self
    {
        $this->ensureSameCurrency($other);
        return new self($this->amountInCents + $other->amountInCents, $this->currency);
    }

    public function subtract(self $other): self
    {
        $this->ensureSameCurrency($other);
        return new self($this->amountInCents - $other->amountInCents, $this->currency);
    }

    public function equals(self $other): bool
    {
        return $this->amountInCents === $other->amountInCents
            && $this->currency === $other->currency;
    }

    public function cents(): int { return $this->amountInCents; }
    public function currency(): string { return $this->currency; }
    public function formatted(): string
    {
        return number_format($this->amountInCents / 100, 2) . ' ' . $this->currency;
    }

    private function ensureSameCurrency(self $other): void
    {
        if ($this->currency !== $other->currency) {
            throw new \InvalidArgumentException('Cannot operate on different currencies');
        }
    }
}
```

### Key Value Object Principles

- **`readonly` class** - all properties immutable after construction
- **Private constructor** with named static factories for clarity
- **Self-validating** - constructor rejects invalid state
- **Operations return new instances** (`add`, `subtract`) - never mutate
- **Equality by value** - explicit `equals()` method
- **No identity** - no ID field, no database concern
