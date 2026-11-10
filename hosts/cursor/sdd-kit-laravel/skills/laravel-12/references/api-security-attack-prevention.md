# Attack Prevention Patterns

Detailed code examples for preventing SQL injection, XSS, and other attacks.

## SQL Injection Prevention

### Use Eloquent/Query Builder
```php
// Safe - parameterized query
User::where('email', $email)->first();

// Safe - query builder
DB::table('users')
    ->where('status', $status)
    ->get();

// DANGEROUS - raw query with user input
DB::select("SELECT * FROM users WHERE email = '$email'");

// Safe raw query with bindings
DB::select('SELECT * FROM users WHERE email = ?', [$email]);
```

### Safe Like Queries
```php
// Escape special characters for LIKE
$search = str_replace(['%', '_'], ['\%', '\_'], $search);
User::where('name', 'like', "%{$search}%")->get();

// Or use the escape method
$search = $request->input('search');
User::where('name', 'like', '%' . addcslashes($search, '%_') . '%')->get();
```

## XSS Protection

### Output Encoding
```php
// Blade templates auto-escape
{{ $user->name }}  // Safe - HTML encoded

// Raw output - USE WITH CAUTION
{!! $trustedHtml !!}  // Only for trusted content

// In JSON responses - Laravel auto-escapes
return response()->json([
    'name' => $user->name,  // Safe
]);
```

### Content Security Policy
```php
// Middleware to set CSP header
class ContentSecurityPolicy
{
    public function handle(Request $request, Closure $next)
    {
        $response = $next($request);

        $response->headers->set('Content-Security-Policy',
            "default-src 'self'; " .
            "script-src 'self' 'unsafe-inline'; " .
            "style-src 'self' 'unsafe-inline'; " .
            "img-src 'self' data: https:; " .
            "font-src 'self'; " .
            "connect-src 'self' https://api.example.com;"
        );

        return $response;
    }
}
```

## Security Headers Middleware

```php
class SecurityHeaders
{
    public function handle(Request $request, Closure $next)
    {
        $response = $next($request);

        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('X-Frame-Options', 'DENY');
        $response->headers->set('X-XSS-Protection', '1; mode=block');
        $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        $response->headers->set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

        // HSTS (only in production with HTTPS)
        if (app()->environment('production')) {
            $response->headers->set(
                'Strict-Transport-Security',
                'max-age=31536000; includeSubDomains'
            );
        }

        return $response;
    }
}
```

## Sensitive Data Protection

### Never Expose Sensitive Fields
```php
// In Model
protected $hidden = [
    'password',
    'remember_token',
    'api_secret',
];

// In API Resource
public function toArray(Request $request): array
{
    return [
        'id' => $this->id,
        'email' => $this->email,
        // Never include password, tokens, etc.
    ];
}
```

### Mask Sensitive Data in Logs
```php
// config/logging.php
'replace_placeholders' => true,

// In code
logger()->info('Payment processed', [
    'user_id' => $user->id,
    'card_last_four' => substr($cardNumber, -4),
    // Never log full card numbers, passwords, etc.
]);
```

### Environment Variables
```php
// Never commit secrets to git
// Use .env for local, environment variables in production

// .env
APP_KEY=base64:...
DB_PASSWORD=secret
PASSPORT_PRIVATE_KEY=...

// Always in .gitignore
.env
.env.local
```
