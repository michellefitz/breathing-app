// main.js — orchestrates BreathingClock, KaleidoscopeRenderer, GUI, and the render loop.

// ── Canvas & renderer ────────────────────────────────────────────────────────

const canvas   = document.getElementById('canvas');
const renderer = new KaleidoscopeRenderer(canvas);

// Match body background to renderer default
document.body.style.background = renderer.bgColor;

// ── Stats ────────────────────────────────────────────────────────────────────

const stats = new Stats();
stats.dom.style.cssText = 'position:fixed;top:0;left:0;cursor:pointer;opacity:0.9;z-index:10000';
document.body.appendChild(stats.dom);

// ── Breathing clock ──────────────────────────────────────────────────────────

const breathClock = new BreathingClock({ inhale: 4, holdFull: 4, exhale: 4, holdEmpty: 2 });

const phaseTextMap = {
  inhale:    'breathe in',
  holdFull:  'hold',
  exhale:    'breathe out',
  holdEmpty: '',
};

breathClock.onPhaseChange = (phase) => {
  const el = document.getElementById('phase-label');
  if (el) {
    el.style.opacity = '0';
    setTimeout(() => {
      el.textContent = phaseTextMap[phase] || '';
      el.style.opacity = '';
    }, 300);
  }
  renderer.onPhaseChange(phase);
};

let prevTotalTime = 0;

breathClock.onProgress = (phase, t, totalTime) => {
  const dt = Math.min(totalTime - prevTotalTime, 0.1);
  prevTotalTime = totalTime;

  renderer.update(phase, t, dt);
  stats.update();
};

// ── GUI params object ────────────────────────────────────────────────────────

const params = {
  // Breathing
  inhale:    4,
  holdFull:  4,
  exhale:    4,
  holdEmpty: 2,

  // Kaleidoscope
  segments:  8,
  style:     'mandala',
  scale:     0.88,

  // Lines & glow
  lineWidth:   1.0,
  glowAmount:  1.0,
  colorSpread: 1.0,

  // Colour
  hue:        280,
  colorShift: 20,
  saturation: 1.0,
  brightness: 1.0,

  // Motion
  rotationSpeed:   0.08,
  complexity:      1.0,
  holdSpeed:       0.15,
  reverseOnExhale: true,

  // Easing
  inhaleEase: 'easeInOutSine',
  exhaleEase: 'easeInOutSine',

  // Appearance
  bgColor:          '#04020a',
  vignetteStrength: 0.75,
  centerGlow:       true,
  showStats:        true,

  // Export
  screenshot: () => takeScreenshot(),
};

const EASING_NAMES = Object.keys(EASINGS);

// ── Build GUI ────────────────────────────────────────────────────────────────

const gui = new lil.GUI({ title: 'Kaleidoscope Playground', width: 290 });
gui.domElement.style.cssText = 'position:fixed;top:16px;right:16px;';

// ── Breathing ──────────────────────────────────────────────────────────────
const breathFolder = gui.addFolder('BREATHING');
breathFolder.add(params, 'inhale', 1, 12, 0.5).name('Inhale (s)').onChange(v => {
  breathClock.setDurations({ inhale: v });
});
breathFolder.add(params, 'holdFull', 0, 12, 0.5).name('Hold full (s)').onChange(v => {
  breathClock.setDurations({ holdFull: v });
});
breathFolder.add(params, 'exhale', 1, 12, 0.5).name('Exhale (s)').onChange(v => {
  breathClock.setDurations({ exhale: v });
});
breathFolder.add(params, 'holdEmpty', 0, 8, 0.5).name('Hold empty (s)').onChange(v => {
  breathClock.setDurations({ holdEmpty: v });
});

// ── Kaleidoscope ──────────────────────────────────────────────────────────
const kFolder = gui.addFolder('KALEIDOSCOPE');
kFolder.add(params, 'segments', 2, 24, 2).name('Segments').onChange(v => {
  renderer.segments = v;
});
kFolder.add(params, 'style', [
  'mandala', 'neon', 'lotus', 'sacred', 'prism',
  'spiral', 'web', 'crystal', 'ribbons', 'starburst', 'lace', 'vortex', 'geo',
]).name('Style').onChange(v => {
  renderer.style = v;
});
kFolder.add(params, 'scale', 0.3, 1.2, 0.01).name('Scale').onChange(v => {
  renderer.scale = v;
});

// ── Lines & glow ──────────────────────────────────────────────────────────
const linesFolder = gui.addFolder('LINES & GLOW');
linesFolder.add(params, 'lineWidth', 0.2, 5.0, 0.05).name('Line thickness').onChange(v => {
  renderer.lineWidth = v;
});
linesFolder.add(params, 'glowAmount', 0, 4.0, 0.05).name('Glow').onChange(v => {
  renderer.glowAmount = v;
});
linesFolder.add(params, 'colorSpread', 0, 3.0, 0.05).name('Colour spread').onChange(v => {
  renderer.colorSpread = v;
});

// ── Colour ────────────────────────────────────────────────────────────────
const colFolder = gui.addFolder('COLOUR');

// Palette presets
const presetsObj = {
  Starseeds: () => applyPreset('starseeds'),
  Aurora:    () => applyPreset('aurora'),
  Fire:      () => applyPreset('fire'),
  Rainbow:   () => applyPreset('rainbow'),
  Forest:    () => applyPreset('forest'),
  Ice:       () => applyPreset('ice'),
  Galaxy:    () => applyPreset('galaxy'),
  Dreamweb:  () => applyPreset('dreamweb'),
  Gem:       () => applyPreset('gem'),
  Silk:      () => applyPreset('silk'),
  Nova:      () => applyPreset('nova'),
  Whirlpool: () => applyPreset('whirlpool'),
};
const presetsFolder = colFolder.addFolder('PRESETS');
Object.keys(presetsObj).forEach(name => {
  presetsFolder.add(presetsObj, name);
});
presetsFolder.close();

colFolder.add(params, 'hue', 0, 360, 1).name('Base hue').onChange(v => {
  renderer.hue = v;
});
colFolder.add(params, 'colorShift', 0, 120, 1).name('Colour shift (°/s)').onChange(v => {
  renderer.colorShift = v;
});
colFolder.add(params, 'saturation', 0, 1.5, 0.01).name('Saturation').onChange(v => {
  renderer.saturation = v;
});
colFolder.add(params, 'brightness', 0.5, 1.5, 0.01).name('Brightness').onChange(v => {
  renderer.brightness = v;
});

// ── Animation ─────────────────────────────────────────────────────────────
const animFolder = gui.addFolder('ANIMATION');
animFolder.add(params, 'rotationSpeed', 0, 0.8, 0.005).name('Rotation speed').onChange(v => {
  renderer.rotationSpeed = v;
});
animFolder.add(params, 'holdSpeed', 0, 1.0, 0.01).name('Hold speed (0=stop, 1=full)').onChange(v => {
  renderer.holdSpeed = v;
});
animFolder.add(params, 'complexity', 0, 2, 0.05).name('Complexity').onChange(v => {
  renderer.complexity = v;
});


const easingFolder = animFolder.addFolder('EASING');
easingFolder.add(params, 'inhaleEase', EASING_NAMES).name('Inhale ease').onChange(v => {
  renderer.inhaleEase = v;
});
easingFolder.add(params, 'exhaleEase', EASING_NAMES).name('Exhale ease').onChange(v => {
  renderer.exhaleEase = v;
});
easingFolder.close();
animFolder.close();

// ── Appearance ────────────────────────────────────────────────────────────
const appFolder = gui.addFolder('APPEARANCE');
appFolder.addColor(params, 'bgColor').name('Background').onChange(v => {
  renderer.bgColor = v;
  document.body.style.background = v;
});
appFolder.add(params, 'vignetteStrength', 0, 1, 0.01).name('Vignette').onChange(v => {
  renderer.vignetteStrength = v;
});
appFolder.add(params, 'centerGlow').name('Centre glow').onChange(v => {
  renderer.centerGlow = v;
});
appFolder.add(params, 'showStats').name('Show FPS').onChange(v => {
  stats.dom.style.display = v ? 'block' : 'none';
});
appFolder.close();

// ── Export ────────────────────────────────────────────────────────────────
const exportFolder = gui.addFolder('EXPORT');
exportFolder.add(params, 'screenshot').name('Screenshot (PNG)');
exportFolder.close();

// ── My Presets ────────────────────────────────────────────────────────────

const STORAGE_KEY = 'kaleido-custom-presets';

function loadSavedPresets() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}

function persistPresets(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function currentSnapshot(name) {
  return {
    name,
    hue:         params.hue,
    colorShift:  params.colorShift,
    saturation:  params.saturation,
    brightness:  params.brightness,
    bgColor:     params.bgColor,
    style:       params.style,
    lineWidth:   params.lineWidth,
    glowAmount:  params.glowAmount,
    colorSpread: params.colorSpread,
  };
}

function applyCustomPreset(p) {
  Object.assign(params, p);
  renderer.hue         = p.hue;
  renderer.colorShift  = p.colorShift;
  renderer.saturation  = p.saturation;
  renderer.brightness  = p.brightness;
  renderer.bgColor     = p.bgColor;
  renderer.style       = p.style;
  renderer.lineWidth   = p.lineWidth;
  renderer.glowAmount  = p.glowAmount;
  renderer.colorSpread = p.colorSpread;
  document.body.style.background = p.bgColor;
  gui.controllersRecursive().forEach(c => c.updateDisplay());
}

// Builds / rebuilds the saved-preset button list inside the folder
let myPresetsFolder = null;

function rebuildMyPresetsFolder() {
  if (myPresetsFolder) myPresetsFolder.destroy();

  myPresetsFolder = gui.addFolder('MY PRESETS');

  const savedPresets = loadSavedPresets();

  // Name input + save button
  const saveParams = { presetName: '' };
  myPresetsFolder.add(saveParams, 'presetName').name('Name');
  myPresetsFolder.add({
    save: () => {
      const name = saveParams.presetName.trim();
      if (!name) { alert('Enter a preset name first.'); return; }
      const list = loadSavedPresets();
      // Replace if name already exists
      const idx = list.findIndex(p => p.name === name);
      if (idx >= 0) list[idx] = currentSnapshot(name);
      else list.push(currentSnapshot(name));
      persistPresets(list);
      saveParams.presetName = '';
      rebuildMyPresetsFolder();
    }
  }, 'save').name('💾  Save current settings');

  if (savedPresets.length > 0) {
    myPresetsFolder.add({ exportSwift }, 'exportSwift').name('⬇  Export all as Swift');

    const listFolder = myPresetsFolder.addFolder(`SAVED  (${savedPresets.length})`);
    savedPresets.forEach(p => {
      const row = { apply: () => applyCustomPreset(p), delete: () => deletePreset(p.name) };
      listFolder.add(row, 'apply').name(`▶  ${p.name}`);
      listFolder.add(row, 'delete').name(`✕  ${p.name}`);
    });
    listFolder.open();
  }

  myPresetsFolder.open();
}

function deletePreset(name) {
  const list = loadSavedPresets().filter(p => p.name !== name);
  persistPresets(list);
  rebuildMyPresetsFolder();
}

function exportSwift() {
  const list = loadSavedPresets();
  if (!list.length) { alert('No saved presets to export.'); return; }

  const lines = list.map(p =>
    `    KaleidoscopePreset(name: "${p.name}", hue: ${p.hue}, colorShift: ${p.colorShift}, ` +
    `saturation: ${p.saturation}, brightness: ${p.brightness}, bgColor: "${p.bgColor}", ` +
    `style: "${p.style}", lineWidth: ${p.lineWidth}, glowAmount: ${p.glowAmount}, colorSpread: ${p.colorSpread}),`
  );

  const swift =
`// ── Custom presets — paste into PresetDefinitions.swift ALL_PRESETS array ──
${lines.join('\n')}`;

  const blob = new Blob([swift], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'custom-presets.swift';
  a.click();
}

rebuildMyPresetsFolder();

// ── Palette presets ──────────────────────────────────────────────────────────

const PRESETS = {
  // Deep violet + pink — matches the reference image
  starseeds: { hue: 280, colorShift: 20,  saturation: 1.0,  brightness: 1.0,  bgColor: '#04020a', style: 'mandala', lineWidth: 1.0,  glowAmount: 1.2, colorSpread: 1.2 },
  // Electric cyan + magenta
  aurora:    { hue: 195, colorShift: 25,  saturation: 1.05, brightness: 1.0,  bgColor: '#020a0a', style: 'mandala', lineWidth: 1.0,  glowAmount: 1.0, colorSpread: 1.0 },
  // Fire — deep red to gold
  fire:      { hue: 8,   colorShift: 10,  saturation: 1.1,  brightness: 1.0,  bgColor: '#0a0200', style: 'neon',    lineWidth: 1.5,  glowAmount: 1.8, colorSpread: 0.8 },
  // Rainbow — full spectrum spin
  rainbow:   { hue: 0,   colorShift: 60,  saturation: 1.0,  brightness: 1.0,  bgColor: '#03030a', style: 'prism',   lineWidth: 0.8,  glowAmount: 0.8, colorSpread: 2.5 },
  // Emerald green + teal
  forest:    { hue: 140, colorShift: 15,  saturation: 0.95, brightness: 0.95, bgColor: '#010a03', style: 'lotus',   lineWidth: 1.0,  glowAmount: 1.0, colorSpread: 0.9 },
  // Soft blue-white — ice/crystal
  ice:       { hue: 210, colorShift: 8,   saturation: 0.75, brightness: 1.1,  bgColor: '#020408', style: 'sacred',  lineWidth: 0.7,  glowAmount: 0.6, colorSpread: 0.5 },
  // Deep indigo spiral arms — galaxy
  galaxy:    { hue: 245, colorShift: 12,  saturation: 1.0,  brightness: 1.0,  bgColor: '#01010a', style: 'spiral',  lineWidth: 1.2,  glowAmount: 1.4, colorSpread: 1.5 },
  // Teal dreamcatcher web
  dreamweb:  { hue: 175, colorShift: 10,  saturation: 0.85, brightness: 1.05, bgColor: '#010a08', style: 'web',     lineWidth: 0.8,  glowAmount: 0.8, colorSpread: 0.8 },
  // Sapphire-gold cut gem
  gem:       { hue: 220, colorShift: 5,   saturation: 1.1,  brightness: 1.1,  bgColor: '#010208', style: 'crystal', lineWidth: 1.0,  glowAmount: 1.0, colorSpread: 1.8 },
  // Rose-gold silk ribbons
  silk:      { hue: 340, colorShift: 18,  saturation: 0.9,  brightness: 1.05, bgColor: '#0a0104', style: 'ribbons', lineWidth: 1.4,  glowAmount: 1.2, colorSpread: 1.0 },
  // Electric white starburst
  nova:      { hue: 55,  colorShift: 30,  saturation: 1.1,  brightness: 1.1,  bgColor: '#08080a', style: 'starburst', lineWidth: 0.9, glowAmount: 1.6, colorSpread: 2.0 },
  // Cyan-purple vortex whirlpool
  whirlpool: { hue: 190, colorShift: 22,  saturation: 1.0,  brightness: 1.0,  bgColor: '#010508', style: 'vortex',  lineWidth: 1.3,  glowAmount: 1.5, colorSpread: 1.3 },
};

function applyPreset(name) {
  const p = PRESETS[name];
  if (!p) return;

  Object.assign(params, p);
  renderer.hue         = p.hue;
  renderer.colorShift  = p.colorShift;
  renderer.saturation  = p.saturation;
  renderer.brightness  = p.brightness;
  renderer.bgColor     = p.bgColor;
  renderer.style       = p.style;
  renderer.lineWidth   = p.lineWidth;
  renderer.glowAmount  = p.glowAmount;
  renderer.colorSpread = p.colorSpread;
  document.body.style.background = p.bgColor;

  // Refresh all GUI controllers to reflect the new values
  gui.controllersRecursive().forEach(c => c.updateDisplay());
}

// ── Render loop ──────────────────────────────────────────────────────────────

function animate() {
  requestAnimationFrame(animate);
  breathClock.tick();
}

animate();
breathClock.start();

// ── Window resize ────────────────────────────────────────────────────────────

window.addEventListener('resize', () => {
  renderer.resize();
});

// ── Screenshot ───────────────────────────────────────────────────────────────

function takeScreenshot() {
  const a      = document.createElement('a');
  a.href       = canvas.toDataURL('image/png');
  a.download   = `kaleidoscope-${Date.now()}.png`;
  a.click();
}
