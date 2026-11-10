import SwiftUI

struct {{Entity}}Screen: View {
    @State private var model: {{Entity}}ViewModel
    let id: {{Entity}}.ID

    init(model: {{Entity}}ViewModel, id: {{Entity}}.ID) {
        _model = State(initialValue: model)
        self.id = id
    }

    var body: some View {
        content
            .task { await model.load(id: id) }
    }

    @ViewBuilder
    private var content: some View {
        switch model.state {
        case .idle, .loading:
            ProgressView()
        case .loaded(let {{entity}}):
            {{Entity}}DetailView({{entity}}: {{entity}})
        case .failed(let message):
            ContentUnavailableView("Something went wrong", systemImage: "xmark.circle", description: Text(message))
        }
    }
}
