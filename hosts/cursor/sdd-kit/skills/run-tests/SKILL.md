---
name: run-tests
description: Run the test suites of the detected stack - the test gates from the stack manifest, with filtering by name or module, coverage and parallel runs, plus --e2e for browser journeys (the manifest's e2e block). Polyrepo-aware, analyzes failures, and ends with a per-repo verdict. Use when you need to verify a change, investigate failing tests, check coverage, or confirm the suites are green before a merge or release.
argument-hint: "[filter] | --module=[name] | --unit | --feature | --coverage | --all | --frontend | --e2e [\"AC-n:\"] [--url=<e2e frontend url>]"
allowed-tools: Bash, Read, Grep, Glob
metadata:
  version: "2.0"
  last_verified: "2026-10-22"
  next_review: "2027-01-22"
---
Relative paths in this skill (scripts/..., ../other-skill/..., ../../runtime/...) are relative to the directory that holds this SKILL.md, not to the project directory; resolve them against it before running a command.


# /run-tests

Run the test suites, analyze failures, and report a verdict per repo. The test commands come from the stack manifest, not from this file.

## Usage

```bash
/run-tests --all                    # every test-kind gate of every repo
/run-tests --module=User            # one module
/run-tests UserRegistration         # filter by test name
/run-tests --coverage               # with coverage
/run-tests --unit
/run-tests --feature
/run-tests --frontend               # the frontend repo's test gates, with coverage

# Browser journeys, in the isolated e2e environment
/run-tests --e2e
/run-tests --e2e "AC-3:"                     # one acceptance criterion
/run-tests --e2e --url=http://127.0.0.1:3100 # reuse an already-running e2e frontend

# Everything, every repo
/run-tests --all --frontend --e2e
```

## Finding the repos and the gates

Single repo: run from its root. Polyrepo: find the backend and the frontend the way the workflows do, from `repos: { backend, frontend }` paths, sibling folders, or a parent workspace. Run each suite in its own repo directory and label the results by repo.

Resolve each repo's stack data with the recipe in the `verification-gates` skill (project and user `.cursor/stacks`, then the generated `stacks.json`, then plugin add-on manifests, else `other` with `stack manifest not found` and the `/new-stack` hint, running the test tooling the repo visibly has only under the conditions of verification-gates step 4, else `not run (no allowlisted gate)`). Then:

- Run the gates of kind `test`. Run kind `e2e` only with `--e2e`, using the manifest's `e2e` block. Kinds `format`, `lint`, `types`, `build`, `other` and an absent kind are not run here.
- Plan the gates with the plan step of `verification-gates` (Planning the gates): `node ../stack-trust/scripts/trust-store.mjs plan --repo <repo> --key <key> --kinds test`. Report every `fixed` entry and `notices` line verbatim and run only `run[].command`, in the repo directory; for key `other`, fall back to the visible test tooling as above. If the planner is unavailable, run no gate and report each as `not run (gate planner unavailable). Fix: reinstall sdd-kit`.
- The plan applies `unless` and trust: skipped gates are reported as `skipped — <glob> present`, and gates of an untrusted manifest as `not run (untrusted manifest). Fix: run /stack-trust.` (the same rule as `node ../stack-trust/scripts/trust-store.mjs --host cursor check <manifest file>` in `verification-gates`).

The plan fills `<pm>` and `<pmx>`; for a command you add yourself (a filter, a single file), follow the `verification-gates` package-manager rule, start it with the plan's `wrapper.prefix` when it has one, and report output paths through `pathMap` (verification-gates, Planning the gates). Filters, coverage and parallel flags per test runner are in the stack add-on's conventions skill, under `references/quality-tools.md`.

## Browser journeys (`--e2e`)

E2E runs in its own environment, never against the dev database or the unit-test database (a refresh-database run and a fresh-migrate would wipe each other's data). The manifest's `e2e` block names the config glob, the run command and the convention; the stack's testing skill holds the setup details. This skill only runs the journeys:

1. **Check the setup.** The repo has the file the `e2e.configGlob` names, with its web-server and database-setup entries. Missing: report it and point to the stack's e2e convention; do not run a fresh migrate or start servers by hand to compensate.
2. **Run** the manifest's `e2e.run` (for one journey, the spec file; for one acceptance criterion, a grep on `"AC-3:"`, where the colon keeps AC-3 from matching AC-30). With `--url`, reuse an e2e frontend already running there (local runs only).
3. On failure, read the trace and screenshot paths the runner prints and report the step that failed.

## Test Priority Matrix

| Priority | Coverage | Areas |
|----------|----------|-------|
| Critical | 100% | Authentication and authorization, money movement, data integrity, server actions that change data |
| High | 90%+ | Business logic services, API endpoints, repositories |
| Medium | 80%+ | Model relationships, events and listeners, middleware, interactive components |
| Low | 70%+ | Simple operations, accessors, resources, presentational components |

## Failure Analysis

Classify each failure and suggest a fix tied to the file:

| Severity | Examples |
|----------|----------|
| CRITICAL | Database connection, authentication, payment processing |
| HIGH | Business logic, validation, API contract violations (backend response vs frontend type) |
| MEDIUM | Edge cases, timeouts, race conditions, flaky E2E waits |
| LOW | Formatting, minor assertion differences |

Common fixes: test database out of date, missing role or permission seeding, stale cache, a mock handler that no longer matches the contract, an E2E selector that relies on text instead of a role or label.

Re-run a failing test up to three times before calling it flaky; flaky tests are reported, never ignored.

## Output Format

```
Test Report

api (<stack>)   unit/feature  212/214 passed   coverage 87.3% (min 80)   45.2s
web (<stack>)   unit           88/88  passed   coverage 81.0%            6.1s
web (<stack>)   e2e             5/6   passed   e2e env (http://127.0.0.1:3100)

Failed:
1. api  tests/Feature/OrderTest > it creates an order
   Expected 201, got 422 (CreateOrderData requires shipping_address_id)
   Fix: send shipping_address_id in the test, or make it optional in app/DTOs/CreateOrderData:18
2. web  e2e/checkout.spec > AC-3 pays with a saved card
   Step "click Pay" timed out; trace: test-results/checkout-AC-3/trace.zip

Verdict
  api  FAIL (2 failing)
  web  FAIL (1 failing journey)
Overall: FAIL
```

A suite that could not run (tool missing, server down, untrusted manifest) is reported as NOT RUN with the reason, never as passed.

**Source Verification**: Follow the `source-verification` skill.
