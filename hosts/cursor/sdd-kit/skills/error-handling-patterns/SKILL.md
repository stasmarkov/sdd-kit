---
name: error-handling-patterns
description: Robust error handling with typed exceptions, Result types, and graceful degradation. Use when designing error flows or improving resilience.
user-invocable: false
allowed-tools: Read, Grep, Glob
---

# Error Handling Patterns

Implement robust error handling with typed exceptions, Result types, and graceful degradation in any stack.

## When to Use This Skill

- Designing error handling strategies for new features
- Implementing API error responses
- Handling edge cases and boundary conditions
- Building resilient integrations with external services

## When to Load References

| Task | Load |
|------|------|
| Result type, retry with backoff, frontend error boundaries | the stack add-on's skill references, when a stack add-on is installed |

---

## Core Concepts

### Error Categories

| Category | HTTP Status | Recovery | Example |
|----------|-------------|----------|---------|
| **Validation** | 422 | User fixes input | Missing required field |
| **Business Rule** | 409/422 | User changes action | Insufficient funds |
| **Not Found** | 404 | Check input | Resource doesn't exist |
| **Authorization** | 401/403 | Re-authenticate | Invalid token |
| **External Service** | 502/503 | Retry or fallback | Payment gateway down |
| **Internal** | 500 | Developer fixes bug | Null pointer |

### Fail Fast vs Graceful Degradation

**Fail Fast**: Stop immediately when something is wrong
- Use for: Data integrity, security violations

**Graceful Degradation**: Continue with reduced functionality
- Use for: Non-critical features, optional enhancements

---

## Patterns

### Pattern 1: Domain Exception Hierarchy

**Use when**: Modeling business rule violations

> Framework implementation: see the stack add-on's skill references.

### Pattern 2: Exception Handler with Consistent Responses

**Use when**: All API errors need consistent format

> Framework implementation: see the stack add-on's skill references.

---

## Best Practices

### Exception Design
1. **One exception per error case**: Don't reuse generic exceptions
2. **Include context**: Add relevant data for debugging
3. **Use error codes**: Machine-readable identifiers for client handling
4. **Hierarchical exceptions**: Allow catching at different granularities

### API Error Responses
1. **Consistent format**: Same structure for all errors
2. **Actionable messages**: Tell users what they can do
3. **Field-level validation**: Map errors to specific fields
4. **Safe in production**: Never expose stack traces or internal details

---

## Common Pitfalls

- **Catching too broadly**: `catch (Exception $e)` hides bugs → Catch specific exceptions
- **Swallowing errors**: Empty catch blocks → At minimum, log the error
- **Exposing internals**: Stack traces in production → Return safe messages only
- **Missing context**: "Error occurred" → Include what, where, why
- **Retry everything**: Retrying non-idempotent operations → Only retry safe operations

---

## Quick Reference

| Scenario | Pattern |
|----------|---------|
| Business rule violation | Domain exception |
| Expected failure case | Result type |
| Input validation | The framework's validation layer + 422 |
| External service failure | Retry with backoff |
| Internal bug | 500 + log + alert |

---

## Related Skills

- **api-design**: Error response design
- **architecture-patterns**: Exception hierarchy design
- **dto-first**: Error DTOs for consistent responses

---