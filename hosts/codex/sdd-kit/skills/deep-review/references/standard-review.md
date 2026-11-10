# Standard Review Reference

Checklists, focus modes, and report formats for `/deep-review --depth=standard`: a structured, constructive branch/PR review. Load when running a standard-depth review or wiring it into CI.

---

## File Categorization

Group changed files before applying checklists:

| Category | Checklists applied |
|----------|--------------------|
| Controllers | Security + Architecture |
| Services, Repositories, DTOs, Models | Architecture + Security + Performance |
| Migrations | Migration Safety |
| Tests | Testing |
| Frontend components | Architecture + Performance + Security (XSS, auth state) |
| Configuration | Security (secrets, debug flags) |
| Docs / README | Documentation |

---

## Category Checklists

### 1. Architecture

- [ ] Follows the service-repository pattern
- [ ] Uses DTOs for data transfer (not raw arrays)
- [ ] Controllers are invokable (single action)
- [ ] Business logic in services, not controllers
- [ ] Module boundaries respected
- [ ] Events used for cross-module communication
- [ ] No circular dependencies introduced

### 2. Security

- [ ] Authorization policies enforced (`$this->authorize()` / policies / middleware)
- [ ] Input validated via Form Requests or DTOs
- [ ] No SQL injection (raw queries checked)
- [ ] No XSS (output escaped, no unsafe `dangerouslySetInnerHTML`)
- [ ] Sensitive data not logged
- [ ] Rate limiting on public endpoints
- [ ] CSRF protection where applicable
- [ ] No hardcoded secrets or credentials

### 3. Performance

- [ ] No N+1 queries (eager loading used)
- [ ] Indexes exist for new query patterns
- [ ] Caching where it clearly pays off
- [ ] Pagination for large datasets
- [ ] No queries inside loops
- [ ] No blocking operations in hot paths

### 4. Testing

- [ ] New code has corresponding tests
- [ ] Edge cases and error conditions covered
- [ ] Tests assert behavior, not just coverage
- [ ] Test data isolated
- [ ] No flaky tests introduced

### 5. Documentation

- [ ] Non-obvious logic explains the "why"
- [ ] API endpoints documented
- [ ] README updated if setup changed
- [ ] Breaking changes documented

### 6. Migration Safety

- [ ] Migrations reversible (`down()` works)
- [ ] No data-loss risk
- [ ] Large-table changes have a strategy (batched / online)
- [ ] Index additions won't lock hot tables
- [ ] Foreign key constraints validated

`--checklist=quick` applies only Security plus the first two items of Architecture and Testing.

---

## Focus Modes

| Flag | Emphasis |
|------|----------|
| `--focus=security` | OWASP Top 10, authn/authz flows, input validation, sensitive data, rate limiting/CORS, sessions, crypto. Also spawn `security-auditor`. |
| `--focus=performance` | Query analysis, caching, algorithmic complexity, memory, eager vs lazy loading, index use, response times. |
| `--focus=architecture` | Pattern adherence (service-repository, DTO-first), module boundaries, dependency direction, single responsibility, duplication. |
| `--focus=testing` | Testing checklist in full, plus missing-test inventory per changed class. |

---

## Severity Levels

| Severity | Meaning | Action |
|----------|---------|--------|
| Critical | Security vulnerability, data-loss risk | Must fix before merge |
| Major | Bug, pattern violation, performance issue | Should fix before merge |
| Minor | Style, small improvement | Can fix later |
| Suggestion | Optional improvement | Nice to have |

Verdict mapping: any Critical → BLOCKED; any Major → CHANGES_REQUIRED; otherwise APPROVED.

---

## Text Report Format

```
Code Review Report
==================

Branch: feature/new-payment
Base: main
Depth: standard
Date: {date}

Files Changed: 12
Lines Added: 456
Lines Removed: 89

Summary:
  Critical: 0
  Major: 2
  Minor: 5
  Suggestions: 3

FINDINGS

[MAJOR] Missing Authorization Check
  File: src/controllers/payment-controller:42
  Issue: No authorization policy check before processing payment

  Current:
    public function __invoke(Request $request) {
        return $this->service->process($request->all());
    }

  Suggested:
    handle(request) {
        authorize('create', Payment)
        dto = CreatePaymentDTO.validate(request.body)
        return service.process(dto)
    }

[MAJOR] Potential N+1 Query
  File: src/services/order-service:78
  Issue: Loading user relationship inside loop
  Suggested: eager-load the user relationship before the loop

[MINOR] Raw Array Instead of DTO
  File: src/services/payment-service:23
  Suggested: Create ProcessPaymentDTO and use it

[SUGGESTION] Consider Caching
  File: src/repositories/product-repository:34

VERDICT: CHANGES_REQUIRED

Required before merge:
  1. Add authorization check in PaymentController
  2. Fix N+1 query in OrderService
```

---

## JSON Format (`--format=json`)

```json
{
  "branch": "feature/new-payment",
  "base": "main",
  "depth": "standard",
  "summary": { "critical": 0, "major": 2, "minor": 5, "suggestions": 3 },
  "verdict": "changes_required",
  "findings": [
    {
      "severity": "major",
      "category": "security",
      "file": "src/controllers/payment-controller",
      "line": 42,
      "issue": "Missing authorization check",
      "suggestion": "Add an authorization call"
    }
  ],
  "blocking": true
}
```

`blocking` is `true` when the verdict is BLOCKED or CHANGES_REQUIRED.

---

## CI Integration

```yaml
# .github/workflows/code-review.yml
- name: Code Review
  run: |
    claude -p "/deep-review --depth=standard --format=json" > review.json
    if jq -e '.blocking' review.json; then
      echo "Review has blocking issues"
      exit 1
    fi
```
