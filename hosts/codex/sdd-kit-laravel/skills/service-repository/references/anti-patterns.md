# Service-Repository Anti-Patterns

Common mistakes and their corrections when implementing the Service-Repository pattern.

## Controller with Business Logic

```php
// WRONG - business logic in controller
public function store(Request $request)
{
    if ($request->quantity > 100) {
        throw new Exception('Too many items');
    }

    $order = Order::create($request->all());
}

// CORRECT - delegate to service via DTO
public function __invoke(Request $request)
{
    $dto = CreateOrderDTO::validateAndCreate($request->all());
    $orderDTO = $this->orderService->create($dto);
    return $this->resource($orderDTO->toApiArray());
}
```

## Direct Model Access in Controller

```php
// WRONG - bypasses service and repository layers
public function show(string $id)
{
    $order = Order::findOrFail($id);
    return new OrderResource($order);
}

// CORRECT - goes through service layer
public function __invoke(string $id)
{
    $orderDTO = $this->orderService->findById($id);
    if (!$orderDTO) {
        return $this->error('Order not found', 404);
    }
    return $this->resource($orderDTO->toApiArray());
}
```

## Service Returning Models

```php
// WRONG - leaks Eloquent models outside repository
public function create(CreateOrderDTO $dto): Order
{
    return Order::create($dto->toArray());
}

// CORRECT - returns DTO, uses repository
public function create(CreateOrderDTO $dto): OrderDTO
{
    $orderDTO = $this->repository->createFromDTO($dto);
    event(new OrderCreatedEvent($orderDTO));
    return $orderDTO;
}
```

## Other Common Anti-Patterns

| Anti-Pattern | Problem | Fix |
|-------------|---------|-----|
| Repository with business logic | Violates single responsibility | Move logic to service |
| Service calling another service's repository | Creates tight coupling | Call the other service instead |
| Skipping repository for "simple" queries | Inconsistent data access | Always go through repository |
| Fat DTOs with behavior | DTOs should be data-only | Move methods to services |
| Catching all exceptions in service | Hides errors from callers | Let specific exceptions bubble up |
