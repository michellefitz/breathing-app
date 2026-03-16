import Foundation
import CoreGraphics
import SwiftUI

// MARK: - BreathPhase

enum BreathPhase: Equatable, Hashable {
    case inhale, holdIn, exhale, holdOut

    var isActive: Bool { self == .inhale || self == .exhale }

    var displayText: String {
        switch self {
        case .inhale:   return "breathe in"
        case .holdIn:   return "hold"
        case .exhale:   return "breathe out"
        case .holdOut:  return "hold"
        }
    }

    var kaleidoscopePhase: String {
        switch self {
        case .inhale:   return "inhale"
        case .holdIn:   return "holdFull"
        case .exhale:   return "exhale"
        case .holdOut:  return "holdEmpty"
        }
    }

    func next() -> BreathPhase {
        switch self {
        case .inhale:   return .holdIn
        case .holdIn:   return .exhale
        case .exhale:   return .holdOut
        case .holdOut:  return .inhale
        }
    }
}

// MARK: - SessionPhase

enum SessionPhase: Equatable {
    case idle
    case preparing
    case active
    case ending
    case completed
}

// MARK: - SessionModel

@Observable
@MainActor
final class SessionModel {
    // MARK: - Engine
    let engine = KaleidoscopeEngine()

    // MARK: - Canvas size
    var canvasSize: CGSize = .zero

    // MARK: - Breath state
    var breathPhase: BreathPhase = .inhale
    var breathElapsed: Double    = 0
    var breathProgress: Double   = 0
    let breathPhaseDuration: Double = 4.0

    // MARK: - Session state
    var phase: SessionPhase  = .idle
    var elapsedSeconds: Double = 0

    // MARK: - Preset cycling
    private var currentPresetIndex: Int = 0

    // MARK: - Start / Stop

    func startSession() {
        elapsedSeconds = 0
        breathPhase    = .inhale
        breathElapsed  = 0
        breathProgress = 0
        currentPresetIndex = Int.random(in: 0..<ALL_PRESETS.count)
        applyCurrentPreset()
        phase = .preparing
    }

    func beginSession() {
        phase = .active
    }

    func endSession() {
        guard phase == .active else { return }
        phase = .ending
    }

    func completeSession() {
        phase = .completed
    }

    func resetToIdle() {
        phase          = .idle
        elapsedSeconds = 0
        breathPhase    = .inhale
        breathElapsed  = 0
        breathProgress = 0
    }

    // MARK: - Preset helpers

    private func applyCurrentPreset() {
        let preset = ALL_PRESETS[currentPresetIndex % ALL_PRESETS.count]
        engine.applyPreset(preset)
    }

    private func cyclePreset() {
        currentPresetIndex = (currentPresetIndex + 1) % ALL_PRESETS.count
        applyCurrentPreset()
    }

    // MARK: - Advance (called from DisplayLinkDriver each frame)

    func advance(dt: Double) {
        guard phase == .active || phase == .ending else { return }

        elapsedSeconds += dt

        // Advance breath timer
        let prevPhase = breathPhase
        breathElapsed += dt
        breathProgress = min(breathElapsed / breathPhaseDuration, 1.0)
        if breathElapsed >= breathPhaseDuration {
            breathElapsed = 0
            breathPhase   = breathPhase.next()
            // Cycle preset at each full breath cycle (after holdOut completes)
            if prevPhase == .holdOut {
                cyclePreset()
            }
        }

        // Update engine
        let t = min(breathElapsed / breathPhaseDuration, 1.0)
        engine.update(phase: breathPhase.kaleidoscopePhase, t: t, dt: dt)
    }
}
