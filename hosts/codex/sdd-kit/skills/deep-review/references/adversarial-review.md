# Adversarial Review Reference

Detail for `/deep-review` at `--depth=adversarial` (the default). Load when running the adversarial pass or writing its report.

---

## Why an Adversarial Pass

| Blind Spot | Finding | How the review addresses it |
|------------|---------|-----------------------------|
| Self-correction failure | LLMs fail to fix their own errors ~64.5% of the time | A different agent with a skeptical persona reviews the code |
| Familiar-pattern attack | Models overgeneralize patterns and miss small bugs | Every pattern choice is questioned explicitly |
| Same-model bias | A model can't see its own blind spots | The reviewer runs on a different model tier from generation |
| Self-critique paradox | Open-ended "find problems" prompts hallucinate errors | Fixed criteria and severity rules, not free-form critique |

---

## The 13 Review Criteria

1. Security issues
2. Architecture compliance
3. Overengineering detection
4. Good/bad practice violations
5. Code style compliance
6. Business logic match (implementation vs business rules)
7. Bug and bottleneck detection
8. Better approaches ("how would a senior dev do this?")
9. Coding standards (the project's style guide and linter configuration)
10. SOLID principles
11. Design patterns
12. Test coverage quality
13. Documentation sufficiency

Analysis prompts per lens:

| Lens | Question |
|------|----------|
| Security | Assume vulnerable, prove otherwise |
| Architecture | Question every pattern choice |
| Business logic | Does the code do what the business rules say? |
| Overengineering | Could this be simpler? |
| Edge cases | What inputs would break this? |
| Technical debt | What will cause pain in six months? |

---

## Severity Classification Rules

```
CRITICAL if:
├── Allows unauthorized access to data
├── Could corrupt or lose data
├── Could crash the application
├── Exposes secrets or credentials
├── Violates compliance requirements (GDPR, PCI, etc.)
└── Tests fail for security-related functionality

MAJOR if:
├── Is a bug that users will encounter
├── Violates established architecture patterns
├── Has significant performance impact (>2x slower)
├── Missing required functionality from spec
├── Would require significant rework later
└── Static analysis at the strictest level fails

MINOR if:
├── Is purely stylistic (formatter or linter)
├── Has minimal user impact
├── Can be fixed in under 5 minutes
├── Debug statements left in
└── Missing non-essential documentation

OBSERVATION if:
├── Code demonstrates good patterns
├── Solution is elegant/efficient
└── Worthy of replication elsewhere
```

### Tool Result Classification

| Tool | Failure = | Success = |
|------|-----------|-----------|
| Static analysis (strictest configured level) | MAJOR | Pass gate |
| Tests | CRITICAL if security-related, else MAJOR | Pass gate |
| Formatter / linter | MINOR | Pass gate |
| Security pattern grep | CRITICAL (after confirming the hit is real) | Pass gate |
| Debug-call grep | MINOR | Pass gate |

---

## Security and Debug Pattern Scans

```bash
grep -rn "DB::raw\|->whereRaw\|eval(\|exec(\|shell_exec(" {files}
grep -rn "unserialize\|file_get_contents.*\$_\|include.*\$" {files}
grep -rn "password.*=.*['\"]" {files}

grep -rn "dd(\|dump(\|var_dump(\|print_r(" {files}
grep -rn "console\.log\|debugger" {files}
```

A grep hit is a lead, not a finding: read the surrounding code and confirm user-controlled input reaches the sink before classifying it CRITICAL.

---

## Report Template

Location: `.ai/reviews/REVIEW-{source}-{timestamp}.md`

````markdown
# Deep Review: {source}

## Verdict: {APPROVED | CHANGES_REQUIRED | BLOCKED}

Depth: {quick | standard | adversarial}

## Statistics
| Metric | Value |
|--------|-------|
| Files Reviewed | X |
| Critical Issues | X |
| Major Issues | X |
| Minor Issues | X |

## Tool Verification Results
| Tool | Status | Details |
|------|--------|---------|
| Static analysis | PASS/FAIL | {errors} |
| Tests | PASS/FAIL | {coverage}% |
| Formatter | PASS/FAIL | {violations} |
| Security scan | PASS/FAIL | {findings} |

## Critical Issues (fix before proceeding)

### [CRITICAL] {Issue Title}
**File:** `{path}:{line}`
**Category:** security | architecture | data-integrity

**Issue:** {what is wrong and why it is critical}

**Current Code:**
```
{problematic code}
```

**Recommended Fix:**
```
{corrected code}
```

**Impact:** {what happens if not fixed}

## Major Issues (should fix)

{same format as critical}

## Minor Issues (can defer)

- `{file}:{line}` - {brief description}

## Positive Observations

- {pattern worth replicating}

## Next Steps

1. {first priority action}
2. Re-run `/deep-review` after fixes
````

---

## Example Output

```
Deep Review: TASK-0043 (adversarial)

Phase 1: Gathering context
  - Files: 3 (from task log)
  - Business rules: loaded

Phase 2: Tool verification
  PASS  Static analysis (strictest level): 0 errors
  PASS  Tests: 100% coverage
  PASS  Formatter: no violations
  WARN  Security scan: 1 pattern found

Phase 3: Adversarial analysis (adversarial-reviewer)

Phase 4: Classification
  - Critical: 1
  - Major: 0
  - Minor: 2

VERDICT: BLOCKED

[CRITICAL] SQL injection in UserExportService
  File: src/services/user-export-service:47
  Raw SQL with user-controlled $role variable.

Action required: fix the critical issue and re-run /deep-review
Report: .ai/reviews/REVIEW-TASK-0043-20250131-143022.md
```
