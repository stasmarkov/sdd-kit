---
name: pest-3
description: Pest PHP 3.x testing patterns. Use for writing tests, expectations, and test architecture.
user-invocable: false
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
paths:
  - "tests/**"
  - "**/*Test.php"
---

# Pest PHP 3 Testing Patterns

Team-specific Pest PHP 3 testing patterns for Laravel applications.

## When to Load References

| Task | Load |
|------|------|
| Mocking, architecture tests | `references/advanced-testing.md` |
| Feature/service/repository/policy test examples | `references/layered-test-patterns.md` |

---

## Test Structure

### Describe Blocks
```php
describe('User Registration', function () {
    beforeEach(function () {
        $this->userData = [
            'email' => 'test@example.com',
            'password' => 'password123',
            'name' => 'Test User',
        ];
    });

    it('creates user with valid data', function () {
        $response = $this->postJson('/api/v1/register', $this->userData);

        $response->assertStatus(201);
        expect(User::count())->toBe(1);
    });

    it('requires email address', function () {
        unset($this->userData['email']);

        $this->postJson('/api/v1/register', $this->userData)
            ->assertStatus(422)
            ->assertJsonValidationErrors(['email']);
    });
});
```

---

## HTTP Testing

### API Endpoint Testing
```php
use Laravel\Passport\Passport;

describe('API Endpoints', function () {
    beforeEach(function () {
        $this->user = User::factory()->create();
    });

    it('requires authentication', function () {
        $this->getJson('/api/v1/users')->assertUnauthorized();
    });

    it('returns users list', function () {
        Passport::actingAs($this->user, [], 'api');
        User::factory()->count(5)->create();

        $this->getJson('/api/v1/users')
            ->assertOk()
            ->assertJsonStructure([
                'success', 'status', 'message',
                'data' => ['*' => ['id', 'email', 'name', 'created_at']]
            ]);
    });

    it('creates user successfully', function () {
        Passport::actingAs($this->user, [], 'api');

        $this->postJson('/api/v1/users', [
            'email' => 'new@example.com',
            'password' => 'password123',
            'name' => 'New User',
        ])
            ->assertCreated()
            ->assertJson(['success' => true]);

        expect(User::where('email', 'new@example.com')->exists())->toBeTrue();
    });
});
```

---

## Database Testing

### Factories and Assertions
```php
it('creates orders for users', function () {
    $user = User::factory()
        ->has(Order::factory()->count(3))
        ->create();

    expect($user->orders)->toHaveCount(3);
});

it('persists data to database', function () {
    User::factory()->create(['email' => 'test@example.com']);

    $this->assertDatabaseHas('users', ['email' => 'test@example.com']);
});
```

### Database Transactions
```php
// tests/Pest.php
uses(TestCase::class, RefreshDatabase::class)->in('Feature');
uses(TestCase::class)->in('Unit');
```

---

## Datasets

### Basic Datasets
```php
it('validates email formats', function (string $email, bool $isValid) {
    $validator = Validator::make(['email' => $email], ['email' => 'email']);
    expect($validator->passes())->toBe($isValid);
})->with([
    ['test@example.com', true],
    ['invalid-email', false],
    ['user@domain.co.uk', true],
]);
```

### Named Datasets
```php
dataset('valid_users', [
    'admin' => ['email' => 'admin@example.com', 'role' => 'admin'],
    'user' => ['email' => 'user@example.com', 'role' => 'user'],
]);

it('creates users with different roles', function (array $userData) {
    $user = User::factory()->create($userData);
    expect($user->role)->toBe($userData['role']);
})->with('valid_users');
```

---

## Higher Order Expectations

```php
expect($users)
    ->toHaveCount(3)
    ->each(fn ($user) => $user->toBeInstanceOf(User::class));

expect($users)
    ->sequence(
        fn ($user) => $user->name->toBe('Alice'),
        fn ($user) => $user->name->toBe('Bob'),
    );
```

---

## Test Organization

```
tests/
├── Feature/
│   ├── Api/
│   │   ├── AuthenticationTest.php
│   │   └── UserTest.php
│   └── Services/
│       └── PaymentServiceTest.php
├── Unit/
│   ├── DTOs/
│   │   └── UserDTOTest.php
│   └── Models/
│       └── UserTest.php
├── Pest.php
└── TestCase.php
```

### Pest.php Configuration
```php
uses(TestCase::class, RefreshDatabase::class)->in('Feature');
uses(TestCase::class)->in('Unit');

function createAuthenticatedUser(): User
{
    $user = User::factory()->create();
    Passport::actingAs($user, [], 'api');
    return $user;
}

expect()->extend('toBeValidEmail', function () {
    return $this->toMatch('/^[\w\-\.]+@[\w\-\.]+\.\w+$/');
});
```

---

## Running Tests

```bash
php artisan test                              # Run all
php artisan test tests/Feature/UserTest.php   # Specific file
php artisan test --filter="creates user"      # Filter by name
php artisan test --coverage --min=80          # With coverage
php artisan test --parallel                   # Parallel
php artisan test --stop-on-failure            # Stop on fail
```

---
