# Controller Patterns

Invokable controllers and API resource patterns for Laravel 12.

## Invokable Controller

Single-action controllers with `__invoke()`:

```php
<?php

declare(strict_types=1);

namespace App\Http\Controllers;

use App\DTOs\CreateUserDTO;
use App\Http\Resources\UserResource;
use App\Services\UserService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class CreateUserController extends Controller
{
    public function __construct(
        private readonly UserService $userService
    ) {}

    public function __invoke(Request $request): JsonResponse
    {
        $this->authorize('create', User::class);

        $dto = CreateUserDTO::validateAndCreate($request->all());
        $user = $this->userService->create($dto);

        return response()->json([
            'success' => true,
            'status' => Response::HTTP_CREATED,
            'message' => 'User created successfully',
            'data' => new UserResource($user),
        ], Response::HTTP_CREATED);
    }
}
```

## API Resources

### Basic Resource

```php
<?php

declare(strict_types=1);

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class UserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'email' => $this->email,
            'name' => $this->name,
            'status' => $this->status?->value,
            'created_at' => $this->created_at?->toISOString(),

            // Conditional fields
            'profile' => $this->whenLoaded('profile', fn() => new ProfileResource($this->profile)),
            'orders_count' => $this->when(isset($this->orders_count), $this->orders_count),
        ];
    }
}
```

## Form Requests

```php
<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class CreateUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // Use policies for authorization
    }

    public function rules(): array
    {
        return [
            'email' => ['required', 'email', 'unique:users'],
            'password' => ['required', 'min:8', 'confirmed'],
            'name' => ['nullable', 'string', 'max:100'],
        ];
    }

    public function messages(): array
    {
        return [
            'email.unique' => 'This email is already registered.',
        ];
    }
}
```

## Routing

### Invokable Routes

```php
// routes/api.php
Route::prefix('api/v1')->middleware(['api', 'auth:api'])->group(function () {
    Route::post('/users', CreateUserController::class);
    Route::get('/users', ListUsersController::class);
    Route::get('/users/{id}', ShowUserController::class);
    Route::put('/users/{id}', UpdateUserController::class);
    Route::delete('/users/{id}', DeleteUserController::class);
});
```

### Resource Routes (Alternative)

```php
Route::apiResource('users', UserController::class);
```

## Response Format

Consistent JSON structure:

```json
{
    "success": true,
    "status": 201,
    "message": "User created successfully",
    "data": {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "email": "user@example.com",
        "name": "John Doe"
    }
}
```

## Error Responses

```json
{
    "success": false,
    "status": 422,
    "message": "Validation failed",
    "errors": {
        "email": ["The email field is required."]
    }
}
```

## Best Practices

- Use invokable controllers for single actions
- Keep controllers thin - delegate to services
- Use DTOs for input validation
- Use Resources for output transformation
- Always authorize with policies
- Return consistent response structure
