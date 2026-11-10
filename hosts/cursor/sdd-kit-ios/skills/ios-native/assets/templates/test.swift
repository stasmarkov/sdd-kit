import Testing
@testable import {{Module}}

struct {{Entity}}ViewModelTests {
    @Test
    func loadsSuccessfully() async {
        let model = {{Entity}}ViewModel(client: Fake{{Entity}}Client(result: .success(.stub)))
        await model.load(id: .stub)
        #expect(model.state == .loaded(.stub))
    }

    @Test
    func surfacesFailure() async {
        let model = {{Entity}}ViewModel(client: Fake{{Entity}}Client(result: .failure(APIError.badStatus(500))))
        await model.load(id: .stub)
        guard case .failed = model.state else {
            Issue.record("expected failed state, got \(model.state)")
            return
        }
    }
}

struct Fake{{Entity}}Client: {{Entity}}Client {
    let result: Result<{{Entity}}, Error>
    func {{entity}}(_ id: {{Entity}}.ID) async throws -> {{Entity}} { try result.get() }
}
