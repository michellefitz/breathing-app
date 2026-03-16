import SwiftUI

struct BreathPhaseLabel: View {
    let breathPhase: BreathPhase
    let breathElapsed: Double       // 0 → breathPhaseDuration

    @State private var pulseOpacity: Double = 0.60
    @State private var pulseTimer: Timer?   = nil

    // Number of dots remaining (4 → 3 → 2 → 1 as seconds tick by)
    private var dotsShown: Int {
        max(1, 4 - Int(breathElapsed))
    }

    private let dotColor = Color(red: 218/255, green: 208/255, blue: 1.0)
    private var isHold: Bool { breathPhase == .holdIn || breathPhase == .holdOut }

    var body: some View {
        VStack(spacing: 14) {
            Text(breathPhase.displayText)
                .font(.custom("DMSans-Light", size: 20))
                .tracking(3)
                .foregroundStyle(dotColor.opacity(0.90))
                .opacity(pulseOpacity)
                .id(breathPhase)
                .transition(.opacity.animation(.easeInOut(duration: 0.6)))
                .animation(.easeInOut(duration: 0.6), value: breathPhase)

            // Progress dots — only during hold phases
            HStack(spacing: 7) {
                ForEach(0..<4, id: \.self) { index in
                    Circle()
                        .fill(dotColor)
                        .frame(width: 5, height: 5)
                        .opacity(isHold && index < dotsShown ? 0.68 : 0.0)
                        .animation(.easeOut(duration: 0.35), value: dotsShown)
                        .animation(.easeInOut(duration: 0.5), value: isHold)
                }
            }
            .frame(height: 5) // reserve space even when dots are hidden
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 110)
        .frame(maxHeight: .infinity, alignment: .top)
        .onAppear(perform: startPulse)
        .onDisappear(perform: stopPulse)
    }

    private func startPulse() {
        var goingUp = true
        pulseTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { _ in
            withAnimation(.easeInOut(duration: 1.0)) {
                pulseOpacity = goingUp ? 0.70 : 0.55
            }
            goingUp.toggle()
        }
    }

    private func stopPulse() {
        pulseTimer?.invalidate()
        pulseTimer = nil
    }
}
