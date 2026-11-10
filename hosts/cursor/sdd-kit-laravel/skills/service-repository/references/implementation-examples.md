# Service-Repository Implementation Examples

Full code examples for each layer of the Service-Repository pattern.

## Controller

```php
<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\DTOs\CreateOrderDTO;
use App\Http\Resources\OrderResource;
use App\Services\OrderService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class CreateOrderController extends Controller
{
    public function __construct(
        private readonly OrderService $orderService
    ) {}

    public function __invoke(Request $request): JsonResponse
    {
        // Authorization
        $this->authorize('create', Order::class);

        // DTO validation
        $dto = CreateOrderDTO::validateAndCreate($request->all());

        // Delegate to service
        $orderDTO = $this->orderService->create($dto);

        // Return response
        return response()->json([
            'success' => true,
            'status' => Response::HTTP_CREATED,
            'message' => 'Order created successfully',
            'data' => $orderDTO->toApiArray(),
        ], Response::HTTP_CREATED);
    }
}
```

## Service

```php
<?php

declare(strict_types=1);

namespace App\Services;

use App\Contracts\OrderRepositoryInterface;
use App\Contracts\InventoryServiceInterface;
use App\DTOs\CreateOrderDTO;
use App\DTOs\OrderDTO;
use App\Events\OrderCreatedEvent;
use App\Exceptions\InsufficientInventoryException;
use Illuminate\Support\Facades\DB;

class OrderService
{
    public function __construct(
        private readonly OrderRepositoryInterface $repository,
        private readonly InventoryServiceInterface $inventory
    ) {}

    public function create(CreateOrderDTO $dto): OrderDTO
    {
        // Business rule validation
        $this->validateBusinessRules($dto);

        // Check inventory
        if (!$this->inventory->hasStock($dto->product_id, $dto->quantity)) {
            throw new InsufficientInventoryException();
        }

        // Transaction for data integrity
        return DB::transaction(function () use ($dto) {
            // Create order via repository
            $orderDTO = $this->repository->createFromDTO($dto);

            // Reserve inventory
            $this->inventory->reserve($dto->product_id, $dto->quantity);

            // Dispatch event with DTO
            event(new OrderCreatedEvent($orderDTO, auth()->id()));

            return $orderDTO;
        });
    }

    public function findById(string $id): ?OrderDTO
    {
        return $this->repository->findByIdAsDTO($id);
    }

    public function cancel(string $id): OrderDTO
    {
        $order = $this->repository->findModelById($id);

        if (!$order->canBeCancelled()) {
            throw new OrderCannotBeCancelledException();
        }

        return DB::transaction(function () use ($order) {
            // Release inventory
            $this->inventory->release($order->product_id, $order->quantity);

            // Update order status
            return $this->repository->updateStatus($order->id, 'cancelled');
        });
    }

    private function validateBusinessRules(CreateOrderDTO $dto): void
    {
        if ($dto->quantity < 1) {
            throw new InvalidOrderException('Quantity must be at least 1');
        }

        if ($dto->amount < 100) {
            throw new InvalidOrderException('Minimum order amount is $1.00');
        }
    }
}
```

## Repository Interface

```php
<?php

declare(strict_types=1);

namespace App\Contracts;

use App\DTOs\CreateOrderDTO;
use App\DTOs\OrderDTO;
use App\DTOs\OrderFilterDTO;
use App\Models\Order;
use Illuminate\Support\Collection;

interface OrderRepositoryInterface
{
    // DTO methods (primary API)
    public function findByIdAsDTO(string $id): ?OrderDTO;
    public function createFromDTO(CreateOrderDTO $dto): OrderDTO;
    public function updateStatus(string $id, string $status): OrderDTO;
    public function findByFilter(OrderFilterDTO $filter): Collection;

    // Model methods (when Eloquent features needed)
    public function findModelById(string $id): ?Order;
    public function deleteById(string $id): bool;
}
```

## Repository Implementation

```php
<?php

declare(strict_types=1);

namespace App\Repositories;

use App\Contracts\OrderRepositoryInterface;
use App\DTOs\CreateOrderDTO;
use App\DTOs\OrderDTO;
use App\DTOs\OrderFilterDTO;
use App\Models\Order;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;

class EloquentOrderRepository implements OrderRepositoryInterface
{
    public function findByIdAsDTO(string $id): ?OrderDTO
    {
        return Cache::tags(['orders'])->remember(
            "order:{$id}",
            3600,
            function () use ($id) {
                $order = Order::find($id);
                return $order ? OrderDTO::from($order) : null;
            }
        );
    }

    public function createFromDTO(CreateOrderDTO $dto): OrderDTO
    {
        $order = Order::create(array_merge(
            $dto->toModelArray(),
            ['user_id' => auth()->id()]
        ));

        // Invalidate cache
        Cache::tags(['orders'])->flush();

        return OrderDTO::from($order);
    }

    public function updateStatus(string $id, string $status): OrderDTO
    {
        $order = Order::findOrFail($id);
        $order->update(['status' => $status]);

        // Invalidate specific cache
        Cache::tags(['orders'])->forget("order:{$id}");

        return OrderDTO::from($order->fresh());
    }

    public function findByFilter(OrderFilterDTO $filter): Collection
    {
        $query = Order::query()->with(['user', 'items']);

        $filter->applyToQuery($query);

        return $query->paginate($filter->per_page)
            ->through(fn ($order) => OrderDTO::from($order));
    }

    public function findModelById(string $id): ?Order
    {
        return Order::find($id);
    }

    public function deleteById(string $id): bool
    {
        return Order::destroy($id) > 0;
    }
}
```

## Dependency Injection Setup

### Service Provider

```php
<?php

declare(strict_types=1);

namespace App\Providers;

use App\Contracts\OrderRepositoryInterface;
use App\Repositories\EloquentOrderRepository;
use Illuminate\Support\ServiceProvider;

class RepositoryServiceProvider extends ServiceProvider
{
    public array $bindings = [
        OrderRepositoryInterface::class => EloquentOrderRepository::class,
        UserRepositoryInterface::class => EloquentUserRepository::class,
    ];
}
```
