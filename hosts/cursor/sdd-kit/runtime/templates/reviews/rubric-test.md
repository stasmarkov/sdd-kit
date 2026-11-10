---
name: rubric-test
description: Outcomes rubric for test suites authored as part of a feature.
domain: test
threshold: 80
---

# Test Suite Rubric

## Critical (any fail → BLOCKED)

- `test.green`: The test suite for the target runs and all tests pass. Evidence: full command output.
- `test.no-skipped-without-reason`: No `->skip()` / `it.skip(...)` without a comment and ticket reference.
- `test.no-network`: Tests do not hit external network. Either mocked, faked (`Http::fake`), or use a local test double.
- `test.no-prod-creds`: Tests do not load production env, secrets, or real credentials.

## Important (≥ threshold% pass required)

- `test.covers.happy-path`: Primary happy path is asserted end-to-end.
- `test.covers.validation`: At least one validation/edge case asserted (empty input, malformed input, boundary value).
- `test.covers.authz`: For authenticated routes, both authorized and unauthorized cases tested.
- `test.covers.errors`: At least one failure path produces the expected error response/exception.
- `test.assertions.specific`: Tests assert specific values, not just truthy/exists. No `expect($x)->not->toBeNull()` as the only assertion on a result.
- `test.naming.descriptive`: Test names describe behavior (`it returns 422 when email missing`), not subject (`test1`, `testCreate`).
- `test.factories`: Uses model factories / `it.each` for setup, not inlined fixtures.
- `test.isolation`: Each test resets state (RefreshDatabase, beforeEach reset, no leaky globals).
- `test.fast`: Suite runs in reasonable time (< 30s for unit, < 2min for feature; flag if much slower).
- `test.coverage`: `--coverage` reports ≥ 75% on the new files in the diff.

## Nice-to-have (informational)

- `test.property-based`: Property/fuzz tests for parsers or pure functions.
- `test.snapshot`: Snapshot tests for stable serialized outputs (DTOs, responses).
- `test.parallel-safe`: Tests pass under `--parallel`.
