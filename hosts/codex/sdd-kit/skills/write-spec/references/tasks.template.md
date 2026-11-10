# tasks.md template

Copy everything below the line into `.ai/specs/<spec-folder>/tasks.md`.

---

```markdown
# Refund guard for top-up orders — Tasks

**Spec**: spec-PROJ-123-refund-guard | **Size**: M | **Tasks**: 3

## Phase 1: Backend

- [ ] 1. Reject refunds for top-up orders in RefundService (backend)
  - Covers: AC-1, MNC-1
  - [ ] 1.1 Failing test: top-up refund returns 422 `refund_not_allowed`
  - [ ] 1.2 Guard test: card-order refund still requires approval
  - [ ] 1.3 **Verify**: both tests green; gates green

- [ ] 2. Admin override with audit entry (backend)
  - Covers: AC-2, NFR-1
  - [ ] 2.1 ...
  - [ ] 2.2 **Verify**: ...

## Phase 2: Frontend

- [ ] 3. Hide the refund button for top-up orders (frontend)
  - Covers: AC-1
  - [ ] 3.1 ...
  - [ ] 3.2 **Verify**: ...

## Traceability

Every acceptance criterion (AC), must-not-change item (MNC), and quality attribute (NFR) from spec-lite.md has exactly one row. "Verified by" names a test (file::name) or a manual-test step (`manual-test.md#step-N`). Update the cell with the real test name when the task lands.

| ID | Criterion (short) | Verified by | Kind | Task |
|----|-------------------|-------------|------|------|
| AC-1 | top-up refund rejected with 422 | `tests/refund-test::rejects top-up refunds` | test | 1, 3 |
| AC-2 | admin override is audited | `tests/refund-override-test::audits override` | test | 2 |
| MNC-1 | card refunds still need approval | `tests/refund-test::card refund needs approval` | test | 1 |
| MNC-2 | order response shape unchanged | `manual-test.md#step-4` | manual | — |
| NFR-1 | every role except customer/admin gets 403 | `tests/refund-policy-test::other roles get 403` | test | 2 |

## Verification gates

Run the project's detected gates after every task (see the `verification-gates` skill), e.g.:
- backend: `<format command>`, `<types command>`, `<test command>`
- frontend: `<lint command>`, `<types command>`, `<test command>`

## Done when
- [ ] All tasks checked
- [ ] Every Traceability row has a passing test or a manual step that was run
- [ ] Gates green
```

## Rules

- Task line format `- [ ] N. Title (stack)` — tools parse `- [ ] N.` to find the next task; keep it.
- Each task lists `Covers:` with the AC/MNC/NFR ids it satisfies. A task covering nothing is either scaffolding (say so) or out of scope.
- Refactor specs (`type: refactor`): task 1 is the characterization task. Its tests are written against the current code and must pass (GREEN) before any code moves; there is no RED step. Later tasks cover MNC ids and keep those tests green.
- Gap tasks appended later (by the ship-feature Converge phase or a reviewer) continue the numbering and go under a final `## Phase N: Gaps` heading.
- List the gate commands that actually exist in the project — never paste one stack's commands into a repo of another stack.
