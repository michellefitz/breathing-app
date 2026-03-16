import SwiftUI

@main
struct MandalaApp: App {
    @State private var sessionModel   = SessionModel()
    @State private var audioService   = AudioService()
    @State private var hapticsService = HapticsService()

    var body: some Scene {
        WindowGroup {
            RootNavigator()
                .environment(sessionModel)
                .environment(\.audioService, audioService)
                .environment(\.hapticsService, hapticsService)
        }
    }
}

/// Phase-driven root view. Switching between phases triggers a cross-fade via
/// `.transition(.opacity)` + `.animation(…, value: model.phase)`.
private struct RootNavigator: View {
    @Environment(SessionModel.self) var model

    var body: some View {
        ZStack {
            switch model.phase {
            case .idle:
                WelcomeView()
                    .transition(.opacity)
            case .preparing:
                PrepView()
                    .transition(.opacity)
            case .active, .ending:
                SessionView()
                    .transition(.opacity)
            case .completed:
                CompletionView()
                    .transition(.opacity)
            }
        }
        .animation(.easeInOut(duration: 0.85), value: model.phase)
    }
}
