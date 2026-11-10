---
paths:
  - "app/Services/**"
  - "app/Data/**"
  - "app/DTOs/**"
  - "app/Repositories/**"
  - "app/Events/**"
  - "**/Domain/**"
  - "**/Infrastructure/Repositories/**"
---

# Services, repositories, DTOs

## Layers

```
Controller -> Service (DTOs in/out) -> Repository -> Model
```

- **Services** hold business rules, orchestration, transactions, and event dispatch. They take and return DTOs.
- **Repositories** hold every query. They convert models to DTOs and are bound to an interface in a service provider.
- **Models** hold relations, casts, and scopes. No business logic.

## DTOs (Spatie Laravel Data)

- Input DTOs validate (`validateAndCreate`). Output DTOs build from models with `fromModel()` and expose `toApiArray()`.
- Make properties `readonly` and typed. Use enums for statuses and `Lazy` for optional relations.
- Never pass raw `array $data` or `Request` into a service, and never return an Eloquent model out of one.
- Events carry DTOs, not models, so queued listeners don't re-query stale state.

```php
// Wrong: raw array in, model out
public function create(array $data): Order

// Right
public function create(CreateOrderDTO $dto): OrderDTO
```

## Transactions and money

- Wrap a multi-write operation in `DB::transaction()` inside the service. Dispatch events after commit (`ShouldDispatchAfterCommit` or `afterCommit()`).
- When a read-then-write touches balances, stock, or counters, use `lockForUpdate()` or an atomic update. Prove it with a concurrent test.
- Money is integer minor units end to end (INV-01). Compute balances from the ledger. Don't store them as mutable totals.

## Errors

- Throw typed domain exceptions (`InsufficientStockException`) and map them to HTTP responses in one place (the exception handler), not in each controller.

## When you change a DTO

Update every `from()`/`fromModel()` caller, events and listeners carrying it, Resources, frontend types, and tests.
