---
paths:
  - "app/Http/Controllers/**"
  - "app/Http/Requests/**"
  - "app/Http/Resources/**"
  - "routes/api.php"
  - "**/Application/Http/**"
---

# API controllers and routes

## Shape

- One action per controller: a `final` class with `__invoke()`, named `<Verb><Entity>Controller` (`CreateOrderController`).
- A controller does exactly this: authorize, build the DTO, call one service method, return the response.
  No queries, no business rules, no `DB::transaction` in a controller.
- Inject services through the constructor. Never call `Model::query()` or a repository directly from a controller.

```php
final class CreateOrderController extends Controller
{
    public function __construct(private readonly OrderService $orders) {}

    public function __invoke(Request $request): JsonResponse
    {
        $this->authorize('create', Order::class);
        $order = $this->orders->create(CreateOrderDTO::validateAndCreate($request->all()));

        return $this->resource($order->toApiArray(), 'Order created', Response::HTTP_CREATED);
    }
}
```

## Routes

- Version every route under `/api/v1/...`. Breaking changes go to a new version, not into the existing one.
- Use plural nouns for resources (`/orders/{order}`) and verbs only for non-CRUD actions (`/orders/{order}/cancel`).
- Every route except explicitly public ones sits behind `auth:<guard>` middleware, plus a rate limiter on auth and write endpoints.
- After you change a route, check it with `php artisan route:list --path=api/v1/<area>`.

## Responses

- Use the project's response helper (`<JsonResponseTrait>`) so every endpoint returns
  `{ success, status, message, data }`. Never hand-roll `response()->json()` shapes.
- Never return Eloquent models or `toArray()` output. Return the DTO's API array or a Resource.
- Status codes: 201 for create, 204 for delete, 422 for validation, 403 for policy denial, 404 for missing records.
- Paginated lists return `data` plus `meta` (`current_page`, `per_page`, `total`). Cap `per_page`.

## Contract

- A new or changed endpoint updates `<docs/api/api-contracts.md>` in the same change.
- If the browser calls this endpoint, the frontend types and fetchers need updating too. Grep the frontend before you call the task done.
- Authorization goes in Policies, never in inline `if ($user->role === ...)` checks.
