# Security Best Practices & PKCE

Detailed security patterns for Laravel Passport OAuth2 implementations.

## PKCE (Proof Key for Code Exchange)

For public clients (SPAs, mobile apps) that cannot securely store a client secret.

### Flow

1. Client generates a random `code_verifier` (43-128 characters)
2. Client computes `code_challenge = BASE64URL(SHA256(code_verifier))`
3. Authorization request includes the challenge
4. Token request includes the original verifier for server-side validation

### Authorization Request

```
GET /oauth/authorize?
    client_id=client-id&
    redirect_uri=https://app.example.com/callback&
    response_type=code&
    scope=profile email&
    code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&
    code_challenge_method=S256
```

### Token Exchange

```json
POST /oauth/token
{
    "grant_type": "authorization_code",
    "client_id": "client-id",
    "code": "authorization-code",
    "redirect_uri": "https://app.example.com/callback",
    "code_verifier": "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
}
```

## Token Storage (Frontend)

### HttpOnly Cookies (Recommended for Web)

Set by server, not accessible via JavaScript. Prevents XSS token theft.

### In-Memory Storage (SPAs)

```typescript
let accessToken: string | null = null;

function setToken(token: string) {
  accessToken = token;
}

function getToken(): string | null {
  return accessToken;
}
```

Tokens are lost on page refresh but immune to XSS via `document.cookie` or `localStorage`.

### Avoid localStorage

```typescript
// Vulnerable to XSS - avoid for access tokens
localStorage.setItem('token', accessToken);
```

## Rate Limiting Token Endpoints

```php
Route::middleware(['throttle:10,1'])->group(function () {
    Route::post('/oauth/token', [AccessTokenController::class, 'issueToken']);
});

RateLimiter::for('oauth', function (Request $request) {
    return Limit::perMinute(10)->by($request->ip());
});
```
