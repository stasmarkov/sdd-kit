---
name: rubric-api
description: Outcomes rubric for API endpoint implementations (handler + service + typed data + tests).
domain: api
threshold: 80
---

# API Implementation Rubric

## Critical (any fail → BLOCKED)

- `api.security.authz`: Endpoint requires authentication and authorization checks for every non-public path. Evidence: middleware in route definition or `authorize()` call in controller.
- `api.security.input`: All request input passes through a FormRequest or DTO with validation rules. No raw `$request->all()` flowing to a service or model.
- `api.security.sql`: No `DB::raw`, `whereRaw`, or string-concatenated SQL anywhere in the diff.
- `api.security.mass-assignment`: Model fillable/guarded set; no unbounded `Model::create($request->all())`.
- `api.errors.no-leak`: No stack traces, query strings, or internal paths leaked in error responses.

## Important (≥ threshold% pass required)

- `api.layering.thin-controller`: Controller action ≤ 30 lines; delegates to a Service.
- `api.layering.dto`: Service receives and returns DTOs, not arrays or request objects.
- `api.layering.repository`: Direct ORM calls live in repositories, not in services or controllers (where a repository already exists for the model).
- `api.contract.response-shape`: Uses an API Resource (JsonResource) or typed DTO for the response. No raw model serialization.
- `api.contract.status-codes`: Correct HTTP status codes (201 for create, 204 for delete, 422 for validation, 403 for authz, 404 for missing).
- `api.tests.feature`: Feature test exercising the happy path with an authenticated user.
- `api.tests.failure-cases`: Feature tests for at least one validation failure and one authorization failure.
- `api.tests.run`: The project's test command for the target tests passes (Bash evidence required).
- `api.static.types`: The project's static-analysis or type-check command passes on the changed files.
- `api.style.format`: The project's formatter check passes on the changed files.
- `api.perf.no-n-plus-1`: No N+1 query patterns (loop containing `->relation` access without `with()` or `load()`).
- `api.docs.openapi`: Route appears in the route definitions with clear name and matches any existing OpenAPI/scribe contract.

## Nice-to-have (informational)

- `api.observability.logging`: Service emits structured log on failure paths.
- `api.idempotency`: Idempotency key handled for non-idempotent operations exposed to clients with retry logic.
- `api.rate-limit`: Throttle middleware applied where abuse is plausible.
