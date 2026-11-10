# Advanced Pest Testing Patterns

## Mocking

### Basic Mocking
```php
use function Pest\Laravel\mock;

it('sends welcome email on registration', function () {
    Mail::fake();

    $this->postJson('/api/v1/register', [
        'email' => 'test@example.com',
        'password' => 'password123',
        'name' => 'Test User',
    ]);

    Mail::assertSent(WelcomeEmail::class, function ($mail) {
        return $mail->hasTo('test@example.com');
    });
});

it('uses external service', function () {
    $mock = mock(PaymentService::class);
    $mock->shouldReceive('charge')
        ->once()
        ->with(1000, 'usd')
        ->andReturn(['status' => 'success']);

    $result = app(PaymentService::class)->charge(1000, 'usd');
    expect($result['status'])->toBe('success');
});
```

### Partial Mocks
```php
it('partially mocks service', function () {
    $service = $this->partialMock(UserService::class, function ($mock) {
        $mock->shouldReceive('sendNotification')
            ->once()
            ->andReturn(true);
    });

    $result = $service->createUser($userData);
    expect($result)->toBeInstanceOf(User::class);
});
```

## Architecture Testing

### Structure Tests
```php
arch('controllers are invokable')
    ->expect('App\Http\Controllers')
    ->toHaveMethod('__invoke');

arch('models extend base model')
    ->expect('App\Models')
    ->toExtend('Illuminate\Database\Eloquent\Model');

arch('services are final')
    ->expect('App\Services')
    ->toBeFinal();

arch('no debugging statements')
    ->expect(['dd', 'dump', 'ray', 'var_dump'])
    ->not->toBeUsed();

arch('strict types everywhere')
    ->expect('App')
    ->toUseStrictTypes();
```

### Dependency Rules
```php
arch('controllers depend on services')
    ->expect('App\Http\Controllers')
    ->toOnlyDependOn([
        'App\Services',
        'App\Http\Requests',
        'App\Http\Resources',
        'Illuminate\Http',
    ]);

arch('domain has no framework dependencies')
    ->expect('App\Domain')
    ->not->toUse('Illuminate\Support\Facades');
```