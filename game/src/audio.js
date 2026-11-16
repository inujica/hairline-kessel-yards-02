// Sound is synthesised, not loaded: every shot, step and beep is a short graph of oscillators and
// noise built in WebAudio. That keeps the entry to plain files with nothing to fetch, and it lets
// each weapon have its own voice rather than a shared sample.
let context = null;
let master = null;
let noiseBuffer = null;

function ensure() {
  if (context) return context;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  context = new Ctor();
  master = context.createGain();
  master.gain.value = 0.5;
  master.connect(context.destination);

  // One second of white noise, reused by every noise-based sound.
  const length = Math.floor(context.sampleRate);
  noiseBuffer = context.createBuffer(1, length, context.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1;
  return context;
}

export function resumeAudio() {
  const ctx = ensure();
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

function noise(duration, gain, filterHz, type) {
  const ctx = ensure();
  if (!ctx) return;
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer;
  const filter = ctx.createBiquadFilter();
  filter.type = type ?? 'lowpass';
  filter.frequency.value = filterHz;
  const envelope = ctx.createGain();
  const now = ctx.currentTime;
  envelope.gain.setValueAtTime(gain, now);
  envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  source.connect(filter).connect(envelope).connect(master);
  source.start(now);
  source.stop(now + duration + 0.02);
}

function tone(frequency, duration, gain, type, slideTo) {
  const ctx = ensure();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const envelope = ctx.createGain();
  const now = ctx.currentTime;
  osc.type = type ?? 'square';
  osc.frequency.setValueAtTime(frequency, now);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
  envelope.gain.setValueAtTime(gain, now);
  envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(envelope).connect(master);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

export const audio = {
  shot(weaponId, distance = 0) {
    const near = Math.max(0.15, 1 - distance / 60);
    if (weaponId === 'longline') {
      noise(0.3, 0.7 * near, 1800);
      tone(90, 0.22, 0.35 * near, 'sawtooth', 40);
    } else if (weaponId === 'breech') {
      noise(0.26, 0.8 * near, 900);
      tone(120, 0.18, 0.3 * near, 'square', 50);
    } else if (weaponId === 'vespa') {
      noise(0.09, 0.5 * near, 3200);
      tone(220, 0.06, 0.18 * near, 'square', 120);
    } else if (weaponId === 'shortline') {
      noise(0.1, 0.42 * near, 2600);
      tone(190, 0.07, 0.16 * near, 'square', 110);
    } else {
      noise(0.12, 0.55 * near, 2800);
      tone(170, 0.09, 0.2 * near, 'square', 90);
    }
  },
  dryFire() { tone(1100, 0.03, 0.12, 'square', 700); },
  reload() {
    noise(0.05, 0.3, 1400);
    setTimeout(() => noise(0.06, 0.34, 1000), 130);
    setTimeout(() => tone(320, 0.05, 0.14, 'square', 240), 300);
  },
  hit(headshot) {
    if (headshot) {
      tone(1500, 0.06, 0.22, 'sine', 900);
      noise(0.06, 0.4, 5000, 'highpass');
    } else {
      tone(760, 0.05, 0.16, 'sine', 480);
    }
  },
  step(volume) {
    noise(0.07, 0.16 * volume + 0.03, 620);
  },
  land() {
    noise(0.12, 0.28, 320);
  },
  beep(high) {
    tone(high ? 1600 : 1050, 0.07, 0.16, 'square');
  },
  explosion() {
    noise(0.7, 0.9, 420);
    tone(70, 0.6, 0.5, 'sawtooth', 24);
  },
  roundStart() {
    tone(440, 0.12, 0.14, 'triangle', 660);
    setTimeout(() => tone(660, 0.16, 0.12, 'triangle', 880), 130);
  },
  roundEnd(win) {
    if (win) {
      tone(523, 0.14, 0.16, 'triangle');
      setTimeout(() => tone(784, 0.22, 0.16, 'triangle'), 140);
    } else {
      tone(300, 0.18, 0.16, 'triangle', 200);
      setTimeout(() => tone(200, 0.26, 0.14, 'triangle', 140), 160);
    }
  },
  buy() { tone(880, 0.06, 0.14, 'sine', 1180); },
  swap() { noise(0.04, 0.22, 1800); },
};
