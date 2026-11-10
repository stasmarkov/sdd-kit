# Testing OAuth with Laravel Passport

Feature test patterns using Pest for OAuth authentication flows.

## Full Test Suite

```php
<?php

use App\Models\User;
use Laravel\Passport\Passport;

describe('OAuth Authentication', function () {
    it('authenticates user and returns token', function () {
        $user = User::factory()->create([
            'password' => bcrypt('password'),
        ]);

        $response = $this->postJson('/api/v1/auth/login', [
            'email' => $user->email,
            'password' => 'password',
        ]);

        $response->assertOk()
            ->assertJsonStructure([
                'data' => [
                    'access_token',
                    'token_type',
                    'expires_at',
                ],
            ]);
    });

    it('accesses protected route with token', function () {
        $user = User::factory()->create();

        Passport::actingAs($user, ['profile', 'email'], 'api');

        $response = $this->getJson('/api/v1/me');

        $response->assertOk()
            ->assertJson([
                'data' => [
                    'email' => $user->email,
                ],
            ]);
    });

    it('rejects invalid token', function () {
        $response = $this->withHeaders([
            'Authorization' => 'Bearer invalid-token',
        ])->getJson('/api/v1/me');

        $response->assertUnauthorized();
    });

    it('respects token scopes', function () {
        $user = User::factory()->create();

        Passport::actingAs($user, ['profile'], 'api');

        $response = $this->postJson('/api/v1/payments', [
            'amount' => 1000,
        ]);

        $response->assertStatus(403);
    });
});
```

## Key Testing Patterns

- Use `Passport::actingAs($user, $scopes, 'api')` to simulate authenticated requests
- Test both valid and invalid token scenarios
- Verify scope enforcement on protected routes
- Test token structure in login responses
