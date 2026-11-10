import Foundation

protocol {{Entity}}Client: Sendable {
    func {{entity}}(_ id: {{Entity}}.ID) async throws -> {{Entity}}
}

struct Live{{Entity}}Client: {{Entity}}Client {
    let baseURL: URL
    var session: URLSession = .shared
    var decoder: JSONDecoder = .init()

    func {{entity}}(_ id: {{Entity}}.ID) async throws -> {{Entity}} {
        let request = URLRequest(url: baseURL.appending(path: "{{entity}}/\(id)"))
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw APIError.badStatus((response as? HTTPURLResponse)?.statusCode ?? -1)
        }
        return try decoder.decode({{Entity}}.self, from: data)
    }
}
