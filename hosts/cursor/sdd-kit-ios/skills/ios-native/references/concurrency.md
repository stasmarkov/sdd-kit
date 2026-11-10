# Swift 6 Concurrency

Swift 6 enforces data-race safety at compile time. Design around isolation rather than fighting warnings.

## Isolation
- `@MainActor` — UI + view models. All members hop to the main actor.
- `actor` — serializes access to mutable state shared across tasks (caches, in-memory stores).
- `nonisolated` — pure, isolation-free members (e.g. `Sendable` value transforms).

## Sendable
Anything crossing an isolation boundary must be `Sendable`. Prefer value types (`struct`, `enum`) with `Sendable` stored properties. Mark protocols used at I/O boundaries `Sendable`:
```swift
protocol ImageLoader: Sendable {
    func load(_ url: URL) async throws -> Data
}
```

## Structured concurrency
```swift
// Parallel children, all awaited; cancellation propagates.
async let a = client.summary()
async let b = client.details()
let (summary, details) = try await (a, b)

// Fan-out over a collection
try await withThrowingTaskGroup(of: Row.self) { group in
    for id in ids { group.addTask { try await client.row(id) } }
    var rows: [Row] = []
    for try await row in group { rows.append(row) }
    return rows
}
```

## Rules
- Do not use `@unchecked Sendable` to silence a warning — fix the shared mutable state.
- Long/parallel work goes in an `actor` or a task group; the view model just awaits `Sendable` results.
- Respect cancellation: check `Task.isCancelled` or let `try await` throw `CancellationError`.
