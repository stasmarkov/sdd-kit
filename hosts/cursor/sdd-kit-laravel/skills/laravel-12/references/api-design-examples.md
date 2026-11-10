# API Design Examples

Framework code examples moved out of the core skill.

### Laravel Routes

```php
Route::prefix('v1')->group(function () {
    Route::get('/users', ListUsersController::class);
    Route::post('/users', CreateUserController::class);
    Route::get('/users/{user}', ShowUserController::class);
    Route::patch('/users/{user}', UpdateUserController::class);
    Route::delete('/users/{user}', DeleteUserController::class);

    Route::get('/users/{user}/orders', ListUserOrdersController::class);
});
```

### JsonResponseTrait

```php
trait JsonResponseTrait
{
    protected function success(mixed $data, string $message = 'Success', int $status = 200): JsonResponse
    {
        return response()->json([
            'success' => true,
            'status' => $status,
            'message' => $message,
            'data' => $data,
        ], $status);
    }

    protected function error(string $message, int $status = 400, ?array $errors = null): JsonResponse
    {
        $response = [
            'success' => false,
            'status' => $status,
            'message' => $message,
        ];

        if ($errors !== null) {
            $response['errors'] = $errors;
        }

        return response()->json($response, $status);
    }

    protected function paginated(LengthAwarePaginator $paginator, string $message = 'Success'): JsonResponse
    {
        return response()->json([
            'success' => true,
            'status' => 200,
            'message' => $message,
            'data' => $paginator->items(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
                'last_page' => $paginator->lastPage(),
            ],
            'links' => [
                'first' => $paginator->url(1),
                'last' => $paginator->url($paginator->lastPage()),
                'prev' => $paginator->previousPageUrl(),
                'next' => $paginator->nextPageUrl(),
            ],
        ]);
    }
}
```

### Laravel Implementation

```php
use Spatie\QueryBuilder\QueryBuilder;
use Spatie\QueryBuilder\AllowedFilter;

class UserIndexController
{
    public function __invoke(Request $request): JsonResponse
    {
        $users = QueryBuilder::for(User::class)
            ->allowedFilters([
                'status',
                'role',
                AllowedFilter::scope('search'),
                AllowedFilter::exact('email'),
            ])
            ->allowedSorts(['name', 'email', 'created_at'])
            ->allowedIncludes(['profile', 'orders'])
            ->defaultSort('-created_at')
            ->paginate($request->get('per_page', 15));

        return $this->paginated($users, 'Users retrieved successfully');
    }
}
```

## Rate Limiting

```php
RateLimiter::for('api', function (Request $request) {
    return Limit::perMinute(60)->by($request->user()?->id ?: $request->ip());
});

RateLimiter::for('auth', function (Request $request) {
    return [
        Limit::perMinute(5)->by($request->ip()),
        Limit::perDay(100)->by($request->ip()),
    ];
});
```
