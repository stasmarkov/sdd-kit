---
name: architecture-patterns
description: Implement Clean Architecture, Hexagonal Architecture, and DDD patterns. Use when designing new modules or refactoring for maintainability.
user-invocable: false
allowed-tools: Read, Grep, Glob
---

# Architecture Patterns

Implement Clean Architecture, Hexagonal Architecture, and Domain-Driven Design patterns to build maintainable, testable, and scalable applications in any stack.

## When to Use This Skill

- Designing new modules or bounded contexts
- Refactoring monolithic code for better separation
- Implementing complex business logic
- Creating highly testable code
- Establishing architecture standards for teams
- Planning domain boundaries in microservices

## When to Load References

| Task | Load |
|------|------|
| Implementing domain entities, value objects, repository adapters, application handlers (CQRS) | the stack add-on's skill references, when a stack add-on is installed |
| Choosing infrastructure technologies (queues, search, real-time, caching) | `references/technology-selection.md` |

---

## Core Concepts

### 1. Dependency Rule

Dependencies point inward. Inner layers know nothing about outer layers.

```
┌──────────────────────────────────────────────────┐
│                  Frameworks                       │  <- Web framework, UI toolkit
│  ┌────────────────────────────────────────────┐  │
│  │              Interface Adapters             │  │  <- Controllers, Repositories
│  │  ┌──────────────────────────────────────┐  │  │
│  │  │          Application Layer           │  │  │  <- Use Cases, Services
│  │  │  ┌────────────────────────────────┐  │  │  │
│  │  │  │         Domain Layer           │  │  │  │  <- Entities, Value Objects
│  │  │  └────────────────────────────────┘  │  │  │
│  │  └──────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

**Key Points:**
- Domain layer has NO dependencies
- Application layer depends only on Domain
- Infrastructure depends on Application and Domain
- Framework code lives in the outermost layer

### 2. Ports and Adapters (Hexagonal)

The application core defines ports (interfaces). Adapters implement those ports for specific technologies.

- Ports are interfaces defined in the domain/application
- Adapters are implementations in infrastructure
- Easy to swap implementations (database, APIs, etc.)
- Testing uses mock adapters

### 3. Domain-Driven Design

Organize code around business domains, not technical concerns.

- Bounded Contexts define clear boundaries
- Ubiquitous Language shared with domain experts
- Aggregates ensure consistency boundaries
- Domain Events for cross-context communication

---

## Module Structure

**Use when**: Creating new domain modules

```
modules/payment/
├── application/                    # Application layer
│   ├── commands/                   # Write operations (one handler per command)
│   ├── queries/                    # Read operations (one handler per query)
│   └── http/                       # Delivery adapters: controllers, request validation, response mappers
│
├── domain/                         # Domain layer (NO DEPENDENCIES)
│   ├── entities/
│   ├── value-objects/
│   ├── events/
│   ├── exceptions/
│   ├── contracts/                  # Ports (interfaces): repository, gateway
│   └── services/                   # Domain services
│
├── infrastructure/                 # Infrastructure layer (adapters)
│   ├── persistence/                # Repository implementations and persistence models
│   ├── gateway/                    # External provider clients
│   └── routes/
│
└── tests/
    ├── unit/                       # Domain logic, no database or framework
    └── feature/                    # Use cases through the delivery layer
```

File naming, directory casing and dependency-injection wiring follow the stack's conventions (see the stack add-on's skill).

---

## Domain Building Blocks (Summary)

### Entity

Business object with identity that encapsulates behavior and records domain events.

- Private constructor with named static factories (`create`, `reconstitute`)
- Behavior methods enforce invariants before state change
- Domain events recorded internally, flushed by infrastructure
- No framework dependencies - plain language constructs only

### Value Object

Immutable, self-validating object compared by value.

- `readonly` class with private constructor and static factories
- Operations return new instances (never mutate)
- Explicit `equals()` method for value comparison
- Constructor rejects invalid state

### Repository Interface (Port)

Defined in Domain layer. Methods accept and return domain objects only.

- No ORM models or query builders in the signature
- `nextIdentity()` generates IDs before persistence
- One interface per aggregate root

### Application Service (Handler)

Orchestrates domain operations for a single use case.

- One handler per use case (single responsibility)
- Constructor injection of ports, not concrete implementations
- Returns DTO, never exposes domain entity
- Delegates business rules to domain layer

> For full implementation code, load the relevant reference file from the table above.

---

## Best Practices

### Layer Separation
1. **Domain layer has NO framework imports**: no ORM, no framework helpers
2. **DTOs cross boundaries**: Never pass entities out of application layer
3. **Interfaces in domain**: Concrete implementations in infrastructure
4. **Wire ports to adapters in one place per module**: the framework's dependency-injection container

### Testing
1. **Unit test domain logic**: No database, no framework
2. **Mock infrastructure**: Use in-memory implementations
3. **Integration test adapters**: Verify they work with real dependencies

### Naming
1. **Ubiquitous language**: Use business terms, not technical ones
2. **Explicit intent**: `CreatePaymentHandler` not `PaymentManager`
3. **Layer suffixes**: `*Repository`, `*Service`, `*Handler`

---

## Common Pitfalls

| Pitfall | Solution |
|---------|----------|
| Anemic domain model (only getters/setters) | Put behavior in entities |
| Framework in domain (ORM models in the domain layer) | Create separate persistence models |
| Leaking entities (returning from handlers) | Use DTOs for responses |
| Fat controllers (business logic in controllers) | Move to application/domain layer |
| Circular dependencies (modules depend on each other) | Use events for cross-module communication |
| Over-engineering (DDD for simple CRUD) | Use simpler patterns when appropriate |

---

## Quick Reference

| Concept | Location | Purpose |
|---------|----------|---------|
| Entity | Domain | Business object with identity |
| Value Object | Domain | Immutable object with value equality |
| Domain Service | Domain | Stateless domain logic |
| Repository Interface | Domain | Port for persistence |
| Repository Impl | Infrastructure | Adapter for database |
| Application Service | Application | Use case orchestration |
| Controller | Application/Http | HTTP adapter |
| DTO | Application | Data transfer across boundaries |

---

## Related Skills

- **dto-first**: Data transfer objects for layer boundaries
- **service-repository**: Simpler pattern for less complex domains
- **api-design**: Designing the HTTP adapter layer
