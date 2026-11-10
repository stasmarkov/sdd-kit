# Advanced API Patterns

## Cursor-Based Pagination

Use when: Large datasets, real-time data, or infinite scroll UIs.

```php
public function __invoke(Request $request): JsonResponse
{
    $perPage = min($request->input('per_page', 20), 100);
    $cursor = $request->input('cursor');

    $query = User::query()->orderBy('created_at', 'desc');

    if ($cursor) {
        $decodedCursor = base64_decode($cursor);
        [$createdAt, $id] = explode(':', $decodedCursor);
        $query->where(function ($q) use ($createdAt, $id) {
            $q->where('created_at', '<', $createdAt)
              ->orWhere(function ($q) use ($createdAt, $id) {
                  $q->where('created_at', '=', $createdAt)
                    ->where('id', '<', $id);
              });
        });
    }

    $users = $query->limit($perPage + 1)->get();
    $hasMore = $users->count() > $perPage;

    if ($hasMore) {
        $users = $users->slice(0, $perPage);
    }

    $nextCursor = null;
    if ($hasMore && $users->isNotEmpty()) {
        $last = $users->last();
        $nextCursor = base64_encode("{$last->created_at->toISOString()}:{$last->id}");
    }

    return response()->json([
        'data' => UserResource::collection($users),
        'meta' => [
            'has_more' => $hasMore,
            'next_cursor' => $nextCursor,
        ],
    ]);
}
```

## API Versioning Strategies

### URL Versioning (Recommended)

```php
Route::prefix('v1')->group(base_path('routes/api/v1.php'));
Route::prefix('v2')->group(base_path('routes/api/v2.php'));
```

### Header Versioning

```php
class ApiVersion
{
    public function handle(Request $request, Closure $next): Response
    {
        $version = $request->header('Api-Version', 'v1');
        $request->attributes->set('api_version', $version);
        return $next($request);
    }
}
```

## Laravel API Resource with HATEOAS

```php
class UserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->uuid,
            'type' => 'user',
            'attributes' => [
                'name' => $this->name,
                'email' => $this->email,
                'created_at' => $this->created_at->toISOString(),
                'updated_at' => $this->updated_at->toISOString(),
            ],
            'relationships' => [
                'orders' => [
                    'count' => $this->whenCounted('orders'),
                    'links' => [
                        'related' => route('users.orders.index', $this->uuid),
                    ],
                ],
            ],
            'links' => [
                'self' => route('users.show', $this->uuid),
            ],
        ];
    }
}
```
