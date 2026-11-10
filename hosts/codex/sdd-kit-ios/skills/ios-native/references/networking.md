# Networking

Wrap `URLSession` async APIs behind a `Sendable` protocol so screens depend on an interface, not the transport.

## Error type
```swift
enum APIError: Error, Equatable {
    case badStatus(Int)
    case decoding(String)
    case transport(String)
}
```

## Protocol + live client
```swift
protocol OrderClient: Sendable {
    func orders() async throws -> [Order]
    func create(_ draft: OrderDraft) async throws -> Order
}

struct LiveOrderClient: OrderClient {
    let baseURL: URL
    var session: URLSession = .shared
    var decoder: JSONDecoder = .init()

    func orders() async throws -> [Order] {
        try await get("orders")
    }
    func create(_ draft: OrderDraft) async throws -> Order {
        try await post("orders", body: draft)
    }

    private func get<T: Decodable>(_ path: String) async throws -> T {
        try await send(URLRequest(url: baseURL.appending(path: path)))
    }
    private func post<T: Decodable, B: Encodable>(_ path: String, body: B) async throws -> T {
        var req = URLRequest(url: baseURL.appending(path: path))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONEncoder().encode(body)
        return try await send(req)
    }
    private func send<T: Decodable>(_ req: URLRequest) async throws -> T {
        let (data, response): (Data, URLResponse)
        do { (data, response) = try await session.data(for: req) }
        catch { throw APIError.transport(error.localizedDescription) }
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw APIError.badStatus((response as? HTTPURLResponse)?.statusCode ?? -1)
        }
        do { return try decoder.decode(T.self, from: data) }
        catch { throw APIError.decoding(String(describing: error)) }
    }
}
```

## Rules
- Inject the client; production uses `Live*`, tests use a `Fake*` conforming to the same protocol.
- Never call `URLSession.shared` directly from a view model — go through the protocol.
- Keep auth/token logic in one shared client wrapper, not scattered per request.
