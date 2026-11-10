# Testing Patterns with Pest

Testing patterns for Laravel 12 with Pest PHP.

## Basic Test Structure

```php
<?php

use App\Models\User;
use Laravel\Passport\Passport;

beforeEach(function () {
    $this->user = User::factory()->create();
});

describe('User Registration', function () {
    it('can create user successfully', function () {
        $response = $this->postJson('/api/v1/users', [
            'email' => 'test@example.com',
            'password' => 'password123',
            'password_confirmation' => 'password123',
            'name' => 'Test User',
        ]);

        $response->assertStatus(201)
            ->assertJsonStructure([
                'success', 'status', 'message',
                'data' => ['id', 'email', 'name']
            ]);

        expect(User::where('email', 'test@example.com')->exists())->toBeTrue();
    });

    it('requires authentication for protected routes', function () {
        $response = $this->getJson('/api/v1/me');
        $response->assertStatus(401);
    });

    it('allows authenticated access', function () {
        Passport::actingAs($this->user, [], 'api');

        $response = $this->getJson('/api/v1/me');
        $response->assertStatus(200);
    });
});
```

## Feature Test Pattern

```php
<?php

use App\Models\User;
use App\Models\Order;

describe('OrderController', function () {
    beforeEach(function () {
        $this->user = User::factory()->create();
        $this->actingAs($this->user, 'api');
    });

    describe('create', function () {
        it('creates order with valid data', function () {
            $response = $this->postJson('/api/v1/orders', [
                'product_id' => 'prod_123',
                'quantity' => 2,
            ]);

            $response->assertStatus(201);
            expect(Order::count())->toBe(1);
        });

        it('validates required fields', function () {
            $response = $this->postJson('/api/v1/orders', []);

            $response->assertStatus(422)
                ->assertJsonValidationErrors(['product_id']);
        });
    });

    describe('authorization', function () {
        it('prevents access to other user orders', function () {
            $otherUser = User::factory()->create();
            $order = Order::factory()->for($otherUser)->create();

            $response = $this->getJson("/api/v1/orders/{$order->id}");

            $response->assertStatus(403);
        });
    });
});
```

## Unit Test Pattern

```php
<?php

use App\DTOs\CreateUserDTO;
use App\Services\UserService;
use App\Contracts\UserRepositoryInterface;

describe('UserService', function () {
    it('creates user via repository', function () {
        $repository = Mockery::mock(UserRepositoryInterface::class);
        $repository->shouldReceive('createFromDTO')
            ->once()
            ->andReturn(new UserDTO(...));

        $service = new UserService($repository);

        $dto = new CreateUserDTO(
            email: 'test@example.com',
            password: 'password123',
        );

        $result = $service->create($dto);

        expect($result)->toBeInstanceOf(UserDTO::class);
    });
});
```

## Testing DTOs

```php
<?php

use App\DTOs\CreateUserDTO;

describe('CreateUserDTO', function () {
    it('validates required fields', function () {
        expect(fn() => CreateUserDTO::validateAndCreate([]))
            ->toThrow(\Spatie\LaravelData\Exceptions\ValidationException::class);
    });

    it('creates DTO from valid data', function () {
        $dto = CreateUserDTO::validateAndCreate([
            'email' => 'test@example.com',
            'password' => 'password123',
            'name' => 'Test User',
        ]);

        expect($dto->email)->toBe('test@example.com');
        expect($dto->name)->toBe('Test User');
    });

    it('converts to model array', function () {
        $dto = new CreateUserDTO(
            email: 'test@example.com',
            password: 'password123',
            name: 'Test User',
        );

        $array = $dto->toModelArray();

        expect($array)->toHaveKey('email');
        expect($array['status'])->toBe('pending');
    });
});
```

## Database Testing

```php
<?php

use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('seeds database correctly', function () {
    $this->seed(UserSeeder::class);

    expect(User::count())->toBeGreaterThan(0);
});

it('uses transactions', function () {
    $user = User::factory()->create();

    // This will be rolled back after test
    expect($user->exists)->toBeTrue();
});
```

## Testing Events

```php
<?php

use App\Events\UserCreatedEvent;
use Illuminate\Support\Facades\Event;

it('dispatches event on user creation', function () {
    Event::fake([UserCreatedEvent::class]);

    $this->postJson('/api/v1/users', [
        'email' => 'test@example.com',
        'password' => 'password123',
    ]);

    Event::assertDispatched(UserCreatedEvent::class, function ($event) {
        return $event->userDTO->email === 'test@example.com';
    });
});
```

## Testing with Factories

```php
<?php

// database/factories/OrderFactory.php
class OrderFactory extends Factory
{
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'total_amount' => fake()->numberBetween(1000, 100000),
            'status' => OrderStatusEnum::PENDING,
        ];
    }

    public function completed(): static
    {
        return $this->state(['status' => OrderStatusEnum::COMPLETED]);
    }
}

// In tests
$order = Order::factory()->completed()->create();
```

## Pest Expectations

```php
// Common assertions
expect($response->status())->toBe(200);
expect($user->email)->toBe('test@example.com');
expect($collection)->toHaveCount(5);
expect($array)->toHaveKey('id');
expect($value)->toBeNull();
expect($value)->not->toBeEmpty();
expect($model)->toBeInstanceOf(User::class);
```
