# Auth Controllers for Laravel Passport

Complete controller implementations for login, logout, and token refresh.

## Login Controller

```php
<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\DTOs\LoginDTO;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Laravel\Passport\TokenRepository;

class LoginController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $dto = LoginDTO::validateAndCreate($request->all());

        if (!Auth::attempt(['email' => $dto->email, 'password' => $dto->password])) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid credentials',
            ], 401);
        }

        $user = Auth::user();

        $token = $user->createToken('API Token', ['profile', 'email', 'wallet']);

        return response()->json([
            'success' => true,
            'message' => 'Login successful',
            'data' => [
                'access_token' => $token->accessToken,
                'token_type' => 'Bearer',
                'expires_at' => $token->token->expires_at,
            ],
        ]);
    }
}
```

## Logout Controllers

```php
<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LogoutController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $request->user()->token()->revoke();

        return response()->json([
            'success' => true,
            'message' => 'Logged out successfully',
        ]);
    }
}

class LogoutAllController extends Controller
{
    public function __invoke(Request $request): JsonResponse
    {
        $request->user()->tokens()->each(function ($token) {
            $token->revoke();
        });

        return response()->json([
            'success' => true,
            'message' => 'All sessions logged out',
        ]);
    }
}
```

## Token Refresh Controller

```php
<?php

declare(strict_types=1);

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Http;

class RefreshTokenController extends Controller
{
    public function __invoke(): JsonResponse
    {
        $response = Http::asForm()->post(config('app.url') . '/oauth/token', [
            'grant_type' => 'refresh_token',
            'refresh_token' => request('refresh_token'),
            'client_id' => config('passport.personal_access_client.id'),
            'client_secret' => config('passport.personal_access_client.secret'),
        ]);

        if ($response->failed()) {
            return response()->json([
                'success' => false,
                'message' => 'Unable to refresh token',
            ], 401);
        }

        return response()->json([
            'success' => true,
            'data' => $response->json(),
        ]);
    }
}
```

## User Info Endpoint

```php
Route::middleware('auth:api')->get('/me', function (Request $request) {
    return response()->json([
        'success' => true,
        'data' => [
            'id' => $request->user()->id,
            'email' => $request->user()->email,
            'name' => $request->user()->name,
            'scopes' => $request->user()->token()->scopes,
        ],
    ]);
});
```

## Impersonation

```php
public function impersonate(User $targetUser): JsonResponse
{
    $this->authorize('impersonate', $targetUser);

    $token = $targetUser->createToken('Impersonation', ['profile', 'email']);

    return response()->json([
        'access_token' => $token->accessToken,
        'impersonating' => true,
    ]);
}
```
