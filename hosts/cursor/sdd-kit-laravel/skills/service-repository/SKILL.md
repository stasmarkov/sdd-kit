---
name: service-repository
description: Service-Repository architecture pattern. Use for business logic, layer separation, and data access.
user-invocable: false
allowed-tools: Read, Grep, Glob, Edit, Write
---

# Service-Repository Pattern

Knowledge module for implementing the Service-Repository architecture pattern.

## When to Load References

| Task | Load |
|------|------|
| Writing controller, service, or repository code | `references/implementation-examples.md` |
| Writing unit or integration tests | `references/testing-patterns.md` |
| Reviewing code for pattern violations | `references/anti-patterns.md` |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        REQUEST FLOW                              │
└─────────────────────────────────────────────────────────────────┘

Request → Controller → Service → Repository → Database
Response ← Controller ← Service ← Repository ← Models

┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  Controller  │ →  │   Service    │ →  │  Repository  │
│              │    │              │    │              │
│ • Validation │    │ • Business   │    │ • Data       │
│ • Auth       │    │   Logic      │    │   Access     │
│ • Response   │    │ • Events     │    │ • Queries    │
│ • DTO Input  │    │ • DTOs       │    │ • Model ↔DTO │
└──────────────┘    └──────────────┘    └──────────────┘
```

---

## Layer Responsibilities

### Controller Layer
- **Input Handling**: Validate request data via DTOs
- **Authorization**: Check user permissions via policies
- **Response Formatting**: Return consistent JSON responses
- **THIN**: No business logic

### Service Layer
- **Business Logic**: All domain rules and calculations
- **Coordination**: Orchestrate multiple operations
- **Events**: Dispatch domain events
- **Transactions**: Manage database transactions
- **DTOs**: Accept and return DTOs

### Repository Layer
- **Data Access**: All database queries
- **Model Conversion**: Transform Model to DTO
- **Query Building**: Complex query construction
- **Caching**: Cache query results

---

## Quick Reference Patterns

### Controller (Invokable)
```php
final class CreateOrderController extends Controller
{
    public function __construct(
        private readonly OrderService $orderService
    ) {}

    public function __invoke(Request $request): JsonResponse
    {
        $this->authorize('create', Order::class);
        $dto = CreateOrderDTO::validateAndCreate($request->all());
        $orderDTO = $this->orderService->create($dto);
        return response()->json([
            'success' => true,
            'data' => $orderDTO->toApiArray(),
        ], Response::HTTP_CREATED);
    }
}
```

### Service (Business Logic + Transactions)
```php
class OrderService
{
    public function __construct(
        private readonly OrderRepositoryInterface $repository,
        private readonly InventoryServiceInterface $inventory
    ) {}

    public function create(CreateOrderDTO $dto): OrderDTO
    {
        $this->validateBusinessRules($dto);

        if (!$this->inventory->hasStock($dto->product_id, $dto->quantity)) {
            throw new InsufficientInventoryException();
        }

        return DB::transaction(function () use ($dto) {
            $orderDTO = $this->repository->createFromDTO($dto);
            $this->inventory->reserve($dto->product_id, $dto->quantity);
            event(new OrderCreatedEvent($orderDTO, auth()->id()));
            return $orderDTO;
        });
    }
}
```

### Repository Interface
```php
interface OrderRepositoryInterface
{
    public function findByIdAsDTO(string $id): ?OrderDTO;
    public function createFromDTO(CreateOrderDTO $dto): OrderDTO;
    public function updateStatus(string $id, string $status): OrderDTO;
    public function findByFilter(OrderFilterDTO $filter): Collection;
    public function findModelById(string $id): ?Order;
    public function deleteById(string $id): bool;
}
```

### Repository (Data Access + Caching)
```php
class EloquentOrderRepository implements OrderRepositoryInterface
{
    public function findByIdAsDTO(string $id): ?OrderDTO
    {
        return Cache::tags(['orders'])->remember("order:{$id}", 3600, function () use ($id) {
            $order = Order::find($id);
            return $order ? OrderDTO::from($order) : null;
        });
    }

    public function createFromDTO(CreateOrderDTO $dto): OrderDTO
    {
        $order = Order::create(array_merge(
            $dto->toModelArray(),
            ['user_id' => auth()->id()]
        ));
        Cache::tags(['orders'])->flush();
        return OrderDTO::from($order);
    }
}
```

### Dependency Injection
```php
class RepositoryServiceProvider extends ServiceProvider
{
    public array $bindings = [
        OrderRepositoryInterface::class => EloquentOrderRepository::class,
    ];
}
```

---

## Key Rules

1. **Controllers are thin** -- validate input, call service, format response
2. **Services own business logic** -- rules, transactions, event dispatching
3. **Repositories own data access** -- queries, caching, Model-to-DTO conversion
4. **DTOs cross boundaries** -- never pass Eloquent models between layers
5. **Bind interfaces** -- register repository bindings in a ServiceProvider
6. **Services call repositories, never the reverse**
7. **Controllers never access repositories directly**

---

## Common Anti-Patterns (Summary)

| Anti-Pattern | Fix |
|-------------|-----|
| Business logic in controller | Move to service layer |
| Direct `Model::find()` in controller | Go through service + repository |
| Service returning Eloquent models | Return DTOs instead |
| Repository with business logic | Move logic to service |
| Service calling another service's repository | Call the other service |
| Skipping repository for "simple" queries | Always use repository |

See `references/anti-patterns.md` for detailed examples with code.

---
