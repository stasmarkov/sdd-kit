# Domain Events Pattern

## Base Domain Event

```php
namespace App\Domain\Events;

use Carbon\Carbon;
use Illuminate\Support\Str;

abstract class DomainEvent
{
    public readonly string $eventId;
    public readonly Carbon $occurredAt;
    public readonly ?string $correlationId;

    public function __construct(?string $correlationId = null)
    {
        $this->eventId = Str::uuid()->toString();
        $this->occurredAt = now();
        $this->correlationId = $correlationId;
    }

    abstract public function getAggregateId(): string;
    abstract public function getAggregateName(): string;
}
```

## Domain Event Implementation

```php
namespace App\Domain\Events;

use App\DTOs\WalletTransactionDTO;

class WalletTransactionCreatedEvent extends DomainEvent
{
    public function __construct(
        public readonly WalletTransactionDTO $transactionDTO,
        ?string $correlationId = null
    ) {
        parent::__construct($correlationId);
    }

    public function getAggregateId(): string
    {
        return $this->transactionDTO->wallet_id;
    }

    public function getAggregateName(): string
    {
        return 'wallet';
    }
}
```

## Common Event Patterns

### Audit Events
```php
class AuditableEvent
{
    public function __construct(
        public readonly string $action,
        public readonly string $entityType,
        public readonly string $entityId,
        public readonly array $changes,
        public readonly ?string $userId = null
    ) {
        $this->userId = $userId ?? auth()->id();
    }
}
```

### Notification Events
```php
class NotificationRequiredEvent
{
    public function __construct(
        public readonly string $channel,
        public readonly string $recipientId,
        public readonly string $templateId,
        public readonly array $data
    ) {}
}
```