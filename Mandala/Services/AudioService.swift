import AVFoundation
import SwiftUI

// MARK: - Environment key

private struct AudioServiceKey: EnvironmentKey {
    static let defaultValue = AudioService()
}
extension EnvironmentValues {
    var audioService: AudioService {
        get { self[AudioServiceKey.self] }
        set { self[AudioServiceKey.self] = newValue }
    }
}

/// Plays the bundled meditation track with smooth fade-in and fade-out.
final class AudioService: @unchecked Sendable {
    private var player: AVAudioPlayer?
    private var fadeTimer: Timer?
    private var isRunning = false

    func start() {
        guard !isRunning else { return }
        isRunning = true

        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, options: [.mixWithOthers])
            try session.setActive(true)
        } catch {}

        guard let url = Bundle.main.url(forResource: "prism-music", withExtension: "mp3") else { return }

        do {
            let p = try AVAudioPlayer(contentsOf: url)
            p.numberOfLoops = -1   // loop indefinitely
            p.volume = 0
            p.prepareToPlay()
            p.play()
            player = p
        } catch { return }

        fadeVolume(to: 0.85, duration: 3.0)
    }

    func stop() {
        guard isRunning else { return }
        isRunning = false
        fadeVolume(to: 0, duration: 2.0) { [weak self] in
            self?.player?.stop()
            self?.player = nil
        }
    }

    // MARK: - Volume fade

    private func fadeVolume(to target: Float, duration: TimeInterval, completion: (() -> Void)? = nil) {
        fadeTimer?.invalidate()
        let steps = 60
        let stepInterval = duration / Double(steps)
        let startVolume = player?.volume ?? 0
        var currentStep = 0

        fadeTimer = Timer.scheduledTimer(withTimeInterval: stepInterval, repeats: true) { [weak self] timer in
            currentStep += 1
            let t = Float(currentStep) / Float(steps)
            self?.player?.volume = startVolume + (target - startVolume) * t
            if currentStep >= steps {
                timer.invalidate()
                self?.player?.volume = target
                completion?()
            }
        }
    }
}
