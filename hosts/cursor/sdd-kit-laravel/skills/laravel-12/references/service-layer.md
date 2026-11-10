# Service Layer Pattern

Service-Repository architecture for Laravel 12.

## Architecture Overview

```
Controller → Service (DTOs) → Repository → Database
     ↓           ↓              ↓
   HTTP      Business       Data Access
  Concerns     Logic         Operations
```

## Service Class

```php
<?php

declare(strict_types=1);

namespace App\Services;

use App\Contracts\UserRepositoryInterface;
use App\DTOs\CreateUserDTO;
use App\DTOs\UserDTO;
use App\Events\UserCreatedEvent;

class UserService
{
    public function __construct(
        private readonly UserRepositoryInterface $repository
    ) {}

    public function create(CreateUserDTO $dto): UserDTO
    {
        $this->validateBusinessRules($dto);

        $userDTO = $this->repository->createFromDTO($dto);

        event(new UserCreatedEvent($userDTO));

        return $userDTO;
    }

    private function validateBusinessRules(CreateUserDTO $dto): void
    {
        // Business rule validation
    }
}
```

## Repository Interface

```php
<?php

declare(strict_types=1);

namespace App\Contracts;

use App\DTOs\CreateUserDTO;
use App\DTOs\UserDTO;

interface UserRepositoryInterface
{
    public function findById(string $id): ?UserDTO;
    public function createFromDTO(CreateUserDTO $dto): UserDTO;
}
```

## Repository Implementation

```php
<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Contracts\UserRepositoryInterface;
use App\DTOs\CreateUserDTO;
use App\DTOs\UserDTO;
use App\Models\User;

class EloquentUserRepository implements UserRepositoryInterface
{
    public function findById(string $id): ?UserDTO
    {
        $user = User::find($id);
        return $user ? UserDTO::from($user) : null;
    }

    public function createFromDTO(CreateUserDTO $dto): UserDTO
    {
        $user = User::create($dto->toModelArray());
        return UserDTO::from($user);
    }
}
```

## Service Provider Binding

```php
// AppServiceProvider.php
public function register(): void
{
    $this->app->bind(
        UserRepositoryInterface::class,
        EloquentUserRepository::class
    );
}
```

## Events & Listeners

### Event Definition

```php
<?php

declare(strict_types=1);

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

### Listener

```php
<?php

declare(strict_types=1);

namespace App\Listeners;

use App\Events\UserCreatedEvent;
use App\Services\WalletService;

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

## Best Practices

### Do's
- Services accept and return DTOs exclusively
- Use repository for all data access
- Dispatch events with DTOs, not Eloquent models
- Wrap multi-step operations in transactions
- Business logic validation in services

### Don'ts
- Don't pass Eloquent models through service boundaries
- Don't put business logic in controllers
- Don't call repositories from controllers directly
- Don't use DB facade in services
