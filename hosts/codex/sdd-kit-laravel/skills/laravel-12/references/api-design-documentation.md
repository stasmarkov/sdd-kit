# API Documentation Patterns

## OpenAPI/Swagger

```yaml
openapi: 3.0.0
info:
  title: API
  version: 1.0.0
paths:
  /api/v1/users:
    get:
      summary: List users
      tags: [Users]
      parameters:
        - name: status
          in: query
          schema:
            type: string
            enum: [active, inactive, pending]
      responses:
        '200':
          description: Successful response
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/UserCollection'
```

## Scribe Annotations (Laravel)

```php
/**
 * @group User Management
 *
 * APIs for managing users
 */
class UserStoreController
{
    /**
     * Create a user
     *
     * Creates a new user account.
     *
     * @authenticated
     * @bodyParam email string required The user's email. Example: user@example.com
     * @bodyParam password string required Min 8 characters. Example: password123
     * @bodyParam name string The user's name. Example: John Doe
     *
     * @response 201 {
     *   "success": true,
     *   "status": 201,
     *   "message": "User created successfully",
     *   "data": {
     *     "id": "550e8400-e29b-41d4-a716-446655440000",
     *     "email": "user@example.com"
     *   }
     * }
     */
    public function __invoke(Request $request): JsonResponse
    {
        // ...
    }
}
```
