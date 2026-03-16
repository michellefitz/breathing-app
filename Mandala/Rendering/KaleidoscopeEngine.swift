import UIKit

// MARK: - Easings

private let TAU = Double.pi * 2

private let EASINGS: [String: (Double) -> Double] = [
    "linear":          { t in t },
    "easeInCubic":     { t in t * t * t },
    "easeOutCubic":    { t in 1 - pow(1 - t, 3) },
    "easeInOutCubic":  { t in t < 0.5 ? 4*t*t*t : 1 - pow(-2*t + 2, 3) / 2 },
    "easeInOutSine":   { t in -(cos(Double.pi * t) - 1) / 2 },
    "easeInOutQuart":  { t in t < 0.5 ? 8*t*t*t*t : 1 - pow(-2*t + 2, 4) / 2 },
    "easeOutElastic":  { t in
        if t == 0 { return 0 }
        if t == 1 { return 1 }
        return pow(2, -10 * t) * sin((t * 10 - 0.75) * (TAU / 3)) + 1
    },
    "easeInOutBack":   { t in
        let c = 1.70158 * 1.525
        if t < 0.5 {
            return (pow(2 * t, 2) * ((c + 1) * 2 * t - c)) / 2
        } else {
            return (pow(2 * t - 2, 2) * ((c + 1) * (2 * t - 2) + c) + 2) / 2
        }
    },
]

// MARK: - KaleidoscopeEngine

final class KaleidoscopeEngine {

    // ── Public params ──────────────────────────────────────────────────────────
    var segments: Int    = 8
    var style: String    = "mandala"

    var hue: Double          = 280
    var colorShift: Double   = 20
    var saturation: Double   = 1.0
    var brightness: Double   = 1.0

    var rotationSpeed: Double = 0.5
    var complexity: Double    = 1.0
    var scale: Double         = 0.88

    var lineWidth: Double     = 1.0
    var glowAmount: Double    = 1.0
    var colorSpread: Double   = 1.0

    var inhaleEase: String    = "easeInOutSine"
    var exhaleEase: String    = "easeInOutSine"
    var holdSpeed: Double     = 0.75

    var bgUIColor: UIColor    = UIColor(red: 0.016, green: 0.008, blue: 0.039, alpha: 1) // #04020a
    var vignetteStrength: Double = 0.75
    var showCenterGlow: Bool  = true

    // ── Internal state ────────────────────────────────────────────────────────
    private var time: Double      = 0
    private var rotation: Double  = 0
    private var hueState: Double  = 0
    var breathScale: Double       = 0
    private var phase: String     = "holdEmpty"
    private var dotTime: Double   = 0

    // ── Canvas geometry (updated each render) ────────────────────────────────
    private var cx: CGFloat       = 0
    private var cy: CGFloat       = 0
    private var maxRadius: CGFloat = 0
    private var srcSize: CGFloat  = 0
    private var srcHalf: CGFloat  = 0

    // ── Source canvas cache (avoids per-frame malloc) ─────────────────────────
    private var srcRenderer: UIGraphicsImageRenderer?
    private var cachedRendererSize: CGFloat = -1

    // MARK: - Public API

    func applyPreset(_ preset: KaleidoscopePreset) {
        hue         = preset.hue
        colorShift  = preset.colorShift
        saturation  = preset.saturation
        brightness  = preset.brightness
        style       = preset.style
        lineWidth   = preset.lineWidth
        glowAmount  = preset.glowAmount
        colorSpread = preset.colorSpread
        bgUIColor   = uiColorFromHex(preset.bgColor)
    }

    func update(phase: String, t: Double, dt: Double) {
        self.phase = phase

        let hs = max(0, min(1, holdSpeed))
        let speedMult: Double
        switch phase {
        case "holdEmpty": speedMult = 0
        case "holdFull":  speedMult = hs
        case "inhale":    speedMult = hs + (1 - hs) * t
        case "exhale":    speedMult = hs + (1 - hs) * (1 - t)
        default:          speedMult = 1.0
        }

        // Per-phase rotation rates (rad/s). holdEmpty is half of holdFull.
        let rotRate: Double
        switch phase {
        case "holdEmpty": rotRate = 0.1375
        case "holdFull":  rotRate = 0.275
        case "inhale":    rotRate = 0.275 + (0.4 - 0.275) * t
        case "exhale":    rotRate = 0.275 + (0.4 - 0.275) * (1 - t)
        default:          rotRate = rotationSpeed
        }
        time     += dt * speedMult
        rotation += dt * rotRate
        hueState += dt * speedMult * colorShift
        dotTime  += dt

        let inEase = EASINGS[inhaleEase] ?? EASINGS["easeInOutSine"]!
        let exEase = EASINGS[exhaleEase] ?? EASINGS["easeInOutSine"]!

        switch phase {
        case "inhale":   breathScale = inEase(t)
        case "holdFull": breathScale = 1.0
        case "exhale":   breathScale = 1.0 - exEase(t)
        default:         breathScale = 0
        }
    }

    func render(in ctx: CGContext, size: CGSize) {
        // Update geometry
        cx = size.width  / 2
        cy = size.height / 2
        maxRadius = min(size.width, size.height) * 0.46
        let s = ceil(maxRadius * 2.0)   // 2.0× instead of 2.5× — saves 36% source-canvas area
        srcSize = s
        srcHalf = s / 2

        let R = maxRadius * CGFloat(scale) * CGFloat(max(0, breathScale))

        // Fill background
        ctx.setFillColor(bgUIColor.cgColor)
        ctx.fill(CGRect(origin: .zero, size: size))

        if R >= 2 {
            let srcImage = drawSource(R: R)
            compose(ctx: ctx, sourceImage: srcImage, R: R)
            if vignetteStrength > 0 { drawVignette(ctx: ctx, R: R) }
            if showCenterGlow       { drawCenterGlow(ctx: ctx, R: R) }
        }

        drawFocusDot(ctx: ctx)
    }

    // MARK: - Source canvas

    /// Returns a renderer that caches its backing CGContext across frames.
    /// Using scale=1 reduces the bitmap to 1× pixel density — the source is
    /// tiled and rotated, so extra sharpness buys nothing and costs 9× memory.
    private func cachedRenderer(size: CGFloat) -> UIGraphicsImageRenderer {
        if size == cachedRendererSize, let r = srcRenderer { return r }
        let fmt = UIGraphicsImageRendererFormat.default()
        fmt.scale   = 1          // 1× — avoids 7 MB/frame at 3× device scale
        fmt.opaque  = false
        fmt.preferredRange = .standard
        let r = UIGraphicsImageRenderer(size: CGSize(width: size, height: size), format: fmt)
        srcRenderer        = r
        cachedRendererSize = size
        return r
    }

    private func drawSource(R: CGFloat) -> UIImage {
        let renderer = cachedRenderer(size: srcSize)
        return renderer.image { rCtx in
            let ctx = rCtx.cgContext
            ctx.saveGState()
            ctx.translateBy(x: srcHalf, y: srcHalf)

            let t = time
            switch style {
            case "mandala":   drawMandala(ctx: ctx, R: R, t: t)
            case "neon":      drawNeon(ctx: ctx, R: R, t: t)
            case "lotus":     drawLotus(ctx: ctx, R: R, t: t)
            case "sacred":    drawSacred(ctx: ctx, R: R, t: t)
            case "prism":     drawPrism(ctx: ctx, R: R, t: t)
            case "spiral":    drawSpiral(ctx: ctx, R: R, t: t)
            case "web":       drawWeb(ctx: ctx, R: R, t: t)
            case "crystal":   drawCrystal(ctx: ctx, R: R, t: t)
            case "ribbons":   drawRibbons(ctx: ctx, R: R, t: t)
            case "starburst": drawStarburst(ctx: ctx, R: R, t: t)
            case "lace":      drawLace(ctx: ctx, R: R, t: t)
            case "vortex":    drawVortex(ctx: ctx, R: R, t: t)
            case "geo":       drawGeo(ctx: ctx, R: R, t: t)
            default:          drawMandala(ctx: ctx, R: R, t: t)
            }

            ctx.restoreGState()
        }
    }

    // MARK: - Compose (N-fold mirror)

    private func compose(ctx: CGContext, sourceImage: UIImage, R: CGFloat) {
        let N     = max(2, segments)
        let wedge = CGFloat(TAU) / CGFloat(N)

        ctx.saveGState()
        ctx.translateBy(x: cx, y: cy)

        // Clip to circle
        ctx.addEllipse(in: CGRect(x: -R, y: -R, width: R * 2, height: R * 2))
        ctx.clip()

        for i in 0..<N {
            ctx.saveGState()
            ctx.rotate(by: CGFloat(i) * wedge + CGFloat(rotation))

            if i % 2 == 1 {
                ctx.rotate(by: wedge)
                ctx.scaleBy(x: 1, y: -1)
            }

            // Wedge clip
            let wPath = CGMutablePath()
            wPath.move(to: .zero)
            wPath.addArc(center: .zero, radius: R + 2, startAngle: 0, endAngle: wedge, clockwise: false)
            wPath.closeSubpath()
            ctx.addPath(wPath)
            ctx.clip()

            sourceImage.draw(in: CGRect(x: -srcHalf, y: -srcHalf, width: srcSize, height: srcSize))

            ctx.restoreGState()
        }

        ctx.restoreGState()
    }

    // MARK: - Vignette

    private func drawVignette(ctx: CGContext, R: CGFloat) {
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        let colors = [UIColor.clear.cgColor, UIColor(white: 0, alpha: CGFloat(vignetteStrength)).cgColor] as CFArray
        let locs: [CGFloat] = [0, 1]
        guard let grad = CGGradient(colorsSpace: colorSpace, colors: colors, locations: locs) else { return }

        ctx.saveGState()
        ctx.addEllipse(in: CGRect(x: cx - R, y: cy - R, width: R * 2, height: R * 2))
        ctx.clip()
        ctx.drawRadialGradient(
            grad,
            startCenter: CGPoint(x: cx, y: cy), startRadius: R * 0.50,
            endCenter:   CGPoint(x: cx, y: cy), endRadius:   R,
            options: [.drawsAfterEndLocation]
        )
        ctx.restoreGState()
    }

    // MARK: - Center glow

    private func drawCenterGlow(ctx: CGContext, R: CGFloat) {
        let r    = R * 0.10
        let hVal = hOff(60)
        let c1   = hsl(hVal, 80, 98, 0.9).cgColor
        let c2   = hsl(hVal, 90, 85, 0.4).cgColor
        let c3   = UIColor.clear.cgColor
        let colors = [c1, c2, c3] as CFArray
        let locs: [CGFloat] = [0, 0.35, 1.0]
        let colorSpace = CGColorSpaceCreateDeviceRGB()
        guard let grad = CGGradient(colorsSpace: colorSpace, colors: colors, locations: locs) else { return }

        ctx.saveGState()
        ctx.addEllipse(in: CGRect(x: cx - r, y: cy - r, width: r * 2, height: r * 2))
        ctx.clip()
        ctx.drawRadialGradient(
            grad,
            startCenter: CGPoint(x: cx, y: cy), startRadius: 0,
            endCenter:   CGPoint(x: cx, y: cy), endRadius:   r,
            options: [.drawsAfterEndLocation]
        )
        ctx.restoreGState()
    }

    // MARK: - Focus dot (holdEmpty pulse)

    private func drawFocusDot(ctx: CGContext) {
        let dotOpacity = max(0.0, min(1.0, 1.0 - (breathScale - 0.12) / 0.18))
        guard dotOpacity > 0 else { return }

        let pulse = 1.0 + 0.35 * sin(dotTime * TAU * 0.7)
        let coreR = CGFloat(3.5 * pulse)
        let glowR = coreR * 5.5
        let hVal  = hOff(60)

        let c1 = hsl(hVal, 70, 98, dotOpacity * 0.55).cgColor
        let c2 = hsl(hVal, 80, 88, dotOpacity * 0.20).cgColor
        let c3 = UIColor.clear.cgColor
        let colors = [c1, c2, c3] as CFArray
        let locs: [CGFloat] = [0, 0.25, 1.0]
        let colorSpace = CGColorSpaceCreateDeviceRGB()

        if let grad = CGGradient(colorsSpace: colorSpace, colors: colors, locations: locs) {
            ctx.saveGState()
            ctx.addEllipse(in: CGRect(x: cx - glowR, y: cy - glowR, width: glowR * 2, height: glowR * 2))
            ctx.clip()
            ctx.drawRadialGradient(
                grad,
                startCenter: CGPoint(x: cx, y: cy), startRadius: 0,
                endCenter:   CGPoint(x: cx, y: cy), endRadius:   glowR,
                options: [.drawsAfterEndLocation]
            )
            ctx.restoreGState()
        }

        // Crisp core
        UIColor(red: 1, green: 248/255, blue: 1, alpha: CGFloat(dotOpacity)).setFill()
        ctx.addEllipse(in: CGRect(x: cx - coreR, y: cy - coreR, width: coreR * 2, height: coreR * 2))
        ctx.fillPath()
    }

    // MARK: - Color helpers

    private func hOff(_ off: Double) -> Double {
        return ((hueState + hue + off).truncatingRemainder(dividingBy: 360) + 360).truncatingRemainder(dividingBy: 360)
    }

    // Convert CSS HSL (h:0-360, s:0-100, l:0-100, a:0-1) to UIColor
    private func hsl(_ h: Double, _ s_pct: Double, _ l_pct: Double, _ a: Double) -> UIColor {
        let hNorm = ((h.truncatingRemainder(dividingBy: 360) + 360).truncatingRemainder(dividingBy: 360)) / 360.0
        let sL    = max(0, min(1, s_pct / 100.0))
        let lL    = max(0, min(1, l_pct / 100.0))
        // HSL → HSB
        let b  = lL + sL * min(lL, 1.0 - lL)
        let sB = b == 0 ? 0.0 : 2.0 * (1.0 - lL / b)
        return UIColor(hue: CGFloat(hNorm), saturation: CGFloat(sB), brightness: CGFloat(b), alpha: CGFloat(a))
    }

    // MARK: - Neon stroke (4-pass additive glow)

    private func neonStroke(_ ctx: CGContext, hOff hueOff: Double, coreW: Double, path pathFn: (CGContext) -> Void) {
        let lw  = coreW * lineWidth
        let ga  = max(0.0, glowAmount)
        let hC  = hOff(hueOff)
        let hG  = hOff(hueOff - 55)
        let s   = max(0, min(100, 92.0 * saturation))
        let l   = max(0, min(100, 70.0 * brightness))
        let lHi = max(0, min(100, 94.0 * brightness))

        ctx.setLineCap(.round)
        ctx.setBlendMode(.plusLighter)

        // Pass 1 — mid glow
        hsl(hG, s, l + 8, 0.20 * ga).setStroke()
        ctx.setLineWidth(CGFloat(lw * 3.6 * max(0.3, sqrt(ga))))
        pathFn(ctx); ctx.strokePath()

        // Pass 2 — inner bright
        hsl(hC, s, lHi, min(0.50 * ga, 0.85)).setStroke()
        ctx.setLineWidth(CGFloat(lw * 1.6))
        pathFn(ctx); ctx.strokePath()

        // Pass 3 — crisp core
        hsl(hC, s, lHi, 0.94).setStroke()
        ctx.setLineWidth(CGFloat(lw))
        pathFn(ctx); ctx.strokePath()

        ctx.setBlendMode(.normal)
    }

    // MARK: - Flower path

    private func flowerPath(_ ctx: CGContext, r0: Double, A: Double, n: Int, phase: Double, steps: Int = 100) {
        ctx.beginPath()
        for i in 0...steps {
            let theta = Double(i) / Double(steps) * TAU
            let r     = r0 - A * cos(Double(n) * theta + phase)
            let x     = CGFloat(r * cos(theta))
            let y     = CGFloat(r * sin(theta))
            if i == 0 { ctx.move(to: CGPoint(x: x, y: y)) }
            else       { ctx.addLine(to: CGPoint(x: x, y: y)) }
        }
        ctx.closePath()
    }

    // MARK: - MANDALA style

    private func drawMandala(ctx: CGContext, R: CGFloat, t: Double) {
        ctx.setBlendMode(.plusLighter)

        let N    = max(2, segments)
        let w    = TAU / Double(N)
        let cmpl = complexity
        let cs   = colorSpread

        struct RingDef { let r, A: Double; let n: Int; let dH, cW: Double }
        let rings: [RingDef] = [
            RingDef(r: 0.115, A: 0.022, n: N,     dH:   0 * cs, cW: 1.4),
            RingDef(r: 0.240, A: 0.055, n: N,     dH:  40 * cs, cW: 2.2),
            RingDef(r: 0.380, A: 0.080, n: N,     dH: -30 * cs, cW: 2.8),
            RingDef(r: 0.530, A: 0.085, n: N,     dH:  65 * cs, cW: 2.8),
            RingDef(r: 0.670, A: 0.075, n: N,     dH: -55 * cs, cW: 2.4),
            RingDef(r: 0.800, A: 0.060, n: N,     dH: 100 * cs, cW: 2.0),
            RingDef(r: 0.905, A: 0.035, n: N * 2, dH: 145 * cs, cW: 1.4),
        ]
        for ring in rings {
            let r0    = Double(R) * ring.r
            let A     = Double(R) * ring.A * (0.7 + 0.3 * cmpl)
            let phase = t * 0.07 * Double(ring.n)
            neonStroke(ctx, hOff: ring.dH, coreW: ring.cW) { c in
                self.flowerPath(c, r0: r0, A: A, n: ring.n, phase: phase)
            }
        }

        // Radial spines
        for i in 0..<N {
            let a  = (Double(i) + 0.5) * w
            let dH = Double(i) * (360.0 / Double(N))
            let fx = Double(R) * 0.10 * cos(a); let fy = Double(R) * 0.10 * sin(a)
            let tx = Double(R) * 0.94 * cos(a); let ty = Double(R) * 0.94 * sin(a)
            neonStroke(ctx, hOff: dH + 20, coreW: 1.0) { c in
                c.beginPath()
                c.move(to: CGPoint(x: CGFloat(fx), y: CGFloat(fy)))
                c.addLine(to: CGPoint(x: CGFloat(tx), y: CGFloat(ty)))
            }
        }

        // Inner star
        let innerN  = N * 2
        let phase5  = t * 1.5
        neonStroke(ctx, hOff: 180, coreW: 1.0) { c in
            self.flowerPath(c, r0: Double(R) * 0.115, A: Double(R) * 0.028, n: innerN, phase: phase5, steps: 80)
        }

        ctx.setBlendMode(.normal)
    }

    // MARK: - NEON style

    private func drawNeon(ctx: CGContext, R: CGFloat, t: Double) {
        ctx.setBlendMode(.plusLighter)

        let N    = max(2, segments)
        let cmpl = complexity

        struct RingDef { let r, A: Double; let n: Int; let dH, cW: Double }
        let rings: [RingDef] = [
            RingDef(r: 0.15, A: 0.030, n: N,     dH:   0, cW: 4.0),
            RingDef(r: 0.32, A: 0.075, n: N,     dH:  60, cW: 5.0),
            RingDef(r: 0.54, A: 0.100, n: N,     dH: -40, cW: 5.5),
            RingDef(r: 0.76, A: 0.085, n: N,     dH: 120, cW: 4.5),
            RingDef(r: 0.93, A: 0.045, n: N * 2, dH: 200, cW: 3.0),
        ]
        for ring in rings {
            let r0    = Double(R) * ring.r
            let A     = Double(R) * ring.A * (0.6 + 0.4 * cmpl)
            let phase = t * 0.06 * Double(ring.n)
            neonStroke(ctx, hOff: ring.dH, coreW: ring.cW) { c in
                self.flowerPath(c, r0: r0, A: A, n: ring.n, phase: phase)
            }
        }

        let spokes = Int(Double(N) * (1 + cmpl * 0.5).rounded())
        for i in 0..<spokes {
            let a  = (Double(i) / Double(spokes)) * TAU + t * 0.04
            let dH = Double(i) * (360.0 / Double(spokes))
            neonStroke(ctx, hOff: dH, coreW: 0.8) { c in
                c.beginPath()
                c.move(to: .zero)
                c.addLine(to: CGPoint(x: CGFloat(Double(R) * cos(a)), y: CGFloat(Double(R) * sin(a))))
            }
        }

        ctx.setBlendMode(.normal)
    }

    // MARK: - LOTUS style

    private func drawLotus(ctx: CGContext, R: CGFloat, t: Double) {
        ctx.setBlendMode(.plusLighter)

        let N  = max(2, segments)
        let RD = Double(R)

        for i in 0..<N {
            let base  = (Double(i) + 0.5) * (TAU / Double(N)) + t * 0.18
            let pR    = RD * (0.22 + 0.45 * abs(sin(t * 0.38 + Double(i) * 1.27)))
            let width = pR * 0.38
            let perp  = base + Double.pi / 2

            let tipX = pR * cos(base), tipY = pR * sin(base)
            let c1x = width * cos(perp) + tipX * 0.15, c1y = width * sin(perp) + tipY * 0.15
            let c2x = tipX * 0.85 + width * 0.4 * cos(perp), c2y = tipY * 0.85 + width * 0.4 * sin(perp)
            let c3x = tipX * 0.85 - width * 0.4 * cos(perp), c3y = tipY * 0.85 - width * 0.4 * sin(perp)
            let c4x = -width * cos(perp) + tipX * 0.15, c4y = -width * sin(perp) + tipY * 0.15
            let hOff = Double(i) * (360.0 / Double(N))

            neonStroke(ctx, hOff: hOff, coreW: 1.5) { c in
                c.beginPath()
                c.move(to: .zero)
                c.addCurve(to: CGPoint(x: CGFloat(tipX), y: CGFloat(tipY)),
                           control1: CGPoint(x: CGFloat(c1x), y: CGFloat(c1y)),
                           control2: CGPoint(x: CGFloat(c2x), y: CGFloat(c2y)))
                c.addCurve(to: .zero,
                           control1: CGPoint(x: CGFloat(c3x), y: CGFloat(c3y)),
                           control2: CGPoint(x: CGFloat(c4x), y: CGFloat(c4y)))
            }
        }

        struct RDef { let r, A, dH, cW: Double; let n: Int }
        let ringList: [RDef] = [
            RDef(r: 0.20, A: 0.04, dH:  30, cW: 1.2, n: N),
            RDef(r: 0.50, A: 0.07, dH: -20, cW: 1.8, n: N),
            RDef(r: 0.80, A: 0.06, dH:  70, cW: 1.5, n: N),
        ]
        for ring in ringList {
            let r0    = Double(R) * ring.r
            let A     = Double(R) * ring.A
            let phase = t * 0.08 * Double(ring.n)
            neonStroke(ctx, hOff: ring.dH, coreW: ring.cW) { c in
                self.flowerPath(c, r0: r0, A: A, n: ring.n, phase: phase)
            }
        }

        ctx.setBlendMode(.normal)
    }

    // MARK: - SACRED style

    private func drawSacred(ctx: CGContext, R: CGFloat, t: Double) {
        ctx.setBlendMode(.plusLighter)

        let cmpl  = complexity
        let rings = Int((2 + 3 * cmpl).rounded(.down))

        for ring in 0...rings {
            let rR   = ring == 0 ? Double(R) * 0.12 : Double(R) * (0.13 + (Double(ring) / Double(rings)) * 0.79)
            let pts  = ring == 0 ? 1 : 6 * ring
            let dir  = ring % 2 == 0 ? 1.0 : -1.0
            let spin = t * 0.06 * dir / Double(ring + 1)

            for j in 0..<pts {
                let a  = (Double(j) / Double(pts)) * TAU + spin
                let ox = rR * cos(a), oy = rR * sin(a)
                let cr = rR * (ring == 0 ? 1.0 : 0.46)
                neonStroke(ctx, hOff: Double(ring) * 50, coreW: 0.9) { c in
                    c.beginPath()
                    c.addArc(center: CGPoint(x: CGFloat(ox), y: CGFloat(oy)),
                             radius: CGFloat(cr), startAngle: 0, endAngle: CGFloat(TAU), clockwise: false)
                }
            }

            if ring > 0 && pts <= 30 {
                neonStroke(ctx, hOff: Double(ring) * 50 + 25, coreW: 0.6) { c in
                    c.beginPath()
                    for j in 0..<pts {
                        let a = (Double(j) / Double(pts)) * TAU + spin
                        let x = CGFloat(rR * cos(a)), y = CGFloat(rR * sin(a))
                        if j == 0 { c.move(to: CGPoint(x: x, y: y)) }
                        else       { c.addLine(to: CGPoint(x: x, y: y)) }
                    }
                    c.closePath()
                }
            }
        }

        ctx.setBlendMode(.normal)
    }

    // MARK: - PRISM style

    private func drawPrism(ctx: CGContext, R: CGFloat, t: Double) {
        ctx.setBlendMode(.plusLighter)

        let N    = max(2, segments)
        let cmpl = complexity
        let numF = Int((5 + 13 * cmpl).rounded(.down))

        for i in 0..<numF {
            let fi = Double(i) / Double(numF)
            let a1 = fi * TAU + t * 0.10
            let a2 = (fi + 1.0 / Double(numF)) * TAU + t * 0.10
            let am = (a1 + a2) / 2

            let r1 = Double(R) * (0.16 + 0.15 * sin(t * 0.36 + Double(i) * 1.14))
            let r2 = Double(R) * (0.56 + 0.30 * cos(t * 0.25 + Double(i) * 1.57))

            neonStroke(ctx, hOff: Double(i) * (360.0 / Double(numF)), coreW: 1.2) { c in
                c.beginPath()
                c.move(to: .zero)
                c.addLine(to: CGPoint(x: CGFloat(r1 * cos(a1)), y: CGFloat(r1 * sin(a1))))
                c.addLine(to: CGPoint(x: CGFloat(r2 * cos(am)), y: CGFloat(r2 * sin(am))))
                c.addLine(to: CGPoint(x: CGFloat(r1 * cos(a2)), y: CGFloat(r1 * sin(a2))))
                c.closePath()
            }
        }

        let spokes = Int((Double(numF) * 2.5).rounded(.down))
        for i in 0..<spokes {
            let a = (Double(i) / Double(spokes)) * TAU + t * 0.05
            let r = Double(R) * (0.2 + 0.65 * Double(i % 3) / 2)
            neonStroke(ctx, hOff: Double(i) * 12, coreW: 0.4) { c in
                c.beginPath()
                c.move(to: .zero)
                c.addLine(to: CGPoint(x: CGFloat(r * cos(a)), y: CGFloat(r * sin(a))))
            }
        }

        let _ = N  // suppress unused warning
        ctx.setBlendMode(.normal)
    }

    // MARK: - SPIRAL style

    private func drawSpiral(ctx: CGContext, R: CGFloat, t: Double) {
        ctx.setBlendMode(.plusLighter)

        let N          = max(2, segments)
        let cmpl       = complexity
        let cs         = colorSpread
        let numFamilies = max(1, Int((1 + cmpl).rounded()))

        func drawArm(startRFrac: Double, b: Double, angleOffset: Double, hOff: Double, cW: Double) {
            let steps = 150
            neonStroke(ctx, hOff: hOff, coreW: cW) { c in
                c.beginPath()
                var first = true
                for i in 0...steps {
                    let theta = (Double(i) / Double(steps)) * TAU * (2 + cmpl)
                    let r     = Double(R) * startRFrac * exp(b * theta / TAU)
                    if r > Double(R) * 1.02 { break }
                    let x = r * cos(theta + angleOffset + t * 0.06)
                    let y = r * sin(theta + angleOffset + t * 0.06)
                    if first { c.move(to: CGPoint(x: CGFloat(x), y: CGFloat(y))); first = false }
                    else      { c.addLine(to: CGPoint(x: CGFloat(x), y: CGFloat(y))) }
                }
            }
        }

        for f in 0..<numFamilies {
            let offset = (Double(f) / Double(numFamilies)) * TAU
            let b      = 0.22 + 0.06 * Double(f)
            drawArm(startRFrac: 0.025, b: b, angleOffset: offset,           hOff: Double(f) * 90 * cs,        cW: 2.2)
            drawArm(startRFrac: 0.025, b: b, angleOffset: offset + Double.pi, hOff: Double(f) * 90 * cs + 50 * cs, cW: 1.8)
        }

        neonStroke(ctx, hOff: 120 * cs, coreW: 1.4) { c in
            self.flowerPath(c, r0: Double(R) * 0.22, A: Double(R) * 0.040, n: N, phase: t * 0.08 * Double(N))
        }
        neonStroke(ctx, hOff: -60 * cs, coreW: 1.8) { c in
            self.flowerPath(c, r0: Double(R) * 0.62, A: Double(R) * 0.075, n: N, phase: t * 0.06 * Double(N))
        }

        ctx.setBlendMode(.normal)
    }

    // MARK: - WEB style

    private func drawWeb(ctx: CGContext, R: CGFloat, t: Double) {
        ctx.setBlendMode(.plusLighter)

        let N        = max(2, segments)
        let cmpl     = complexity
        let cs       = colorSpread
        let numSpokes = N * max(1, Int((1 + cmpl).rounded()))

        for i in 0..<numSpokes {
            let a  = (Double(i) / Double(numSpokes)) * TAU + t * 0.015
            let dH = Double(i) * (360.0 / Double(numSpokes)) * cs * 0.5
            neonStroke(ctx, hOff: dH, coreW: 0.7) { c in
                c.beginPath()
                c.move(to:    CGPoint(x: CGFloat(Double(R) * 0.04 * cos(a)), y: CGFloat(Double(R) * 0.04 * sin(a))))
                c.addLine(to: CGPoint(x: CGFloat(Double(R) * 0.97 * cos(a)), y: CGFloat(Double(R) * 0.97 * sin(a))))
            }
        }

        let numRings = Int((5 + 4 * cmpl).rounded(.down))
        for ring in 1...numRings {
            let rFrac = Double(ring) / Double(numRings)
            let r0    = Double(R) * rFrac * 0.95
            let A     = Double(R) * 0.010 * sin(t * 0.12 + Double(ring) * 0.8)
            let dH    = Double(ring) * (360.0 / Double(numRings)) * cs * 0.6
            neonStroke(ctx, hOff: dH, coreW: 0.9 - rFrac * 0.3) { c in
                self.flowerPath(c, r0: r0, A: A, n: numSpokes, phase: t * 0.02 * Double(ring))
            }
        }

        ctx.setBlendMode(.normal)
    }

    // MARK: - CRYSTAL style

    private func drawCrystal(ctx: CGContext, R: CGFloat, t: Double) {
        ctx.setBlendMode(.plusLighter)

        let N         = max(2, segments)
        let cmpl      = complexity
        let cs        = colorSpread
        let numLayers = Int((5 + 5 * cmpl).rounded(.down))

        for layer in 0..<numLayers {
            let rFrac  = Double(layer + 1) / Double(numLayers)
            let r      = Double(R) * rFrac * 0.97
            let sides  = 4 + (layer % 3) * 2
            let dir    = layer % 2 == 0 ? 1.0 : -1.0
            let rotOff = Double(layer) * (Double.pi / Double(sides)) + t * 0.03 * dir
            let dH     = Double(layer) * (280.0 / Double(numLayers)) * cs

            neonStroke(ctx, hOff: dH, coreW: rFrac < 0.35 ? 1.8 : 1.2) { c in
                c.beginPath()
                for j in 0...sides {
                    let a = (Double(j) / Double(sides)) * TAU + rotOff
                    let x = CGFloat(r * cos(a)), y = CGFloat(r * sin(a))
                    if j == 0 { c.move(to: CGPoint(x: x, y: y)) }
                    else       { c.addLine(to: CGPoint(x: x, y: y)) }
                }
                c.closePath()
            }

            if layer > 0 && layer < numLayers - 1 {
                let rIn   = r * 0.78
                let rotIn = rotOff + Double.pi / Double(sides)
                neonStroke(ctx, hOff: dH + 35 * cs, coreW: 0.7) { c in
                    c.beginPath()
                    for j in 0...sides {
                        let a = (Double(j) / Double(sides)) * TAU + rotIn
                        let x = CGFloat(rIn * cos(a)), y = CGFloat(rIn * sin(a))
                        if j == 0 { c.move(to: CGPoint(x: x, y: y)) }
                        else       { c.addLine(to: CGPoint(x: x, y: y)) }
                    }
                    c.closePath()
                }
            }
        }

        for j in 0..<4 {
            let a  = (Double(j) / 4.0) * TAU + t * 0.03
            neonStroke(ctx, hOff: Double(j) * 90 * cs, coreW: 1.0) { c in
                c.beginPath()
                c.move(to: .zero)
                c.addLine(to: CGPoint(x: CGFloat(Double(R) * 0.96 * cos(a)), y: CGFloat(Double(R) * 0.96 * sin(a))))
            }
        }

        let _ = N
        ctx.setBlendMode(.normal)
    }

    // MARK: - RIBBONS style

    private func drawRibbons(ctx: CGContext, R: CGFloat, t: Double) {
        ctx.setBlendMode(.plusLighter)

        let N    = max(2, segments)
        let cmpl = complexity
        let cs   = colorSpread
        let numR = Int((4 + 5 * cmpl).rounded(.down))
        let RD   = Double(R)

        for i in 0..<numR {
            let fi    = Double(i) / Double(numR)
            let a0    = fi * TAU + t * 0.04
            let sweep = Double.pi * (0.45 + 0.30 * cmpl)
            let aEnd  = a0 + sweep
            let rCtrl = RD * (0.38 + 0.32 * sin(t * 0.28 + Double(i) * 1.3))
            let aCtrl = a0 + sweep * 0.5 + 0.6 * sin(t * 0.18 + Double(i) * 0.9)
            let dH    = Double(i) * (360.0 / Double(numR)) * cs * 0.6

            let x0  = RD * 0.06 * cos(a0),   y0  = RD * 0.06 * sin(a0)
            let cpx = rCtrl * cos(aCtrl),     cpy = rCtrl * sin(aCtrl)
            let x1  = RD * 0.96 * cos(aEnd), y1  = RD * 0.96 * sin(aEnd)

            neonStroke(ctx, hOff: dH, coreW: 2.0 + cmpl * 0.5) { c in
                c.beginPath()
                c.move(to: CGPoint(x: CGFloat(x0), y: CGFloat(y0)))
                c.addQuadCurve(to: CGPoint(x: CGFloat(x1), y: CGFloat(y1)),
                               control: CGPoint(x: CGFloat(cpx), y: CGFloat(cpy)))
            }
            neonStroke(ctx, hOff: dH + 25 * cs, coreW: 0.6) { c in
                let ex0  = RD * 0.04 * cos(a0 + 0.12), ey0 = RD * 0.04 * sin(a0 + 0.12)
                let ex1  = RD * 0.88 * cos(aEnd - 0.14), ey1 = RD * 0.88 * sin(aEnd - 0.14)
                c.beginPath()
                c.move(to: CGPoint(x: CGFloat(ex0), y: CGFloat(ey0)))
                c.addQuadCurve(to: CGPoint(x: CGFloat(ex1), y: CGFloat(ey1)),
                               control: CGPoint(x: CGFloat(cpx * 0.9), y: CGFloat(cpy * 0.9)))
            }
        }

        neonStroke(ctx, hOff: 0, coreW: 1.2) { c in
            self.flowerPath(c, r0: Double(R) * 0.14, A: Double(R) * 0.025, n: N, phase: t * 0.1 * Double(N))
        }

        ctx.setBlendMode(.normal)
    }

    // MARK: - STARBURST style

    private func drawStarburst(ctx: CGContext, R: CGFloat, t: Double) {
        ctx.setBlendMode(.plusLighter)

        let N    = max(2, segments)
        let cmpl = complexity
        let cs   = colorSpread

        struct LayerDef { let r, A: Double; let n: Int; let dH, cW: Double }
        let layers: [LayerDef] = [
            LayerDef(r: 0.14, A: 0.125, n: N * 2, dH:   0,       cW: 1.8),
            LayerDef(r: 0.30, A: 0.265, n: N * 2, dH:  45 * cs,  cW: 2.5),
            LayerDef(r: 0.50, A: 0.440, n: N * 2, dH: -40 * cs,  cW: 3.0),
            LayerDef(r: 0.70, A: 0.615, n: N * 2, dH:  85 * cs,  cW: 2.8),
            LayerDef(r: 0.88, A: 0.760, n: N * 3, dH: 140 * cs,  cW: 2.2),
        ]
        for layer in layers {
            let r0    = Double(R) * layer.r
            let A     = Double(R) * layer.A * (0.65 + 0.35 * cmpl)
            let phase = t * 0.09 * Double(layer.n)
            neonStroke(ctx, hOff: layer.dH, coreW: layer.cW) { c in
                self.flowerPath(c, r0: r0, A: A, n: layer.n, phase: phase)
            }
        }

        neonStroke(ctx, hOff: 220 * cs, coreW: 1.2) { c in
            self.flowerPath(c, r0: Double(R) * 0.10, A: Double(R) * 0.088, n: N * 4, phase: t * 2.0, steps: 80)
        }

        let spines = N * 2
        for i in 0..<spines {
            let a  = (Double(i) / Double(spines)) * TAU + t * 0.04
            let dH = Double(i) * (360.0 / Double(spines)) * cs * 0.4
            neonStroke(ctx, hOff: dH, coreW: 0.6) { c in
                c.beginPath()
                c.move(to: .zero)
                c.addLine(to: CGPoint(x: CGFloat(Double(R) * 0.88 * cos(a)), y: CGFloat(Double(R) * 0.88 * sin(a))))
            }
        }

        ctx.setBlendMode(.normal)
    }

    // MARK: - LACE style

    private func drawLace(ctx: CGContext, R: CGFloat, t: Double) {
        ctx.setBlendMode(.plusLighter)

        let N    = max(2, segments)
        let cmpl = complexity
        let cs   = colorSpread

        struct RingDef { let rBase, circR, dH, spin: Double; let count: Int }
        let ringDefs: [RingDef] = [
            RingDef(rBase: 0.14, circR: 0.025, dH:   0,      spin:  0.04, count: max(1, N / 2)),
            RingDef(rBase: 0.28, circR: 0.038, dH:  40 * cs, spin: -0.03, count: max(1, N / 2)),
            RingDef(rBase: 0.43, circR: 0.046, dH: -30 * cs, spin:  0.05, count: N),
            RingDef(rBase: 0.58, circR: 0.042, dH:  70 * cs, spin: -0.04, count: N),
            RingDef(rBase: 0.72, circR: 0.036, dH: -60 * cs, spin:  0.03, count: N),
            RingDef(rBase: 0.86, circR: 0.026, dH: 110 * cs, spin: -0.02, count: N * 2),
        ]

        for rd in ringDefs {
            let baseR = Double(R) * rd.rBase
            let circR = Double(R) * rd.circR * (0.7 + 0.3 * cmpl)
            let spin  = t * rd.spin
            for i in 0..<rd.count {
                let a  = (Double(i) / Double(rd.count)) * TAU + spin
                let ox = baseR * cos(a), oy = baseR * sin(a)
                neonStroke(ctx, hOff: rd.dH,       coreW: 0.9) { c in
                    c.beginPath()
                    c.addArc(center: CGPoint(x: CGFloat(ox), y: CGFloat(oy)), radius: CGFloat(circR), startAngle: 0, endAngle: CGFloat(TAU), clockwise: false)
                }
                neonStroke(ctx, hOff: rd.dH + 20*cs, coreW: 0.5) { c in
                    c.beginPath()
                    c.addArc(center: CGPoint(x: CGFloat(ox), y: CGFloat(oy)), radius: CGFloat(circR * 0.48), startAngle: 0, endAngle: CGFloat(TAU), clockwise: false)
                }
                neonStroke(ctx, hOff: rd.dH + 40*cs, coreW: 0.4) { c in
                    c.beginPath()
                    c.addArc(center: CGPoint(x: CGFloat(ox), y: CGFloat(oy)), radius: CGFloat(circR * 0.12), startAngle: 0, endAngle: CGFloat(TAU), clockwise: false)
                }
            }
        }

        let guideFracs: [Double] = [0.14, 0.28, 0.43, 0.58, 0.72, 0.86]
        for (ri, rFrac) in guideFracs.enumerated() {
            neonStroke(ctx, hOff: Double(ri) * 35 * cs, coreW: 0.25) { c in
                c.beginPath()
                c.addArc(center: .zero, radius: CGFloat(Double(R) * rFrac), startAngle: 0, endAngle: CGFloat(TAU), clockwise: false)
            }
        }

        ctx.setBlendMode(.normal)
    }

    // MARK: - VORTEX style

    private func drawVortex(ctx: CGContext, R: CGFloat, t: Double) {
        ctx.setBlendMode(.plusLighter)

        let N       = max(2, segments)
        let cmpl    = complexity
        let cs      = colorSpread
        let numArms = Int((Double(N) * (0.5 + 0.5 * cmpl)).rounded())
        let RD      = Double(R)

        for i in 0..<numArms {
            let fi   = Double(i) / Double(numArms)
            let a0   = fi * TAU + t * 0.07
            let curl = Double.pi * (0.60 + 0.40 * cmpl)
            let aEnd = a0 + curl

            let rMid = RD * 0.48
            let aMid = a0 + curl * 0.5 + Double.pi * 0.25
            let cpx  = rMid * cos(aMid), cpy = rMid * sin(aMid)

            let x0 = RD * 0.04 * cos(a0),   y0 = RD * 0.04 * sin(a0)
            let x1 = RD * 0.94 * cos(aEnd), y1 = RD * 0.94 * sin(aEnd)
            let dH = Double(i) * (360.0 / Double(numArms)) * cs * 0.7

            neonStroke(ctx, hOff: dH, coreW: 2.5) { c in
                c.beginPath()
                c.move(to: CGPoint(x: CGFloat(x0), y: CGFloat(y0)))
                c.addQuadCurve(to: CGPoint(x: CGFloat(x1), y: CGFloat(y1)),
                               control: CGPoint(x: CGFloat(cpx), y: CGFloat(cpy)))
            }

            let cpx2 = rMid * 0.7 * cos(aMid - 0.4), cpy2 = rMid * 0.7 * sin(aMid - 0.4)
            neonStroke(ctx, hOff: dH + 40 * cs, coreW: 0.8) { c in
                c.beginPath()
                c.move(to: CGPoint(x: CGFloat(x0), y: CGFloat(y0)))
                c.addQuadCurve(to: CGPoint(x: CGFloat(x1), y: CGFloat(y1)),
                               control: CGPoint(x: CGFloat(cpx2), y: CGFloat(cpy2)))
            }
        }

        neonStroke(ctx, hOff: 0, coreW: 1.4) { c in
            self.flowerPath(c, r0: Double(R) * 0.12, A: Double(R) * 0.030, n: N, phase: t * 0.1 * Double(N))
        }

        ctx.setBlendMode(.normal)
    }

    // MARK: - GEO style

    private func drawGeo(ctx: CGContext, R: CGFloat, t: Double) {
        ctx.setBlendMode(.plusLighter)

        let N    = max(2, segments)
        let cmpl = complexity
        let cs   = colorSpread

        struct ShapeDef { let r: Double; let sides: Int; let speed, dH, cW: Double }
        let shapes: [ShapeDef] = [
            ShapeDef(r: 0.28, sides: 3, speed:  1, dH:   0,       cW: 3.5),
            ShapeDef(r: 0.48, sides: 4, speed: -1, dH:  60 * cs,  cW: 3.0),
            ShapeDef(r: 0.64, sides: 3, speed:  1, dH: -45 * cs,  cW: 2.8),
            ShapeDef(r: 0.78, sides: 6, speed: -1, dH: 100 * cs,  cW: 2.4),
            ShapeDef(r: 0.92, sides: 4, speed:  1, dH: 160 * cs,  cW: 2.0),
        ]

        for sh in shapes {
            let r    = Double(R) * sh.r * (0.8 + 0.2 * cmpl)
            let rotT = t * 0.05 * sh.speed
            neonStroke(ctx, hOff: sh.dH, coreW: sh.cW) { c in
                c.beginPath()
                for j in 0...sh.sides {
                    let a = (Double(j) / Double(sh.sides)) * TAU + rotT
                    let x = CGFloat(r * cos(a)), y = CGFloat(r * sin(a))
                    if j == 0 { c.move(to: CGPoint(x: x, y: y)) }
                    else       { c.addLine(to: CGPoint(x: x, y: y)) }
                }
                c.closePath()
            }
        }

        neonStroke(ctx, hOff: 40 * cs, coreW: 2.2) { c in
            self.flowerPath(c, r0: Double(R) * 0.20, A: Double(R) * 0.065, n: N, phase: t * 0.07 * Double(N))
        }
        neonStroke(ctx, hOff: -50 * cs, coreW: 2.6) { c in
            self.flowerPath(c, r0: Double(R) * 0.55, A: Double(R) * 0.090, n: N, phase: t * 0.05 * Double(N))
        }

        ctx.setBlendMode(.normal)
    }
}

// MARK: - Hex color helper

private func uiColorFromHex(_ hex: String) -> UIColor {
    var s = hex.trimmingCharacters(in: .whitespacesAndNewlines)
    if s.hasPrefix("#") { s = String(s.dropFirst()) }
    guard s.count == 6, let val = UInt64(s, radix: 16) else { return .black }
    let r = CGFloat((val >> 16) & 0xFF) / 255
    let g = CGFloat((val >>  8) & 0xFF) / 255
    let b = CGFloat( val        & 0xFF) / 255
    return UIColor(red: r, green: g, blue: b, alpha: 1)
}
