# Authentication & Authorization Patterns

Detailed code examples for Laravel API authentication and authorization.

## Token-Based Auth (Passport)

```php
// Protect routes with auth middleware
Route::middleware('auth:api')->group(function () {
    Route::get('/users', UserIndexController::class);
    Route::post('/orders', CreateOrderController::class);
});

// Scope-based authorization
Route::middleware(['auth:api', 'scope:orders'])->group(function () {
    Route::get('/orders', OrderIndexController::class);
});
```

## Policy Authorization

```php
// In controller
public function __invoke(Request $request, string $id): JsonResponse
{
    $order = Order::findOrFail($id);

    // Policy check
    $this->authorize('view', $order);

    return response()->json($order);
}

// Policy class
class OrderPolicy
{
    public function view(User $user, Order $order): bool
    {
        return $user->id === $order->user_id;
    }

    public function update(User $user, Order $order): bool
    {
        return $user->id === $order->user_id
            && $order->status !== 'completed';
    }
}
```

## CSRF Protection

### API Tokens (Stateless)
```php
// For token-based auth, CSRF is not needed
// Tokens provide protection instead

// Disable CSRF for API routes (already done in Laravel)
// In app/Http/Middleware/VerifyCsrfToken.php
protected $except = [
    'api/*',
    'oauth/*',
];
```

### SPA with Cookies
```php
// If using cookie-based auth with SPA
Route::get('/sanctum/csrf-cookie', function () {
    return response()->noContent();
});

// Frontend must call this first, then include
// X-XSRF-TOKEN header in subsequent requests
```
