---
name: event-driven
description: Event-driven architecture in Laravel. Use for events, listeners, and async processing patterns.
user-invocable: false
allowed-tools: Read, Grep, Glob, Edit, Write
---

# Event-Driven Architecture Pattern

Patterns for event-driven development in Laravel applications.

## When to Load References

| Task | Load |
|------|------|
| Domain events with correlation IDs | `references/domain-events.md` |
| Testing events and listeners | `references/testing-events.md` |

---

## Core Concepts

### Why Events?
- **Decoupling**: Modules communicate without direct dependencies
- **Extensibility**: Add listeners without modifying emitting code
- **Auditability**: Easy to log and track system activities
- **Async Processing**: Offload work to queues

### Event Flow
```
Action → Event Dispatched → Event Listeners → Side Effects
                               ↓
                          Queue (optional)
                               ↓
                          Async Processing
```

---

## Event Implementation

### Defining Events
```php
namespace App\Events;

use App\DTOs\UserDTO;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class UserCreatedEvent
{
    use Dispatchable, SerializesModels;

    public function __construct(
        public readonly UserDTO $userDTO,
        public readonly ?string $createdByUserId = null
    ) {}
}
```

### Event with Broadcast
```php
class OrderStatusChangedEvent implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public readonly OrderDTO $orderDTO,
        public readonly string $previousStatus,
        public readonly string $newStatus
    ) {}

    public function broadcastOn(): array
    {
        return [new PrivateChannel('orders.' . $this->orderDTO->user_id)];
    }

    public function broadcastAs(): string
    {
        return 'order.status.changed';
    }
}
```

---

## Listener Implementation

### Basic Listener
```php
class CreateUserWalletListener
{
    public function __construct(
        private readonly WalletService $walletService
    ) {}

    public function handle(UserCreatedEvent $event): void
    {
        $this->walletService->createForUser($event->userDTO->id);
    }
}
```

### Queued Listener
```php
class SendWelcomeEmailListener implements ShouldQueue
{
    use InteractsWithQueue;

    public string $queue = 'emails';
    public int $tries = 3;
    public array $backoff = [30, 60, 120];

    public function handle(UserCreatedEvent $event): void
    {
        Mail::to($event->userDTO->email)->send(new WelcomeEmail($event->userDTO));
    }

    public function failed(UserCreatedEvent $event, \Throwable $exception): void
    {
        logger()->error('Failed to send welcome email', [
            'user_id' => $event->userDTO->id,
            'error' => $exception->getMessage(),
        ]);
    }

    public function shouldQueue(UserCreatedEvent $event): bool
    {
        return $event->userDTO->email_verified_at !== null;
    }
}
```

---

## Event Registration

### EventServiceProvider
```php
class EventServiceProvider extends ServiceProvider
{
    protected $listen = [
        UserCreatedEvent::class => [
            CreateUserWalletListener::class,
            SendWelcomeEmailListener::class,
        ],
        OrderCreatedEvent::class => [
            SendOrderConfirmationListener::class,
            UpdateInventoryListener::class,
        ],
    ];

    public function shouldDiscoverEvents(): bool
    {
        return true;
    }
}
```

### Attribute-Based Registration (Laravel 11+)
```php
use Illuminate\Events\Attribute\AsListener;

#[AsListener(UserCreatedEvent::class)]
class CreateUserWalletListener
{
    public function handle(UserCreatedEvent $event): void { /* ... */ }
}
```

---

## Dispatching Events

### In Services
```php
class UserService
{
    public function create(CreateUserDTO $dto): UserDTO
    {
        $userDTO = $this->repository->createFromDTO($dto);

        // Dispatch event with DTO (not model)
        event(new UserCreatedEvent($userDTO, auth()->id()));

        return $userDTO;
    }
}
```

---

## Best Practices

### Event Naming
```php
// Past tense - something that happened
UserCreatedEvent
OrderCompletedEvent
PaymentFailedEvent

// Present/future tense - avoid
CreateUserEvent       // BAD
CompleteOrderEvent    // BAD
```

### Event Data
```php
// Use DTOs - serializable and immutable
public function __construct(
    public readonly UserDTO $userDTO
) {}

// Don't pass Eloquent models (can't serialize properly)
```

### Listener Responsibility
```php
// Single responsibility - one listener per side effect
class SendWelcomeEmailListener { }
class CreateUserWalletListener { }
class LogUserActivityListener { }

// Avoid: multiple responsibilities in one listener
```

---

## Common Pitfalls

- **Passing models in events**: Use DTOs instead for proper serialization
- **Too many sync listeners**: Queue non-critical side effects
- **Missing failed() handler**: Always handle listener failures
- **Circular events**: Event A triggers Event B triggers Event A

---