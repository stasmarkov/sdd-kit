---
name: ios-native
description: Native iOS development with Swift 6 and SwiftUI. Use for views, @Observable view models, structured concurrency, URLSession networking, and SwiftData persistence in iOS/iPadOS apps and Swift packages.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
paths:
  - "**/*.swift"
  - "**/Sources/**"
  - "**/*.xcodeproj/**"
  - "**/*.xcworkspace/**"
  - "**/Package.swift"
---

# iOS Native Development Patterns

Apply these patterns when building SwiftUI apps or Swift packages targeting Apple platforms.

## Quick Reference

| Task | Pattern |
|------|---------|
| View state | `@Observable` `@MainActor` view model, bound with `@State` |
| Concurrency | `async`/`await`, `actor`, `@MainActor`; types crossing domains are `Sendable` |
| Networking | `URLSession.data(for:)` async + `Codable` behind a `Sendable` protocol |
| Persistence | SwiftData `@Model`; CoreData/GRDB only if the app already uses them |
| Navigation | `NavigationStack` + a typed path enum |
| Dependency injection | Constructor-inject protocol clients; fake them in tests |
| Errors | Typed `Error`; render with `ContentUnavailableView` or an alert |

## When to Load References

| Task | Load |
|------|------|
| SwiftUI views + Observation binding | `references/swiftui-observation.md` |
| Concurrency, actors, Sendable | `references/concurrency.md` |
| SwiftData models + migration | `references/swiftdata.md` |
| Networking clients | `references/networking.md` |

## Code Templates

Use templates from `assets/templates/` for scaffolding:

| Template | Purpose |
|----------|---------|
| `view.swift` | SwiftUI screen bound to a view model |
| `viewmodel.swift` | `@Observable` `@MainActor` view model with a State enum |
| `model.swift` | SwiftData `@Model` domain entity |
| `client.swift` | Protocol networking client + live implementation |
| `test.swift` | Swift Testing suite for a view model |

## Project Structure

```
MyApp/
├── App/                    # @main App, root scene
├── Sources/ (or Features/) # one folder per feature
│   └── Checkout/
│       ├── CheckoutScreen.swift      # View
│       ├── CheckoutViewModel.swift   # @Observable @MainActor
│       └── PaymentClient.swift       # protocol + Live impl
├── Models/                 # SwiftData @Model types
├── Networking/             # shared URLSession client, APIError
└── Tests/                  # Swift Testing / XCTest bundles
```

## Core Patterns

### 1. MVVM with Observation
Thin declarative View → `@Observable` `@MainActor` ViewModel → protocol Client/Store → I/O.
Views hold no business logic. State transitions live in the view model as an explicit `State` enum so they are testable.

### 2. Concurrency-first
Kick off work with `Task { await model.load() }` from the view; the view model is `@MainActor` so UI state mutates safely. Push blocking/parallel work into `actor`s or detached tasks and return `Sendable` results.

### 3. Inject at the boundary
Every side effect (network, disk, clock) sits behind a `Sendable` protocol constructor-injected into the view model. Production wires `Live*`; tests wire `Fake*`. No singletons reached from inside view models.

### 4. Build against the simulator
Gate builds/tests with `-destination "generic/platform=iOS Simulator"` (build) and `"platform=iOS Simulator,name=iPhone 16"` (test) so code signing never blocks CI. Detect the scheme with `xcodebuild -list -json` before running.

## Gate Commands

```bash
swiftformat --lint .
swiftlint --strict
set -o pipefail && xcodebuild build -scheme "$SCHEME" -destination "generic/platform=iOS Simulator" | xcbeautify
set -o pipefail && xcodebuild test  -scheme "$SCHEME" -destination "platform=iOS Simulator,name=iPhone 16" | xcbeautify
```

Debug-statement scan for gates: fail on stray `print(`, `debugPrint(`, `NSLog(` outside test targets.

---
