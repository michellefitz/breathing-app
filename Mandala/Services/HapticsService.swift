import Foundation
import CoreHaptics
import SwiftUI

// MARK: - Environment key
private struct HapticsServiceKey: EnvironmentKey {
    static let defaultValue = HapticsService()
}
extension EnvironmentValues {
    var hapticsService: HapticsService {
        get { self[HapticsServiceKey.self] }
        set { self[HapticsServiceKey.self] = newValue }
    }
}

final class HapticsService {
    private var engine: CHHapticEngine?

    var isSupported: Bool { CHHapticEngine.capabilitiesForHardware().supportsHaptics }

    func prepare() {
        guard isSupported else { return }
        do {
            engine = try CHHapticEngine()
            engine?.isAutoShutdownEnabled = false
            try engine?.start()
            engine?.stoppedHandler = { [weak self] reason in
                Task { @MainActor in
                    try? self?.engine?.start()
                }
            }
            engine?.resetHandler = { [weak self] in
                Task { @MainActor in
                    try? self?.engine?.start()
                }
            }
        } catch {
            // Haptics not available; degrade gracefully
        }
    }

    func stop() {
        engine?.stop()
    }

    // MARK: - Phase transition haptics

    func playPhaseTransition(_ phase: BreathPhase) {
        switch phase {
        case .inhale:   fireTransient(at: 0, intensity: 0.4, sharpness: 0.3)
        case .holdIn:   fireTransient(at: 0, intensity: 0.2, sharpness: 0.6)
        case .exhale:   fireTransient(at: 0, intensity: 0.35, sharpness: 0.2)
        case .holdOut:  fireTransient(at: 0, intensity: 0.15, sharpness: 0.4)
        }
    }

    // MARK: - Helpers

    private func fireTransient(at time: TimeInterval, intensity: Float, sharpness: Float) {
        guard isSupported, let engine else { return }
        let params: [CHHapticEventParameter] = [
            CHHapticEventParameter(parameterID: .hapticIntensity, value: intensity),
            CHHapticEventParameter(parameterID: .hapticSharpness, value: sharpness)
        ]
        let event = CHHapticEvent(eventType: .hapticTransient, parameters: params, relativeTime: time)
        do {
            let pattern = try CHHapticPattern(events: [event], parameters: [])
            let player = try engine.makePlayer(with: pattern)
            try player.start(atTime: CHHapticTimeImmediate)
        } catch {}
    }
}
