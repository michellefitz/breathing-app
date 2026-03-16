import SwiftUI
import UIKit
import QuartzCore

// MARK: - Canvas proxy

/// Holds a weak reference to the canvas UIView so that the DisplayLinkDriver
/// can call setNeedsDisplay() on it from SessionView — avoiding a second CADisplayLink.
final class CanvasRef {
    weak var view: KaleidoscopeUIView?
    func invalidate() { view?.setNeedsDisplay() }
}

// MARK: - UIView

/// Full-screen kaleidoscope canvas. Rendering is driven externally via CanvasRef.invalidate()
/// called from SessionView's DisplayLinkDriver — a single CADisplayLink for both model
/// updates and rendering, eliminating double-tick jitter.
final class KaleidoscopeUIView: UIView {
    var engine: KaleidoscopeEngine?

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .black
        isOpaque = true
    }

    required init?(coder: NSCoder) { fatalError() }

    override func draw(_ rect: CGRect) {
        guard let engine,
              let ctx = UIGraphicsGetCurrentContext() else { return }
        engine.render(in: ctx, size: bounds.size)
    }
}

// MARK: - SwiftUI wrapper

struct KaleidoscopeCanvasView: UIViewRepresentable {
    let engine: KaleidoscopeEngine
    let canvasRef: CanvasRef

    func makeUIView(context: Context) -> KaleidoscopeUIView {
        let view = KaleidoscopeUIView()
        view.engine = engine
        canvasRef.view = view
        return view
    }

    func updateUIView(_ uiView: KaleidoscopeUIView, context: Context) {
        uiView.engine = engine
        canvasRef.view = uiView
    }
}
