import Foundation
import QuartzCore

/// Wraps CADisplayLink to drive frame-accurate animation updates.
/// Call start() on appear, stop() on disappear.
final class DisplayLinkDriver: NSObject {
    private var displayLink: CADisplayLink?
    private var lastTimestamp: CFTimeInterval = 0
    var onFrame: ((Double) -> Void)?

    func start() {
        guard displayLink == nil else { return }
        let link = CADisplayLink(target: self, selector: #selector(tick(_:)))
        link.preferredFrameRateRange = CAFrameRateRange(minimum: 60, maximum: 120, preferred: 120)
        link.add(to: .main, forMode: .common)
        displayLink = link
        lastTimestamp = 0
    }

    func stop() {
        displayLink?.invalidate()
        displayLink = nil
        lastTimestamp = 0
    }

    @objc private func tick(_ link: CADisplayLink) {
        let now = link.timestamp
        guard lastTimestamp > 0 else {
            lastTimestamp = now
            return
        }
        let dt = now - lastTimestamp
        lastTimestamp = now
        // Clamp dt to avoid huge jumps after backgrounding
        let clamped = min(dt, 0.05)
        onFrame?(clamped)
    }
}
