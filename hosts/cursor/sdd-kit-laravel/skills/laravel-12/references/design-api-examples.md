# Design API Examples

Framework code examples moved out of the core skill.

#### Request DTOs

```php
class CreateUserDTO extends Data
{
    public function __construct(
        #[Required, Email]
        public readonly string $email,

        #[Required, Min(8)]
        public readonly string $password,

        #[StringType, Max(100)]
        public readonly ?string $name = null,
    ) {}
}
```

#### Response Resources

```php
class UserResource extends JsonResource
{
    public function toArray($request): array
    {
        return [
            'id' => $this->id,
            'email' => $this->email,
            'name' => $this->name,
            'created_at' => $this->created_at->toISOString(),
        ];
    }
}
```

### Step 5: Authentication & Authorization

```php
// Routes with auth middleware
Route::middleware(['auth:api'])->group(function () {
    Route::apiResource('users', UserController::class);
});

// Policy authorization in controller
public function show(User $user): JsonResponse
{
    $this->authorize('view', $user);
    return $this->resource(new UserResource($user));
}
```
