import Observation

@MainActor
@Observable
final class {{Entity}}ViewModel {
    enum State: Equatable {
        case idle
        case loading
        case loaded({{Entity}})
        case failed(String)
    }

    private(set) var state: State = .idle
    private let client: {{Entity}}Client

    init(client: {{Entity}}Client) {
        self.client = client
    }

    func load(id: {{Entity}}.ID) async {
        state = .loading
        do {
            state = .loaded(try await client.{{entity}}(id))
        } catch {
            state = .failed(error.localizedDescription)
        }
    }
}
