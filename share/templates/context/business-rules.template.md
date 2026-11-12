# {{Project Name}} Business Rules - Developer Quick Reference

*Critical business logic that MUST be enforced in code*

---

## Absolute Business Prohibitions

### {{Prohibition 1 Name}}
- {{What is prohibited}}
- {{Why it's prohibited}}
- {{What to do instead}}

### {{Prohibition 2 Name}}
- {{What is prohibited}}
- {{Why it's prohibited}}
- {{What to do instead}}

---

## {{Domain 1}} Rules

### Amount Format (example: delete if the domain has no money)
- **{{Currency}} amounts**: {{Format description}}
- Storage: {{How amounts are stored}}
- Display: {{How amounts are displayed}}

### Calculation Rules
- {{Rule 1}}
- {{Rule 2}}

---

## {{Domain 2}} Rules

### {{Feature}} Structure
- {{Rule about structure}}
- {{Rule about rates/percentages}}
- {{Rule about tracking}}

### {{Feature}} Restrictions
- {{What's not allowed}}
- {{What requires approval}}

---

## Database Constraints

### Critical Validations
- {{Validation 1}}
- {{Validation 2}}
- {{Validation 3}}

### Required Relationships
- {{Relationship 1}}
- {{Relationship 2}}

---

## Security Requirements

### Authentication
- {{Auth requirement 1}}
- {{Auth requirement 2}}

### Authorization
- {{Auth rule 1}}
- {{Auth rule 2}}

### Data Protection
- {{Protection rule 1}}
- {{Protection rule 2}}

---

## {{Workflow}} Processing

### {{Flow Name}} Steps
1. {{Step 1}}
2. {{Step 2}}
3. {{Step 3}}
4. {{Step 4}}

### Status Transitions
```
{{State A}} → {{State B}} → {{State C}} → {{State D}}
                  ↓
             {{State E}}
```

---

## Performance Requirements

### Response Times
- {{Operation 1}}: < {{N}}ms
- {{Operation 2}}: < {{N}}ms
- {{Operation 3}}: < {{N}}ms

### Caching Strategy
- {{Cache 1}}: {{TTL}}
- {{Cache 2}}: {{TTL}}

---

## Test Data (Development)

<!-- Code example in the project's language; the stack add-on's skill has samples. -->

---

## Quick Validation Checks

Before implementing any feature, verify:

- [ ] Does not violate any prohibitions above
- [ ] Follows the domain rules above
- [ ] Respects security requirements
- [ ] Meets performance requirements

---

**If any code violates these rules, it's a bug that must be fixed immediately.**

---

*Last Updated: {{Date}}*
*Version: 1.0*
