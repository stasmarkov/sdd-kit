---
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "**/*.spec.ts"
  - "**/*.spec.tsx"
  - "e2e/**"
---

# Tests (Next.js)

## Rules

- Write the failing test first. Run it and watch it fail for the expected reason before you fix anything.
- Each acceptance criterion in a spec maps to at least one test or to a manual-test step in the spec.
- Test behavior through the rendered component, not private internals.
- Never delete, skip, or weaken an assertion just to make a test pass. If the test is wrong, say so and explain why.

## Frontend

- Component tests use Testing Library queries by role or label, not test IDs or CSS classes.
- Mock the API at the fetch boundary (MSW or an injected client), with payloads copied from the API contract.
- E2E tests cover user journeys that cross the backend, not single components.
