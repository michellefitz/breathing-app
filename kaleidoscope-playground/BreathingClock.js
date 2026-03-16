// BreathingClock — drives the 4-phase breath cycle.
// Completely decoupled from visuals: emits phase events and 0..1 progress.
//
// Callbacks:
//   onPhaseChange(phase, totalTime)   — fires when phase transitions
//   onProgress(phase, t, totalTime)   — fires every tick with t in [0,1]

class BreathingClock {
  constructor({ inhale = 4, holdFull = 4, exhale = 4, holdEmpty = 2 } = {}) {
    this.durations = { inhale, holdFull, exhale, holdEmpty };
    this.phases    = ['inhale', 'holdFull', 'exhale', 'holdEmpty'];
    this.phaseIndex = 0;
    this.elapsed    = 0;
    this.totalTime  = 0;
    this.lastTimestamp = null;
    this.running    = false;

    this.onPhaseChange = null;
    this.onProgress    = null;
  }

  get currentPhase()    { return this.phases[this.phaseIndex]; }
  get currentDuration() { return this.durations[this.currentPhase]; }

  start() {
    this.running       = true;
    this.lastTimestamp = performance.now();
    if (this.onPhaseChange) this.onPhaseChange(this.currentPhase, 0);
    if (this.onProgress)    this.onProgress(this.currentPhase, 0, 0);
  }

  pause() {
    this.running = false;
  }

  resume() {
    this.running       = true;
    this.lastTimestamp = performance.now();
  }

  setDurations({ inhale, holdFull, exhale, holdEmpty }) {
    if (inhale    !== undefined) this.durations.inhale    = inhale;
    if (holdFull  !== undefined) this.durations.holdFull  = holdFull;
    if (exhale    !== undefined) this.durations.exhale    = exhale;
    if (holdEmpty !== undefined) this.durations.holdEmpty = holdEmpty;
  }

  // Call once per animation frame.
  tick() {
    if (!this.running) return;

    const now = performance.now();
    const dt  = Math.min((now - this.lastTimestamp) / 1000, 0.1); // cap at 100ms
    this.lastTimestamp = now;
    this.elapsed   += dt;
    this.totalTime += dt;

    // Advance through phases (while loop handles the rare case of a very large dt)
    while (this.elapsed >= this.currentDuration) {
      this.elapsed -= this.currentDuration;
      this.phaseIndex = (this.phaseIndex + 1) % this.phases.length;
      if (this.onPhaseChange) {
        this.onPhaseChange(this.currentPhase, this.totalTime);
      }
    }

    const t = Math.min(this.elapsed / this.currentDuration, 1);
    if (this.onProgress) {
      this.onProgress(this.currentPhase, t, this.totalTime);
    }
  }

  // Reset to first phase
  reset() {
    this.phaseIndex = 0;
    this.elapsed    = 0;
    this.totalTime  = 0;
  }
}
