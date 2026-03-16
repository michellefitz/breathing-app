import SwiftUI

/// Full-screen session. Single CADisplayLink drives both model updates and canvas redraws.
/// Always-visible "end" label at top right — no tap-to-reveal HUD.
struct SessionView: View {
    @Environment(SessionModel.self)    var model
    @Environment(\.audioService)       var audio
    @Environment(\.hapticsService)     var haptics

    @State private var driver    = DisplayLinkDriver()
    @State private var canvasRef = CanvasRef()

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            KaleidoscopeCanvasView(engine: model.engine, canvasRef: canvasRef)
                .ignoresSafeArea()

            BreathPhaseLabel(breathPhase: model.breathPhase, breathElapsed: model.breathElapsed)

            // Always-visible subtle end button — top right
            VStack {
                HStack {
                    Spacer()
                    Button {
                        model.endSession()
                    } label: {
                        Text("END")
                            .font(.custom("DMSans-Light", size: 11))
                            .tracking(2.5)
                            .foregroundStyle(.white.opacity(0.25))
                    }
                    .padding(.top, 62)
                    .padding(.trailing, 28)
                }
                Spacer()
            }
        }
        .statusBarHidden(true)
        .onAppear { startDriver() }
        .onDisappear { driver.stop() }
        .onChange(of: model.breathPhase) { _, phase in
            haptics.playPhaseTransition(phase)
        }
        .onChange(of: model.phase) { _, phase in
            if phase == .ending {
                audio.stop()
                Task {
                    try? await Task.sleep(nanoseconds: 2_200_000_000)
                    model.completeSession()
                }
            }
        }
    }

    private func startDriver() {
        haptics.prepare()
        audio.start()
        driver.onFrame = { [weak model, weak canvasRef] dt in
            model?.advance(dt: dt)
            canvasRef?.invalidate()
        }
        driver.start()
    }
}
