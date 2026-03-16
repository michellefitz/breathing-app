// KaleidoscopeRenderer — Canvas 2D kaleidoscope driven by the breath cycle.
//
// Composition math (verified):
//   N segments, wedge angle w = 2π/N.
//   Even segment i : source [0,w] → screen [i·w+rot, (i+1)·w+rot]   (forward)
//   Odd  segment i : screen = (i+1)·w + rot − source_angle          (reversed)
//   All adjacent seams are seamlessly continuous.
//
// Glow technique:
//   Source canvas uses globalCompositeOperation = 'lighter' (additive).
//   Each shape drawn 3×: wide+dim (outer glow), medium (inner glow), thin+bright (core).
//   The additive overlap of passes naturally creates the neon bloom effect.

const TAU = Math.PI * 2;

const EASINGS = {
  linear:         t => t,
  easeInCubic:    t => t * t * t,
  easeOutCubic:   t => 1 - Math.pow(1 - t, 3),
  easeInOutCubic: t => t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2,
  easeInOutSine:  t => -(Math.cos(Math.PI * t) - 1) / 2,
  easeInOutQuart: t => t < 0.5 ? 8*t*t*t*t : 1 - Math.pow(-2*t + 2, 4) / 2,
  easeOutElastic: t => {
    if (t === 0) return 0; if (t === 1) return 1;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (TAU / 3)) + 1;
  },
  easeInOutBack: t => {
    const c = 1.70158 * 1.525;
    return t < 0.5
      ? (Math.pow(2 * t, 2) * ((c + 1) * 2 * t - c)) / 2
      : (Math.pow(2 * t - 2, 2) * ((c + 1) * (2 * t - 2) + c) + 2) / 2;
  },
};

class KaleidoscopeRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');

    this.src    = document.createElement('canvas');
    this.srcCtx = this.src.getContext('2d');

    // ── Public params (GUI-controlled) ───────────────────────────────────────
    this.segments        = 8;
    this.style           = 'mandala';   // mandala | neon | lotus | sacred | prism | spiral | web | crystal | ribbons | starburst | lace | vortex | geo

    this.hue             = 280;         // base hue (purple by default)
    this.colorShift      = 20;          // hue drift (deg/s)
    this.saturation      = 1.0;
    this.brightness      = 1.0;

    this.rotationSpeed   = 0.08;
    this.complexity      = 1.0;
    this.scale           = 0.88;

    // Line & glow
    this.lineWidth       = 1.0;   // thickness multiplier for all strokes
    this.glowAmount      = 1.0;   // glow halo width × opacity multiplier
    this.colorSpread     = 1.0;   // how far ring hues diverge from base hue

    this.inhaleEase      = 'easeInOutSine';
    this.exhaleEase      = 'easeInOutSine';
    this.holdSpeed       = 0.15;  // 0–1: fraction of full speed during holds
    this.reverseOnExhale = true;

    this.bgColor          = '#04020a';
    this.vignetteStrength = 0.75;
    this.centerGlow       = true;

    // ── Internal state ───────────────────────────────────────────────────────
    this.time        = 0;
    this.rotation    = 0;
    this._hueState   = 0;
    this.breathScale = 0;
    this.phase       = 'holdEmpty';
    this._dotTime    = 0;   // drives the holdEmpty pulse

    this._resize();
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  resize() { this._resize(); }

  onPhaseChange(phase) { this.phase = phase; }

  update(phase, t, dt) {
    this.phase = phase;

    // Speed multiplier: ramps up through inhale, holds gently, ramps down through exhale.
    // holdSpeed (0–1) sets the fraction of full speed used during hold phases.
    const hs = Math.max(0, Math.min(1, this.holdSpeed));
    let speedMult;
    switch (phase) {
      case 'holdEmpty': speedMult = 0;                        break;
      case 'holdFull':  speedMult = hs;                       break;
      case 'inhale':    speedMult = hs + (1 - hs) * t;        break; // ramp up
      case 'exhale':    speedMult = hs + (1 - hs) * (1 - t); break; // ramp down
      default:          speedMult = 1.0;
    }

    this.time      += dt * speedMult;
    this.rotation  += dt * speedMult * this.rotationSpeed;
    this._hueState += dt * speedMult * this.colorShift;
    this._dotTime  += dt;

    const inEase = EASINGS[this.inhaleEase]  || EASINGS.easeInOutCubic;
    const exEase = EASINGS[this.exhaleEase]  || EASINGS.easeInOutCubic;

    if (phase === 'inhale') {
      this.breathScale = inEase(t);
    } else if (phase === 'holdFull') {
      this.breathScale = 1.0;
    } else if (phase === 'exhale') {
      this.breathScale = 1.0 - exEase(t);
    } else {
      this.breathScale = 0;
    }

    this._render();
  }

  // ── Private rendering ───────────────────────────────────────────────────────

  _resize() {
    this.canvas.width  = window.innerWidth;
    this.canvas.height = window.innerHeight;
    this.cx = this.canvas.width  / 2;
    this.cy = this.canvas.height / 2;
    this.maxRadius = Math.min(this.canvas.width, this.canvas.height) * 0.46;

    const s = Math.ceil(this.maxRadius * 2.5);
    this.src.width  = s;
    this.src.height = s;
    this.srcHalf    = s / 2;
  }

  _render() {
    const { ctx, cx, cy, maxRadius } = this;
    const R = maxRadius * this.scale * Math.max(0, this.breathScale);

    ctx.fillStyle = this.bgColor;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    if (R >= 2) {
      this._drawSource(R);
      this._compose(R);
      if (this.vignetteStrength > 0) this._vignette(R);
      if (this.centerGlow)           this._centerGlow(R);
    }

    // Always drawn — visible when the kaleidoscope is absent or nearly gone
    this._drawFocusDot();
  }

  // Small pulsing white dot shown during holdEmpty (and briefly at the tail
  // of exhale / head of inhale as the kaleidoscope collapses / re-emerges).
  _drawFocusDot() {
    const { ctx, cx, cy } = this;

    // Fade in as breathScale → 0, fade out as breathScale grows.
    // Fully visible below 0.12, fully gone above 0.30.
    const dotOpacity = Math.max(0, Math.min(1, 1 - (this.breathScale - 0.12) / 0.18));
    if (dotOpacity <= 0) return;

    // Gentle pulse: ~0.7 Hz, amplitude ±35% of base size
    const pulse    = 1 + 0.35 * Math.sin(this._dotTime * TAU * 0.7);
    const coreR    = 3.5 * pulse;   // px — stays tiny
    const glowR    = coreR * 5.5;

    // Soft colour-shifting glow
    const h = ((this._hueState + this.hue + 60) % 360 + 360) % 360;

    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, glowR);
    g.addColorStop(0,    `hsla(${h}, 70%, 98%, ${dotOpacity * 0.55})`);
    g.addColorStop(0.25, `hsla(${h}, 80%, 88%, ${dotOpacity * 0.20})`);
    g.addColorStop(1,    'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, glowR, 0, TAU);
    ctx.fill();

    // Crisp bright core dot
    ctx.fillStyle = `rgba(255, 248, 255, ${dotOpacity})`;
    ctx.beginPath();
    ctx.arc(cx, cy, coreR, 0, TAU);
    ctx.fill();
  }

  _drawSource(R) {
    const ctx  = this.srcCtx;
    const half = this.srcHalf;

    ctx.clearRect(0, 0, this.src.width, this.src.height);
    ctx.save();
    ctx.translate(half, half);

    const t = this.time;
    switch (this.style) {
      case 'mandala':   this._mandala  (ctx, R, t); break;
      case 'neon':      this._neon     (ctx, R, t); break;
      case 'lotus':     this._lotus    (ctx, R, t); break;
      case 'sacred':    this._sacred   (ctx, R, t); break;
      case 'prism':     this._prism    (ctx, R, t); break;
      case 'spiral':    this._spiral   (ctx, R, t); break;
      case 'web':       this._web      (ctx, R, t); break;
      case 'crystal':   this._crystal  (ctx, R, t); break;
      case 'ribbons':   this._ribbons  (ctx, R, t); break;
      case 'starburst': this._starburst(ctx, R, t); break;
      case 'lace':      this._lace     (ctx, R, t); break;
      case 'vortex':    this._vortex   (ctx, R, t); break;
      case 'geo':       this._geo      (ctx, R, t); break;
      default:          this._mandala  (ctx, R, t);
    }

    ctx.restore();
  }

  _compose(R) {
    const { ctx, cx, cy, src, srcHalf } = this;
    const N     = Math.max(2, Math.round(this.segments));
    const wedge = TAU / N;

    ctx.save();
    ctx.translate(cx, cy);

    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.clip();

    for (let i = 0; i < N; i++) {
      ctx.save();

      ctx.rotate(i * wedge + this.rotation);

      if (i % 2 === 1) {
        // Mirror: rotate(wedge) + scale(1,-1) reflects source across the bisector.
        // Verified: source angle φ → screen (i+1)*w + rot − φ, seams continuous.
        ctx.rotate(wedge);
        ctx.scale(1, -1);
      }

      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, R + 2, 0, wedge);
      ctx.closePath();
      ctx.clip();

      ctx.drawImage(src, -srcHalf, -srcHalf, src.width, src.height);

      ctx.restore();
    }

    ctx.restore();
  }

  _vignette(R) {
    const { ctx, cx, cy } = this;
    const g = ctx.createRadialGradient(cx, cy, R * 0.50, cx, cy, R);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${this.vignetteStrength})`);
    ctx.save();
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  _centerGlow(R) {
    const { ctx, cx, cy } = this;
    const r = R * 0.10;
    const h = ((this._hueState + this.hue + 60) % 360 + 360) % 360;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0,    `hsla(${h}, 80%, 98%, 0.9)`);
    g.addColorStop(0.35, `hsla(${h}, 90%, 85%, 0.4)`);
    g.addColorStop(1,    'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.fill();
  }

  // ── Colour helper ───────────────────────────────────────────────────────────

  _h(hOff) {
    return ((this._hueState + this.hue + hOff) % 360 + 360) % 360;
  }

  _col(hOff, s, l, a) {
    const ss = Math.max(0, Math.min(100, s * this.saturation));
    const ll = Math.max(0, Math.min(100, l * this.brightness));
    return `hsla(${this._h(hOff) | 0}, ${ss | 0}%, ${ll | 0}%, ${a})`;
  }

  // Draw a path with four-pass neon glow.
  // hOff: hue offset for core; glow uses a chromatically shifted hue so the
  // bloom colour differs from the line colour (e.g. blue glow on pink core).
  _neonStroke(ctx, pathFn, hOff, coreW) {
    const lw = coreW * this.lineWidth;          // scaled core width
    const ga = Math.max(0, this.glowAmount);    // glow multiplier

    // Core hue (the bright line itself)
    const hCore = this._h(hOff);
    // Glow hue — shift by -55° so the halo reads as a different colour
    // (e.g. pink core → violet/blue glow, matching the reference image)
    const hGlow = this._h(hOff - 55);

    const s   = Math.max(0, Math.min(100, 92 * this.saturation));
    const l   = Math.max(0, Math.min(100, 70 * this.brightness));
    const lHi = Math.max(0, Math.min(100, 94 * this.brightness));

    // Pass 1 — outer halo (very wide, dim, glow hue)
    ctx.strokeStyle = `hsla(${hGlow}, ${s}%, ${l}%, ${0.06 * ga})`;
    ctx.lineWidth   = lw * 8 * Math.max(0.3, Math.sqrt(ga));
    pathFn(ctx); ctx.stroke();

    // Pass 2 — mid glow (glow hue, brighter)
    ctx.strokeStyle = `hsla(${hGlow}, ${s}%, ${l + 8}%, ${0.16 * ga})`;
    ctx.lineWidth   = lw * 3.2 * Math.max(0.3, Math.sqrt(ga));
    pathFn(ctx); ctx.stroke();

    // Pass 3 — inner bright (core hue, near-white centre)
    ctx.strokeStyle = `hsla(${hCore}, ${s}%, ${lHi}%, ${Math.min(0.45 * ga, 0.8)})`;
    ctx.lineWidth   = lw * 1.6;
    pathFn(ctx); ctx.stroke();

    // Pass 4 — crisp core line
    ctx.strokeStyle = `hsla(${hCore}, ${s}%, ${lHi}%, 0.94)`;
    ctx.lineWidth   = lw;
    pathFn(ctx); ctx.stroke();
  }

  // Oscillating-radius flower ring.
  // Using r = r0 − A·cos(n·θ): minimum at θ=0 (seam = eye pinch),
  // maximum at θ=π/n (bisector = petal tip). This creates eye shapes at
  // seams and petal bulges at bisectors — matching the reference image.
  _flowerPath(ctx, r0, A, n, phase, steps = 280) {
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const θ = (i / steps) * TAU;
      const r = r0 - A * Math.cos(n * θ + phase);
      i === 0
        ? ctx.moveTo(r * Math.cos(θ), r * Math.sin(θ))
        : ctx.lineTo(r * Math.cos(θ), r * Math.sin(θ));
    }
    ctx.closePath();
  }

  // ── MANDALA — main style, matches the reference ──────────────────────────────
  //
  // Concentric oscillating rings + off-axis detail circles + spines.
  // All drawn with lighter (additive) blending for neon bloom.
  _mandala(ctx, R, t) {
    ctx.globalCompositeOperation = 'lighter';

    const N    = Math.max(2, Math.round(this.segments));
    const w    = TAU / N;
    const cmpl = this.complexity;

    const cs = this.colorSpread; // hue spread multiplier

    // ── Layer 1: Oscillating flower rings ───────────────────────────────────
    // Each ring uses r = r0 − A·cos(N·θ + phase) so petals are at bisectors
    // and eye pinches are at seams.
    // dH values are multiplied by colorSpread so at cs=1 you get the natural
    // range; at cs=2 you span the full rainbow; at cs=0 monochromatic.
    const rings = [
      { r: 0.115, A: 0.022, n: N,     dH:   0 * cs, cW: 1.4 },
      { r: 0.240, A: 0.055, n: N,     dH:  40 * cs, cW: 2.2 },
      { r: 0.380, A: 0.080, n: N,     dH: -30 * cs, cW: 2.8 },
      { r: 0.530, A: 0.085, n: N,     dH:  65 * cs, cW: 2.8 },
      { r: 0.670, A: 0.075, n: N,     dH: -55 * cs, cW: 2.4 },
      { r: 0.800, A: 0.060, n: N,     dH: 100 * cs, cW: 2.0 },
      { r: 0.905, A: 0.035, n: N * 2, dH: 145 * cs, cW: 1.4 },
    ];

    for (const ring of rings) {
      const r0    = R * ring.r;
      const A     = R * ring.A * (0.7 + 0.3 * cmpl);
      const phase = t * 0.07 * ring.n;
      this._neonStroke(
        ctx,
        c => this._flowerPath(c, r0, A, ring.n, phase),
        ring.dH,
        ring.cW
      );
    }

    // ── Layer 2: Secondary rings (slightly offset phase = visual depth) ─────
    if (cmpl > 0.5) {
      const secondaryRings = [
        { r: 0.305, A: 0.038, n: N,     dH:  -15 * cs, cW: 1.2 },
        { r: 0.450, A: 0.050, n: N,     dH:   80 * cs, cW: 1.4 },
        { r: 0.600, A: 0.045, n: N,     dH:  -70 * cs, cW: 1.2 },
        { r: 0.745, A: 0.040, n: N,     dH:  120 * cs, cW: 1.1 },
      ];
      for (const ring of secondaryRings) {
        const r0    = R * ring.r;
        const A     = R * ring.A * cmpl;
        const phase = t * 0.05 * ring.n + Math.PI / ring.n; // phase-shifted
        this._neonStroke(
          ctx,
          c => this._flowerPath(c, r0, A, ring.n, phase),
          ring.dH,
          ring.cW * 0.65
        );
      }
    }

    // ── Layer 3: Off-axis detail circles (nested inside petals) ─────────────
    // Placed at each bisector of each segment, creating the small decorative
    // circles visible inside petal shapes in the reference.
    const detailRings = [
      { rBase: 0.24, rCirc: 0.052, dH:  15 * cs },
      { rBase: 0.38, rCirc: 0.070, dH: -35 * cs },
      { rBase: 0.53, rCirc: 0.082, dH:  55 * cs },
      { rBase: 0.67, rCirc: 0.075, dH: -60 * cs },
    ];

    for (const dr of detailRings) {
      const baseR  = R * dr.rBase;
      const circR  = R * dr.rCirc;
      const spin   = t * 0.04;

      for (let i = 0; i < N; i++) {
        const a  = (i + 0.5) * w + spin; // bisector
        const cx = baseR * Math.cos(a);
        const cy = baseR * Math.sin(a);

        this._neonStroke(
          ctx,
          c => { c.beginPath(); c.arc(cx, cy, circR, 0, TAU); },
          dr.dH,
          1.1
        );
      }
    }

    // ── Layer 4: Radial spines ───────────────────────────────────────────────
    // Drawn at each bisector angle — these become the bright petal spines.
    for (let i = 0; i < N; i++) {
      const a    = (i + 0.5) * w;
      const dH   = i * (360 / N);
      const from = { x: R * 0.10 * Math.cos(a), y: R * 0.10 * Math.sin(a) };
      const to   = { x: R * 0.94 * Math.cos(a), y: R * 0.94 * Math.sin(a) };

      this._neonStroke(
        ctx,
        c => { c.beginPath(); c.moveTo(from.x, from.y); c.lineTo(to.x, to.y); },
        dH + 20,
        1.0
      );
    }

    // ── Layer 5: Inner star ──────────────────────────────────────────────────
    // Dense oscillation at the center (the small star ring visible in the image).
    const innerStarN = N * 2;
    const phase5     = t * 1.5;
    this._neonStroke(
      ctx,
      c => this._flowerPath(c, R * 0.115, R * 0.028, innerStarN, phase5, 180),
      180,
      1.0
    );

    ctx.globalCompositeOperation = 'source-over';
  }

  // ── NEON — bold electric tubes ─────────────────────────────────────────────
  _neon(ctx, R, t) {
    ctx.globalCompositeOperation = 'lighter';

    const N    = Math.max(2, Math.round(this.segments));
    const cmpl = this.complexity;

    // Bold oscillating rings with strong glow, fewer but thicker
    const rings = [
      { r: 0.15, A: 0.030, n: N,     dH: 0,   cW: 4.0 },
      { r: 0.32, A: 0.075, n: N,     dH: 60,  cW: 5.0 },
      { r: 0.54, A: 0.100, n: N,     dH: -40, cW: 5.5 },
      { r: 0.76, A: 0.085, n: N,     dH: 120, cW: 4.5 },
      { r: 0.93, A: 0.045, n: N * 2, dH: 200, cW: 3.0 },
    ];

    for (const ring of rings) {
      const r0    = R * ring.r;
      const A     = R * ring.A * (0.6 + 0.4 * cmpl);
      const phase = t * 0.06 * ring.n;
      this._neonStroke(
        ctx,
        c => this._flowerPath(c, r0, A, ring.n, phase),
        ring.dH,
        ring.cW
      );
    }

    // Radial spines
    const spokes = Math.round(N * (1 + cmpl * 0.5));
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * TAU + t * 0.04;
      this._neonStroke(
        ctx,
        c => { c.beginPath(); c.moveTo(0, 0); c.lineTo(R * Math.cos(a), R * Math.sin(a)); },
        i * (360 / spokes),
        0.8
      );
    }

    ctx.globalCompositeOperation = 'source-over';
  }

  // ── LOTUS — flowing petal forms ─────────────────────────────────────────────
  _lotus(ctx, R, t) {
    ctx.globalCompositeOperation = 'lighter';

    const N = Math.max(2, Math.round(this.segments));

    // Outer petal shapes per segment
    for (let i = 0; i < N; i++) {
      const base  = (i + 0.5) * (TAU / N) + t * 0.18;
      const pR    = R * (0.22 + 0.45 * Math.abs(Math.sin(t * 0.38 + i * 1.27)));
      const width = pR * 0.38;

      const tipX = pR * Math.cos(base);
      const tipY = pR * Math.sin(base);
      const perp = base + Math.PI / 2;

      const c1x = width * Math.cos(perp) + tipX * 0.15;
      const c1y = width * Math.sin(perp) + tipY * 0.15;
      const c2x = tipX * 0.85 + width * 0.4 * Math.cos(perp);
      const c2y = tipY * 0.85 + width * 0.4 * Math.sin(perp);
      const c3x = tipX * 0.85 - width * 0.4 * Math.cos(perp);
      const c3y = tipY * 0.85 - width * 0.4 * Math.sin(perp);
      const c4x = -width * Math.cos(perp) + tipX * 0.15;
      const c4y = -width * Math.sin(perp) + tipY * 0.15;

      const hOff = i * (360 / N);

      this._neonStroke(
        ctx,
        c => {
          c.beginPath();
          c.moveTo(0, 0);
          c.bezierCurveTo(c1x, c1y, c2x, c2y, tipX, tipY);
          c.bezierCurveTo(c3x, c3y, c4x, c4y, 0, 0);
        },
        hOff,
        1.5
      );
    }

    // Oscillating rings for structure
    const ringList = [
      { r: 0.20, A: 0.04, n: N, dH: 30,  cW: 1.2 },
      { r: 0.50, A: 0.07, n: N, dH: -20, cW: 1.8 },
      { r: 0.80, A: 0.06, n: N, dH: 70,  cW: 1.5 },
    ];
    for (const ring of ringList) {
      const r0    = R * ring.r;
      const A     = R * ring.A;
      const phase = t * 0.08 * ring.n;
      this._neonStroke(
        ctx,
        c => this._flowerPath(c, r0, A, ring.n, phase),
        ring.dH,
        ring.cW
      );
    }

    ctx.globalCompositeOperation = 'source-over';
  }

  // ── SACRED — geometric mandala ───────────────────────────────────────────────
  _sacred(ctx, R, t) {
    ctx.globalCompositeOperation = 'lighter';

    const N    = Math.max(2, Math.round(this.segments));
    const cmpl = this.complexity;
    const rings = Math.floor(2 + 3 * cmpl);

    for (let ring = 0; ring <= rings; ring++) {
      const rR   = ring === 0 ? R * 0.12 : R * (0.13 + (ring / rings) * 0.79);
      const pts  = ring === 0 ? 1 : 6 * ring;
      const dir  = ring % 2 === 0 ? 1 : -1;
      const spin = t * 0.06 * dir / (ring + 1);

      for (let j = 0; j < pts; j++) {
        const a  = (j / pts) * TAU + spin;
        const cx = rR * Math.cos(a);
        const cy = rR * Math.sin(a);
        const cr = rR * (ring === 0 ? 1.0 : 0.46);

        this._neonStroke(
          ctx,
          c => { c.beginPath(); c.arc(cx, cy, cr, 0, TAU); },
          ring * 50,
          0.9
        );
      }

      // Connecting polygon
      if (ring > 0 && pts <= 30) {
        this._neonStroke(
          ctx,
          c => {
            c.beginPath();
            for (let j = 0; j < pts; j++) {
              const a = (j / pts) * TAU + spin;
              const x = rR * Math.cos(a);
              const y = rR * Math.sin(a);
              j === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
            }
            c.closePath();
          },
          ring * 50 + 25,
          0.6
        );
      }
    }

    ctx.globalCompositeOperation = 'source-over';
  }

  // ── SPIRAL — logarithmic spiral arms, galaxy / pinwheel ─────────────────────
  _spiral(ctx, R, t) {
    ctx.globalCompositeOperation = 'lighter';
    const N    = Math.max(2, Math.round(this.segments));
    const cmpl = this.complexity;
    const cs   = this.colorSpread;

    const drawArm = (startRFrac, b, angleOffset, hOff, cW) => {
      this._neonStroke(ctx, c => {
        c.beginPath();
        let first = true;
        for (let i = 0; i <= 500; i++) {
          const θ = (i / 500) * TAU * (2 + cmpl);
          const r = R * startRFrac * Math.exp(b * θ / TAU);
          if (r > R * 1.02) break;
          const x = r * Math.cos(θ + angleOffset + t * 0.06);
          const y = r * Math.sin(θ + angleOffset + t * 0.06);
          if (first) { c.moveTo(x, y); first = false; } else c.lineTo(x, y);
        }
      }, hOff, cW);
    };

    const numFamilies = Math.max(1, Math.round(1 + cmpl));
    for (let f = 0; f < numFamilies; f++) {
      const offset = (f / numFamilies) * TAU;
      const b      = 0.22 + 0.06 * f;
      drawArm(0.025, b, offset,              f * 90 * cs,        2.2);
      drawArm(0.025, b, offset + Math.PI,    f * 90 * cs + 50 * cs, 1.8);
    }

    // Anchoring rings
    this._neonStroke(ctx, c => this._flowerPath(c, R * 0.22, R * 0.040, N, t * 0.08 * N),  120 * cs, 1.4);
    this._neonStroke(ctx, c => this._flowerPath(c, R * 0.62, R * 0.075, N, t * 0.06 * N), -60  * cs, 1.8);

    ctx.globalCompositeOperation = 'source-over';
  }

  // ── WEB — spider web / dreamcatcher ─────────────────────────────────────────
  _web(ctx, R, t) {
    ctx.globalCompositeOperation = 'lighter';
    const N    = Math.max(2, Math.round(this.segments));
    const cmpl = this.complexity;
    const cs   = this.colorSpread;

    const numSpokes = N * Math.max(1, Math.round(1 + cmpl));

    // Radial spokes from center to edge
    for (let i = 0; i < numSpokes; i++) {
      const a  = (i / numSpokes) * TAU + t * 0.015;
      const dH = i * (360 / numSpokes) * cs * 0.5;
      this._neonStroke(ctx, c => {
        c.beginPath();
        c.moveTo(R * 0.04 * Math.cos(a), R * 0.04 * Math.sin(a));
        c.lineTo(R * 0.97 * Math.cos(a), R * 0.97 * Math.sin(a));
      }, dH, 0.7);
    }

    // Concentric web rings — slightly oscillating for organic feel
    const numRings = Math.floor(5 + 4 * cmpl);
    for (let ring = 1; ring <= numRings; ring++) {
      const rFrac = ring / numRings;
      const r0    = R * rFrac * 0.95;
      const A     = R * 0.010 * Math.sin(t * 0.12 + ring * 0.8);
      const dH    = ring * (360 / numRings) * cs * 0.6;
      this._neonStroke(
        ctx,
        c => this._flowerPath(c, r0, A, numSpokes, t * 0.02 * ring),
        dH,
        0.9 - rFrac * 0.3
      );
    }

    ctx.globalCompositeOperation = 'source-over';
  }

  // ── CRYSTAL — nested rotated gem facets ─────────────────────────────────────
  _crystal(ctx, R, t) {
    ctx.globalCompositeOperation = 'lighter';
    const N    = Math.max(2, Math.round(this.segments));
    const cmpl = this.complexity;
    const cs   = this.colorSpread;

    const numLayers = Math.floor(5 + 5 * cmpl);
    for (let layer = 0; layer < numLayers; layer++) {
      const rFrac  = (layer + 1) / numLayers;
      const r      = R * rFrac * 0.97;
      const sides  = 4 + (layer % 3) * 2;   // cycles 4 → 6 → 8
      const dir    = layer % 2 === 0 ? 1 : -1;
      const rotOff = layer * (Math.PI / sides) + t * 0.03 * dir;
      const dH     = layer * (280 / numLayers) * cs;

      // Outer polygon
      this._neonStroke(ctx, c => {
        c.beginPath();
        for (let j = 0; j <= sides; j++) {
          const a = (j / sides) * TAU + rotOff;
          j === 0 ? c.moveTo(r * Math.cos(a), r * Math.sin(a))
                  : c.lineTo(r * Math.cos(a), r * Math.sin(a));
        }
        c.closePath();
      }, dH, rFrac < 0.35 ? 1.8 : 1.2);

      // Inner facet polygon (rotated half-step)
      if (layer > 0 && layer < numLayers - 1) {
        const rIn   = r * 0.78;
        const rotIn = rotOff + Math.PI / sides;
        this._neonStroke(ctx, c => {
          c.beginPath();
          for (let j = 0; j <= sides; j++) {
            const a = (j / sides) * TAU + rotIn;
            j === 0 ? c.moveTo(rIn * Math.cos(a), rIn * Math.sin(a))
                    : c.lineTo(rIn * Math.cos(a), rIn * Math.sin(a));
          }
          c.closePath();
        }, dH + 35 * cs, 0.7);
      }
    }

    // Radial spines
    for (let j = 0; j < 4; j++) {
      const a = (j / 4) * TAU + t * 0.03;
      this._neonStroke(ctx, c => {
        c.beginPath();
        c.moveTo(0, 0);
        c.lineTo(R * 0.96 * Math.cos(a), R * 0.96 * Math.sin(a));
      }, j * 90 * cs, 1.0);
    }

    ctx.globalCompositeOperation = 'source-over';
  }

  // ── RIBBONS — flowing bezier ribbon curves ───────────────────────────────────
  _ribbons(ctx, R, t) {
    ctx.globalCompositeOperation = 'lighter';
    const N    = Math.max(2, Math.round(this.segments));
    const cmpl = this.complexity;
    const cs   = this.colorSpread;

    const numR = Math.floor(4 + 5 * cmpl);
    for (let i = 0; i < numR; i++) {
      const fi    = i / numR;
      const a0    = fi * TAU + t * 0.04;
      const sweep = Math.PI * (0.45 + 0.30 * cmpl);
      const aEnd  = a0 + sweep;
      const rCtrl = R * (0.38 + 0.32 * Math.sin(t * 0.28 + i * 1.3));
      const aCtrl = a0 + sweep * 0.5 + 0.6 * Math.sin(t * 0.18 + i * 0.9);
      const dH    = i * (360 / numR) * cs * 0.6;

      const x0  = R * 0.06 * Math.cos(a0),    y0  = R * 0.06 * Math.sin(a0);
      const cpx = rCtrl * Math.cos(aCtrl),     cpy = rCtrl * Math.sin(aCtrl);
      const x1  = R * 0.96 * Math.cos(aEnd),  y1  = R * 0.96 * Math.sin(aEnd);

      // Main ribbon
      this._neonStroke(ctx, c => {
        c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(cpx, cpy, x1, y1);
      }, dH, 2.0 + cmpl * 0.5);

      // Hairline echo
      this._neonStroke(ctx, c => {
        c.beginPath();
        c.moveTo(R * 0.04 * Math.cos(a0 + 0.12), R * 0.04 * Math.sin(a0 + 0.12));
        c.quadraticCurveTo(cpx * 0.9, cpy * 0.9,
          R * 0.88 * Math.cos(aEnd - 0.14), R * 0.88 * Math.sin(aEnd - 0.14));
      }, dH + 25 * cs, 0.6);
    }

    // Center anchoring ring
    this._neonStroke(ctx, c => this._flowerPath(c, R * 0.14, R * 0.025, N, t * 0.1 * N), 0, 1.2);

    ctx.globalCompositeOperation = 'source-over';
  }

  // ── STARBURST — dense spiky star layers ──────────────────────────────────────
  // Uses amplitude ≈ r0 so cusps nearly touch the center — very pointy.
  _starburst(ctx, R, t) {
    ctx.globalCompositeOperation = 'lighter';
    const N    = Math.max(2, Math.round(this.segments));
    const cmpl = this.complexity;
    const cs   = this.colorSpread;

    const layers = [
      { r: 0.14, A: 0.125, n: N * 2, dH:   0,       cW: 1.8 },
      { r: 0.30, A: 0.265, n: N * 2, dH:  45 * cs,  cW: 2.5 },
      { r: 0.50, A: 0.440, n: N * 2, dH: -40 * cs,  cW: 3.0 },
      { r: 0.70, A: 0.615, n: N * 2, dH:  85 * cs,  cW: 2.8 },
      { r: 0.88, A: 0.760, n: N * 3, dH: 140 * cs,  cW: 2.2 },
    ];

    for (const layer of layers) {
      const r0    = R * layer.r;
      const A     = R * layer.A * (0.65 + 0.35 * cmpl);
      const phase = t * 0.09 * layer.n;
      this._neonStroke(ctx, c => this._flowerPath(c, r0, A, layer.n, phase), layer.dH, layer.cW);
    }

    // Fast-spinning inner burst
    this._neonStroke(
      ctx,
      c => this._flowerPath(c, R * 0.10, R * 0.088, N * 4, t * 2.0, 220),
      220 * cs, 1.2
    );

    // Radial spines
    const spines = N * 2;
    for (let i = 0; i < spines; i++) {
      const a  = (i / spines) * TAU + t * 0.04;
      const dH = i * (360 / spines) * cs * 0.4;
      this._neonStroke(ctx, c => {
        c.beginPath(); c.moveTo(0, 0);
        c.lineTo(R * 0.88 * Math.cos(a), R * 0.88 * Math.sin(a));
      }, dH, 0.6);
    }

    ctx.globalCompositeOperation = 'source-over';
  }

  // ── LACE — ornamental bead circles arranged in concentric rings ──────────────
  _lace(ctx, R, t) {
    ctx.globalCompositeOperation = 'lighter';
    const N    = Math.max(2, Math.round(this.segments));
    const cmpl = this.complexity;
    const cs   = this.colorSpread;

    const ringDefs = [
      { rBase: 0.14, circR: 0.025, count: N,     dH:   0,       spin:  0.04 },
      { rBase: 0.28, circR: 0.038, count: N,     dH:  40 * cs,  spin: -0.03 },
      { rBase: 0.43, circR: 0.046, count: N * 2, dH: -30 * cs,  spin:  0.05 },
      { rBase: 0.58, circR: 0.042, count: N * 2, dH:  70 * cs,  spin: -0.04 },
      { rBase: 0.72, circR: 0.036, count: N * 2, dH: -60 * cs,  spin:  0.03 },
      { rBase: 0.86, circR: 0.026, count: N * 3, dH: 110 * cs,  spin: -0.02 },
    ];

    for (const rd of ringDefs) {
      const baseR = R * rd.rBase;
      const circR = R * rd.circR * (0.7 + 0.3 * cmpl);
      const spin  = t * rd.spin;
      for (let i = 0; i < rd.count; i++) {
        const a  = (i / rd.count) * TAU + spin;
        const cx = baseR * Math.cos(a);
        const cy = baseR * Math.sin(a);
        this._neonStroke(ctx, c => { c.beginPath(); c.arc(cx, cy, circR,        0, TAU); }, rd.dH,         0.9);
        this._neonStroke(ctx, c => { c.beginPath(); c.arc(cx, cy, circR * 0.48, 0, TAU); }, rd.dH + 20*cs, 0.5);
        this._neonStroke(ctx, c => { c.beginPath(); c.arc(cx, cy, circR * 0.12, 0, TAU); }, rd.dH + 40*cs, 0.4);
      }
    }

    // Faint concentric guide rings
    [0.14, 0.28, 0.43, 0.58, 0.72, 0.86].forEach((rFrac, ri) => {
      this._neonStroke(ctx, c => {
        c.beginPath(); c.arc(0, 0, R * rFrac, 0, TAU);
      }, ri * 35 * cs, 0.25);
    });

    ctx.globalCompositeOperation = 'source-over';
  }

  // ── VORTEX — sweeping bezier arms that curl like a whirlpool ─────────────────
  _vortex(ctx, R, t) {
    ctx.globalCompositeOperation = 'lighter';
    const N    = Math.max(2, Math.round(this.segments));
    const cmpl = this.complexity;
    const cs   = this.colorSpread;

    const numArms = Math.round(N * (0.5 + 0.5 * cmpl));
    for (let i = 0; i < numArms; i++) {
      const fi   = i / numArms;
      const a0   = fi * TAU + t * 0.07;
      const curl = Math.PI * (0.60 + 0.40 * cmpl);
      const aEnd = a0 + curl;

      // Control point swept to create a strong vortex curve
      const rMid = R * 0.48;
      const aMid = a0 + curl * 0.5 + Math.PI * 0.25;
      const cpx  = rMid * Math.cos(aMid);
      const cpy  = rMid * Math.sin(aMid);

      const x0 = R * 0.04 * Math.cos(a0),    y0 = R * 0.04 * Math.sin(a0);
      const x1 = R * 0.94 * Math.cos(aEnd),  y1 = R * 0.94 * Math.sin(aEnd);
      const dH = i * (360 / numArms) * cs * 0.7;

      // Primary arm
      this._neonStroke(ctx, c => {
        c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(cpx, cpy, x1, y1);
      }, dH, 2.5);

      // Counter-curling echo
      const cpx2 = rMid * 0.7 * Math.cos(aMid - 0.4);
      const cpy2 = rMid * 0.7 * Math.sin(aMid - 0.4);
      this._neonStroke(ctx, c => {
        c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo(cpx2, cpy2, x1, y1);
      }, dH + 40 * cs, 0.8);
    }

    // Center flower
    this._neonStroke(ctx, c => this._flowerPath(c, R * 0.12, R * 0.030, N, t * 0.1 * N), 0, 1.4);

    ctx.globalCompositeOperation = 'source-over';
  }

  // ── GEO — bold overlapping polygons, slow alternating counter-rotation ───────
  _geo(ctx, R, t) {
    ctx.globalCompositeOperation = 'lighter';
    const N    = Math.max(2, Math.round(this.segments));
    const cmpl = this.complexity;
    const cs   = this.colorSpread;

    const shapes = [
      { r: 0.28, sides: 3, speed:  1, dH:   0,       cW: 3.5 },
      { r: 0.48, sides: 4, speed: -1, dH:  60 * cs,  cW: 3.0 },
      { r: 0.64, sides: 3, speed:  1, dH: -45 * cs,  cW: 2.8 },
      { r: 0.78, sides: 6, speed: -1, dH: 100 * cs,  cW: 2.4 },
      { r: 0.92, sides: 4, speed:  1, dH: 160 * cs,  cW: 2.0 },
    ];

    for (const sh of shapes) {
      const r    = R * sh.r * (0.8 + 0.2 * cmpl);
      const rotT = t * 0.05 * sh.speed;
      this._neonStroke(ctx, c => {
        c.beginPath();
        for (let j = 0; j <= sh.sides; j++) {
          const a = (j / sh.sides) * TAU + rotT;
          j === 0 ? c.moveTo(r * Math.cos(a), r * Math.sin(a))
                  : c.lineTo(r * Math.cos(a), r * Math.sin(a));
        }
        c.closePath();
      }, sh.dH, sh.cW);
    }

    // N-fold flower rings anchoring the pattern
    this._neonStroke(ctx, c => this._flowerPath(c, R * 0.20, R * 0.065, N, t * 0.07 * N),  40 * cs, 2.2);
    this._neonStroke(ctx, c => this._flowerPath(c, R * 0.55, R * 0.090, N, t * 0.05 * N), -50 * cs, 2.6);

    ctx.globalCompositeOperation = 'source-over';
  }

  // ── PRISM — triangular facets ────────────────────────────────────────────────
  _prism(ctx, R, t) {
    ctx.globalCompositeOperation = 'lighter';

    const N    = Math.max(2, Math.round(this.segments));
    const cmpl = this.complexity;
    const numF = Math.floor(5 + 13 * cmpl);

    for (let i = 0; i < numF; i++) {
      const fi = i / numF;
      const a1 = fi * TAU + t * 0.10;
      const a2 = (fi + 1 / numF) * TAU + t * 0.10;
      const am = (a1 + a2) / 2;

      const r1 = R * (0.16 + 0.15 * Math.sin(t * 0.36 + i * 1.14));
      const r2 = R * (0.56 + 0.30 * Math.cos(t * 0.25 + i * 1.57));

      this._neonStroke(
        ctx,
        c => {
          c.beginPath();
          c.moveTo(0, 0);
          c.lineTo(r1 * Math.cos(a1), r1 * Math.sin(a1));
          c.lineTo(r2 * Math.cos(am), r2 * Math.sin(am));
          c.lineTo(r1 * Math.cos(a2), r1 * Math.sin(a2));
          c.closePath();
        },
        i * (360 / numF),
        1.2
      );
    }

    // Fine radial lines
    const spokes = Math.floor(numF * 2.5);
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * TAU + t * 0.05;
      const r = R * (0.2 + 0.65 * (i % 3) / 2);
      this._neonStroke(
        ctx,
        c => { c.beginPath(); c.moveTo(0, 0); c.lineTo(r * Math.cos(a), r * Math.sin(a)); },
        i * 12,
        0.4
      );
    }

    ctx.globalCompositeOperation = 'source-over';
  }
}
