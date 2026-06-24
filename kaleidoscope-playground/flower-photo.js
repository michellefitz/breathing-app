// flower-photo.js — image-driven flower bloom.
//
// Loads a real flower photo (picked from the device) into a WebGL texture and
// "blooms" it with the breath: a radial unfurl from the centre, a gentle
// spiral-open twist, organic fbm warp/shimmer, soft highlight bloom, and
// edge-light filaments. This is the high-fidelity route toward the Figma-style
// reference — a photo run through shaders rather than a procedural flower.
//
// Everything here ports to a SwiftUI .layerEffect / Metal shader sampling a
// bundled image in the app; the maths is identical.

// ── Easings (mirror of KaleidoscopeEngine.swift) ─────────────────────────────

const EASINGS = {
  linear:         t => t,
  easeInOutSine:  t => -(Math.cos(Math.PI * t) - 1) / 2,
  easeInOutCubic: t => (t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2),
  easeInOutQuart: t => (t < 0.5 ? 8*t*t*t*t : 1 - Math.pow(-2*t + 2, 4) / 2),
  easeOutCubic:   t => 1 - Math.pow(1 - t, 3),
};

// ── Shaders ──────────────────────────────────────────────────────────────────

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;

uniform sampler2D uTex;
uniform float uHasTex;
uniform vec2  uRes;
uniform vec2  uTexScale;   // aspect-correct fit (set from image dims)
uniform vec2  uTexel;      // 1.0 / image size, for neighbour taps
uniform vec2  uOffset;     // texture-space recentre
uniform float uTime;
uniform float uBreath;     // eased 0..1 bloom amount
uniform float uZoom;
uniform float uSwirl;      // spiral-open twist
uniform float uWarp;       // organic displacement
uniform float uReveal;     // softness of the bloom edge
uniform float uFlowerR;    // radius the open flower fills
uniform float uGlow;       // highlight bloom
uniform float uEdge;       // edge-light / filament strength
uniform float uSat;
uniform float uBright;
uniform vec3  uTint;
uniform float uVignette;
uniform vec3  uBg;

#define TAU 6.28318530718

float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++){ v += a * noise(p); p = p * 2.02 + vec2(11.7, 3.1); a *= 0.5; }
  return v;
}
float lum(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }

void main(){
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);
  float r = length(p);
  float a = atan(p.y, p.x);
  float t = uTime;
  float grow = uBreath;

  // No photo yet → soft breathing glow so the canvas isn't dead.
  if (uHasTex < 0.5) {
    float g = exp(-r * 3.0) * (0.25 + 0.75 * grow);
    gl_FragColor = vec4(uBg + vec3(0.16, 0.10, 0.22) * g, 1.0);
    return;
  }

  // Spiral-open twist: petals wound up when empty, unwinding as it grows.
  float tw = (1.0 - grow) * uSwirl;
  a += t * 0.03 + tw * smoothstep(0.0, uFlowerR, r) * 1.6;

  // Reconstruct + zoom (breath gives a gentle push outward).
  float zoom = uZoom * (0.96 + 0.08 * grow);
  vec2 q = vec2(cos(a), sin(a)) * r / zoom;

  // Organic fbm warp so the flower undulates instead of sitting flat.
  float wAmt = uWarp * (0.4 + 0.6 * grow);
  q += (vec2(fbm(q * 3.0 + t * 0.10), fbm(q * 3.0 + vec2(5.2, 1.3) - t * 0.08)) - 0.5) * wAmt * 0.12;

  // To texture space.
  vec2 tuv = q * uTexScale + 0.5 + uOffset;

  vec3 flower = texture2D(uTex, tuv).rgb;

  // Soft highlight bloom — 8-tap ring, only on the brights.
  vec3 bloom = vec3(0.0);
  for (int i = 0; i < 8; i++){
    float ang = float(i) / 8.0 * TAU;
    vec2 off = vec2(cos(ang), sin(ang)) * uTexel * 3.0;
    bloom += texture2D(uTex, tuv + off).rgb;
  }
  bloom = max(bloom / 8.0 - 0.45, 0.0);
  flower += bloom * uGlow;

  // Edge-light / filaments from the luminance gradient.
  float e = abs(lum(texture2D(uTex, tuv + vec2(uTexel.x, 0.0)).rgb) - lum(texture2D(uTex, tuv - vec2(uTexel.x, 0.0)).rgb))
          + abs(lum(texture2D(uTex, tuv + vec2(0.0, uTexel.y)).rgb) - lum(texture2D(uTex, tuv - vec2(0.0, uTexel.y)).rgb));
  flower += uTint * e * uEdge * 4.0;

  // Colour grade.
  float L = lum(flower);
  flower = mix(vec3(L), flower, uSat) * uBright * uTint;

  // Radial reveal — the bloom opens from the centre outward with the breath.
  float revealR = mix(0.05, uFlowerR, smoothstep(0.0, 1.0, grow));
  float mask = smoothstep(revealR, revealR - uReveal, r);

  // Vignette into the dark.
  flower *= 1.0 - uVignette * smoothstep(uFlowerR * 0.6, uFlowerR * 1.3, r);

  vec3 col = mix(uBg, flower, mask);

  // Gentle filmic tonemap.
  col = col / (col + 0.8);
  col = pow(col, vec3(0.9));
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
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

const program = gl.createProgram();
gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
gl.linkProgram(program);
if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
gl.useProgram(program);

const quad = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quad);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
const aPos = gl.getAttribLocation(program, 'aPos');
gl.enableVertexAttribArray(aPos);
gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

const U = {};
[
  'uTex','uHasTex','uRes','uTexScale','uTexel','uOffset','uTime','uBreath',
  'uZoom','uSwirl','uWarp','uReveal','uFlowerR','uGlow','uEdge','uSat','uBright',
  'uTint','uVignette','uBg',
].forEach(n => { U[n] = gl.getUniformLocation(program, n); });

// One reusable texture.
const tex = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, tex);
// 1x1 placeholder until a photo loads.
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

let hasTex = 0;
let imgAspect = 1;

function loadImage(src) {
  const img = new Image();
  img.onload = () => {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    imgAspect = img.naturalWidth / img.naturalHeight;
    gl.uniform2f(U.uTexel, 1 / img.naturalWidth, 1 / img.naturalHeight);
    hasTex = 1;
    document.getElementById('loader').classList.add('hidden');
  };
  img.onerror = () => { /* no default available; wait for a user pick */ };
  img.src = src;
}

// File picker (camera roll / take a photo on mobile).
const fileInput = document.getElementById('file');
fileInput.addEventListener('change', (ev) => {
  const f = ev.target.files && ev.target.files[0];
  if (!f) return;
  const url = URL.createObjectURL(f);
  loadImage(url);
});

// Optional bundled default — loads if present, otherwise the picker stays up.
loadImage('assets/flower.jpg');

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width  = Math.floor(window.innerWidth  * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width  = window.innerWidth + 'px';
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
  inhale: 4, holdFull: 4, exhale: 4, holdEmpty: 2,
  inhaleEase: 'easeInOutSine',
  exhaleEase: 'easeInOutSine',

  // Framing
  zoom: 0.85,
  offsetY: 0.0,
  flowerR: 0.62,

  // Bloom motion
  swirl: 0.5,
  warp: 0.4,
  reveal: 0.18,

  // Light & grade
  glow: 0.8,
  edge: 0.6,
  saturation: 1.1,
  brightness: 1.05,
  tint: '#ffffff',
  vignette: 0.4,
  bgColor: '#000000',

  loadPhoto: () => fileInput.click(),
  screenshot: () => {
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `flower-photo-${Date.now()}.png`;
    a.click();
  },
};

const gui = new lil.GUI({ title: 'Flower Photo Bloom', width: 290 });
gui.domElement.style.cssText = 'position:fixed;top:16px;right:16px;';

gui.add(params, 'loadPhoto').name('🌸  Load flower photo');

const breathF = gui.addFolder('BREATHING');
breathF.add(params, 'inhale', 1, 12, 0.5).name('Inhale (s)').onChange(v => clock.setDurations({ inhale: v }));
breathF.add(params, 'holdFull', 0, 12, 0.5).name('Hold full (s)').onChange(v => clock.setDurations({ holdFull: v }));
breathF.add(params, 'exhale', 1, 12, 0.5).name('Exhale (s)').onChange(v => clock.setDurations({ exhale: v }));
breathF.add(params, 'holdEmpty', 0, 8, 0.5).name('Hold empty (s)').onChange(v => clock.setDurations({ holdEmpty: v }));
breathF.add(params, 'inhaleEase', Object.keys(EASINGS)).name('Inhale ease');
breathF.add(params, 'exhaleEase', Object.keys(EASINGS)).name('Exhale ease');
breathF.close();

const frameF = gui.addFolder('FRAMING');
frameF.add(params, 'zoom', 0.3, 2.0, 0.01).name('Zoom');
frameF.add(params, 'offsetY', -0.5, 0.5, 0.01).name('Vertical offset');
frameF.add(params, 'flowerR', 0.3, 0.95, 0.01).name('Flower size');

const motionF = gui.addFolder('BLOOM MOTION');
motionF.add(params, 'swirl', 0, 2, 0.01).name('Spiral open');
motionF.add(params, 'warp', 0, 1.2, 0.01).name('Warp / shimmer');
motionF.add(params, 'reveal', 0.02, 0.5, 0.01).name('Edge softness');

const lightF = gui.addFolder('LIGHT & COLOUR');
lightF.add(params, 'glow', 0, 2.5, 0.01).name('Highlight bloom');
lightF.add(params, 'edge', 0, 2, 0.01).name('Edge-light / filaments');
lightF.add(params, 'saturation', 0, 1.8, 0.01).name('Saturation');
lightF.add(params, 'brightness', 0.5, 1.8, 0.01).name('Brightness');
lightF.addColor(params, 'tint').name('Tint');
lightF.add(params, 'vignette', 0, 1, 0.01).name('Vignette');
lightF.addColor(params, 'bgColor').name('Background').onChange(v => { document.body.style.background = v; });

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

let breath = 0;

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
  const tint = hexToRgb(params.tint);
  const bg = hexToRgb(params.bgColor);

  // Aspect-correct fit: keep the photo undistorted on a square-normalised field.
  const tsx = imgAspect >= 1 ? 1.0 / imgAspect : 1.0;
  const tsy = imgAspect >= 1 ? 1.0 : imgAspect;

  gl.uniform1i(U.uTex, 0);
  gl.uniform1f(U.uHasTex, hasTex);
  gl.uniform2f(U.uRes, canvas.width, canvas.height);
  gl.uniform2f(U.uTexScale, tsx, tsy);
  gl.uniform2f(U.uOffset, 0.0, params.offsetY);
  gl.uniform1f(U.uTime, time);
  gl.uniform1f(U.uBreath, breath);
  gl.uniform1f(U.uZoom, params.zoom);
  gl.uniform1f(U.uSwirl, params.swirl);
  gl.uniform1f(U.uWarp, params.warp);
  gl.uniform1f(U.uReveal, params.reveal);
  gl.uniform1f(U.uFlowerR, params.flowerR);
  gl.uniform1f(U.uGlow, params.glow);
  gl.uniform1f(U.uEdge, params.edge);
  gl.uniform1f(U.uSat, params.saturation);
  gl.uniform1f(U.uBright, params.brightness);
  gl.uniform3f(U.uTint, tint[0], tint[1], tint[2]);
  gl.uniform1f(U.uVignette, params.vignette);
  gl.uniform3f(U.uBg, bg[0], bg[1], bg[2]);

  gl.drawArrays(gl.TRIANGLES, 0, 3);
  stats.update();
}

frame();
clock.start();
