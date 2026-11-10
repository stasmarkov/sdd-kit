# Testing Events

## Testing Event Dispatch

```php
use App\Events\UserCreatedEvent;
use Illuminate\Support\Facades\Event;

it('dispatches UserCreatedEvent when user is created', function () {
    Event::fake([UserCreatedEvent::class]);

    $this->postJson('/api/v1/users', [
        'email' => 'test@example.com',
        'password' => 'password123',
    ]);

    Event::assertDispatched(UserCreatedEvent::class, function ($event) {
        return $event->userDTO->email === 'test@example.com';
    });
});

it('dispatches event with correct data', function () {
    Event::fake();

    $service = app(UserService::class);
    $dto = new CreateUserDTO(
        email: 'test@example.com',
        password: 'password123'
    );

    $service->create($dto);

    Event::assertDispatched(UserCreatedEvent::class, function ($event) {
        expect($event->userDTO)->toBeInstanceOf(UserDTO::class);
        expect($event->userDTO->email)->toBe('test@example.com');
        return true;
    });
});
```

## Testing Listeners

```php
use App\Events\UserCreatedEvent;
use App\Listeners\CreateUserWalletListener;
use App\Services\WalletService;

it('creates wallet when user created event is handled', function () {
    $walletService = Mockery::mock(WalletService::class);
    $walletService->shouldReceive('createForUser')
        ->once()
        ->with('user-123');

    $listener = new CreateUserWalletListener($walletService);
    $event = new UserCreatedEvent(
        new UserDTO(id: 'user-123', email: 'test@example.com')
    );

    $listener->handle($event);
});
```
