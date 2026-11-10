# SwiftData

Prefer SwiftData for new persistence. Use CoreData/GRDB only when the app already standardizes on them.

## Model
```swift
import SwiftData

@Model
final class Order {
    @Attribute(.unique) var id: UUID
    var total: Decimal
    var createdAt: Date
    @Relationship(deleteRule: .cascade) var items: [OrderItem]

    init(id: UUID = UUID(), total: Decimal, createdAt: Date = .now, items: [OrderItem] = []) {
        self.id = id; self.total = total; self.createdAt = createdAt; self.items = items
    }
}
```

## Container + queries
```swift
// App entry
.modelContainer(for: [Order.self, OrderItem.self])

// In a view
@Query(sort: \Order.createdAt, order: .reverse) private var orders: [Order]
@Environment(\.modelContext) private var context

context.insert(order)
try context.save()
```

## Migration
- Additive changes (new optional property, new model) are lightweight — no plan needed.
- Renames, type changes, or required new fields need a `SchemaMigrationPlan` with a `VersionedSchema` per version.
- Never mutate a shipped `@Model` in place for a breaking change; add a schema version and a migration stage.

## Rules
- Keep `@Model` types free of view logic; map to plain `Sendable` structs when handing data to concurrency.
- Do the `modelContext` writes on the main actor (SwiftData contexts are main-actor bound by default).
