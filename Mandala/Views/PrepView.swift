import SwiftUI

/// Interstitial countdown shown between the welcome screen and the first breath.
/// Counts 3 → 2 → 1, then hands off to the active session.
struct PrepView: View {
    @Environment(SessionModel.self) var model

    @State private var countdown: Int = 3

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            // Faint ambient glow — hints at the kaleidoscope to come
            RadialGradient(
                colors: [
                    Color(red: 168/255, green: 153/255, blue: 200/255).opacity(0.07),
                    .clear
                ],
                center: .center,
                startRadius: 0,
                endRadius: 180
            )
            .ignoresSafeArea()

            VStack(spacing: 22) {
                Text("Prepare for your first breath")
                    .font(.custom("DMSans-Light", size: 13))
                    .tracking(1.5)
                    .foregroundStyle(.white.opacity(0.38))

                Text("\(countdown)")
                    .font(.custom("DMSans-Light", size: 112))
                    .tracking(-1)
                    .foregroundStyle(.white.opacity(0.72))
                    .id(countdown)
                    .transition(.opacity.animation(.easeInOut(duration: 0.55)))
                    .animation(.easeInOut(duration: 0.55), value: countdown)
            }
        }
        .statusBarHidden(true)
        .onAppear(perform: startCountdown)
    }

    private func startCountdown() {
        Task { @MainActor in
            for next in [2, 1] {
                try? await Task.sleep(for: .seconds(1.2))
                withAnimation(.easeInOut(duration: 0.55)) { countdown = next }
            }
            try? await Task.sleep(for: .seconds(1.2))
            model.beginSession()
        }
    }
}
