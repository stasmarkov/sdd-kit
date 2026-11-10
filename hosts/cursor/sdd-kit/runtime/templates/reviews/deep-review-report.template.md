# Deep Review: {{SOURCE}}

**Generated**: {{TIMESTAMP}}
**Reviewer**: adversarial-reviewer (opus model)

---

## Verdict: {{VERDICT}}

{{#if VERDICT_BLOCKED}}
> ⛔ **BLOCKED**: Critical issues must be resolved before proceeding.
{{/if}}

{{#if VERDICT_CHANGES_REQUIRED}}
> ⚠️ **CHANGES REQUIRED**: Major issues should be addressed before deployment.
{{/if}}

{{#if VERDICT_APPROVED}}
> ✅ **APPROVED**: Code is production-ready.
{{/if}}

---

## Statistics

| Metric | Value |
|--------|-------|
| Files Reviewed | {{FILES_COUNT}} |
| Lines Analyzed | {{LINES_COUNT}} |
| Critical Issues | {{CRITICAL_COUNT}} |
| Major Issues | {{MAJOR_COUNT}} |
| Minor Issues | {{MINOR_COUNT}} |
| Observations | {{OBSERVATION_COUNT}} |

---

## Tool Verification Results

| Tool | Status | Details |
|------|--------|---------|
| Static analysis (strictest level) | {{STATIC_STATUS}} | {{STATIC_DETAILS}} |
| Tests | {{TEST_STATUS}} | Coverage: {{TEST_COVERAGE}}% |
| Code Style | {{STYLE_STATUS}} | {{STYLE_DETAILS}} |
| Security Scan | {{SECURITY_STATUS}} | {{SECURITY_DETAILS}} |
| Debug Statements | {{DEBUG_STATUS}} | {{DEBUG_DETAILS}} |

---

## Files Reviewed

| File | Lines | Changes |
|------|-------|---------|
{{#each FILES}}
| `{{this.path}}` | {{this.lines}} | {{this.changes}} |
{{/each}}

---

{{#if CRITICAL_ISSUES}}
## Critical Issues (MUST FIX)

{{#each CRITICAL_ISSUES}}
### [CRITICAL] {{this.title}}

**File:** `{{this.file}}:{{this.line}}`
**Category:** {{this.category}}

**Issue:**
{{this.description}}

**Current Code:**
```{{this.language}}
{{this.current_code}}
```

**Recommended Fix:**
```{{this.language}}
{{this.recommended_code}}
```

**Impact:** {{this.impact}}

---

{{/each}}
{{/if}}

{{#if MAJOR_ISSUES}}
## Major Issues (SHOULD FIX)

{{#each MAJOR_ISSUES}}
### [MAJOR] {{this.title}}

**File:** `{{this.file}}:{{this.line}}`
**Category:** {{this.category}}

**Issue:**
{{this.description}}

**Current Code:**
```{{this.language}}
{{this.current_code}}
```

**Recommended Fix:**
```{{this.language}}
{{this.recommended_code}}
```

**Why This Matters:** {{this.impact}}

---

{{/each}}
{{/if}}

{{#if MINOR_ISSUES}}
## Minor Issues (CAN DEFER)

| File | Line | Issue | Category |
|------|------|-------|----------|
{{#each MINOR_ISSUES}}
| `{{this.file}}` | {{this.line}} | {{this.description}} | {{this.category}} |
{{/each}}

{{/if}}

---

{{#if OBSERVATIONS}}
## Positive Observations

Patterns worth replicating elsewhere:

{{#each OBSERVATIONS}}
- **{{this.title}}** (`{{this.file}}`): {{this.description}}
{{/each}}

{{/if}}

---

## Checklist Coverage

### Security (Criteria #1)
{{#each SECURITY_CHECKLIST}}
- [{{#if this.passed}}x{{else}} {{/if}}] {{this.item}}
{{/each}}

### Architecture (Criteria #2)
{{#each ARCHITECTURE_CHECKLIST}}
- [{{#if this.passed}}x{{else}} {{/if}}] {{this.item}}
{{/each}}

### Overengineering (Criteria #3)
{{#each OVERENGINEERING_CHECKLIST}}
- [{{#if this.passed}}x{{else}} {{/if}}] {{this.item}}
{{/each}}

### Business Logic (Criteria #6)
{{#each BUSINESS_LOGIC_CHECKLIST}}
- [{{#if this.passed}}x{{else}} {{/if}}] {{this.item}}
{{/each}}

### SOLID Principles (Criteria #10)
{{#each SOLID_CHECKLIST}}
- [{{#if this.passed}}x{{else}} {{/if}}] {{this.item}}
{{/each}}

### Test Quality (Criteria #12)
{{#each TEST_CHECKLIST}}
- [{{#if this.passed}}x{{else}} {{/if}}] {{this.item}}
{{/each}}

---

## Next Steps

{{#if VERDICT_BLOCKED}}
**Immediate Actions Required:**

1. Fix all CRITICAL issues listed above
2. Re-run `/deep-review {{SOURCE_ARG}}`
3. Do NOT proceed to deployment until APPROVED

{{/if}}

{{#if VERDICT_CHANGES_REQUIRED}}
**Recommended Actions:**

1. Address MAJOR issues before deployment
2. Consider fixing MINOR issues in follow-up PR
3. Re-run `/deep-review {{SOURCE_ARG}}` after fixes

{{/if}}

{{#if VERDICT_APPROVED}}
**Ready for Deployment:**

1. Optionally address MINOR issues in follow-up
2. Proceed with `/deploy --staging`
3. Consider replicating positive patterns noted above

{{/if}}

---

## Knowledge Graph Update

```javascript
// Entity created
{
  name: "REVIEW_{{SOURCE_SLUG}}_{{TIMESTAMP_SLUG}}",
  entityType: "deep-review",
  observations: [
    "Verdict: {{VERDICT}}",
    "Critical: {{CRITICAL_COUNT}}",
    "Major: {{MAJOR_COUNT}}",
    "Minor: {{MINOR_COUNT}}",
    "Files: {{FILES_COUNT}}"
  ]
}

// Relations created
{{#each RELATED_ENTITIES}}
{ from: "REVIEW_*", to: "{{this}}", relationType: "reviewed" }
{{/each}}
```

---

## Metadata

| Field | Value |
|-------|-------|
| Source | {{SOURCE}} |
| Model Used | opus |
| Agent | adversarial-reviewer |
| Static Analysis Level | strictest configured |
| Coverage Threshold | 80% |
| Review Duration | {{DURATION}} |

---

**Re-run command:** `/deep-review {{SOURCE_ARG}}`
