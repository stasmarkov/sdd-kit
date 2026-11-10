---
name: api-design
description: RESTful API design patterns. Use for endpoints, response formats, pagination, and error handling.
user-invocable: false
allowed-tools: Read, Grep, Glob, Edit, Write
---

# RESTful API Design Patterns

Patterns for designing consistent, developer-friendly REST APIs for any backend and frontend stack.

## When to Use This Skill

- Designing new REST APIs or endpoints
- Establishing API design standards
- Reviewing API specifications before implementation
- Creating developer-friendly API documentation
- Optimizing APIs for frontend consumption

## Quick Reference

| Task | Pattern |
|------|---------|
| List resources | `GET /resources` with pagination |
| Get single resource | `GET /resources/{id}` |
| Create resource | `POST /resources` with body |
| Update resource | `PATCH /resources/{id}` partial |
| Replace resource | `PUT /resources/{id}` full |
| Delete resource | `DELETE /resources/{id}` |
| Nested resources | `GET /users/{id}/orders` |
| Filter resources | `GET /resources?status=active` |

## When to Load References

| Task | Load |
|------|------|
| Framework route, response and documentation code; cursor pagination; a typed API client | the stack add-on's skill references, when a stack add-on is installed |

---

## URL Structure

### Resource Naming
```
# Collection resources (plural nouns)
GET    /api/v1/users
POST   /api/v1/users
GET    /api/v1/users/{id}
PUT    /api/v1/users/{id}
PATCH  /api/v1/users/{id}
DELETE /api/v1/users/{id}

# Nested resources
GET    /api/v1/users/{user_id}/orders
POST   /api/v1/users/{user_id}/orders

# Actions (when CRUD doesn't fit)
POST   /api/v1/orders/{id}/cancel
POST   /api/v1/users/{id}/verify-email
```

### Versioning
```
# URL path versioning (recommended)
/api/v1/users
/api/v2/users
```

---

## HTTP Methods

| Method | Purpose | Idempotent | Safe | Request Body |
|--------|---------|------------|------|--------------|
| GET | Retrieve resource(s) | Yes | Yes | No |
| POST | Create resource | No | No | Yes |
| PUT | Replace resource | Yes | No | Yes |
| PATCH | Partial update | Yes | No | Yes |
| DELETE | Remove resource | Yes | No | Optional |

### Framework Routes
> Framework implementation: see the stack add-on's skill references.

---

## Response Format

### Standard Response Structure
```json
{
  "success": true,
  "status": 200,
  "message": "Users retrieved successfully",
  "data": {}
}
```

### JsonResponseTrait
> Framework implementation: see the stack add-on's skill references.

### Error Response
```json
{
  "success": false,
  "status": 422,
  "message": "Validation failed",
  "errors": {
    "email": ["The email field is required."],
    "password": ["The password must be at least 8 characters."]
  }
}
```

---

## Status Codes

### Success Codes
| Code | Name | Use Case |
|------|------|----------|
| 200 | OK | Successful GET, PUT, PATCH, DELETE |
| 201 | Created | Successful POST (include Location header) |
| 204 | No Content | Successful DELETE with no body |

### Client Error Codes
| Code | Name | Use Case |
|------|------|----------|
| 400 | Bad Request | Malformed request syntax |
| 401 | Unauthorized | Missing/invalid authentication |
| 403 | Forbidden | Authenticated but not authorized |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Business rule violation |
| 422 | Unprocessable Entity | Validation errors |
| 429 | Too Many Requests | Rate limit exceeded |

---

## Filtering & Sorting

### Query Parameters
```
GET /api/v1/users?status=active
GET /api/v1/users?sort=-created_at
GET /api/v1/users?page=2&per_page=25
GET /api/v1/users?include=profile,orders
GET /api/v1/users?search=john
```

### Framework Implementation
> Framework implementation: see the stack add-on's skill references.

---

## Rate Limiting

> Framework implementation: see the stack add-on's skill references.

---

## Best Practices

### Do's
- Use plural nouns for resources (`/users`, not `/user`)
- Use kebab-case for multi-word (`/user-profiles`)
- Version your API from day one
- Use consistent response structures (JsonResponseTrait)
- Include timestamps in ISO 8601 format
- Use UUIDs, not auto-increment IDs in URLs

### Don'ts
- Don't use verbs in URLs (`/getUsers` → `GET /users`)
- Don't return arrays at root level
- Don't ignore rate limiting
- Don't return stack traces in production
- Don't use POST for everything
- Don't break changes without versioning

## Common Pitfalls

- **Inconsistent plurality**: Mixing `/user` and `/orders` → Pick one convention
- **Ignoring HTTP status**: Returning 200 for errors → Use appropriate status codes
- **No pagination**: Returning all records → Always paginate collections
- **Missing validation errors**: Generic "Bad request" → Return field-level errors
- **Exposing internal IDs**: Sequential IDs leak info → Use UUIDs

---

## Related Skills

- **dto-first**: Data transfer objects for API payloads
- **error-handling-patterns**: Structured error responses
- **oauth2-passport**: OAuth2 API authentication

---