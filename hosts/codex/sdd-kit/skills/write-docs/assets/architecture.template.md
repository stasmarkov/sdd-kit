# {{Project Name}} Architecture - Quick Reference

*Essential technical patterns for development*

Every section is a placeholder: fill it from the code and AGENTS.md, delete what does not apply.

---

## Foundational Principles

### {{Principle 1}}
**CRITICAL**: {{Description of principle}}
- ✅ **ALWAYS** {{what to do}}
- ❌ **NEVER** {{what not to do}}

### {{Principle 2}}
**CRITICAL**: {{Description of principle}}
- ✅ **ALWAYS** {{what to do}}
- ❌ **NEVER** {{what not to do}}

---

## Repository Layout

```
{{the repo's real top-level layout: entry points, business logic, data access, schema, tests}}
```

---

## Entry Points (routes, commands, pages)

{{Where requests, commands or pages enter the code, and what a handler may and may not do}}

<!-- Code example in the project's language; the stack add-on's skill has samples. -->

---

## Data at Boundaries

{{How input and output are typed and validated between layers}}

<!-- Code example in the project's language; the stack add-on's skill has samples. -->

---

## Business Logic

{{Where business rules live and how they are composed}}

<!-- Code example in the project's language; the stack add-on's skill has samples. -->

---

## Data Access

{{How the code reads and writes stored data}}

<!-- Code example in the project's language; the stack add-on's skill has samples. -->

---

## Response Format (if the project exposes an API)

```
{{the project's response shape}}
```

---

## Database Standards

### Naming Conventions

| Object | Convention | Example |
|--------|------------|---------|
| Tables | {{convention}} | {{example}} |
| Columns | {{convention}} | {{example}} |
| Primary Keys | {{convention}} | {{example}} |
| Foreign Keys | {{convention}} | {{example}} |

### Data Model

{{How tables, entities or models are defined, and where the schema lives}}

<!-- Code example in the project's language; the stack add-on's skill has samples. -->

---

## Testing Standards

### Test Pattern

{{Test levels, where tests live and how one is structured}}

<!-- Code example in the project's language; the stack add-on's skill has samples. -->

---

## Daily Checklist

### Before Starting
- [ ] Load Golden Triangle context
- [ ] Review relevant schema docs

### During Development
- [ ] {{the project's own conventions, from AGENTS.md and .codex/rules}}
- [ ] Write tests first (TDD)

### Before Commit
- [ ] Run code style check
- [ ] Run static analysis
- [ ] Run tests
- [ ] Update documentation

---

*Last Updated: {{Date}}*
*Version: 1.0*
