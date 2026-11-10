---
name: dto-first
description: DTO patterns with Spatie Laravel Data. Use for request/response data handling and layer boundaries.
user-invocable: false
allowed-tools: Read, Grep, Glob, Edit, Write
---

# DTO-First Development Pattern

Patterns for Data Transfer Objects using Spatie Laravel Data.

## When to Load References

| Task | Load |
|------|------|
| Nested DTOs, computed properties, testing | `references/advanced-dto-patterns.md` |

---

## Core Concept

### Flow
```
Request → DTO (validate) → Service → Repository → Model
Response ← DTO (transform) ← Service ← Repository ← Model
```

---

## DTO Types by Purpose

### Response DTO (Output)
```php
use Spatie\LaravelData\Data;
use Spatie\LaravelData\Lazy;

class UserDTO extends Data
{
    public function __construct(
        public readonly string $id,
        public readonly string $email,
        public readonly ?string $name,
        public readonly UserStatusEnum $status,
        public readonly ?Carbon $email_verified_at,
        public readonly Carbon $created_at,
        public readonly Carbon $updated_at,
        public readonly ?Lazy $wallet,
        public readonly ?Lazy $orders,
    ) {}

    public static function fromModel(User $user): self
    {
        return new self(
            id: $user->id,
            email: $user->email,
            name: $user->name,
            status: $user->status,
            email_verified_at: $user->email_verified_at,
            created_at: $user->created_at,
            updated_at: $user->updated_at,
            wallet: Lazy::whenLoaded('wallet', $user, fn () => WalletDTO::from($user->wallet)),
            orders: Lazy::whenLoaded('orders', $user, fn () => OrderDTO::collect($user->orders)),
        );
    }

    public function toApiArray(): array
    {
        return [
            'id' => $this->id,
            'email' => $this->email,
            'name' => $this->name,
            'status' => $this->status->value,
            'email_verified' => $this->email_verified_at !== null,
            'created_at' => $this->created_at->toISOString(),
        ];
    }
}
```

### Create DTO (Input)
```php
use Spatie\LaravelData\Attributes\Validation\{Email, Max, Min, Required, Unique};

class CreateUserDTO extends Data
{
    public function __construct(
        #[Required, Email, Unique('users', 'email')]
        public readonly string $email,

        #[Required, Min(8), Max(100)]
        public readonly string $password,

        #[Max(100)]
        public readonly ?string $name = null,
    ) {}

    public function toModelArray(): array
    {
        return [
            'email' => $this->email,
            'password' => bcrypt($this->password),
            'name' => $this->name,
            'status' => 'pending',
        ];
    }
}
```

### Update DTO (Partial Input)
```php
use Spatie\LaravelData\Optional;

class UpdateUserDTO extends Data
{
    public function __construct(
        #[Max(100)]
        public readonly string|Optional $name,

        #[Enum(UserStatusEnum::class)]
        public readonly UserStatusEnum|Optional $status,
    ) {}

    public function toModelArray(): array
    {
        $data = [];
        if (!$this->name instanceof Optional) $data['name'] = $this->name;
        if (!$this->status instanceof Optional) $data['status'] = $this->status;
        return $data;
    }
}
```

### Filter DTO (Query Parameters)
```php
class UserFilterDTO extends Data
{
    public function __construct(
        public readonly ?string $search = null,
        public readonly ?UserStatusEnum $status = null,
        #[In(['created_at', 'name', 'email'])]
        public readonly string $sort = 'created_at',
        #[In(['asc', 'desc'])]
        public readonly string $direction = 'desc',
        #[Max(100)]
        public readonly int $per_page = 15,
    ) {}

    public function applyToQuery(Builder $query): Builder
    {
        if ($this->search) {
            $query->where(fn ($q) =>
                $q->where('name', 'like', "%{$this->search}%")
                  ->orWhere('email', 'like', "%{$this->search}%")
            );
        }
        if ($this->status) $query->where('status', $this->status);
        $query->orderBy($this->sort, $this->direction);
        return $query;
    }
}
```

---

## Controller Integration

```php
final class CreateUserController extends Controller
{
    public function __construct(private readonly UserService $userService) {}

    public function __invoke(Request $request): JsonResponse
    {
        $dto = CreateUserDTO::validateAndCreate($request->all());
        $userDTO = $this->userService->create($dto);

        return response()->json([
            'success' => true,
            'status' => Response::HTTP_CREATED,
            'message' => 'User created successfully',
            'data' => $userDTO->toApiArray(),
        ], Response::HTTP_CREATED);
    }
}
```

---

## Service Layer Integration

```php
class UserService
{
    public function __construct(
        private readonly UserRepositoryInterface $repository
    ) {}

    public function create(CreateUserDTO $dto): UserDTO
    {
        $userDTO = $this->repository->createFromDTO($dto);
        event(new UserCreatedEvent($userDTO));
        return $userDTO;
    }

    public function update(string $id, UpdateUserDTO $dto): UserDTO
    {
        return $this->repository->updateFromDTO($id, $dto);
    }

    public function list(UserFilterDTO $filter): Collection
    {
        return $this->repository->findByFilter($filter);
    }
}
```

---

## Repository Integration

```php
class EloquentUserRepository implements UserRepositoryInterface
{
    public function findByIdAsDTO(string $id): ?UserDTO
    {
        $user = User::find($id);
        return $user ? UserDTO::from($user) : null;
    }

    public function createFromDTO(CreateUserDTO $dto): UserDTO
    {
        $user = User::create($dto->toModelArray());
        return UserDTO::from($user);
    }

    public function updateFromDTO(string $id, UpdateUserDTO $dto): UserDTO
    {
        $user = User::findOrFail($id);
        $user->update($dto->toModelArray());
        return UserDTO::from($user->fresh());
    }

    public function findByFilter(UserFilterDTO $filter): Collection
    {
        $query = User::query();
        $filter->applyToQuery($query);
        return $query->paginate($filter->per_page)
            ->through(fn ($user) => UserDTO::from($user));
    }
}
```

---

## Best Practices

### Do's
- Use DTOs at layer boundaries (Controller <-> Service <-> Repository)
- Make DTO properties readonly
- Use validation attributes for input DTOs
- Provide `toModelArray()` for database operations
- Provide `toApiArray()` for API responses

### Don'ts
- Don't pass Eloquent Models through service boundaries
- Don't put business logic in DTOs
- Don't use DTOs for internal service communication
- Don't mix input and output DTOs

---
