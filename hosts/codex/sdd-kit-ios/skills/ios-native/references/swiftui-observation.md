# SwiftUI + Observation

The Observation framework (`@Observable`) replaces `ObservableObject`/`@Published`. A view observes only the properties it reads, so updates are fine-grained.

## View model
```swift
import Observation

@MainActor
@Observable
final class ProfileViewModel {
    enum State: Equatable { case idle, loading, loaded(Profile), failed(String) }
    private(set) var state: State = .idle
    private let client: ProfileClient
    init(client: ProfileClient) { self.client = client }

    func load(id: Profile.ID) async {
        state = .loading
        do { state = .loaded(try await client.profile(id)) }
        catch { state = .failed(error.localizedDescription) }
    }
}
```

## Binding in the view
- `@State private var model: SomeViewModel` — the view owns the model instance.
- `@Bindable var model` — when you need two-way bindings (`$model.name`) into an `@Observable`.
- Pass child state down; never reach for a global singleton inside a view.

```swift
struct ProfileScreen: View {
    @State private var model: ProfileViewModel
    let id: Profile.ID
    init(model: ProfileViewModel, id: Profile.ID) {
        _model = State(initialValue: model); self.id = id
    }
    var body: some View {
        content.task { await model.load(id: id) }   // runs on appear, cancels on disappear
    }
    @ViewBuilder private var content: some View {
        switch model.state {
        case .idle, .loading: ProgressView()
        case .loaded(let p):  Text(p.name)
        case .failed(let m):  ContentUnavailableView("Error", systemImage: "xmark.circle", description: Text(m))
        }
    }
}
```

## Rules
- Model is `@MainActor` so UI mutations are safe; annotate the whole class, not each method.
- Keep a single explicit `State` enum — it makes every screen state testable and previewable.
- Use `.task {}` (auto-cancels) over `.onAppear { Task {} }` for lifecycle-bound async work.
