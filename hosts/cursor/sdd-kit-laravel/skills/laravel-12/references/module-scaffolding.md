# Laravel Modular Monolith Scaffolding Guide

*How to create new modules following the established architecture*

---

## Overview

The modular monolith architecture organizes code into domain-focused modules, each with its own structure. This guide shows how to scaffold new modules correctly.

**Benefits:**
- Clear domain boundaries
- Independent module development
- Shared infrastructure
- Easy extraction to microservices (future)

---

## Module Structure

```
Modules/
├── {{Domain}}/                        # Domain namespace
│   └── {{SubModule}}/                 # Feature/capability
│       ├── Application/
│       │   └── Http/
│       │       ├── Controllers/       # Invokable controllers
│       │       ├── Requests/          # Form requests (validation)
│       │       └── Resources/         # JsonResource transformers
│       │
│       ├── Domain/
│       │   ├── Contracts/             # Repository interfaces
│       │   ├── DataTransferObjects/   # Spatie Data DTOs
│       │   ├── Enums/                 # Type-safe enums
│       │   ├── Events/                # Domain events
│       │   ├── Exceptions/            # Custom exceptions
│       │   ├── Models/                # Eloquent models
│       │   ├── Policies/              # Authorization policies
│       │   └── Services/              # Business logic
│       │
│       ├── Infrastructure/
│       │   ├── Database/
│       │   │   ├── Factories/         # Model factories
│       │   │   ├── Migrations/        # Database migrations
│       │   │   └── Seeders/           # Data seeders
│       │   ├── Repositories/          # Repository implementations
│       │   ├── Routes/                # Route definitions
│       │   └── Providers/             # Service providers
│       │
│       └── Tests/
│           ├── Feature/               # API/Integration tests
│           └── Unit/                  # Unit tests
```

---

## Step-by-Step Scaffolding

### Step 1: Create Directory Structure

```bash
#!/bin/bash
# scaffold-module.sh

DOMAIN=$1
SUBMODULE=$2
BASE_PATH="Modules/${DOMAIN}/${SUBMODULE}"

# Create all directories
mkdir -p "${BASE_PATH}/Application/Http/Controllers"
mkdir -p "${BASE_PATH}/Application/Http/Requests"
mkdir -p "${BASE_PATH}/Application/Http/Resources"
mkdir -p "${BASE_PATH}/Domain/Contracts"
mkdir -p "${BASE_PATH}/Domain/DataTransferObjects"
mkdir -p "${BASE_PATH}/Domain/Enums"
mkdir -p "${BASE_PATH}/Domain/Events"
mkdir -p "${BASE_PATH}/Domain/Exceptions"
mkdir -p "${BASE_PATH}/Domain/Models"
mkdir -p "${BASE_PATH}/Domain/Policies"
mkdir -p "${BASE_PATH}/Domain/Services"
mkdir -p "${BASE_PATH}/Infrastructure/Database/Factories"
mkdir -p "${BASE_PATH}/Infrastructure/Database/Migrations"
mkdir -p "${BASE_PATH}/Infrastructure/Database/Seeders"
mkdir -p "${BASE_PATH}/Infrastructure/Repositories"
mkdir -p "${BASE_PATH}/Infrastructure/Routes"
mkdir -p "${BASE_PATH}/Infrastructure/Providers"
mkdir -p "${BASE_PATH}/Tests/Feature"
mkdir -p "${BASE_PATH}/Tests/Unit"

echo "✅ Created module structure at ${BASE_PATH}"
```

### Step 2: Create Service Provider

```php
<?php
// Modules/{{Domain}}/{{SubModule}}/Infrastructure/Providers/{{SubModule}}ServiceProvider.php

declare(strict_types=1);

namespace Modules\{{Domain}}\{{SubModule}}\Infrastructure\Providers;

use Illuminate\Support\ServiceProvider;
use Modules\{{Domain}}\{{SubModule}}\Domain\Contracts\{{Entity}}RepositoryInterface;
use Modules\{{Domain}}\{{SubModule}}\Infrastructure\Repositories\Eloquent{{Entity}}Repository;

class {{SubModule}}ServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        // Bind repository interfaces
        $this->app->bind(
            {{Entity}}RepositoryInterface::class,
            Eloquent{{Entity}}Repository::class
        );
    }

    public function boot(): void
    {
        // Load routes
        $this->loadRoutesFrom(__DIR__ . '/../Routes/api.php');

        // Load migrations
        $this->loadMigrationsFrom(__DIR__ . '/../Database/Migrations');

        // Register policies
        // Gate::policy({{Entity}}::class, {{Entity}}Policy::class);
    }
}
```

### Step 3: Create Routes File

```php
<?php
// Modules/{{Domain}}/{{SubModule}}/Infrastructure/Routes/api.php

declare(strict_types=1);

use Illuminate\Support\Facades\Route;
use Modules\{{Domain}}\{{SubModule}}\Application\Http\Controllers\Create{{Entity}}Controller;
use Modules\{{Domain}}\{{SubModule}}\Application\Http\Controllers\Show{{Entity}}Controller;
use Modules\{{Domain}}\{{SubModule}}\Application\Http\Controllers\List{{Entity}}Controller;
use Modules\{{Domain}}\{{SubModule}}\Application\Http\Controllers\Update{{Entity}}Controller;
use Modules\{{Domain}}\{{SubModule}}\Application\Http\Controllers\Delete{{Entity}}Controller;

Route::prefix('api/v1')
    ->middleware(['api', 'auth:api'])
    ->group(function () {
        Route::prefix('{{entities}}')->group(function () {
            Route::get('/', List{{Entity}}Controller::class);
            Route::post('/', Create{{Entity}}Controller::class);
            Route::get('/{id}', Show{{Entity}}Controller::class);
            Route::put('/{id}', Update{{Entity}}Controller::class);
            Route::delete('/{id}', Delete{{Entity}}Controller::class);
        });
    });
```

### Step 4: Create Model

```php
<?php
// Modules/{{Domain}}/{{SubModule}}/Domain/Models/{{Entity}}.php

declare(strict_types=1);

namespace Modules\{{Domain}}\{{SubModule}}\Domain\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Modules\{{Domain}}\{{SubModule}}\Domain\Enums\{{Entity}}StatusEnum;

class {{Entity}} extends Model
{
    use HasUuids, HasFactory, SoftDeletes;

    protected $table = '{{table_name}}';
    protected $keyType = 'string';
    public $incrementing = false;

    protected $fillable = [
        'name',
        'description',
        'status',
        'user_id',
    ];

    protected function casts(): array
    {
        return [
            'status' => {{Entity}}StatusEnum::class,
            'metadata' => 'array',
            'created_at' => 'datetime',
            'updated_at' => 'datetime',
        ];
    }

    // Relationships
    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
```

### Step 5: Create DTOs

```php
<?php
// Modules/{{Domain}}/{{SubModule}}/Domain/DataTransferObjects/{{Entity}}DTO.php

declare(strict_types=1);

namespace Modules\{{Domain}}\{{SubModule}}\Domain\DataTransferObjects;

use Carbon\Carbon;
use Spatie\LaravelData\Data;
use Spatie\LaravelData\Attributes\Validation\Required;
use Spatie\LaravelData\Attributes\Validation\Uuid;

class {{Entity}}DTO extends Data
{
    public function __construct(
        #[Required, Uuid]
        public readonly string $id,

        #[Required]
        public readonly string $name,

        public readonly ?string $description,

        public readonly string $status,

        public readonly Carbon $created_at,

        public readonly Carbon $updated_at,
    ) {}

    public static function fromModel({{Entity}} $model): self
    {
        return new self(
            id: $model->id,
            name: $model->name,
            description: $model->description,
            status: $model->status->value,
            created_at: $model->created_at,
            updated_at: $model->updated_at,
        );
    }
}
```

```php
<?php
// Modules/{{Domain}}/{{SubModule}}/Domain/DataTransferObjects/Create{{Entity}}DTO.php

declare(strict_types=1);

namespace Modules\{{Domain}}\{{SubModule}}\Domain\DataTransferObjects;

use Spatie\LaravelData\Data;
use Spatie\LaravelData\Attributes\Validation\Required;
use Spatie\LaravelData\Attributes\Validation\StringType;
use Spatie\LaravelData\Attributes\Validation\Max;

class Create{{Entity}}DTO extends Data
{
    public function __construct(
        #[Required, StringType, Max(255)]
        public readonly string $name,

        #[StringType, Max(1000)]
        public readonly ?string $description = null,
    ) {}

    public function toModelArray(): array
    {
        return [
            'name' => $this->name,
            'description' => $this->description,
            'status' => {{Entity}}StatusEnum::ACTIVE->value,
        ];
    }
}
```

### Step 6: Create Repository

```php
<?php
// Modules/{{Domain}}/{{SubModule}}/Domain/Contracts/{{Entity}}RepositoryInterface.php

declare(strict_types=1);

namespace Modules\{{Domain}}\{{SubModule}}\Domain\Contracts;

use Illuminate\Pagination\LengthAwarePaginator;
use Modules\{{Domain}}\{{SubModule}}\Domain\DataTransferObjects\{{Entity}}DTO;
use Modules\{{Domain}}\{{SubModule}}\Domain\DataTransferObjects\Create{{Entity}}DTO;
use Modules\{{Domain}}\{{SubModule}}\Domain\DataTransferObjects\Update{{Entity}}DTO;
use Modules\{{Domain}}\{{SubModule}}\Domain\Models\{{Entity}};

interface {{Entity}}RepositoryInterface
{
    public function findById(string $id): ?{{Entity}}DTO;
    public function findModelById(string $id): ?{{Entity}};
    public function createFromDTO(Create{{Entity}}DTO $dto): {{Entity}}DTO;
    public function updateFromDTO(string $id, Update{{Entity}}DTO $dto): {{Entity}}DTO;
    public function delete(string $id): bool;
    public function paginate(int $perPage = 15): LengthAwarePaginator;
}
```

```php
<?php
// Modules/{{Domain}}/{{SubModule}}/Infrastructure/Repositories/Eloquent{{Entity}}Repository.php

declare(strict_types=1);

namespace Modules\{{Domain}}\{{SubModule}}\Infrastructure\Repositories;

use Illuminate\Pagination\LengthAwarePaginator;
use Modules\{{Domain}}\{{SubModule}}\Domain\Contracts\{{Entity}}RepositoryInterface;
use Modules\{{Domain}}\{{SubModule}}\Domain\DataTransferObjects\{{Entity}}DTO;
use Modules\{{Domain}}\{{SubModule}}\Domain\DataTransferObjects\Create{{Entity}}DTO;
use Modules\{{Domain}}\{{SubModule}}\Domain\DataTransferObjects\Update{{Entity}}DTO;
use Modules\{{Domain}}\{{SubModule}}\Domain\Models\{{Entity}};

class Eloquent{{Entity}}Repository implements {{Entity}}RepositoryInterface
{
    public function findById(string $id): ?{{Entity}}DTO
    {
        $model = {{Entity}}::find($id);
        return $model ? {{Entity}}DTO::fromModel($model) : null;
    }

    public function findModelById(string $id): ?{{Entity}}
    {
        return {{Entity}}::find($id);
    }

    public function createFromDTO(Create{{Entity}}DTO $dto): {{Entity}}DTO
    {
        $model = {{Entity}}::create(array_merge(
            $dto->toModelArray(),
            ['user_id' => auth()->id()]
        ));

        return {{Entity}}DTO::fromModel($model);
    }

    public function updateFromDTO(string $id, Update{{Entity}}DTO $dto): {{Entity}}DTO
    {
        $model = {{Entity}}::findOrFail($id);
        $model->update($dto->toModelArray());

        return {{Entity}}DTO::fromModel($model->fresh());
    }

    public function delete(string $id): bool
    {
        return {{Entity}}::destroy($id) > 0;
    }

    public function paginate(int $perPage = 15): LengthAwarePaginator
    {
        return {{Entity}}::orderBy('created_at', 'desc')
            ->paginate($perPage)
            ->through(fn({{Entity}} $model) => {{Entity}}DTO::fromModel($model));
    }
}
```

### Step 7: Create Service

```php
<?php
// Modules/{{Domain}}/{{SubModule}}/Domain/Services/{{Entity}}Service.php

declare(strict_types=1);

namespace Modules\{{Domain}}\{{SubModule}}\Domain\Services;

use Modules\{{Domain}}\{{SubModule}}\Domain\Contracts\{{Entity}}RepositoryInterface;
use Modules\{{Domain}}\{{SubModule}}\Domain\DataTransferObjects\{{Entity}}DTO;
use Modules\{{Domain}}\{{SubModule}}\Domain\DataTransferObjects\Create{{Entity}}DTO;
use Modules\{{Domain}}\{{SubModule}}\Domain\DataTransferObjects\Update{{Entity}}DTO;
use Modules\{{Domain}}\{{SubModule}}\Domain\Events\{{Entity}}CreatedEvent;
use Modules\{{Domain}}\{{SubModule}}\Domain\Exceptions\{{Entity}}NotFoundException;

class {{Entity}}Service
{
    public function __construct(
        private readonly {{Entity}}RepositoryInterface $repository
    ) {}

    public function create(Create{{Entity}}DTO $dto): {{Entity}}DTO
    {
        $this->validateBusinessRules($dto);

        $entityDTO = $this->repository->createFromDTO($dto);

        event(new {{Entity}}CreatedEvent($entityDTO, auth()->id()));

        return $entityDTO;
    }

    public function findById(string $id): {{Entity}}DTO
    {
        $dto = $this->repository->findById($id);

        if (!$dto) {
            throw new {{Entity}}NotFoundException("{{Entity}} not found: {$id}");
        }

        return $dto;
    }

    public function update(string $id, Update{{Entity}}DTO $dto): {{Entity}}DTO
    {
        $this->validateBusinessRules($dto);

        return $this->repository->updateFromDTO($id, $dto);
    }

    public function delete(string $id): bool
    {
        return $this->repository->delete($id);
    }

    private function validateBusinessRules(Create{{Entity}}DTO|Update{{Entity}}DTO $dto): void
    {
        // Add business rule validation here
    }
}
```

### Step 8: Create Controller

```php
<?php
// Modules/{{Domain}}/{{SubModule}}/Application/Http/Controllers/Create{{Entity}}Controller.php

declare(strict_types=1);

namespace Modules\{{Domain}}\{{SubModule}}\Application\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Modules\Shared\Response\Application\Http\Controllers\ApiBaseController;
use Modules\{{Domain}}\{{SubModule}}\Application\Http\Resources\{{Entity}}Resource;
use Modules\{{Domain}}\{{SubModule}}\Domain\DataTransferObjects\Create{{Entity}}DTO;
use Modules\{{Domain}}\{{SubModule}}\Domain\Models\{{Entity}};
use Modules\{{Domain}}\{{SubModule}}\Domain\Services\{{Entity}}Service;
use Symfony\Component\HttpFoundation\Response;

/**
 * @group {{Domain}} Management
 * @authenticated
 */
final class Create{{Entity}}Controller extends ApiBaseController
{
    public function __construct(
        private readonly {{Entity}}Service $service
    ) {}

    /**
     * Create {{entity}}
     *
     * @bodyParam name string required The name. Example: "Example Name"
     * @bodyParam description string The description. Example: "Example description"
     */
    public function __invoke(Request $request): JsonResponse
    {
        $this->authorize('create', {{Entity}}::class);

        $dto = Create{{Entity}}DTO::validateAndCreate($request->all());

        $entityDTO = $this->service->create($dto);

        return $this->resource(
            new {{Entity}}Resource($entityDTO),
            '{{Entity}} created successfully',
            Response::HTTP_CREATED
        );
    }
}
```

### Step 9: Create Resource

```php
<?php
// Modules/{{Domain}}/{{SubModule}}/Application/Http/Resources/{{Entity}}Resource.php

declare(strict_types=1);

namespace Modules\{{Domain}}\{{SubModule}}\Application\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class {{Entity}}Resource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'description' => $this->description,
            'status' => $this->status,
            'created_at' => $this->created_at->toISOString(),
            'updated_at' => $this->updated_at->toISOString(),
        ];
    }
}
```

### Step 10: Create Tests

```php
<?php
// Modules/{{Domain}}/{{SubModule}}/Tests/Feature/{{Entity}}ControllerTest.php

declare(strict_types=1);

use Modules\{{Domain}}\{{SubModule}}\Domain\Models\{{Entity}};
use Modules\{{Domain}}\Core\Domain\Models\User;

beforeEach(function () {
    $this->user = User::factory()->create();
});

describe('Create{{Entity}}Controller', function () {
    it('creates {{entity}} successfully', function () {
        $response = $this->actingAs($this->user, 'api')
            ->postJson('/api/v1/{{entities}}', [
                'name' => 'Test Name',
                'description' => 'Test description',
            ]);

        $response->assertStatus(201)
            ->assertJsonStructure([
                'success',
                'status',
                'message',
                'data' => [
                    'id',
                    'name',
                    'description',
                    'status',
                    'created_at',
                    'updated_at',
                ],
            ]);

        expect({{Entity}}::count())->toBe(1);
    });

    it('requires authentication', function () {
        $response = $this->postJson('/api/v1/{{entities}}', [
            'name' => 'Test',
        ]);

        $response->assertStatus(401);
    });

    it('validates required fields', function () {
        $response = $this->actingAs($this->user, 'api')
            ->postJson('/api/v1/{{entities}}', []);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['name']);
    });
});
```

### Step 11: Register Module

Add service provider to `config/app.php` or `bootstrap/providers.php`:

```php
// bootstrap/providers.php (Laravel 11+)
return [
    // ...
    Modules\{{Domain}}\{{SubModule}}\Infrastructure\Providers\{{SubModule}}ServiceProvider::class,
];
```

---

## Scaffolding Script

Create a CLI tool to automate module scaffolding:

```bash
#!/bin/bash
# scripts/scaffold-module.sh

DOMAIN=$1
SUBMODULE=$2
ENTITY=$3

if [ -z "$DOMAIN" ] || [ -z "$SUBMODULE" ] || [ -z "$ENTITY" ]; then
    echo "Usage: ./scaffold-module.sh <Domain> <SubModule> <Entity>"
    echo "Example: ./scaffold-module.sh Payments Checkout Order"
    exit 1
fi

BASE_PATH="Modules/${DOMAIN}/${SUBMODULE}"

echo "🚀 Scaffolding module: ${DOMAIN}/${SUBMODULE} with entity: ${ENTITY}"

# Create directories...
# Copy and process templates...
# Update service provider registrations...

echo "✅ Module scaffolded successfully!"
echo ""
echo "Next steps:"
echo "  1. Review generated files in ${BASE_PATH}"
echo "  2. Create database migration"
echo "  3. Register service provider"
echo "  4. Run tests: php artisan test ${BASE_PATH}/Tests"
```

---

## Checklist: New Module

- [ ] Directory structure created
- [ ] Service provider created and registered
- [ ] Routes file created
- [ ] Model with UUID primary key
- [ ] DTOs for create/update/entity
- [ ] Repository interface and implementation
- [ ] Service class with business logic
- [ ] Invokable controllers
- [ ] JsonResource for API responses
- [ ] Policy for authorization
- [ ] Factory for testing
- [ ] Feature and unit tests
- [ ] Migration for database table

---

## Best Practices

### 1. Keep Modules Independent
Modules should communicate via events, not direct dependencies.

### 2. Use Interfaces
Always define repository interfaces - enables testing and swapping implementations.

### 3. DTOs at Boundaries
Controllers receive DTOs, services work with DTOs, events carry DTOs.

### 4. Thin Controllers
Controllers only handle HTTP concerns - all logic in services.

### 5. Test Coverage
Every module should have comprehensive feature and unit tests.

---

*Last Updated: December 2025*
*Version: 1.0*
