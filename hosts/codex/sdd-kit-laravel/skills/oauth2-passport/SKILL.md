---
name: oauth2-passport
description: Laravel Passport OAuth2 patterns. Use for token auth, scopes, PKCE, and API authentication.
user-invocable: false
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
paths:
  - "config/passport.php"
  - "routes/api.php"
  - "app/**/Auth/**"
---

# OAuth2 with Laravel Passport

Knowledge module for implementing OAuth2 authentication with Laravel Passport.

## When to Load References

| Task | Load |
|------|------|
| Building login/logout/refresh controllers | `references/auth-controllers.md` |
| Implementing PKCE, token storage, rate limiting | `references/security-and-pkce.md` |
| Writing Pest tests for OAuth flows | `references/testing-oauth.md` |

---

## Installation & Setup

```bash
composer require laravel/passport
php artisan migrate
php artisan passport:install
```

### Configuration

```php
// config/auth.php
'guards' => [
    'api' => [
        'driver' => 'passport',
        'provider' => 'users',
    ],
],

// app/Models/User.php
use Laravel\Passport\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens;
}
```

### Key Generation

```bash
php artisan passport:keys
php artisan passport:client --personal
php artisan passport:client --password
```

---

## Grant Types

### Authorization Code Grant (Web Apps)

```
1. Client redirects user to authorization endpoint
2. User authenticates and approves
3. Server redirects back with authorization code
4. Client exchanges code for access token
```

### Password Grant (First-Party Apps)

```json
POST /oauth/token
{
    "grant_type": "password",
    "client_id": "client-id",
    "client_secret": "client-secret",
    "username": "user@example.com",
    "password": "password",
    "scope": "*"
}
```

### Client Credentials Grant (Machine-to-Machine)

```json
POST /oauth/token
{
    "grant_type": "client_credentials",
    "client_id": "client-id",
    "client_secret": "client-secret",
    "scope": "read-orders"
}
```

### Refresh Token Grant

```json
POST /oauth/token
{
    "grant_type": "refresh_token",
    "refresh_token": "refresh-token-here",
    "client_id": "client-id",
    "client_secret": "client-secret"
}
```

---

## Token Management

### Defining Scopes

```php
// app/Providers/AuthServiceProvider.php
use Laravel\Passport\Passport;

public function boot(): void
{
    Passport::tokensCan([
        'profile' => 'Access user profile',
        'email' => 'Access user email',
        'orders' => 'Access order history',
        'wallet' => 'Access wallet balance',
        'payments' => 'Create and manage payments',
    ]);

    Passport::defaultScopes(['profile', 'email']);
}
```

### Scope Middleware

```php
// Require specific scope
Route::middleware(['auth:api', 'scope:payments'])->group(function () {
    Route::post('/payments', CreatePaymentController::class);
});

// Require any of the listed scopes
Route::middleware(['auth:api', 'scopes:orders,payments'])->group(function () {
    Route::get('/transactions', TransactionController::class);
});
```

### Token Lifetimes

```php
Passport::tokensExpireIn(now()->addHours(6));
Passport::refreshTokensExpireIn(now()->addDays(30));
Passport::personalAccessTokensExpireIn(now()->addMonths(6));
```

---

## Quick Auth Patterns

### Creating a Token

```php
$token = $user->createToken('API Token', ['profile', 'email']);
$accessToken = $token->accessToken;
$expiresAt = $token->token->expires_at;
```

### Revoking Tokens

```php
// Current token
$request->user()->token()->revoke();

// All user tokens
$request->user()->tokens()->each(fn ($token) => $token->revoke());
```

### Testing with Passport

```php
use Laravel\Passport\Passport;

Passport::actingAs($user, ['profile', 'email'], 'api');
```

---

## Security Checklist

- Use PKCE for public clients (SPAs, mobile) -- see `references/security-and-pkce.md`
- Store tokens in HttpOnly cookies for web, in-memory for SPAs
- Never store access tokens in localStorage
- Rate-limit `/oauth/token` endpoints
- Set appropriate token lifetimes (short access, longer refresh)
- Use narrow scopes; avoid wildcard `*` scope in production
- Validate scopes via middleware on every protected route

---