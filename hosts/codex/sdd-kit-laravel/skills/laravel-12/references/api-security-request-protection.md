# Request Protection Patterns

Detailed code examples for CORS, rate limiting, and input validation.

## CORS Configuration

### Full Laravel CORS Setup
```php
// config/cors.php
return [
    'paths' => ['api/*', 'oauth/*'],

    'allowed_methods' => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

    'allowed_origins' => [
        'https://app.example.com',
        'https://admin.example.com',
    ],

    'allowed_origins_patterns' => [
        // Regex patterns for dynamic subdomains
    ],

    'allowed_headers' => [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'Accept',
    ],

    'exposed_headers' => [
        'X-RateLimit-Limit',
        'X-RateLimit-Remaining',
    ],

    'max_age' => 86400, // 24 hours

    'supports_credentials' => true,
];
```

### Environment-Based CORS
```php
// config/cors.php
'allowed_origins' => explode(',', env('CORS_ALLOWED_ORIGINS', 'https://app.example.com')),
```

## Rate Limiting

### Configuring Rate Limits
```php
// bootstrap/app.php or RouteServiceProvider
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Support\Facades\RateLimiter;

RateLimiter::for('api', function (Request $request) {
    return Limit::perMinute(60)->by(
        $request->user()?->id ?: $request->ip()
    );
});

// Stricter limits for authentication
RateLimiter::for('auth', function (Request $request) {
    return [
        Limit::perMinute(5)->by($request->ip()),
        Limit::perDay(100)->by($request->ip()),
    ];
});

// Per-endpoint limits
RateLimiter::for('exports', function (Request $request) {
    return Limit::perHour(10)->by($request->user()->id);
});
```

### Applying Rate Limits
```php
// Routes
Route::middleware(['throttle:api'])->group(function () {
    Route::get('/users', UserIndexController::class);
});

Route::middleware(['throttle:auth'])->group(function () {
    Route::post('/auth/login', LoginController::class);
    Route::post('/auth/register', RegisterController::class);
});
```

## Input Validation

### Form Request Validation
```php
<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rules\Password;

class CreateUserRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'email' => [
                'required',
                'email:rfc,dns',
                'unique:users,email',
                'max:255',
            ],
            'password' => [
                'required',
                Password::min(8)
                    ->letters()
                    ->mixedCase()
                    ->numbers()
                    ->symbols()
                    ->uncompromised(),
            ],
            'name' => [
                'nullable',
                'string',
                'max:100',
                'regex:/^[\p{L}\s\-\'\.]+$/u', // Only letters, spaces, hyphens
            ],
        ];
    }
}
```

### Sanitization
```php
// Sanitize HTML content
use Stevebauman\Purify\Facades\Purify;

$cleanContent = Purify::clean($request->input('content'));

// Strip tags
$plainText = strip_tags($request->input('bio'));

// Cast to expected type
$amount = (int) $request->input('amount');
```
