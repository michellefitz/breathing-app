// shader-bloom.js — standalone WebGL fragment-shader sandbox.
//
// A liquid / nebula "flower bloom" driven by the breath cycle. This is a
// PROTOTYPE meant for dialing in the look in the browser; once it feels right
// the GLSL ports almost 1:1 to a SwiftUI .colorEffect / Metal shader for the app.
//
// It reuses BreathingClock.js for the 4-phase breath, and exposes the same
// kind of uniforms the app already has (breath amount, hue, time) so the
// mental model carries straight over.

// ── Easings (mirror of KaleidoscopeEngine.swift) ─────────────────────────────

const EASINGS = {
  linear:         t => t,
  easeInCubic:    t => t * t * t,
  easeOutCubic:   t => 1 - Math.pow(1 - t, 3),
  easeInOutCubic: t => (t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2),
  easeInOutSine:  t => -(Math.cos(Math.PI * t) - 1) / 2,
  easeInOutQuart: t => (t < 0.5 ? 8*t*t*t*t : 1 - Math.pow(-2*t + 2, 4) / 2),
};

// ── Shaders ──────────────────────────────────────────────────────────────────

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

// Liquid nebula bloom. Polar field + fbm domain-warp + cosine palette.
// The "flower" is a rose-curve petal mask whose radius is driven by uBreath,
// so the bloom literally unfurls on the inhale and recedes on the exhale.
const FRAG = `
precision highp float;

uniform vec2  uRes;
uniform float uTime;
uniform float uBreath;      // eased 0..1 — the bloom amount
uniform float uHue;         // 0..1 base palette phase
uniform float uColorShift;  // how much noise pushes the palette
uniform float uColorSpread; // palette frequency (1 = 2-3 tones, higher = rainbow)
uniform float uSat;
uniform float uBright;
uniform float uPetals;      // petal count (rose-curve k)
uniform float uPetalSharp;  // how pronounced the petal lobes are
uniform float uWarp;        // domain-warp strength (liquid-ness)
uniform float uSwirl;       // rotational swirl
uniform float uBloom;       // overall bloom reach
uniform float uGlow;        // central core glow
uniform float uGrain;       // film grain
uniform vec3  uBg;          // background tint

#define TAU 6.28318530718

// --- noise ---
float hash(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float noise(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i + vec2(0.0, 0.0));
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 5; i++){
    v += amp * noise(p);
    p = p * 2.02 + vec2(11.7, 3.1);
    amp *= 0.5;
  }
  return v;
}

// cosine palette (Inigo Quilez). d shifts the hue.
vec3 palette(float t){
  vec3 a = vec3(0.5);
  vec3 b = vec3(0.5);
  vec3 c = vec3(uColorSpread);
  vec3 d = vec3(uHue) + vec3(0.0, 0.12, 0.24);
  return a + b * cos(TAU * (c * t + d));
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);

  float r = length(uv);
  float a = atan(uv.y, uv.x);

  float t      = uTime;
  float grow   = uBreath;                 // 0..1
  float growSm = smoothstep(0.0, 1.0, grow);

  // Swirl: stronger toward the centre, eased open as the bloom grows.
  a += t * 0.08 + uSwirl * (1.0 - r) * (0.4 + 0.9 * grow);

  // Liquid domain warp in polar space → flowing, never-quite-repeating motion.
  vec2 p = vec2(cos(a), sin(a)) * r;
  vec2 q = vec2(
    fbm(p * 2.3 + vec2(0.0, 0.0) + t * 0.10),
    fbm(p * 2.3 + vec2(5.2, 1.3) - t * 0.12)
  );
  float warpAmt = uWarp * (0.35 + 0.9 * grow);
  vec2  pw = p + warpAmt * (q - 0.5);
  float n  = fbm(pw * 2.8 + t * 0.14);
  float n2 = fbm(pw * 5.5 - t * 0.09);

  // Rose-curve petal edge. Petals sharpen as the flower opens.
  float lobe   = 0.5 + 0.5 * cos(uPetals * a + t * 0.15);
  float petalR = uBloom * (0.10 + 0.70 * growSm) * (1.0 + uPetalSharp * (lobe - 0.5));

  // Soft bloom mask: 1 inside the petal field, feathered at the edge.
  float edgeSoft = 0.10 + 0.18 * grow;
  float mask = smoothstep(petalR, petalR - edgeSoft, r);

  // Nebula density: warped noise inside the mask, with filament detail.
  float density = mask * (0.35 + 0.85 * n) * (0.6 + 0.6 * n2);

  // Colour: palette indexed by radius + warped noise + slow drift.
  float cidx = r * 0.55 + n * uColorShift + t * 0.015;
  vec3  col  = palette(cidx) * density;

  // Layered outward glow — a couple of expanded, fainter shells for the
  // "blooming outward" feel without a real bloom pass.
  float halo = smoothstep(petalR * 1.55, petalR * 0.6, r);
  col += palette(cidx + 0.15) * halo * 0.18 * (0.4 + grow);

  // Central core glow.
  col += palette(uHue + 0.05) * exp(-r * 7.0) * uGlow * (0.5 + 0.8 * grow);

  // Saturation / brightness shaping.
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(luma), col, uSat);
  col *= uBright;

  // Background tint shows through where density is low.
  col += uBg * (1.0 - clamp(density + halo * 0.5, 0.0, 1.0));

  // Subtle film grain to kill banding and add organic texture.
  float g = hash(gl_FragCoord.xy + fract(t) * 100.0) - 0.5;
  col += g * uGrain;

  // Gentle filmic-ish tonemap so highlights bloom instead of clipping flat.
  col = col / (col + 0.7);
  col = pow(col, vec3(0.85));

  gl_FragColor = vec4(col, 1.0);
}
`;

// ── WebGL setup ──────────────────────────────────────────────────────────────

const canvas = document.getElementById('canvas');
const gl = canvas.getContext('webgl', { antialias: true, alpha: false });
if (!gl) {
  document.body.innerHTML = '<p style="color:#fff;font-family:sans-serif;padding:2rem">WebGL not available in this browser.</p>';
  throw new Error('no webgl');
}

function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(s));
  }
  return s;
}

const program = gl.createProgram();
gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
gl.linkProgram(program);
if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
  throw new Error(gl.getProgramInfoLog(program));
}
gl.useProgram(program);

// Fullscreen triangle.
const buf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
const aPos = gl.getAttribLocation(program, 'aPos');
gl.enableVertexAttribArray(aPos);
gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

const U = {};
[
  'uRes','uTime','uBreath','uHue','uColorShift','uColorSpread','uSat','uBright',
  'uPetals','uPetalSharp','uWarp','uSwirl','uBloom','uGlow','uGrain','uBg',
].forEach(name => { U[name] = gl.getUniformLocation(program, name); });

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width  = Math.floor(window.innerWidth  * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width  = window.innerWidth  + 'px';
  canvas.style.height = window.innerHeight + 'px';
  gl.viewport(0, 0, canvas.width, canvas.height);
}
window.addEventListener('resize', resize);
resize();

// ── Params + GUI ─────────────────────────────────────────────────────────────

function hexToRgb(hex) {
  const v = parseInt(hex.replace('#', ''), 16);
  return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
}

const params = {
  // Breathing
  inhale: 4, holdFull: 4, exhale: 4, holdEmpty: 2,
  inhaleEase: 'easeInOutSine',
  exhaleEase: 'easeInOutSine',

  // Colour
  hue: 0.72,          // deep violet/magenta start
  colorShift: 0.45,
  colorSpread: 1.0,
  saturation: 1.05,
  brightness: 1.15,
  bgColor: '#04020a',

  // Bloom shape
  petals: 6,
  petalSharp: 0.45,
  bloom: 1.0,

  // Liquid motion
  warp: 0.55,
  swirl: 0.6,

  // Light
  glow: 1.0,
  grain: 0.035,

  screenshot: () => {
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `nebula-bloom-${Date.now()}.png`;
    a.click();
  },
};

const PRESETS = {
  Violet:   { hue: 0.72, colorShift: 0.45, colorSpread: 1.0, bgColor: '#04020a', petals: 6, petalSharp: 0.45, warp: 0.55, swirl: 0.6, glow: 1.0 },
  Aurora:   { hue: 0.45, colorShift: 0.55, colorSpread: 1.3, bgColor: '#01060a', petals: 5, petalSharp: 0.35, warp: 0.7,  swirl: 0.8, glow: 0.9 },
  Ember:    { hue: 0.04, colorShift: 0.35, colorSpread: 0.8, bgColor: '#0a0301', petals: 8, petalSharp: 0.55, warp: 0.5,  swirl: 0.4, glow: 1.2 },
  Ocean:    { hue: 0.55, colorShift: 0.40, colorSpread: 0.9, bgColor: '#01080a', petals: 6, petalSharp: 0.40, warp: 0.65, swirl: 0.7, glow: 0.85 },
  Rose:     { hue: 0.92, colorShift: 0.30, colorSpread: 0.9, bgColor: '#0a0206', petals: 7, petalSharp: 0.60, warp: 0.45, swirl: 0.35, glow: 1.05 },
  Spectrum: { hue: 0.0,  colorShift: 0.6,  colorSpread: 2.2, bgColor: '#030309', petals: 5, petalSharp: 0.35, warp: 0.6,  swirl: 0.9, glow: 1.0 },
};

const gui = new lil.GUI({ title: 'Nebula Bloom', width: 290 });
gui.domElement.style.cssText = 'position:fixed;top:16px;right:16px;';

const breathF = gui.addFolder('BREATHING');
breathF.add(params, 'inhale', 1, 12, 0.5).name('Inhale (s)').onChange(v => clock.setDurations({ inhale: v }));
breathF.add(params, 'holdFull', 0, 12, 0.5).name('Hold full (s)').onChange(v => clock.setDurations({ holdFull: v }));
breathF.add(params, 'exhale', 1, 12, 0.5).name('Exhale (s)').onChange(v => clock.setDurations({ exhale: v }));
breathF.add(params, 'holdEmpty', 0, 8, 0.5).name('Hold empty (s)').onChange(v => clock.setDurations({ holdEmpty: v }));
breathF.add(params, 'inhaleEase', Object.keys(EASINGS)).name('Inhale ease');
breathF.add(params, 'exhaleEase', Object.keys(EASINGS)).name('Exhale ease');

const presetObj = {};
Object.keys(PRESETS).forEach(name => {
  presetObj[name] = () => {
    Object.assign(params, PRESETS[name]);
    gui.controllersRecursive().forEach(c => c.updateDisplay());
    document.body.style.background = params.bgColor;
  };
});
const presetF = gui.addFolder('PALETTES');
Object.keys(presetObj).forEach(n => presetF.add(presetObj, n));

const colF = gui.addFolder('COLOUR');
colF.add(params, 'hue', 0, 1, 0.01).name('Base hue');
colF.add(params, 'colorShift', 0, 1, 0.01).name('Colour shift');
colF.add(params, 'colorSpread', 0.3, 3, 0.05).name('Spread (tones)');
colF.add(params, 'saturation', 0, 1.6, 0.01).name('Saturation');
colF.add(params, 'brightness', 0.5, 2, 0.01).name('Brightness');
colF.addColor(params, 'bgColor').name('Background').onChange(v => { document.body.style.background = v; });

const shapeF = gui.addFolder('BLOOM SHAPE');
shapeF.add(params, 'petals', 2, 16, 1).name('Petals');
shapeF.add(params, 'petalSharp', 0, 1, 0.01).name('Petal definition');
shapeF.add(params, 'bloom', 0.5, 1.6, 0.01).name('Bloom reach');

const motionF = gui.addFolder('LIQUID MOTION');
motionF.add(params, 'warp', 0, 1.5, 0.01).name('Warp (flow)');
motionF.add(params, 'swirl', 0, 2, 0.01).name('Swirl');

const lightF = gui.addFolder('LIGHT');
lightF.add(params, 'glow', 0, 2, 0.01).name('Core glow');
lightF.add(params, 'grain', 0, 0.12, 0.005).name('Grain');

gui.add(params, 'screenshot').name('📸  Screenshot (PNG)');

document.body.style.background = params.bgColor;

// ── Stats ────────────────────────────────────────────────────────────────────

const stats = new Stats();
stats.dom.style.cssText = 'position:fixed;top:0;left:0;cursor:pointer;opacity:0.9;z-index:10000';
document.body.appendChild(stats.dom);

// ── Breathing clock → breath amount ──────────────────────────────────────────

const clock = new BreathingClock({
  inhale: params.inhale, holdFull: params.holdFull,
  exhale: params.exhale, holdEmpty: params.holdEmpty,
});

const phaseTextMap = { inhale: 'breathe in', holdFull: 'hold', exhale: 'breathe out', holdEmpty: '' };

let breath = 0; // continuous 0..1 bloom amount, same role as Swift's breathScale

clock.onPhaseChange = (phase) => {
  const el = document.getElementById('phase-label');
  if (el) {
    el.style.opacity = '0';
    setTimeout(() => { el.textContent = phaseTextMap[phase] || ''; el.style.opacity = ''; }, 300);
  }
};

clock.onProgress = (phase, t) => {
  const inE = EASINGS[params.inhaleEase] || EASINGS.easeInOutSine;
  const exE = EASINGS[params.exhaleEase] || EASINGS.easeInOutSine;
  if      (phase === 'inhale')   breath = inE(t);
  else if (phase === 'holdFull') breath = 1.0;
  else if (phase === 'exhale')   breath = 1.0 - exE(t);
  else                           breath = 0.0;
};

// ── Render loop ──────────────────────────────────────────────────────────────

let start = performance.now();

function frame() {
  requestAnimationFrame(frame);
  clock.tick();

  const time = (performance.now() - start) / 1000;
  const bg = hexToRgb(params.bgColor);

  gl.uniform2f(U.uRes, canvas.width, canvas.height);
  gl.uniform1f(U.uTime, time);
  gl.uniform1f(U.uBreath, breath);
  gl.uniform1f(U.uHue, params.hue);
  gl.uniform1f(U.uColorShift, params.colorShift);
  gl.uniform1f(U.uColorSpread, params.colorSpread);
  gl.uniform1f(U.uSat, params.saturation);
  gl.uniform1f(U.uBright, params.brightness);
  gl.uniform1f(U.uPetals, params.petals);
  gl.uniform1f(U.uPetalSharp, params.petalSharp);
  gl.uniform1f(U.uWarp, params.warp);
  gl.uniform1f(U.uSwirl, params.swirl);
  gl.uniform1f(U.uBloom, params.bloom);
  gl.uniform1f(U.uGlow, params.glow);
  gl.uniform1f(U.uGrain, params.grain);
  gl.uniform3f(U.uBg, bg[0], bg[1], bg[2]);

  gl.drawArrays(gl.TRIANGLES, 0, 3);
  stats.update();
}

frame();
clock.start();
