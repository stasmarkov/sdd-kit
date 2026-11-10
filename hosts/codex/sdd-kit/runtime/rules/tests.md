---
paths:
  - "tests/**"
  - "test/**"
  - "e2e/**"
  - "**/*.test.*"
  - "**/*.spec.*"
---

# Tests

## Rules

- Write the failing test first. Run it and watch it fail for the expected reason before you fix anything.
- Run tests with the project's test command and a test environment. Never point tests at the dev or a shared database.
- Each acceptance criterion in a spec maps to at least one test or to a manual-test step in the spec.
- Test behavior through the public surface (HTTP endpoint, service method, rendered component), not private internals.
- Build data with factories and states. Don't insert rows by hand or depend on seeders.
- Fake external services (HTTP, queues, events, mail). No live network calls.
- Never delete, skip, or weaken an assertion just to make a test pass. If the test is wrong, say so and explain why.

## Backend

- Every endpoint gets at least four cases: happy path, validation (422), unauthenticated (401), forbidden (403).
- Assert the response shape, not just the status code.
- Assert side effects in the database and in fakes.

## Concurrency and money

- A race-condition fix needs a test that fails without the fix. Sequential tests pass both before and after, so they prove nothing.
- Money assertions compare integers in minor units, never floats.

## Frontend

- Component tests use accessible queries by role or label, not test IDs or CSS classes.
- Mock the API at the fetch boundary (a mock server or an injected client), with payloads copied from the API contract.
- E2E tests cover user journeys that cross the backend, not single components.
