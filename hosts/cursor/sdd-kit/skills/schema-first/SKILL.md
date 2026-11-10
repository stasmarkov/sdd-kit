---
name: schema-first
description: Document schemas before migrations. Use when designing databases or planning data models.
user-invocable: false
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
---

# Schema-First Development Pattern

Knowledge module for documenting database schemas before creating migrations.

## When to Load References

| Task | Load |
|------|------|
| Need full users schema example | `references/implementation-examples.md` |
| Writing a migration from schema | `references/implementation-examples.md` |
| Implementing model or DTO from schema | `references/implementation-examples.md` |
| Polymorphic ownership, immutable ledgers, audit trails, index design | `references/data-integrity-patterns.md` |

---

## Workflow

### Schema-First Process
```
1. Document schema in docs/schemas/{table}.md
2. Review and validate schema
3. Create migration from schema documentation
4. Implement model with relationships
5. Create DTO for data transfer
```

---

## Schema Documentation Format

### Standard Schema Structure
```markdown
# Schema: {table_name}

## Purpose
{Description of what this table stores}

## Fields

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| id | uuid | No | auto | Primary key |
| {column} | {type} | {Yes/No} | {default} | {description} |
| created_at | timestamp | No | now() | Record creation time |
| updated_at | timestamp | No | now() | Record update time |
| deleted_at | timestamp | Yes | null | Soft delete timestamp |

## Relationships
- belongs_to: {table} (foreign_key: {column})
- has_many: {table} (foreign_key: {column})
- has_one: {table} (foreign_key: {column})
- belongs_to_many: {table} (pivot: {pivot_table})

## Indexes
- PRIMARY: id
- UNIQUE: {column}
- INDEX: {column} (purpose: {why})

## Constraints
- {column}: {constraint description}

## Enums
> Framework implementation: see the stack add-on's skill references.

## Notes
- {Any implementation notes}
- {Business rules}
```

---

## Column Type Reference

### Common Types
| Type | Description |
|------|-------------|
| uuid | UUID primary key |
| string(n) | Variable string |
| text | Long text |
| integer | Signed integer |
| unsignedBigInteger | Foreign key type |
| boolean | True/false |
| decimal(p,s) | Precise decimal |
| timestamp | Date and time |
| date | Date only |
| json | JSON data |
| enum | Enumerated values |

The migration builder call for each type is in the stack add-on's skill.

### Monetary Values
One money rule for the whole kit: a currency amount is an **integer in minor units** (cents) **plus a currency column**. Never a float, and not a decimal either, so arithmetic stays exact and every amount knows its currency:
```markdown
| Column | Type | Description |
|--------|------|-------------|
| amount | unsignedBigInteger | Amount in minor units (cents) |
| currency | char(3) | ISO 4217 code for amount |
| balance | bigInteger | Balance in minor units (signed when it can go negative) |
```

---

## Relationship Patterns

### One-to-One
```markdown
## users table
- has_one: wallet (foreign_key: user_id)

## wallets table
| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| user_id | uuid | No | Foreign key to users |

- belongs_to: user (foreign_key: user_id)
```

### One-to-Many
```markdown
## users table
- has_many: orders (foreign_key: user_id)

## orders table
| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| user_id | uuid | No | Foreign key to users |

- belongs_to: user (foreign_key: user_id)
```

### Many-to-Many
```markdown
## users table
- belongs_to_many: roles (pivot: role_user)

## roles table
- belongs_to_many: users (pivot: role_user)

## role_user (pivot)
| Column | Type | Description |
|--------|------|-------------|
| user_id | uuid | Foreign key to users |
| role_id | uuid | Foreign key to roles |
| assigned_at | timestamp | When role was assigned |
```

---

## Schema Review Checklist

Before creating migration:
- [ ] All columns documented with types
- [ ] Nullable/default values specified
- [ ] Relationships defined
- [ ] Indexes identified for query patterns
- [ ] Enums defined with all possible values
- [ ] Foreign key constraints documented
- [ ] Soft deletes considered
- [ ] Timestamps included

---
