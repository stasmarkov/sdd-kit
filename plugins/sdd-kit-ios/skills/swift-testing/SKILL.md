---
name: swift-testing
description: "Testing iOS/Swift code with the Swift Testing framework (@Test / #expect) and XCTest. Use when writing unit tests for view models, clients, and Swift packages, or running xcodebuild test on the simulator."
allowed-tools: Read, Grep, Glob, Edit, Write, Bash
paths:
  - "**/*Tests.swift"
  - "**/Tests/**"
  - "**/*Test.swift"
---

# Swift Testing

Prefer the Swift Testing framework (`import Testing`, `@Test`, `#expect`, `#require`) for new tests. XCTest is still valid for legacy suites and UI tests.

## Quick Reference

| Task | Swift Testing | XCTest |
|------|---------------|--------|
| Declare a test | `@Test func x() {}` | `func testX() {}` |
| Assert | `#expect(a == b)` | `XCTAssertEqual(a, b)` |
| Unwrap-or-fail | `let v = try #require(opt)` | `let v = try XCTUnwrap(opt)` |
| Fail explicitly | `Issue.record("msg")` | `XCTFail("msg")` |
| Async | `@Test func x() async throws` | `func testX() async throws` |
| Group | `struct FooTests {}` | `class FooTests: XCTestCase {}` |
| Parametrize | `@Test(arguments: [1,2,3])` | manual loop |

## Patterns

### Suite for a view model
```swift
import Testing
@testable import MyApp

struct CheckoutViewModelTests {
    @Test
    func transitionsToLoadedOnSuccess() async {
        let model = CheckoutViewModel(payments: FakePaymentClient(result: .success(.stub)))
        await model.submit(.stub)
        #expect(model.state == .loaded(.stub))
    }

    @Test
    func transitionsToFailedOnError() async {
        let model = CheckoutViewModel(payments: FakePaymentClient(result: .failure(APIError.badStatus(402))))
        await model.submit(.stub)
        guard case .failed = model.state else {
            Issue.record("expected .failed, got \(model.state)")
            return
        }
    }
}
```

### Parametrized cases
```swift
@Test(arguments: [(-1, false), (0, false), (1, true)])
func validatesAmount(amount: Int, isValid: Bool) {
    #expect(Cart(amount: amount).isValid == isValid)
}
```

### Fakes over mocks
Inject a `Sendable` fake that conforms to the same client protocol; drive it with a `Result`. No mocking framework needed.

## Running

```bash
# Full test bundle on a simulator (detect the scheme first: xcodebuild -list -json)
set -o pipefail && xcodebuild test -scheme "$SCHEME" -destination "platform=iOS Simulator,name=iPhone 16" | xcbeautify

# SwiftPM package
swift test
```

## Rules
- One explicit assertion per behavior; assert on the view model's `State` enum, not on private internals.
- Keep tests deterministic — inject the clock/UUID/network; never hit the real network or `Date()`.
- Do not delete or `@disabled` a failing test to make a gate pass; fix the code.
- `@MainActor`-isolated types under test: mark the test `@MainActor` or `await` across the hop.

---
