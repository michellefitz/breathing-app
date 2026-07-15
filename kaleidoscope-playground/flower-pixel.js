// flower-pixel.js — image-driven pixelate / halftone-dot bloom.
//
// Loads a flower photo and reveals it with the breath through one of two
// resolution effects:
//   • Pixelate — starts as a few huge blocks, subdivides to near-full
//     resolution on the inhale, collapses back on the exhale.
//   • Dots — a halftone grid; circles grow/fill from near-black on the inhale
//     (each dot sized + coloured from the flower beneath it) and shrink out.
//
// Shares the texture-loading / breath-clock scaffolding with flower-photo.js.
// The maths ports directly to a SwiftUI .layerEffect / Metal shader in the app.

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
uniform vec2  uTexScale;
uniform vec2  uOffset;
uniform float uZoom;
uniform float uBreath;
uniform float uStyle;      // 0 = pixelate, 1 = dots
uniform float uPixMin;     // blocks across at empty breath
uniform float uPixMax;     // blocks across at full breath
uniform float uDotMin;     // dot grid density at empty
uniform float uDotMax;     // dot grid density at full
uniform float uDotGain;    // how strongly brightness drives dot size
uniform float uDotSoft;    // dot edge softness
uniform float uDotColor;   // 1 = colour dots from image, 0 = single tint
uniform float uSat;
uniform float uBright;
uniform vec3  uTint;
uniform float uVignette;
uniform vec3  uBg;

float lum(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 grade(vec3 c){ float L = lum(c); return mix(vec3(L), c, uSat) * uBright * uTint; }
bool outside(vec2 uv){ return uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0; }

void main(){
  vec2 p  = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y);
  float be = smoothstep(0.0, 1.0, uBreath);

  if (uHasTex < 0.5) {
    float g = exp(-length(p) * 3.0) * (0.2 + 0.8 * be);
    gl_FragColor = vec4(uBg + vec3(0.14, 0.10, 0.20) * g, 1.0);
    return;
  }

  vec2 base = p / uZoom;
  float vig = 1.0 - uVignette * smoothstep(0.4, 0.95, length(p));

  vec3 col;

  if (uStyle < 0.5) {
    // ── PIXELATE ──
    float cells = mix(uPixMin, uPixMax, be);
    vec2  g   = (floor(base * cells) + 0.5) / cells;   // block centre
    vec2  tuv = g * uTexScale + 0.5 + uOffset;
    col = outside(tuv) ? uBg : grade(texture2D(uTex, tuv).rgb);
  } else {
    // ── DOTS (halftone) ──
    float cells = mix(uDotMin, uDotMax, be);
    vec2  cell  = base * cells;
    vec2  id    = floor(cell);
    vec2  cc    = id + 0.5;                              // cell centre (grid units)
    vec2  f     = cell - cc;                             // -0.5..0.5 within cell
    vec2  tuv   = (cc / cells) * uTexScale + 0.5 + uOffset;

    if (outside(tuv)) {
      col = uBg;
    } else {
      vec3  s      = texture2D(uTex, tuv).rgb;
      float bright = lum(s);
      // Dot radius grows with breath and with the local brightness (halftone).
      float rad = clamp(bright * uDotGain, 0.0, 1.0) * (0.12 + 0.88 * be) * 0.58;
      float d   = length(f);
      float dot = smoothstep(rad, rad - uDotSoft, d);
      vec3  dcol = mix(uTint, grade(s), uDotColor);
      col = mix(uBg, dcol, dot);
    }
  }

  col *= vig;
  col = col / (col + 0.9);
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
  'uTex','uHasTex','uRes','uTexScale','uOffset','uZoom','uBreath','uStyle',
  'uPixMin','uPixMax','uDotMin','uDotMax','uDotGain','uDotSoft','uDotColor',
  'uSat','uBright','uTint','uVignette','uBg',
].forEach(n => { U[n] = gl.getUniformLocation(program, n); });

const tex = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, tex);
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
    hasTex = 1;
    document.getElementById('loader').classList.add('hidden');
  };
  img.onerror = () => { /* wait for a user pick */ };
  img.src = src;
}

const fileInput = document.getElementById('file');
fileInput.addEventListener('change', (ev) => {
  const f = ev.target.files && ev.target.files[0];
  if (!f) return;
  loadImage(URL.createObjectURL(f));
});

loadImage('assets/flower.jpg');   // optional default; picker stays if absent

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

  style: 'Pixelate',           // 'Pixelate' | 'Dots'

  zoom: 0.85,
  offsetY: 0.0,

  // Pixelate
  pixMin: 4,
  pixMax: 150,

  // Dots
  dotMin: 6,
  dotMax: 90,
  dotGain: 1.5,
  dotSoft: 0.10,
  dotColor: true,

  // Colour
  saturation: 1.1,
  brightness: 1.05,
  tint: '#ffffff',
  vignette: 0.35,
  bgColor: '#000000',

  loadPhoto: () => fileInput.click(),
  screenshot: () => {
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `flower-pixel-${Date.now()}.png`;
    a.click();
  },
};

const gui = new lil.GUI({ title: 'Flower Pixel / Dots', width: 300 });
gui.domElement.style.cssText = 'position:fixed;top:16px;right:16px;';

gui.add(params, 'loadPhoto').name('🌸  Load flower photo');
gui.add(params, 'style', ['Pixelate', 'Dots']).name('Style');

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

const pixF = gui.addFolder('PIXELATE');
pixF.add(params, 'pixMin', 2, 30, 1).name('Blocks (empty)');
pixF.add(params, 'pixMax', 30, 320, 2).name('Blocks (full)');

const dotF = gui.addFolder('DOTS');
dotF.add(params, 'dotMin', 3, 40, 1).name('Density (empty)');
dotF.add(params, 'dotMax', 30, 220, 2).name('Density (full)');
dotF.add(params, 'dotGain', 0.5, 3.0, 0.05).name('Dot size gain');
dotF.add(params, 'dotSoft', 0.01, 0.4, 0.01).name('Dot softness');
dotF.add(params, 'dotColor').name('Colour dots');

const colF = gui.addFolder('COLOUR');
colF.add(params, 'saturation', 0, 1.8, 0.01).name('Saturation');
colF.add(params, 'brightness', 0.5, 1.8, 0.01).name('Brightness');
colF.addColor(params, 'tint').name('Tint');
colF.add(params, 'vignette', 0, 1, 0.01).name('Vignette');
colF.addColor(params, 'bgColor').name('Background').onChange(v => { document.body.style.background = v; });
colF.close();

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

function frame() {
  requestAnimationFrame(frame);
  clock.tick();

  const tint = hexToRgb(params.tint);
  const bg = hexToRgb(params.bgColor);
  const tsx = imgAspect >= 1 ? 1.0 / imgAspect : 1.0;
  const tsy = imgAspect >= 1 ? 1.0 : imgAspect;

  gl.uniform1i(U.uTex, 0);
  gl.uniform1f(U.uHasTex, hasTex);
  gl.uniform2f(U.uRes, canvas.width, canvas.height);
  gl.uniform2f(U.uTexScale, tsx, tsy);
  gl.uniform2f(U.uOffset, 0.0, params.offsetY);
  gl.uniform1f(U.uZoom, params.zoom);
  gl.uniform1f(U.uBreath, breath);
  gl.uniform1f(U.uStyle, params.style === 'Dots' ? 1.0 : 0.0);
  gl.uniform1f(U.uPixMin, params.pixMin);
  gl.uniform1f(U.uPixMax, params.pixMax);
  gl.uniform1f(U.uDotMin, params.dotMin);
  gl.uniform1f(U.uDotMax, params.dotMax);
  gl.uniform1f(U.uDotGain, params.dotGain);
  gl.uniform1f(U.uDotSoft, params.dotSoft);
  gl.uniform1f(U.uDotColor, params.dotColor ? 1.0 : 0.0);
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
