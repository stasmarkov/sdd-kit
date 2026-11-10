# Service-Repository Testing Patterns

Testing strategies for each layer using Pest PHP.

## Service Tests

Mock repository and external dependencies. Test business logic in isolation.

```php
<?php

use App\Contracts\OrderRepositoryInterface;
use App\Contracts\InventoryServiceInterface;
use App\DTOs\CreateOrderDTO;
use App\DTOs\OrderDTO;
use App\Services\OrderService;

describe('OrderService', function () {
    beforeEach(function () {
        $this->repository = Mockery::mock(OrderRepositoryInterface::class);
        $this->inventory = Mockery::mock(InventoryServiceInterface::class);

        $this->service = new OrderService(
            $this->repository,
            $this->inventory
        );
    });

    it('creates order when inventory available', function () {
        $dto = new CreateOrderDTO(
            product_id: 'prod-123',
            quantity: 2,
            amount: 5000
        );

        $expectedDTO = new OrderDTO(
            id: 'order-123',
            product_id: 'prod-123',
            quantity: 2,
            amount: 5000,
            status: 'pending',
            created_at: now(),
            updated_at: now()
        );

        $this->inventory->shouldReceive('hasStock')
            ->with('prod-123', 2)
            ->andReturn(true);

        $this->repository->shouldReceive('createFromDTO')
            ->with($dto)
            ->andReturn($expectedDTO);

        $this->inventory->shouldReceive('reserve')
            ->with('prod-123', 2);

        $result = $this->service->create($dto);

        expect($result)->toBeInstanceOf(OrderDTO::class);
        expect($result->id)->toBe('order-123');
    });

    it('throws exception when inventory insufficient', function () {
        $dto = new CreateOrderDTO(
            product_id: 'prod-123',
            quantity: 100,
            amount: 5000
        );

        $this->inventory->shouldReceive('hasStock')
            ->with('prod-123', 100)
            ->andReturn(false);

        expect(fn() => $this->service->create($dto))
            ->toThrow(InsufficientInventoryException::class);
    });
});
```

## Repository Tests

Use real database (integration tests). Verify data persistence and DTO conversion.

```php
<?php

use App\DTOs\CreateOrderDTO;
use App\Models\Order;
use App\Repositories\EloquentOrderRepository;

describe('EloquentOrderRepository', function () {
    beforeEach(function () {
        $this->repository = new EloquentOrderRepository();
    });

    it('creates order from DTO', function () {
        $dto = new CreateOrderDTO(
            product_id: 'prod-123',
            quantity: 2,
            amount: 5000
        );

        $result = $this->repository->createFromDTO($dto);

        expect($result)->toBeInstanceOf(OrderDTO::class);
        expect($result->product_id)->toBe('prod-123');
        expect(Order::count())->toBe(1);
    });

    it('returns null for non-existent order', function () {
        $result = $this->repository->findByIdAsDTO('non-existent');
        expect($result)->toBeNull();
    });
});
```

## Testing Guidelines

| Layer | Test Type | Dependencies | Key Assertions |
|-------|-----------|-------------|----------------|
| Service | Unit | Mocked repo + services | Business rules, exceptions, events |
| Repository | Integration | Real database | Data persistence, DTO conversion, queries |
| Controller | Feature | Full stack | HTTP status, response structure, auth |
