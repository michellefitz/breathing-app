// shader-bloom.js — standalone WebGL fragment-shader sandbox.
//
// A flower that blooms with the breath: three layered rings of petals unfurl
// from the centre on the inhale and fold back on the exhale, with a flowing
// liquid/nebula texture inside the petals. This is a PROTOTYPE for dialing in
// the look in the browser; the GLSL ports almost 1:1 to a SwiftUI .colorEffect
// / Metal shader for the app.
//
// Reuses BreathingClock.js for the 4-phase breath and exposes the same kind of
// uniforms the app already has (breath amount, hue, time).

// ── Easings (mirror of KaleidoscopeEngine.swift) ─────────────────────────────

const EASINGS = {
  linear:         t => t,
  easeInCubic:    t => t * t * t,
  easeOutCubic:   t => 1 - Math.pow(1 - t, 3),
  easeInOutCubic: t => (t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2),
  easeInOutSine:  t => -(Math.cos(Math.PI * t) - 1) / 2,
  easeInOutQuart: t => (t < 0.5 ? 8*t*t*t*t : 1 - Math.pow(-2*t + 2, 4) / 2),
  easeOutElastic: t => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    return Math.pow(2, -10*t) * Math.sin((t*10 - 0.75) * (2*Math.PI/3)) + 1;
  },
};

// ── Shaders ──────────────────────────────────────────────────────────────────

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

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
uniform float uPetals;      // petals per ring
uniform float uSharp;       // petal definition (gap between petals)
uniform float uPetalLen;    // how far petals reach when open
uniform float uWarp;        // liquid warp strength
uniform float uSwirl;       // how much petals twist as they open
uniform float uBloom;       // overall flower size
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

// cosine palette (Inigo Quilez). uHue shifts the hue.
vec3 palette(float t){
  vec3 a = vec3(0.5);
  vec3 b = vec3(0.5);
  vec3 c = vec3(uColorSpread);
  vec3 d = vec3(uHue) + vec3(0.0, 0.12, 0.24);
  return a + b * cos(TAU * (c * t + d));
}

// One ring of petals around the centre. Returns coverage in [0,1] and writes
// the petal-local value m (1 along a petal's centre-line, 0 in the gaps) so the
// caller can shade petals with depth.
float petalRing(float a, float r, float petals, float rot,
                float baseR, float petLen, float sharp, float feather, out float m){
  float c = cos(petals * (a - rot));
  m = pow(max(c, 0.0), sharp);          // sharpen lobes into separated petals
  float edge  = baseR + petLen * m;     // outer edge of this row (recedes in gaps)
  float inner = baseR * 0.30;
  float outer = smoothstep(edge, edge - feather, r);
  float core  = smoothstep(inner - feather, inner, r);
  return outer * core;
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);

  float t      = uTime;
  float grow   = uBreath;               // 0..1
  float growSm = smoothstep(0.0, 1.0, grow);

  float r = length(uv);
  float a = atan(uv.y, uv.x);

  // Slow overall spin + breath-eased twist toward the centre — the unfurl.
  a += t * 0.05 + uSwirl * (1.0 - r) * (0.3 + 0.7 * grow);

  // Liquid warp: perturb the polar field with fbm so petal edges flow and the
  // interior shimmers instead of sitting flat.
  float w  = uWarp * (0.25 + 0.5 * grow);
  float wa = (fbm(uv * 3.0 + t * 0.10) - 0.5) * w * 0.6;
  float wr = (fbm(uv * 3.0 + vec2(7.0, 2.0) - t * 0.08) - 0.5) * w * 0.25;
  a += wa;
  r += wr;

  float n = fbm(uv * 4.0 + t * 0.12);   // texture inside the petals

  vec3 col = uBg;

  // Staggered unfurl: outer petals open first, inner rows follow.
  float g0 = smoothstep(0.0, 1.0, clamp(grow * 1.25,        0.0, 1.0));
  float g1 = smoothstep(0.0, 1.0, clamp(grow * 1.25 - 0.12, 0.0, 1.0));
  float g2 = smoothstep(0.0, 1.0, clamp(grow * 1.25 - 0.24, 0.0, 1.0));

  float B = uBloom;
  float P = uPetals;
  float m;

  // Ring 0 — outer petals (behind).
  {
    float mask = petalRing(a, r, P, t * 0.02,
                           0.16 * B, uPetalLen * 0.82 * B * g0, uSharp, 0.05, m);
    float shade = (0.35 + 0.65 * m) * (0.55 + 0.55 * n);
    vec3  c = palette(uHue + 0.00 + r * 0.45 + n * uColorShift);
    col = mix(col, c * uBright * shade, mask);
  }
  // Ring 1 — mid petals, offset half a petal, a touch brighter.
  {
    float mask = petalRing(a, r, P, t * 0.02 + 3.14159 / P,
                           0.12 * B, uPetalLen * 0.60 * B * g1, uSharp * 1.1, 0.045, m);
    float shade = (0.40 + 0.60 * m) * (0.60 + 0.50 * n);
    vec3  c = palette(uHue + 0.10 + r * 0.50 + n * uColorShift);
    col = mix(col, c * uBright * shade * 1.10, mask);
  }
  // Ring 2 — inner petals (front), tightest and brightest.
  {
    float mask = petalRing(a, r, P, t * 0.02,
                           0.07 * B, uPetalLen * 0.40 * B * g2, uSharp * 1.25, 0.04, m);
    float shade = (0.45 + 0.55 * m) * (0.65 + 0.45 * n);
    vec3  c = palette(uHue + 0.20 + r * 0.55 + n * uColorShift);
    col = mix(col, c * uBright * shade * 1.20, mask);
  }

  // Central core / stamen glow.
  col += palette(uHue + 0.30) * exp(-r * 9.0) * uGlow * (0.5 + 0.9 * grow);

  // Soft outward halo so the bloom glows into the dark.
  col += palette(uHue + 0.05) * exp(-r * 2.2) * (0.10 + 0.18 * grow);

  // Saturation / brightness shaping.
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(luma), col, uSat);

  // Subtle film grain to kill banding, then a gentle filmic tonemap so
  // highlights bloom instead of clipping flat.
  float g = hash(gl_FragCoord.xy + fract(t) * 100.0) - 0.5;
  col += g * uGrain;
  col = col / (col + 0.75);
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
  'uPetals','uSharp','uPetalLen','uWarp','uSwirl','uBloom','uGlow','uGrain','uBg',
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
  hue: 0.72,
  colorShift: 0.40,
  colorSpread: 0.9,
  saturation: 1.05,
  brightness: 1.2,
  bgColor: '#04020a',

  // Flower shape
  petals: 7,
  sharp: 1.6,
  petalLen: 0.55,
  bloom: 1.0,

  // Liquid motion
  warp: 0.4,
  swirl: 0.5,

  // Light
  glow: 1.0,
  grain: 0.03,

  screenshot: () => {
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `flower-bloom-${Date.now()}.png`;
    a.click();
  },
};

const PRESETS = {
  Violet: { hue: 0.72, colorShift: 0.40, colorSpread: 0.9, bgColor: '#04020a', petals: 7, sharp: 1.6, petalLen: 0.55, warp: 0.40, swirl: 0.5,  glow: 1.0 },
  Rose:   { hue: 0.94, colorShift: 0.30, colorSpread: 0.8, bgColor: '#0a0206', petals: 9, sharp: 1.8, petalLen: 0.50, warp: 0.30, swirl: 0.35, glow: 1.05 },
  Lotus:  { hue: 0.86, colorShift: 0.35, colorSpread: 0.9, bgColor: '#0a0408', petals: 8, sharp: 1.5, petalLen: 0.58, warp: 0.35, swirl: 0.4,  glow: 1.0 },
  Marigold:{hue: 0.08, colorShift: 0.30, colorSpread: 0.9, bgColor: '#0a0501', petals: 12,sharp: 2.0, petalLen: 0.45, warp: 0.35, swirl: 0.3,  glow: 1.1 },
  Ocean:  { hue: 0.54, colorShift: 0.45, colorSpread: 1.0, bgColor: '#01080a', petals: 6, sharp: 1.4, petalLen: 0.60, warp: 0.55, swirl: 0.7,  glow: 0.9 },
  Aurora: { hue: 0.45, colorShift: 0.55, colorSpread: 1.4, bgColor: '#01060a', petals: 5, sharp: 1.2, petalLen: 0.62, warp: 0.6,  swirl: 0.8,  glow: 0.95 },
};

const gui = new lil.GUI({ title: 'Flower Bloom', width: 290 });
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
const presetF = gui.addFolder('FLOWERS');
Object.keys(presetObj).forEach(n => presetF.add(presetObj, n));

const colF = gui.addFolder('COLOUR');
colF.add(params, 'hue', 0, 1, 0.01).name('Base hue');
colF.add(params, 'colorShift', 0, 1, 0.01).name('Colour shift');
colF.add(params, 'colorSpread', 0.3, 3, 0.05).name('Spread (tones)');
colF.add(params, 'saturation', 0, 1.6, 0.01).name('Saturation');
colF.add(params, 'brightness', 0.5, 2, 0.01).name('Brightness');
colF.addColor(params, 'bgColor').name('Background').onChange(v => { document.body.style.background = v; });

const shapeF = gui.addFolder('FLOWER SHAPE');
shapeF.add(params, 'petals', 3, 16, 1).name('Petals');
shapeF.add(params, 'sharp', 0.6, 3.5, 0.05).name('Petal definition');
shapeF.add(params, 'petalLen', 0.25, 0.85, 0.01).name('Petal length');
shapeF.add(params, 'bloom', 0.6, 1.5, 0.01).name('Flower size');

const motionF = gui.addFolder('LIQUID MOTION');
motionF.add(params, 'warp', 0, 1.2, 0.01).name('Warp (flow)');
motionF.add(params, 'swirl', 0, 2, 0.01).name('Swirl / twist');

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

let breath = 0; // continuous 0..1 bloom amount — same role as Swift's breathScale

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

const start = performance.now();

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
  gl.uniform1f(U.uSharp, params.sharp);
  gl.uniform1f(U.uPetalLen, params.petalLen);
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
