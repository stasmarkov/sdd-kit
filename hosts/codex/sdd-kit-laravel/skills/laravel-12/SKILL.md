---
name: laravel-12
description: Laravel 12 API patterns. Use for services, models, controllers, and backend architecture decisions.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
paths:
  - "**/*.php"
  - "app/**"
  - "routes/**"
  - "database/**"
---

# Laravel 12 Development Patterns

Apply these patterns when building Laravel API backends.

## Quick Reference

| Task | Pattern |
|------|---------|
| Primary keys | UUID via `HasUuids` trait |
| Type casting | `casts()` method, not `$casts` property |
| Controllers | Invokable single-action |
| Data transfer | DTOs via Spatie Laravel Data |
| Data access | Repository pattern with interfaces |
| Middleware | Configure in `bootstrap/app.php` |

## When to Load References

| Task | Load |
|------|------|
| Writing Eloquent models | `references/eloquent-patterns.md` |
| Implementing services/repositories | `references/service-layer.md` |
| Creating controllers/routes | `references/controller-patterns.md` |
| Writing Pest tests | `references/testing-patterns.md` |
| Scaffolding modules | `references/module-scaffolding.md` |
| Calling external APIs, receiving or sending webhooks | `references/external-integrations.md` |
| Diagnosing slow queries, caching, queues | `references/performance-tuning.md` |
| API security (injection, XSS, CORS, rate limits, Passport auth) | `references/api-security-attack-prevention.md`, `references/api-security-authentication.md`, `references/api-security-request-protection.md` |
| Layered architecture, DDD entities, repository adapters | `references/architecture-application-services.md`, `references/architecture-domain-entities.md`, `references/architecture-repository-adapters.md` |
| Schema to migration and model code, data-integrity patterns | `references/schema-implementation-examples.md`, `references/schema-data-integrity.md` |
| Result type, retries and resilience | `references/error-result-type.md`, `references/error-retry-resilience.md` |
| Versioning, HATEOAS, Scribe documentation | `references/api-design-advanced-patterns.md`, `references/api-design-documentation.md` |
| Dependabot for Composer and npm | `references/dependabot.md` |
| Laravel CI pipeline | `references/ci-pipeline.md` |
| Code examples for API design, schema design, schema-first and error handling skills | `references/api-design-examples.md`, `references/design-api-examples.md`, `references/design-schema-examples.md`, `references/schema-first-examples.md`, `references/error-handling-examples.md` |

## Code Templates

Use templates from `assets/templates/` for scaffolding:

| Template | Purpose |
|----------|---------|
| `controller.php` | Invokable controller with authorization |
| `service.php` | Service class with DTO support |
| `dto.php` | Spatie Data DTOs |
| `repository.php` | Repository interface + implementation |
| `test.php` | Pest feature test |

## Laravel 12 Structure

```
app/
├── Http/Controllers/       # Invokable controllers
├── Models/                 # Eloquent models
├── Services/               # Business logic
├── Contracts/              # Repository interfaces
├── Repositories/           # Data access
└── DTOs/                   # Data transfer objects

bootstrap/
├── app.php                 # Middleware, exceptions, routing
└── providers.php           # Service providers

routes/
├── api.php                 # API routes
└── web.php                 # Web routes
```

## Core Patterns

### 1. Application Bootstrap (Laravel 11+ style)
```php
// bootstrap/app.php
return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        api: __DIR__.'/../routes/api.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        $middleware->api(prepend: [/* API middleware */]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        // Exception handling
    })->create();
```

### 2. Architecture Flow
```
Request → Controller → Service → Repository → Model
              ↓            ↓           ↓
            DTO        Business    Eloquent
          Validation     Logic      Query
```

### 3. Data Flow
- Controllers receive requests, validate via DTOs
- Services contain business logic, work with DTOs
- Repositories handle data access, return DTOs
- Events carry DTOs, never Eloquent models

### 4. Configuration
```php
// Always use config(), never env() outside config files
$appName = config('app.name');  // Correct
$appName = env('APP_NAME');     // Wrong
```

## Scaffolding Script

```bash
# Create new module structure
./scripts/scaffold-module.sh Domain SubModule Entity

# Example
./scripts/scaffold-module.sh Payments Checkout Order
```

---