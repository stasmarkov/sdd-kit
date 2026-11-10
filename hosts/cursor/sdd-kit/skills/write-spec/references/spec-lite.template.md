# spec-lite.md template

Copy everything below the line into `.ai/specs/<spec-folder>/spec-lite.md`. Delete guidance in `<!-- -->` comments once filled. Sections marked *(when needed)* are omitted for size S unless they have content.

---

```markdown
---
id: spec-PROJ-123-refund-guard        # = folder name
title: Refund guard for top-up orders
type: feature                          # feature | bug | improvement | refactor
size: M                                # S | M | L  (XS never gets a spec)
priority: P2                           # P0 | P1 | P2 | P3
status: draft                          # draft | approved | in-progress | done
ticket: PROJ-123                       # tracker key; empty when there is none
stakeholders: []                       # people who must agree on scope, e.g. [pm-name, qa-lead]
approved_by:                           # set by /sdd when a human approves
approved_at:                           # ISO-8601 UTC, set by /sdd
created: 2026-10-18
stacks: [<stack-key>, <stack-key>]
slice: SL-05                           # backlog.md slice this spec builds; omit without a product brief
brs: [BR-30, BR-31]                    # product-brief rule ids the ACs enforce; omit without a brief
---

# Refund guard for top-up orders

## Summary
<!-- One paragraph: what changes for whom, and why now. -->

## Context
- **Problem**: <!-- what is wrong or missing today, with evidence (ticket, log, screenshot) -->
- **User impact**: <!-- who benefits and how -->

## Scope
### In scope
- ...
### Out of scope
- ...

## Must NOT change
<!-- Required for type bug, improvement and refactor (for a refactor this list IS the contract:
     everything observable stays identical, and each item gets a characterization test written
     before any code moves); for features, list existing behavior at risk.
     Each item is existing behavior that must remain identical after the change, and each
     maps to a guard test or a manual-test step in tasks.md (Traceability). -->
- **MNC-1**: Refunds for card orders still go through the existing approval flow.
- **MNC-2**: The `/api/v1/orders/{id}` response shape is unchanged.

## Acceptance criteria
<!-- EARS ("WHEN <trigger> THE SYSTEM SHALL <response>", "IF <condition> THEN THE SYSTEM SHALL ...",
     "WHILE <state> ...") or Given/When/Then. One observable outcome per criterion.
     Every AC maps to a test or a manual-test step in tasks.md (Traceability). -->
- **AC-1**: WHEN a user requests a refund for a top-up order THE SYSTEM SHALL reject it with HTTP 422 and error code `refund_not_allowed`.
- **AC-2**: GIVEN an admin with the `refunds.override` permission WHEN they refund a top-up order THEN the refund is created and audited.

## Quality attributes *(when needed — M/L, or whenever one of these is at stake)*
<!-- Non-functional requirements, each with a target and the test that proves it. They go in the
     tasks.md Traceability table like ACs. Omit rows that do not apply; omit the section for S. -->
| ID | Attribute | Requirement | Verified by |
|----|-----------|-------------|-------------|
| **NFR-1** | Authorization | `customer` may refund own card orders; `admin` with `refunds.override` may refund any; every other role gets 403 | policy test per role |
| **NFR-2** | Performance | p95 of `POST /api/v1/refunds` < 300 ms at 20 concurrent requests (baseline 410 ms) | load test in manual-test.md |
| **NFR-3** | Accessibility | Refund dialog meets WCAG 2.2 AA (focus trap, labelled controls, 4.5:1 contrast) | browser test + axe |
| **NFR-4** | Personal data | Refund reason is not logged; bank details never leave the payments provider | test on log context |

## Rollout *(when needed — L, migrations, public API contract changes)*
<!-- How the change reaches production safely and how it is undone. With the ops add-on installed,
     the feature-flag skill names and documents the flag. -->
- **Flag**: `refund_guard` (off by default; on for staff first) <!-- or "none" with the reason -->
- **Deploy order**: backend first (additive migration + endpoint), then frontend <!-- expand/contract steps for breaking changes -->
- **Rollback**: turn the flag off; the migration is additive and stays <!-- or the exact down path and data impact -->

## Boundaries
- **Always**: <!-- things the implementer does without asking, e.g. "add a feature test per AC", "follow the stack conventions skill" -->
- **Ask first**: <!-- changes that need a human decision, e.g. "new migration", "new dependency", "public API change" -->
- **Never**: <!-- hard lines, e.g. "edit the payments provider SDK", "disable or weaken an existing test", "touch MNC areas" -->

## Technical context
- **Related code**: `src/services/refund-service` — current refund rules
- **Already implemented**: <!-- pieces that exist and must not be rebuilt -->
- **Approach**: <!-- high-level approach following existing patterns -->
- **Repos**: <!-- backend/frontend paths when polyrepo -->

## Decisions *(when needed — otherwise decisions.md for M/L)*
1. <!-- decision — rationale -->

## Open questions
<!-- Filled by the clarity gate. The spec cannot be approved while any item is unresolved.
     Resolve each by answering it (fold the answer into the spec) or accepting it as an assumption. -->
- [ ] Q1: ...
- [x] Q2: Partial refunds? — **Accepted assumption**: out of scope, full refunds only.

## Dependencies
- **Requires**: ...
- **Blocks**: ...

---
Next: `/sdd spec-PROJ-123-refund-guard` (approval → build) or `/execute-task --spec=PROJ-123`
```

## Rules

- **Status lifecycle**: `draft` (written; open questions may remain) → `approved` (a human approved in `/sdd`; `approved_by` and `approved_at` set) → `in-progress` (build started) → `done` (all tasks checked, gates green, acceptance met). Only `/sdd` sets `approved`.
- **Ready for approval** means: every Open question is checked (answered or accepted), every AC, MNC, and NFR item has a row in the tasks.md Traceability table, and an L spec, a migration, or a public API contract change has a Rollout section.
- Bug specs: Context carries repro steps and expected vs actual; Must NOT change is mandatory.
- Refactor specs: Must NOT change is the primary contract and there are usually no new ACs. Task 1 writes characterization (guard) tests that pin the current behavior of every MNC item and pass before any code moves (GREEN first, never RED: they describe behavior that already exists); later tasks restructure with those tests green throughout. `/execute-task` and ship-feature read `type: refactor` and skip the RED step.
- Quality attributes: each NFR has a measurable target and appears in the Traceability table; a performance NFR states its measured baseline.
